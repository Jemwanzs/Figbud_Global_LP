//! Admin Studio, Phase B: the website and product registry.
//!
//! Every website (the corporate site and each product) is a row in `sites`.
//! Its marketing lifecycle — draft → coming soon → beta → active → retired —
//! decides what the public websites say and which call to action they show.
//! It never switches on the operational product (decision D19).
//!
//! Lifecycle changes are requests that a second person approves
//! (maker-checker); owners may approve their own, which is audited.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    routes::SharedState,
};

const STATUSES: [&str; 5] = ["draft", "coming_soon", "beta", "active", "retired"];
const CATEGORIES: [&str; 5] = [
    "corporate",
    "hr_workforce",
    "lending_credit",
    "finance_payments",
    "custom_enterprise",
];
const TEMPLATES: [&str; 5] = ["corporate", "hr", "lending", "finance", "custom"];

/// Allowed lifecycle moves (see docs/ADMIN_STUDIO.md).
pub fn transition_allowed(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("draft", "coming_soon" | "beta" | "active")
            | ("coming_soon", "draft" | "beta" | "active" | "retired")
            | ("beta", "coming_soon" | "active" | "retired")
            | ("active", "coming_soon" | "beta" | "retired")
            | ("retired", "coming_soon")
    )
}

/// The one public call to action each status implies, so cards, menus and pages agree.
pub fn cta_for(status: &str) -> Option<&'static str> {
    match status {
        "coming_soon" => Some("waitlist"),
        "beta" => Some("early_access"),
        "active" => Some("demo"),
        _ => None,
    }
}

/// The template a category starts from.
fn default_template(category: &str) -> &'static str {
    match category {
        "hr_workforce" => "hr",
        "lending_credit" => "lending",
        "finance_payments" => "finance",
        "corporate" => "corporate",
        _ => "custom",
    }
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites", get(public_sites))
        .route("/v1/admin/sites", get(list).post(create))
        .route("/v1/admin/sites/{slug}", get(read).post(update))
        .route("/v1/admin/sites/{slug}/archive", post(archive))
        .route("/v1/admin/sites/{slug}/restore", post(restore))
        .route("/v1/admin/sites/{slug}/status-requests", post(request_status))
        .route(
            "/v1/admin/sites/{slug}/status-requests/{id}/{decision}",
            post(decide),
        )
}

// ---------------------------------------------------------------- public

#[derive(Serialize, FromRow)]
struct PublicSite {
    slug: String,
    kind: String,
    name: String,
    tagline: Option<String>,
    description: Option<String>,
    category: String,
    status: String,
    primary_domain: Option<String>,
    position: i32,
}

/// Listed websites (not archived, draft or retired) with their published brand.
async fn public_sites(State(state): State<SharedState>) -> Result<impl IntoResponse, ApiError> {
    let rows: Vec<PublicSite> = sqlx::query_as(
        "SELECT slug, kind, name, tagline, description, category, status, primary_domain, position
           FROM sites
          WHERE archived_at IS NULL AND status IN ('coming_soon', 'beta', 'active')
          ORDER BY position, name",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut brands = crate::brand::published_by_slug(&state.pool).await?;
    let sites: Vec<Value> = rows
        .into_iter()
        .map(|s| {
            let cta = cta_for(&s.status);
            let brand = brands.remove(&s.slug).unwrap_or(Value::Null);
            let mut value = serde_json::to_value(s).unwrap_or(Value::Null);
            value["cta"] = json!(cta);
            value["brand"] = brand;
            value
        })
        .collect();
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60, stale-while-revalidate=300"),
        )],
        Json(sites),
    ))
}

// ----------------------------------------------------------------- admin

#[derive(Serialize, FromRow)]
struct AdminSite {
    id: Uuid,
    slug: String,
    kind: String,
    name: String,
    tagline: Option<String>,
    description: Option<String>,
    category: String,
    template: String,
    status: String,
    primary_domain: Option<String>,
    position: i32,
    archived_at: Option<DateTime<Utc>>,
    version: i32,
    updated_at: DateTime<Utc>,
    pending_to_status: Option<String>,
}

macro_rules! admin_select {
    () => {
        "SELECT s.id, s.slug, s.kind, s.name, s.tagline, s.description, s.category, s.template, s.status,
                s.primary_domain, s.position, s.archived_at, s.version, s.updated_at,
                (SELECT r.to_status FROM site_status_requests r
                  WHERE r.site_id = s.id AND r.decision = 'pending') AS pending_to_status
           FROM sites s "
    };
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let rows: Vec<AdminSite> = sqlx::query_as(concat!(
        admin_select!(),
        "ORDER BY s.archived_at IS NOT NULL, s.position, s.name"
    ))
    .fetch_all(&state.pool)
    .await?;
    // Each website with its published brand (logos for the Studio cards); drafts never show here.
    let mut brands = crate::brand::published_by_slug(&state.pool).await?;
    let sites: Vec<Value> = rows
        .into_iter()
        .map(|site| {
            let brand = brands.remove(&site.slug).unwrap_or(Value::Null);
            let mut value = serde_json::to_value(site).unwrap_or(Value::Null);
            value["brand"] = brand;
            value
        })
        .collect();
    Ok(Json(sites))
}

async fn load(pool: &PgPool, slug: &str) -> Result<AdminSite, ApiError> {
    sqlx::query_as(concat!(admin_select!(), "WHERE s.slug = $1"))
        .bind(slug)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

#[derive(Serialize, FromRow)]
struct StatusRequest {
    id: Uuid,
    from_status: String,
    to_status: String,
    reason: String,
    requested_by: Option<String>,
    requested_by_id: Option<Uuid>,
    decision: String,
    decided_by: Option<String>,
    decision_note: Option<String>,
    created_at: DateTime<Utc>,
    decided_at: Option<DateTime<Utc>>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = load(&state.pool, &slug).await?;
    let requests: Vec<StatusRequest> = sqlx::query_as(
        "SELECT r.id, r.from_status, r.to_status, r.reason, rq.name AS requested_by, r.requested_by AS requested_by_id,
                r.decision, dc.name AS decided_by, r.decision_note, r.created_at, r.decided_at
           FROM site_status_requests r
           LEFT JOIN admin_users rq ON rq.id = r.requested_by
           LEFT JOIN admin_users dc ON dc.id = r.decided_by
          WHERE r.site_id = $1
          ORDER BY r.created_at DESC LIMIT 20",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let brand = crate::brand::published_by_slug(&state.pool)
        .await?
        .remove(&site.slug)
        .unwrap_or(Value::Null);
    let mut site = serde_json::to_value(site).unwrap_or(Value::Null);
    site["brand"] = brand;
    Ok(Json(json!({ "site": site, "status_requests": requests })))
}

#[derive(Deserialize)]
struct SiteInput {
    name: String,
    slug: Option<String>,
    tagline: Option<String>,
    description: Option<String>,
    category: String,
    template: Option<String>,
    primary_domain: Option<String>,
    position: Option<i32>,
    /// Creation only: the launch status to request (needs approval).
    launch_status: Option<String>,
    /// Updates only: the version the editor started from.
    version: Option<i32>,
}

struct ValidSite {
    name: String,
    tagline: Option<String>,
    description: Option<String>,
    category: String,
    template: String,
    primary_domain: Option<String>,
}

pub(crate) fn trimmed(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|v| !v.is_empty()).map(str::to_owned)
}

pub fn slugify(text: &str) -> String {
    let mut out = String::new();
    for c in text.trim().chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_end_matches('-')
        .chars()
        .take(40)
        .collect::<String>()
        .trim_end_matches('-')
        .to_owned()
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 40
        && slug
            .split(['-', '_'])
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

fn valid_domain(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    labels.len() >= 2
        && domain.len() <= 253
        && labels.iter().all(|l| {
            !l.is_empty()
                && l.len() <= 63
                && !l.starts_with('-')
                && !l.ends_with('-')
                && l.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
        && labels
            .last()
            .is_some_and(|tld| tld.len() >= 2 && tld.bytes().all(|b| b.is_ascii_lowercase()))
}

fn validate(input: &SiteInput, corporate: bool) -> Result<ValidSite, ApiError> {
    let mut errors = Vec::new();
    let name = input.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        errors.push(FieldError {
            field: "name",
            code: "length",
            message: "Enter a name of up to 80 characters.",
        });
    }
    let tagline = trimmed(input.tagline.as_deref());
    if tagline.as_ref().is_some_and(|t| t.chars().count() > 160) {
        errors.push(FieldError {
            field: "tagline",
            code: "length",
            message: "Keep the tagline to 160 characters.",
        });
    }
    let description = trimmed(input.description.as_deref());
    if description.as_ref().is_some_and(|d| d.chars().count() > 600) {
        errors.push(FieldError {
            field: "description",
            code: "length",
            message: "Keep the description to 600 characters.",
        });
    }
    let category = input.category.trim().to_owned();
    if !CATEGORIES.contains(&category.as_str()) || (category == "corporate") != corporate {
        errors.push(FieldError {
            field: "category",
            code: "invalid",
            message: "Choose a product category.",
        });
    }
    let template =
        trimmed(input.template.as_deref()).unwrap_or_else(|| default_template(&category).to_owned());
    if !TEMPLATES.contains(&template.as_str()) {
        errors.push(FieldError {
            field: "template",
            code: "invalid",
            message: "Choose a template.",
        });
    }
    let primary_domain = trimmed(input.primary_domain.as_deref()).map(|d| d.to_lowercase());
    if primary_domain.as_deref().is_some_and(|d| !valid_domain(d)) {
        errors.push(FieldError {
            field: "primary_domain",
            code: "invalid",
            message: "Enter a domain such as zirahr.figbudglobal.com (no https://).",
        });
    }
    if errors.is_empty() {
        Ok(ValidSite {
            name,
            tagline,
            description,
            category,
            template,
            primary_domain,
        })
    } else {
        Err(ApiError::Validation(errors))
    }
}

/// Audit entry that names the website it concerns.
pub(crate) async fn audit_site(
    pool: &PgPool,
    session: &AdminSession,
    site_id: Uuid,
    action: &str,
    detail: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail, site_id)
         VALUES ($1, $2, $3, 'site', $4, $5, $4::uuid)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(action)
    .bind(site_id.to_string())
    .bind(detail)
    .execute(pool)
    .await?;
    Ok(())
}

fn unique_violation(err: &sqlx::Error, constraint: &str) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.constraint() == Some(constraint))
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<SiteInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let valid = validate(&input, false)?;
    let slug = trimmed(input.slug.as_deref()).unwrap_or_else(|| slugify(&valid.name).replace('-', "_"));
    if !valid_slug(&slug) {
        return Err(ApiError::Validation(vec![FieldError {
            field: "slug",
            code: "invalid",
            message: "Use lowercase letters, numbers, hyphens or underscores (up to 40).",
        }]));
    }
    let launch = trimmed(input.launch_status.as_deref());
    if launch
        .as_deref()
        .is_some_and(|s| !STATUSES.contains(&s) || !transition_allowed("draft", s))
    {
        return Err(ApiError::BadRequest(
            "launch status must be coming_soon, beta or active",
        ));
    }
    let id = Uuid::now_v7();
    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO sites (id, slug, kind, name, tagline, description, category, template, status, primary_domain,
                            position, created_by, updated_by)
         VALUES ($1, $2, 'product', $3, $4, $5, $6, $7, 'draft', $8,
                 COALESCE($9, (SELECT COALESCE(MAX(position), 0) + 1 FROM sites)), $10, $10)",
    )
    .bind(id)
    .bind(&slug)
    .bind(&valid.name)
    .bind(&valid.tagline)
    .bind(&valid.description)
    .bind(&valid.category)
    .bind(&valid.template)
    .bind(&valid.primary_domain)
    .bind(input.position)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await;
    if let Err(err) = inserted {
        return Err(if unique_violation(&err, "sites_slug_key") {
            ApiError::Validation(vec![FieldError {
                field: "slug",
                code: "taken",
                message: "Another website already uses this identifier.",
            }])
        } else if unique_violation(&err, "sites_primary_domain_key") {
            ApiError::Validation(vec![FieldError {
                field: "primary_domain",
                code: "taken",
                message: "Another website already uses this domain.",
            }])
        } else {
            err.into()
        });
    }
    // A requested launch status waits for a second person (maker-checker).
    if let Some(to) = &launch {
        sqlx::query(
            "INSERT INTO site_status_requests (id, site_id, from_status, to_status, reason, requested_by)
             VALUES ($1, $2, 'draft', $3, 'Launch status chosen when the website was created.', $4)",
        )
        .bind(Uuid::now_v7())
        .bind(id)
        .bind(to)
        .bind(session.user.id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    audit_site(
        &state.pool,
        &session,
        id,
        "site.created",
        json!({ "slug": slug, "launch_status": launch }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(load(&state.pool, &slug).await?)))
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<SiteInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let current = load(&state.pool, &slug).await?;
    let valid = validate(&input, current.kind == "corporate")?;
    let expected = input.version.ok_or(ApiError::BadRequest("version is required"))?;
    let updated: Option<i32> = sqlx::query_scalar(
        "UPDATE sites SET name = $3, tagline = $4, description = $5, category = $6, template = $7, primary_domain = $8,
                position = COALESCE($9, position), version = version + 1, updated_by = $10, updated_at = now()
          WHERE slug = $1 AND version = $2
      RETURNING version",
    )
    .bind(&slug)
    .bind(expected)
    .bind(&valid.name)
    .bind(&valid.tagline)
    .bind(&valid.description)
    .bind(&valid.category)
    .bind(&valid.template)
    .bind(&valid.primary_domain)
    .bind(input.position)
    .bind(session.user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|err| {
        if unique_violation(&err, "sites_primary_domain_key") {
            ApiError::Validation(vec![FieldError { field: "primary_domain", code: "taken", message: "Another website already uses this domain." }])
        } else {
            err.into()
        }
    })?;
    if updated.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed this website after you opened it. Reload to see the latest settings.",
        ));
    }
    let changes = json!({
        "before": { "name": current.name, "tagline": current.tagline, "category": current.category,
                    "template": current.template, "primary_domain": current.primary_domain },
        "after": { "name": valid.name, "tagline": valid.tagline, "category": valid.category,
                   "template": valid.template, "primary_domain": valid.primary_domain },
    });
    audit_site(&state.pool, &session, current.id, "site.updated", changes).await?;
    Ok(Json(load(&state.pool, &slug).await?))
}

async fn archive(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let site = load(&state.pool, &slug).await?;
    if site.kind == "corporate" {
        return Err(ApiError::NotPermitted(
            "The FigBud Global corporate website cannot be archived.",
        ));
    }
    let done = sqlx::query("UPDATE sites SET archived_at = now(), version = version + 1, updated_at = now() WHERE id = $1 AND archived_at IS NULL")
        .bind(site.id)
        .execute(&state.pool)
        .await?;
    if done.rows_affected() == 0 {
        return Err(ApiError::Conflict("This website is already archived."));
    }
    audit_site(&state.pool, &session, site.id, "site.archived", json!({})).await?;
    Ok(Json(load(&state.pool, &slug).await?))
}

async fn restore(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let site = load(&state.pool, &slug).await?;
    let done = sqlx::query("UPDATE sites SET archived_at = NULL, version = version + 1, updated_at = now() WHERE id = $1 AND archived_at IS NOT NULL")
        .bind(site.id)
        .execute(&state.pool)
        .await?;
    if done.rows_affected() == 0 {
        return Err(ApiError::Conflict("This website is not archived."));
    }
    audit_site(&state.pool, &session, site.id, "site.restored", json!({})).await?;
    Ok(Json(load(&state.pool, &slug).await?))
}

#[derive(Deserialize)]
struct StatusInput {
    to_status: String,
    reason: String,
}

async fn request_status(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<StatusInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let site = load(&state.pool, &slug).await?;
    if site.kind == "corporate" {
        return Err(ApiError::NotPermitted("The corporate website is always active."));
    }
    if site.archived_at.is_some() {
        return Err(ApiError::Conflict(
            "Restore this website before changing its status.",
        ));
    }
    let to = input.to_status.trim();
    if !STATUSES.contains(&to) || !transition_allowed(&site.status, to) {
        return Err(ApiError::Validation(vec![FieldError {
            field: "to_status",
            code: "not_allowed",
            message: "That status change isn't available from the current status.",
        }]));
    }
    let reason = input.reason.trim();
    if reason.is_empty() || reason.chars().count() > 500 {
        return Err(ApiError::Validation(vec![FieldError {
            field: "reason",
            code: "length",
            message: "Explain the change in up to 500 characters.",
        }]));
    }
    let id = Uuid::now_v7();
    let inserted = sqlx::query(
        "INSERT INTO site_status_requests (id, site_id, from_status, to_status, reason, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(site.id)
    .bind(&site.status)
    .bind(to)
    .bind(reason)
    .bind(session.user.id)
    .execute(&state.pool)
    .await;
    if let Err(err) = inserted {
        return Err(if unique_violation(&err, "site_status_requests_one_pending") {
            ApiError::Conflict("This website already has a status change waiting for a decision.")
        } else {
            err.into()
        });
    }
    audit_site(
        &state.pool,
        &session,
        site.id,
        "site.status_requested",
        json!({ "from": site.status, "to": to, "reason": reason }),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "from_status": site.status, "to_status": to })),
    ))
}

#[derive(Deserialize, Default)]
struct DecisionInput {
    note: Option<String>,
}

async fn decide(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, id, decision)): Path<(String, Uuid, String)>,
    body: Option<Json<DecisionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let site = load(&state.pool, &slug).await?;
    let note = body.and_then(|b| trimmed(b.0.note.as_deref()));
    if note.as_ref().is_some_and(|n| n.chars().count() > 500) {
        return Err(ApiError::BadRequest("note is too long"));
    }
    let request: Option<(String, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT from_status, to_status, requested_by FROM site_status_requests
          WHERE id = $1 AND site_id = $2 AND decision = 'pending'",
    )
    .bind(id)
    .bind(site.id)
    .fetch_optional(&state.pool)
    .await?;
    let (from, to, requested_by) =
        request.ok_or(ApiError::Conflict("This request has already been decided."))?;
    let own = requested_by == Some(session.user.id);

    let outcome = match decision.as_str() {
        "approve" => {
            if own && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own request (maker-checker).",
                ));
            }
            let mut tx = state.pool.begin().await?;
            // Apply only if the site is still in the status the request started from.
            let applied = sqlx::query(
                "UPDATE sites SET status = $2, version = version + 1, updated_by = $4, updated_at = now()
                  WHERE id = $1 AND status = $3",
            )
            .bind(site.id)
            .bind(&to)
            .bind(&from)
            .bind(session.user.id)
            .execute(&mut *tx)
            .await?;
            if applied.rows_affected() == 0 {
                return Err(ApiError::Conflict(
                    "The website's status changed since this request was made.",
                ));
            }
            mark(&mut tx, id, "approved", &session, &note).await?;
            tx.commit().await?;
            "approved"
        }
        "reject" => {
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, id, "rejected", &session, &note).await?;
            tx.commit().await?;
            "rejected"
        }
        "cancel" => {
            if !own && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "Only the requester or an owner can cancel this request.",
                ));
            }
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, id, "cancelled", &session, &note).await?;
            tx.commit().await?;
            "cancelled"
        }
        _ => return Err(ApiError::NotFound),
    };
    audit_site(
        &state.pool,
        &session,
        site.id,
        &format!("site.status_{outcome}"),
        json!({ "request": id, "from": from, "to": to, "self_approved": own && outcome == "approved", "note": note }),
    )
    .await?;
    Ok(Json(load(&state.pool, &slug).await?))
}

async fn mark(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: Uuid,
    decision: &str,
    session: &AdminSession,
    note: &Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE site_status_requests SET decision = $2, decided_by = $3, decision_note = $4, decided_at = now()
          WHERE id = $1 AND decision = 'pending'",
    )
    .bind(id)
    .bind(decision)
    .bind(session.user.id)
    .bind(note)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_moves_follow_the_published_table() {
        assert!(transition_allowed("draft", "coming_soon"));
        assert!(transition_allowed("coming_soon", "active"));
        assert!(transition_allowed("active", "retired"));
        assert!(transition_allowed("retired", "coming_soon"));
        assert!(!transition_allowed("retired", "active"), "re-announce first");
        assert!(!transition_allowed("active", "draft"));
        assert!(!transition_allowed("beta", "beta"));
    }

    #[test]
    fn each_status_implies_one_call_to_action() {
        assert_eq!(cta_for("coming_soon"), Some("waitlist"));
        assert_eq!(cta_for("beta"), Some("early_access"));
        assert_eq!(cta_for("active"), Some("demo"));
        assert_eq!(cta_for("retired"), None);
    }

    #[test]
    fn slugs_and_domains_are_validated() {
        assert_eq!(slugify("  Pay Flow 360! "), "pay-flow-360");
        assert!(valid_slug("expense_now") && valid_slug("pay-flow"));
        assert!(!valid_slug("Pay") && !valid_slug("a__b") && !valid_slug("-a"));
        assert!(valid_domain("zirahr.figbudglobal.com"));
        assert!(!valid_domain("https://x.com") && !valid_domain("localhost") && !valid_domain("-a.com"));
    }
}
