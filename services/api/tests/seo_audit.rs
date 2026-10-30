//! SEO & search visibility (P9-S1) against real PostgreSQL
//! (`TEST_DATABASE_URL`): per-website settings, the page audit, the overview
//! and what websites receive.

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use figbud_api::admin;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const ORIGIN: &str = "http://localhost:3000";

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    cookie: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::ORIGIN, ORIGIN);
    if let Some(cookie) = cookie {
        req = req.header(header::COOKIE, cookie);
    }
    let req = match body {
        Some(body) => req
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 4 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn admin_cookie(pool: &PgPool, role: &str, run: &str) -> (Uuid, String) {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'SEO Auditor', $3)")
        .bind(id)
        .bind(format!(
            "seo-audit-{role}-{run}-{}@figbud.test",
            &id.simple().to_string()[24..]
        ))
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    let token = admin::create_session(pool, &config("unused").admin.unwrap(), id, "test", None)
        .await
        .unwrap();
    (id, format!("figbud_admin={token}"))
}

async fn page(pool: &PgPool, site: Uuid, path: &str, title: &str, doc: Value) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO pages (id, site_id, path, title, draft, published, published_at) VALUES ($1, $2, $3, $4, $5, $5, now())",
    )
    .bind(id)
    .bind(site)
    .bind(path)
    .bind(title)
    .bind(&doc)
    .execute(pool)
    .await
    .unwrap();
    id
}

#[tokio::test]
async fn website_seo_settings_audit_and_overview() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let run = Uuid::new_v4().simple().to_string()[..8].to_owned();
    let (_, reviewer) = admin_cookie(&pool, "reviewer", &run).await;
    let (_, editor) = admin_cookie(&pool, "editor", &run).await;
    let slug = format!("seo_{run}");
    let site = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO sites (id, slug, kind, name, category, template, status, position)
         VALUES ($1, $2, 'product', 'SEO Site', 'hr_workforce', 'hr', 'active', 90)",
    )
    .bind(site)
    .bind(&slug)
    .execute(&pool)
    .await
    .unwrap();

    let good = json!({ "seo_title": "Payroll software for growing teams in Kenya",
        "seo_description": "Run compliant payroll, approvals and statutory filings in one configurable platform built for Kenyan organisations.",
        "sections": [{ "id": "h", "type": "hero", "heading": "Payroll, handled", "primary": { "label": "Pricing", "href": "/pricing" } },
                     { "id": "t", "type": "text", "body": "Payroll text that explains the product in detail. ".repeat(8) }] });
    let home = page(&pool, site, "", "Home", good).await;
    // No hero, a broken link, no description, and the same title as another page.
    let bad = json!({ "sections": [{ "id": "t", "type": "text", "heading": "Notes",
        "body": "See [the old guide](/guide) and [contact us](/contact)." }] });
    let first = page(&pool, site, "pricing", "Pricing", bad.clone()).await;
    let second = page(&pool, site, "plans", "Pricing", bad).await;
    sqlx::query("INSERT INTO page_redirects (site_id, from_path, page_id) VALUES ($1, 'old-pricing', $2)")
        .bind(site)
        .bind(first)
        .execute(&pool)
        .await
        .unwrap();

    let (status, report) = call(
        &app,
        "GET",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["can_edit"], false, "editors read; reviewers change");
    let codes = |id: Uuid| -> Vec<String> {
        report["pages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id.to_string().as_str())
            .unwrap()["issues"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["code"].as_str().unwrap().to_owned())
            .collect()
    };
    let home_codes = codes(home);
    assert!(
        !home_codes
            .iter()
            .any(|c| c.starts_with("title") || c == "no_h1" || c.starts_with("link")),
        "{home_codes:?}"
    );
    let bad_codes = codes(first);
    for expected in ["title_duplicate", "description_missing", "no_h1"] {
        assert!(
            bad_codes.iter().any(|c| c == expected),
            "{expected} in {bad_codes:?}"
        );
    }
    // Markdown links aren't hrefs in the document; CTA links are checked.
    assert!(codes(second).contains(&"title_duplicate".to_owned()));
    assert!(report["summary"]["errors"].as_u64().unwrap() >= 2);
    assert_eq!(report["integrations"]["search_console"]["data"], "not_connected");

    // Settings: validated, version-checked, audited; reviewers only.
    let version = report["version"].clone();
    let settings = json!({ "title_template": "%s · SEO Site", "default_description": "Payroll for Kenya.",
        "google_verification": "abc123DEF456_ghi", "same_as": ["https://www.linkedin.com/company/figbud"],
        "markets": ["KE", "UG"], "languages": ["en", "sw"], "focus_keywords": ["payroll software Kenya"], "indexing": true });
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&editor),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&reviewer),
        Some(json!({ "settings": { "title_template": "no placeholder" }, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, saved) = call(
        &app,
        "POST",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&reviewer),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&reviewer),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale version");
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE site_id = $1 AND action = 'site.seo_updated'",
    )
    .bind(site)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    // The template applies to search titles in the audit.
    let (_, report) = call(
        &app,
        "GET",
        &format!("/v1/admin/sites/{slug}/seo"),
        Some(&reviewer),
        None,
    )
    .await;
    let home_title = report["pages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == home.to_string().as_str())
        .unwrap()["search_title"]
        .clone();
    assert_eq!(
        home_title,
        "Payroll software for growing teams in Kenya · SEO Site"
    );

    // Websites receive the public part; focus phrases stay internal.
    let (_, sites) = call(&app, "GET", "/v1/sites", None, None).await;
    let public = sites
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["slug"] == slug.as_str())
        .unwrap()["seo"]
        .clone();
    assert_eq!(public["google_verification"], "abc123DEF456_ghi");
    assert_eq!(public["indexing"], true);
    assert!(public.get("focus_keywords").is_none());

    // Overview across websites.
    let (status, overview) = call(&app, "GET", "/v1/admin/seo", Some(&editor), None).await;
    assert_eq!(status, StatusCode::OK);
    let row = overview["sites"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["site"] == slug.as_str())
        .unwrap()
        .clone();
    assert_eq!(row["summary"]["pages"], 3);
    assert_eq!(row["integrations"]["search_console"]["verification_tag"], true);
}
