//! Display time zone (owner's brief, 14 Nov 2026) against real PostgreSQL
//! (`TEST_DATABASE_URL`): East Africa Time by default, owners change the
//! organisation's zone, anyone can choose their own, timestamps stay in UTC.

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
    cookie: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::ORIGIN, "http://localhost:3000")
        .header(header::COOKIE, cookie);
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

async fn admin(pool: &PgPool, role: &str) -> (Uuid, String) {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Zone Tester', $3)")
        .bind(id)
        .bind(format!("zone-{role}-{}@figbud.test", id.simple()))
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    let admin_config = config("unused").admin.unwrap();
    let token = admin::create_session(pool, &admin_config, id, "test", None)
        .await
        .unwrap();
    (id, format!("figbud_admin={token}"))
}

#[tokio::test]
async fn east_africa_time_by_default_owners_set_the_organisation_and_anyone_their_own() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    sqlx::query("UPDATE studio_settings SET time_zone = 'Africa/Nairobi'")
        .execute(&pool)
        .await
        .unwrap();
    let (owner_id, owner) = admin(&pool, "owner").await;
    let (_, editor) = admin(&pool, "editor").await;

    // The Studio learns the zone with the signed-in person.
    let (status, me) = call(&app, "GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        me["time_zone"],
        json!({ "organisation": "Africa/Nairobi", "own": null, "effective": "Africa/Nairobi" })
    );

    // Only owners change the organisation's zone, and only to a listed one.
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/time-zone",
        &editor,
        Some(json!({ "time_zone": "UTC" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = call(
        &app,
        "POST",
        "/v1/admin/time-zone",
        &owner,
        Some(json!({ "time_zone": "Mars/Olympus_Mons" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["field"], "time_zone");
    let (status, body) = call(
        &app,
        "POST",
        "/v1/admin/time-zone",
        &owner,
        Some(json!({ "time_zone": "Africa/Lagos" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["organisation"], "Africa/Lagos");
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'studio.time_zone_changed' AND actor_user_id = $1",
    )
    .bind(owner_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    // Anyone may follow their own zone, or the organisation's again.
    let (status, body) = call(
        &app,
        "POST",
        "/v1/admin/security/time-zone",
        &editor,
        Some(json!({ "time_zone": "Europe/London" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["own"], "Europe/London");
    assert_eq!(body["effective"], "Europe/London");
    let (_, me) = call(&app, "GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(me["time_zone"]["effective"], "Europe/London");
    let (_, body) = call(
        &app,
        "POST",
        "/v1/admin/security/time-zone",
        &editor,
        Some(json!({ "time_zone": null })),
    )
    .await;
    assert_eq!(body["effective"], "Africa/Lagos");

    // Back to the default, for other tests.
    sqlx::query("UPDATE studio_settings SET time_zone = 'Africa/Nairobi'")
        .execute(&pool)
        .await
        .unwrap();
}
