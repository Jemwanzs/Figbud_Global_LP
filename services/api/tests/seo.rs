//! Search settings per page (P7-G1) against real PostgreSQL
//! (`TEST_DATABASE_URL`): redirects when a published page moves, pages kept
//! out of search engines, and a page's own sharing image.

mod common;

use std::io::Cursor;

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
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn editor(pool: &PgPool) -> String {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'SEO Tester', 'editor')")
        .bind(id)
        .bind(format!("seo-{}@figbud.test", id.simple()))
        .execute(pool)
        .await
        .unwrap();
    let admin_config = config("unused").admin.unwrap();
    let token = admin::create_session(pool, &admin_config, id, "test", None)
        .await
        .unwrap();
    format!("figbud_admin={token}")
}

/// Where an old Ziwa address forwards to, from the public redirect list.
async fn forwards(app: &Router, from: &str) -> Option<String> {
    let (status, list) = call(app, "GET", "/v1/redirects", None, None).await;
    assert_eq!(status, StatusCode::OK);
    list.as_array()
        .unwrap()
        .iter()
        .find(|r| r["site"] == "ziwa" && r["from"] == format!("/{from}").as_str())
        .map(|r| r["to"].as_str().unwrap().to_owned())
}

async fn publish(pool: &PgPool, page: &str) {
    sqlx::query("UPDATE pages SET published = draft, published_at = now() WHERE id = $1::uuid")
        .bind(page)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn redirects_noindex_and_page_sharing_images() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let cookie = editor(&pool).await;
    let run = Uuid::new_v4().simple().to_string()[..8].to_owned();
    let old = format!("pricing-{run}");
    let new = format!("plans-{run}");

    // A published page with a sharing image from the library, kept out of search engines.
    // Unique per run, so it is never recognised as an earlier upload.
    let tint = Uuid::new_v4().into_bytes();
    let mut photo = Cursor::new(Vec::new());
    image::RgbImage::from_fn(1600, 900, |x, y| {
        image::Rgb([(x % 256) as u8, tint[(y % 16) as usize], 40])
    })
    .write_to(&mut photo, image::ImageFormat::Jpeg)
    .unwrap();
    let req = Request::post("/v1/admin/sites/ziwa/media/uploads?label=Plans&alt=Ziwa%20pricing%20plans")
        .header(header::ORIGIN, ORIGIN)
        .header(header::COOKIE, &cookie)
        .header(header::CONTENT_TYPE, "image/jpeg")
        .body(Body::from(photo.into_inner()))
        .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap();
    // Created, or already in the library (the same file twice is recognised).
    assert!(
        status == StatusCode::CREATED || status == StatusCode::OK,
        "{status}: {}",
        String::from_utf8_lossy(&bytes)
    );
    let image_id = serde_json::from_slice::<Value>(&bytes).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    let (status, created) = call(
        &app,
        "POST",
        "/v1/admin/sites/ziwa/pages",
        Some(&cookie),
        Some(json!({ "title": "Pricing", "path": old, "template": "blank" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    let document = json!({ "seo_title": "Ziwa pricing", "seo_image_id": image_id, "seo_noindex": true,
                           "sections": [{ "id": "h", "type": "hero", "heading": "Plans for every lender" }] });
    let save = |path: &str, version: Value| json!({ "title": "Pricing", "path": path, "document": document, "version": version });
    let (_, detail) = call(&app, "GET", &format!("/v1/admin/pages/{id}"), Some(&cookie), None).await;
    let (status, saved) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(&cookie),
        Some(save(&old, detail["page"]["draft_version"].clone())),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["preview"]["seo_image"]["alt"], "Ziwa pricing plans");
    publish(&pool, &id).await;

    // Websites learn the page is noindex (sitemaps leave it out) and get its image.
    let (_, list) = call(&app, "GET", "/v1/sites/ziwa/pages", None, None).await;
    let listed = list
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["path"] == old.as_str())
        .unwrap()
        .clone();
    assert_eq!(listed["noindex"], true);
    let (_, public) = call(
        &app,
        "GET",
        &format!("/v1/sites/ziwa/page?path={old}"),
        None,
        None,
    )
    .await;
    assert_eq!(public["seo_noindex"], true);
    assert_eq!(public["seo_image"]["id"], image_id.as_str());
    // The sharing image is public because a published page uses it.
    let req = Request::get(format!("/v1/media/{image_id}?w=1200"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(app.clone().oneshot(req).await.unwrap().status(), StatusCode::OK);
    // In use, so it can't be archived.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/media/{image_id}/archive"),
        Some(&cookie),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Moving the published page: the old address forwards to the new one.
    let (status, moved) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(&cookie),
        Some(save(&new, saved["draft_version"].clone())),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(forwards(&app, &old).await, Some(format!("/{new}")));
    let (_, detail) = call(&app, "GET", &format!("/v1/admin/pages/{id}"), Some(&cookie), None).await;
    assert_eq!(detail["redirects"][0]["from_path"], format!("/{old}"));
    // Unknown addresses don't redirect.
    assert_eq!(forwards(&app, "nowhere-at-all").await, None);

    // Moving back: the address is in use again, so it's no longer a redirect (no loops).
    let (status, back) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(&cookie),
        Some(save(&old, moved["draft_version"].clone())),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{back}");
    assert_eq!(forwards(&app, &old).await, None);
    assert_eq!(forwards(&app, &new).await, Some(format!("/{old}")));

    // Editors can stop an old address forwarding.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{id}/redirects/remove"),
        Some(&cookie),
        Some(json!({ "from_path": format!("/{new}") })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(forwards(&app, &new).await, None);

    // Archived pages don't receive redirects.
    let (_, detail) = call(&app, "GET", &format!("/v1/admin/pages/{id}"), Some(&cookie), None).await;
    let (_, again) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(&cookie),
        Some(save(&new, detail["page"]["draft_version"].clone())),
    )
    .await;
    assert!(again["draft_version"].is_number(), "{again}");
    sqlx::query("UPDATE pages SET archived_at = now() WHERE id = $1::uuid")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(forwards(&app, &old).await, None);
}
