//! Enquiries inbox (admin): review and follow up website enquiries.
//!
//! - Viewers and up read the inbox; editors and up change an enquiry's status
//!   (new → contacted → qualified → closed, or spam).
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
const STATUSES: [&str; 5] = ["new", "contacted", "qualified", "closed", "spam"];
const KINDS: [&str; 6] = [
    "demo_request",
    "contact",
    "early_access",
    "waitlist",
    "partnership",
    "sales",
];
const PRODUCTS: [&str; 5] = ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"];
const EXPORT_LIMIT: i64 = 10_000;

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/enquiries", get(list))
        .route("/v1/admin/enquiries/export", get(export))
        .route("/v1/admin/enquiries/{id}", get(read))
        .route("/v1/admin/enquiries/{id}/status", post(set_status))
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
                locale, source_path, status, is_spam, created_at, updated_at
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
    Ok(Json(
        json!({ "enquiry": detail, "emails": emails, "history": history }),
    ))
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
