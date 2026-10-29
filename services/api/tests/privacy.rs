//! Privacy & Cookies (P7-PC1) against real PostgreSQL (`TEST_DATABASE_URL`):
//! banner settings, consent records without personal data, Studio controls.

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use figbud_api::{admin, privacy};
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
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Privacy Tester', $3)")
        .bind(id)
        .bind(format!("privacy-{role}-{}@figbud.test", id.simple()))
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
async fn cookie_banner_settings_consent_records_and_studio_controls() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    sqlx::query("DELETE FROM privacy_settings")
        .execute(&pool)
        .await
        .unwrap();

    // Before anything is saved the websites get the defaults: no integrations.
    let (status, public) = call(&app, "GET", "/v1/privacy", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(public["banner"]["title"], "Your privacy matters");
    assert_eq!(public["policy_version"], 1);
    assert_eq!(public["integrations"], json!([]));

    // Consent records: the action must match the choices; unknown sites and
    // future policy versions are refused.
    let consent = Uuid::new_v4();
    let record = |action: &str, a: bool, p: bool, m: bool| {
        json!({ "consent_id": consent, "site": "figbud", "action": action,
                "analytics": a, "preferences": p, "marketing": m, "policy_version": 1 })
    };
    let (status, _) = call(
        &app,
        "POST",
        "/v1/privacy/consent",
        None,
        Some(record("reject_optional", false, false, false)),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "POST",
        "/v1/privacy/consent",
        None,
        Some(record("custom", true, false, false)),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "POST",
        "/v1/privacy/consent",
        None,
        Some(record("accept_all", true, false, false)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "accept all must allow everything"
    );
    let mut unknown = record("custom", true, true, false);
    unknown["site"] = json!("nowhere");
    let (status, _) = call(&app, "POST", "/v1/privacy/consent", None, Some(unknown)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let mut future = record("custom", true, true, false);
    future["policy_version"] = json!(9);
    let (status, _) = call(&app, "POST", "/v1/privacy/consent", None, Some(future)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let mut extra = record("custom", true, true, false);
    extra["email"] = json!("someone@example.com");
    let (status, _) = call(&app, "POST", "/v1/privacy/consent", None, Some(extra)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "no personal data is accepted");

    // The Studio: anyone signed in can read the settings and the report;
    // only owners change them.
    let viewer = admin(&pool, "viewer").await;
    let reviewer = admin(&pool, "reviewer").await;
    let owner = admin(&pool, "owner").await;
    let (status, _) = call(&app, "GET", "/v1/admin/privacy", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, read) = call(&app, "GET", "/v1/admin/privacy", Some(&viewer), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(read["version"], 0);
    assert_eq!(read["can_edit"], false);
    assert!(read["report"]["visitors"].as_i64().unwrap() >= 1);
    let mut config = read["config"].clone();
    config["retention_days"] = json!(90);
    config["banner"]["title"] = json!("  Cookies at FigBud  ");
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&reviewer),
        Some(json!({ "config": config, "version": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, saved) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&owner),
        Some(json!({ "config": config, "version": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["version"], 1);
    assert_eq!(saved["config"]["banner"]["title"], "Cookies at FigBud");
    assert_eq!(
        saved["config"]["policy_version"], 1,
        "text changes don't ask visitors again"
    );
    // A stale editor is told to reload.
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&owner),
        Some(json!({ "config": config, "version": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Bad values are refused: script-like IDs, unsafe links, out-of-range periods.
    let mut bad = saved["config"].clone();
    bad["integrations"] =
        json!([{ "provider": "google_analytics", "tracking_id": "G-<script>", "enabled": true }]);
    bad["privacy_url"] = json!("javascript:alert(1)");
    bad["record_months"] = json!(1);
    let (status, body) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&owner),
        Some(json!({ "config": bad, "version": 1 })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    // Turning on a new provider asks visitors again, and only enabled
    // integrations reach the websites.
    let mut next = saved["config"].clone();
    next["integrations"] = json!([
        { "provider": "plausible", "tracking_id": "figbud.test", "enabled": true },
        { "provider": "meta_pixel", "tracking_id": "123456789012345", "enabled": false },
    ]);
    let (status, saved) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&owner),
        Some(json!({ "config": next, "version": 1 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["config"]["policy_version"], 2);
    let (_, public) = call(&app, "GET", "/v1/privacy", None, None).await;
    assert_eq!(public["policy_version"], 2);
    assert_eq!(public["retention_days"], 90);
    assert_eq!(
        public["integrations"],
        json!([{ "provider": "plausible", "tracking_id": "figbud.test", "category": "analytics" }])
    );
    // Asking again on request.
    let (_, saved) = call(
        &app,
        "POST",
        "/v1/admin/privacy",
        Some(&owner),
        Some(json!({ "config": saved["config"], "version": 2, "ask_again": true })),
    )
    .await;
    assert_eq!(saved["config"]["policy_version"], 3);
    let audited: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_log WHERE action = 'privacy.updated' AND created_at > now() - interval '1 minute'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(audited >= 3);

    // Records past their retention period are deleted.
    sqlx::query("UPDATE consent_records SET created_at = now() - interval '30 months' WHERE consent_id = $1")
        .bind(consent)
        .execute(&pool)
        .await
        .unwrap();
    assert!(privacy::purge(&pool).await.unwrap() >= 2);
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM consent_records WHERE consent_id = $1")
        .bind(consent)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
    sqlx::query("DELETE FROM privacy_settings")
        .execute(&pool)
        .await
        .unwrap();
}
