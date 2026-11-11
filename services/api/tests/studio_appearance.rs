//! The Admin Studio's own appearance (owner's brief, 12 Nov 2026), against
//! real PostgreSQL (`TEST_DATABASE_URL`).

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
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Appearance Tester', $3)")
        .bind(id)
        .bind(format!("appearance-{role}-{}@figbud.test", id.simple()))
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

#[tokio::test]
async fn owners_draft_publish_and_roll_back_the_studio_appearance() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    const URI: &str = "/v1/admin/studio-appearance";
    let owner = admin(&pool, "owner").await;
    let reviewer = admin(&pool, "reviewer").await;
    let (status, read) = call(&app, "GET", URI, Some(&reviewer), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(read["can_edit"], false);

    let dark = json!({
        "background": "#0c0806", "sidebar": "#130d09", "surface": "#1a120d", "hover": "#241810",
        "border": "#4a3e35", "text": "#f8f1e8", "text_muted": "#e3d4c3", "action": "#f28c38",
        "action_text": "#2a170c", "accent_text": "#f28c38", "success": "#4ade80", "warning": "#fbbf24",
        "danger": "#f87171"
    });
    // Reviewers can't change what every Studio user sees.
    let body = json!({ "appearance": { "dark": dark }, "draft": null, "version": read["version"] });
    assert_eq!(
        call(&app, "POST", URI, Some(&reviewer), Some(body.clone()))
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    // An unreadable draft saves; published, it's refused.
    let mut weak = dark.clone();
    weak["text_muted"] = json!("#3a2a20");
    let (status, saved) = call(
        &app,
        "POST",
        URI,
        Some(&owner),
        Some(json!({
        "appearance": read["appearance"], "draft": { "dark": weak }, "version": read["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["draft"]["dark"]["text_muted"], "#3a2a20");
    let (status, _) = call(
        &app,
        "POST",
        URI,
        Some(&owner),
        Some(json!({
        "appearance": { "dark": weak }, "draft": null, "version": saved["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    // Published: kept for rollback with who published it, and readable by the Studio.
    let (status, published) = call(
        &app,
        "POST",
        URI,
        Some(&owner),
        Some(json!({
        "appearance": { "dark": dark }, "draft": null, "version": saved["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{published}");
    assert_eq!(published["history"][0]["by"], "Appearance Tester");
    let (_, public) = call(&app, "GET", "/v1/studio/appearance", None, None).await;
    assert_eq!(public["appearance"]["dark"]["sidebar"], "#130d09");
    assert!(public.get("draft").is_none() && public.get("history").is_none());
    // A stale editor is told to reload.
    assert_eq!(
        call(
            &app,
            "POST",
            URI,
            Some(&owner),
            Some(json!({ "appearance": {}, "draft": null, "version": saved["version"] }))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    // Restoring the built-in palette is a publish too.
    let (status, restored) = call(
        &app,
        "POST",
        URI,
        Some(&owner),
        Some(json!({
        "appearance": {}, "draft": null, "version": published["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(restored["appearance"], json!({}));
    assert!(restored["history"].as_array().unwrap().len() >= 2);
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE target_type = 'studio' AND actor_user_id IN
           (SELECT id FROM admin_users WHERE name = 'Appearance Tester') ORDER BY created_at",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(actions.contains(&"studio.appearance_draft_saved".to_owned()));
    assert!(actions.contains(&"studio.appearance_published".to_owned()));
}
