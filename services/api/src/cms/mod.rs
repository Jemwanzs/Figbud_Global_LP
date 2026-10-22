//! Blog & Insights content: public, read-only endpoints. Only articles that
//! are published (approved) and whose publication time has passed are ever
//! returned; drafts, articles in review, scheduled and archived articles stay
//! invisible. Editing and approval arrive with admin authentication (P5-08).

pub mod editorial;
pub mod markdown;

use axum::{
    Json, Router,
    extract::{Path, Query, State, rejection::QueryRejection},
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, types::Json as SqlJson};
use uuid::Uuid;

use crate::{error::ApiError, routes::SharedState};

const LOCALES: [&str; 5] = ["en", "sw", "fr", "ar", "zh"];
const DEFAULT_PER_PAGE: u32 = 12;
const MAX_PER_PAGE: u32 = 50;
const MAX_PAGE: u32 = 1000;
const MAX_QUERY_CHARS: usize = 100;
/// Published content changes rarely; let browsers and the CDN reuse it briefly.
const PUBLIC_CACHE: &str = "public, max-age=60, stale-while-revalidate=300";

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/articles", get(list_articles))
        .route("/v1/articles/{slug}", get(get_article))
        .route("/v1/categories", get(list_categories))
        .route("/v1/tags", get(list_tags))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    locale: Option<String>,
    category: Option<String>,
    tag: Option<String>,
    q: Option<String>,
    page: Option<u32>,
    per_page: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct LocaleQuery {
    locale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TermRef {
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct AuthorRef {
    pub slug: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CoverImage {
    pub url: String,
    pub alt: String,
}

#[derive(Debug, Serialize)]
pub struct ArticleSummary {
    pub slug: String,
    pub title: String,
    pub excerpt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_image: Option<CoverImage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<TermRef>,
    pub tags: Vec<TermRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<AuthorRef>,
    pub published_at: DateTime<Utc>,
    pub reading_minutes: u32,
}

#[derive(Debug, Serialize)]
pub struct ArticlePage {
    pub items: Vec<ArticleSummary>,
    pub page: u32,
    pub per_page: u32,
    pub total: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct Article {
    #[serde(flatten)]
    pub summary: ArticleSummary,
    pub updated_at: DateTime<Utc>,
    pub seo_title: String,
    pub seo_description: String,
    pub body_html: String,
    pub headings: Vec<markdown::Heading>,
    pub related: Vec<ArticleSummary>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct TermCount {
    pub slug: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub article_count: i64,
}

#[derive(Debug, FromRow)]
struct ArticleRow {
    id: Uuid,
    slug: String,
    title: String,
    excerpt: String,
    body_markdown: String,
    cover_image_url: Option<String>,
    cover_image_alt: Option<String>,
    seo_title: Option<String>,
    seo_description: Option<String>,
    published_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    category_id: Option<Uuid>,
    category_slug: Option<String>,
    category_name: Option<String>,
    author_slug: Option<String>,
    author_name: Option<String>,
    author_role: Option<String>,
    tags: SqlJson<Vec<TermRef>>,
    total: i64,
}

impl ArticleRow {
    fn summary(&self) -> ArticleSummary {
        ArticleSummary {
            slug: self.slug.clone(),
            title: self.title.clone(),
            excerpt: self.excerpt.clone(),
            cover_image: self.cover_image_url.clone().map(|url| CoverImage {
                url,
                alt: self.cover_image_alt.clone().unwrap_or_default(),
            }),
            category: self
                .category_slug
                .clone()
                .zip(self.category_name.clone())
                .map(|(slug, name)| TermRef { slug, name }),
            tags: self.tags.0.clone(),
            author: self
                .author_slug
                .clone()
                .zip(self.author_name.clone())
                .map(|(slug, name)| AuthorRef {
                    slug,
                    name,
                    role: self.author_role.clone(),
                }),
            published_at: self.published_at,
            reading_minutes: markdown::reading_minutes(&self.body_markdown),
        }
    }
}

/// Columns shared by every article query; `a` is the article, visible only.
/// A macro so each query stays a compile-time constant (`concat!`).
macro_rules! article_select {
    () => {
        "
    SELECT a.id, a.slug, a.title, a.excerpt, a.body_markdown, a.cover_image_url, a.cover_image_alt,
           a.seo_title, a.seo_description, a.published_at, a.updated_at, a.category_id,
           c.slug AS category_slug, c.name AS category_name,
           au.slug AS author_slug, au.name AS author_name, au.role AS author_role,
           COALESCE((SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name) ORDER BY t.name)
                       FROM cms_article_tags at JOIN cms_tags t ON t.id = at.tag_id
                      WHERE at.article_id = a.id), '[]'::json) AS tags,
           COUNT(*) OVER () AS total
      FROM cms_articles a
      LEFT JOIN cms_categories c ON c.id = a.category_id
      LEFT JOIN cms_authors au ON au.id = a.author_id
     WHERE a.status = 'published' AND a.published_at <= now() AND a.locale = $1"
    };
}

async fn list_articles(
    State(state): State<SharedState>,
    query: Result<Query<ListQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::BadRequest("invalid query parameters"))?;
    let locale = parse_locale(query.locale.as_deref())?;
    let category = parse_slug(query.category.as_deref())?;
    let tag = parse_slug(query.tag.as_deref())?;
    let search = parse_search(query.q.as_deref())?;
    let per_page = query.per_page.unwrap_or(DEFAULT_PER_PAGE);
    let page = query.page.unwrap_or(1);
    if !(1..=MAX_PER_PAGE).contains(&per_page) || !(1..=MAX_PAGE).contains(&page) {
        return Err(ApiError::BadRequest("page or per_page out of range"));
    }

    let sql = concat!(
        article_select!(),
        "
           AND ($2::text IS NULL OR c.slug = $2)
           AND ($3::text IS NULL OR EXISTS (
                 SELECT 1 FROM cms_article_tags at JOIN cms_tags t ON t.id = at.tag_id
                  WHERE at.article_id = a.id AND t.slug = $3))
           AND ($4::text IS NULL OR a.search @@ websearch_to_tsquery('simple', $4))
         ORDER BY CASE WHEN $4::text IS NULL THEN 0
                       ELSE ts_rank(a.search, websearch_to_tsquery('simple', $4)) END DESC,
                  a.published_at DESC, a.id
         LIMIT $5 OFFSET $6"
    );
    let rows: Vec<ArticleRow> = sqlx::query_as(sql)
        .bind(locale)
        .bind(category)
        .bind(tag)
        .bind(search)
        .bind(i64::from(per_page))
        .bind(i64::from((page - 1) * per_page))
        .fetch_all(&state.pool)
        .await?;

    let total = rows.first().map_or(0, |r| r.total);
    let body = ArticlePage {
        items: rows.iter().map(ArticleRow::summary).collect(),
        page,
        per_page,
        total,
        total_pages: (total + i64::from(per_page) - 1) / i64::from(per_page),
    };
    Ok(cached(body))
}

async fn get_article(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
    query: Result<Query<LocaleQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::BadRequest("invalid query parameters"))?;
    let locale = parse_locale(query.locale.as_deref())?;
    let slug = parse_slug(Some(&slug))?.ok_or(ApiError::NotFound)?;

    let row: ArticleRow = sqlx::query_as(concat!(article_select!(), " AND a.slug = $2"))
        .bind(locale)
        .bind(&slug)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

    // Related: same category or a shared tag, most recent first.
    let related: Vec<ArticleRow> = sqlx::query_as(concat!(
        article_select!(),
        "
           AND a.id <> $2
           AND (a.category_id = $3 OR EXISTS (
                 SELECT 1 FROM cms_article_tags mine JOIN cms_article_tags theirs ON theirs.tag_id = mine.tag_id
                  WHERE mine.article_id = $2 AND theirs.article_id = a.id))
         ORDER BY (a.category_id IS NOT DISTINCT FROM $3) DESC, a.published_at DESC
         LIMIT 3"
    ))
    .bind(locale)
    .bind(row.id)
    .bind(row.category_id)
    .fetch_all(&state.pool)
    .await?;

    let rendered = markdown::render(&row.body_markdown);
    let body = Article {
        summary: row.summary(),
        updated_at: row.updated_at,
        seo_title: row.seo_title.clone().unwrap_or_else(|| row.title.clone()),
        seo_description: row.seo_description.clone().unwrap_or_else(|| row.excerpt.clone()),
        body_html: rendered.html,
        headings: rendered.headings,
        related: related.iter().map(ArticleRow::summary).collect(),
    };
    Ok(cached(body))
}

async fn list_categories(
    State(state): State<SharedState>,
    query: Result<Query<LocaleQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::BadRequest("invalid query parameters"))?;
    let locale = parse_locale(query.locale.as_deref())?;
    let rows: Vec<TermCount> = sqlx::query_as(
        "SELECT c.slug, c.name, c.description,
                COUNT(a.id) FILTER (WHERE a.status = 'published' AND a.published_at <= now() AND a.locale = $1) AS article_count
           FROM cms_categories c
           LEFT JOIN cms_articles a ON a.category_id = c.id
          GROUP BY c.id
          ORDER BY c.position, c.name",
    )
    .bind(locale)
    .fetch_all(&state.pool)
    .await?;
    Ok(cached(rows))
}

async fn list_tags(
    State(state): State<SharedState>,
    query: Result<Query<LocaleQuery>, QueryRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::BadRequest("invalid query parameters"))?;
    let locale = parse_locale(query.locale.as_deref())?;
    // Only tags in use by a visible article; empty tags would be dead filters.
    let rows: Vec<TermCount> = sqlx::query_as(
        "SELECT t.slug, t.name, NULL::text AS description, COUNT(*) AS article_count
           FROM cms_tags t
           JOIN cms_article_tags at ON at.tag_id = t.id
           JOIN cms_articles a ON a.id = at.article_id
          WHERE a.status = 'published' AND a.published_at <= now() AND a.locale = $1
          GROUP BY t.id
          ORDER BY t.name",
    )
    .bind(locale)
    .fetch_all(&state.pool)
    .await?;
    Ok(cached(rows))
}

fn cached<T: Serialize>(body: T) -> impl IntoResponse {
    (
        [(header::CACHE_CONTROL, HeaderValue::from_static(PUBLIC_CACHE))],
        Json(body),
    )
}

pub(crate) fn parse_locale(raw: Option<&str>) -> Result<&'static str, ApiError> {
    match raw {
        None => Ok("en"),
        Some(value) => LOCALES
            .iter()
            .copied()
            .find(|l| *l == value)
            .ok_or(ApiError::BadRequest("unknown locale")),
    }
}

pub(crate) fn parse_slug(raw: Option<&str>) -> Result<Option<String>, ApiError> {
    let Some(value) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let valid = value.len() <= 120
        && value.split('-').all(|part| {
            !part.is_empty() && part.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        });
    if valid {
        Ok(Some(value.to_owned()))
    } else {
        Err(ApiError::BadRequest("invalid slug"))
    }
}

fn parse_search(raw: Option<&str>) -> Result<Option<String>, ApiError> {
    let Some(value) = raw.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if value.chars().count() > MAX_QUERY_CHARS {
        return Err(ApiError::BadRequest("search query too long"));
    }
    Ok(Some(value.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locales_default_to_english_and_reject_unknown() {
        assert_eq!(parse_locale(None).unwrap(), "en");
        assert_eq!(parse_locale(Some("sw")).unwrap(), "sw");
        assert!(parse_locale(Some("de")).is_err());
    }

    #[test]
    fn slugs_are_lowercase_kebab_case() {
        assert_eq!(
            parse_slug(Some("payroll-2026")).unwrap().as_deref(),
            Some("payroll-2026")
        );
        assert_eq!(parse_slug(Some("  ")).unwrap(), None);
        for bad in ["Payroll", "a--b", "-a", "a b", "a/b", "../x"] {
            assert!(parse_slug(Some(bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn search_is_trimmed_and_bounded() {
        assert_eq!(parse_search(Some("  paye ")).unwrap().as_deref(), Some("paye"));
        assert!(parse_search(Some(&"x".repeat(101))).is_err());
    }
}
