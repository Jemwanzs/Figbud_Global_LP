//! Media library (P7-D2) against real PostgreSQL (`TEST_DATABASE_URL`):
//! uploads with required alt text, the Image block, usage, archiving and
//! when images are served publicly.

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

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Vec<u8>, Option<String>) {
    let response = app.clone().oneshot(req).await.unwrap();
    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .map(|v| v.to_str().unwrap().to_owned());
    let bytes = axum::body::to_bytes(response.into_body(), 32 << 20)
        .await
        .unwrap();
    (status, bytes.to_vec(), content_type)
}

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
    let (status, bytes, _) = send(app, req).await;
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn upload(
    app: &Router,
    cookie: &str,
    query: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> (StatusCode, Value) {
    let req = Request::post(format!("/v1/admin/sites/ziwa/media/uploads?{query}"))
        .header(header::ORIGIN, ORIGIN)
        .header(header::COOKIE, cookie)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(bytes))
        .unwrap();
    let (status, bytes, _) = send(app, req).await;
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn admin(pool: &PgPool, role: &str) -> String {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Media Tester', $3)")
        .bind(id)
        .bind(format!("media-{role}-{}@figbud.test", id.simple()))
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

/// A synthetic photo: a JPEG gradient, unique per run so uploads aren't deduplicated.
fn photo(seed: [u8; 16], width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbImage::from_fn(width, height, |x, y| {
        image::Rgb([(x % 256) as u8, (y % 256) as u8, seed[(x / 16 % 16) as usize]])
    });
    let mut out = Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Jpeg).unwrap();
    out.into_inner()
}

#[tokio::test]
async fn media_library_uploads_usage_and_public_delivery() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let viewer = admin(&pool, "viewer").await;
    let editor = admin(&pool, "editor").await;
    let seed = Uuid::new_v4().into_bytes();

    // Alt text and a name are required; viewers can't upload; types are checked.
    let (status, body) = upload(&app, &editor, "label=Team", "image/jpeg", photo(seed, 2600, 1200)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["field"], "alt_text");
    let (status, _) = upload(
        &app,
        &viewer,
        "label=Team&alt=Team",
        "image/jpeg",
        photo(seed, 64, 64),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = upload(
        &app,
        &editor,
        "label=Fake&alt=Fake",
        "image/png",
        photo(seed, 64, 64),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    let query = "label=Credit%20team&alt=A%20credit%20team%20reviewing%20a%20loan%20application";
    let (status, created) = upload(&app, &editor, query, "image/jpeg", photo(seed, 2600, 1200)).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let image_id = created["id"].as_str().unwrap().to_owned();
    // The same file again is recognised, not stored twice.
    let (status, again) = upload(&app, &editor, query, "image/jpeg", photo(seed, 2600, 1200)).await;
    assert_eq!(
        (status, again["duplicate"].clone()),
        (StatusCode::OK, json!(true))
    );

    // Stored capped at 2400 px wide, with photo renditions; listed for the Studio.
    let (status, list) = call(&app, "GET", "/v1/admin/sites/ziwa/media", Some(&viewer), None).await;
    assert_eq!(status, StatusCode::OK);
    let item = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == image_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(
        (item["width"].clone(), item["height"].clone()),
        (json!(2400), json!(1108))
    );
    assert_eq!(item["content_type"], "image/jpeg");
    assert_eq!(item["used_on"], json!([]));
    let req = Request::get(format!("/v1/admin/media/{image_id}?w=960"))
        .header(header::COOKIE, &viewer)
        .body(Body::empty())
        .unwrap();
    let (status, bytes, content_type) = send(&app, req).await;
    assert_eq!(
        (status, content_type.as_deref()),
        (StatusCode::OK, Some("image/jpeg"))
    );
    let rendition = image::load_from_memory(&bytes).unwrap();
    assert_eq!(rendition.width(), 960);

    // Not public until a published page uses it.
    let req = Request::get(format!("/v1/media/{image_id}"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(send(&app, req).await.0, StatusCode::NOT_FOUND);

    // An Image block on a page: the preview carries the library's alt text.
    let path = format!("media-{}", Uuid::new_v4().simple());
    let (status, page) = call(
        &app,
        "POST",
        "/v1/admin/sites/ziwa/pages",
        Some(&editor),
        Some(json!({ "title": "Our team", "path": path, "template": "blank" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{page}");
    let page_id = page["id"].as_str().unwrap().to_owned();
    let (_, detail) = call(
        &app,
        "GET",
        &format!("/v1/admin/pages/{page_id}"),
        Some(&editor),
        None,
    )
    .await;
    let document = json!({ "sections": [
        { "id": "img", "type": "image", "image_id": image_id, "caption": "Credit committee, Nairobi", "size": "wide" },
    ] });
    let (status, saved) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{page_id}/draft"),
        Some(&editor),
        Some(json!({ "title": "Our team", "path": path, "document": document, "version": detail["page"]["draft_version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let media = &saved["preview"]["sections"][0]["media"];
    assert_eq!(media["alt"], "A credit team reviewing a loan application");
    assert_eq!(media["widths"], json!([480, 960, 1440, 1920]));

    // Images from another website (or unknown ones) are refused.
    let other = json!({ "sections": [{ "id": "img", "type": "image", "image_id": Uuid::now_v7() }] });
    let (status, body) = call(
        &app,
        "POST",
        &format!("/v1/admin/pages/{page_id}/draft"),
        Some(&editor),
        Some(json!({ "title": "Our team", "path": path, "document": other, "version": saved["draft_version"] })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    // Usage is tracked, and an image in use can't be archived.
    let (_, list) = call(&app, "GET", "/v1/admin/sites/ziwa/media", Some(&viewer), None).await;
    let item = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == image_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(item["used_on"][0]["title"], "Our team");
    assert_eq!(item["used_on"][0]["state"], "draft");
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/media/{image_id}/archive"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Published (set directly here; approval is covered by the page tests):
    // the website receives the image details and the file becomes public.
    sqlx::query("UPDATE pages SET published = draft, published_at = now() WHERE id = $1::uuid")
        .bind(&page_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, public) = call(
        &app,
        "GET",
        &format!("/v1/sites/ziwa/page?path={path}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{public}");
    assert_eq!(
        public["sections"][0]["media"]["alt"],
        "A credit team reviewing a loan application"
    );
    assert_eq!(public["sections"][0]["caption"], "Credit committee, Nairobi");
    let req = Request::get(format!("/v1/media/{image_id}?w=480"))
        .body(Body::empty())
        .unwrap();
    let (status, bytes, content_type) = send(&app, req).await;
    assert_eq!(
        (status, content_type.as_deref()),
        (StatusCode::OK, Some("image/jpeg"))
    );
    assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 480);

    // Alt text stays editable and reaches the website on its next read.
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/media/{image_id}"),
        Some(&editor),
        Some(json!({ "label": "Credit team", "alt_text": "Ziwa's credit team at work" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, public) = call(
        &app,
        "GET",
        &format!("/v1/sites/ziwa/page?path={path}"),
        None,
        None,
    )
    .await;
    assert_eq!(
        public["sections"][0]["media"]["alt"],
        "Ziwa's credit team at work"
    );

    // Taken off the page and archived: the file is no longer served.
    sqlx::query("UPDATE pages SET archived_at = now() WHERE id = $1::uuid")
        .bind(&page_id)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/admin/media/{image_id}/archive"),
        Some(&editor),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let req = Request::get(format!("/v1/media/{image_id}"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(send(&app, req).await.0, StatusCode::NOT_FOUND);
    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action LIKE 'media.%' AND detail->>'media' = $1",
    )
    .bind(&image_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audited, 3, "uploaded, updated, archived");
}
