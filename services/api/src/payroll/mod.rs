//! Payroll Calculator (P14-C): Studio → Websites → ZiraHR → Payroll Calculator.
//! An educational salary estimate, separate from the pricing calculator.
//!
//! - One engine for both directions and every screen (`engine.rs`); browsers
//!   never do the arithmetic.
//! - Statutory values are dated rule sets in the Studio, never code. A rule set
//!   can't be published until a person records when they checked it.
//! - Draft → approval by a different reviewer (owners may approve their own) →
//!   published version, with one-step rollback and an audit trail.
//! - The public page is off until a reviewer switches it on. It only ever sees
//!   the published rules, and inputs are neither stored nor logged.

pub mod engine;
mod starting;

use std::net::SocketAddr;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use self::engine::{CalcError, CalcInput, RuleSet, calculate, validate_rules};
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    rate_limit::client_ip,
    routes::SharedState,
    sites::audit_site,
};

/// Kenyan payroll rules: only websites for Kenyan HR products have this.
const AVAILABLE: &[&str] = &["zirahr"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CalculatorConfig {
    pub rule_sets: Vec<RuleSet>,
    pub intro: String,
    pub disclaimer: String,
    /// The amount the calculator opens with.
    pub example_gross: Decimal,
    pub example_net: Decimal,
}

impl CalculatorConfig {
    /// Refuses anything that could produce a wrong figure or a broken page.
    fn validate(&self) -> Result<(), ApiError> {
        let mut errors: Vec<FieldError> = Vec::new();
        if self.rule_sets.is_empty() || self.rule_sets.len() > 24 {
            errors.push(FieldError {
                field: "rule_sets",
                code: "count",
                message: "Keep between 1 and 24 rule sets.",
            });
        }
        let mut dates = std::collections::HashSet::new();
        for set in &self.rule_sets {
            validate_rules(set, &mut errors);
            if !dates.insert(set.effective_from) {
                errors.push(FieldError {
                    field: "rule_sets",
                    code: "duplicate",
                    message: "Two rule sets can't start on the same date.",
                });
            }
        }
        if self.intro.chars().count() > 600 {
            errors.push(FieldError {
                field: "intro",
                code: "length",
                message: "Up to 600 characters.",
            });
        }
        if self.disclaimer.trim().is_empty() || self.disclaimer.chars().count() > 600 {
            errors.push(FieldError {
                field: "disclaimer",
                code: "required",
                message: "The calculator always shows a notice: up to 600 characters.",
            });
        }
        if self.example_gross <= Decimal::ZERO
            || self.example_net <= Decimal::ZERO
            || self.example_gross > engine::MAX_AMOUNT
            || self.example_net > engine::MAX_AMOUNT
        {
            errors.push(FieldError {
                field: "example_gross",
                code: "range",
                message: "Example amounts must be above zero.",
            });
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(ApiError::Validation(errors))
        }
    }

    /// Publishing needs a person to have checked every rule set.
    fn require_verified(&self) -> Result<(), ApiError> {
        if self.rule_sets.iter().any(|s| s.verified_on.is_none()) {
            return Err(ApiError::Validation(vec![FieldError {
                field: "rule_sets",
                code: "unverified",
                message: "Record when each rule set was checked against the official sources before asking for approval.",
            }]));
        }
        Ok(())
    }
}

/// The starting rules recorded as checked on `date`, for the owner's go-live.
pub fn launch_config(date: &str) -> Result<Value, String> {
    let date: chrono::NaiveDate = date.parse().map_err(|e: chrono::ParseError| e.to_string())?;
    let mut config = starting::config();
    for set in &mut config.rule_sets {
        set.verified_on = Some(date);
    }
    serde_json::to_value(config).map_err(|e| e.to_string())
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/payroll-calculator", get(public_read))
        .route(
            "/v1/sites/{slug}/payroll-calculator/calculate",
            post(public_calculate),
        )
        .route("/v1/admin/sites/{slug}/payroll-calculator", get(read))
        .route(
            "/v1/admin/sites/{slug}/payroll-calculator/draft",
            post(save_draft),
        )
        .route(
            "/v1/admin/sites/{slug}/payroll-calculator/calculate",
            post(admin_calculate),
        )
        .route(
            "/v1/admin/sites/{slug}/payroll-calculator/visibility",
            post(visibility),
        )
        .route("/v1/admin/sites/{slug}/payroll-calculator/{action}", post(action))
}

struct Site {
    id: Uuid,
    name: String,
}

async fn site(pool: &PgPool, slug: &str) -> Result<Site, ApiError> {
    if !AVAILABLE.contains(&slug) {
        return Err(ApiError::NotFound);
    }
    let row: Option<(Uuid, String)> =
        sqlx::query_as("SELECT id, name FROM sites WHERE slug = $1 AND archived_at IS NULL")
            .bind(slug)
            .fetch_optional(pool)
            .await?;
    let (id, name) = row.ok_or(ApiError::NotFound)?;
    Ok(Site { id, name })
}

#[derive(FromRow)]
struct Row {
    draft: Value,
    draft_version: i32,
    published: Option<Value>,
    published_number: i32,
    published_at: Option<DateTime<Utc>>,
    public_visible: bool,
    review_requested_by: Option<Uuid>,
    review_requested_at: Option<DateTime<Utc>>,
    review_note: Option<String>,
}

/// The website's calculator, created from the starting rules on first use.
async fn load(pool: &PgPool, site_id: Uuid) -> Result<Row, ApiError> {
    let starting = serde_json::to_value(starting::config()).map_err(|e| ApiError::Internal(e.to_string()))?;
    sqlx::query(
        "INSERT INTO site_payroll_calculators (site_id, draft) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(site_id)
    .bind(&starting)
    .execute(pool)
    .await?;
    Ok(sqlx::query_as(
        "SELECT draft, draft_version, published, published_number, published_at, public_visible,
                review_requested_by, review_requested_at, review_note
           FROM site_payroll_calculators WHERE site_id = $1",
    )
    .bind(site_id)
    .fetch_one(pool)
    .await?)
}

fn parse(value: &Value) -> Result<CalculatorConfig, ApiError> {
    serde_json::from_value(value.clone()).map_err(|e| ApiError::Internal(format!("stored calculator: {e}")))
}

fn calc_error(err: CalcError) -> ApiError {
    match err {
        CalcError::Invalid(fields) => ApiError::Validation(fields),
        CalcError::NoRules => ApiError::Validation(vec![FieldError {
            field: "pay_month",
            code: "no_rules",
            message: "There are no rules for that month yet. Choose a later month.",
        }]),
        CalcError::Unattainable(message) => ApiError::Validation(vec![FieldError {
            field: "amount",
            code: "unattainable",
            message,
        }]),
    }
}

fn today() -> chrono::NaiveDate {
    Utc::now().date_naive()
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let row = load(&state.pool, site.id).await?;
    let versions: Vec<VersionRow> = sqlx::query_as(
        "SELECT v.number, v.note, v.created_at, u.email AS published_by
           FROM payroll_calculator_versions v LEFT JOIN admin_users u ON u.id = v.published_by
          WHERE v.site_id = $1 ORDER BY v.number DESC LIMIT 50",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let role = session.site_role(site.id);
    Ok(Json(json!({
        "site": { "slug": slug, "name": site.name },
        "draft": row.draft,
        "draft_version": row.draft_version,
        "published": row.published,
        "published_number": row.published_number,
        "published_at": row.published_at,
        "public_visible": row.public_visible,
        "review": row.review_requested_at.map(|at| json!({
            "requested_at": at,
            "note": row.review_note,
            "mine": row.review_requested_by == Some(session.user.id),
        })),
        "versions": versions,
        "can_edit": role >= Some(Role::Editor),
        "can_review": role >= Some(Role::Reviewer),
        "is_owner": role == Some(Role::Owner),
    })))
}

#[derive(Serialize, FromRow)]
struct VersionRow {
    number: i32,
    note: Option<String>,
    created_at: DateTime<Utc>,
    published_by: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveDraft {
    config: CalculatorConfig,
    version: i32,
}

async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<SaveDraft>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Editor)?;
    input.config.validate()?;
    load(&state.pool, site.id).await?;
    let value = serde_json::to_value(&input.config).map_err(|e| ApiError::Internal(e.to_string()))?;
    let saved: Option<i32> = sqlx::query_scalar(
        "UPDATE site_payroll_calculators
            SET draft = $3, draft_version = draft_version + 1, draft_updated_by = $4, draft_updated_at = now(),
                review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
          WHERE site_id = $1 AND draft_version = $2 RETURNING draft_version",
    )
    .bind(site.id)
    .bind(input.version)
    .bind(&value)
    .bind(session.user.id)
    .fetch_optional(&state.pool)
    .await?;
    let version = saved.ok_or(ApiError::Conflict(
        "Someone changed this after you opened it. Reload to see the latest.",
    ))?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "payroll_calculator.draft_saved",
        json!({ "draft_version": version }),
    )
    .await?;
    Ok(Json(json!({ "draft_version": version })))
}

#[derive(Deserialize, Default)]
#[serde(default, deny_unknown_fields)]
struct ActionInput {
    note: Option<String>,
    version: Option<i32>,
}

async fn action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, action)): Path<(String, String)>,
    Json(input): Json<ActionInput>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    let row = load(&state.pool, site.id).await?;
    let note = input.note.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > 500) {
        return Err(ApiError::BadRequest("that note is too long"));
    }
    match action.as_str() {
        "submit" => {
            session.require(Role::Editor)?;
            session.require_site(site.id, Role::Editor)?;
            let draft = parse(&row.draft)?;
            draft.validate()?;
            draft.require_verified()?;
            sqlx::query(
                "UPDATE site_payroll_calculators
                    SET review_requested_by = $2, review_requested_at = now(), review_note = $3
                  WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(session.user.id)
            .bind(note)
            .execute(&state.pool)
            .await?;
            audit_site(
                &state.pool,
                &session,
                site.id,
                "payroll_calculator.submitted",
                json!({ "note": note }),
            )
            .await?;
        }
        "publish" => {
            session.require(Role::Reviewer)?;
            session.require_site(site.id, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("Ask for approval first."));
            }
            if row.review_requested_by == Some(session.user.id)
                && session.site_role(site.id) != Some(Role::Owner)
            {
                return Err(ApiError::NotPermitted(
                    "Someone else needs to approve this: you asked for the approval.",
                ));
            }
            if let Some(at) = row.review_requested_at {
                // Approval rules (P13-B5): who approves, how many approvals, assignment.
                let request = crate::authority::request_key("payroll", &site.id.to_string(), at);
                crate::authority::gate(&state.pool, &session, "payroll", &request).await?;
            }
            let draft = parse(&row.draft)?;
            draft.validate()?;
            draft.require_verified()?;
            publish(
                &state.pool,
                &session,
                site.id,
                &row,
                &row.draft,
                note.unwrap_or("Published"),
                "payroll_calculator.published",
            )
            .await?;
        }
        "reject" => {
            session.require(Role::Reviewer)?;
            session.require_site(site.id, Role::Reviewer)?;
            sqlx::query(
                "UPDATE site_payroll_calculators
                    SET review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
                  WHERE site_id = $1",
            )
            .bind(site.id)
            .execute(&state.pool)
            .await?;
            audit_site(
                &state.pool,
                &session,
                site.id,
                "payroll_calculator.rejected",
                json!({ "note": note }),
            )
            .await?;
        }
        "rollback" => {
            session.require(Role::Reviewer)?;
            session.require_site(site.id, Role::Reviewer)?;
            let number = input.version.ok_or(ApiError::BadRequest("choose a version"))?;
            let config: Option<Value> = sqlx::query_scalar(
                "SELECT config FROM payroll_calculator_versions WHERE site_id = $1 AND number = $2",
            )
            .bind(site.id)
            .bind(number)
            .fetch_optional(&state.pool)
            .await?;
            let config = config.ok_or(ApiError::NotFound)?;
            publish(
                &state.pool,
                &session,
                site.id,
                &row,
                &config,
                &format!("Rolled back to version {number}"),
                "payroll_calculator.rolled_back",
            )
            .await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    Ok(Json(json!({ "ok": true })))
}

async fn publish(
    pool: &PgPool,
    session: &AdminSession,
    site_id: Uuid,
    row: &Row,
    config: &Value,
    note: &str,
    audit_action: &str,
) -> Result<(), ApiError> {
    let number = row.published_number + 1;
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE site_payroll_calculators
            SET published = $2, published_number = $3, published_by = $4, published_at = now(),
                review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
          WHERE site_id = $1",
    )
    .bind(site_id)
    .bind(config)
    .bind(number)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO payroll_calculator_versions (id, site_id, number, config, note, published_by)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id)
    .bind(number)
    .bind(config)
    .bind(note)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit_site(
        pool,
        session,
        site_id,
        audit_action,
        json!({ "version": number, "note": note, "from": row.published, "to": config }),
    )
    .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Visibility {
    public: bool,
}

/// A live switch by design, like other visibility settings: it needs a
/// published version, and changing it is audited.
async fn visibility(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<Visibility>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Reviewer)?;
    let row = load(&state.pool, site.id).await?;
    if input.public && row.published.is_none() {
        return Err(ApiError::Conflict("Publish a version first."));
    }
    sqlx::query("UPDATE site_payroll_calculators SET public_visible = $2 WHERE site_id = $1")
        .bind(site.id)
        .bind(input.public)
        .execute(&state.pool)
        .await?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "payroll_calculator.visibility",
        json!({ "public": input.public }),
    )
    .await?;
    Ok(Json(json!({ "public_visible": input.public })))
}

#[derive(Deserialize)]
struct AdminCalculate {
    /// Which rules to try: the draft (unpublished) or what's published.
    source: String,
    input: CalcInput,
}

async fn admin_calculate(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(req): Json<AdminCalculate>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let row = load(&state.pool, site.id).await?;
    // Never mixed: one source, all the way through.
    let config = match req.source.as_str() {
        "draft" => parse(&row.draft)?,
        "published" => parse(
            row.published
                .as_ref()
                .ok_or(ApiError::Conflict("Nothing is published yet."))?,
        )?,
        _ => return Err(ApiError::BadRequest("unknown source")),
    };
    let result = calculate(&config.rule_sets, &req.input, today()).map_err(calc_error)?;
    Ok(Json(
        json!({ "source": req.source, "draft_version": row.draft_version, "result": result }),
    ))
}

/// The published calculator, only while it's switched on.
async fn published_config(pool: &PgPool, slug: &str) -> Result<Option<(CalculatorConfig, i32)>, ApiError> {
    if !AVAILABLE.contains(&slug) {
        return Ok(None);
    }
    let row: Option<(Value, i32)> = sqlx::query_as(
        "SELECT c.published, c.published_number FROM site_payroll_calculators c
           JOIN sites s ON s.id = c.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND c.public_visible AND c.published IS NOT NULL",
    )
    .bind(slug)
    .fetch_optional(pool)
    .await?;
    row.map(|(value, number)| Ok((parse(&value)?, number)))
        .transpose()
}

async fn public_read(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let body = match published_config(&state.pool, &slug).await? {
        Some((config, version)) => json!({
            "calculator": {
                "intro": config.intro,
                "disclaimer": config.disclaimer,
                "example_gross": config.example_gross,
                "example_net": config.example_net,
                "version": version,
                "rule_sets": config.rule_sets.iter().map(|s| json!({
                    "label": s.label,
                    "effective_from": s.effective_from,
                    "sources": s.sources,
                    "verified_on": s.verified_on,
                })).collect::<Vec<_>>(),
            },
        }),
        None => json!({ "calculator": null }),
    };
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        )],
        Json(body),
    ))
}

async fn public_calculate(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<CalcInput>,
) -> Result<impl IntoResponse, ApiError> {
    state
        .calculator_limiter
        .check(client_ip(&headers, peer, state.config.trust_proxy))
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let (config, _) = published_config(&state.pool, &slug)
        .await?
        .ok_or(ApiError::NotFound)?;
    let result = calculate(&config.rule_sets, &input, today()).map_err(calc_error)?;
    Ok((
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(json!({ "result": result })),
    ))
}
