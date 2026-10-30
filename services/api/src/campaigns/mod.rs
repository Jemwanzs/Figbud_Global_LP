//! Campaigns & promotions (P8-M1): campaigns created per website in the
//! Studio (Marketing), with drafts, approved versions, scheduling, placement
//! rules, aggregate analytics and interactive rewards decided by the API.
//!
//! - Editors (on the campaign's website) create and edit drafts and submit
//!   them; reviewers approve, pause, resume and archive. Interactive reward
//!   campaigns need an owner's approval and a recorded legal review.
//! - Websites read live campaigns only (`GET /v1/sites/{slug}/campaigns`):
//!   published, not paused or archived, inside their schedule.
//! - Rewards are allocated in one transaction that locks the campaign's stock,
//!   so limits and attempts hold under concurrent spins.

pub mod doc;

use std::net::SocketAddr;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use self::doc::CampaignDoc;
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    rate_limit::client_ip,
    routes::SharedState,
    sites::audit_site,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/campaigns", get(public_live))
        .route("/v1/campaigns/{id}/events", post(record_event))
        .route("/v1/campaigns/{id}/spin", post(spin))
        .route("/v1/admin/campaigns", get(list).post(create))
        .route("/v1/admin/campaigns/{id}", get(read))
        .route("/v1/admin/campaigns/{id}/draft", post(save_draft))
        .route("/v1/admin/campaigns/{id}/submit", post(submit))
        .route(
            "/v1/admin/campaigns/{id}/revisions/{revision}/{action}",
            post(revision_action),
        )
        .route("/v1/admin/campaigns/{id}/{action}", post(campaign_action))
}

#[derive(FromRow, Serialize)]
struct Row {
    id: Uuid,
    site_id: Uuid,
    #[sqlx(default)]
    site_slug: String,
    #[sqlx(default)]
    site_name: String,
    name: String,
    reference: String,
    kind: String,
    objective: String,
    description: String,
    owner_id: Option<Uuid>,
    #[sqlx(default)]
    owner_name: Option<String>,
    draft: Value,
    draft_version: i32,
    draft_updated_at: DateTime<Utc>,
    published: Option<Value>,
    published_revision: Option<Uuid>,
    published_at: Option<DateTime<Utc>>,
    starts_at: Option<DateTime<Utc>>,
    ends_at: Option<DateTime<Utc>>,
    priority: i32,
    paused_at: Option<DateTime<Utc>>,
    archived_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

macro_rules! select {
    () => {
        "SELECT c.id, c.site_id, s.slug AS site_slug, s.name AS site_name, c.name, c.reference, c.kind, c.objective,
                c.description, c.owner_id, o.name AS owner_name, c.draft, c.draft_version, c.draft_updated_at,
                c.published, c.published_revision, c.published_at, c.starts_at, c.ends_at, c.priority, c.paused_at,
                c.archived_at, c.created_at
           FROM campaigns c JOIN sites s ON s.id = c.site_id LEFT JOIN admin_users o ON o.id = c.owner_id "
    };
}

async fn load(pool: &PgPool, id: Uuid) -> Result<Row, ApiError> {
    sqlx::query_as(concat!(select!(), "WHERE c.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

fn decode(value: &Value, kind: &str) -> Result<CampaignDoc, ApiError> {
    let doc: CampaignDoc = serde_json::from_value(value.clone()).map_err(|_| {
        ApiError::Validation(vec![FieldError {
            field: "document",
            code: "format",
            message: "The campaign couldn't be read. Reload and try again.",
        }])
    })?;
    doc.validate(kind).map_err(ApiError::Validation)?;
    Ok(doc)
}

/// Where a campaign is in its life: archived, paused, draft (never
/// published), scheduled, live or completed. A pending approval is reported
/// separately.
fn status(row: &Row, now: DateTime<Utc>) -> &'static str {
    if row.archived_at.is_some() {
        return "archived";
    }
    let Some(published) = row
        .published
        .as_ref()
        .and_then(|p| serde_json::from_value::<CampaignDoc>(p.clone()).ok())
    else {
        return "draft";
    };
    if row.paused_at.is_some() {
        return "paused";
    }
    if published.live_at(now) {
        "live"
    } else if published.schedule.recurrence == doc::Recurrence::Yearly
        || published.schedule.starts_at.is_some_and(|s| s > now)
    {
        "scheduled"
    } else {
        "completed"
    }
}

/// Events and entries per campaign, for the Studio.
#[derive(FromRow, Serialize, Default, Clone)]
struct Stats {
    #[serde(skip)]
    campaign_id: Uuid,
    impressions: i64,
    clicks: i64,
    dismissals: i64,
    conversions: i64,
    entries: i64,
}

async fn stats(pool: &PgPool, ids: &[Uuid]) -> Result<Vec<Stats>, sqlx::Error> {
    sqlx::query_as(
        "SELECT c.id AS campaign_id,
                COALESCE(sum(e.count) FILTER (WHERE e.kind = 'impression'), 0)::bigint AS impressions,
                COALESCE(sum(e.count) FILTER (WHERE e.kind = 'click'), 0)::bigint AS clicks,
                COALESCE(sum(e.count) FILTER (WHERE e.kind = 'dismiss'), 0)::bigint AS dismissals,
                COALESCE(sum(e.count) FILTER (WHERE e.kind = 'conversion'), 0)::bigint
                  + (SELECT count(*) FROM enquiries q WHERE q.campaign_id = c.id) AS conversions,
                (SELECT count(*) FROM campaign_entries x WHERE x.campaign_id = c.id) AS entries
           FROM campaigns c LEFT JOIN campaign_events e ON e.campaign_id = c.id
          WHERE c.id = ANY($1) GROUP BY c.id",
    )
    .bind(ids)
    .fetch_all(pool)
    .await
}

// ----------------------------------------------------------------- studio

#[derive(Deserialize)]
struct ListQuery {
    #[serde(default)]
    site: Option<String>,
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(query): Query<ListQuery>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let rows: Vec<Row> = sqlx::query_as(concat!(
        select!(),
        "WHERE ($1::text IS NULL OR s.slug = $1) AND ($2::uuid[] IS NULL OR c.site_id = ANY($2))
         ORDER BY c.archived_at IS NOT NULL, c.created_at DESC"
    ))
    .bind(&query.site)
    .bind(session.site_ids())
    .fetch_all(&state.pool)
    .await?;
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let all_stats = stats(&state.pool, &ids).await?;
    let pending: Vec<Uuid> = sqlx::query_scalar(
        "SELECT campaign_id FROM campaign_revisions WHERE state = 'pending' AND campaign_id = ANY($1)",
    )
    .bind(&ids)
    .fetch_all(&state.pool)
    .await?;
    let now = Utc::now();
    let items: Vec<Value> = rows
        .iter()
        .map(|row| {
            json!({
                "id": row.id, "name": row.name, "reference": row.reference, "kind": row.kind,
                "site": row.site_slug, "site_name": row.site_name, "owner_name": row.owner_name,
                "status": status(row, now), "pending": pending.contains(&row.id),
                "starts_at": row.starts_at, "ends_at": row.ends_at, "priority": row.priority,
                "draft_differs": row.published.as_ref() != Some(&row.draft),
                "stats": all_stats.iter().find(|s| s.campaign_id == row.id).cloned().unwrap_or_default(),
            })
        })
        .collect();
    // Websites this person can create campaigns for.
    let sites: Vec<(Uuid, String, String)> =
        sqlx::query_as("SELECT id, slug, name FROM sites WHERE archived_at IS NULL ORDER BY position, name")
            .fetch_all(&state.pool)
            .await?;
    let sites: Vec<Value> = sites
        .into_iter()
        .filter(|(id, _, _)| session.site_role(*id) >= Some(Role::Viewer))
        .map(|(id, slug, name)| json!({ "site": slug, "name": name, "can_create": session.site_role(id) >= Some(Role::Editor) }))
        .collect();
    Ok(Json(
        json!({ "items": items, "sites": sites, "kinds": doc::KINDS }),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    site: String,
    name: String,
    kind: String,
    #[serde(default)]
    reference: Option<String>,
}

fn valid_reference(reference: &str) -> bool {
    let r = reference.as_bytes();
    (2..=40).contains(&r.len())
        && r[0].is_ascii_alphanumeric()
        && r.iter()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || *b == b'-')
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<CreateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site: (Uuid, String, String) =
        sqlx::query_as("SELECT id, name, slug FROM sites WHERE slug = $1 AND archived_at IS NULL")
            .bind(&input.site)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::NotFound)?;
    session.require_site(site.0, Role::Editor)?;
    let name = input.name.trim();
    let mut errors = Vec::new();
    if name.is_empty() || name.chars().count() > 120 {
        errors.push(FieldError {
            field: "name",
            code: "length",
            message: "Name the campaign (up to 120 characters).",
        });
    }
    if !doc::KINDS.contains(&input.kind.as_str()) {
        errors.push(FieldError {
            field: "kind",
            code: "invalid",
            message: "Choose a campaign type.",
        });
    }
    let reference = match input
        .reference
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
    {
        Some(r) => r.to_uppercase(),
        None => {
            let prefix: String = site.2.replace('_', "").to_uppercase().chars().take(6).collect();
            format!(
                "{prefix}-{}",
                Uuid::new_v4().simple().to_string()[..6].to_uppercase()
            )
        }
    };
    if !valid_reference(&reference) {
        errors.push(FieldError {
            field: "reference",
            code: "format",
            message: "References use 2–40 capital letters, digits and hyphens.",
        });
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    let document = serde_json::to_value(doc::template(&input.kind, &site.1))
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO campaigns (id, site_id, name, reference, kind, owner_id, draft, draft_updated_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $6)",
    )
    .bind(id)
    .bind(site.0)
    .bind(name)
    .bind(&reference)
    .bind(&input.kind)
    .bind(session.user.id)
    .bind(&document)
    .execute(&state.pool)
    .await
    .map_err(|err| match &err {
        sqlx::Error::Database(db) if db.constraint() == Some("campaigns_reference_key") => {
            ApiError::Validation(vec![FieldError {
                field: "reference",
                code: "taken",
                message: "Another campaign already uses this reference.",
            }])
        }
        _ => err.into(),
    })?;
    audit_site(
        &state.pool,
        &session,
        site.0,
        "campaign.created",
        json!({ "campaign": id, "name": name, "kind": input.kind, "reference": reference }),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "reference": reference })),
    ))
}

#[derive(Serialize, FromRow)]
struct Revision {
    id: Uuid,
    number: i32,
    note: String,
    state: String,
    requested_by: Option<String>,
    requested_by_id: Option<Uuid>,
    decided_by: Option<String>,
    decision_note: Option<String>,
    created_at: DateTime<Utc>,
    decided_at: Option<DateTime<Utc>>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let row = load(&state.pool, id).await?;
    session.require_site(row.site_id, Role::Viewer)?;
    let revisions: Vec<Revision> = sqlx::query_as(
        "SELECT r.id, r.number, r.note, r.state, rq.name AS requested_by, r.requested_by AS requested_by_id,
                dc.name AS decided_by, r.decision_note, r.created_at, r.decided_at
           FROM campaign_revisions r
           LEFT JOIN admin_users rq ON rq.id = r.requested_by
           LEFT JOIN admin_users dc ON dc.id = r.decided_by
          WHERE r.campaign_id = $1 ORDER BY r.number DESC LIMIT 30",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let daily: Vec<(chrono::NaiveDate, String, i64)> = sqlx::query_as(
        "SELECT day, kind, count FROM campaign_events WHERE campaign_id = $1 AND day > current_date - 30 ORDER BY day",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let rewards: Vec<(String, String, Option<i32>, i32, i32, bool)> = sqlx::query_as(
        "SELECT reward_id, label, quantity, awarded, weight, active FROM campaign_rewards WHERE campaign_id = $1 ORDER BY reward_id",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let redeemed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM campaign_entries WHERE campaign_id = $1 AND redeemed_at IS NOT NULL",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let stats = stats(&state.pool, &[id])
        .await?
        .into_iter()
        .next()
        .unwrap_or_default();
    let role = session.site_role(row.site_id);
    let mut value = serde_json::to_value(&row).map_err(|e| ApiError::Internal(e.to_string()))?;
    value["status"] = json!(status(&row, Utc::now()));
    value["draft_differs"] = json!(row.published.as_ref() != Some(&row.draft));
    value["revisions"] = json!(revisions);
    value["stats"] = json!(stats);
    value["redeemed"] = json!(redeemed);
    value["daily"] = json!(
        daily
            .into_iter()
            .map(|(day, kind, count)| json!({ "day": day, "kind": kind, "count": count }))
            .collect::<Vec<_>>()
    );
    value["stock"] = json!(rewards.into_iter().map(|(id, label, quantity, awarded, weight, active)| json!({
        "id": id, "label": label, "quantity": quantity, "awarded": awarded, "weight": weight, "active": active,
    })).collect::<Vec<_>>());
    value["can_edit"] = json!(role >= Some(Role::Editor) && row.archived_at.is_none());
    value["can_review"] = json!(role >= Some(Role::Reviewer));
    value["can_approve_rewards"] = json!(role >= Some(Role::Owner));
    Ok(Json(value))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftInput {
    name: String,
    #[serde(default)]
    objective: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    owner_id: Option<Uuid>,
    document: Value,
    version: i32,
}

async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let row = load(&state.pool, id).await?;
    session.require_site(row.site_id, Role::Editor)?;
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this campaign before editing it."));
    }
    let name = input.name.trim();
    let mut errors = Vec::new();
    if name.is_empty() || name.chars().count() > 120 {
        errors.push(FieldError {
            field: "name",
            code: "length",
            message: "Name the campaign (up to 120 characters).",
        });
    }
    if input.objective.chars().count() > 200 || input.description.chars().count() > 1000 {
        errors.push(FieldError {
            field: "description",
            code: "length",
            message: "Objectives are up to 200 characters and descriptions up to 1,000.",
        });
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    let doc = decode(&input.document, &row.kind)?;
    if let Some(image) = doc.content.image_id {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM media_assets WHERE id = $1 AND site_id = $2 AND archived_at IS NULL)",
        )
        .bind(image)
        .bind(row.site_id)
        .fetch_one(&state.pool)
        .await?;
        if !ok {
            return Err(ApiError::Validation(vec![FieldError {
                field: "document",
                code: "invalid",
                message: "Choose an image from this website's media library.",
            }]));
        }
    }
    let value = serde_json::to_value(&doc).map_err(|e| ApiError::Internal(e.to_string()))?;
    let updated = sqlx::query(
        "UPDATE campaigns SET name = $3, objective = $4, description = $5, owner_id = $6, draft = $7,
                draft_version = draft_version + 1, draft_updated_by = $8, draft_updated_at = now()
          WHERE id = $1 AND draft_version = $2",
    )
    .bind(id)
    .bind(input.version)
    .bind(name)
    .bind(input.objective.trim())
    .bind(input.description.trim())
    .bind(input.owner_id)
    .bind(&value)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "Someone else changed this campaign. Reload to see their changes.",
        ));
    }
    if row.draft != value || row.name != name {
        audit_site(
            &state.pool,
            &session,
            row.site_id,
            "campaign.draft_saved",
            json!({ "campaign": id, "from": row.draft, "to": value }),
        )
        .await?;
    }
    Ok(Json(json!({ "draft_version": input.version + 1 })))
}

#[derive(Deserialize)]
struct SubmitInput {
    note: String,
}

async fn submit(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<SubmitInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let row = load(&state.pool, id).await?;
    session.require_site(row.site_id, Role::Editor)?;
    let note = input.note.trim();
    if note.is_empty() || note.chars().count() > 300 {
        return Err(ApiError::Validation(vec![FieldError {
            field: "note",
            code: "length",
            message: "Say what changed in up to 300 characters.",
        }]));
    }
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this campaign before publishing it."));
    }
    if row.published.as_ref() == Some(&row.draft) {
        return Err(ApiError::Conflict(
            "The draft is the same as the published campaign.",
        ));
    }
    let doc = decode(&row.draft, &row.kind)?;
    doc.ready(&row.kind).map_err(ApiError::Conflict)?;
    let revision = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO campaign_revisions (id, campaign_id, number, document, note, requested_by)
         VALUES ($1, $2, COALESCE((SELECT max(number) FROM campaign_revisions WHERE campaign_id = $2), 0) + 1, $3, $4, $5)",
    )
    .bind(revision)
    .bind(id)
    .bind(&row.draft)
    .bind(note)
    .bind(session.user.id)
    .execute(&state.pool)
    .await
    .map_err(|err| match &err {
        sqlx::Error::Database(db) if db.constraint() == Some("campaign_revisions_one_pending") => {
            ApiError::Conflict("A change to this campaign is already waiting for approval.")
        }
        _ => err.into(),
    })?;
    audit_site(
        &state.pool,
        &session,
        row.site_id,
        "campaign.submitted",
        json!({ "campaign": id, "revision": revision, "note": note }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": revision }))))
}

#[derive(Deserialize, Default)]
struct DecisionInput {
    #[serde(default)]
    note: Option<String>,
}

/// Rewards stock follows the published rewards: new ones are added, changed
/// ones updated (awarded counts kept), removed ones deactivated.
async fn sync_rewards(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: Uuid,
    doc: &CampaignDoc,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE campaign_rewards SET active = false WHERE campaign_id = $1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    for reward in doc.rewards.iter().flat_map(|r| &r.rewards) {
        sqlx::query(
            "INSERT INTO campaign_rewards (campaign_id, reward_id, label, quantity, weight, active)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (campaign_id, reward_id) DO UPDATE
               SET label = EXCLUDED.label, weight = EXCLUDED.weight, active = true,
                   quantity = GREATEST(EXCLUDED.quantity, campaign_rewards.awarded)",
        )
        .bind(id)
        .bind(&reward.id)
        .bind(&reward.label)
        .bind(reward.quantity.map(|q| i32::try_from(q).unwrap_or(i32::MAX)))
        .bind(i32::from(reward.weight))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn revision_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, revision, action)): Path<(Uuid, Uuid, String)>,
    body: Option<Json<DecisionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    let row = load(&state.pool, id).await?;
    session.require_site(row.site_id, Role::Viewer)?;
    let found: Option<(Value, String, Option<Uuid>, i32)> = sqlx::query_as(
        "SELECT document, state, requested_by, number FROM campaign_revisions WHERE id = $1 AND campaign_id = $2",
    )
    .bind(revision)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (document, current, requested_by, number) = found.ok_or(ApiError::NotFound)?;
    let note = body
        .and_then(|b| b.0.note)
        .map(|n| n.trim().to_owned())
        .filter(|n| !n.is_empty());
    if note.as_ref().is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::BadRequest("note is too long"));
    }
    let own = requested_by == Some(session.user.id);
    if action == "restore" {
        session.require_site(row.site_id, Role::Editor)?;
        if current != "published" {
            return Err(ApiError::Conflict("Only published versions can be restored."));
        }
        sqlx::query("UPDATE campaigns SET draft = $2, draft_version = draft_version + 1, draft_updated_by = $3, draft_updated_at = now() WHERE id = $1")
            .bind(id)
            .bind(&document)
            .bind(session.user.id)
            .execute(&state.pool)
            .await?;
        audit_site(
            &state.pool,
            &session,
            row.site_id,
            "campaign.version_restored",
            json!({ "campaign": id, "number": number }),
        )
        .await?;
        return Ok(Json(json!({ "restored": number })));
    }
    if current != "pending" {
        return Err(ApiError::Conflict("This change has already been decided."));
    }
    let mark = |state_: &'static str| {
        sqlx::query("UPDATE campaign_revisions SET state = $2, decided_by = $3, decision_note = $4, decided_at = now() WHERE id = $1")
            .bind(revision)
            .bind(state_)
            .bind(session.user.id)
            .bind(note.clone())
    };
    let outcome = match action.as_str() {
        "approve" => {
            session.require_site(row.site_id, Role::Reviewer)?;
            if own && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own change (maker-checker).",
                ));
            }
            let doc = decode(&document, &row.kind)?;
            doc.ready(&row.kind).map_err(ApiError::Conflict)?;
            if doc.rewards.is_some() && session.site_role(row.site_id) < Some(Role::Owner) {
                return Err(ApiError::NotPermitted(
                    "Interactive reward campaigns need an owner's approval.",
                ));
            }
            let mut tx = state.pool.begin().await?;
            mark("published").execute(&mut *tx).await?;
            sqlx::query(
                "UPDATE campaigns SET published = $2, published_revision = $3, published_at = now(),
                        starts_at = $4, ends_at = $5, priority = $6 WHERE id = $1",
            )
            .bind(id)
            .bind(&document)
            .bind(revision)
            .bind(doc.schedule.starts_at)
            .bind(doc.schedule.ends_at)
            .bind(doc.schedule.priority)
            .execute(&mut *tx)
            .await?;
            sync_rewards(&mut tx, id, &doc).await?;
            tx.commit().await?;
            "published"
        }
        "reject" => {
            session.require_site(row.site_id, Role::Reviewer)?;
            mark("rejected").execute(&state.pool).await?;
            "rejected"
        }
        "cancel" => {
            if !own && session.site_role(row.site_id) < Some(Role::Owner) {
                return Err(ApiError::NotPermitted(
                    "Only the requester or an owner can withdraw this change.",
                ));
            }
            mark("cancelled").execute(&state.pool).await?;
            "cancelled"
        }
        _ => return Err(ApiError::NotFound),
    };
    let detail = if outcome == "published" {
        json!({ "campaign": id, "revision": revision, "number": number, "from": row.published, "to": document, "self_approved": own })
    } else {
        json!({ "campaign": id, "revision": revision, "number": number, "note": note })
    };
    audit_site(
        &state.pool,
        &session,
        row.site_id,
        &format!("campaign.{outcome}"),
        detail,
    )
    .await?;
    Ok(Json(json!({ "state": outcome })))
}

async fn campaign_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let row = load(&state.pool, id).await?;
    session.require_site(row.site_id, Role::Viewer)?;
    let (sql, need, done): (&str, Role, &str) = match action.as_str() {
        "pause" => (
            "UPDATE campaigns SET paused_at = now() WHERE id = $1 AND paused_at IS NULL AND published IS NOT NULL",
            Role::Reviewer,
            "paused",
        ),
        "resume" => (
            "UPDATE campaigns SET paused_at = NULL WHERE id = $1 AND paused_at IS NOT NULL",
            Role::Reviewer,
            "resumed",
        ),
        "archive" => (
            "UPDATE campaigns SET archived_at = now() WHERE id = $1 AND archived_at IS NULL",
            Role::Reviewer,
            "archived",
        ),
        "restore" => (
            "UPDATE campaigns SET archived_at = NULL, paused_at = COALESCE(paused_at, now()) WHERE id = $1 AND archived_at IS NOT NULL",
            Role::Reviewer,
            "restored",
        ),
        "duplicate" => {
            session.require_site(row.site_id, Role::Editor)?;
            let new_id = Uuid::now_v7();
            let suffix = &Uuid::new_v4().simple().to_string()[..4].to_uppercase();
            let base: String = row.reference.chars().take(34).collect();
            let reference = format!("{base}-{suffix}");
            sqlx::query(
                "INSERT INTO campaigns (id, site_id, name, reference, kind, objective, description, owner_id, draft, draft_updated_by, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $8)",
            )
            .bind(new_id)
            .bind(row.site_id)
            .bind(format!("{} (copy)", row.name).chars().take(120).collect::<String>())
            .bind(&reference)
            .bind(&row.kind)
            .bind(&row.objective)
            .bind(&row.description)
            .bind(session.user.id)
            .bind(&row.draft)
            .execute(&state.pool)
            .await?;
            audit_site(
                &state.pool,
                &session,
                row.site_id,
                "campaign.duplicated",
                json!({ "campaign": new_id, "from": id }),
            )
            .await?;
            return Ok(Json(json!({ "id": new_id, "reference": reference })));
        }
        _ => return Err(ApiError::NotFound),
    };
    session.require_site(row.site_id, need)?;
    let changed = sqlx::query(sql).bind(id).execute(&state.pool).await?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "That isn't available for this campaign right now.",
        ));
    }
    if action == "archive" {
        // Archiving withdraws a pending change.
        sqlx::query("UPDATE campaign_revisions SET state = 'cancelled', decided_at = now() WHERE campaign_id = $1 AND state = 'pending'")
            .bind(id)
            .execute(&state.pool)
            .await?;
    }
    audit_site(
        &state.pool,
        &session,
        row.site_id,
        &format!("campaign.{done}"),
        json!({ "campaign": id }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "done": done })))
}

// ----------------------------------------------------------------- public

/// Live campaigns of a listed website, highest priority first. Cached only
/// briefly, and each carries its end so websites hide it on time.
async fn public_live(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let rows: Vec<(Uuid, String, String, Value, i32)> = sqlx::query_as(
        "SELECT c.id, c.reference, c.kind, c.published, c.priority FROM campaigns c JOIN sites s ON s.id = c.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')
            AND c.published IS NOT NULL AND c.paused_at IS NULL AND c.archived_at IS NULL
          ORDER BY c.priority DESC, c.published_at DESC",
    )
    .bind(&slug)
    .fetch_all(&state.pool)
    .await?;
    let now = Utc::now();
    let mut live = Vec::new();
    for (id, reference, kind, published, priority) in rows {
        let Ok(doc) = serde_json::from_value::<CampaignDoc>(published) else {
            continue;
        };
        if !doc.live_at(now) {
            continue;
        }
        let available: Vec<(String, bool)> = sqlx::query_as::<_, (String, bool)>(
            "SELECT reward_id, active AND weight > 0 AND (quantity IS NULL OR awarded < quantity) FROM campaign_rewards WHERE campaign_id = $1",
        )
        .bind(id)
        .fetch_all(&state.pool)
        .await?;
        let mut value = doc.public(&available);
        if let Some(image) = doc.content.image_id {
            let media: Option<(String, i32, i32, String)> = sqlx::query_as(
                "SELECT alt_text, width, height, content_type FROM media_assets WHERE id = $1 AND archived_at IS NULL",
            )
            .bind(image)
            .fetch_optional(&state.pool)
            .await?;
            value["content"]["media"] = match media {
                Some((alt, width, height, content_type)) => {
                    json!({ "id": image, "alt": alt, "width": width, "height": height,
                    "content_type": content_type, "widths": [] })
                }
                None => Value::Null,
            };
        }
        value["id"] = json!(id);
        value["reference"] = json!(reference);
        value["kind"] = json!(kind);
        value["priority"] = json!(priority);
        live.push(value);
    }
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=30"),
        )],
        Json(json!({ "campaigns": live, "now": now })),
    ))
}

#[derive(Deserialize)]
struct EventInput {
    kind: String,
}

/// Counts an impression, click, dismissal or conversion: a daily total, with
/// no identifiers, cookies or personal data.
async fn record_event(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    body: Result<Json<EventInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let ip = client_ip(&headers, peer, state.config.trust_proxy);
    state
        .campaign_limiter
        .check(ip)
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let Json(input) = body.map_err(|_| ApiError::BadRequest("Request body must be valid JSON."))?;
    if !["impression", "click", "dismiss", "conversion"].contains(&input.kind.as_str()) {
        return Err(ApiError::BadRequest("unknown event"));
    }
    let counted = sqlx::query(
        "INSERT INTO campaign_events (campaign_id, day, kind, count)
         SELECT id, current_date, $2, 1 FROM campaigns WHERE id = $1 AND published IS NOT NULL AND archived_at IS NULL
         ON CONFLICT (campaign_id, day, kind) DO UPDATE SET count = campaign_events.count + 1",
    )
    .bind(id)
    .bind(&input.kind)
    .execute(&state.pool)
    .await?;
    if counted.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(FromRow)]
struct SpinTarget {
    published: Option<Value>,
    paused_at: Option<DateTime<Utc>>,
    archived_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct SpinInput {
    email: String,
    /// The visitor accepted the rules and terms.
    accepted: bool,
}

/// One attempt at an interactive reward campaign. The reward is chosen here,
/// weighted by the published chances among rewards still in stock, inside a
/// transaction that locks the stock; the wheel only shows the result.
async fn spin(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    body: Result<Json<SpinInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let ip = client_ip(&headers, peer, state.config.trust_proxy);
    state
        .spin_limiter
        .check(ip)
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let Json(input) = body.map_err(|_| ApiError::BadRequest("Request body must be valid JSON."))?;
    let email = input.email.trim().to_lowercase();
    if !crate::enquiry::is_valid_email(&email) {
        return Err(ApiError::Validation(vec![FieldError {
            field: "email",
            code: "invalid",
            message: "Enter a valid email address.",
        }]));
    }
    if !input.accepted {
        return Err(ApiError::Validation(vec![FieldError {
            field: "accepted",
            code: "required",
            message: "Please accept the rules and terms to take part.",
        }]));
    }
    let row: Option<SpinTarget> = sqlx::query_as(
        "SELECT c.published, c.paused_at, c.archived_at FROM campaigns c JOIN sites s ON s.id = c.site_id
          WHERE c.id = $1 AND c.kind = 'rewards' AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(SpinTarget {
        published: Some(published),
        paused_at: None,
        archived_at: None,
    }) = row
    else {
        return Err(ApiError::NotFound);
    };
    let doc: CampaignDoc =
        serde_json::from_value(published).map_err(|e| ApiError::Internal(e.to_string()))?;
    let now = Utc::now();
    let Some(rules) = doc.rewards.as_ref().filter(|_| doc.live_at(now)) else {
        return Err(ApiError::Conflict("This promotion isn't running at the moment."));
    };
    let participant = hex::encode(Sha256::digest(format!(
        "{}:{id}:{email}",
        state.config.ip_hash_salt
    )));

    let mut tx = state.pool.begin().await?;
    // Locking the stock serialises attempts on this campaign.
    let stock: Vec<(String, Option<i32>, i32, i32)> = sqlx::query_as(
        "SELECT reward_id, quantity, awarded, weight FROM campaign_rewards
          WHERE campaign_id = $1 AND active ORDER BY reward_id FOR UPDATE",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let attempts: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM campaign_entries WHERE campaign_id = $1 AND participant_hash = $2",
    )
    .bind(id)
    .bind(&participant)
    .fetch_one(&mut *tx)
    .await?;
    if attempts >= i64::from(rules.max_attempts) {
        return Err(ApiError::Conflict(
            "You've already used every attempt for this promotion.",
        ));
    }
    let open: Vec<&(String, Option<i32>, i32, i32)> = stock
        .iter()
        .filter(|(_, q, a, w)| *w > 0 && q.is_none_or(|q| *a < q))
        .collect();
    let total: i32 = open.iter().map(|(_, _, _, w)| *w).sum();
    if total == 0 {
        return Err(ApiError::Conflict(
            "Every reward in this promotion has been claimed.",
        ));
    }
    let mut pick = rand::rng().random_range(0..total);
    let chosen = open
        .iter()
        .find(|(_, _, _, w)| {
            if pick < *w {
                true
            } else {
                pick -= *w;
                false
            }
        })
        .map(|(id, _, _, _)| id.clone())
        .ok_or(ApiError::Internal("reward selection".into()))?;
    sqlx::query(
        "UPDATE campaign_rewards SET awarded = awarded + 1 WHERE campaign_id = $1 AND reward_id = $2",
    )
    .bind(id)
    .bind(&chosen)
    .execute(&mut *tx)
    .await?;
    let code = format!("FB-{}", Uuid::new_v4().simple().to_string()[..10].to_uppercase());
    let redeem_by = now + chrono::Duration::days(i64::from(rules.redeem_days));
    sqlx::query(
        "INSERT INTO campaign_entries (id, campaign_id, participant_hash, email, reward_id, code, redeem_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::now_v7())
    .bind(id)
    .bind(&participant)
    .bind(&email)
    .bind(&chosen)
    .bind(&code)
    .bind(redeem_by)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let reward = rules.rewards.iter().find(|r| r.id == chosen);
    Ok(Json(json!({
        "reward": {
            "id": chosen,
            "label": reward.map(|r| r.label.as_str()),
            "description": reward.and_then(|r| r.description.as_deref()),
            "instructions": reward.map(|r| r.instructions.as_str()),
        },
        "code": code,
        "redeem_by": redeem_by,
        "attempts_left": i64::from(rules.max_attempts) - attempts - 1,
    })))
}
