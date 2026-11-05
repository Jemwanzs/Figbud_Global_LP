//! ZiraHR's content loads and goes live at start-up, so it must run only once
//! and never overwrite what a person has edited (`TEST_DATABASE_URL`).

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use common::{app_with, config, database};
use figbud_api::pages::{import, zirahr_guide};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

/// These tests change the same seeded website, so they take turns.
static ZIRAHR: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tokio::test]
async fn the_website_goes_live_once_and_leaves_edited_pages_alone() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    import::run(&pool).await.unwrap();

    // A page someone edited in the Studio before the go-live.
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let editor = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Editor', 'editor')")
        .bind(editor)
        .bind(format!("guide-{editor}@figbud.test"))
        .execute(&pool)
        .await
        .unwrap();
    for action in ["site.zirahr_launched", "page.zirahr_guide_drafted"] {
        sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = $2")
            .bind(site)
            .bind(action)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::query("DELETE FROM pages WHERE site_id = $1 AND path IN ('platform', 'about', 'contact', 'refer')")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM site_payroll_calculators WHERE site_id = $1")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM payroll_calculator_versions WHERE site_id = $1")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE sites SET settings = settings - 'nav_previews_draft' - 'nav_previews' WHERE id = $1")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::run(&pool).await.unwrap();
    let mine =
        json!({ "sections": [{ "id": "a", "type": "hero", "heading": "An editor's own About page." }] });
    sqlx::query("UPDATE pages SET draft = $2, draft_updated_by = $3 WHERE site_id = $1 AND path = 'about'")
        .bind(site)
        .bind(&mine)
        .bind(editor)
        .execute(&pool)
        .await
        .unwrap();

    zirahr_guide::launch(&pool).await.unwrap();
    let state = |pool: sqlx::PgPool| async move {
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
    let first = state(pool.clone()).await;
    // Every restart runs these; nothing changes again.
    zirahr_guide::run(&pool).await.unwrap();
    zirahr_guide::launch(&pool).await.unwrap();
    assert_eq!(state(pool.clone()).await, first);

    let app = app_with(pool.clone(), config(&url));
    let get = |uri: String| {
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

    // Live for visitors, in the navigation the brief asks for.
    let (status, pages) = get("/v1/sites/zirahr/pages".into()).await;
    assert_eq!(status, StatusCode::OK);
    let pages: Value = serde_json::from_str(&pages).unwrap();
    let listed = |path: &str| {
        pages
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["path"] == path)
            .cloned()
    };
    assert!(listed("platform").is_some() && listed("contact").is_some());
    assert_eq!(listed("refer").unwrap()["show_in_nav"], false, "a utility page");
    let (status, platform) = get("/v1/sites/zirahr/page?path=platform".into()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(platform.contains("Recruitment") && !platform.contains("\"planned\""));

    // The edited page stayed as its editor left it, unpublished.
    assert!(listed("about").is_none());
    let (draft, published): (Value, Option<Value>) =
        sqlx::query_as("SELECT draft, published FROM pages WHERE site_id = $1 AND path = 'about'")
            .bind(site)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(draft["sections"][0]["heading"], "An editor's own About page.");
    assert_eq!(published, None);

    // The calculator is on, with its rules recorded as checked.
    let (_, calculator) = get("/v1/sites/zirahr/payroll-calculator".into()).await;
    let calculator: Value = serde_json::from_str(&calculator).unwrap();
    assert_eq!(calculator["calculator"]["version"], 1);
    assert_eq!(
        calculator["calculator"]["rule_sets"][0]["verified_on"],
        "2026-11-05"
    );

    // Hover previews are published, drafts aren't sent, and the footer has the utility pages.
    let (_, sites) = get("/v1/sites".into()).await;
    assert!(!sites.contains("nav_previews_draft"));
    assert!(sites.contains("Good conversations start here"));
    assert!(sites.contains("Refer & earn") || sites.contains("Refer \\u0026 earn"));
}

#[tokio::test]
async fn the_scroll_stories_join_the_platform_page_once_and_never_over_an_edit() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    import::run(&pool).await.unwrap();
    zirahr_guide::run(&pool).await.unwrap();
    zirahr_guide::launch(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let reset = |document: Value, edited: bool| {
        let pool = pool.clone();
        async move {
            sqlx::query(
                "DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_stories_published'",
            )
            .bind(site)
            .execute(&pool)
            .await
            .unwrap();
            let editor: Option<Uuid> = if edited {
                sqlx::query_scalar("SELECT id FROM admin_users LIMIT 1")
                    .fetch_optional(&pool)
                    .await
                    .unwrap()
            } else {
                None
            };
            sqlx::query(
                "UPDATE pages SET draft = $2, published = $2, draft_updated_by = $3
                  WHERE site_id = $1 AND path = 'platform'",
            )
            .bind(site)
            .bind(&document)
            .bind(editor)
            .execute(&pool)
            .await
            .unwrap();
        }
    };
    let simple = json!({ "sections": [
        { "id": "a", "type": "hero", "heading": "Platform" },
        { "id": "b", "type": "text", "heading": "Middle", "body": "Words." },
        { "id": "c", "type": "text", "heading": "Close", "body": "Words." },
    ] });
    let stored = |pool: sqlx::PgPool| async move {
        sqlx::query_as::<_, (Value, i32)>(
            "SELECT p.published, (SELECT count(*)::int FROM page_revisions r WHERE r.page_id = p.id)
               FROM pages p WHERE p.site_id = $1 AND p.path = 'platform'",
        )
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap()
    };

    reset(simple.clone(), false).await;
    let (_, versions) = stored(pool.clone()).await;
    zirahr_guide::publish_stories(&pool).await.unwrap();
    let (document, after) = stored(pool.clone()).await;
    assert_eq!(after, versions + 1, "a new version, so it can be undone");
    let order: Vec<_> = document["sections"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["demo"].as_str().or(s["heading"].as_str()).unwrap().to_owned())
        .collect();
    assert_eq!(
        order,
        [
            "Platform",
            "scattered_to_connected",
            "Middle",
            "employee_journey",
            "Close"
        ]
    );

    // Every restart runs this; nothing changes again.
    zirahr_guide::publish_stories(&pool).await.unwrap();
    assert_eq!(stored(pool.clone()).await.1, after);

    // Visitors get the stories from the public page.
    let app = app_with(pool.clone(), config(&url));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v1/sites/zirahr/page?path=platform")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // A page someone edited stays exactly as it is.
    reset(simple.clone(), true).await;
    zirahr_guide::publish_stories(&pool).await.unwrap();
    assert_eq!(stored(pool.clone()).await.0, simple);
    sqlx::query("UPDATE pages SET draft_updated_by = NULL WHERE site_id = $1 AND path = 'platform'")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn the_rewritten_home_page_replaces_home_once_and_the_old_one_stays_restorable() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_home_redesigned'")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    // A Home someone had edited: the owner asked for this one to be replaced.
    let editor: Option<Uuid> = sqlx::query_scalar("SELECT id FROM admin_users LIMIT 1")
        .fetch_optional(&pool)
        .await
        .unwrap();
    let before = json!({ "sections": [{ "id": "x", "type": "hero", "heading": "An earlier home page" }] });
    sqlx::query(
        "UPDATE pages SET draft = $2, published = $2, draft_updated_by = $3 WHERE site_id = $1 AND path = ''",
    )
    .bind(site)
    .bind(&before)
    .bind(editor)
    .execute(&pool)
    .await
    .unwrap();
    let count = |pool: sqlx::PgPool| async move {
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM page_revisions r JOIN pages p ON p.id = r.page_id WHERE p.site_id = $1 AND p.path = ''",
        )
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    let versions = count(pool.clone()).await;

    zirahr_guide::publish_home_redesign(&pool).await.unwrap();
    let published: Value = sqlx::query_scalar("SELECT published FROM pages WHERE site_id = $1 AND path = ''")
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap();
    let sections = published["sections"].as_array().unwrap();
    assert_eq!(
        sections[0]["heading"],
        "Your people. Your payroll. One smarter way to work."
    );
    // Contrasting bands alternate with the page's own, and the page ends on one.
    let tones: Vec<bool> = sections.iter().map(|s| s["tone"] == "inverse").collect();
    assert!(tones.iter().filter(|t| **t).count() >= 4);
    assert!(
        tones.windows(2).all(|w| !(w[0] && w[1])),
        "never two contrasting bands in a row"
    );
    assert_eq!(tones.last(), Some(&true));
    assert_eq!(
        count(pool.clone()).await,
        versions + 1,
        "a new version; the earlier one stays"
    );

    // Once only: later edits in the Studio are never overwritten on restart.
    sqlx::query("UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = ''")
        .bind(site)
        .bind(&before)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_home_redesign(&pool).await.unwrap();
    let after: Value = sqlx::query_scalar("SELECT published FROM pages WHERE site_id = $1 AND path = ''")
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(after, before);
}
