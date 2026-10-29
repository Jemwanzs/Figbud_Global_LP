//! Admin Studio: brand profiles and the logo library (docs/BRAND_ASSETS.md).
//!
//! Each website has one brand profile: a working draft (autosaved, never
//! public) and a published version. Publishing is a revision that a second
//! person approves (maker-checker; owners may approve their own, audited).
//! Approved revisions are the version history; restoring one copies it into
//! the draft, which is published the same way.
//!
//! Logos live in a per-website library of immutable assets. Replacing a logo
//! adds a new asset and points the profile at it, so earlier versions and any
//! page still showing the old file keep working. Assets in use can't be
//! archived. Only assets referenced by a published profile are public.

pub mod config;
pub mod image;
pub mod seed;

use std::collections::HashMap;

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use tower_http::limit::RequestBodyLimitLayer;
use uuid::Uuid;

use self::config::BrandConfig;
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    routes::SharedState,
    sites::{audit_site, trimmed},
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/brand/assets/{id}", get(public_asset))
        .route("/v1/admin/brand/assets/{id}", get(admin_asset))
        .route("/v1/admin/sites/{slug}/brand", get(read))
        .route("/v1/admin/sites/{slug}/brand/draft", post(save_draft))
        .route(
            "/v1/admin/sites/{slug}/brand/assets/{id}/{action}",
            post(asset_action),
        )
        .route("/v1/admin/sites/{slug}/brand/submit", post(submit))
        .route(
            "/v1/admin/sites/{slug}/brand/revisions/{id}/{action}",
            post(revision_action),
        )
}

/// Uploads take raw image bytes, so they get their own body limit.
pub fn upload_router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/sites/{slug}/brand/uploads", post(upload))
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(image::MAX_RASTER_BYTES + 1024))
}

// ---------------------------------------------------------------- shared

#[derive(FromRow)]
struct SiteRef {
    id: Uuid,
    slug: String,
}

async fn site(pool: &PgPool, slug: &str) -> Result<SiteRef, ApiError> {
    sqlx::query_as("SELECT id, slug FROM sites WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

#[derive(Serialize, FromRow, Clone)]
pub struct AssetMeta {
    pub id: Uuid,
    pub label: String,
    pub alt_text: String,
    pub content_type: String,
    pub width: i32,
    pub height: i32,
    pub has_alpha: bool,
    pub byte_size: i32,
    pub origin: String,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub widths: Vec<i32>,
}

macro_rules! asset_select {
    () => {
        "SELECT a.id, a.label, a.alt_text, a.content_type, a.width, a.height, a.has_alpha, a.byte_size,
                a.origin, a.archived_at, a.created_at,
                COALESCE(ARRAY(SELECT r.width FROM brand_asset_renditions r WHERE r.asset_id = a.id ORDER BY r.width),
                         '{}') AS widths
           FROM brand_assets a "
    };
}

fn parse(value: Option<Value>) -> Option<BrandConfig> {
    value.and_then(|v| serde_json::from_value(v).ok())
}

/// A profile with each logo reference expanded to what a page needs to render it.
pub fn resolve(config: &BrandConfig, assets: &HashMap<Uuid, AssetMeta>, base: &str) -> Value {
    let asset = |id: Option<Uuid>| -> Value {
        id.and_then(|id| assets.get(&id)).map_or(Value::Null, |a| {
            json!({
                "id": a.id, "url": format!("{base}{}", a.id), "alt": a.alt_text,
                "content_type": a.content_type, "width": a.width, "height": a.height, "widths": a.widths,
            })
        })
    };
    let pair = |p: &config::ThemePair| json!({ "on_dark": asset(p.on_dark), "on_light": asset(p.on_light) });
    let l = &config.logos;
    json!({
        "logos": {
            "horizontal": pair(&l.horizontal), "stacked": pair(&l.stacked),
            "symbol": pair(&l.symbol), "wordmark": pair(&l.wordmark),
        },
        "favicon": asset(config.favicon),
        "app_icon": asset(config.app_icon),
        "social_image": asset(config.social_image),
        "colors": config.colors,
        "logo_height": config.logo_height,
    })
}

async fn assets_by_id(pool: &PgPool, ids: &[Uuid]) -> Result<HashMap<Uuid, AssetMeta>, sqlx::Error> {
    let rows: Vec<AssetMeta> = sqlx::query_as(concat!(asset_select!(), "WHERE a.id = ANY($1)"))
        .bind(ids)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|a| (a.id, a)).collect())
}

/// Published brand profiles by site slug, for `GET /v1/sites`.
pub async fn published_by_slug(pool: &PgPool) -> Result<HashMap<String, Value>, sqlx::Error> {
    let rows: Vec<(String, Value)> = sqlx::query_as(
        "SELECT s.slug, b.published FROM site_brands b JOIN sites s ON s.id = b.site_id
          WHERE b.published IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    let configs: Vec<(String, BrandConfig)> = rows
        .into_iter()
        .filter_map(|(slug, value)| parse(Some(value)).map(|c| (slug, c)))
        .collect();
    let ids: Vec<Uuid> = configs.iter().flat_map(|(_, c)| c.asset_ids()).collect();
    let assets = assets_by_id(pool, &ids).await?;
    Ok(configs
        .into_iter()
        .map(|(slug, c)| (slug, resolve(&c, &assets, "/v1/brand/assets/")))
        .collect())
}

// ---------------------------------------------------------------- delivery

#[derive(Deserialize)]
struct SizeQuery {
    w: Option<i32>,
    /// A square PNG icon of this size (see `image::ICON_SIZES`).
    icon: Option<u32>,
    /// `1`: the 1200 × 630 PNG social platforms expect (see `image::social_png`).
    social: Option<u8>,
}

/// The asset itself, a rendition, or a square PNG icon rendered from it.
async fn delivered(pool: &PgPool, id: Uuid, size: &SizeQuery) -> Result<(String, Vec<u8>), ApiError> {
    if size.social == Some(1) {
        let (content_type, data) = asset_bytes(pool, id, None).await?;
        let png = image::social_png(&content_type, &data)
            .ok_or_else(|| ApiError::Internal("social image rendering failed".into()))?;
        return Ok(("image/png".to_owned(), png));
    }
    if let Some(icon) = size.icon {
        let (content_type, data) = asset_bytes(pool, id, None).await?;
        let png = image::icon_png(&content_type, &data, icon).ok_or(ApiError::BadRequest(
            "icon sizes are 16, 32, 48, 180, 192 and 512",
        ))?;
        return Ok(("image/png".to_owned(), png));
    }
    asset_bytes(pool, id, size.w).await
}

async fn asset_bytes(pool: &PgPool, id: Uuid, width: Option<i32>) -> Result<(String, Vec<u8>), ApiError> {
    if let Some(w) = width.filter(|w| *w > 0) {
        let rendition: Option<(String, Vec<u8>)> = sqlx::query_as(
            "SELECT r.content_type, r.data FROM brand_asset_renditions r JOIN brand_assets a ON a.id = r.asset_id
              WHERE r.asset_id = $1 AND r.width >= $2 AND a.content_type <> 'image/svg+xml'
              ORDER BY r.width LIMIT 1",
        )
        .bind(id)
        .bind(w)
        .fetch_optional(pool)
        .await?;
        if let Some(found) = rendition {
            return Ok(found);
        }
    }
    sqlx::query_as("SELECT content_type, data FROM brand_assets WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

fn image_response((content_type, data): (String, Vec<u8>), cache: &'static str) -> Response {
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&content_type) {
        headers.insert(header::CONTENT_TYPE, value);
    }
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    // An SVG opened directly can never run anything.
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; style-src 'unsafe-inline'; sandbox"),
    );
    headers.insert(header::CONTENT_DISPOSITION, HeaderValue::from_static("inline"));
    (headers, data).into_response()
}

/// Public: only assets used by a published profile. Assets never change, so they cache forever.
async fn public_asset(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    Query(size): Query<SizeQuery>,
) -> Result<Response, ApiError> {
    let published: Option<Option<Value>> = sqlx::query_scalar(
        "SELECT b.published FROM brand_assets a JOIN site_brands b ON b.site_id = a.site_id WHERE a.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let live = parse(published.flatten()).is_some_and(|c| c.asset_ids().contains(&id));
    if !live {
        return Err(ApiError::NotFound);
    }
    Ok(image_response(
        delivered(&state.pool, id, &size).await?,
        "public, max-age=31536000, immutable",
    ))
}

async fn admin_asset(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Query(size): Query<SizeQuery>,
) -> Result<Response, ApiError> {
    session.require(Role::Viewer)?;
    Ok(image_response(
        delivered(&state.pool, id, &size).await?,
        "private, max-age=86400",
    ))
}

// ----------------------------------------------------------------- studio

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

#[derive(FromRow)]
struct BrandRow {
    draft: Value,
    draft_version: i32,
    draft_note: Option<String>,
    draft_updated_at: DateTime<Utc>,
    draft_updated_by: Option<String>,
    published: Option<Value>,
    published_revision: Option<Uuid>,
    published_at: Option<DateTime<Utc>>,
}

/// The site's profile row, created from defaults the first time it's needed.
async fn ensure_profile(pool: &PgPool, site: &SiteRef) -> Result<BrandRow, ApiError> {
    let default = serde_json::to_value(BrandConfig::default_for(&site.slug))
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    sqlx::query("INSERT INTO site_brands (site_id, draft) VALUES ($1, $2) ON CONFLICT (site_id) DO NOTHING")
        .bind(site.id)
        .bind(default)
        .execute(pool)
        .await?;
    Ok(sqlx::query_as(
        "SELECT b.draft, b.draft_version, b.draft_note, b.draft_updated_at, u.name AS draft_updated_by,
                b.published, b.published_revision, b.published_at
           FROM site_brands b LEFT JOIN admin_users u ON u.id = b.draft_updated_by
          WHERE b.site_id = $1",
    )
    .bind(site.id)
    .fetch_one(pool)
    .await?)
}

async fn pending_config(pool: &PgPool, site_id: Uuid) -> Result<Option<BrandConfig>, sqlx::Error> {
    let value: Option<Value> =
        sqlx::query_scalar("SELECT config FROM brand_revisions WHERE site_id = $1 AND state = 'pending'")
            .bind(site_id)
            .fetch_optional(pool)
            .await?;
    Ok(parse(value))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site(&state.pool, &slug).await?;
    let row = ensure_profile(&state.pool, &site).await?;
    let draft = parse(Some(row.draft.clone())).unwrap_or_else(|| BrandConfig::default_for(&slug));
    let published = parse(row.published.clone());
    let pending = pending_config(&state.pool, site.id).await?;

    let library: Vec<AssetMeta> = sqlx::query_as(concat!(
        asset_select!(),
        "WHERE a.site_id = $1 ORDER BY a.archived_at IS NOT NULL, a.created_at DESC"
    ))
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let assets: HashMap<Uuid, AssetMeta> = library.iter().map(|a| (a.id, a.clone())).collect();
    let library: Vec<Value> = library
        .iter()
        .map(|a| {
            let mut value = json!(a);
            value["used_in"] = json!({
                "draft": draft.placements(a.id),
                "published": published.as_ref().map(|p| p.placements(a.id)).unwrap_or_default(),
                "pending": pending.as_ref().map(|p| p.placements(a.id)).unwrap_or_default(),
            });
            value
        })
        .collect();
    let revisions: Vec<Revision> = sqlx::query_as(
        "SELECT r.id, r.number, r.note, r.state, rq.name AS requested_by, r.requested_by AS requested_by_id,
                dc.name AS decided_by, r.decision_note, r.created_at, r.decided_at
           FROM brand_revisions r
           LEFT JOIN admin_users rq ON rq.id = r.requested_by
           LEFT JOIN admin_users dc ON dc.id = r.decided_by
          WHERE r.site_id = $1 ORDER BY r.number DESC LIMIT 30",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;

    const ADMIN_BASE: &str = "/admin/api/brand/assets/";
    Ok(Json(json!({
        "draft": draft,
        "draft_resolved": resolve(&draft, &assets, ADMIN_BASE),
        "draft_version": row.draft_version,
        "draft_note": row.draft_note,
        "draft_updated_at": row.draft_updated_at,
        "draft_updated_by": row.draft_updated_by,
        "draft_differs": row.published.as_ref() != Some(&row.draft),
        "checks": draft.checks(),
        "publishable": draft.publishable(),
        "published": published,
        "published_resolved": published.as_ref().map(|p| resolve(p, &assets, ADMIN_BASE)),
        "published_revision": row.published_revision,
        "published_at": row.published_at,
        "assets": library,
        "revisions": revisions,
    })))
}

#[derive(Deserialize)]
struct DraftInput {
    config: Value,
    version: i32,
    note: Option<String>,
}

/// Checks that every referenced asset belongs to the site, is live and fits its slot.
async fn validate_assets(pool: &PgPool, site_id: Uuid, config: &BrandConfig) -> Result<(), ApiError> {
    let assets = assets_by_id(pool, &config.asset_ids()).await?;
    let owned: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM brand_assets WHERE site_id = $1 AND id = ANY($2)")
            .bind(site_id)
            .bind(config.asset_ids())
            .fetch_all(pool)
            .await?;
    let mut errors = Vec::new();
    for id in config.asset_ids() {
        let usable = owned.contains(&id) && assets.get(&id).is_some_and(|a| a.archived_at.is_none());
        if !usable {
            errors.push(FieldError {
                field: "config",
                code: "asset",
                message: "A selected file is archived or belongs to another website. Choose another file.",
            });
            break;
        }
    }
    let square = |id: Option<Uuid>| {
        id.and_then(|id| assets.get(&id)).is_none_or(|a| {
            let ratio = a.width as f64 / a.height as f64;
            (0.98..=1.02).contains(&ratio)
        })
    };
    if !square(config.favicon) {
        errors.push(FieldError {
            field: "favicon",
            code: "square",
            message: "Favicons must be square.",
        });
    }
    if !square(config.app_icon) {
        errors.push(FieldError {
            field: "app_icon",
            code: "square",
            message: "App icons must be square.",
        });
    }
    let social_ok = config
        .social_image
        .and_then(|id| assets.get(&id))
        .is_none_or(|a| {
            let ratio = a.width as f64 / a.height as f64;
            a.width >= 600 && (1.8..=2.0).contains(&ratio)
        });
    if !social_ok {
        errors.push(FieldError {
            field: "social_image",
            code: "shape",
            message: "Social images should be about 1200 × 630 pixels (at least 600 wide).",
        });
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(ApiError::Validation(errors))
    }
}

fn decode(value: Value) -> Result<BrandConfig, ApiError> {
    let config: BrandConfig = serde_json::from_value(value).map_err(|_| {
        ApiError::Validation(vec![FieldError {
            field: "config",
            code: "format",
            message: "The brand settings couldn't be read. Reload and try again.",
        }])
    })?;
    config.normalise().map_err(ApiError::Validation)
}

/// Autosave target: updates the draft only. Never publishes.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let previous = ensure_profile(&state.pool, &site).await?;
    let config = decode(input.config)?;
    validate_assets(&state.pool, site.id, &config).await?;
    let note = trimmed(input.note.as_deref());
    if note.as_ref().is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::BadRequest("note is too long"));
    }
    let value = serde_json::to_value(&config).map_err(|e| ApiError::Internal(e.to_string()))?;
    let updated = sqlx::query(
        "UPDATE site_brands SET draft = $2, draft_note = $3, draft_version = draft_version + 1,
                draft_updated_by = $4, draft_updated_at = now()
          WHERE site_id = $1 AND draft_version = $5",
    )
    .bind(site.id)
    .bind(&value)
    .bind(&note)
    .bind(session.user.id)
    .bind(input.version)
    .execute(&state.pool)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "Someone else changed this brand draft. Reload to see their changes.",
        ));
    }
    if previous.draft != value {
        audit_site(
            &state.pool,
            &session,
            site.id,
            "brand.draft_saved",
            json!({ "from": previous.draft, "to": value }),
        )
        .await?;
    }
    Ok(Json(
        json!({ "draft_version": input.version + 1, "checks": config.checks(), "publishable": config.publishable() }),
    ))
}

#[derive(Deserialize)]
struct UploadQuery {
    label: Option<String>,
    alt: Option<String>,
}

async fn upload(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Query(query): Query<UploadQuery>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let mut errors = Vec::new();
    let label = trimmed(query.label.as_deref()).filter(|l| l.chars().count() <= 120);
    let alt = trimmed(query.alt.as_deref()).filter(|a| a.chars().count() <= 200);
    if label.is_none() {
        errors.push(FieldError {
            field: "label",
            code: "required",
            message: "Name this file (up to 120 characters).",
        });
    }
    if alt.is_none() {
        errors.push(FieldError {
            field: "alt_text",
            code: "required",
            message: "Describe the logo for screen readers, usually the product name (up to 200 characters).",
        });
    }
    let declared = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(image::Kind::from_content_type);
    let processed = match declared {
        None => Err(image::Rejection::Type),
        Some(kind) => image::process(&body, kind),
    };
    let processed = match processed {
        Ok(p) => Some(p),
        Err(rejection) => {
            errors.push(FieldError {
                field: "file",
                code: "invalid",
                message: rejection.message(),
            });
            None
        }
    };
    let (Some(processed), Some(label), Some(alt)) = (processed, label, alt) else {
        return Err(ApiError::Validation(errors));
    };
    let (status, id) = store(
        &state.pool,
        site.id,
        &processed,
        &label,
        &alt,
        "upload",
        Some(session.user.id),
    )
    .await?;
    if status == StatusCode::CREATED {
        audit_site(
            &state.pool,
            &session,
            site.id,
            "brand.asset_uploaded",
            json!({ "asset": id, "label": label, "type": processed.kind.content_type(), "width": processed.width, "height": processed.height }),
        )
        .await?;
    }
    let asset = assets_by_id(&state.pool, &[id])
        .await?
        .remove(&id)
        .ok_or(ApiError::NotFound)?;
    Ok((status, Json(asset)))
}

/// Stores an asset (and renditions). An identical file already in the
/// site's library is returned instead of being stored twice.
pub(crate) async fn store(
    pool: &PgPool,
    site_id: Uuid,
    processed: &image::Processed,
    label: &str,
    alt: &str,
    origin: &str,
    created_by: Option<Uuid>,
) -> Result<(StatusCode, Uuid), ApiError> {
    let mut tx = pool.begin().await?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO brand_assets (id, site_id, label, alt_text, content_type, width, height, has_alpha,
                                   byte_size, sha256, data, origin, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (site_id, sha256) DO NOTHING
         RETURNING id",
    )
    .bind(Uuid::now_v7())
    .bind(site_id)
    .bind(label)
    .bind(alt)
    .bind(processed.kind.content_type())
    .bind(processed.width as i32)
    .bind(processed.height as i32)
    .bind(processed.has_alpha)
    .bind(processed.data.len() as i32)
    .bind(&processed.sha256)
    .bind(&processed.data)
    .bind(origin)
    .bind(created_by)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(id) = inserted else {
        tx.rollback().await?;
        let existing: Uuid =
            sqlx::query_scalar("SELECT id FROM brand_assets WHERE site_id = $1 AND sha256 = $2")
                .bind(site_id)
                .bind(&processed.sha256)
                .fetch_one(pool)
                .await?;
        return Ok((StatusCode::OK, existing));
    };
    for (width, data) in &processed.renditions {
        sqlx::query(
            "INSERT INTO brand_asset_renditions (asset_id, width, content_type, data) VALUES ($1, $2, 'image/webp', $3)",
        )
        .bind(id)
        .bind(*width as i32)
        .bind(data)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok((StatusCode::CREATED, id))
}

async fn asset_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, id, action)): Path<(String, Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let row = ensure_profile(&state.pool, &site).await?;
    let in_use = [
        parse(Some(row.draft)),
        parse(row.published),
        pending_config(&state.pool, site.id).await?,
    ]
    .iter()
    .flatten()
    .any(|c| c.asset_ids().contains(&id));
    let archived_at = match action.as_str() {
        "archive" if in_use => {
            return Err(ApiError::Conflict(
                "This file is in use. Choose another file for those places first, then archive it.",
            ));
        }
        "archive" => Some(Utc::now()),
        "restore" => None,
        _ => return Err(ApiError::NotFound),
    };
    let updated = sqlx::query("UPDATE brand_assets SET archived_at = $3 WHERE id = $1 AND site_id = $2")
        .bind(id)
        .bind(site.id)
        .bind(archived_at)
        .execute(&state.pool)
        .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    audit_site(
        &state.pool,
        &session,
        site.id,
        &format!("brand.asset_{action}d"),
        json!({ "asset": id }),
    )
    .await?;
    let asset = assets_by_id(&state.pool, &[id])
        .await?
        .remove(&id)
        .ok_or(ApiError::NotFound)?;
    Ok(Json(asset))
}

#[derive(Deserialize)]
struct SubmitInput {
    note: String,
}

/// Sends the current draft for publishing.
async fn submit(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<SubmitInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let row = ensure_profile(&state.pool, &site).await?;
    let note = input.note.trim();
    if note.is_empty() || note.chars().count() > 300 {
        return Err(ApiError::Validation(vec![FieldError {
            field: "note",
            code: "length",
            message: "Say what changed in up to 300 characters.",
        }]));
    }
    let config = decode(row.draft.clone())?;
    validate_assets(&state.pool, site.id, &config).await?;
    if !config.publishable() {
        return Err(ApiError::Conflict(
            "Fix the required brand checks before submitting.",
        ));
    }
    if row.published.as_ref() == Some(&row.draft) {
        return Err(ApiError::Conflict(
            "The draft is the same as the published brand.",
        ));
    }
    let id = Uuid::now_v7();
    let inserted = sqlx::query(
        "INSERT INTO brand_revisions (id, site_id, number, config, note, requested_by)
         VALUES ($1, $2, COALESCE((SELECT max(number) FROM brand_revisions WHERE site_id = $2), 0) + 1, $3, $4, $5)",
    )
    .bind(id)
    .bind(site.id)
    .bind(&row.draft)
    .bind(note)
    .bind(session.user.id)
    .execute(&state.pool)
    .await;
    if let Err(err) = inserted {
        return Err(match &err {
            sqlx::Error::Database(db) if db.constraint() == Some("brand_revisions_one_pending") => {
                ApiError::Conflict("A brand change is already waiting for approval.")
            }
            _ => err.into(),
        });
    }
    audit_site(
        &state.pool,
        &session,
        site.id,
        "brand.submitted",
        json!({ "revision": id, "note": note }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

#[derive(Deserialize, Default)]
struct DecisionInput {
    note: Option<String>,
}

async fn revision_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, id, action)): Path<(String, Uuid, String)>,
    body: Option<Json<DecisionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    let row = ensure_profile(&state.pool, &site).await?;
    let revision: Option<(Value, String, Option<Uuid>, i32)> = sqlx::query_as(
        "SELECT config, state, requested_by, number FROM brand_revisions WHERE id = $1 AND site_id = $2",
    )
    .bind(id)
    .bind(site.id)
    .fetch_optional(&state.pool)
    .await?;
    let (config, current, requested_by, number) = revision.ok_or(ApiError::NotFound)?;
    let note = body.and_then(|b| trimmed(b.0.note.as_deref()));
    if note.as_ref().is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::BadRequest("note is too long"));
    }
    let own = requested_by == Some(session.user.id);

    if action == "restore" {
        // Rollback: copy an earlier published version into the draft for review.
        session.require(Role::Editor)?;
        if current != "published" {
            return Err(ApiError::Conflict("Only published versions can be restored."));
        }
        let restored = decode(config.clone())?;
        validate_assets(&state.pool, site.id, &restored)
            .await
            .map_err(|_| {
                ApiError::Conflict("A file in that version has been archived. Restore the file first.")
            })?;
        sqlx::query(
            "UPDATE site_brands SET draft = $2, draft_note = $3, draft_version = draft_version + 1,
                    draft_updated_by = $4, draft_updated_at = now() WHERE site_id = $1",
        )
        .bind(site.id)
        .bind(&config)
        .bind(format!("Restored from version {number}"))
        .bind(session.user.id)
        .execute(&state.pool)
        .await?;
        audit_site(
            &state.pool,
            &session,
            site.id,
            "brand.version_restored",
            json!({ "revision": id, "number": number, "from": row.draft, "to": config }),
        )
        .await?;
        return Ok(Json(json!({ "restored": number })));
    }

    if current != "pending" {
        return Err(ApiError::Conflict("This change has already been decided."));
    }
    let outcome = match action.as_str() {
        "approve" => {
            session.require(Role::Reviewer)?;
            if own && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own change (maker-checker).",
                ));
            }
            let parsed = decode(config.clone())?;
            validate_assets(&state.pool, site.id, &parsed).await?;
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, id, "published", &session, &note).await?;
            sqlx::query(
                "UPDATE site_brands SET published = $2, published_revision = $3, published_at = now() WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(&config)
            .bind(id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            "published"
        }
        "reject" => {
            session.require(Role::Reviewer)?;
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, id, "rejected", &session, &note).await?;
            tx.commit().await?;
            "rejected"
        }
        "cancel" => {
            if !own && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "Only the requester or an owner can cancel this change.",
                ));
            }
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, id, "cancelled", &session, &note).await?;
            tx.commit().await?;
            "cancelled"
        }
        _ => return Err(ApiError::NotFound),
    };
    let detail = if outcome == "published" {
        json!({ "revision": id, "number": number, "from": row.published, "to": config,
                "self_approved": own, "note": note })
    } else {
        json!({ "revision": id, "number": number, "note": note })
    };
    audit_site(
        &state.pool,
        &session,
        site.id,
        &format!("brand.{outcome}"),
        detail,
    )
    .await?;
    Ok(Json(json!({ "state": outcome })))
}

async fn mark(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: Uuid,
    state: &str,
    session: &AdminSession,
    note: &Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE brand_revisions SET state = $2, decided_by = $3, decision_note = $4, decided_at = now()
          WHERE id = $1 AND state = 'pending'",
    )
    .bind(id)
    .bind(state)
    .bind(session.user.id)
    .bind(note)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
