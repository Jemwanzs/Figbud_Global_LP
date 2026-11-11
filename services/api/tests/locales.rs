//! Localisation workflow (P7-G2), against real PostgreSQL.

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
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Locale Tester', $3)")
        .bind(id)
        .bind(format!("locale-{role}-{}@figbud.test", id.simple()))
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
async fn a_language_is_published_only_by_an_owner_with_a_recorded_review() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let owner = admin(&pool, "owner").await;
    let reviewer = admin(&pool, "reviewer").await;

    let (_, public) = call(&app, "GET", "/v1/locales", None, None).await;
    assert_eq!(public["published"][0], "en");
    let (status, read) = call(&app, "GET", "/v1/admin/locales", Some(&reviewer), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(read["can_edit"], false);
    let fr = read["locales"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["code"] == "fr")
        .unwrap()
        .clone();

    // Reviewers can't; owners can't without a recorded review.
    let publish = |version: &Value, review: bool| {
        if review {
            json!({ "status": "published", "reviewer": "Native reviewer (test)", "reviewed_on": "2026-11-10",
                    "evidence": "Signed review sheet (test)", "version": version })
        } else {
            json!({ "status": "published", "version": version })
        }
    };
    assert_eq!(
        call(
            &app,
            "POST",
            "/v1/admin/locales/fr",
            Some(&reviewer),
            Some(publish(&fr["version"], true))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, refused) = call(
        &app,
        "POST",
        "/v1/admin/locales/fr",
        Some(&owner),
        Some(publish(&fr["version"], false)),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
    let (status, done) = call(
        &app,
        "POST",
        "/v1/admin/locales/fr",
        Some(&owner),
        Some(publish(&fr["version"], true)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{done}");
    let (_, public) = call(&app, "GET", "/v1/locales", None, None).await;
    assert!(public["published"].as_array().unwrap().contains(&json!("fr")));
    // A stale page is told to reload.
    assert_eq!(
        call(
            &app,
            "POST",
            "/v1/admin/locales/fr",
            Some(&owner),
            Some(publish(&fr["version"], true))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    // Back to draft: out of indexing again.
    let fr = done["locales"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["code"] == "fr")
        .unwrap()
        .clone();
    let (status, _) = call(
        &app,
        "POST",
        "/v1/admin/locales/fr",
        Some(&owner),
        Some(json!({ "status": "draft", "version": fr["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, public) = call(&app, "GET", "/v1/locales", None, None).await;
    assert!(!public["published"].as_array().unwrap().contains(&json!("fr")));
    assert_eq!(
        call(
            &app,
            "POST",
            "/v1/admin/locales/de",
            Some(&owner),
            Some(json!({ "status": "draft", "version": 1 }))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE target_type = 'locale' AND target_id = 'fr' ORDER BY created_at",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(actions.ends_with(&["locale.published".to_owned(), "locale.unpublished".to_owned()]));
}
