//! Media library (P7-D2): images editors upload once per website and place
//! on its pages with the Image block.
//!
//! - Uploads go through the shared image pipeline (`brand::image`): the type
//!   is sniffed, SVGs are sanitised, rasters are decoded with limits, turned
//!   upright and re-encoded so no camera metadata reaches the website, and
//!   responsive renditions are made.
//! - Alt text is required (and editable); the bytes never change.
//! - Usage is read from the pages (`image_id` in sections, drafts and
//!   published versions). An image in use can't be archived.
//! - Publicly, an image is served only while a published page of a listed
//!   website uses it, the same rule as logos; the Studio sees every image.

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

use crate::{
    admin::{AdminSession, Role},
    brand::image::{self, Kind, MAX_MEDIA_BYTES},
    error::{ApiError, FieldError},
    pages::blocks::{Block, PageDoc},
    routes::SharedState,
    sites::{audit_site, trimmed},
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/media/{id}", get(public_media))
        .route("/v1/admin/media/{id}", get(admin_media).post(update))
        .route("/v1/admin/media/{id}/{action}", post(action))
        .route("/v1/admin/sites/{slug}/media", get(list))
}

/// Uploads, outside the API's small default body limit.
pub fn upload_router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/sites/{slug}/media/uploads", post(upload))
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_MEDIA_BYTES + 1024))
}

// ----------------------------------------------------------------- pages

/// The image ids a document's Image blocks use.
pub fn image_ids(doc: &PageDoc) -> Vec<Uuid> {
    let mut ids: Vec<Uuid> = doc
        .sections
        .iter()
        .filter_map(|s| match &s.block {
            Block::Image { image_id, .. } => Some(*image_id),
            _ => None,
        })
        .chain(doc.seo_image_id)
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

/// Refuses a document that uses images from another website or archived ones.
pub async fn check_refs(pool: &PgPool, site_id: Uuid, doc: &PageDoc) -> Result<(), ApiError> {
    let ids = image_ids(doc);
    if ids.is_empty() {
        return Ok(());
    }
    let found: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM media_assets WHERE site_id = $1 AND id = ANY($2) AND archived_at IS NULL",
    )
    .bind(site_id)
    .bind(&ids)
    .fetch_one(pool)
    .await?;
    if found as usize == ids.len() {
        Ok(())
    } else {
        Err(ApiError::Validation(vec![FieldError {
            field: "sections",
            code: "image",
            message: "Choose images from this website's media library (archived images can't be used).",
        }]))
    }
}

/// Adds each Image section's file details (`media`) to a rendered document.
/// On websites (`public`), a section whose image is missing or archived is
/// left out; previews keep it with `media: null` so editors see the gap.
pub async fn attach(
    pool: &PgPool,
    site_id: Uuid,
    rendered: &mut Value,
    public: bool,
) -> Result<(), sqlx::Error> {
    let seo_image = rendered["seo_image_id"]
        .as_str()
        .and_then(|id| Uuid::parse_str(id).ok());
    let Some(sections) = rendered["sections"].as_array_mut() else {
        return Ok(());
    };
    let ids: Vec<Uuid> = sections
        .iter()
        .filter(|s| s["type"] == "image")
        .filter_map(|s| s["image_id"].as_str().and_then(|id| Uuid::parse_str(id).ok()))
        .chain(seo_image)
        .collect();
    if ids.is_empty() {
        return Ok(());
    }
    /// What a website needs to show an image: its address comes from `id`,
    /// `widths` lists the renditions for `srcset`.
    #[derive(Serialize, FromRow)]
    struct MediaInfo {
        id: Uuid,
        alt: String,
        width: i32,
        height: i32,
        content_type: String,
        widths: Vec<i32>,
    }
    let rows: Vec<MediaInfo> = sqlx::query_as(
        "SELECT m.id, m.alt_text AS alt, m.width, m.height, m.content_type,
                COALESCE((SELECT array_agg(r.width ORDER BY r.width) FROM media_renditions r WHERE r.asset_id = m.id),
                         '{}') AS widths
           FROM media_assets m WHERE m.site_id = $1 AND m.id = ANY($2) AND m.archived_at IS NULL",
    )
    .bind(site_id)
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    for section in sections.iter_mut().filter(|s| s["type"] == "image") {
        let id = section["image_id"]
            .as_str()
            .and_then(|id| Uuid::parse_str(id).ok());
        section["media"] = rows
            .iter()
            .find(|r| Some(r.id) == id)
            .and_then(|r| serde_json::to_value(r).ok())
            .unwrap_or(Value::Null);
    }
    if public {
        sections.retain(|s| s["type"] != "image" || !s["media"].is_null());
    }
    // The page's sharing image, when it's still in the library.
    rendered["seo_image"] = rows
        .iter()
        .find(|r| Some(r.id) == seo_image)
        .and_then(|r| serde_json::to_value(r).ok())
        .unwrap_or(Value::Null);
    Ok(())
}

// ----------------------------------------------------------------- delivery

#[derive(Deserialize)]
struct SizeQuery {
    w: Option<i32>,
}

async fn bytes(pool: &PgPool, id: Uuid, width: Option<i32>) -> Result<(String, Vec<u8>), ApiError> {
    if let Some(w) = width.filter(|w| *w > 0) {
        let rendition: Option<(String, Vec<u8>)> = sqlx::query_as(
            "SELECT content_type, data FROM media_renditions WHERE asset_id = $1 AND width >= $2 ORDER BY width LIMIT 1",
        )
        .bind(id)
        .bind(w)
        .fetch_optional(pool)
        .await?;
        if let Some(found) = rendition {
            return Ok(found);
        }
    }
    sqlx::query_as("SELECT content_type, data FROM media_assets WHERE id = $1")
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
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    // An SVG opened directly can never run anything.
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; style-src 'unsafe-inline'; sandbox"),
    );
    (headers, data).into_response()
}

/// Public: only images a published page of a listed website uses. The bytes
/// never change, so they cache for a long time.
async fn public_media(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
    Query(size): Query<SizeQuery>,
) -> Result<Response, ApiError> {
    let live: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM media_assets m
              JOIN pages p ON p.site_id = m.site_id
              JOIN sites s ON s.id = p.site_id
             WHERE m.id = $1 AND m.archived_at IS NULL
               AND p.archived_at IS NULL AND NOT p.offline AND p.published IS NOT NULL
               AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')
               AND (jsonb_path_exists(p.published, '$.sections[*] ? (@.image_id == $id)', jsonb_build_object('id', $1::text))
                    OR p.published->>'seo_image_id' = $1::text))
         -- Logos and photos of published Trusted By organisations and testimonials (P10).
         OR EXISTS (SELECT 1 FROM proof_items pi JOIN media_assets m ON m.id = $1 AND m.archived_at IS NULL
                     WHERE pi.published IS NOT NULL AND pi.active AND pi.archived_at IS NULL AND pi.published_sites <> '{}'
                       AND $1::text IN (pi.published->>'logo_id', pi.published->>'favicon_id', pi.published->>'photo_id'))",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    if !live {
        return Err(ApiError::NotFound);
    }
    Ok(image_response(
        bytes(&state.pool, id, size.w).await?,
        "public, max-age=31536000, immutable",
    ))
}

async fn admin_media(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Query(size): Query<SizeQuery>,
) -> Result<Response, ApiError> {
    session.require(Role::Viewer)?;
    if !session.all_sites() {
        let site: Option<Uuid> = sqlx::query_scalar("SELECT site_id FROM media_assets WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
        session.require_site(site.ok_or(ApiError::NotFound)?, Role::Viewer)?;
    }
    Ok(image_response(
        bytes(&state.pool, id, size.w).await?,
        "private, max-age=86400",
    ))
}

// ----------------------------------------------------------------- studio

#[derive(Serialize, FromRow)]
struct MediaRow {
    id: Uuid,
    label: String,
    alt_text: String,
    content_type: String,
    width: i32,
    height: i32,
    byte_size: i32,
    archived_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    created_by: Option<String>,
}

async fn site_id(pool: &PgPool, slug: &str) -> Result<Uuid, ApiError> {
    sqlx::query_scalar("SELECT id FROM sites WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

/// Where each image is used: (image id, page id, title, path, "draft" | "published").
async fn usage(
    pool: &PgPool,
    site_id: Uuid,
) -> Result<Vec<(String, Uuid, String, String, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT DISTINCT u.image_id, p.id, p.title, p.path, u.state
           FROM pages p,
                LATERAL (SELECT jsonb_path_query(p.draft, '$.sections[*].image_id') #>> '{}' AS image_id,
                                'draft'::text AS state
                         UNION ALL
                         SELECT jsonb_path_query(p.published, '$.sections[*].image_id') #>> '{}', 'published'
                         UNION ALL
                         SELECT p.draft->>'seo_image_id', 'draft' WHERE p.draft ? 'seo_image_id'
                         UNION ALL
                         SELECT p.published->>'seo_image_id', 'published' WHERE p.published ? 'seo_image_id') u
          WHERE p.site_id = $1 AND p.archived_at IS NULL
          ORDER BY p.title",
    )
    .bind(site_id)
    .fetch_all(pool)
    .await
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site_id(&state.pool, &slug).await?;
    session.require_site(site, Role::Viewer)?;
    let rows: Vec<MediaRow> = sqlx::query_as(
        "SELECT m.id, m.label, m.alt_text, m.content_type, m.width, m.height, m.byte_size, m.archived_at,
                m.created_at, u.name AS created_by
           FROM media_assets m LEFT JOIN admin_users u ON u.id = m.created_by
          WHERE m.site_id = $1 ORDER BY m.archived_at IS NOT NULL, m.created_at DESC",
    )
    .bind(site)
    .fetch_all(&state.pool)
    .await?;
    let used = usage(&state.pool, site).await?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let id = row.id.to_string();
            let mut value = serde_json::to_value(&row).unwrap_or(Value::Null);
            value["used_on"] = json!(used
                .iter()
                .filter(|u| u.0 == id)
                .map(|(_, page, title, path, state)| json!({ "page": page, "title": title, "path": format!("/{path}"), "state": state }))
                .collect::<Vec<_>>());
            value
        })
        .collect();
    Ok(Json(
        json!({ "items": items, "can_edit": session.site_role(site) >= Some(Role::Editor) }),
    ))
}

#[derive(Deserialize)]
struct UploadQuery {
    label: Option<String>,
    alt: Option<String>,
}

fn text_errors(label: Option<&str>, alt: Option<&str>) -> (Option<String>, Option<String>, Vec<FieldError>) {
    let mut errors = Vec::new();
    let label = trimmed(label).filter(|l| l.chars().count() <= 120);
    let alt = trimmed(alt).filter(|a| a.chars().count() <= 250);
    if label.is_none() {
        errors.push(FieldError {
            field: "label",
            code: "required",
            message: "Name this image (up to 120 characters).",
        });
    }
    if alt.is_none() {
        errors.push(FieldError {
            field: "alt_text",
            code: "required",
            message: "Describe the image for people who can't see it (up to 250 characters).",
        });
    }
    (label, alt, errors)
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
    let site = site_id(&state.pool, &slug).await?;
    session.require_site(site, Role::Editor)?;
    let (label, alt, mut errors) = text_errors(query.label.as_deref(), query.alt.as_deref());
    let declared = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(Kind::from_content_type);
    // Decoding and resizing is CPU work: keep it off the async workers, and
    // skip it when the upload would be refused for its name or alt text.
    let processed = match declared {
        None => Err(image::MediaRejection::Type),
        Some(kind) if !errors.is_empty() => match image::sniff(&body) {
            Some(found) if found == kind => {
                return Err(ApiError::Validation(errors));
            }
            Some(_) => Err(image::MediaRejection::Mismatch),
            None => Err(image::MediaRejection::Type),
        },
        Some(kind) => tokio::task::spawn_blocking(move || image::process_media(&body, kind))
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?,
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
    let mut tx = state.pool.begin().await?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO media_assets (id, site_id, label, alt_text, content_type, width, height, has_alpha,
                                   byte_size, sha256, data, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (site_id, sha256) DO NOTHING RETURNING id",
    )
    .bind(Uuid::now_v7())
    .bind(site)
    .bind(&label)
    .bind(&alt)
    .bind(processed.content_type)
    .bind(processed.width as i32)
    .bind(processed.height as i32)
    .bind(processed.has_alpha)
    .bind(processed.data.len() as i32)
    .bind(&processed.sha256)
    .bind(&processed.data)
    .bind(session.user.id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(id) = inserted else {
        // The same file is already in this website's library.
        tx.rollback().await?;
        let existing: Uuid =
            sqlx::query_scalar("SELECT id FROM media_assets WHERE site_id = $1 AND sha256 = $2")
                .bind(site)
                .bind(&processed.sha256)
                .fetch_one(&state.pool)
                .await?;
        return Ok((StatusCode::OK, Json(json!({ "id": existing, "duplicate": true }))));
    };
    for (width, content_type, data) in &processed.renditions {
        sqlx::query(
            "INSERT INTO media_renditions (asset_id, width, content_type, data) VALUES ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(*width as i32)
        .bind(*content_type)
        .bind(data)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    audit_site(
        &state.pool,
        &session,
        site,
        "media.uploaded",
        json!({ "media": id, "label": label, "content_type": processed.content_type,
                "width": processed.width, "height": processed.height }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": id, "duplicate": false }))))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    label: String,
    alt_text: String,
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let (label, alt, errors) = text_errors(Some(&input.label), Some(&input.alt_text));
    let (Some(label), Some(alt)) = (label, alt) else {
        return Err(ApiError::Validation(errors));
    };
    let before: Option<(Uuid, String, String)> =
        sqlx::query_as("SELECT m.site_id, m.label, m.alt_text FROM media_assets m WHERE m.id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (site, old_label, old_alt) = before.ok_or(ApiError::NotFound)?;
    session.require_site(site, Role::Editor)?;
    sqlx::query("UPDATE media_assets SET label = $2, alt_text = $3, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(&label)
        .bind(&alt)
        .execute(&state.pool)
        .await?;
    audit_site(
        &state.pool,
        &session,
        site,
        "media.updated",
        json!({ "media": id, "before": { "label": old_label, "alt_text": old_alt },
                "after": { "label": label, "alt_text": alt } }),
    )
    .await?;
    Ok(Json(json!({ "id": id, "label": label, "alt_text": alt })))
}

async fn action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let row: Option<(Uuid, Option<DateTime<Utc>>)> =
        sqlx::query_as("SELECT site_id, archived_at FROM media_assets WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (site, archived_at) = row.ok_or(ApiError::NotFound)?;
    session.require_site(site, Role::Editor)?;
    match action.as_str() {
        "archive" => {
            if archived_at.is_some() {
                return Err(ApiError::Conflict("This image is already archived."));
            }
            let key = id.to_string();
            if usage(&state.pool, site).await?.iter().any(|u| u.0 == key) {
                return Err(ApiError::Conflict(
                    "This image is used on a page. Remove it from those pages (and publish) first.",
                ));
            }
            sqlx::query("UPDATE media_assets SET archived_at = now(), updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await?;
            audit_site(
                &state.pool,
                &session,
                site,
                "media.archived",
                json!({ "media": id }),
            )
            .await?;
        }
        "restore" => {
            if archived_at.is_none() {
                return Err(ApiError::Conflict("This image isn't archived."));
            }
            sqlx::query("UPDATE media_assets SET archived_at = NULL, updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await?;
            audit_site(
                &state.pool,
                &session,
                site,
                "media.restored",
                json!({ "media": id }),
            )
            .await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    Ok(Json(json!({ "id": id })))
}
