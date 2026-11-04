//! The guide's content loads at start-up, so it must never touch what visitors
//! see, and must only ever run once (`TEST_DATABASE_URL`).

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use common::{app_with, config, database};
use figbud_api::pages::{import, zirahr_guide};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn the_guide_loads_as_unpublished_drafts_once_and_visitors_see_no_change() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    import::run(&pool).await.unwrap();
    let published_before: Option<Value> = sqlx::query_scalar(
        "SELECT p.published FROM pages p JOIN sites s ON s.id = p.site_id
          WHERE s.slug = 'zirahr' AND p.path = '' AND p.archived_at IS NULL",
    )
    .fetch_optional(&pool)
    .await
    .unwrap()
    .flatten();

    zirahr_guide::run(&pool).await.unwrap();
    let versions = |pool: sqlx::PgPool| async move {
        let rows: Vec<(String, i32)> = sqlx::query_as(
            "SELECT p.path, p.draft_version FROM pages p JOIN sites s ON s.id = p.site_id
              WHERE s.slug = 'zirahr' AND p.archived_at IS NULL ORDER BY p.path",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        let settings: i32 = sqlx::query_scalar("SELECT settings_version FROM sites WHERE slug = 'zirahr'")
            .fetch_one(&pool)
            .await
            .unwrap();
        (rows, settings)
    };
    let first = versions(pool.clone()).await;
    // Running again (every restart) changes nothing, even after someone edits.
    zirahr_guide::run(&pool).await.unwrap();
    assert_eq!(versions(pool.clone()).await, first);

    // The new pages exist only as drafts.
    let drafts: Vec<(String, Option<Value>)> = sqlx::query_as(
        "SELECT p.path, p.published FROM pages p JOIN sites s ON s.id = p.site_id
          WHERE s.slug = 'zirahr' AND p.path IN ('platform', 'about', 'contact') AND p.archived_at IS NULL",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(
        drafts.iter().all(|(_, published)| published.is_none()),
        "{drafts:?}"
    );

    // What's published is exactly as it was.
    let published_after: Option<Value> = sqlx::query_scalar(
        "SELECT p.published FROM pages p JOIN sites s ON s.id = p.site_id
          WHERE s.slug = 'zirahr' AND p.path = '' AND p.archived_at IS NULL",
    )
    .fetch_optional(&pool)
    .await
    .unwrap()
    .flatten();
    assert_eq!(published_after, published_before);

    // Visitors get neither the pages nor the draft hover previews.
    let app = app_with(pool.clone(), config(&url));
    let get = |uri: &'static str| {
        let app = app.clone();
        async move {
            let response = app
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            let status = response.status();
            let bytes = axum::body::to_bytes(response.into_body(), 1 << 22).await.unwrap();
            (status, String::from_utf8_lossy(&bytes).into_owned())
        }
    };
    let (status, pages) = get("/v1/sites/zirahr/pages").await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !pages.contains("\"platform\"") && !pages.contains("Contact & Demo"),
        "{pages}"
    );
    let (_, sites) = get("/v1/sites").await;
    assert!(!sites.contains("nav_previews_draft"));
    assert!(!sites.contains("Good conversations start here"));
    let (status, _) = get("/v1/sites/zirahr/pages/platform").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
