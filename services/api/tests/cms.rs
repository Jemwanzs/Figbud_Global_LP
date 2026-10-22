//! Blog & Insights read API against real PostgreSQL (`TEST_DATABASE_URL`).
//! Every test creates its own uniquely named category, so runs never
//! interfere with each other or with leftovers from earlier runs.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database, json_body, lazy_app};
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture {
    pool: PgPool,
    app: axum::Router,
    /// Unique per test run: used in slugs, the category and a search token.
    run: String,
}

impl Fixture {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let run = Uuid::new_v4().simple().to_string()[..10].to_owned();
        sqlx::query("INSERT INTO cms_categories (id, slug, name, description) VALUES ($1, $2, 'Payroll', 'Pay and compliance')")
            .bind(Uuid::now_v7())
            .bind(format!("cat-{run}"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO cms_authors (id, slug, name, role) VALUES ($1, $2, 'Test Author', 'Editor')",
        )
        .bind(Uuid::now_v7())
        .bind(format!("author-{run}"))
        .execute(&pool)
        .await
        .unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run,
        })
    }

    /// Inserts an article in this run's category. `published_offset_hours`
    /// is relative to now (negative = already live, positive = scheduled).
    async fn article(
        &self,
        name: &str,
        locale: &str,
        status: &str,
        published_offset_hours: i64,
        body: &str,
        tags: &[&str],
    ) {
        let id = Uuid::now_v7();
        let approved = status == "published";
        sqlx::query(
            "INSERT INTO cms_articles (id, slug, locale, title, excerpt, body_markdown, status, published_at,
                                       approved_by, approved_at, category_id, author_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(hours => $8::int),
                     $9, CASE WHEN $9::text IS NULL THEN NULL ELSE now() END,
                     (SELECT id FROM cms_categories WHERE slug = $10),
                     (SELECT id FROM cms_authors WHERE slug = $11))",
        )
        .bind(id)
        .bind(format!("{name}-{}", self.run))
        .bind(locale)
        .bind(format!("Title {name}"))
        .bind(format!("Excerpt {name}"))
        .bind(body)
        .bind(status)
        .bind(published_offset_hours as i32)
        .bind(approved.then_some("editor@figbud.test"))
        .bind(format!("cat-{}", self.run))
        .bind(format!("author-{}", self.run))
        .execute(&self.pool)
        .await
        .unwrap();
        for tag in tags {
            let slug = format!("{tag}-{}", self.run);
            sqlx::query(
                "INSERT INTO cms_tags (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING",
            )
            .bind(Uuid::now_v7())
            .bind(&slug)
            .bind(*tag)
            .execute(&self.pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO cms_article_tags (article_id, tag_id) SELECT $1, id FROM cms_tags WHERE slug = $2")
                .bind(id)
                .bind(&slug)
                .execute(&self.pool)
                .await
                .unwrap();
        }
    }

    async fn get(&self, uri: &str) -> (StatusCode, Option<String>, Value) {
        let response = self
            .app
            .clone()
            .oneshot(Request::get(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let cache = response
            .headers()
            .get(header::CACHE_CONTROL)
            .map(|v| v.to_str().unwrap().to_owned());
        (status, cache, json_body(response).await)
    }

    fn slugs(&self, page: &Value) -> Vec<String> {
        page["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| {
                i["slug"]
                    .as_str()
                    .unwrap()
                    .trim_end_matches(&format!("-{}", self.run))
                    .to_owned()
            })
            .collect()
    }
}

#[tokio::test]
async fn only_published_articles_past_their_publication_time_are_public() {
    let Some(f) = Fixture::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    f.article("live", "en", "published", -2, "Body", &[]).await;
    f.article("older", "en", "published", -48, "Body", &[]).await;
    f.article("draft", "en", "draft", -1, "Body", &[]).await;
    f.article("review", "en", "in_review", -1, "Body", &[]).await;
    f.article("scheduled", "en", "published", 24, "Body", &[]).await;
    f.article("archived", "en", "archived", -1, "Body", &[]).await;
    f.article("swahili", "sw", "published", -1, "Body", &[]).await;

    let (status, cache, page) = f.get(&format!("/v1/articles?category=cat-{}", f.run)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        cache.as_deref(),
        Some("public, max-age=60, stale-while-revalidate=300")
    );
    assert_eq!(
        f.slugs(&page),
        vec!["live", "older"],
        "newest first, nothing unpublished"
    );
    assert_eq!(page["total"], 2);
    assert_eq!(page["items"][0]["category"]["name"], "Payroll");
    assert_eq!(page["items"][0]["author"]["role"], "Editor");

    for hidden in ["draft", "review", "scheduled", "archived"] {
        let (status, _, _) = f.get(&format!("/v1/articles/{hidden}-{}", f.run)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{hidden} must not be public");
    }

    let (_, _, sw) = f
        .get(&format!("/v1/articles?locale=sw&category=cat-{}", f.run))
        .await;
    assert_eq!(f.slugs(&sw), vec!["swahili"]);
    let (status, _, _) = f.get(&format!("/v1/articles/swahili-{}", f.run)).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "locales do not leak into each other"
    );
}

#[tokio::test]
async fn searches_filters_by_tag_and_paginates() {
    let Some(f) = Fixture::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let token = format!("zq{}", f.run);
    f.article(
        "match",
        "en",
        "published",
        -3,
        &format!("Housing levy and {token} explained"),
        &["compliance"],
    )
    .await;
    f.article(
        "other",
        "en",
        "published",
        -2,
        "Collections strategy",
        &["lending"],
    )
    .await;
    f.article(
        "third",
        "en",
        "published",
        -1,
        "Approvals at scale",
        &["compliance"],
    )
    .await;

    let (_, _, found) = f.get(&format!("/v1/articles?q={token}")).await;
    assert_eq!(f.slugs(&found), vec!["match"]);

    let (_, _, tagged) = f
        .get(&format!(
            "/v1/articles?category=cat-{}&tag=compliance-{}",
            f.run, f.run
        ))
        .await;
    assert_eq!(f.slugs(&tagged), vec!["third", "match"]);
    assert_eq!(tagged["items"][0]["tags"][0]["name"], "compliance");

    let (_, _, first) = f
        .get(&format!("/v1/articles?category=cat-{}&per_page=2&page=1", f.run))
        .await;
    let (_, _, second) = f
        .get(&format!("/v1/articles?category=cat-{}&per_page=2&page=2", f.run))
        .await;
    assert_eq!(
        (first["total"].as_i64(), first["total_pages"].as_i64()),
        (Some(3), Some(2))
    );
    assert_eq!(f.slugs(&first), vec!["third", "other"]);
    assert_eq!(f.slugs(&second), vec!["match"]);

    let (_, _, tags) = f.get("/v1/tags").await;
    let names: Vec<&str> = tags
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["slug"].as_str().unwrap())
        .collect();
    assert!(names.contains(&format!("compliance-{}", f.run).as_str()));

    let (_, _, categories) = f.get("/v1/categories").await;
    let ours = categories
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["slug"] == format!("cat-{}", f.run).as_str())
        .unwrap();
    assert_eq!(ours["article_count"], 3);
}

#[tokio::test]
async fn article_detail_renders_safe_html_with_headings_and_related() {
    let Some(f) = Fixture::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let body = "Intro <script>alert(1)</script>\n\n## How PAYE works\n\n[bad](javascript:alert(1)) [good](https://kra.go.ke)";
    f.article("guide", "en", "published", -2, body, &["paye"]).await;
    f.article("sibling", "en", "published", -1, "Related reading", &[])
        .await;
    f.article("unpublished-sibling", "en", "draft", -1, "Hidden", &[])
        .await;

    let (status, cache, article) = f.get(&format!("/v1/articles/guide-{}", f.run)).await;
    assert_eq!(status, StatusCode::OK);
    assert!(cache.unwrap().starts_with("public"));
    let html = article["body_html"].as_str().unwrap();
    assert!(!html.contains("<script>") && !html.contains("javascript:"));
    assert!(html.contains(r#"<h2 id="how-paye-works">"#));
    assert_eq!(article["headings"][0]["id"], "how-paye-works");
    assert_eq!(article["seo_title"], "Title guide", "falls back to the title");
    assert_eq!(article["reading_minutes"], 1);
    let related: Vec<&str> = article["related"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["slug"].as_str().unwrap())
        .collect();
    assert_eq!(related, vec![format!("sibling-{}", f.run)]);
}

#[tokio::test]
async fn publishing_requires_an_approval() {
    let Some(f) = Fixture::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let result = sqlx::query(
        "INSERT INTO cms_articles (id, slug, title, excerpt, body_markdown, status, published_at)
         VALUES ($1, $2, 't', 'e', 'b', 'published', now())",
    )
    .bind(Uuid::now_v7())
    .bind(format!("unapproved-{}", f.run))
    .execute(&f.pool)
    .await;
    assert!(result.is_err(), "the database refuses unapproved publication");
}

#[tokio::test]
async fn rejects_malformed_queries_without_touching_the_database() {
    let app = lazy_app();
    for uri in [
        "/v1/articles?locale=de",
        "/v1/articles?per_page=0",
        "/v1/articles?per_page=51",
        "/v1/articles?page=abc",
        "/v1/articles?category=Bad_Slug",
        "/v1/articles/Not-A-Slug",
        "/v1/categories?locale=xx",
    ] {
        let response = app
            .clone()
            .oneshot(Request::get(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{uri}");
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store",
            "errors are never cached"
        );
    }
}
