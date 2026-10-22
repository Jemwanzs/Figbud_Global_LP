//! Enquiries inbox against real PostgreSQL (`TEST_DATABASE_URL`): enquiries
//! arrive through the public endpoint, then admins review, follow up and
//! export them.

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

const ORIGIN: &str = "http://localhost:3000";

struct Inbox {
    app: Router,
    pool: PgPool,
    run: String,
}

impl Inbox {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run: Uuid::new_v4().simple().to_string()[..10].to_owned(),
        })
    }

    async fn admin(&self, role: &str) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Inbox Tester', $3)")
            .bind(id)
            .bind(format!(
                "{role}-{}-{}@figbud.test",
                self.run,
                &id.simple().to_string()[24..]
            ))
            .bind(role)
            .execute(&self.pool)
            .await
            .unwrap();
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session(&self.pool, &admin_config, id, "test", None)
            .await
            .unwrap();
        format!("figbud_admin={token}")
    }

    /// Submits an enquiry through the public form endpoint; `elapsed_ms` below
    /// the minimum fill time marks it as automated (spam).
    async fn enquiry(&self, name: &str, elapsed_ms: u64) -> String {
        let body = json!({
            "kind": "demo_request",
            "product": "zirahr",
            "name": name,
            "email": "amina@example.co.ke",
            "company": format!("Mfano {}", self.run),
            "consent": true,
            "locale": "en",
            "source_path": "/en/contact",
            "elapsed_ms": elapsed_ms,
        });
        let request = Request::post("/v1/enquiries")
            .header(header::CONTENT_TYPE, "application/json")
            .header("idempotency-key", Uuid::new_v4().to_string())
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap();
        serde_json::from_slice::<Value>(&bytes).unwrap()["reference"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    async fn call(
        &self,
        method: &str,
        uri: &str,
        cookie: &str,
        body: Option<Value>,
    ) -> (StatusCode, Vec<u8>, Option<String>) {
        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::COOKIE, cookie)
            .header(header::ORIGIN, ORIGIN);
        let req = match body {
            Some(body) => req
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let response = self.app.clone().oneshot(req).await.unwrap();
        let status = response.status();
        let disposition = response
            .headers()
            .get(header::CONTENT_DISPOSITION)
            .map(|v| v.to_str().unwrap().to_owned());
        let bytes = axum::body::to_bytes(response.into_body(), 8 << 20)
            .await
            .unwrap()
            .to_vec();
        (status, bytes, disposition)
    }

    async fn json(&self, method: &str, uri: &str, cookie: &str, body: Option<Value>) -> (StatusCode, Value) {
        let (status, bytes, _) = self.call(method, uri, cookie, body).await;
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }
}

#[tokio::test]
async fn review_and_follow_up_enquiries() {
    let Some(inbox) = Inbox::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (viewer, editor) = (inbox.admin("viewer").await, inbox.admin("editor").await);
    let real = inbox.enquiry("Amina Wanjiru", 12_000).await;
    let bot = inbox.enquiry("Bot Submission", 100).await;
    let search = format!("/v1/admin/enquiries?q=Mfano%20{}", inbox.run);

    let (status, page) = inbox.json("GET", &search, &viewer, None).await;
    assert_eq!(status, StatusCode::OK);
    let refs: Vec<&str> = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["reference"].as_str().unwrap())
        .collect();
    assert_eq!(
        refs,
        vec![real.as_str()],
        "automated submissions are hidden by default"
    );

    let (_, spam) = inbox
        .json("GET", &format!("{search}&status=spam"), &viewer, None)
        .await;
    assert_eq!(spam["items"][0]["reference"], bot.as_str());
    assert_eq!(spam["items"][0]["is_spam"], true);

    let id = page["items"][0]["id"].as_str().unwrap().to_owned();
    let (status, detail) = inbox
        .json("GET", &format!("/v1/admin/enquiries/{id}"), &viewer, None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        detail["enquiry"]["company"],
        format!("Mfano {}", inbox.run).as_str()
    );
    let templates: Vec<&str> = detail["emails"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["template"].as_str().unwrap())
        .collect();
    assert_eq!(templates, vec!["team_notification", "visitor_acknowledgement"]);

    let uri = format!("/v1/admin/enquiries/{id}/status");
    let (status, _) = inbox
        .json("POST", &uri, &viewer, Some(json!({ "status": "contacted" })))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "viewers only read");
    let (status, _) = inbox
        .json("POST", &uri, &editor, Some(json!({ "status": "won" })))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, body) = inbox
        .json("POST", &uri, &editor, Some(json!({ "status": "contacted" })))
        .await;
    assert_eq!(
        (status, body["status"].as_str()),
        (StatusCode::OK, Some("contacted"))
    );

    let (_, detail) = inbox
        .json("GET", &format!("/v1/admin/enquiries/{id}"), &viewer, None)
        .await;
    assert_eq!(detail["enquiry"]["status"], "contacted");
    assert_eq!(detail["history"][0]["action"], "enquiry.status_changed");
    assert_eq!(
        detail["history"][0]["detail"],
        json!({ "from": "new", "to": "contacted" })
    );

    let (_, filtered) = inbox
        .json("GET", &format!("{search}&status=contacted"), &viewer, None)
        .await;
    assert_eq!(filtered["total"], 1);
    let (status, _) = inbox
        .json("GET", "/v1/admin/enquiries?product=unknown", &viewer, None)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn only_owners_export_and_cells_are_formula_safe() {
    let Some(inbox) = Inbox::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (reviewer, owner) = (inbox.admin("reviewer").await, inbox.admin("owner").await);
    let reference = inbox
        .enquiry("=HYPERLINK(\"https://evil.example\")", 12_000)
        .await;
    let uri = format!("/v1/admin/enquiries/export?q=Mfano%20{}", inbox.run);

    let (status, _, _) = inbox.call("GET", &uri, &reviewer, None).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "personal data exports are owner-only"
    );

    let (status, bytes, disposition) = inbox.call("GET", &uri, &owner, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        disposition
            .unwrap()
            .starts_with("attachment; filename=\"figbud-enquiries-")
    );
    let csv = String::from_utf8(bytes).unwrap();
    let mut lines = csv.trim_start_matches('\u{feff}').lines();
    assert!(
        lines
            .next()
            .unwrap()
            .starts_with("reference,received_at,kind,product,status,name,email")
    );
    let row = lines.next().unwrap();
    assert!(row.starts_with(&format!("\"{reference}\"")));
    assert!(
        row.contains("\"'=HYPERLINK(\"\"https://evil.example\"\")\""),
        "{row}"
    );

    let exported: i64 = sqlx::query_scalar(
        "SELECT (detail->>'rows')::bigint FROM audit_log a JOIN admin_users u ON u.id = a.actor_user_id
          WHERE a.action = 'enquiry.exported' AND u.email LIKE $1 ORDER BY a.created_at DESC LIMIT 1",
    )
    .bind(format!("owner-{}-%", inbox.run))
    .fetch_one(&inbox.pool)
    .await
    .unwrap();
    assert_eq!(exported, 1);
}
