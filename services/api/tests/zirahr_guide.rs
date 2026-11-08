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
    assert_eq!(sections[0]["heading"], "Your people. Your payroll.");
    assert_eq!(sections[0]["accent"], "One smarter way to work.");
    assert_eq!(sections[0]["visual"], "connected_modules");
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

#[tokio::test]
async fn enquiries_stay_on_zirahr_and_refer_shows_the_number_once() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    zirahr_guide::run(&pool).await.unwrap();
    zirahr_guide::launch(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_enquiries_local'")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    // As they were before: no form on Contact, no number on Refer, and a draft in progress on Contact.
    let contact = json!({ "sections": [
        { "id": "h", "type": "hero", "heading": "Contact" },
        { "id": "c", "type": "call_to_action", "heading": "Ready", "cta": { "label": "Book", "href": "/enquire" } },
    ] });
    let mut contact_draft = contact.clone();
    contact_draft["sections"][1]["heading"] = json!("An unpublished edit");
    let refer = json!({ "sections": [
        { "id": "h", "type": "hero", "heading": "Refer" },
        { "id": "r", "type": "referral_form", "contact_phone": null },
    ] });
    for (path, draft, published) in [("contact", &contact_draft, &contact), ("refer", &refer, &refer)] {
        sqlx::query("UPDATE pages SET draft = $3, published = $4 WHERE site_id = $1 AND path = $2")
            .bind(site)
            .bind(path)
            .bind(draft)
            .bind(published)
            .execute(&pool)
            .await
            .unwrap();
    }

    zirahr_guide::publish_local_enquiries(&pool).await.unwrap();
    let read = |path: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_as::<_, (Value, Value)>(
                "SELECT draft, published FROM pages WHERE site_id = $1 AND path = $2",
            )
            .bind(site)
            .bind(path)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let (draft, published) = read("contact").await;
    assert_eq!(
        published["sections"][1]["type"], "enquiry_form",
        "right after the hero"
    );
    assert_eq!(draft["sections"][1]["type"], "enquiry_form");
    assert_eq!(
        draft["sections"][2]["heading"], "An unpublished edit",
        "the draft keeps its edit"
    );
    let (_, published) = read("refer").await;
    assert_eq!(published["sections"][1]["contact_phone"], "+254 798 993 404");

    // The website hears that Contact has the form, so its calls to action stay local.
    let app = app_with(pool.clone(), config(&url));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v1/sites/zirahr/pages")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let pages: Value = serde_json::from_slice(&bytes).unwrap();
    let listed = |path: &str| {
        pages
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["path"] == path)
            .unwrap()["enquiry_form"]
            .clone()
    };
    assert_eq!(listed("contact"), true);
    assert_eq!(listed("refer"), false);

    // Once only: a number changed in the Studio afterwards stays changed.
    let mut edited = published.clone();
    edited["sections"][1]["contact_phone"] = json!("+254 700 000 000");
    sqlx::query("UPDATE pages SET published = $2 WHERE site_id = $1 AND path = 'refer'")
        .bind(site)
        .bind(&edited)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_local_enquiries(&pool).await.unwrap();
    assert_eq!(
        read("refer").await.1["sections"][1]["contact_phone"],
        "+254 700 000 000"
    );
}

#[tokio::test]
async fn the_home_hero_gets_its_animated_look_once_and_keeps_later_edits() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_hero_signal'")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    let plain = json!({ "sections": [
        { "id": "h", "type": "hero", "heading": "Your people. Your payroll. One smarter way to work." },
        { "id": "t", "type": "text", "body": "Words." },
    ] });
    sqlx::query("UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = ''")
        .bind(site)
        .bind(&plain)
        .execute(&pool)
        .await
        .unwrap();

    zirahr_guide::publish_hero_signal(&pool).await.unwrap();
    let published: Value = sqlx::query_scalar("SELECT published FROM pages WHERE site_id = $1 AND path = ''")
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap();
    let hero = &published["sections"][0];
    assert_eq!(hero["heading"], "Your people. Your payroll.");
    assert_eq!(hero["accent"], "One smarter way to work.");
    assert_eq!(hero["visual"], "connected_modules");
    assert_eq!(hero["highlights"].as_array().unwrap().len(), 4);
    assert_eq!(
        published["sections"][1]["type"], "text",
        "the rest of the page is untouched"
    );

    // Once only: a hero restyled in the Studio afterwards stays as it was set.
    sqlx::query("UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = ''")
        .bind(site)
        .bind(&plain)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_hero_signal(&pool).await.unwrap();
    let after: Value = sqlx::query_scalar("SELECT published FROM pages WHERE site_id = $1 AND path = ''")
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(after, plain);
}

#[tokio::test]
async fn the_footer_is_redesigned_once_and_keeps_later_edits() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let reset = |footer: Value, tagline: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query(
                "DELETE FROM audit_log WHERE site_id = $1 AND action = 'site.zirahr_footer_redesigned'",
            )
            .bind(site)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "UPDATE sites SET tagline = $3, settings = jsonb_set(settings - 'footer_draft', '{footer}', $2)
                  WHERE id = $1",
            )
            .bind(site)
            .bind(footer)
            .bind(tagline)
            .execute(&pool)
            .await
            .unwrap();
        }
    };
    let state = || async {
        sqlx::query_as::<_, (Value, Option<String>)>(
            "SELECT settings->'footer', tagline FROM sites WHERE id = $1",
        )
        .bind(site)
        .fetch_one(&pool)
        .await
        .unwrap()
    };

    // The original single list of links, and the parent company's tagline.
    reset(
        json!({ "links": [{ "label": "Payroll calculator", "href": "/payroll-calculator" }] }),
        "One Vision. Endless Solutions.",
    )
    .await;
    zirahr_guide::publish_footer(&pool).await.unwrap();
    let (footer, tagline) = state().await;
    assert_eq!(tagline.as_deref(), Some("HR Simplified. Business Amplified."));
    assert_eq!(footer["tagline"], "HR Simplified. Business Amplified.");
    assert_eq!(footer["cta"]["heading"], "Ready to make HR feel effortless?");
    assert_eq!(footer["cta"]["href"], "/contact?kind=demo_request#enquire");
    let titles: Vec<&str> = footer["groups"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| g["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, ["Platform", "Explore", "Company"]);
    assert_eq!(footer["links"], json!([]), "the groups replace the old list");
    assert_eq!(footer["social"], json!([]), "no profile is invented");

    // Once only, and a footer or tagline set in the Studio is kept.
    let edited = json!({ "tagline": "Edited in the Studio", "groups": [] });
    reset(edited.clone(), "Our own words").await;
    sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'site.zirahr_footer_redesigned'")
        .bind(site)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_footer(&pool).await.unwrap();
    let (footer, tagline) = state().await;
    assert_eq!(footer["tagline"], "Edited in the Studio");
    assert_eq!(tagline.as_deref(), Some("Our own words"));

    // Leave the shared database with the redesigned footer.
    reset(
        serde_json::to_value(zirahr_guide::footer()).unwrap(),
        "HR Simplified. Business Amplified.",
    )
    .await;
}

#[tokio::test]
async fn the_attendance_demonstration_joins_the_platform_page_once() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    // The Platform page exists once the guide is drafted and launched, whatever ran before.
    zirahr_guide::run(&pool).await.unwrap();
    zirahr_guide::launch(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let before: Option<(Value, Option<Value>)> =
        sqlx::query_as("SELECT draft, published FROM pages WHERE site_id = $1 AND path = 'platform'")
            .bind(site)
            .fetch_optional(&pool)
            .await
            .unwrap();
    let plain = json!({ "sections": [
        { "id": "h", "type": "hero", "heading": "The platform" },
        { "id": "l", "type": "demo", "demo": "leave_flow" },
        { "id": "o", "type": "demo", "demo": "outputs" },
        { "id": "c", "type": "call_to_action", "heading": "See it", "cta": { "label": "Book a demo", "href": "/enquire" } },
    ] });
    let reset = |doc: Value| {
        let pool = pool.clone();
        async move {
            sqlx::query(
                "DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_attendance_demo'",
            )
            .bind(site)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = 'platform'",
            )
            .bind(site)
            .bind(doc)
            .execute(&pool)
            .await
            .unwrap();
        }
    };
    let demos = || async {
        let doc: Value =
            sqlx::query_scalar("SELECT published FROM pages WHERE site_id = $1 AND path = 'platform'")
                .bind(site)
                .fetch_one(&pool)
                .await
                .unwrap();
        doc["sections"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| {
                s["demo"]
                    .as_str()
                    .unwrap_or(s["type"].as_str().unwrap())
                    .to_owned()
            })
            .collect::<Vec<_>>()
    };

    reset(plain.clone()).await;
    zirahr_guide::publish_attendance_demo(&pool).await.unwrap();
    assert_eq!(
        demos().await,
        ["hero", "leave_flow", "attendance", "outputs", "call_to_action"]
    );

    // Once only: removed in the Studio afterwards, it stays removed.
    sqlx::query("UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = 'platform'")
        .bind(site)
        .bind(&plain)
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_attendance_demo(&pool).await.unwrap();
    assert_eq!(demos().await, ["hero", "leave_flow", "outputs", "call_to_action"]);

    // Leave the shared database as it was.
    if let Some((draft, published)) = before {
        sqlx::query("UPDATE pages SET draft = $2, published = $3 WHERE site_id = $1 AND path = 'platform'")
            .bind(site)
            .bind(draft)
            .bind(published)
            .execute(&pool)
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn the_hero_names_all_eight_modules_once_and_keeps_edits() {
    let Some(pool) = database().await else { return };
    let _turn = ZIRAHR.lock().await;
    import::run(&pool).await.unwrap();
    // Home and Platform exist once the guide is drafted and launched, whatever ran before.
    zirahr_guide::run(&pool).await.unwrap();
    zirahr_guide::launch(&pool).await.unwrap();
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'zirahr'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let saved: Vec<(String, Value, Option<Value>)> = sqlx::query_as(
        "SELECT path, draft, published FROM pages WHERE site_id = $1 AND path IN ('', 'platform')",
    )
    .bind(site)
    .fetch_all(&pool)
    .await
    .unwrap();

    let old_lead = "Meet ZiraHR: the connected HR platform that brings employee records, leave, payroll, attendance and performance together, so your team can spend less time chasing processes and more time moving forward.";
    let feature = |title: &str| json!({ "title": title, "body": "Words." });
    let home = |lead: &str| {
        json!({
            "seo_description": "ZiraHR is cloud HR and payroll software: employee records, leave, payroll, attendance and performance in one connected platform, with self-service in any web browser.",
            "sections": [
                { "id": "h", "type": "hero", "heading": "Your people. Your payroll.", "lead": lead, "visual": "connected_modules" },
                { "id": "g", "type": "feature_grid", "tone": "inverse", "heading": "Made for the way real teams work.",
                  "items": [feature("Many branches, one view"), feature("Approvals that follow you"),
                            feature("Connected workflows"), feature("Self-service in a browser"),
                            feature("Answers, not exports"), feature("Statutory rules you can see")] },
                { "id": "t", "type": "text", "body": "Words." },
            ]
        })
    };
    let platform = json!({
        "seo_description": "Explore ZiraHR's modules: Core HR, payroll with statutory rules, leave, time and attendance, performance and employee self-service in your browser.",
        "sections": [{ "id": "h", "type": "hero", "heading": "The platform" }],
    });
    let reset = |home: Value| {
        let pool = pool.clone();
        let platform = platform.clone();
        async move {
            sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'page.zirahr_hero_modules'")
                .bind(site)
                .execute(&pool)
                .await
                .unwrap();
            for (path, doc) in [("", home), ("platform", platform)] {
                sqlx::query("UPDATE pages SET draft = $3, published = $3 WHERE site_id = $1 AND path = $2")
                    .bind(site)
                    .bind(path)
                    .bind(doc)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
        }
    };
    let read = |path: &'static str| {
        let pool = pool.clone();
        async move {
            let (draft, published): (Value, Value) =
                sqlx::query_as("SELECT draft, published FROM pages WHERE site_id = $1 AND path = $2")
                    .bind(site)
                    .bind(path)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            (draft, published)
        }
    };

    reset(home(old_lead)).await;
    zirahr_guide::publish_hero_modules(&pool).await.unwrap();
    let (draft, published) = read("").await;
    for doc in [&draft, &published] {
        let hero = &doc["sections"][0];
        assert!(
            hero["lead"]
                .as_str()
                .unwrap()
                .contains("recruitment, learning, collaboration")
        );
        assert_eq!(hero["ess"]["heading"], "Your team. Their HR. One simple portal.");
        assert!(!hero["ess"]["body"].as_str().unwrap().contains("app store"));
        let story = &doc["sections"][1];
        assert_eq!(story["type"], "steps");
        assert_eq!(story["style"], "story");
        assert_eq!(story["id"], "g", "same place and id as the cards it replaces");
        assert_eq!(story["items"].as_array().unwrap().len(), 6);
        assert_eq!(
            doc["sections"][2]["type"], "text",
            "the rest of the page is untouched"
        );
        assert!(
            doc["seo_description"]
                .as_str()
                .unwrap()
                .contains("recruitment and learning")
        );
    }
    assert!(
        read("platform").await.1["seo_description"]
            .as_str()
            .unwrap()
            .contains("eight modules")
    );

    // Text edited in the Studio stays as it was; only what's still as seeded changes.
    reset(home("Our own introduction.")).await;
    zirahr_guide::publish_hero_modules(&pool).await.unwrap();
    let published = read("").await.1;
    assert_eq!(published["sections"][0]["lead"], "Our own introduction.");
    assert!(published["sections"][0]["ess"].is_object());

    // Once only: put back afterwards, it stays put back.
    sqlx::query("UPDATE pages SET draft = $2, published = $2 WHERE site_id = $1 AND path = ''")
        .bind(site)
        .bind(home(old_lead))
        .execute(&pool)
        .await
        .unwrap();
    zirahr_guide::publish_hero_modules(&pool).await.unwrap();
    assert_eq!(read("").await.1["sections"][0]["lead"], old_lead);

    // Leave the shared database as it was.
    for (path, draft, published) in saved {
        sqlx::query("UPDATE pages SET draft = $3, published = $4 WHERE site_id = $1 AND path = $2")
            .bind(site)
            .bind(path)
            .bind(draft)
            .bind(published)
            .execute(&pool)
            .await
            .unwrap();
    }
}
