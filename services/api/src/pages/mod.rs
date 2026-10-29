//! Admin Studio, Phase C: pages built from typed blocks (D17) with drafts,
//! approved versions and rollback (D20).
//!
//! Each page has a working draft (autosaved, never public) and published
//! versions. Publishing is a revision a second person approves (maker-checker;
//! owners may approve their own, audited). Restoring a version copies it into
//! the draft for review. Websites read published documents only.
//!
//! A submission may ask to go live at a set time (`publish_at`). Approval is
//! still required; an approved change then waits as `scheduled` while the
//! current version stays live, until [`publish_due`] publishes it.

pub mod blocks;
pub mod import;
pub mod templates;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use tower_http::limit::RequestBodyLimitLayer;
use uuid::Uuid;

use self::blocks::PageDoc;
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    routes::SharedState,
    sites::{audit_site, trimmed},
};

/// Page documents are larger than forms; they get their own body limit.
pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/pages", get(public_list))
        .route("/v1/sites/{slug}/page", get(public_page))
        .route("/v1/redirects", get(public_redirects))
        .route("/v1/admin/pages/{id}/redirects/remove", post(remove_redirect))
        .route("/v1/admin/sites/{slug}/pages", get(list).post(create))
        .route("/v1/admin/sites/{slug}/pages/order", post(reorder))
        .route("/v1/admin/pages/{id}", get(read))
        .route("/v1/admin/pages/{id}/draft", post(save_draft))
        .route("/v1/admin/pages/{id}/submit", post(submit))
        .route(
            "/v1/admin/pages/{id}/revisions/{revision}/{action}",
            post(revision_action),
        )
        .route("/v1/admin/pages/{id}/{action}", post(page_action))
        .layer(RequestBodyLimitLayer::new(512 * 1024))
}

// ---------------------------------------------------------------- shared

#[derive(FromRow)]
struct SiteRef {
    id: Uuid,
    slug: String,
    name: String,
    tagline: Option<String>,
    category: String,
    status: String,
}

async fn site(pool: &PgPool, slug: &str) -> Result<SiteRef, ApiError> {
    sqlx::query_as("SELECT id, slug, name, tagline, category, status FROM sites WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

#[derive(FromRow, Serialize)]
struct PageRow {
    id: Uuid,
    site_id: Uuid,
    path: String,
    title: String,
    position: i32,
    draft: Value,
    draft_version: i32,
    draft_updated_at: DateTime<Utc>,
    draft_updated_by: Option<String>,
    published: Option<Value>,
    published_revision: Option<Uuid>,
    published_at: Option<DateTime<Utc>>,
    archived_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    offline: bool,
    show_in_nav: bool,
}

macro_rules! page_select {
    () => {
        "SELECT p.id, p.site_id, p.path, p.title, p.position, p.draft, p.draft_version, p.draft_updated_at,
                u.name AS draft_updated_by, p.published, p.published_revision, p.published_at, p.archived_at,
                p.created_at, p.offline, p.show_in_nav
           FROM pages p LEFT JOIN admin_users u ON u.id = p.draft_updated_by "
    };
}

async fn page(pool: &PgPool, id: Uuid) -> Result<PageRow, ApiError> {
    sqlx::query_as(concat!(page_select!(), "WHERE p.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

fn decode(value: Value) -> Result<PageDoc, ApiError> {
    let doc: PageDoc = serde_json::from_value(value).map_err(|_| {
        ApiError::Validation(vec![FieldError {
            field: "sections",
            code: "format",
            message: "The page couldn't be read. Reload and try again.",
        }])
    })?;
    doc.validate().map_err(ApiError::Validation)?;
    Ok(doc)
}

fn validate_meta(title: &str, path: &str) -> Result<(), ApiError> {
    let mut errors = Vec::new();
    let len = title.trim().chars().count();
    if len == 0 || len > 120 {
        errors.push(FieldError {
            field: "title",
            code: "length",
            message: "Page titles need 1–120 characters.",
        });
    }
    let segment = |s: &str| {
        !s.is_empty()
            && s.len() <= 60
            && s.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && !s.starts_with('-')
            && !s.ends_with('-')
            && !s.contains("--")
    };
    if !(path.is_empty() || (path.split('/').count() <= 3 && path.split('/').all(segment))) {
        errors.push(FieldError {
            field: "path",
            code: "format",
            message: "Use lower-case words joined by hyphens, with up to three levels (e.g. solutions/banks). Leave empty for the home page.",
        });
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(ApiError::Validation(errors))
    }
}

fn path_taken(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.constraint() == Some("pages_site_path"))
}

fn taken() -> ApiError {
    ApiError::Validation(vec![FieldError {
        field: "path",
        code: "taken",
        message: "Another page on this website already uses this address.",
    }])
}

// ---------------------------------------------------------------- public

/// A website's published pages, for navigation and sitemaps. Only listed websites.
async fn public_list(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    // Offline pages are left out entirely; `show_in_nav` tells websites which
    // pages belong in their navigation (the others stay reachable by address).
    /// A published page as websites list it; `noindex` pages stay out of sitemaps.
    #[derive(Serialize, FromRow)]
    struct Listed {
        path: String,
        title: String,
        published_at: Option<DateTime<Utc>>,
        show_in_nav: bool,
        noindex: bool,
    }
    let pages: Vec<Listed> = sqlx::query_as(
        "SELECT p.path, p.title, p.published_at, p.show_in_nav,
                COALESCE((p.published->>'seo_noindex')::boolean, false) AS noindex
           FROM pages p JOIN sites s ON s.id = p.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')
            AND p.archived_at IS NULL AND p.published IS NOT NULL AND NOT p.offline
          ORDER BY p.position, p.path",
    )
    .bind(&slug)
    .fetch_all(&state.pool)
    .await?;
    Ok((cache_headers(), Json(pages)))
}

#[derive(Deserialize)]
struct PathQuery {
    #[serde(default)]
    path: String,
}

async fn public_page(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
    Query(query): Query<PathQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let row: Option<(Uuid, String, Value, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT s.id, p.title, p.published, p.published_at FROM pages p JOIN sites s ON s.id = p.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')
            AND p.path = $2 AND p.archived_at IS NULL AND p.published IS NOT NULL AND NOT p.offline",
    )
    .bind(&slug)
    .bind(query.path.trim_matches('/'))
    .fetch_optional(&state.pool)
    .await?;
    let (site_id, title, published, published_at) = row.ok_or(ApiError::NotFound)?;
    let doc: PageDoc = serde_json::from_value(published).map_err(|e| ApiError::Internal(e.to_string()))?;
    let mut value = doc.render(false);
    crate::media::attach(&state.pool, site_id, &mut value, true).await?;
    value["title"] = json!(title);
    value["published_at"] = json!(published_at);
    Ok((cache_headers(), Json(value)))
}

/// Every active redirect of listed websites (P7-G1): an old address of a
/// published, online page that no live page has taken since. The renderer
/// keeps this list for a minute and answers old addresses with a 308.
async fn public_redirects(State(state): State<SharedState>) -> Result<impl IntoResponse, ApiError> {
    #[derive(Serialize, FromRow)]
    struct Redirect {
        site: String,
        from: String,
        to: String,
    }
    let redirects: Vec<Redirect> = sqlx::query_as(
        "SELECT s.slug AS site, '/' || r.from_path AS from, '/' || p.path AS to
           FROM page_redirects r
           JOIN pages p ON p.id = r.page_id
           JOIN sites s ON s.id = r.site_id
          WHERE s.archived_at IS NULL AND s.status IN ('coming_soon', 'beta', 'active')
            AND p.archived_at IS NULL AND p.published IS NOT NULL AND NOT p.offline AND p.path <> r.from_path
            AND NOT EXISTS (SELECT 1 FROM pages live WHERE live.site_id = r.site_id AND live.path = r.from_path
                              AND live.archived_at IS NULL AND live.published IS NOT NULL AND NOT live.offline)
          ORDER BY s.slug, r.from_path",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok((cache_headers(), Json(redirects)))
}

#[derive(Deserialize)]
struct RedirectInput {
    from_path: String,
}

/// Stops an old address forwarding to this page (it then answers "not found").
async fn remove_redirect(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<RedirectInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let page = page(&state.pool, id).await?;
    let from = input.from_path.trim_matches('/').to_owned();
    let removed = sqlx::query("DELETE FROM page_redirects WHERE page_id = $1 AND from_path = $2")
        .bind(id)
        .bind(&from)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if removed == 0 {
        return Err(ApiError::NotFound);
    }
    audit_site(
        &state.pool,
        &session,
        page.site_id,
        "page.redirect_removed",
        json!({ "page": id, "from_path": format!("/{from}") }),
    )
    .await?;
    Ok(Json(json!({ "removed": format!("/{from}") })))
}

fn cache_headers() -> [(header::HeaderName, HeaderValue); 1] {
    [(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=60, stale-while-revalidate=300"),
    )]
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
    publish_at: Option<DateTime<Utc>>,
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site(&state.pool, &slug).await?;
    let rows: Vec<PageRow> = sqlx::query_as(concat!(
        page_select!(),
        "WHERE p.site_id = $1 ORDER BY p.archived_at IS NOT NULL, p.position, p.path"
    ))
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let in_flight: Vec<(Uuid, String, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT r.page_id, r.state, r.publish_at FROM page_revisions r JOIN pages p ON p.id = r.page_id
          WHERE p.site_id = $1 AND r.state IN ('pending', 'scheduled')",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let pages: Vec<Value> = rows
        .iter()
        .map(|p| {
            json!({
                "id": p.id, "path": p.path, "title": p.title, "position": p.position,
                "sections": p.draft["sections"].as_array().map_or(0, Vec::len),
                "published": p.published.is_some(), "published_at": p.published_at,
                "draft_differs": p.published.as_ref() != Some(&p.draft),
                "pending": in_flight.iter().any(|(page, state, _)| *page == p.id && state == "pending"),
                "scheduled_at": in_flight
                    .iter()
                    .find(|(page, state, _)| *page == p.id && state == "scheduled")
                    .and_then(|(_, _, at)| *at),
                "archived_at": p.archived_at, "draft_updated_at": p.draft_updated_at,
                "offline": p.offline, "show_in_nav": p.show_in_nav,
                "hidden_sections": p.draft["sections"].as_array()
                    .map_or(0, |s| s.iter().filter(|x| x["hidden"] == true).count()),
            })
        })
        .collect();
    let templates: Vec<&templates::Template> = templates::for_category(&site.category).collect();
    Ok(Json(json!({
        "site": { "slug": site.slug, "name": site.name, "category": site.category },
        "pages": pages,
        "templates": templates,
    })))
}

#[derive(Deserialize)]
struct CreateInput {
    title: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    template: Option<String>,
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<CreateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let path = input.path.trim().trim_matches('/').to_owned();
    validate_meta(&input.title, &path)?;
    let template = input.template.as_deref().unwrap_or("blank");
    let context = templates::Context {
        site_name: &site.name,
        tagline: site.tagline.as_deref(),
        category: &site.category,
        status: &site.status,
    };
    let doc = templates::document(template, &context).ok_or_else(|| {
        ApiError::Validation(vec![FieldError {
            field: "template",
            code: "unknown",
            message: "Choose a template.",
        }])
    })?;
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO pages (id, site_id, path, title, position, draft, draft_updated_by, created_by)
         VALUES ($1, $2, $3, $4, COALESCE((SELECT max(position) + 1 FROM pages WHERE site_id = $2), 0), $5, $6, $6)",
    )
    .bind(id)
    .bind(site.id)
    .bind(&path)
    .bind(input.title.trim())
    .bind(serde_json::to_value(&doc).map_err(|e| ApiError::Internal(e.to_string()))?)
    .bind(session.user.id)
    .execute(&state.pool)
    .await
    .map_err(|err| if path_taken(&err) { taken() } else { err.into() })?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "page.created",
        json!({ "page": id, "path": path, "template": template }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let page = page(&state.pool, id).await?;
    let site: (String, String, Value) =
        sqlx::query_as("SELECT slug, name, settings FROM sites WHERE id = $1")
            .bind(page.site_id)
            .fetch_one(&state.pool)
            .await?;
    // The website's section band colours, so previews look like the website.
    let theme = crate::site_settings::WebsiteSettings::from_stored(site.2).theme;
    let revisions: Vec<Revision> = sqlx::query_as(
        "SELECT r.id, r.number, r.note, r.state, rq.name AS requested_by, r.requested_by AS requested_by_id,
                dc.name AS decided_by, r.decision_note, r.created_at, r.decided_at, r.publish_at
           FROM page_revisions r
           LEFT JOIN admin_users rq ON rq.id = r.requested_by
           LEFT JOIN admin_users dc ON dc.id = r.decided_by
          WHERE r.page_id = $1 ORDER BY r.number DESC LIMIT 30",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let draft_differs = page.published.as_ref() != Some(&page.draft);
    let mut preview = serde_json::from_value::<PageDoc>(page.draft.clone())
        .map(|d| d.render(true))
        .ok();
    if let Some(preview) = preview.as_mut() {
        crate::media::attach(&state.pool, page.site_id, preview, false).await?;
    }
    let redirects: Vec<(String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT from_path, created_at FROM page_redirects WHERE page_id = $1 ORDER BY created_at DESC",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({
        "page": page,
        "redirects": redirects.into_iter().map(|(from, at)| json!({ "from_path": format!("/{from}"), "created_at": at })).collect::<Vec<_>>(),
        "site": { "slug": site.0, "name": site.1, "theme": theme },
        "draft_differs": draft_differs,
        "preview": preview,
        "revisions": revisions,
    })))
}

#[derive(Deserialize)]
struct DraftInput {
    title: String,
    #[serde(default)]
    path: String,
    document: Value,
    version: i32,
}

/// Autosave target: updates the draft (and the page's title and address). Never publishes.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let previous = page(&state.pool, id).await?;
    if previous.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this page before editing it."));
    }
    let path = input.path.trim().trim_matches('/').to_owned();
    validate_meta(&input.title, &path)?;
    let doc = decode(input.document)?;
    crate::media::check_refs(&state.pool, previous.site_id, &doc).await?;
    let value = serde_json::to_value(&doc).map_err(|e| ApiError::Internal(e.to_string()))?;
    let updated = sqlx::query(
        "UPDATE pages SET title = $3, path = $4, draft = $5, draft_version = draft_version + 1,
                draft_updated_by = $6, draft_updated_at = now()
          WHERE id = $1 AND draft_version = $2",
    )
    .bind(id)
    .bind(input.version)
    .bind(input.title.trim())
    .bind(&path)
    .bind(&value)
    .bind(session.user.id)
    .execute(&state.pool)
    .await
    .map_err(|err| if path_taken(&err) { taken() } else { err.into() })?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "Someone else changed this page. Reload to see their changes.",
        ));
    }
    // The address a page now uses is no longer an old address of any page.
    sqlx::query("DELETE FROM page_redirects WHERE site_id = $1 AND from_path = $2")
        .bind(previous.site_id)
        .bind(&path)
        .execute(&state.pool)
        .await?;
    if previous.path != path && previous.published.is_some() {
        // A published page moved: its old address forwards to it.
        sqlx::query(
            "INSERT INTO page_redirects (site_id, from_path, page_id, created_by) VALUES ($1, $2, $3, $4)
             ON CONFLICT (site_id, from_path) DO UPDATE SET page_id = EXCLUDED.page_id,
                    created_by = EXCLUDED.created_by, created_at = now()",
        )
        .bind(previous.site_id)
        .bind(&previous.path)
        .bind(id)
        .bind(session.user.id)
        .execute(&state.pool)
        .await?;
    }
    if previous.draft != value || previous.title != input.title.trim() || previous.path != path {
        audit_site(
            &state.pool,
            &session,
            previous.site_id,
            "page.draft_saved",
            json!({ "page": id,
                    "from": { "title": previous.title, "path": previous.path, "document": previous.draft },
                    "to": { "title": input.title.trim(), "path": path, "document": value } }),
        )
        .await?;
    }
    let mut preview = doc.render(true);
    crate::media::attach(&state.pool, previous.site_id, &mut preview, false).await?;
    Ok(Json(
        json!({ "draft_version": input.version + 1, "preview": preview }),
    ))
}

#[derive(Deserialize)]
struct SubmitInput {
    note: String,
    /// When the approved change should go live; omitted means on approval.
    #[serde(default)]
    publish_at: Option<DateTime<Utc>>,
}

/// The furthest ahead a change can be scheduled.
const MAX_SCHEDULE_DAYS: i64 = 366;

async fn submit(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<SubmitInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let page = page(&state.pool, id).await?;
    let note = input.note.trim();
    if note.is_empty() || note.chars().count() > 300 {
        return Err(ApiError::Validation(vec![FieldError {
            field: "note",
            code: "length",
            message: "Say what changed in up to 300 characters.",
        }]));
    }
    if page.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this page before publishing it."));
    }
    let doc = decode(page.draft.clone())?;
    if doc.sections.is_empty() {
        return Err(ApiError::Conflict("Add at least one section before submitting."));
    }
    if page.published.as_ref() == Some(&page.draft) {
        return Err(ApiError::Conflict("The draft is the same as the published page."));
    }
    if let Some(at) = input.publish_at {
        let now = Utc::now();
        let message = if at <= now + chrono::Duration::minutes(1) {
            Some("Choose a time at least a minute from now.")
        } else if at > now + chrono::Duration::days(MAX_SCHEDULE_DAYS) {
            Some("Choose a time within the next year.")
        } else {
            None
        };
        if let Some(message) = message {
            return Err(ApiError::Validation(vec![FieldError {
                field: "publish_at",
                code: "range",
                message,
            }]));
        }
    }
    let revision = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO page_revisions (id, page_id, number, document, note, requested_by, publish_at)
         VALUES ($1, $2, COALESCE((SELECT max(number) FROM page_revisions WHERE page_id = $2), 0) + 1, $3, $4, $5, $6)",
    )
    .bind(revision)
    .bind(id)
    .bind(&page.draft)
    .bind(note)
    .bind(session.user.id)
    .bind(input.publish_at)
    .execute(&state.pool)
    .await
    .map_err(|err| match &err {
        sqlx::Error::Database(db) if db.constraint() == Some("page_revisions_one_pending") => {
            ApiError::Conflict("A change to this page is already waiting for approval or scheduled.")
        }
        _ => err.into(),
    })?;
    audit_site(
        &state.pool,
        &session,
        page.site_id,
        "page.submitted",
        json!({ "page": id, "revision": revision, "note": note, "publish_at": input.publish_at }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": revision }))))
}

#[derive(Deserialize, Default)]
struct DecisionInput {
    note: Option<String>,
}

async fn revision_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, revision, action)): Path<(Uuid, Uuid, String)>,
    body: Option<Json<DecisionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    let page = page(&state.pool, id).await?;
    #[derive(FromRow)]
    struct Decided {
        document: Value,
        state: String,
        requested_by: Option<Uuid>,
        number: i32,
        publish_at: Option<DateTime<Utc>>,
    }
    let row: Option<Decided> = sqlx::query_as(
        "SELECT document, state, requested_by, number, publish_at FROM page_revisions WHERE id = $1 AND page_id = $2",
    )
    .bind(revision)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let Decided {
        document,
        state: current,
        requested_by,
        number,
        publish_at,
    } = row.ok_or(ApiError::NotFound)?;
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
        sqlx::query(
            "UPDATE pages SET draft = $2, draft_version = draft_version + 1, draft_updated_by = $3,
                    draft_updated_at = now() WHERE id = $1",
        )
        .bind(id)
        .bind(&document)
        .bind(session.user.id)
        .execute(&state.pool)
        .await?;
        audit_site(
            &state.pool,
            &session,
            page.site_id,
            "page.version_restored",
            json!({ "page": id, "number": number, "from": page.draft, "to": document }),
        )
        .await?;
        return Ok(Json(json!({ "restored": number })));
    }
    // A scheduled change can still be called off before it goes live.
    let open = current == "pending" || (current == "scheduled" && action == "cancel");
    if !open {
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
            decode(document.clone())?;
            let mut tx = state.pool.begin().await?;
            if publish_at.is_some_and(|at| at > Utc::now()) {
                // Approved for later: the current version stays live until then.
                mark(&mut tx, revision, "scheduled", &session, &note).await?;
                tx.commit().await?;
                audit_site(
                    &state.pool,
                    &session,
                    page.site_id,
                    "page.scheduled",
                    json!({ "page": id, "revision": revision, "number": number, "publish_at": publish_at,
                            "self_approved": own, "note": note }),
                )
                .await?;
                return Ok(Json(json!({ "state": "scheduled", "publish_at": publish_at })));
            }
            mark(&mut tx, revision, "published", &session, &note).await?;
            sqlx::query("UPDATE pages SET published = $2, published_revision = $3, published_at = now() WHERE id = $1")
                .bind(id)
                .bind(&document)
                .bind(revision)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            "published"
        }
        "reject" => {
            session.require(Role::Reviewer)?;
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, revision, "rejected", &session, &note).await?;
            tx.commit().await?;
            "rejected"
        }
        "cancel" => {
            // Reviewers may also call off a schedule that was approved.
            let unschedule = current == "scheduled" && session.user.role >= Role::Reviewer;
            if !own && session.user.role != Role::Owner && !unschedule {
                return Err(ApiError::NotPermitted(
                    "Only the requester or an owner can cancel this change.",
                ));
            }
            let mut tx = state.pool.begin().await?;
            mark(&mut tx, revision, "cancelled", &session, &note).await?;
            tx.commit().await?;
            "cancelled"
        }
        _ => return Err(ApiError::NotFound),
    };
    let detail = if outcome == "published" {
        json!({ "page": id, "revision": revision, "number": number, "from": page.published, "to": document,
                "self_approved": own, "note": note })
    } else {
        json!({ "page": id, "revision": revision, "number": number, "note": note })
    };
    audit_site(
        &state.pool,
        &session,
        page.site_id,
        &format!("page.{outcome}"),
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
        "UPDATE page_revisions SET state = $2, decided_by = $3, decision_note = $4, decided_at = now()
          WHERE id = $1 AND state IN ('pending', 'scheduled')",
    )
    .bind(id)
    .bind(state)
    .bind(session.user.id)
    .bind(note)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Archive (unpublishes from websites), restore, or duplicate a page.
async fn page_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let page = page(&state.pool, id).await?;
    match action.as_str() {
        "archive" => {
            // Archiving takes a page off the websites, so it needs a reviewer.
            session.require(Role::Reviewer)?;
            if page.archived_at.is_some() {
                return Err(ApiError::Conflict("This page is already archived."));
            }
            sqlx::query("UPDATE pages SET archived_at = now() WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await?;
            sqlx::query("UPDATE page_revisions SET state = 'cancelled', decided_at = now() WHERE page_id = $1 AND state IN ('pending', 'scheduled')")
                .bind(id)
                .execute(&state.pool)
                .await?;
            audit_site(
                &state.pool,
                &session,
                page.site_id,
                "page.archived",
                json!({ "page": id, "path": page.path }),
            )
            .await?;
            Ok(Json(json!({ "id": id })))
        }
        "restore" => {
            session.require(Role::Reviewer)?;
            if page.archived_at.is_none() {
                return Err(ApiError::Conflict("This page isn't archived."));
            }
            sqlx::query("UPDATE pages SET archived_at = NULL WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await
                .map_err(|err| {
                    if path_taken(&err) {
                        ApiError::Conflict("Another page now uses this address. Change one of them first.")
                    } else {
                        err.into()
                    }
                })?;
            audit_site(
                &state.pool,
                &session,
                page.site_id,
                "page.restored",
                json!({ "page": id }),
            )
            .await?;
            Ok(Json(json!({ "id": id })))
        }
        // Visibility changes the live website at once, so it needs a reviewer;
        // content and versions are kept, and each change is audited and reversible.
        "offline" | "online" | "show-in-nav" | "hide-from-nav" => {
            session.require(Role::Reviewer)?;
            if page.archived_at.is_some() {
                return Err(ApiError::Conflict("Restore this page first."));
            }
            if action == "offline" && page.path.is_empty() {
                return Err(ApiError::Conflict(
                    "The home page can't be taken offline: it is the website's front door.",
                ));
            }
            let (column, value) = match action.as_str() {
                "offline" => ("offline", true),
                "online" => ("offline", false),
                "show-in-nav" => ("show_in_nav", true),
                _ => ("show_in_nav", false),
            };
            let current = if column == "offline" {
                page.offline
            } else {
                page.show_in_nav
            };
            if current != value {
                let sql = if column == "offline" {
                    "UPDATE pages SET offline = $2 WHERE id = $1"
                } else {
                    "UPDATE pages SET show_in_nav = $2 WHERE id = $1"
                };
                sqlx::query(sql).bind(id).bind(value).execute(&state.pool).await?;
                audit_site(
                    &state.pool,
                    &session,
                    page.site_id,
                    &format!("page.{}", action.replace('-', "_")),
                    json!({ "page": id, "path": page.path, "from": current, "to": value }),
                )
                .await?;
            }
            Ok(Json(json!({ "id": id, column: value })))
        }
        "duplicate" => {
            session.require(Role::Editor)?;
            // A copy is a new draft at a free address: "<path>-copy", "-copy-2", …
            let base = if page.path.is_empty() {
                "home".to_owned()
            } else {
                page.path.clone()
            };
            let new_id = Uuid::now_v7();
            for n in 1..=20 {
                let path = if n == 1 {
                    format!("{base}-copy")
                } else {
                    format!("{base}-copy-{n}")
                };
                let inserted = sqlx::query(
                    "INSERT INTO pages (id, site_id, path, title, position, draft, draft_updated_by, created_by)
                     VALUES ($1, $2, $3, $4, COALESCE((SELECT max(position) + 1 FROM pages WHERE site_id = $2), 0), $5, $6, $6)",
                )
                .bind(new_id)
                .bind(page.site_id)
                .bind(&path)
                .bind(format!("{} (copy)", page.title).chars().take(120).collect::<String>())
                .bind(&page.draft)
                .bind(session.user.id)
                .execute(&state.pool)
                .await;
                match inserted {
                    Ok(_) => {
                        audit_site(
                            &state.pool,
                            &session,
                            page.site_id,
                            "page.duplicated",
                            json!({ "page": new_id, "from": id, "path": path }),
                        )
                        .await?;
                        return Ok(Json(json!({ "id": new_id })));
                    }
                    Err(err) if path_taken(&err) => continue,
                    Err(err) => return Err(err.into()),
                }
            }
            Err(ApiError::Conflict(
                "Too many copies of this page. Rename one first.",
            ))
        }
        _ => Err(ApiError::NotFound),
    }
}

#[derive(Deserialize)]
struct OrderInput {
    ids: Vec<Uuid>,
}

/// Saves the order of a website's pages (navigation order on the website).
async fn reorder(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<OrderInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let site = site(&state.pool, &slug).await?;
    let existing: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM pages WHERE site_id = $1 AND archived_at IS NULL")
            .bind(site.id)
            .fetch_all(&state.pool)
            .await?;
    let mut given = input.ids.clone();
    given.sort();
    given.dedup();
    let mut current = existing.clone();
    current.sort();
    if given != current || given.len() != input.ids.len() {
        return Err(ApiError::Conflict("The page list changed. Reload and try again."));
    }
    let mut tx = state.pool.begin().await?;
    for (position, id) in input.ids.iter().enumerate() {
        sqlx::query("UPDATE pages SET position = $2 WHERE id = $1")
            .bind(id)
            .bind(position as i32)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "page.reordered",
        json!({ "order": input.ids }),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Publishes approved changes whose time has come. Safe to run on several API
/// instances at once: each due change is claimed by exactly one of them.
/// Changes to archived pages were cancelled when the page was archived.
pub async fn publish_due(pool: &PgPool) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;
    #[derive(FromRow)]
    struct Due {
        id: Uuid,
        page_id: Uuid,
        site_id: Uuid,
        number: i32,
        document: Value,
        publish_at: DateTime<Utc>,
        published: Option<Value>,
    }
    let due: Vec<Due> = sqlx::query_as(
        "SELECT r.id, r.page_id, p.site_id, r.number, r.document, r.publish_at, p.published
           FROM page_revisions r JOIN pages p ON p.id = r.page_id
          WHERE r.state = 'scheduled' AND r.publish_at <= now() AND p.archived_at IS NULL
          ORDER BY r.publish_at
          LIMIT 50
            FOR UPDATE OF r SKIP LOCKED",
    )
    .fetch_all(&mut *tx)
    .await?;
    for Due {
        id: revision,
        page_id: page,
        site_id: site,
        number,
        document,
        publish_at,
        published: previous,
    } in &due
    {
        sqlx::query("UPDATE page_revisions SET state = 'published' WHERE id = $1")
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE pages SET published = $2, published_revision = $3, published_at = now() WHERE id = $1",
        )
        .bind(page)
        .bind(document)
        .bind(revision)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
             VALUES ($1, 'page.published', 'page', $2, $3, $4)",
        )
        .bind(Uuid::now_v7())
        .bind(page.to_string())
        .bind(
            json!({ "page": page, "revision": revision, "number": number, "from": previous,
                      "to": document, "scheduled_for": publish_at }),
        )
        .bind(site)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(due.len())
}

/// Runs [`publish_due`] every `every` until `shutdown` flips to `true`.
pub async fn run_scheduler(
    pool: PgPool,
    every: std::time::Duration,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let mut ticker = tokio::time::interval(every);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            _ = ticker.tick() => match publish_due(&pool).await {
                Ok(0) => {}
                Ok(count) => tracing::info!(count, "published scheduled page changes"),
                Err(err) => tracing::warn!(error = %err, "scheduled publishing pass failed"),
            },
            _ = shutdown.changed() => break,
        }
    }
}
