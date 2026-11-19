//! Demo booking (owner's brief, 18 Nov 2026, P8-M8).
//!
//! - Each website sets when it takes demos (Studio → Leads & Enquiries →
//!   Demo availability): weekly hours in its own time zone (Africa/Nairobi by
//!   default), slot length, a buffer between demos, minimum notice, how far
//!   ahead, an optional daily limit and closed dates. Off until set up.
//! - Visitors see only slots that are still free, worked out in PostgreSQL
//!   from those rules (so daylight saving in other zones is handled there).
//! - A booking is an enquiry (`demo_request`) with a slot, created in one
//!   transaction: a per-website lock, the slot checked again against the
//!   rules and every live booking (overlaps, buffer, daily limit), then the
//!   booking. Two visitors can't take the same slot; the loser gets
//!   `slot_taken` and fresh slots. A unique index backs this up.
//! - The team confirms, reschedules, cancels and records the outcome
//!   (completed or no-show). Calendar sync and meeting links need an
//!   integration, which isn't configured, so none is implied.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    admin::{
        AdminSession, Role, audit,
        time_zone::{DEFAULT_TIME_ZONE, TIME_ZONES},
    },
    error::{ApiError, FieldError},
    routes::SharedState,
};

pub const SLOT_LENGTHS: [u16; 5] = [15, 20, 30, 45, 60];
const BOOKING_STATUSES: [&str; 5] = ["pending", "confirmed", "completed", "cancelled", "no_show"];

/// A weekly window: ISO weekday (1 = Monday … 7 = Sunday), local "HH:MM".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Window {
    pub day: u8,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Availability {
    pub enabled: bool,
    pub time_zone: String,
    pub slot_minutes: u16,
    pub buffer_minutes: u16,
    /// Earliest booking from now.
    pub notice_hours: u16,
    /// Latest day offered, counted from today.
    pub days_ahead: u16,
    /// Most demos on one day (live bookings), if limited.
    pub daily_limit: Option<u16>,
    pub hours: Vec<Window>,
    pub closed_dates: Vec<NaiveDate>,
    /// Shown beside the slots, e.g. how the meeting happens.
    pub note: Option<String>,
}

impl Default for Availability {
    fn default() -> Self {
        let window = |day, start: &str, end: &str| Window {
            day,
            start: start.into(),
            end: end.into(),
        };
        Self {
            enabled: false,
            time_zone: DEFAULT_TIME_ZONE.into(),
            slot_minutes: 30,
            buffer_minutes: 15,
            notice_hours: 4,
            days_ahead: 21,
            daily_limit: None,
            hours: (1..=5)
                .flat_map(|d| [window(d, "09:00", "12:00"), window(d, "14:00", "17:00")])
                .collect(),
            closed_dates: Vec::new(),
            note: None,
        }
    }
}

/// "HH:MM" (00:00–24:00) as minutes from midnight.
fn minutes(clock: &str) -> Option<u16> {
    let (h, m) = clock.split_once(':')?;
    if h.len() != 2 || m.len() != 2 {
        return None;
    }
    let (h, m): (u16, u16) = (h.parse().ok()?, m.parse().ok()?);
    let total = h * 60 + m;
    (m < 60 && total <= 24 * 60).then_some(total)
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

impl Availability {
    pub fn from_stored(value: Value) -> Self {
        serde_json::from_value(value).unwrap_or_default()
    }

    /// Checked and tidied; every rule the Studio shows is enforced here.
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut errors = Vec::new();
        if !TIME_ZONES.contains(&self.time_zone.as_str()) {
            errors.push(field("time_zone", "invalid", "Choose a time zone from the list."));
        }
        if !SLOT_LENGTHS.contains(&self.slot_minutes) {
            errors.push(field(
                "slot_minutes",
                "invalid",
                "Choose a demo length from the list.",
            ));
        }
        if self.buffer_minutes > 60 {
            errors.push(field(
                "buffer_minutes",
                "range",
                "The buffer is at most 60 minutes.",
            ));
        }
        if self.notice_hours > 168 {
            errors.push(field(
                "notice_hours",
                "range",
                "Notice is at most 168 hours (a week).",
            ));
        }
        if !(1..=60).contains(&self.days_ahead) {
            errors.push(field("days_ahead", "range", "Offer between 1 and 60 days ahead."));
        }
        if self.daily_limit.is_some_and(|l| !(1..=40).contains(&l)) {
            errors.push(field(
                "daily_limit",
                "range",
                "A daily limit is between 1 and 40 demos.",
            ));
        }
        if self.hours.len() > 28 {
            errors.push(field("hours", "too_many", "Up to 28 weekly windows."));
        }
        let mut spans: Vec<(u8, u16, u16)> = Vec::new();
        for w in &mut self.hours {
            w.start = w.start.trim().to_owned();
            w.end = w.end.trim().to_owned();
            match (minutes(&w.start), minutes(&w.end)) {
                (Some(s), Some(e)) if (1..=7).contains(&w.day) && s < e => spans.push((w.day, s, e)),
                _ => {
                    errors.push(field(
                        "hours",
                        "invalid",
                        "Each window needs a weekday and a start before its end (HH:MM).",
                    ));
                    break;
                }
            }
        }
        spans.sort_unstable();
        if spans.windows(2).any(|p| p[0].0 == p[1].0 && p[1].1 < p[0].2) {
            errors.push(field(
                "hours",
                "overlap",
                "Windows on the same day can't overlap.",
            ));
        }
        if spans.iter().any(|&(_, s, e)| e - s < self.slot_minutes) {
            errors.push(field("hours", "short", "Each window must fit at least one demo."));
        }
        if self.enabled && self.hours.is_empty() {
            errors.push(field(
                "hours",
                "required",
                "Add at least one weekly window before turning booking on.",
            ));
        }
        self.hours.sort_by_key(|w| (w.day, minutes(&w.start)));
        self.closed_dates.sort_unstable();
        self.closed_dates.dedup();
        if self.closed_dates.len() > 120 {
            errors.push(field("closed_dates", "too_many", "Up to 120 closed dates."));
        }
        self.note = self
            .note
            .take()
            .map(|n| n.trim().to_owned())
            .filter(|n| !n.is_empty());
        if self.note.as_ref().is_some_and(|n| n.chars().count() > 200) {
            errors.push(field("note", "too_long", "The note is at most 200 characters."));
        }
        if errors.is_empty() { Ok(self) } else { Err(errors) }
    }

    /// The windows as minutes, the shape the slot query reads.
    fn windows_json(&self) -> Value {
        Value::Array(
            self.hours
                .iter()
                .filter_map(|w| {
                    Some(json!({ "day": w.day, "start": minutes(&w.start)?, "end": minutes(&w.end)? }))
                })
                .collect(),
        )
    }
}

/// Free slots from the rules, minus live bookings (with the buffer either
/// side), before the notice period, on closed dates or full days. `only`
/// checks one start; `except` leaves one booking out (rescheduling it).
const SLOTS_SQL: &str = "
WITH days AS (
    SELECT d::date AS day
      FROM generate_series((now() AT TIME ZONE $2)::date,
                           (now() AT TIME ZONE $2)::date + $8::int, interval '1 day') AS d
     WHERE NOT (d::date = ANY($4::date[]))
),
candidates AS (
    SELECT days.day,
           ((days.day + make_interval(mins => (w->>'start')::int + n * $6::int)) AT TIME ZONE $2) AS starts_at
      FROM days
      CROSS JOIN jsonb_array_elements($3::jsonb) AS w
      CROSS JOIN generate_series(0, 96) AS n
     WHERE (w->>'day')::int = extract(isodow FROM days.day)::int
       AND (w->>'start')::int + n * $6::int + $5::int <= (w->>'end')::int
),
live AS (
    SELECT starts_at, ends_at, (starts_at AT TIME ZONE $2)::date AS day
      FROM demo_bookings
     WHERE product = $1 AND status IN ('pending', 'confirmed')
       AND ($11::uuid IS NULL OR id <> $11)
       AND ends_at > now() - interval '1 day'
)
SELECT c.starts_at, c.day
  FROM candidates c
 WHERE c.starts_at >= now() + make_interval(hours => $7::int)
   AND ($12::timestamptz IS NULL OR c.starts_at = $12)
   AND NOT EXISTS (
        SELECT 1 FROM live l
         WHERE tstzrange(l.starts_at - make_interval(mins => $10::int), l.ends_at + make_interval(mins => $10::int))
            && tstzrange(c.starts_at, c.starts_at + make_interval(mins => $5::int)))
   AND ($9::int IS NULL OR (SELECT count(*) FROM live l WHERE l.day = c.day) < $9::int)
 ORDER BY c.starts_at";

async fn free_slots<'e, E>(
    executor: E,
    product: &str,
    a: &Availability,
    only: Option<DateTime<Utc>>,
    except: Option<Uuid>,
) -> Result<Vec<(DateTime<Utc>, NaiveDate)>, sqlx::Error>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let closed: Vec<NaiveDate> = a.closed_dates.clone();
    sqlx::query_as(SLOTS_SQL)
        .bind(product)
        .bind(&a.time_zone)
        .bind(a.windows_json())
        .bind(closed)
        .bind(i32::from(a.slot_minutes))
        .bind(i32::from(a.slot_minutes + a.buffer_minutes))
        .bind(i32::from(a.notice_hours))
        .bind(i32::from(a.days_ahead))
        .bind(a.daily_limit.map(i32::from))
        .bind(i32::from(a.buffer_minutes))
        .bind(except)
        .bind(only)
        .fetch_all(executor)
        .await
}

/// A website's availability (its defaults when never set) and whether it
/// takes enquiries at all.
async fn load<'e, E>(
    executor: E,
    product: &str,
) -> Result<Option<(Uuid, Availability, i32, bool)>, sqlx::Error>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let row: Option<(Uuid, Option<Value>, Option<i32>, bool)> = sqlx::query_as(
        "SELECT s.id, a.settings, a.version,
                COALESCE((s.settings->'enquiries'->>'open')::boolean, true) AND s.archived_at IS NULL
           FROM sites s LEFT JOIN demo_availability a ON a.site_id = s.id
          WHERE s.slug = $1",
    )
    .bind(product)
    .fetch_optional(executor)
    .await?;
    Ok(row.map(|(id, settings, version, open)| {
        (
            id,
            settings.map(Availability::from_stored).unwrap_or_default(),
            version.unwrap_or(0),
            open,
        )
    }))
}

/// A slot held for a booking inside the enquiry's transaction.
pub struct HeldSlot {
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub time_zone: String,
    /// "Thursday 20 November 2026, 09:00 (Africa/Nairobi)", for the team's email.
    pub label: String,
}

fn slot_error(code: &'static str, message: &'static str) -> ApiError {
    ApiError::Validation(vec![field("demo_slot", code, message)])
}

/// Takes the website's booking lock and checks the slot is still free. The
/// lock lasts until the transaction ends, so [`insert_booking`] in the same
/// transaction can't race another visitor.
pub async fn hold(
    tx: &mut Transaction<'_, Postgres>,
    product: &str,
    slot: &str,
) -> Result<HeldSlot, ApiError> {
    let starts_at = DateTime::parse_from_rfc3339(slot.trim())
        .map_err(|_| slot_error("invalid", "Choose a time from the list."))?
        .with_timezone(&Utc);
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('demo_bookings:' || $1))")
        .bind(product)
        .execute(&mut **tx)
        .await?;
    let Some((_, availability, _, _)) = load(&mut **tx, product).await? else {
        return Err(slot_error(
            "not_offered",
            "This website doesn't take demo bookings.",
        ));
    };
    if !availability.enabled {
        return Err(slot_error(
            "not_offered",
            "This website doesn't take demo bookings right now.",
        ));
    }
    if free_slots(&mut **tx, product, &availability, Some(starts_at), None)
        .await?
        .is_empty()
    {
        return Err(ApiError::SlotTaken);
    }
    let label: String = sqlx::query_scalar(
        "SELECT to_char($1::timestamptz AT TIME ZONE $2, 'FMDay FMDD FMMonth YYYY, HH24:MI')",
    )
    .bind(starts_at)
    .bind(&availability.time_zone)
    .fetch_one(&mut **tx)
    .await?;
    Ok(HeldSlot {
        starts_at,
        ends_at: starts_at + chrono::Duration::minutes(i64::from(availability.slot_minutes)),
        label: format!("{label} ({})", availability.time_zone),
        time_zone: availability.time_zone,
    })
}

pub async fn insert_booking(
    tx: &mut Transaction<'_, Postgres>,
    enquiry_id: Uuid,
    product: &str,
    slot: &HeldSlot,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO demo_bookings (id, enquiry_id, product, starts_at, ends_at, time_zone)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(enquiry_id)
    .bind(product)
    .bind(slot.starts_at)
    .bind(slot.ends_at)
    .bind(&slot.time_zone)
    .execute(&mut **tx)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.constraint() == Some("demo_bookings_live_slot") => {
            ApiError::SlotTaken
        }
        _ => ApiError::Database(e),
    })?;
    Ok(())
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/demo-slots", get(public_slots))
        .route(
            "/v1/admin/enquiries/availability/{slug}",
            get(read_availability).post(save_availability),
        )
        .route("/v1/admin/enquiries/bookings", get(list_bookings))
        .route("/v1/admin/enquiries/bookings/{id}/status", post(set_status))
        .route("/v1/admin/enquiries/bookings/{id}/reschedule", post(reschedule))
}

/// Grouped by the website's local date, for the visitor's calendar.
fn by_day(slots: Vec<(DateTime<Utc>, NaiveDate)>) -> Vec<Value> {
    let mut days: Vec<(NaiveDate, Vec<DateTime<Utc>>)> = Vec::new();
    for (start, day) in slots {
        match days.last_mut() {
            Some((d, list)) if *d == day => list.push(start),
            _ => days.push((day, vec![start])),
        }
    }
    days.into_iter()
        .map(|(date, slots)| json!({ "date": date, "slots": slots }))
        .collect()
}

async fn public_slots(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    if slug.len() > 40 {
        return Err(ApiError::NotFound);
    }
    let (_, availability, _, open) = load(&state.pool, &slug).await?.ok_or(ApiError::NotFound)?;
    if !availability.enabled || !open {
        return Ok(Json(json!({ "enabled": false })));
    }
    let slots = free_slots(&state.pool, &slug, &availability, None, None).await?;
    Ok(Json(json!({
        "enabled": true,
        "time_zone": availability.time_zone,
        "slot_minutes": availability.slot_minutes,
        "note": availability.note,
        "days": by_day(slots),
    })))
}

async fn site_for(pool: &PgPool, session: &AdminSession, slug: &str, role: Role) -> Result<Uuid, ApiError> {
    let id: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    session.require_site(id, role)?;
    Ok(id)
}

async fn read_availability(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let id = site_for(&state.pool, &session, &slug, Role::Viewer).await?;
    let (_, availability, version, _) = load(&state.pool, &slug).await?.ok_or(ApiError::NotFound)?;
    let preview = if availability.enabled {
        by_day(free_slots(&state.pool, &slug, &availability, None, None).await?)
    } else {
        Vec::new()
    };
    Ok(Json(json!({
        "availability": availability,
        "version": version,
        "can_edit": session.site_role(id) >= Some(Role::Reviewer),
        "time_zones": TIME_ZONES,
        "slot_lengths": SLOT_LENGTHS,
        "preview": preview,
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AvailabilityInput {
    availability: Availability,
    version: i32,
}

async fn save_availability(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<AvailabilityInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let id = site_for(&state.pool, &session, &slug, Role::Reviewer).await?;
    let next = input.availability.normalise().map_err(ApiError::Validation)?;
    let value = serde_json::to_value(&next).map_err(|e| ApiError::Internal(e.to_string()))?;
    let saved: Option<i32> = if input.version == 0 {
        sqlx::query_scalar(
            "INSERT INTO demo_availability (site_id, settings, updated_by) VALUES ($1, $2, $3)
             ON CONFLICT (site_id) DO NOTHING RETURNING version",
        )
        .bind(id)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_scalar(
            "UPDATE demo_availability SET settings = $2, version = version + 1, updated_by = $3, updated_at = now()
              WHERE site_id = $1 AND version = $4 RETURNING version",
        )
        .bind(id)
        .bind(&value)
        .bind(session.user.id)
        .bind(input.version)
        .fetch_optional(&state.pool)
        .await?
    };
    if saved.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed the availability after you opened it. Reload to see the latest.",
        ));
    }
    crate::sites::audit_site(
        &state.pool,
        &session,
        id,
        "site.demo_availability_saved",
        json!({ "after": next }),
    )
    .await?;
    read_availability(State(state), session, Path(slug)).await
}

#[derive(Deserialize)]
struct BookingFilters {
    status: Option<String>,
    product: Option<String>,
    /// upcoming (default), past or all.
    when: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct BookingRow {
    id: Uuid,
    enquiry_id: Uuid,
    reference: String,
    product: String,
    name: String,
    email: String,
    company: Option<String>,
    company_size: Option<String>,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    time_zone: String,
    status: String,
    enquiry_status: String,
    created_at: DateTime<Utc>,
}

async fn list_bookings(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(f): Query<BookingFilters>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let status = f.status.filter(|s| !s.is_empty());
    if status.as_deref().is_some_and(|s| !BOOKING_STATUSES.contains(&s)) {
        return Err(ApiError::BadRequest("unknown status"));
    }
    let when = f.when.unwrap_or_else(|| "upcoming".into());
    if !["upcoming", "past", "all"].contains(&when.as_str()) {
        return Err(ApiError::BadRequest("unknown range"));
    }
    let rows: Vec<BookingRow> = sqlx::query_as(
        "SELECT b.id, b.enquiry_id, e.reference, b.product, e.name, e.email, e.company, e.company_size,
                b.starts_at, b.ends_at, b.time_zone, b.status, e.status AS enquiry_status, b.created_at
           FROM demo_bookings b JOIN enquiries e ON e.id = b.enquiry_id
          WHERE ($1::text IS NULL OR b.status = $1)
            AND ($2::text IS NULL OR b.product = $2)
            AND ($3::text[] IS NULL OR b.product = ANY($3))
            AND ($4 = 'all' OR ($4 = 'upcoming' AND b.ends_at >= now()) OR ($4 = 'past' AND b.ends_at < now()))
          ORDER BY CASE WHEN $4 = 'past' THEN NULL ELSE b.starts_at END ASC,
                   b.starts_at DESC
          LIMIT 200",
    )
    .bind(&status)
    .bind(f.product.filter(|p| !p.is_empty()))
    .bind(session.site_slugs())
    .bind(&when)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "items": rows })))
}

/// Allowed moves; finished bookings stay as they are.
pub fn can_move(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("pending", "confirmed" | "cancelled") | ("confirmed", "completed" | "no_show" | "cancelled")
    )
}

/// The booking's website, checked against the person's access (editor and up).
async fn booking_for(
    tx: &mut Transaction<'_, Postgres>,
    session: &AdminSession,
    id: Uuid,
) -> Result<(String, String, Uuid), ApiError> {
    let row: Option<(String, String, Uuid)> =
        sqlx::query_as("SELECT product, status, enquiry_id FROM demo_bookings WHERE id = $1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?;
    let (product, status, enquiry) = row.ok_or(ApiError::NotFound)?;
    match session.slug_role(&product) {
        None => Err(ApiError::NotFound),
        Some(role) if role < Role::Editor => Err(ApiError::Forbidden),
        Some(_) => Ok((product, status, enquiry)),
    }
}

#[derive(Deserialize)]
struct StatusInput {
    status: String,
}

async fn set_status(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<StatusInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let mut tx = state.pool.begin().await?;
    let (_, from, enquiry) = booking_for(&mut tx, &session, id).await?;
    if !BOOKING_STATUSES.contains(&input.status.as_str()) {
        return Err(ApiError::BadRequest("unknown status"));
    }
    if !can_move(&from, &input.status) {
        return Err(ApiError::Conflict(
            "A booking can't move to that status from where it is.",
        ));
    }
    sqlx::query("UPDATE demo_bookings SET status = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(&input.status)
        .execute(&mut *tx)
        .await?;
    // A confirmed demo moves its enquiry on, unless it's already further along.
    if input.status == "confirmed" {
        sqlx::query(
            "UPDATE enquiries SET status = 'demo_scheduled', updated_at = now()
              WHERE id = $1 AND status IN ('new', 'contacted', 'qualified')",
        )
        .bind(enquiry)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "demo.status_changed",
        Some(("enquiry", enquiry.to_string())),
        json!({ "booking": id, "from": from, "to": input.status }),
        None,
    )
    .await?;
    Ok(Json(json!({ "status": input.status })))
}

#[derive(Deserialize)]
struct RescheduleInput {
    starts_at: String,
}

async fn reschedule(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<RescheduleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let mut tx = state.pool.begin().await?;
    let (product, status, enquiry) = booking_for(&mut tx, &session, id).await?;
    if !matches!(status.as_str(), "pending" | "confirmed") {
        return Err(ApiError::Conflict("Only upcoming bookings can be moved."));
    }
    let starts_at = DateTime::parse_from_rfc3339(input.starts_at.trim())
        .map_err(|_| slot_error("invalid", "Choose a time from the list."))?
        .with_timezone(&Utc);
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('demo_bookings:' || $1))")
        .bind(&product)
        .execute(&mut *tx)
        .await?;
    let (_, availability, _, _) = load(&mut *tx, &product).await?.ok_or(ApiError::NotFound)?;
    if free_slots(&mut *tx, &product, &availability, Some(starts_at), Some(id))
        .await?
        .is_empty()
    {
        return Err(ApiError::SlotTaken);
    }
    let previous: DateTime<Utc> = sqlx::query_scalar(
        "UPDATE demo_bookings b SET starts_at = $2, ends_at = $3, time_zone = $4, updated_at = now()
           FROM demo_bookings old WHERE b.id = $1 AND old.id = $1 RETURNING old.starts_at",
    )
    .bind(id)
    .bind(starts_at)
    .bind(starts_at + chrono::Duration::minutes(i64::from(availability.slot_minutes)))
    .bind(&availability.time_zone)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.constraint() == Some("demo_bookings_live_slot") => {
            ApiError::SlotTaken
        }
        _ => ApiError::Database(e),
    })?;
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "demo.rescheduled",
        Some(("enquiry", enquiry.to_string())),
        json!({ "booking": id, "from": previous, "to": starts_at }),
        None,
    )
    .await?;
    Ok(Json(json!({ "starts_at": starts_at })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn availability_rules_are_checked() {
        assert!(Availability::default().normalise().is_ok());
        let bad = Availability {
            enabled: true,
            time_zone: "Mars/Olympus".into(),
            slot_minutes: 25,
            buffer_minutes: 90,
            days_ahead: 0,
            daily_limit: Some(0),
            hours: vec![
                Window {
                    day: 1,
                    start: "09:00".into(),
                    end: "11:00".into(),
                },
                Window {
                    day: 1,
                    start: "10:30".into(),
                    end: "12:00".into(),
                },
            ],
            ..Availability::default()
        };
        let fields: Vec<_> = bad.normalise().unwrap_err().iter().map(|e| e.field).collect();
        for f in [
            "time_zone",
            "slot_minutes",
            "buffer_minutes",
            "days_ahead",
            "daily_limit",
            "hours",
        ] {
            assert!(fields.contains(&f), "{f} in {fields:?}");
        }
        let empty = Availability {
            enabled: true,
            hours: vec![],
            ..Availability::default()
        };
        assert!(empty.normalise().is_err());
        let backwards = Availability {
            hours: vec![Window {
                day: 8,
                start: "12:00".into(),
                end: "09:00".into(),
            }],
            ..Availability::default()
        };
        assert!(backwards.normalise().is_err());
    }

    #[test]
    fn clock_times_parse_to_minutes() {
        assert_eq!(minutes("09:30"), Some(570));
        assert_eq!(minutes("24:00"), Some(1440));
        assert_eq!(minutes("24:01"), None);
        assert_eq!(minutes("9:30"), None);
        assert_eq!(minutes("09:60"), None);
    }

    #[test]
    fn bookings_move_forward_only() {
        assert!(can_move("pending", "confirmed"));
        assert!(can_move("confirmed", "no_show"));
        assert!(!can_move("completed", "pending"));
        assert!(!can_move("cancelled", "confirmed"));
        assert!(!can_move("pending", "completed"));
    }
}
