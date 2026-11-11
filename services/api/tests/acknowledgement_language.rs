//! The visitor's acknowledgement speaks their language once it's published
//! with a review (P5-12), against real PostgreSQL.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn acknowledgements_are_english_until_the_language_is_published() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let submit = |company: String| {
        let app = app.clone();
        async move {
            let body = json!({
                "kind": "demo_request", "product": "zirahr", "name": "Amina Otieno",
                "email": "amina@example.co.ke", "company": company, "consent": true,
                "locale": "sw", "source_path": "/sw/contact", "elapsed_ms": 9000,
            });
            let request = Request::post("/v1/enquiries")
                .header(header::CONTENT_TYPE, "application/json")
                .header("idempotency-key", Uuid::new_v4().to_string())
                .body(Body::from(body.to_string()))
                .unwrap();
            let response = app.oneshot(request).await.unwrap();
            assert_eq!(response.status(), StatusCode::CREATED);
            let bytes = axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap();
            serde_json::from_slice::<Value>(&bytes).unwrap()["reference"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let subject = |reference: String| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(
                "SELECT o.subject FROM email_outbox o JOIN enquiries e ON e.id = o.enquiry_id
                  WHERE e.reference = $1 AND o.template = 'visitor_acknowledgement'",
            )
            .bind(reference)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let run = Uuid::now_v7().simple().to_string();

    // Kiswahili is a draft: English.
    sqlx::query("UPDATE locale_reviews SET status = 'draft' WHERE code = 'sw'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        subject(submit(format!("Mfano A {run}")).await).await,
        "Your ZiraHR demo request"
    );

    // Published with a review: Kiswahili.
    sqlx::query(
        "UPDATE locale_reviews SET status = 'published', reviewer = 'Reviewer (test)', reviewed_on = '2026-11-10',
                evidence = 'Review sheet (test)' WHERE code = 'sw'",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        subject(submit(format!("Mfano B {run}")).await).await,
        "Ombi lako la onyesho la ZiraHR"
    );

    sqlx::query("UPDATE locale_reviews SET status = 'draft' WHERE code = 'sw'")
        .execute(&pool)
        .await
        .unwrap();
}
