//! Content library (P7-D1) against real PostgreSQL (`TEST_DATABASE_URL`):
//! one item used on two websites, versions, permissions and safety rules.

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
        .header(header::ORIGIN, "http://localhost:3000");
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
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn admin(pool: &PgPool, role: &str) -> String {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Library Tester', $3)")
        .bind(id)
        .bind(format!("shared-{role}-{}@figbud.test", id.simple()))
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    let admin_config = config("unused").admin.unwrap();
    let token = admin::create_session(pool, &admin_config, id, "test", None)
        .await
        .unwrap();
    format!("figbud_admin={token}")
}

/// A published page on `site` using the shared item; returns (page id, path).
async fn page_using(app: &Router, pool: &PgPool, cookie: &str, site: &str, item: &str) -> (String, String) {
    let path = format!("security-{}", Uuid::new_v4().simple());
    let (status, created) = call(
        app,
        "POST",
        &format!("/v1/admin/sites/{site}/pages"),
        Some(cookie),
        Some(json!({ "title": "Security", "path": path, "template": "blank" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, detail) = call(app, "GET", &format!("/v1/admin/pages/{id}"), Some(cookie), None).await;
    let document = json!({ "sections": [
        { "id": "intro", "type": "hero", "heading": "Security at FigBud" },
        { "id": "promise", "type": "shared", "shared_id": item, "tone": "soft" },
    ] });
    let (status, saved) = call(
        app,
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(cookie),
        Some(json!({ "title": "Security", "path": path, "document": document, "version": detail["page"]["draft_version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    sqlx::query("UPDATE pages SET published = draft, published_at = now() WHERE id = $1::uuid")
        .bind(&id)
        .execute(pool)
        .await
        .unwrap();
    (id, path)
}

async fn public_text(app: &Router, site: &str, path: &str) -> Value {
    let (status, page) = call(
        app,
        "GET",
        &format!("/v1/sites/{site}/page?path={path}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{page}");
    page
}

#[tokio::test]
async fn one_item_on_two_websites_with_versions() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let editor = admin(&pool, "editor").await;
    let reviewer = admin(&pool, "reviewer").await;
    let promise = |body: &str| json!({ "type": "text", "heading": "Our data promise", "body": body });

    // Images and nested shared content can't be library items; content is validated.
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/shared",
        Some(&editor),
        Some(json!({ "name": "Photo", "content": { "type": "image", "image_id": Uuid::now_v7() } })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/shared",
        Some(&editor),
        Some(json!({ "name": "Bad", "content": { "type": "text", "body": "x", "script": "alert(1)" } })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, created) = call(
        &app,
        "POST",
        "/v1/admin/shared",
        Some(&editor),
        Some(json!({ "name": "Data promise", "content": promise("Your data stays in **your** region.") })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let item = created["id"].as_str().unwrap().to_owned();

    // Used on two websites before it's published: previews show the gap, websites leave it out.
    let (ziwa_page, ziwa_path) = page_using(&app, &pool, &editor, "ziwa", &item).await;
    let (_, zira_path) = page_using(&app, &pool, &editor, "zirahr", &item).await;
    let page = public_text(&app, "ziwa", &ziwa_path).await;
    assert_eq!(
        page["sections"].as_array().unwrap().len(),
        1,
        "unpublished content isn't shown"
    );
    let (_, detail) = call(
        &app,
        "GET",
        &format!("/v1/admin/pages/{ziwa_page}"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(detail["preview"]["sections"][1]["type"], "shared");

    // Only reviewers publish, with a note; each publish is a version.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/publish"),
        Some(&editor),
        Some(json!({ "note": "First version" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, published) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/publish"),
        Some(&reviewer),
        Some(json!({ "note": "First version" })),
    )
    .await;
    assert_eq!((status, published["version"].clone()), (StatusCode::OK, json!(1)));
    for (site, path) in [("ziwa", &ziwa_path), ("zirahr", &zira_path)] {
        let page = public_text(&app, site, path).await;
        let section = &page["sections"][1];
        assert_eq!(section["type"], "text", "{site}");
        assert_eq!(section["tone"], "soft", "the page's own section style is kept");
        assert!(
            section["body_html"]
                .as_str()
                .unwrap()
                .contains("<strong>your</strong>")
        );
        assert_eq!(section["shared"]["version"], 1);
    }

    // One edit, published once, reaches both websites.
    let (_, current) = call(
        &app,
        "GET",
        &format!("/v1/admin/shared/{item}"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(
        current["used_on"].as_array().unwrap().len(),
        4,
        "two pages, draft and published"
    );
    let (status, _) = call(&app, "POST", &format!("/v1/admin/shared/{item}/draft"), Some(&editor),
        Some(json!({ "name": "Data promise", "content": promise("Your data stays in your region, encrypted."), "version": current["draft_version"] }))).await;
    assert_eq!(status, StatusCode::OK);
    // Drafts don't reach websites.
    assert!(
        public_text(&app, "ziwa", &ziwa_path).await["sections"][1]["body_html"]
            .as_str()
            .unwrap()
            .contains("<strong>your</strong>")
    );
    call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/publish"),
        Some(&reviewer),
        Some(json!({ "note": "Mention encryption" })),
    )
    .await;
    for (site, path) in [("ziwa", &ziwa_path), ("zirahr", &zira_path)] {
        let page = public_text(&app, site, path).await;
        assert!(
            page["sections"][1]["body_html"]
                .as_str()
                .unwrap()
                .contains("encrypted"),
            "{site}"
        );
        assert_eq!(page["sections"][1]["shared"]["version"], 2);
    }
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/publish"),
        Some(&reviewer),
        Some(json!({ "note": "Again" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "nothing new to publish");

    // Restoring version 1 puts it in the draft; publishing makes version 3.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/versions/1/restore"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, current) = call(
        &app,
        "GET",
        &format!("/v1/admin/shared/{item}"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(current["draft"]["body"], "Your data stays in **your** region.");
    assert_eq!(current["versions"].as_array().unwrap().len(), 2);
    let (_, v3) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/publish"),
        Some(&reviewer),
        Some(json!({ "note": "Back to the first wording" })),
    )
    .await;
    assert_eq!(v3["version"], 3);

    // In use, so it can't be archived; archived items can't be added to pages.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{item}/archive"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (_, spare) = call(
        &app,
        "POST",
        "/v1/admin/shared",
        Some(&editor),
        Some(json!({ "name": "Spare", "content": promise("Unused.") })),
    )
    .await;
    let spare = spare["id"].as_str().unwrap().to_owned();
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/shared/{spare}/archive"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, detail) = call(
        &app,
        "GET",
        &format!("/v1/admin/pages/{ziwa_page}"),
        Some(&editor),
        None,
    )
    .await;
    let document = json!({ "sections": [{ "id": "x", "type": "shared", "shared_id": spare }] });
    let (status, _) = call(&app, "POST", &format!("/v1/admin/pages/{ziwa_page}/draft"), Some(&editor),
        Some(json!({ "title": "Security", "path": ziwa_path, "document": document, "version": detail["page"]["draft_version"] }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let audited: i64 =
        sqlx::query_scalar("SELECT count(*) FROM audit_log WHERE target_id = $1 AND action LIKE 'shared.%'")
            .bind(&item)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(audited >= 6, "created, draft, published ×3, restored");
}
