//! Enquiries inbox (admin): review and follow up website enquiries.
//!
//! - Viewers and up read the inbox; editors and up change an enquiry's status
//!   (new → contacted → qualified → demo scheduled → converted or closed,
//!   or spam), assign it to a teammate and add notes (P8-M8).
//! - CSV export is owner-only (personal data, Kenya Data Protection Act 2019)
//!   and every export is audited with its row count.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use super::{AdminSession, Role, audit};
use crate::{error::ApiError, routes::SharedState};

const PER_PAGE: i64 = 50;
const STATUSES: [&str; 7] = [
    "new",
    "contacted",
    "qualified",
    "demo_scheduled",
    "converted",
    "closed",
    "spam",
];
const KINDS: [&str; 8] = [
    "demo_request",
    "contact",
    "early_access",
    "waitlist",
    "partnership",
    "sales",
    "referral",
    "workspace_request",
];
const PRODUCTS: [&str; 5] = ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"];
const EXPORT_LIMIT: i64 = 10_000;

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/enquiries", get(list))
        .route("/v1/admin/enquiries/export", get(export))
        .route("/v1/admin/enquiries/overview", get(overview))
        .route("/v1/admin/enquiries/assignees", get(assignees))
        .route("/v1/admin/enquiries/{id}", get(read))
        .route("/v1/admin/enquiries/{id}/status", post(set_status))
        .route("/v1/admin/enquiries/{id}/assignee", post(set_assignee))
        .route("/v1/admin/enquiries/{id}/notes", post(add_note))
}

#[derive(Debug, Deserialize, Default)]
pub struct Filters {
    status: Option<String>,
    kind: Option<String>,
    product: Option<String>,
    q: Option<String>,
    /// Automated (spam-flagged) submissions are hidden unless asked for.
    #[serde(default)]
    include_spam: bool,
    page: Option<i64>,
}

struct Valid {
    status: Option<String>,
    kind: Option<String>,
    product: Option<String>,
    q: Option<String>,
    include_spam: bool,
}

fn one_of(value: Option<&str>, allowed: &[&str]) -> Result<Option<String>, ApiError> {
    match value.map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(v) if allowed.contains(&v) => Ok(Some(v.to_owned())),
        Some(_) => Err(ApiError::BadRequest("unknown filter value")),
    }
}

fn validate(filters: &Filters) -> Result<Valid, ApiError> {
    let q = filters
        .q
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(|q| {
            format!(
                "%{}%",
                q.chars()
                    .take(100)
                    .collect::<String>()
                    .replace(['%', '_', '\\'], "")
            )
        });
    Ok(Valid {
        status: one_of(filters.status.as_deref(), &STATUSES)?,
        kind: one_of(filters.kind.as_deref(), &KINDS)?,
        product: one_of(filters.product.as_deref(), &PRODUCTS)?,
        q,
        include_spam: filters.include_spam || filters.status.as_deref() == Some("spam"),
    })
}

#[derive(Debug, Serialize, FromRow)]
struct Row {
    id: Uuid,
    reference: String,
    kind: String,
    product: String,
    name: String,
    email: String,
    company: Option<String>,
    status: String,
    is_spam: bool,
    created_at: DateTime<Utc>,
    assignee: Option<String>,
    demo_at: Option<DateTime<Utc>>,
    total: i64,
}

/// Shared filter clause; `$1..$5` are status, kind, product, search, include_spam.
macro_rules! filtered {
    ($select:literal, $tail:literal) => {
        concat!(
            $select,
            " FROM enquiries e
             WHERE ($1::text IS NULL OR e.status = $1)
               AND ($2::text IS NULL OR e.kind = $2)
               AND ($3::text IS NULL OR e.product = $3)
               AND ($4::text IS NULL OR e.name ILIKE $4 OR e.email ILIKE $4 OR e.company ILIKE $4 OR e.reference ILIKE $4)
               AND ($5 OR NOT e.is_spam) ",
            $tail
        )
    };
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(filters): Query<Filters>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let f = validate(&filters)?;
    let page = filters.page.unwrap_or(1).clamp(1, 1000);
    let rows: Vec<Row> = sqlx::query_as(filtered!(
        "SELECT e.id, e.reference, e.kind, e.product, e.name, e.email, e.company, e.status, e.is_spam, e.created_at,
                (SELECT u.name FROM admin_users u WHERE u.id = e.assigned_to) AS assignee,
                (SELECT b.starts_at FROM demo_bookings b WHERE b.enquiry_id = e.id
                    AND b.status IN ('pending', 'confirmed')) AS demo_at,
                COUNT(*) OVER () AS total",
        // People limited to selected websites see those websites' enquiries (P7-F1).
        "AND ($8::text[] IS NULL OR e.product = ANY($8)) ORDER BY e.created_at DESC, e.id LIMIT $6 OFFSET $7"
    ))
    .bind(&f.status)
    .bind(&f.kind)
    .bind(&f.product)
    .bind(&f.q)
    .bind(f.include_spam)
    .bind(PER_PAGE)
    .bind((page - 1) * PER_PAGE)
    .bind(session.site_slugs())
    .fetch_all(&state.pool)
    .await?;
    let total = rows.first().map_or(0, |r| r.total);
    Ok(Json(json!({
        "items": rows,
        "page": page,
        "per_page": PER_PAGE,
        "total": total,
        "total_pages": (total + PER_PAGE - 1) / PER_PAGE,
    })))
}

#[derive(Debug, Serialize, FromRow)]
struct Detail {
    id: Uuid,
    reference: String,
    kind: String,
    product: String,
    name: String,
    email: String,
    company: Option<String>,
    job_title: Option<String>,
    phone: Option<String>,
    phone_secondary: Option<String>,
    country: Option<String>,
    company_size: Option<String>,
    message: Option<String>,
    locale: String,
    source_path: Option<String>,
    status: String,
    is_spam: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    assigned_to: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
struct Booking {
    id: Uuid,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    time_zone: String,
    status: String,
}

#[derive(Debug, Serialize, FromRow)]
struct EmailState {
    template: String,
    status: String,
    attempts: i32,
    sent_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct HistoryEntry {
    action: String,
    actor_email: Option<String>,
    detail: serde_json::Value,
    created_at: DateTime<Utc>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let detail: Detail = sqlx::query_as(
        "SELECT id, reference, kind, product, name, email, company, job_title, phone, phone_secondary, country, company_size, message,
                locale, source_path, status, is_spam, created_at, updated_at, assigned_to
           FROM enquiries WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if !session.sees_slug(&detail.product) {
        return Err(ApiError::NotFound);
    }
    let emails: Vec<EmailState> = sqlx::query_as(
        "SELECT template, status, attempts, sent_at, last_error FROM email_outbox
          WHERE enquiry_id = $1 ORDER BY created_at, template",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let history: Vec<HistoryEntry> = sqlx::query_as(
        "SELECT a.action, u.email AS actor_email, a.detail, a.created_at
           FROM audit_log a LEFT JOIN admin_users u ON u.id = a.actor_user_id
          WHERE a.target_type = 'enquiry' AND a.target_id = $1
          ORDER BY a.created_at DESC LIMIT 50",
    )
    .bind(id.to_string())
    .fetch_all(&state.pool)
    .await?;
    let booking: Option<Booking> = sqlx::query_as(
        "SELECT id, starts_at, ends_at, time_zone, status FROM demo_bookings WHERE enquiry_id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let can_edit = session.slug_role(&detail.product) >= Some(Role::Editor);
    Ok(Json(json!({
        "enquiry": detail,
        "emails": emails,
        "history": history,
        "booking": booking,
        "can_edit": can_edit,
    })))
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
    let status = one_of(Some(&input.status), &STATUSES)?.ok_or(ApiError::BadRequest("status is required"))?;
    let product: Option<String> = sqlx::query_scalar("SELECT product FROM enquiries WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    match product.and_then(|p| session.slug_role(&p)) {
        None => return Err(ApiError::NotFound),
        Some(role) if role < Role::Editor => return Err(ApiError::Forbidden),
        Some(_) => {}
    }
    let previous: Option<String> = sqlx::query_scalar(
        "WITH old AS (SELECT status FROM enquiries WHERE id = $1 FOR UPDATE)
         UPDATE enquiries e SET status = $2, is_spam = ($2 = 'spam'), updated_at = now()
           FROM old WHERE e.id = $1
      RETURNING old.status",
    )
    .bind(id)
    .bind(&status)
    .fetch_optional(&state.pool)
    .await?;
    let previous = previous.ok_or(ApiError::NotFound)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "enquiry.status_changed",
        Some(("enquiry", id.to_string())),
        json!({ "from": previous, "to": status }),
        None,
    )
    .await?;
    Ok(Json(json!({ "status": status })))
}

/// The enquiry's website, checked for an editor or above.
async fn editable(pool: &sqlx::PgPool, session: &AdminSession, id: Uuid) -> Result<String, ApiError> {
    session.require(Role::Editor)?;
    let product: Option<String> = sqlx::query_scalar("SELECT product FROM enquiries WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    match product.as_deref().and_then(|p| session.slug_role(p)) {
        None => Err(ApiError::NotFound),
        Some(role) if role < Role::Editor => Err(ApiError::Forbidden),
        Some(_) => Ok(product.unwrap_or_default()),
    }
}

/// People who can follow enquiries up: active editors and above.
async fn assignees(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let people: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, name FROM admin_users
          WHERE disabled_at IS NULL AND role IN ('owner', 'reviewer', 'editor') ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({
        "items": people.into_iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
struct AssigneeInput {
    user_id: Option<Uuid>,
}

async fn set_assignee(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<AssigneeInput>,
) -> Result<impl IntoResponse, ApiError> {
    editable(&state.pool, &session, id).await?;
    let name: Option<String> = match input.user_id {
        None => None,
        Some(user) => Some(
            sqlx::query_scalar(
                "SELECT name FROM admin_users
                  WHERE id = $1 AND disabled_at IS NULL AND role IN ('owner', 'reviewer', 'editor')",
            )
            .bind(user)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::BadRequest("Choose someone from the team list."))?,
        ),
    };
    sqlx::query("UPDATE enquiries SET assigned_to = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(input.user_id)
        .execute(&state.pool)
        .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "enquiry.assigned",
        Some(("enquiry", id.to_string())),
        json!({ "to": name }),
        None,
    )
    .await?;
    Ok(Json(json!({ "assigned_to": input.user_id, "name": name })))
}

#[derive(Deserialize)]
struct NoteInput {
    note: String,
}

/// A follow-up note, kept in the enquiry's activity.
async fn add_note(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<NoteInput>,
) -> Result<impl IntoResponse, ApiError> {
    editable(&state.pool, &session, id).await?;
    let note = input.note.trim();
    if note.is_empty() || note.chars().count() > 2000 {
        return Err(ApiError::Validation(vec![crate::error::FieldError {
            field: "note",
            code: "length",
            message: "Write a note of up to 2,000 characters.",
        }]));
    }
    audit(
        &state.pool,
        Some(session.user.id),
        "enquiry.note_added",
        Some(("enquiry", id.to_string())),
        json!({ "note": note }),
        None,
    )
    .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct OverviewQuery {
    days: Option<i32>,
}

macro_rules! grouped_by {
    ($column:literal) => {
        concat!(
            "SELECT ",
            $column,
            ", COUNT(*) FROM enquiries
              WHERE NOT is_spam AND created_at >= now() - make_interval(days => $1)
                AND ($2::text[] IS NULL OR product = ANY($2))
              GROUP BY 1 ORDER BY 2 DESC, 1"
        )
    };
}

async fn grouped(
    pool: &sqlx::PgPool,
    column: &str,
    days: i32,
    slugs: &Option<Vec<String>>,
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    let sql = match column {
        "kind" => grouped_by!("kind"),
        "product" => grouped_by!("product"),
        _ => grouped_by!("status"),
    };
    sqlx::query_as(sql).bind(days).bind(slugs).fetch_all(pool).await
}

/// Leads & Enquiries at a glance (P8-M8): what arrived in the period, by
/// kind, website and status, plus demos booked and conversion. Counts only,
/// for the websites the person can see; spam is left out.
async fn overview(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(q): Query<OverviewQuery>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let days = q.days.unwrap_or(30);
    if ![7, 30, 90, 365].contains(&days) {
        return Err(ApiError::BadRequest("days is 7, 30, 90 or 365"));
    }
    let slugs = session.site_slugs();
    let by_kind = grouped(&state.pool, "kind", days, &slugs).await?;
    let by_product = grouped(&state.pool, "product", days, &slugs).await?;
    let by_status = grouped(&state.pool, "status", days, &slugs).await?;
    let total: i64 = by_kind.iter().map(|(_, n)| n).sum();
    let converted = by_status
        .iter()
        .find(|(k, _)| k == "converted")
        .map_or(0, |(_, n)| *n);
    let demos: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE b.created_at >= now() - make_interval(days => $1)),
                COUNT(*) FILTER (WHERE b.status IN ('pending', 'confirmed') AND b.ends_at >= now()),
                COUNT(*) FILTER (WHERE b.status = 'completed' AND b.starts_at >= now() - make_interval(days => $1)),
                COUNT(*) FILTER (WHERE b.status = 'no_show' AND b.starts_at >= now() - make_interval(days => $1))
           FROM demo_bookings b
          WHERE ($2::text[] IS NULL OR b.product = ANY($2))",
    )
    .bind(days)
    .bind(&slugs)
    .fetch_one(&state.pool)
    .await?;
    let unassigned: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM enquiries
          WHERE NOT is_spam AND assigned_to IS NULL AND status IN ('new', 'contacted', 'qualified', 'demo_scheduled')
            AND ($1::text[] IS NULL OR product = ANY($1))",
    )
    .bind(&slugs)
    .fetch_one(&state.pool)
    .await?;
    let list = |rows: Vec<(String, i64)>| {
        rows.into_iter()
            .map(|(key, count)| json!({ "key": key, "count": count }))
            .collect::<Vec<_>>()
    };
    Ok(Json(json!({
        "days": days,
        "total": total,
        "converted": converted,
        "by_kind": list(by_kind),
        "by_product": list(by_product),
        "by_status": list(by_status),
        "demos": { "booked": demos.0, "upcoming": demos.1, "completed": demos.2, "no_show": demos.3 },
        "open_unassigned": unassigned,
    })))
}

#[derive(FromRow)]
struct ExportRow {
    reference: String,
    created_at: DateTime<Utc>,
    kind: String,
    product: String,
    status: String,
    name: String,
    email: String,
    company: Option<String>,
    job_title: Option<String>,
    phone: Option<String>,
    country: Option<String>,
    company_size: Option<String>,
    message: Option<String>,
    phone_secondary: Option<String>,
}

/// One CSV cell: quoted, and neutralised if a spreadsheet could read it as a formula.
fn cell(value: &str) -> String {
    let guarded = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    format!("\"{}\"", guarded.replace('"', "\"\""))
}

async fn export(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(filters): Query<Filters>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let f = validate(&filters)?;
    let rows: Vec<ExportRow> = sqlx::query_as(filtered!(
        "SELECT e.reference, e.created_at, e.kind, e.product, e.status, e.name, e.email, e.company, e.job_title,
                e.phone, e.country, e.company_size, e.message, e.phone_secondary",
        "ORDER BY e.created_at DESC LIMIT $6"
    ))
    .bind(&f.status)
    .bind(&f.kind)
    .bind(&f.product)
    .bind(&f.q)
    .bind(f.include_spam)
    .bind(EXPORT_LIMIT)
    .fetch_all(&state.pool)
    .await?;

    let mut csv = String::from(
        "reference,received_at,kind,product,status,name,email,company,job_title,phone,country,company_size,message,phone_secondary\r\n",
    );
    for r in &rows {
        let fields = [
            r.reference.as_str(),
            &r.created_at.to_rfc3339(),
            &r.kind,
            &r.product,
            &r.status,
            &r.name,
            &r.email,
            r.company.as_deref().unwrap_or(""),
            r.job_title.as_deref().unwrap_or(""),
            r.phone.as_deref().unwrap_or(""),
            r.country.as_deref().unwrap_or(""),
            r.company_size.as_deref().unwrap_or(""),
            r.message.as_deref().unwrap_or(""),
            // Added last (30 Oct 2026), so existing columns keep their positions.
            r.phone_secondary.as_deref().unwrap_or(""),
        ];
        csv.push_str(&fields.iter().map(|v| cell(v)).collect::<Vec<_>>().join(","));
        csv.push_str("\r\n");
    }
    audit(
        &state.pool,
        Some(session.user.id),
        "enquiry.exported",
        None,
        json!({ "rows": rows.len(), "status": f.status, "kind": f.kind, "product": f.product }),
        None,
    )
    .await?;
    let filename = format!("figbud-enquiries-{}.csv", Utc::now().format("%Y%m%d-%H%M"));
    Ok((
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/csv; charset=utf-8"),
            ),
            (
                header::CONTENT_DISPOSITION,
                HeaderValue::from_str(&format!("attachment; filename=\"{filename}\""))
                    .expect("ASCII filename"),
            ),
        ],
        format!("\u{feff}{csv}"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_cells_are_quoted_and_formula_safe() {
        assert_eq!(cell("Amina"), "\"Amina\"");
        assert_eq!(cell("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(cell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
        assert_eq!(cell("+254700000000"), "\"'+254700000000\"");
        assert_eq!(cell("@SUM(A1)"), "\"'@SUM(A1)\"");
    }

    #[test]
    fn filters_accept_known_values_only() {
        let ok = Filters {
            status: Some("new".into()),
            kind: Some("waitlist".into()),
            ..Default::default()
        };
        let valid = validate(&ok).unwrap();
        assert_eq!(
            (valid.status.as_deref(), valid.include_spam),
            (Some("new"), false)
        );
        let spam = Filters {
            status: Some("spam".into()),
            ..Default::default()
        };
        assert!(validate(&spam).unwrap().include_spam, "the spam tab shows spam");
        let bad = Filters {
            product: Some("other".into()),
            ..Default::default()
        };
        assert!(validate(&bad).is_err());
        let search = Filters {
            q: Some("50%_off\\".into()),
            ..Default::default()
        };
        assert_eq!(validate(&search).unwrap().q.as_deref(), Some("%50off%"));
    }
}
