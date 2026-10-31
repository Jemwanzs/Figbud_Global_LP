//! Pricing Studio (P11-PR1..PR6): Websites → a website → Pricing.
//!
//! - One price book per website: a draft (editors), approval by a different
//!   reviewer (owners may approve their own), versioned publications with a
//!   comparison, rollback into the draft, and an audit trail.
//! - Publishing makes a version available to the Studio's calculators and
//!   quotations. "Show pricing on the website" is a separate reviewer switch,
//!   off by default, and needs a published version; the public only ever sees
//!   public, available, priced items (`PriceBook::public_view`).
//! - Quotations are calculated from the published book and keep a frozen
//!   snapshot; they move draft → pending approval → approved → sent →
//!   accepted / declined, and expire after their validity. Customers open
//!   them with a scoped link (only a hash of the token is stored) that never
//!   shows internal notes or the price book.

pub mod engine;

use std::net::SocketAddr;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Days, NaiveDate, Utc};
use rand::Rng;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use self::engine::{CalcInput, Calculation, PriceBook, calculate};
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    rate_limit::client_ip,
    routes::SharedState,
    sites::audit_site,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/pricing", get(public_pricing))
        .route("/v1/sites/{slug}/pricing/calculate", post(public_calculate))
        .route("/v1/quotes/shared", get(shared_quote))
        .route("/v1/admin/sites/{slug}/pricing", get(read))
        .route("/v1/admin/sites/{slug}/pricing/draft", post(save_draft))
        .route("/v1/admin/sites/{slug}/pricing/calculate", post(admin_calculate))
        .route(
            "/v1/admin/sites/{slug}/pricing/quotes",
            get(list_quotes).post(create_quote),
        )
        .route("/v1/admin/sites/{slug}/pricing/{action}", post(book_action))
        .route("/v1/admin/pricing/quotes/{id}", get(read_quote))
        .route("/v1/admin/pricing/quotes/{id}/{action}", post(quote_action))
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

fn today() -> NaiveDate {
    Utc::now().date_naive()
}

struct Site {
    id: Uuid,
    name: String,
    archived: bool,
}

async fn site(pool: &PgPool, slug: &str) -> Result<Site, ApiError> {
    let row: Option<(Uuid, String, Option<DateTime<Utc>>)> =
        sqlx::query_as("SELECT id, name, archived_at FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_optional(pool)
            .await?;
    let (id, name, archived_at) = row.ok_or(ApiError::NotFound)?;
    Ok(Site {
        id,
        name,
        archived: archived_at.is_some(),
    })
}

/// The book a website starts with before anything is saved: ZiraHR's
/// catalogue for ZiraHR, an empty catalogue for others (every rate unset).
fn starting_book(slug: &str) -> PriceBook {
    let mut book = engine::zirahr_starting_book();
    if slug != "zirahr" {
        book.items.clear();
        book.models.iter_mut().for_each(|m| m.item_ids.clear());
    }
    book
}

#[derive(FromRow)]
struct BookRow {
    draft: Value,
    draft_version: i32,
    draft_updated_at: DateTime<Utc>,
    published: Option<Value>,
    published_number: i32,
    published_at: Option<DateTime<Utc>>,
    effective_from: Option<NaiveDate>,
    review_requested_by: Option<Uuid>,
    review_requested_at: Option<DateTime<Utc>>,
    review_note: Option<String>,
    public_visible: bool,
}

async fn load_book(pool: &PgPool, site_id: Uuid) -> Result<Option<BookRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT draft, draft_version, draft_updated_at, published, published_number, published_at, effective_from,
                review_requested_by, review_requested_at, review_note, public_visible
           FROM pricing_books WHERE site_id = $1",
    )
    .bind(site_id)
    .fetch_optional(pool)
    .await
}

fn decode(value: Value) -> Result<PriceBook, ApiError> {
    serde_json::from_value(value).map_err(|_| {
        ApiError::Validation(vec![field(
            "document",
            "invalid",
            "That price book isn't in the expected shape.",
        )])
    })
}

/// What changed between the published book and the draft, item by item.
fn compare(published: Option<&PriceBook>, draft: &PriceBook) -> Value {
    let Some(published) = published else {
        return json!({ "first": true, "items": [], "settings_changed": true });
    };
    let mut items = Vec::new();
    for item in &draft.items {
        match published.item(&item.id) {
            None => items.push(
                json!({ "item_id": item.id, "name": item.name, "change": "added", "after": item.rate }),
            ),
            Some(before) if before != item => items.push(
                json!({ "item_id": item.id, "name": item.name, "change": "changed",
                "before": before.rate, "after": item.rate, "rate_changed": before.rate != item.rate }),
            ),
            Some(_) => {}
        }
    }
    for item in &published.items {
        if draft.item(&item.id).is_none() {
            items.push(
                json!({ "item_id": item.id, "name": item.name, "change": "removed", "before": item.rate }),
            );
        }
    }
    let settings_changed = published.cycles != draft.cycles
        || published.tax != draft.tax
        || published.currency != draft.currency
        || published.supported_currencies != draft.supported_currencies
        || published.fx_rates != draft.fx_rates
        || published.minimum_monthly_subscription != draft.minimum_monthly_subscription
        || published.plans != draft.plans
        || published.models != draft.models
        || published.terms != draft.terms
        || published.quote_validity_days != draft.quote_validity_days
        || published.decimals != draft.decimals;
    json!({ "first": false, "items": items, "settings_changed": settings_changed })
}

// ------------------------------------------------------------------ price book

/// A published version, for the history.
#[derive(FromRow, Serialize)]
struct Version {
    number: i32,
    note: String,
    effective_from: Option<NaiveDate>,
    requested_by: Option<String>,
    published_by: Option<String>,
    created_at: DateTime<Utc>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let row = load_book(&state.pool, site.id).await?;
    let versions: Vec<Version> = sqlx::query_as(
        "SELECT v.number, v.note, v.effective_from, rq.name AS requested_by, pb.name AS published_by, v.created_at
           FROM pricing_versions v
           LEFT JOIN admin_users rq ON rq.id = v.requested_by
           LEFT JOIN admin_users pb ON pb.id = v.published_by
          WHERE v.site_id = $1 ORDER BY v.number DESC LIMIT 50",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let can_edit = session.require_site(site.id, Role::Editor).is_ok() && !site.archived;
    let can_review = session.require_site(site.id, Role::Reviewer).is_ok() && !site.archived;
    let Some(row) = row else {
        let draft = starting_book(&slug);
        return Ok(Json(json!({
            "site": { "slug": slug, "name": site.name },
            "draft": draft, "draft_version": 0, "published": null, "published_number": 0,
            "public_visible": false, "review": null, "versions": versions,
            "changes": compare(None, &draft), "status": "draft",
            "can_edit": can_edit, "can_review": can_review, "user_id": session.user.id,
        })));
    };
    let draft = decode(row.draft.clone())?;
    let published = row.published.clone().map(decode).transpose()?;
    let requester: Option<String> = match row.review_requested_by {
        Some(id) => {
            sqlx::query_scalar("SELECT name FROM admin_users WHERE id = $1")
                .bind(id)
                .fetch_optional(&state.pool)
                .await?
        }
        None => None,
    };
    let status = if row.review_requested_at.is_some() {
        "in_review"
    } else if published.is_none() {
        "draft"
    } else if published.as_ref() != Some(&draft) {
        "changes_pending"
    } else {
        "published"
    };
    Ok(Json(json!({
        "site": { "slug": slug, "name": site.name },
        "draft": draft,
        "draft_version": row.draft_version,
        "draft_updated_at": row.draft_updated_at,
        "published": published,
        "published_number": row.published_number,
        "published_at": row.published_at,
        "effective_from": row.effective_from,
        "public_visible": row.public_visible,
        "review": row.review_requested_at.map(|at| json!({ "requested_at": at, "requested_by": requester,
            "note": row.review_note, "own": row.review_requested_by == Some(session.user.id) })),
        "versions": versions,
        "changes": compare(published.as_ref(), &draft),
        "status": status,
        "can_edit": can_edit,
        "can_review": can_review,
        "user_id": session.user.id,
    })))
}

#[derive(Deserialize)]
struct DraftInput {
    document: Value,
    version: i32,
}

/// Saving a draft never changes published prices.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Editor)?;
    if site.archived {
        return Err(ApiError::Conflict(
            "Restore this website before changing its pricing.",
        ));
    }
    let book = decode(input.document)?
        .normalise()
        .map_err(ApiError::Validation)?;
    let value = serde_json::to_value(&book).map_err(|e| ApiError::Internal(e.to_string()))?;
    let version: Option<i32> = if input.version == 0 {
        sqlx::query_scalar(
            "INSERT INTO pricing_books (site_id, draft, draft_updated_by) VALUES ($1, $2, $3)
             ON CONFLICT (site_id) DO NOTHING RETURNING draft_version",
        )
        .bind(site.id)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_scalar(
            "UPDATE pricing_books SET draft = $3, draft_version = draft_version + 1, draft_updated_by = $4,
                    draft_updated_at = now(),
                    -- A changed draft needs a new request: approval covers what was asked for.
                    review_requested_by = CASE WHEN draft = $3 THEN review_requested_by END,
                    review_requested_at = CASE WHEN draft = $3 THEN review_requested_at END,
                    review_note = CASE WHEN draft = $3 THEN review_note END
              WHERE site_id = $1 AND draft_version = $2 RETURNING draft_version",
        )
        .bind(site.id)
        .bind(input.version)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    };
    let version = version.ok_or(ApiError::Conflict(
        "Someone else saved this pricing meanwhile. Reload to see their changes.",
    ))?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "pricing.draft_saved",
        json!({ "items": book.items.len(), "currency": book.currency }),
    )
    .await?;
    Ok(Json(json!({ "version": version })))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct BookAction {
    note: Option<String>,
    effective_from: Option<NaiveDate>,
    visible: Option<bool>,
    version: Option<i32>,
}

async fn book_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, action)): Path<(String, String)>,
    body: Option<Json<BookAction>>,
) -> Result<impl IntoResponse, ApiError> {
    let input = body.map(|Json(b)| b).unwrap_or_default();
    let site = site(&state.pool, &slug).await?;
    let pool = &state.pool;
    let note = input.note.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::Validation(vec![field(
            "note",
            "length",
            "Notes are up to 300 characters.",
        )]));
    }
    if site.archived {
        return Err(ApiError::Conflict("Restore this website first."));
    }
    let row = load_book(pool, site.id)
        .await?
        .ok_or(ApiError::Conflict("Save the pricing draft first."))?;
    match action.as_str() {
        "submit" => {
            session.require_site(site.id, Role::Editor)?;
            let draft = decode(row.draft.clone())?;
            if row
                .published
                .as_ref()
                .map(|p| decode(p.clone()))
                .transpose()?
                .as_ref()
                == Some(&draft)
            {
                return Err(ApiError::Conflict(
                    "Nothing has changed since the last publication.",
                ));
            }
            sqlx::query(
                "UPDATE pricing_books SET review_requested_by = $2, review_requested_at = now(), review_note = $3,
                        effective_from = $4 WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(session.user.id)
            .bind(note)
            .bind(input.effective_from)
            .execute(pool)
            .await?;
            audit_site(
                pool,
                &session,
                site.id,
                "pricing.submitted",
                json!({ "note": note }),
            )
            .await?;
        }
        "publish" => {
            session.require_site(site.id, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("Ask for approval first."));
            }
            if row.review_requested_by == Some(session.user.id) && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own request (maker-checker).",
                ));
            }
            let number = row.published_number + 1;
            let mut tx = pool.begin().await?;
            sqlx::query(
                "UPDATE pricing_books SET published = draft, published_number = $2, published_by = $3, published_at = now(),
                        review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
                  WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(number)
            .bind(session.user.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "INSERT INTO pricing_versions (id, site_id, number, document, note, effective_from, requested_by, published_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(Uuid::now_v7())
            .bind(site.id)
            .bind(number)
            .bind(&row.draft)
            .bind(note.or(row.review_note.as_deref()).unwrap_or("Approved"))
            .bind(row.effective_from)
            .bind(row.review_requested_by)
            .bind(session.user.id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            audit_site(
                pool,
                &session,
                site.id,
                "pricing.published",
                json!({ "version": number, "effective_from": row.effective_from,
                    "changes": compare(row.published.clone().map(decode).transpose()?.as_ref(), &decode(row.draft.clone())?) }),
            )
            .await?;
        }
        "reject" => {
            session.require_site(site.id, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("There's no request to decline."));
            }
            sqlx::query(
                "UPDATE pricing_books SET review_requested_by = NULL, review_requested_at = NULL, review_note = NULL WHERE site_id = $1",
            )
            .bind(site.id)
            .execute(pool)
            .await?;
            audit_site(
                pool,
                &session,
                site.id,
                "pricing.rejected",
                json!({ "note": note }),
            )
            .await?;
        }
        "rollback" => {
            // Copies an earlier version into the draft; it still needs approval.
            session.require_site(site.id, Role::Editor)?;
            let number = input.version.ok_or(ApiError::BadRequest("Choose a version."))?;
            let document: Value = sqlx::query_scalar(
                "SELECT document FROM pricing_versions WHERE site_id = $1 AND number = $2",
            )
            .bind(site.id)
            .bind(number)
            .fetch_optional(pool)
            .await?
            .ok_or(ApiError::NotFound)?;
            sqlx::query(
                "UPDATE pricing_books SET draft = $2, draft_version = draft_version + 1, draft_updated_by = $3,
                        draft_updated_at = now(), review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
                  WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(&document)
            .bind(session.user.id)
            .execute(pool)
            .await?;
            audit_site(
                pool,
                &session,
                site.id,
                "pricing.rolled_back",
                json!({ "to_version": number }),
            )
            .await?;
        }
        "visibility" => {
            session.require_site(site.id, Role::Reviewer)?;
            let visible = input
                .visible
                .ok_or(ApiError::BadRequest("Say whether prices show."))?;
            if visible && row.published.is_none() {
                return Err(ApiError::Conflict(
                    "Publish a pricing version before showing prices on the website.",
                ));
            }
            sqlx::query("UPDATE pricing_books SET public_visible = $2 WHERE site_id = $1")
                .bind(site.id)
                .bind(visible)
                .execute(pool)
                .await?;
            audit_site(
                pool,
                &session,
                site.id,
                "pricing.visibility_changed",
                json!({ "before": row.public_visible, "after": visible }),
            )
            .await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct CalcRequest {
    input: CalcInput,
    /// "draft" (editors trying changes) or "published" (what quotes use).
    #[serde(default)]
    source: Option<String>,
}

fn calc_error(e: engine::CalcError) -> ApiError {
    let code = match e {
        engine::CalcError::CycleUnavailable => "cycle",
        engine::CalcError::UnknownItem(_) => "item",
        engine::CalcError::Currency => "currency",
    };
    let message: &'static str = match code {
        "cycle" => "That billing cycle isn't offered.",
        "item" => "One of the items isn't in this price book.",
        _ => "That currency isn't supported, or has no exchange rate.",
    };
    ApiError::Validation(vec![field("input", code, message)])
}

async fn admin_calculate(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(req): Json<CalcRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let row = load_book(&state.pool, site.id).await?;
    let book = match (req.source.as_deref(), row) {
        (Some("published"), Some(row)) => decode(
            row.published
                .ok_or(ApiError::Conflict("No pricing version is published yet."))?,
        )?,
        (Some("published"), None) => return Err(ApiError::Conflict("No pricing version is published yet.")),
        (_, Some(row)) => decode(row.draft)?,
        (_, None) => starting_book(&slug),
    };
    let result = calculate(&book, &req.input, today()).map_err(calc_error)?;
    Ok(Json(result))
}

// ------------------------------------------------------------------ public

async fn public_pricing(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let row: Option<(Option<Value>, bool)> = sqlx::query_as(
        "SELECT b.published, b.public_visible FROM pricing_books b JOIN sites s ON s.id = b.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')",
    )
    .bind(&slug)
    .fetch_optional(&state.pool)
    .await?;
    let body = match row {
        Some((Some(published), true)) => json!({ "visible": true, "book": decode(published)?.public_view() }),
        _ => json!({ "visible": false }),
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
        .pricing_limiter
        .check(client_ip(&headers, peer, state.config.trust_proxy))
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let published: Option<Value> = sqlx::query_scalar(
        "SELECT b.published FROM pricing_books b JOIN sites s ON s.id = b.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND b.public_visible AND b.published IS NOT NULL",
    )
    .bind(&slug)
    .fetch_optional(&state.pool)
    .await?
    .flatten();
    let book = decode(published.ok_or(ApiError::NotFound)?)?.public_view();
    if input.employees > 1_000_000 || input.lines.len() > 60 {
        return Err(ApiError::BadRequest("That calculation is too large."));
    }
    let result = calculate(&book, &input, today()).map_err(calc_error)?;
    Ok(Json(result))
}

// ------------------------------------------------------------------ quotes

pub const QUOTE_STATUSES: [&str; 7] = [
    "draft",
    "pending_approval",
    "approved",
    "sent",
    "accepted",
    "declined",
    "expired",
];

#[derive(FromRow)]
struct QuoteRow {
    id: Uuid,
    site_id: Uuid,
    reference: String,
    customer_name: String,
    customer_contact: String,
    status: String,
    input: Value,
    snapshot: Value,
    book_version: i32,
    currency: String,
    due_first_period: Decimal,
    renewal_amount: Decimal,
    issue_date: NaiveDate,
    expiry_date: NaiveDate,
    terms: String,
    internal_notes: String,
    share_token_hash: Option<String>,
    version: i32,
    submitted_by: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

macro_rules! quote_columns {
    () => {
        "id, site_id, reference, customer_name, customer_contact, status, input, snapshot, book_version, currency,
         due_first_period, renewal_amount, issue_date, expiry_date, terms, internal_notes, share_token_hash, version,
         submitted_by, created_at, updated_at"
    };
}

impl QuoteRow {
    /// Approved or sent quotations past their expiry read as expired.
    fn effective_status(&self) -> &str {
        if matches!(self.status.as_str(), "approved" | "sent") && self.expiry_date < today() {
            "expired"
        } else {
            &self.status
        }
    }

    fn summary(&self) -> Value {
        json!({
            "id": self.id,
            "reference": self.reference,
            "customer_name": self.customer_name,
            "status": self.effective_status(),
            "currency": self.currency,
            "due_first_period": self.due_first_period,
            "renewal_amount": self.renewal_amount,
            "issue_date": self.issue_date,
            "expiry_date": self.expiry_date,
            "book_version": self.book_version,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        })
    }

    /// What a customer sees: no internal notes, inputs or price book.
    fn customer_view(&self, product: &str) -> Value {
        json!({
            "reference": self.reference,
            "product": product,
            "customer_name": self.customer_name,
            "status": self.effective_status(),
            "issue_date": self.issue_date,
            "expiry_date": self.expiry_date,
            "calculation": self.snapshot["calculation"],
            "model": self.snapshot["model"],
            "tax_name": self.snapshot["tax_name"],
            "terms": self.terms,
        })
    }
}

async fn load_quote(pool: &PgPool, id: Uuid) -> Result<QuoteRow, ApiError> {
    sqlx::query_as::<_, QuoteRow>(concat!(
        "SELECT ",
        quote_columns!(),
        " FROM pricing_quotes WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn list_quotes(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let rows: Vec<QuoteRow> = sqlx::query_as(concat!(
        "SELECT ",
        quote_columns!(),
        " FROM pricing_quotes WHERE site_id = $1 ORDER BY created_at DESC LIMIT 200"
    ))
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        json!({ "quotes": rows.iter().map(QuoteRow::summary).collect::<Vec<_>>() }),
    ))
}

#[derive(Deserialize)]
struct QuoteInput {
    customer_name: String,
    #[serde(default)]
    customer_contact: String,
    input: CalcInput,
    #[serde(default)]
    terms: Option<String>,
    #[serde(default)]
    internal_notes: String,
    #[serde(default)]
    issue_date: Option<NaiveDate>,
    /// Updates only.
    #[serde(default)]
    version: Option<i32>,
}

struct Priced {
    snapshot: Value,
    calc: Calculation,
    book_version: i32,
    terms: String,
    validity: u32,
}

/// Prices a quotation against the published book and freezes the result.
async fn price_quote(pool: &PgPool, site_id: Uuid, input: &QuoteInput) -> Result<Priced, ApiError> {
    let row = load_book(pool, site_id).await?.ok_or(ApiError::Conflict(
        "Publish a pricing version before issuing quotations.",
    ))?;
    let published = row.published.ok_or(ApiError::Conflict(
        "Publish a pricing version before issuing quotations.",
    ))?;
    let book = decode(published)?;
    let calc = calculate(&book, &input.input, input.issue_date.unwrap_or_else(today)).map_err(calc_error)?;
    let model = input
        .input
        .model_id
        .as_deref()
        .and_then(|id| book.models.iter().find(|m| m.id == id))
        .map(|m| m.name.clone());
    Ok(Priced {
        snapshot: json!({ "calculation": calc, "model": model, "tax_name": book.tax.name }),
        terms: input.terms.clone().unwrap_or_else(|| book.terms.clone()),
        validity: book.quote_validity_days,
        book_version: row.published_number,
        calc,
    })
}

fn check_quote(input: &QuoteInput) -> Result<(), ApiError> {
    let mut e = Vec::new();
    let name = input.customer_name.trim();
    if name.is_empty() || name.chars().count() > 160 {
        e.push(field(
            "customer_name",
            "required",
            "Name the customer or organisation (up to 160 characters).",
        ));
    }
    if input.customer_contact.chars().count() > 200 || input.internal_notes.chars().count() > 2000 {
        e.push(field(
            "internal_notes",
            "length",
            "Contacts are up to 200 characters, notes up to 2,000.",
        ));
    }
    if input.terms.as_ref().is_some_and(|t| t.chars().count() > 4000) {
        e.push(field("terms", "length", "Terms are up to 4,000 characters."));
    }
    if input.input.lines.is_empty() {
        e.push(field("input", "empty", "Choose at least one item."));
    }
    if e.is_empty() {
        Ok(())
    } else {
        Err(ApiError::Validation(e))
    }
}

async fn create_quote(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<QuoteInput>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Editor)?;
    check_quote(&input)?;
    let priced = price_quote(&state.pool, site.id, &input).await?;
    let issue = input.issue_date.unwrap_or_else(today);
    let expiry = issue
        .checked_add_days(Days::new(u64::from(priced.validity)))
        .unwrap_or(issue);
    let prefix: String = slug
        .to_ascii_uppercase()
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(6)
        .collect();
    let year = issue.format("%Y").to_string();
    let id = Uuid::now_v7();
    // The next number for this website and year; the unique reference guards races.
    let reference: String = sqlx::query_scalar(
        "SELECT $1 || '-Q-' || $2 || '-' || lpad((count(*) + 1)::text, 4, '0')
           FROM pricing_quotes WHERE site_id = $3 AND reference LIKE $1 || '-Q-' || $2 || '-%'",
    )
    .bind(&prefix)
    .bind(&year)
    .bind(site.id)
    .fetch_one(&state.pool)
    .await?;
    sqlx::query(
        "INSERT INTO pricing_quotes (id, site_id, reference, customer_name, customer_contact, input, snapshot, book_version,
                currency, due_first_period, renewal_amount, issue_date, expiry_date, terms, internal_notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    )
    .bind(id)
    .bind(site.id)
    .bind(&reference)
    .bind(input.customer_name.trim())
    .bind(input.customer_contact.trim())
    .bind(serde_json::to_value(&input.input).map_err(|e| ApiError::Internal(e.to_string()))?)
    .bind(&priced.snapshot)
    .bind(priced.book_version)
    .bind(&priced.calc.currency)
    .bind(priced.calc.due_first_period)
    .bind(priced.calc.renewal_amount)
    .bind(issue)
    .bind(expiry)
    .bind(priced.terms.trim())
    .bind(input.internal_notes.trim())
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "pricing.quote_created",
        json!({ "reference": reference, "customer": input.customer_name.trim(),
            "due_first_period": priced.calc.due_first_period, "currency": priced.calc.currency }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "reference": reference })))
}

async fn read_quote(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let q = load_quote(&state.pool, id).await?;
    session.require_site(q.site_id, Role::Viewer)?;
    let (slug, name): (String, String) = sqlx::query_as("SELECT slug, name FROM sites WHERE id = $1")
        .bind(q.site_id)
        .fetch_one(&state.pool)
        .await?;
    let mut body = q.summary();
    body["site"] = json!({ "slug": slug, "name": name });
    body["customer_contact"] = json!(q.customer_contact);
    body["input"] = q.input.clone();
    body["snapshot"] = q.snapshot.clone();
    body["terms"] = json!(q.terms);
    body["internal_notes"] = json!(q.internal_notes);
    body["version"] = json!(q.version);
    body["shared"] = json!(q.share_token_hash.is_some());
    body["own_submission"] = json!(q.submitted_by == Some(session.user.id));
    body["can_edit"] = json!(session.require_site(q.site_id, Role::Editor).is_ok());
    body["can_review"] = json!(session.require_site(q.site_id, Role::Reviewer).is_ok());
    Ok(Json(body))
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

async fn quote_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
    body: Option<Json<Value>>,
) -> Result<impl IntoResponse, ApiError> {
    let pool = &state.pool;
    let q = load_quote(pool, id).await?;
    let status = q.effective_status().to_owned();
    let set_status = |to: &'static str| async move {
        sqlx::query(
            "UPDATE pricing_quotes SET status = $2, version = version + 1, updated_at = now() WHERE id = $1",
        )
        .bind(id)
        .bind(to)
        .execute(pool)
        .await
    };
    let mut extra = json!({});
    match action.as_str() {
        "update" => {
            // Drafts only: re-priced against the current published book.
            session.require_site(q.site_id, Role::Editor)?;
            if status != "draft" {
                return Err(ApiError::Conflict("Only draft quotations can be changed."));
            }
            let Json(raw) = body.ok_or(ApiError::BadRequest("Send the quotation."))?;
            let input: QuoteInput = serde_json::from_value(raw)
                .map_err(|_| ApiError::BadRequest("That quotation isn't in the expected shape."))?;
            if input.version != Some(q.version) {
                return Err(ApiError::Conflict(
                    "Someone else changed this quotation meanwhile. Reload to see it.",
                ));
            }
            check_quote(&input)?;
            let priced = price_quote(pool, q.site_id, &input).await?;
            sqlx::query(
                "UPDATE pricing_quotes SET customer_name = $2, customer_contact = $3, input = $4, snapshot = $5,
                        book_version = $6, currency = $7, due_first_period = $8, renewal_amount = $9, terms = $10,
                        internal_notes = $11, version = version + 1, updated_at = now()
                  WHERE id = $1",
            )
            .bind(id)
            .bind(input.customer_name.trim())
            .bind(input.customer_contact.trim())
            .bind(serde_json::to_value(&input.input).map_err(|e| ApiError::Internal(e.to_string()))?)
            .bind(&priced.snapshot)
            .bind(priced.book_version)
            .bind(&priced.calc.currency)
            .bind(priced.calc.due_first_period)
            .bind(priced.calc.renewal_amount)
            .bind(priced.terms.trim())
            .bind(input.internal_notes.trim())
            .execute(pool)
            .await?;
        }
        "submit" => {
            session.require_site(q.site_id, Role::Editor)?;
            if status != "draft" {
                return Err(ApiError::Conflict("Only draft quotations can go for approval."));
            }
            if q.snapshot["calculation"]["unpriced"]
                .as_array()
                .is_some_and(|u| !u.is_empty())
            {
                return Err(ApiError::Validation(vec![field(
                    "input",
                    "unpriced",
                    "Some items have no price yet. Price them in the published book, or remove them, first.",
                )]));
            }
            sqlx::query(
                "UPDATE pricing_quotes SET status = 'pending_approval', submitted_by = $2, version = version + 1,
                        updated_at = now() WHERE id = $1",
            )
            .bind(id)
            .bind(session.user.id)
            .execute(pool)
            .await?;
        }
        "approve" | "reject" => {
            session.require_site(q.site_id, Role::Reviewer)?;
            if status != "pending_approval" {
                return Err(ApiError::Conflict("This quotation isn't awaiting approval."));
            }
            if action == "approve" {
                if q.submitted_by == Some(session.user.id) && session.user.role != Role::Owner {
                    return Err(ApiError::NotPermitted(
                        "A different reviewer must approve your own quotation (maker-checker).",
                    ));
                }
                sqlx::query(
                    "UPDATE pricing_quotes SET status = 'approved', approved_by = $2, version = version + 1, updated_at = now()
                      WHERE id = $1",
                )
                .bind(id)
                .bind(session.user.id)
                .execute(pool)
                .await?;
            } else {
                set_status("draft").await?;
            }
        }
        "share" => {
            // A new customer link (the previous one stops working). Approved quotations only.
            session.require_site(q.site_id, Role::Editor)?;
            if !matches!(status.as_str(), "approved" | "sent" | "accepted") {
                return Err(ApiError::Conflict("Only approved quotations can be shared."));
            }
            let mut bytes = [0u8; 32];
            rand::rng().fill(&mut bytes);
            let token = hex::encode(bytes);
            sqlx::query(
                "UPDATE pricing_quotes SET share_token_hash = $2,
                        status = CASE WHEN status = 'approved' THEN 'sent' ELSE status END,
                        version = version + 1, updated_at = now() WHERE id = $1",
            )
            .bind(id)
            .bind(token_hash(&token))
            .execute(pool)
            .await?;
            extra = json!({ "token": token });
        }
        "unshare" => {
            session.require_site(q.site_id, Role::Editor)?;
            sqlx::query("UPDATE pricing_quotes SET share_token_hash = NULL, version = version + 1, updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
        }
        "mark_sent" => {
            session.require_site(q.site_id, Role::Editor)?;
            if status != "approved" {
                return Err(ApiError::Conflict(
                    "Only approved quotations can be marked as sent.",
                ));
            }
            set_status("sent").await?;
        }
        "accept" | "decline" => {
            // Recorded by FigBud when the customer replies.
            session.require_site(q.site_id, Role::Reviewer)?;
            if !matches!(status.as_str(), "approved" | "sent") {
                return Err(ApiError::Conflict(
                    "Only approved or sent quotations that haven't expired can be accepted or declined.",
                ));
            }
            set_status(if action == "accept" {
                "accepted"
            } else {
                "declined"
            })
            .await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    audit_site(
        pool,
        &session,
        q.site_id,
        &format!("pricing.quote_{action}"),
        json!({ "reference": q.reference, "from": status }),
    )
    .await?;
    let fresh = load_quote(pool, id).await?;
    let mut body = fresh.summary();
    if let Value::Object(map) = extra {
        for (k, v) in map {
            body[k] = v;
        }
    }
    Ok(Json(body))
}

/// A customer's view of a shared quotation (token in the `x-quote-token` header).
async fn shared_quote(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    state
        .pricing_limiter
        .check(client_ip(&headers, peer, state.config.trust_proxy))
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let token = headers
        .get("x-quote-token")
        .and_then(|v| v.to_str().ok())
        .filter(|t| t.len() == 64 && t.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or(ApiError::NotFound)?;
    let row: Option<QuoteRow> = sqlx::query_as(concat!(
        "SELECT ",
        quote_columns!(),
        " FROM pricing_quotes WHERE share_token_hash = $1"
    ))
    .bind(token_hash(token))
    .fetch_optional(&state.pool)
    .await?;
    let q = row.ok_or(ApiError::NotFound)?;
    if !matches!(
        q.effective_status(),
        "approved" | "sent" | "accepted" | "declined" | "expired"
    ) {
        return Err(ApiError::NotFound);
    }
    let product: String = sqlx::query_scalar("SELECT name FROM sites WHERE id = $1")
        .bind(q.site_id)
        .fetch_one(&state.pool)
        .await?;
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, no-store"),
        )],
        Json(q.customer_view(&product)),
    ))
}
