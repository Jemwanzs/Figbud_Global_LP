//! Editorial workflow for Blog & Insights (admin only).
//!
//! draft ──submit──▶ in_review ──publish──▶ published ──archive──▶ archived
//!   ▲                                                              │
//!   └──────────────────────────── restore ─────────────────────────┘
//!
//! - Editors write drafts and submit them; reviewers publish (now or at a
//!   future time) and archive; owners can do everything.
//! - Maker-checker: a reviewer cannot approve an article they edited last.
//!   Owners may, so a one-person team is never blocked; it is audited.
//! - Every save is a new version (optimistic concurrency on `version`), and
//!   every action is written to the audit log.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, Postgres, Transaction};
use uuid::Uuid;

use super::{markdown, parse_locale, parse_slug};
use crate::{
    admin::{AdminSession, Role, audit},
    error::{ApiError, FieldError},
    routes::SharedState,
};

const MAX_BODY_CHARS: usize = 100_000;

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/cms/articles", get(list).post(create))
        .route("/v1/admin/cms/articles/{id}", get(read).post(update))
        .route("/v1/admin/cms/articles/{id}/submit", post(submit))
        .route("/v1/admin/cms/articles/{id}/publish", post(publish))
        .route("/v1/admin/cms/articles/{id}/archive", post(archive))
        .route("/v1/admin/cms/articles/{id}/restore", post(restore))
        .route("/v1/admin/cms/articles/{id}/versions", get(versions))
        .route("/v1/admin/cms/taxonomy", get(taxonomy))
        .route("/v1/admin/cms/categories", post(create_category))
        .route("/v1/admin/cms/authors", post(create_author))
        .route("/v1/admin/cms/preview", post(preview))
}

#[derive(Debug, Deserialize)]
pub struct ArticleInput {
    locale: Option<String>,
    slug: String,
    title: String,
    excerpt: String,
    body_markdown: String,
    category: Option<String>,
    author: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    cover_image_url: Option<String>,
    cover_image_alt: Option<String>,
    seo_title: Option<String>,
    seo_description: Option<String>,
    /// The version the editor started from; required when updating.
    version: Option<i32>,
}

struct Valid {
    locale: &'static str,
    slug: String,
    title: String,
    excerpt: String,
    body: String,
    category: Option<String>,
    author: Option<String>,
    tags: Vec<(String, String)>,
    cover_url: Option<String>,
    cover_alt: Option<String>,
    seo_title: Option<String>,
    seo_description: Option<String>,
}

fn trimmed(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|v| !v.is_empty()).map(str::to_owned)
}

/// Kebab-case slug from free text (ASCII letters and digits).
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
        .take(120)
        .collect::<String>()
        .trim_end_matches('-')
        .to_owned()
}

fn validate(input: &ArticleInput) -> Result<Valid, ApiError> {
    let mut errors = Vec::new();
    let mut fail = |field: &'static str, code: &'static str, message: &'static str| {
        errors.push(FieldError { field, code, message });
    };
    let locale = parse_locale(input.locale.as_deref()).unwrap_or_else(|_| {
        fail("locale", "invalid", "Choose a supported language.");
        "en"
    });
    let slug = match parse_slug(Some(&input.slug)) {
        Ok(Some(slug)) => slug,
        _ => {
            fail("slug", "invalid", "Use lowercase letters, numbers and hyphens.");
            String::new()
        }
    };
    let title = input.title.trim().to_owned();
    if title.is_empty() || title.chars().count() > 200 {
        fail("title", "length", "Enter a title of up to 200 characters.");
    }
    let excerpt = input.excerpt.trim().to_owned();
    if excerpt.is_empty() || excerpt.chars().count() > 400 {
        fail("excerpt", "length", "Enter a summary of up to 400 characters.");
    }
    let body = input.body_markdown.trim().to_owned();
    if body.is_empty() || body.chars().count() > MAX_BODY_CHARS {
        fail(
            "body_markdown",
            "length",
            "Write the article (up to 100,000 characters).",
        );
    }
    let cover_url = trimmed(input.cover_image_url.as_deref());
    let cover_alt = trimmed(input.cover_image_alt.as_deref());
    if let Some(url) = &cover_url {
        if !url.starts_with("https://") || url.len() > 2000 {
            fail(
                "cover_image_url",
                "invalid",
                "Cover images must use an https:// address.",
            );
        }
        if cover_alt.is_none() {
            fail(
                "cover_image_alt",
                "required",
                "Describe the cover image for people who can't see it.",
            );
        }
    }
    let seo_title = trimmed(input.seo_title.as_deref());
    if seo_title.as_ref().is_some_and(|t| t.chars().count() > 70) {
        fail("seo_title", "length", "Keep the search title to 70 characters.");
    }
    let seo_description = trimmed(input.seo_description.as_deref());
    if seo_description.as_ref().is_some_and(|d| d.chars().count() > 160) {
        fail(
            "seo_description",
            "length",
            "Keep the search description to 160 characters.",
        );
    }
    let mut tags: Vec<(String, String)> = Vec::new();
    for raw in input.tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        let slug = slugify(raw);
        if slug.is_empty() || raw.chars().count() > 40 {
            fail(
                "tags",
                "invalid",
                "Tags are short words or phrases (up to 40 characters).",
            );
        } else if !tags.iter().any(|(s, _)| *s == slug) {
            tags.push((slug, raw.to_owned()));
        }
    }
    if tags.len() > 8 {
        fail("tags", "too_many", "Use up to 8 tags.");
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    Ok(Valid {
        locale,
        slug,
        title,
        excerpt,
        body,
        category: trimmed(input.category.as_deref()),
        author: trimmed(input.author.as_deref()),
        tags,
        cover_url,
        cover_alt,
        seo_title,
        seo_description,
    })
}

#[derive(Debug, Serialize, FromRow)]
struct ArticleRow {
    id: Uuid,
    slug: String,
    locale: String,
    title: String,
    status: String,
    version: i32,
    published_at: Option<DateTime<Utc>>,
    submitted_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
    category: Option<String>,
    author: Option<String>,
    last_edited_by: Option<String>,
    /// Published with a publication time still in the future (database clock).
    scheduled: bool,
}

#[derive(Deserialize)]
struct ListQuery {
    status: Option<String>,
    q: Option<String>,
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Query(query): Query<ListQuery>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let status = trimmed(query.status.as_deref());
    if status
        .as_deref()
        .is_some_and(|s| !["draft", "in_review", "published", "archived"].contains(&s))
    {
        return Err(ApiError::BadRequest("unknown status"));
    }
    let q = trimmed(query.q.as_deref()).map(|q| format!("%{}%", q.replace(['%', '_'], "")));
    let rows: Vec<ArticleRow> = sqlx::query_as(
        "SELECT * FROM (
            SELECT a.id, a.slug, a.locale, a.title, a.status, a.version, a.published_at, a.submitted_at, a.updated_at,
                   c.name AS category, au.name AS author, ed.name AS last_edited_by,
                   (a.status = 'published' AND a.published_at > now()) AS scheduled
              FROM cms_articles a
              LEFT JOIN cms_categories c ON c.id = a.category_id
              LEFT JOIN cms_authors au ON au.id = a.author_id
              LEFT JOIN admin_users ed ON ed.id = a.last_edited_by) x
          WHERE ($1::text IS NULL OR x.status = $1) AND ($2::text IS NULL OR x.title ILIKE $2)
          ORDER BY x.updated_at DESC
          LIMIT 500",
    )
    .bind(status)
    .bind(q)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Debug, Serialize, FromRow)]
struct ArticleDetail {
    id: Uuid,
    slug: String,
    locale: String,
    title: String,
    excerpt: String,
    body_markdown: String,
    status: String,
    version: i32,
    cover_image_url: Option<String>,
    cover_image_alt: Option<String>,
    seo_title: Option<String>,
    seo_description: Option<String>,
    category: Option<String>,
    author: Option<String>,
    tags: Vec<String>,
    published_at: Option<DateTime<Utc>>,
    submitted_at: Option<DateTime<Utc>>,
    approved_by: Option<String>,
    approved_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    created_by: Option<String>,
    last_edited_by: Option<String>,
    last_edited_by_id: Option<Uuid>,
    scheduled: bool,
}

async fn load(state: &SharedState, id: Uuid) -> Result<ArticleDetail, ApiError> {
    sqlx::query_as(
        "SELECT a.id, a.slug, a.locale, a.title, a.excerpt, a.body_markdown, a.status, a.version,
                a.cover_image_url, a.cover_image_alt, a.seo_title, a.seo_description,
                c.slug AS category, au.slug AS author,
                COALESCE(ARRAY(SELECT t.name FROM cms_article_tags at JOIN cms_tags t ON t.id = at.tag_id
                                WHERE at.article_id = a.id ORDER BY t.name), '{}') AS tags,
                a.published_at, a.submitted_at, a.approved_by, a.approved_at, a.created_at, a.updated_at,
                cb.name AS created_by, ed.name AS last_edited_by, a.last_edited_by AS last_edited_by_id,
                (a.status = 'published' AND a.published_at > now()) AS scheduled
           FROM cms_articles a
           LEFT JOIN cms_categories c ON c.id = a.category_id
           LEFT JOIN cms_authors au ON au.id = a.author_id
           LEFT JOIN admin_users cb ON cb.id = a.created_by
           LEFT JOIN admin_users ed ON ed.id = a.last_edited_by
          WHERE a.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    Ok(Json(load(&state, id).await?))
}

/// Resolves optional category/author slugs; unknown ones are field errors.
async fn references(
    tx: &mut Transaction<'_, Postgres>,
    valid: &Valid,
) -> Result<(Option<Uuid>, Option<Uuid>), ApiError> {
    let mut errors = Vec::new();
    let category = match &valid.category {
        None => None,
        Some(slug) => {
            let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM cms_categories WHERE slug = $1")
                .bind(slug)
                .fetch_optional(&mut **tx)
                .await?;
            if id.is_none() {
                errors.push(FieldError {
                    field: "category",
                    code: "unknown",
                    message: "Choose an existing topic.",
                });
            }
            id
        }
    };
    let author = match &valid.author {
        None => None,
        Some(slug) => {
            let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM cms_authors WHERE slug = $1")
                .bind(slug)
                .fetch_optional(&mut **tx)
                .await?;
            if id.is_none() {
                errors.push(FieldError {
                    field: "author",
                    code: "unknown",
                    message: "Choose an existing author.",
                });
            }
            id
        }
    };
    if errors.is_empty() {
        Ok((category, author))
    } else {
        Err(ApiError::Validation(errors))
    }
}

async fn set_tags(
    tx: &mut Transaction<'_, Postgres>,
    article: Uuid,
    tags: &[(String, String)],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM cms_article_tags WHERE article_id = $1")
        .bind(article)
        .execute(&mut **tx)
        .await?;
    for (slug, name) in tags {
        sqlx::query(
            "INSERT INTO cms_tags (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING",
        )
        .bind(Uuid::now_v7())
        .bind(slug)
        .bind(name)
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            "INSERT INTO cms_article_tags (article_id, tag_id) SELECT $1, id FROM cms_tags WHERE slug = $2
             ON CONFLICT DO NOTHING",
        )
        .bind(article)
        .bind(slug)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn snapshot(
    tx: &mut Transaction<'_, Postgres>,
    article: Uuid,
    version: i32,
    valid: &Valid,
    session: &AdminSession,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO cms_article_versions (id, article_id, version, title, excerpt, body_markdown, edited_by, edited_by_user)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(Uuid::now_v7())
    .bind(article)
    .bind(version)
    .bind(&valid.title)
    .bind(&valid.excerpt)
    .bind(&valid.body)
    .bind(&session.user.email)
    .bind(session.user.id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn slug_taken(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.constraint() == Some("cms_articles_locale_slug_key"))
}

const SLUG_TAKEN: FieldError = FieldError {
    field: "slug",
    code: "taken",
    message: "Another article in this language already uses this address.",
};

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<ArticleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let valid = validate(&input)?;
    let id = Uuid::now_v7();
    let mut tx = state.pool.begin().await?;
    let (category, author) = references(&mut tx, &valid).await?;
    let inserted = sqlx::query(
        "INSERT INTO cms_articles (id, slug, locale, title, excerpt, body_markdown, cover_image_url, cover_image_alt,
                                   seo_title, seo_description, category_id, author_id, created_by, last_edited_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)",
    )
    .bind(id)
    .bind(&valid.slug)
    .bind(valid.locale)
    .bind(&valid.title)
    .bind(&valid.excerpt)
    .bind(&valid.body)
    .bind(&valid.cover_url)
    .bind(&valid.cover_alt)
    .bind(&valid.seo_title)
    .bind(&valid.seo_description)
    .bind(category)
    .bind(author)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await;
    if let Err(err) = inserted {
        return Err(if slug_taken(&err) {
            ApiError::Validation(vec![SLUG_TAKEN])
        } else {
            err.into()
        });
    }
    set_tags(&mut tx, id, &valid.tags).await?;
    snapshot(&mut tx, id, 1, &valid, &session).await?;
    tx.commit().await?;
    log(
        &state,
        &session,
        "cms.article_created",
        id,
        json!({ "slug": valid.slug, "locale": valid.locale }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(load(&state, id).await?)))
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<ArticleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    let valid = validate(&input)?;
    let expected = input.version.ok_or(ApiError::BadRequest("version is required"))?;
    let mut tx = state.pool.begin().await?;
    let current: Option<(String, i32)> =
        sqlx::query_as("SELECT status, version FROM cms_articles WHERE id = $1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (status, version) = current.ok_or(ApiError::NotFound)?;
    if version != expected {
        return Err(ApiError::Conflict(
            "Someone saved this article after you opened it. Reload to see the latest version, then reapply your changes.",
        ));
    }
    // Live and archived articles are changed by reviewers, who are accountable for what is public.
    if matches!(status.as_str(), "published" | "archived") {
        session.require(Role::Reviewer)?;
    }
    let (category, author) = references(&mut tx, &valid).await?;
    let updated = sqlx::query(
        "UPDATE cms_articles SET slug = $2, locale = $3, title = $4, excerpt = $5, body_markdown = $6,
                cover_image_url = $7, cover_image_alt = $8, seo_title = $9, seo_description = $10,
                category_id = $11, author_id = $12, last_edited_by = $13, version = version + 1, updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(&valid.slug)
    .bind(valid.locale)
    .bind(&valid.title)
    .bind(&valid.excerpt)
    .bind(&valid.body)
    .bind(&valid.cover_url)
    .bind(&valid.cover_alt)
    .bind(&valid.seo_title)
    .bind(&valid.seo_description)
    .bind(category)
    .bind(author)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await;
    if let Err(err) = updated {
        return Err(if slug_taken(&err) {
            ApiError::Validation(vec![SLUG_TAKEN])
        } else {
            err.into()
        });
    }
    set_tags(&mut tx, id, &valid.tags).await?;
    snapshot(&mut tx, id, version + 1, &valid, &session).await?;
    tx.commit().await?;
    log(
        &state,
        &session,
        "cms.article_updated",
        id,
        json!({ "version": version + 1, "status": status }),
    )
    .await?;
    Ok(Json(load(&state, id).await?))
}

async fn exists(state: &SharedState, id: Uuid) -> Result<(), ApiError> {
    let found: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM cms_articles WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    if found { Ok(()) } else { Err(ApiError::NotFound) }
}

async fn submit(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    exists(&state, id).await?;
    let moved: Option<String> = sqlx::query_scalar(
        "WITH old AS (SELECT status FROM cms_articles WHERE id = $1 FOR UPDATE)
         UPDATE cms_articles a SET status = 'in_review', submitted_at = now(), updated_at = now()
           FROM old WHERE a.id = $1 AND old.status = 'draft'
      RETURNING old.status",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    moved.ok_or(ApiError::Conflict("Only drafts can be submitted for review."))?;
    log(&state, &session, "cms.article_submitted", id, json!({})).await?;
    Ok(Json(load(&state, id).await?))
}

#[derive(Deserialize, Default)]
struct PublishInput {
    /// A future time schedules publication; omitted means now.
    published_at: Option<DateTime<Utc>>,
}

async fn publish(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    body: Option<Json<PublishInput>>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let article = load(&state, id).await?;
    if article.last_edited_by_id == Some(session.user.id) && session.user.role != Role::Owner {
        return Err(ApiError::NotPermitted(
            "A different reviewer must approve your own edits (maker-checker).",
        ));
    }
    let at = body.and_then(|b| b.0.published_at).unwrap_or_else(Utc::now);
    if at < Utc::now() - Duration::minutes(5) {
        return Err(ApiError::BadRequest("publication time cannot be in the past"));
    }
    let previous: Option<String> = sqlx::query_scalar(
        "WITH old AS (SELECT status FROM cms_articles WHERE id = $1 FOR UPDATE)
         UPDATE cms_articles a SET status = 'published', approved_by = $2, approved_at = now(), published_at = $3,
                updated_at = now()
           FROM old WHERE a.id = $1 AND old.status IN ('draft', 'in_review')
      RETURNING old.status",
    )
    .bind(id)
    .bind(&session.user.email)
    .bind(at)
    .fetch_optional(&state.pool)
    .await?;
    previous.ok_or(ApiError::Conflict(
        "Only drafts and articles in review can be published.",
    ))?;
    let self_approved = article.last_edited_by_id == Some(session.user.id);
    log(
        &state,
        &session,
        "cms.article_published",
        id,
        json!({ "published_at": at, "scheduled": at > Utc::now(), "self_approved": self_approved }),
    )
    .await?;
    Ok(Json(load(&state, id).await?))
}

async fn archive(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    exists(&state, id).await?;
    let previous: Option<String> = sqlx::query_scalar(
        "WITH old AS (SELECT status FROM cms_articles WHERE id = $1 FOR UPDATE)
         UPDATE cms_articles a SET status = 'archived', updated_at = now()
           FROM old WHERE a.id = $1 AND old.status <> 'archived'
      RETURNING old.status",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let previous = previous.ok_or(ApiError::Conflict("This article is already archived."))?;
    log(
        &state,
        &session,
        "cms.article_archived",
        id,
        json!({ "previous_status": previous }),
    )
    .await?;
    Ok(Json(load(&state, id).await?))
}

async fn restore(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    exists(&state, id).await?;
    let moved: Option<String> = sqlx::query_scalar(
        "WITH old AS (SELECT status FROM cms_articles WHERE id = $1 FOR UPDATE)
         UPDATE cms_articles a SET status = 'draft', approved_by = NULL, approved_at = NULL, published_at = NULL,
                submitted_at = NULL, updated_at = now()
           FROM old WHERE a.id = $1 AND old.status = 'archived'
      RETURNING old.status",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    moved.ok_or(ApiError::Conflict("Only archived articles can be restored."))?;
    log(&state, &session, "cms.article_restored", id, json!({})).await?;
    Ok(Json(load(&state, id).await?))
}

#[derive(Serialize, FromRow)]
struct VersionRow {
    version: i32,
    title: String,
    edited_by: Option<String>,
    created_at: DateTime<Utc>,
}

async fn versions(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    exists(&state, id).await?;
    let rows: Vec<VersionRow> = sqlx::query_as(
        "SELECT version, title, edited_by, created_at FROM cms_article_versions
          WHERE article_id = $1 ORDER BY version DESC LIMIT 100",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, FromRow)]
struct Term {
    slug: String,
    name: String,
    detail: Option<String>,
}

async fn taxonomy(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let categories: Vec<Term> = sqlx::query_as(
        "SELECT slug, name, description AS detail FROM cms_categories ORDER BY position, name",
    )
    .fetch_all(&state.pool)
    .await?;
    let authors: Vec<Term> =
        sqlx::query_as("SELECT slug, name, role AS detail FROM cms_authors ORDER BY name")
            .fetch_all(&state.pool)
            .await?;
    let tags: Vec<Term> =
        sqlx::query_as("SELECT slug, name, NULL::text AS detail FROM cms_tags ORDER BY name")
            .fetch_all(&state.pool)
            .await?;
    Ok(Json(
        json!({ "categories": categories, "authors": authors, "tags": tags }),
    ))
}

#[derive(Deserialize)]
struct TermInput {
    name: String,
    slug: Option<String>,
    /// Category description or author role.
    detail: Option<String>,
    bio: Option<String>,
}

fn term_slug(input: &TermInput) -> Result<(String, String), ApiError> {
    let name = input.name.trim().to_owned();
    let slug = trimmed(input.slug.as_deref()).unwrap_or_else(|| slugify(&name));
    if name.is_empty() || name.chars().count() > 80 || parse_slug(Some(&slug)).ok().flatten().is_none() {
        return Err(ApiError::Validation(vec![FieldError {
            field: "name",
            code: "invalid",
            message: "Enter a name of up to 80 characters.",
        }]));
    }
    Ok((name, slug))
}

async fn create_category(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<TermInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let (name, slug) = term_slug(&input)?;
    let id = Uuid::now_v7();
    let inserted = sqlx::query(
        "INSERT INTO cms_categories (id, slug, name, description, position)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM cms_categories))
         ON CONFLICT (slug) DO NOTHING",
    )
    .bind(id)
    .bind(&slug)
    .bind(&name)
    .bind(trimmed(input.detail.as_deref()))
    .execute(&state.pool)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(ApiError::Conflict("A topic with this address already exists."));
    }
    audit(
        &state.pool,
        Some(session.user.id),
        "cms.category_created",
        Some(("category", slug.clone())),
        json!({ "name": name }),
        None,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "slug": slug, "name": name }))))
}

async fn create_author(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<TermInput>,
) -> Result<impl IntoResponse, ApiError> {
    // Bylines name real people, so only owners add them.
    session.require(Role::Owner)?;
    let (name, slug) = term_slug(&input)?;
    let inserted = sqlx::query(
        "INSERT INTO cms_authors (id, slug, name, role, bio) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING",
    )
    .bind(Uuid::now_v7())
    .bind(&slug)
    .bind(&name)
    .bind(trimmed(input.detail.as_deref()))
    .bind(trimmed(input.bio.as_deref()))
    .execute(&state.pool)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(ApiError::Conflict("An author with this address already exists."));
    }
    audit(
        &state.pool,
        Some(session.user.id),
        "cms.author_created",
        Some(("author", slug.clone())),
        json!({ "name": name }),
        None,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "slug": slug, "name": name }))))
}

#[derive(Deserialize)]
struct PreviewInput {
    body_markdown: String,
}

/// Renders exactly as the public site will (same sanitiser).
async fn preview(
    session: AdminSession,
    Json(input): Json<PreviewInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    if input.body_markdown.chars().count() > MAX_BODY_CHARS {
        return Err(ApiError::BadRequest("article is too long"));
    }
    let rendered = markdown::render(&input.body_markdown);
    Ok(Json(json!({
        "html": rendered.html,
        "headings": rendered.headings,
        "reading_minutes": markdown::reading_minutes(&input.body_markdown),
    })))
}

async fn log(
    state: &SharedState,
    session: &AdminSession,
    action: &str,
    id: Uuid,
    detail: Value,
) -> Result<(), ApiError> {
    audit(
        &state.pool,
        Some(session.user.id),
        action,
        Some(("article", id.to_string())),
        detail,
        None,
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_makes_kebab_case() {
        assert_eq!(slugify("  PAYE & Housing Levy 2026! "), "paye-housing-levy-2026");
        assert_eq!(slugify("---"), "");
        assert_eq!(slugify(&"a".repeat(200)).len(), 120);
    }

    fn input() -> ArticleInput {
        ArticleInput {
            locale: None,
            slug: "valid-slug".into(),
            title: "Title".into(),
            excerpt: "Summary".into(),
            body_markdown: "Body".into(),
            category: None,
            author: None,
            tags: vec!["Payroll".into(), "payroll".into(), "Compliance".into()],
            cover_image_url: None,
            cover_image_alt: None,
            seo_title: None,
            seo_description: None,
            version: None,
        }
    }

    #[test]
    fn validation_normalises_and_dedupes_tags() {
        let valid = validate(&input()).unwrap();
        assert_eq!(valid.locale, "en");
        assert_eq!(
            valid.tags,
            vec![
                ("payroll".into(), "Payroll".into()),
                ("compliance".into(), "Compliance".into())
            ]
        );
    }

    #[test]
    fn validation_reports_every_problem() {
        let mut bad = input();
        bad.slug = "Not A Slug".into();
        bad.title = String::new();
        bad.cover_image_url = Some("http://insecure.example/x.png".into());
        bad.seo_description = Some("x".repeat(161));
        let Err(ApiError::Validation(errors)) = validate(&bad) else {
            panic!("expected validation errors")
        };
        let fields: Vec<_> = errors.iter().map(|e| e.field).collect();
        assert_eq!(
            fields,
            vec![
                "slug",
                "title",
                "cover_image_url",
                "cover_image_alt",
                "seo_description"
            ]
        );
    }
}
