//! Per-website settings (P7-E2): navigation, footer and enquiries on/off,
//! against real PostgreSQL (`TEST_DATABASE_URL`).

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
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Settings Tester', $3)")
        .bind(id)
        .bind(format!("settings-{role}-{}@figbud.test", id.simple()))
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

/// A public enquiry for `product`; returns the status and error code.
async fn enquire(app: &Router, product: &str, key: Uuid) -> (StatusCode, Value) {
    let body = json!({
        "kind": "waitlist", "product": product, "name": "Amina Otieno",
        "email": "amina@example.co.ke", "consent": true, "locale": "en",
        "source_path": "/en/contact", "elapsed_ms": 9000,
    });
    let request = Request::post("/v1/enquiries")
        .header(header::CONTENT_TYPE, "application/json")
        .header("idempotency-key", key.to_string())
        .body(Body::from(body.to_string()))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[tokio::test]
async fn navigation_footer_and_enquiries_are_managed_per_website() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    const SITE: &str = "/v1/admin/sites/expense_now/settings";
    sqlx::query("UPDATE sites SET settings = '{}'::jsonb WHERE slug = 'expense_now'")
        .execute(&pool)
        .await
        .unwrap();

    let editor = admin(&pool, "editor").await;
    let reviewer = admin(&pool, "reviewer").await;

    // Defaults: the website's pages in the menu, enquiries open.
    let (status, read) = call(&app, "GET", SITE, Some(&editor), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(read["settings"]["navigation"]["mode"], "pages");
    assert_eq!(read["settings"]["enquiries"]["open"], true);
    assert_eq!(read["can_edit"], false, "editors can look but not change");
    let version = read["version"].clone();

    let settings = json!({
        "navigation": { "mode": "custom", "items": [
            { "label": " Capabilities ", "href": "/capabilities" },
            { "label": "Pricing", "href": "https://expense.example.com/pricing" },
        ] },
        "footer": { "note": "Spend, under control.", "links": [{ "label": "Security", "href": "/security" }] },
        "enquiries": { "open": false, "closed_message": "Expense Now opens for sign-ups later this year." },
    });
    let (status, _) = call(
        &app,
        "POST",
        SITE,
        Some(&editor),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, saved) = call(
        &app,
        "POST",
        SITE,
        Some(&reviewer),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(
        saved["settings"]["navigation"]["items"][0]["label"],
        "Capabilities"
    );
    let (status, _) = call(
        &app,
        "POST",
        SITE,
        Some(&reviewer),
        Some(json!({ "settings": settings, "version": version })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "a stale editor is told to reload");

    // Unsafe or incomplete values are refused.
    let mut bad = settings.clone();
    bad["footer"]["links"] = json!([{ "label": "x", "href": "javascript:alert(1)" }]);
    let (status, _) = call(
        &app,
        "POST",
        SITE,
        Some(&reviewer),
        Some(json!({ "settings": bad, "version": saved["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, body) = call(
        &app,
        "POST",
        "/v1/admin/sites/figbud/settings",
        Some(&reviewer),
        Some(json!({ "settings": { "enquiries": { "open": false } }, "version": 1 })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    // Ziwa's brown and ivory bands (migration 14) reach its website.
    let (_, sites) = call(&app, "GET", "/v1/sites", None, None).await;
    let ziwa = sites
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["slug"] == "ziwa")
        .unwrap()
        .clone();
    assert_eq!(ziwa["settings"]["theme"]["brand_section"], "#4e2d17");
    assert_eq!(ziwa["settings"]["theme"]["soft_section"], "#fdf9f4");
    // A band too light for white text is refused.
    let mut pale = settings.clone();
    pale["theme"] = json!({ "brand_section": "#ffc642" });
    let (status, body) = call(
        &app,
        "POST",
        SITE,
        Some(&reviewer),
        Some(json!({ "settings": pale, "version": saved["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["code"], "contrast");

    // The websites see the settings.
    let (_, sites) = call(&app, "GET", "/v1/sites", None, None).await;
    let expense = sites
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["slug"] == "expense_now")
        .unwrap()
        .clone();
    assert_eq!(
        expense["settings"]["navigation"]["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(expense["settings"]["enquiries"]["open"], false);
    assert_eq!(expense["settings"]["footer"]["note"], "Spend, under control.");

    // Closed means closed at the API, not just a hidden button; other products stay open.
    let (status, body) = enquire(&app, "expense_now", Uuid::new_v4()).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"]["code"], "enquiries_closed");
    let (status, _) = enquire(&app, "zirahr", Uuid::new_v4()).await;
    assert_eq!(status, StatusCode::CREATED);

    // Reopening takes effect at once; earlier enquiries and their history are untouched.
    let mut open = settings.clone();
    open["enquiries"]["open"] = json!(true);
    let (status, _) = call(
        &app,
        "POST",
        SITE,
        Some(&reviewer),
        Some(json!({ "settings": open, "version": saved["version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let key = Uuid::new_v4();
    let (status, _) = enquire(&app, "expense_now", key).await;
    assert_eq!(status, StatusCode::CREATED);
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT a.action FROM audit_log a JOIN sites s ON s.id = a.site_id
          WHERE s.slug = 'expense_now' AND a.action LIKE 'site.enquiries_%'
            AND a.created_at > now() - interval '1 minute' ORDER BY a.created_at",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        actions[actions.len() - 2..],
        ["site.enquiries_closed", "site.enquiries_opened"]
    );

    sqlx::query("UPDATE sites SET settings = '{}'::jsonb WHERE slug = 'expense_now'")
        .execute(&pool)
        .await
        .unwrap();
}
