//! Customers & proof (P10-T1..T3): Trusted By organisations, testimonials and
//! verified success metrics, managed once in the Studio (Content & Marketing)
//! and shown on any number of websites without copies.
//!
//! - Records live with the corporate website (their logos and photos come
//!   from its media library). Editors need the corporate website and every
//!   website a record targets; they save drafts and ask for approval.
//! - Reviewers publish (maker-checker: not their own request, unless owner),
//!   unpublish, hide (active) and order. Every publication is versioned and
//!   every change audited.
//! - Publishing is refused without recorded permission (organisations,
//!   testimonials) or a source, a measurement period and verification
//!   (metrics). Nothing is ever invented by the API: it only shows what
//!   people entered and approved.
//! - Websites read published, active records for their own slug
//!   (`GET /v1/sites/{slug}/proof`).

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role, audit},
    enquiry::country_id,
    error::{ApiError, FieldError},
    privacy::valid_link,
    routes::SharedState,
};

pub const KINDS: [&str; 3] = ["organization", "testimonial", "metric"];

// ------------------------------------------------------------- documents

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Relationship {
    #[default]
    Customer,
    Partner,
    Technology,
    Other,
}

/// Who agreed that the organisation may be shown, and where that's recorded.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct DisplayPermission {
    /// The relationship (customer, partner…) has been confirmed with them.
    pub relationship_confirmed: bool,
    /// They approved showing their name and logo publicly.
    pub display_approved: bool,
    /// Where the approval is recorded (e.g. "Email from J. Doe, 12 Oct 2026").
    pub evidence: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Organization {
    pub name: String,
    pub relationship: Relationship,
    pub website: Option<String>,
    pub description: Option<String>,
    /// Logo and small icon from the corporate media library.
    pub logo_id: Option<Uuid>,
    pub favicon_id: Option<Uuid>,
    pub permission: DisplayPermission,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct TestimonialPermission {
    pub quote_approved: bool,
    /// Needed when the person's name (and title) is shown.
    pub name_approved: bool,
    /// Needed when a photograph is shown.
    pub photo_approved: bool,
    pub evidence: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Testimonial {
    pub quote: String,
    /// A Trusted By organisation (name and logo), or just a name.
    pub organization_id: Option<Uuid>,
    pub organization_name: Option<String>,
    pub person_name: Option<String>,
    pub person_title: Option<String>,
    pub photo_id: Option<Uuid>,
    /// The product it's about (website slug), for its accent.
    pub product: Option<String>,
    pub industry: Option<String>,
    /// ISO 3166-1 alpha-2.
    pub country: Option<String>,
    pub permission: TestimonialPermission,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MetricFormat {
    #[default]
    Number,
    Currency,
    Percent,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Metric {
    pub label: String,
    pub value: f64,
    pub format: MetricFormat,
    /// ISO 4217 code for currency figures (e.g. KES).
    pub currency: Option<String>,
    /// Compact notation (1.2M).
    pub compact: bool,
    pub decimals: u8,
    /// Short marks around the number, e.g. ">" or "+".
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    /// Where the figure comes from, and the period it measures (shown publicly).
    pub source: String,
    pub period: String,
    /// A reviewer checked the figure against its source.
    pub verified: bool,
}

/// One record's content, by kind.
#[derive(Clone, Debug, PartialEq)]
pub enum ProofDoc {
    Organization(Organization),
    Testimonial(Testimonial),
    Metric(Metric),
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

fn tidy(value: &mut Option<String>) {
    *value = value
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
}

fn too_long(value: &Option<String>, max: usize) -> bool {
    value.as_ref().is_some_and(|v| v.chars().count() > max)
}

impl ProofDoc {
    pub fn decode(kind: &str, value: Value) -> Result<Self, ApiError> {
        let bad = |_| {
            ApiError::Validation(vec![field(
                "document",
                "invalid",
                "That content isn't in the expected shape.",
            )])
        };
        Ok(match kind {
            "organization" => Self::Organization(serde_json::from_value(value).map_err(bad)?),
            "testimonial" => Self::Testimonial(serde_json::from_value(value).map_err(bad)?),
            "metric" => Self::Metric(serde_json::from_value(value).map_err(bad)?),
            _ => return Err(ApiError::BadRequest("unknown kind")),
        })
    }

    /// A new, empty record of this kind.
    pub fn template(kind: &str) -> Option<Self> {
        Some(match kind {
            "organization" => Self::Organization(Organization::default()),
            "testimonial" => Self::Testimonial(Testimonial::default()),
            "metric" => Self::Metric(Metric::default()),
            _ => return None,
        })
    }

    pub fn to_value(&self) -> Value {
        match self {
            Self::Organization(o) => serde_json::to_value(o),
            Self::Testimonial(t) => serde_json::to_value(t),
            Self::Metric(m) => serde_json::to_value(m),
        }
        .unwrap_or(Value::Null)
    }

    /// A short name for lists and the audit log.
    pub fn title(&self) -> String {
        let text = match self {
            Self::Organization(o) => o.name.clone(),
            Self::Testimonial(t) => t.quote.clone(),
            Self::Metric(m) => m.label.clone(),
        };
        let mut short: String = text.chars().take(80).collect();
        if text.chars().count() > 80 {
            short.push('…');
        }
        short
    }

    /// Media library images it uses.
    pub fn image_ids(&self) -> Vec<Uuid> {
        match self {
            Self::Organization(o) => o.logo_id.into_iter().chain(o.favicon_id).collect(),
            Self::Testimonial(t) => t.photo_id.into_iter().collect(),
            Self::Metric(_) => Vec::new(),
        }
    }

    /// Tidies a draft and checks what's entered (drafts may be incomplete).
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut e = Vec::new();
        match &mut self {
            Self::Organization(o) => {
                o.name = o.name.trim().to_owned();
                tidy(&mut o.website);
                tidy(&mut o.description);
                o.permission.evidence = o.permission.evidence.trim().to_owned();
                if o.name.chars().count() > 120 {
                    e.push(field("name", "length", "Up to 120 characters."));
                }
                if o.website
                    .as_deref()
                    .is_some_and(|w| !w.starts_with("https://") || !valid_link(w))
                {
                    e.push(field(
                        "website",
                        "format",
                        "Use the organisation's https:// address.",
                    ));
                }
                if too_long(&o.description, 300) {
                    e.push(field("description", "length", "Up to 300 characters."));
                }
                if o.permission.evidence.chars().count() > 300 {
                    e.push(field("permission.evidence", "length", "Up to 300 characters."));
                }
            }
            Self::Testimonial(t) => {
                t.quote = t.quote.trim().to_owned();
                for value in [
                    &mut t.organization_name,
                    &mut t.person_name,
                    &mut t.person_title,
                    &mut t.product,
                    &mut t.industry,
                    &mut t.country,
                ] {
                    tidy(value);
                }
                t.country = t.country.as_deref().map(str::to_ascii_uppercase);
                t.permission.evidence = t.permission.evidence.trim().to_owned();
                if t.quote.chars().count() > 600 {
                    e.push(field("quote", "length", "Up to 600 characters."));
                }
                if too_long(&t.organization_name, 120) || too_long(&t.person_name, 80) {
                    e.push(field(
                        "person_name",
                        "length",
                        "Names are up to 80 characters (organisations 120).",
                    ));
                }
                if too_long(&t.person_title, 80) || too_long(&t.industry, 60) {
                    e.push(field(
                        "person_title",
                        "length",
                        "Titles are up to 80 characters, industries 60.",
                    ));
                }
                if t.country.as_deref().is_some_and(|c| country_id(c).is_none()) {
                    e.push(field("country", "format", "Choose a country from the list."));
                }
                if t.permission.evidence.chars().count() > 300 {
                    e.push(field("permission.evidence", "length", "Up to 300 characters."));
                }
            }
            Self::Metric(m) => {
                m.label = m.label.trim().to_owned();
                m.source = m.source.trim().to_owned();
                m.period = m.period.trim().to_owned();
                tidy(&mut m.currency);
                tidy(&mut m.prefix);
                tidy(&mut m.suffix);
                m.currency = m.currency.as_deref().map(str::to_ascii_uppercase);
                if m.label.chars().count() > 60 {
                    e.push(field("label", "length", "Up to 60 characters."));
                }
                if !m.value.is_finite() || m.value < 0.0 || m.value > 1e15 {
                    e.push(field("value", "range", "Enter a figure of zero or more."));
                }
                if m.decimals > 2 {
                    e.push(field("decimals", "range", "Up to 2 decimals."));
                }
                if m.format == MetricFormat::Currency
                    && !m
                        .currency
                        .as_deref()
                        .is_some_and(|c| c.len() == 3 && c.bytes().all(|b| b.is_ascii_uppercase()))
                {
                    e.push(field(
                        "currency",
                        "format",
                        "Use a three-letter currency code such as KES.",
                    ));
                }
                if m.format != MetricFormat::Currency {
                    m.currency = None;
                }
                if too_long(&m.prefix, 4) || too_long(&m.suffix, 8) {
                    e.push(field(
                        "suffix",
                        "length",
                        "Marks are short: up to 4 characters before, 8 after.",
                    ));
                }
                if m.source.chars().count() > 200 || m.period.chars().count() > 80 {
                    e.push(field(
                        "source",
                        "length",
                        "Sources are up to 200 characters, periods 80.",
                    ));
                }
            }
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    /// What must be true before anything is shown publicly.
    pub fn publish_errors(&self) -> Vec<FieldError> {
        let mut e = Vec::new();
        match self {
            Self::Organization(o) => {
                if o.name.is_empty() {
                    e.push(field("name", "required", "Name the organisation."));
                }
                if o.logo_id.is_none() {
                    e.push(field(
                        "logo_id",
                        "required",
                        "Add the organisation's approved logo.",
                    ));
                }
                if !o.permission.relationship_confirmed || !o.permission.display_approved {
                    e.push(field(
                        "permission",
                        "required",
                        "Confirm the relationship and their approval to be shown publicly.",
                    ));
                }
                if o.permission.evidence.is_empty() {
                    e.push(field(
                        "permission.evidence",
                        "required",
                        "Record where the approval is kept.",
                    ));
                }
            }
            Self::Testimonial(t) => {
                if t.quote.chars().count() < 20 {
                    e.push(field(
                        "quote",
                        "required",
                        "Add the approved quotation (at least 20 characters).",
                    ));
                }
                if t.organization_id.is_none() && t.organization_name.is_none() && t.person_name.is_none() {
                    e.push(field(
                        "person_name",
                        "required",
                        "Attribute it to a person or an organisation.",
                    ));
                }
                if !t.permission.quote_approved {
                    e.push(field(
                        "permission",
                        "required",
                        "Confirm the customer approved this quotation for publication.",
                    ));
                }
                if t.person_name.is_some() && !t.permission.name_approved {
                    e.push(field(
                        "permission",
                        "name",
                        "Confirm the person approved showing their name.",
                    ));
                }
                if t.photo_id.is_some() && !t.permission.photo_approved {
                    e.push(field(
                        "permission",
                        "photo",
                        "Confirm the person approved showing their photograph.",
                    ));
                }
                if t.permission.evidence.is_empty() {
                    e.push(field(
                        "permission.evidence",
                        "required",
                        "Record where the approval is kept.",
                    ));
                }
            }
            Self::Metric(m) => {
                if m.label.is_empty() {
                    e.push(field("label", "required", "Name what the figure measures."));
                }
                if m.source.chars().count() < 3 || m.period.chars().count() < 3 {
                    e.push(field(
                        "source",
                        "required",
                        "Every published figure needs its source and measurement period.",
                    ));
                }
                if !m.verified {
                    e.push(field(
                        "verified",
                        "required",
                        "Confirm the figure was checked against its source.",
                    ));
                }
            }
        }
        e
    }

    /// What websites receive: no permission evidence or internal notes.
    pub fn public(&self) -> Value {
        match self {
            Self::Organization(o) => json!({
                "name": o.name,
                "relationship": o.relationship,
                "website": o.website,
                "description": o.description,
                "logo_id": o.logo_id,
            }),
            Self::Testimonial(t) => json!({
                "quote": t.quote,
                "organization_id": t.organization_id,
                "organization_name": t.organization_name,
                "person_name": t.person_name,
                "person_title": t.person_name.as_ref().and(t.person_title.as_ref()),
                "photo_id": t.photo_id,
                "product": t.product,
                "industry": t.industry,
                "country": t.country,
            }),
            Self::Metric(m) => json!({
                "label": m.label,
                "value": m.value,
                "format": m.format,
                "currency": m.currency,
                "compact": m.compact,
                "decimals": m.decimals,
                "prefix": m.prefix,
                "suffix": m.suffix,
                "source": m.source,
                "period": m.period,
            }),
        }
    }
}

/// Website slugs: tidied, unique, sorted.
fn tidy_sites(sites: &[String]) -> Vec<String> {
    let mut out: Vec<String> = sites
        .iter()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .collect();
    out.sort();
    out.dedup();
    out
}

// ---------------------------------------------------------------- routes

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/proof", get(public_proof))
        .route("/v1/admin/proof", get(list).post(create))
        .route("/v1/admin/proof/{id}", get(read))
        .route("/v1/admin/proof/{id}/draft", post(save_draft))
        .route("/v1/admin/proof/{id}/{action}", post(action))
}

#[derive(FromRow)]
struct Row {
    id: Uuid,
    kind: String,
    draft: Value,
    draft_sites: Vec<String>,
    draft_version: i32,
    draft_updated_at: DateTime<Utc>,
    published: Option<Value>,
    published_sites: Vec<String>,
    published_number: i32,
    published_at: Option<DateTime<Utc>>,
    review_requested_by: Option<Uuid>,
    review_requested_at: Option<DateTime<Utc>>,
    review_note: Option<String>,
    active: bool,
    sort_order: i32,
    archived_at: Option<DateTime<Utc>>,
}

macro_rules! columns {
    () => {
        "id, kind, draft, draft_sites, draft_version, draft_updated_at, published, published_sites,
    published_number, published_at, review_requested_by, review_requested_at, review_note, active, sort_order, archived_at"
    };
}

impl Row {
    /// Where the record stands, for the Studio.
    fn status(&self) -> &'static str {
        if self.archived_at.is_some() {
            "archived"
        } else if self.review_requested_at.is_some() {
            "in_review"
        } else if self.published.is_none() {
            if self.published_number > 0 {
                "unpublished"
            } else {
                "draft"
            }
        } else if self.published.as_ref() != Some(&self.draft) || self.published_sites != self.draft_sites {
            "changes_pending"
        } else {
            "published"
        }
    }

    fn summary(&self) -> Value {
        let title = ProofDoc::decode(&self.kind, self.draft.clone())
            .map(|d| d.title())
            .unwrap_or_default();
        json!({
            "id": self.id,
            "kind": self.kind,
            "title": title,
            "status": self.status(),
            "active": self.active,
            "sort_order": self.sort_order,
            "sites": self.draft_sites,
            "published_sites": self.published_sites,
            "published_at": self.published_at,
            "updated_at": self.draft_updated_at,
        })
    }
}

async fn load(pool: &PgPool, id: Uuid) -> Result<Row, ApiError> {
    sqlx::query_as::<_, Row>(concat!("SELECT ", columns!(), " FROM proof_items WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

/// Records live with the corporate website; working on one also needs every website it targets.
fn require_sites(session: &AdminSession, sites: &[String], role: Role) -> Result<(), ApiError> {
    session.require(role)?;
    session.require_corporate(role)?;
    for slug in sites {
        match session.slug_role(slug) {
            None => {
                return Err(ApiError::NotPermitted(
                    "You don't have access to every website this record is shown on.",
                ));
            }
            Some(have) if have < role => return Err(ApiError::Forbidden),
            Some(_) => {}
        }
    }
    Ok(())
}

async fn audit_proof(
    pool: &PgPool,
    session: &AdminSession,
    id: Uuid,
    action: &str,
    detail: Value,
) -> Result<(), ApiError> {
    audit(
        pool,
        Some(session.user.id),
        action,
        Some(("proof", id.to_string())),
        detail,
        None,
    )
    .await?;
    Ok(())
}

/// Checks targets are real websites and images come from the corporate media library.
async fn check_refs(pool: &PgPool, doc: &ProofDoc, sites: &[String]) -> Result<(), ApiError> {
    let mut errors = Vec::new();
    if !sites.is_empty() {
        let found: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sites WHERE slug = ANY($1) AND archived_at IS NULL")
                .bind(sites)
                .fetch_one(pool)
                .await?;
        if found as usize != sites.len() {
            errors.push(field("sites", "invalid", "Choose websites from the list."));
        }
    }
    let images = doc.image_ids();
    if !images.is_empty() {
        let found: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM media_assets m JOIN sites s ON s.id = m.site_id
              WHERE s.slug = 'figbud' AND m.id = ANY($1) AND m.archived_at IS NULL",
        )
        .bind(&images)
        .fetch_one(pool)
        .await?;
        if found as usize != images.len() {
            errors.push(field(
                "logo_id",
                "image",
                "Choose images from the FigBud Global media library.",
            ));
        }
    }
    if let ProofDoc::Testimonial(t) = doc {
        if let Some(org) = t.organization_id {
            let ok: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM proof_items WHERE id = $1 AND kind = 'organization' AND archived_at IS NULL)",
            )
            .bind(org)
            .fetch_one(pool)
            .await?;
            if !ok {
                errors.push(field(
                    "organization_id",
                    "invalid",
                    "Choose an organisation from Trusted By.",
                ));
            }
        }
        if let Some(product) = &t.product {
            let ok: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM sites WHERE slug = $1 AND kind = 'product')",
            )
            .bind(product)
            .fetch_one(pool)
            .await?;
            if !ok {
                errors.push(field("product", "invalid", "Choose a product from the list."));
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(ApiError::Validation(errors))
    }
}

#[derive(Deserialize)]
struct ListQuery {
    kind: Option<String>,
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(q): Query<ListQuery>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    session.require_corporate(Role::Viewer)?;
    let rows: Vec<Row> = sqlx::query_as(concat!(
        "SELECT ",
        columns!(),
        " FROM proof_items WHERE ($1::text IS NULL OR kind = $1)
          ORDER BY archived_at IS NOT NULL, kind, sort_order, created_at"
    ))
    .bind(q.kind.as_deref())
    .fetch_all(&state.pool)
    .await?;
    let items: Vec<Value> = rows.iter().map(Row::summary).collect();
    Ok(Json(
        json!({ "items": items, "can_edit": session.require_corporate(Role::Editor).is_ok(),
        "can_review": session.require_corporate(Role::Reviewer).is_ok() }),
    ))
}

#[derive(Deserialize)]
struct CreateInput {
    kind: String,
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<CreateInput>,
) -> Result<impl IntoResponse, ApiError> {
    require_sites(&session, &[], Role::Editor)?;
    let doc = ProofDoc::template(&input.kind).ok_or(ApiError::BadRequest("unknown kind"))?;
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO proof_items (id, kind, draft, draft_updated_by, created_by) VALUES ($1, $2, $3, $4, $4)",
    )
    .bind(id)
    .bind(&input.kind)
    .bind(doc.to_value())
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit_proof(
        &state.pool,
        &session,
        id,
        "proof.created",
        json!({ "kind": input.kind }),
    )
    .await?;
    Ok(Json(json!({ "id": id })))
}

/// An approved version, for the history.
#[derive(FromRow, Serialize)]
struct Version {
    number: i32,
    note: String,
    sites: Vec<String>,
    requested_by: Option<String>,
    published_by: Option<String>,
    created_at: DateTime<Utc>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    session.require_corporate(Role::Viewer)?;
    let row = load(&state.pool, id).await?;
    let versions: Vec<Version> = sqlx::query_as(
        "SELECT v.number, v.note, v.sites, rq.name AS requested_by, pb.name AS published_by, v.created_at FROM proof_versions v
           LEFT JOIN admin_users rq ON rq.id = v.requested_by
           LEFT JOIN admin_users pb ON pb.id = v.published_by
          WHERE v.item_id = $1 ORDER BY v.number DESC LIMIT 50",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let requested_by: Option<String> = match row.review_requested_by {
        Some(user) => {
            sqlx::query_scalar("SELECT name FROM admin_users WHERE id = $1")
                .bind(user)
                .fetch_optional(&state.pool)
                .await?
        }
        None => None,
    };
    let publish_errors = ProofDoc::decode(&row.kind, row.draft.clone())
        .map(|d| d.publish_errors())
        .unwrap_or_default();
    let mut summary = row.summary();
    summary["draft"] = row.draft.clone();
    summary["draft_version"] = json!(row.draft_version);
    summary["published"] = row.published.clone().unwrap_or(Value::Null);
    summary["published_number"] = json!(row.published_number);
    summary["review"] = match row.review_requested_at {
        Some(at) => json!({ "requested_at": at, "requested_by": requested_by, "note": row.review_note,
            "own": row.review_requested_by == Some(session.user.id) }),
        None => Value::Null,
    };
    summary["publish_errors"] = json!(publish_errors);
    summary["versions"] = json!(versions);
    summary["can_edit"] = json!(require_sites(&session, &row.draft_sites, Role::Editor).is_ok());
    summary["can_review"] = json!(require_sites(&session, &row.draft_sites, Role::Reviewer).is_ok());
    Ok(Json(summary))
}

#[derive(Deserialize)]
struct DraftInput {
    document: Value,
    sites: Vec<String>,
    version: i32,
}

/// Saving a draft never changes what websites show.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    let row = load(&state.pool, id).await?;
    let sites = tidy_sites(&input.sites);
    require_sites(&session, &row.draft_sites, Role::Editor)?;
    require_sites(&session, &sites, Role::Editor)?;
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this record before editing it."));
    }
    let doc = ProofDoc::decode(&row.kind, input.document)?
        .normalise()
        .map_err(ApiError::Validation)?;
    check_refs(&state.pool, &doc, &sites).await?;
    let value = doc.to_value();
    let changed = value != row.draft || sites != row.draft_sites;
    let version: Option<i32> = sqlx::query_scalar(
        "UPDATE proof_items SET draft = $3, draft_sites = $4, draft_version = draft_version + 1,
                draft_updated_by = $5, draft_updated_at = now(),
                -- A changed draft needs a new request: approval covers what was asked for.
                review_requested_by = CASE WHEN $6 THEN NULL ELSE review_requested_by END,
                review_requested_at = CASE WHEN $6 THEN NULL ELSE review_requested_at END,
                review_note = CASE WHEN $6 THEN NULL ELSE review_note END
          WHERE id = $1 AND draft_version = $2 RETURNING draft_version",
    )
    .bind(id)
    .bind(input.version)
    .bind(&value)
    .bind(&sites)
    .bind(session.user.id)
    .bind(changed)
    .fetch_optional(&state.pool)
    .await?;
    let version = version.ok_or(ApiError::Conflict(
        "Someone else saved this record meanwhile. Reload to see their changes.",
    ))?;
    if changed {
        audit_proof(
            &state.pool,
            &session,
            id,
            "proof.draft_saved",
            json!({ "kind": row.kind, "title": doc.title(), "sites": sites }),
        )
        .await?;
    }
    Ok(Json(
        json!({ "version": version, "publish_errors": doc.publish_errors() }),
    ))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ActionInput {
    note: Option<String>,
    active: Option<bool>,
    sort_order: Option<i32>,
}

async fn action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
    body: Option<Json<ActionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    let input = body.map(|Json(b)| b).unwrap_or_default();
    let row = load(&state.pool, id).await?;
    let pool = &state.pool;
    let note = input.note.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::Validation(vec![field(
            "note",
            "length",
            "Notes are up to 300 characters.",
        )]));
    }
    let all_sites: Vec<String> = tidy_sites(&[row.draft_sites.clone(), row.published_sites.clone()].concat());
    let doc = ProofDoc::decode(&row.kind, row.draft.clone())?;
    let detail = json!({ "kind": row.kind, "title": doc.title() });
    match action.as_str() {
        "submit" => {
            require_sites(&session, &all_sites, Role::Editor)?;
            if row.archived_at.is_some() {
                return Err(ApiError::Conflict("Restore this record first."));
            }
            if row.status() == "published" {
                return Err(ApiError::Conflict("Nothing has changed since it was published."));
            }
            let mut errors = doc.publish_errors();
            if row.draft_sites.is_empty() {
                errors.push(field(
                    "sites",
                    "required",
                    "Choose at least one website to show it on.",
                ));
            }
            if !errors.is_empty() {
                return Err(ApiError::Validation(errors));
            }
            sqlx::query(
                "UPDATE proof_items SET review_requested_by = $2, review_requested_at = now(), review_note = $3 WHERE id = $1",
            )
            .bind(id)
            .bind(session.user.id)
            .bind(note)
            .execute(pool)
            .await?;
            audit_proof(pool, &session, id, "proof.submitted", detail).await?;
        }
        "publish" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("Ask for approval first."));
            }
            if row.review_requested_by == Some(session.user.id) && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own request (maker-checker).",
                ));
            }
            let mut errors = doc.publish_errors();
            if row.draft_sites.is_empty() {
                errors.push(field(
                    "sites",
                    "required",
                    "Choose at least one website to show it on.",
                ));
            }
            if !errors.is_empty() {
                return Err(ApiError::Validation(errors));
            }
            // A testimonial carries its organisation's published name at the time of approval.
            let mut snapshot = row.draft.clone();
            if let ProofDoc::Testimonial(t) = &doc
                && let Some(org) = t.organization_id
            {
                let name: Option<String> = sqlx::query_scalar(
                        "SELECT published->>'name' FROM proof_items WHERE id = $1 AND published IS NOT NULL AND archived_at IS NULL",
                    )
                    .bind(org)
                    .fetch_optional(pool)
                    .await?
                    .flatten();
                let Some(name) = name else {
                    return Err(ApiError::Validation(vec![field(
                        "organization_id",
                        "unpublished",
                        "Publish the organisation in Trusted By first.",
                    )]));
                };
                snapshot["organization_name"] = json!(name);
            }
            let number = row.published_number + 1;
            let mut tx = pool.begin().await?;
            sqlx::query(
                "UPDATE proof_items SET published = $2, published_sites = draft_sites, published_number = $3,
                        published_by = $4, published_at = now(),
                        review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
                  WHERE id = $1",
            )
            .bind(id)
            .bind(&snapshot)
            .bind(number)
            .bind(session.user.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO proof_versions (id, item_id, number, document, sites, note, requested_by, published_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(Uuid::now_v7())
            .bind(id)
            .bind(number)
            .bind(&snapshot)
            .bind(&row.draft_sites)
            .bind(note.or(row.review_note.as_deref()).unwrap_or("Approved"))
            .bind(row.review_requested_by)
            .bind(session.user.id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            audit_proof(
                pool,
                &session,
                id,
                "proof.published",
                json!({ "kind": row.kind, "title": doc.title(),
                "version": number, "sites": row.draft_sites, "before_sites": row.published_sites }),
            )
            .await?;
        }
        "reject" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("There's no request to decline."));
            }
            sqlx::query("UPDATE proof_items SET review_requested_by = NULL, review_requested_at = NULL, review_note = NULL WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            audit_proof(
                pool,
                &session,
                id,
                "proof.rejected",
                json!({ "kind": row.kind, "title": doc.title(), "note": note }),
            )
            .await?;
        }
        "unpublish" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            if row.published.is_none() {
                return Err(ApiError::Conflict("It isn't published."));
            }
            sqlx::query("UPDATE proof_items SET published = NULL, published_sites = '{}' WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            audit_proof(
                pool,
                &session,
                id,
                "proof.unpublished",
                json!({ "kind": row.kind, "title": doc.title(), "sites": row.published_sites }),
            )
            .await?;
        }
        "settings" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            let active = input.active.unwrap_or(row.active);
            let order = input.sort_order.unwrap_or(row.sort_order);
            if !(0..=9999).contains(&order) {
                return Err(ApiError::Validation(vec![field(
                    "sort_order",
                    "range",
                    "Use an order from 0 to 9999.",
                )]));
            }
            sqlx::query("UPDATE proof_items SET active = $2, sort_order = $3 WHERE id = $1")
                .bind(id)
                .bind(active)
                .bind(order)
                .execute(pool)
                .await?;
            audit_proof(
                pool,
                &session,
                id,
                "proof.settings_changed",
                json!({ "kind": row.kind, "title": doc.title(),
                "before": { "active": row.active, "sort_order": row.sort_order },
                "after": { "active": active, "sort_order": order } }),
            )
            .await?;
        }
        "archive" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            if row.published.is_some() {
                return Err(ApiError::Conflict("Unpublish it before archiving."));
            }
            if row.kind == "organization" {
                let used: bool = sqlx::query_scalar(
                    "SELECT EXISTS (SELECT 1 FROM proof_items WHERE kind = 'testimonial' AND archived_at IS NULL
                        AND (draft->>'organization_id' = $1::text OR published->>'organization_id' = $1::text))",
                )
                .bind(id)
                .fetch_one(pool)
                .await?;
                if used {
                    return Err(ApiError::Conflict("A testimonial uses this organisation."));
                }
            }
            sqlx::query("UPDATE proof_items SET archived_at = now(), review_requested_by = NULL, review_requested_at = NULL WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            audit_proof(pool, &session, id, "proof.archived", detail).await?;
        }
        "restore" => {
            require_sites(&session, &all_sites, Role::Reviewer)?;
            sqlx::query("UPDATE proof_items SET archived_at = NULL WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            audit_proof(pool, &session, id, "proof.restored", detail).await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    let row = load(pool, id).await?;
    Ok(Json(row.summary()))
}

// ---------------------------------------------------------------- public

async fn media(pool: &PgPool, id: Option<Uuid>) -> Result<Value, sqlx::Error> {
    let Some(id) = id else { return Ok(Value::Null) };
    let found: Option<(String, i32, i32)> = sqlx::query_as(
        "SELECT alt_text, width, height FROM media_assets WHERE id = $1 AND archived_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(found.map_or(
        Value::Null,
        |(alt, width, height)| json!({ "id": id, "alt": alt, "width": width, "height": height }),
    ))
}

/// A website's published, active organisations, testimonials and metrics, in order.
async fn public_proof(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let pool = &state.pool;
    let rows: Vec<(Uuid, String, Value)> = sqlx::query_as(
        "SELECT p.id, p.kind, p.published FROM proof_items p
          WHERE p.published IS NOT NULL AND p.active AND p.archived_at IS NULL AND $1 = ANY (p.published_sites)
            AND EXISTS (SELECT 1 FROM sites s WHERE s.slug = $1 AND s.archived_at IS NULL)
          ORDER BY p.sort_order, p.published_at DESC",
    )
    .bind(&slug)
    .fetch_all(pool)
    .await?;
    let (mut organizations, mut testimonials, mut metrics) = (Vec::new(), Vec::new(), Vec::new());
    for (id, kind, published) in rows {
        let Ok(doc) = ProofDoc::decode(&kind, published) else {
            continue;
        };
        let mut value = doc.public();
        value["id"] = json!(id);
        match &doc {
            ProofDoc::Organization(o) => {
                value["logo"] = media(pool, o.logo_id).await?;
                organizations.push(value);
            }
            ProofDoc::Testimonial(t) => {
                // The organisation's logo, while it's published and active.
                value["organization_logo"] = match t.organization_id {
                    Some(org) => {
                        let logo: Option<Option<String>> = sqlx::query_scalar(
                            "SELECT published->>'logo_id' FROM proof_items
                              WHERE id = $1 AND published IS NOT NULL AND active AND archived_at IS NULL",
                        )
                        .bind(org)
                        .fetch_optional(pool)
                        .await?;
                        media(pool, logo.flatten().and_then(|l| Uuid::parse_str(&l).ok())).await?
                    }
                    None => Value::Null,
                };
                value["photo"] = media(pool, t.photo_id).await?;
                testimonials.push(value);
            }
            ProofDoc::Metric(_) => metrics.push(value),
        }
    }
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        )],
        Json(json!({ "organizations": organizations, "testimonials": testimonials, "metrics": metrics })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn org() -> Organization {
        Organization {
            name: "  Example Credit ".into(),
            relationship: Relationship::Customer,
            website: Some("https://example.com".into()),
            logo_id: Some(Uuid::nil()),
            permission: DisplayPermission {
                relationship_confirmed: true,
                display_approved: true,
                evidence: "Signed consent, 12 Oct 2026".into(),
            },
            ..Organization::default()
        }
    }

    #[test]
    fn organisations_need_recorded_permission_to_be_published() {
        let ok = ProofDoc::Organization(org()).normalise().unwrap();
        assert!(ok.publish_errors().is_empty());
        let ProofDoc::Organization(o) = &ok else {
            unreachable!()
        };
        assert_eq!(o.name, "Example Credit");

        let mut unconfirmed = org();
        unconfirmed.permission.display_approved = false;
        unconfirmed.permission.evidence.clear();
        let codes: Vec<_> = ProofDoc::Organization(unconfirmed)
            .publish_errors()
            .iter()
            .map(|e| e.field)
            .collect();
        assert_eq!(codes, ["permission", "permission.evidence"]);

        let mut bad = org();
        bad.website = Some("http://example.com".into());
        assert_eq!(
            ProofDoc::Organization(bad).normalise().unwrap_err()[0].field,
            "website"
        );
    }

    #[test]
    fn testimonials_need_approval_for_the_quote_name_and_photo() {
        let t = Testimonial {
            quote: "It changed how we run payroll every month.".into(),
            person_name: Some("A. Person".into()),
            photo_id: Some(Uuid::nil()),
            permission: TestimonialPermission {
                quote_approved: true,
                evidence: "Email, 3 Oct 2026".into(),
                ..TestimonialPermission::default()
            },
            ..Testimonial::default()
        };
        let codes: Vec<_> = ProofDoc::Testimonial(t.clone())
            .publish_errors()
            .iter()
            .map(|e| e.code)
            .collect();
        assert_eq!(codes, ["name", "photo"]);
        // Titles are only shown with an approved name.
        let mut anonymous = t;
        anonymous.person_name = None;
        anonymous.person_title = Some("CFO".into());
        anonymous.organization_name = Some("Example Credit".into());
        assert_eq!(
            ProofDoc::Testimonial(anonymous).public()["person_title"],
            Value::Null
        );
    }

    #[test]
    fn metrics_need_a_source_a_period_and_verification() {
        let m = Metric {
            label: "Payroll processed".into(),
            value: 200_000_000.0,
            format: MetricFormat::Currency,
            currency: Some("kes".into()),
            compact: true,
            suffix: Some("+".into()),
            ..Metric::default()
        };
        let tidy = ProofDoc::Metric(m.clone()).normalise().unwrap();
        let ProofDoc::Metric(t) = &tidy else {
            unreachable!()
        };
        assert_eq!(t.currency.as_deref(), Some("KES"));
        let fields: Vec<_> = tidy.publish_errors().iter().map(|e| e.field).collect();
        assert_eq!(fields, ["source", "verified"]);
        let mut negative = m;
        negative.value = -1.0;
        negative.currency = None;
        let fields: Vec<_> = ProofDoc::Metric(negative)
            .normalise()
            .unwrap_err()
            .iter()
            .map(|e| e.field)
            .collect();
        assert_eq!(fields, ["value", "currency"]);
    }

    #[test]
    fn websites_never_receive_permission_evidence() {
        let public = ProofDoc::Organization(org()).public();
        assert!(public.get("permission").is_none());
        assert_eq!(
            tidy_sites(&[" zirahr".into(), "figbud".into(), "zirahr".into()]),
            ["figbud", "zirahr"]
        );
    }
}
