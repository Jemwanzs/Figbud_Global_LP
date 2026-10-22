//! HTTP-level tests. Router tests run without a database (the pool connects
//! lazily). Database-backed tests run only when `TEST_DATABASE_URL` is set,
//! e.g. against the Docker Compose Postgres: `npm run db:up`.

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Router,
    body::Body,
    extract::connect_info::MockConnectInfo,
    http::{Request, StatusCode},
};
use figbud_api::{
    config::{AppEnv, Config, EmailConfig, EmailMode},
    email::{EmailSender, LogSender, OutgoingEmail, SendError, outbox},
    rate_limit::RateLimiter,
    routes::{AppState, router},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use uuid::Uuid;

fn config(database_url: &str) -> Config {
    Config {
        app_env: AppEnv::Development,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        database_url: database_url.into(),
        database_max_connections: 2,
        cors_allowed_origins: vec!["http://localhost:3000".into()],
        trust_proxy: false,
        ip_hash_salt: "test".into(),
        enquiry_rate_limit: 100,
        enquiry_rate_window: Duration::from_secs(60),
        min_form_fill: Duration::from_millis(2500),
        email: EmailConfig {
            mode: EmailMode::Log,
            from: "FigBud <no-reply@localhost>".into(),
            reply_to: None,
            team_recipients: vec!["team@example.com".into()],
            zirahr_recipients: vec![],
            jasiri_recipients: vec![],
            expense_now_recipients: vec![],
            partnership_recipients: vec![],
            send_acknowledgements: true,
            worker_interval: Duration::from_secs(5),
        },
    }
}

fn app_with(pool: sqlx::PgPool, config: Config) -> Router {
    let state = Arc::new(AppState {
        enquiry_limiter: RateLimiter::new(config.enquiry_rate_limit, config.enquiry_rate_window),
        config,
        pool,
    });
    router(state).layer(MockConnectInfo(SocketAddr::from(([203, 0, 113, 9], 4000))))
}

fn lazy_app() -> Router {
    let url = "postgres://nobody:nothing@127.0.0.1:1/none";
    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_millis(300))
        .connect_lazy(url)
        .unwrap();
    app_with(pool, config(url))
}

fn post_enquiry(body: &Value, key: Option<Uuid>) -> Request<Body> {
    let mut builder = Request::post("/v1/enquiries").header("content-type", "application/json");
    if let Some(key) = key {
        builder = builder.header("idempotency-key", key.to_string());
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

fn valid_demo_request() -> Value {
    json!({
        "kind": "demo_request",
        "product": "zirahr",
        "name": "Amina Wanjiru",
        "email": "amina@example.co.ke",
        "company": "Mfano Ltd",
        "consent": true,
        "locale": "en",
        "source_path": "/en/contact",
        "elapsed_ms": 12000
    })
}

#[tokio::test]
async fn liveness_does_not_need_the_database() {
    let response = lazy_app()
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key("x-request-id"));
    assert_eq!(json_body(response).await["status"], "ok");
}

#[tokio::test]
async fn readiness_reports_an_unreachable_database() {
    let response = lazy_app()
        .oneshot(Request::get("/health/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(json_body(response).await["database"], "unreachable");
}

#[tokio::test]
async fn enquiries_require_an_idempotency_key() {
    let response = lazy_app()
        .oneshot(post_enquiry(&valid_demo_request(), None))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn invalid_enquiries_return_field_errors() {
    let body = json!({ "kind": "contact", "product": "jasiri", "email": "nope" });
    let response = lazy_app()
        .oneshot(post_enquiry(&body, Some(Uuid::new_v4())))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let body = json_body(response).await;
    let fields: Vec<&str> = body["error"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["name", "email", "message", "consent"]);
}

#[tokio::test]
async fn cors_allows_configured_origins_only() {
    let preflight = |origin: &'static str| {
        Request::builder()
            .method("OPTIONS")
            .uri("/v1/enquiries")
            .header("origin", origin)
            .header("access-control-request-method", "POST")
            .body(Body::empty())
            .unwrap()
    };
    let allowed = lazy_app()
        .oneshot(preflight("http://localhost:3000"))
        .await
        .unwrap();
    assert_eq!(
        allowed.headers()["access-control-allow-origin"],
        "http://localhost:3000"
    );
    let denied = lazy_app()
        .oneshot(preflight("https://evil.example"))
        .await
        .unwrap();
    assert!(!denied.headers().contains_key("access-control-allow-origin"));
}

#[tokio::test]
async fn rate_limit_returns_retry_after() {
    let url = "postgres://nobody:nothing@127.0.0.1:1/none";
    let pool = PgPoolOptions::new().connect_lazy(url).unwrap();
    let mut config = config(url);
    config.enquiry_rate_limit = 1;
    let app = app_with(pool, config);
    let bad = json!({});
    let first = app
        .clone()
        .oneshot(post_enquiry(&bad, Some(Uuid::new_v4())))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let second = app
        .oneshot(post_enquiry(&bad, Some(Uuid::new_v4())))
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(second.headers().contains_key("retry-after"));
}

// ---------------------------------------------------------------------------
// Database-backed tests
// ---------------------------------------------------------------------------

/// Tests that drain the shared outbox run one at a time, so neither delivers
/// the other's messages with the wrong sender.
static OUTBOX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn database() -> Option<sqlx::PgPool> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let pool = PgPoolOptions::new().max_connections(4).connect(&url).await.ok()?;
    sqlx::migrate!("./migrations").run(&pool).await.ok()?;
    Some(pool)
}

#[tokio::test]
async fn stores_enquiries_idempotently_and_delivers_email() {
    let Some(pool) = database().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let _outbox = OUTBOX.lock().await;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let key = Uuid::new_v4();

    let first = app
        .clone()
        .oneshot(post_enquiry(&valid_demo_request(), Some(key)))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::CREATED);
    let reference = json_body(first).await["reference"].as_str().unwrap().to_owned();

    // A network retry with the same key must not create a second enquiry.
    let replay = app
        .oneshot(post_enquiry(&valid_demo_request(), Some(key)))
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::OK);
    assert_eq!(json_body(replay).await["reference"], reference.as_str());

    let (enquiries, emails): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM enquiries WHERE idempotency_key = $1),
                (SELECT count(*) FROM email_outbox o JOIN enquiries e ON e.id = o.enquiry_id WHERE e.idempotency_key = $1)",
    )
    .bind(key)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((enquiries, emails), (1, 2));

    let mut delivered = 0;
    for _ in 0..20 {
        delivered += outbox::deliver_due(&pool, &LogSender, &config(&url).email)
            .await
            .unwrap();
        let pending: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM email_outbox o JOIN enquiries e ON e.id = o.enquiry_id
              WHERE e.idempotency_key = $1 AND o.status <> 'skipped'",
        )
        .bind(key)
        .fetch_one(&pool)
        .await
        .unwrap();
        if pending == 0 {
            break;
        }
    }
    assert!(delivered >= 2);

    // Simulated delivery is never recorded as sent.
    let sent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM email_outbox o JOIN enquiries e ON e.id = o.enquiry_id
          WHERE e.idempotency_key = $1 AND (o.status = 'sent' OR o.sent_at IS NOT NULL)",
    )
    .bind(key)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(sent, 0);
}

/// Stands in for Resend: accepts every message and records the recipients.
#[derive(Default)]
struct AcceptingSender {
    recipients: std::sync::Mutex<Vec<Vec<String>>>,
}

#[async_trait::async_trait]
impl EmailSender for AcceptingSender {
    fn provider(&self) -> &'static str {
        "test"
    }

    async fn send(&self, email: &OutgoingEmail) -> Result<String, SendError> {
        self.recipients.lock().unwrap().push(email.to.clone());
        Ok(format!("msg-{}", email.id))
    }
}

#[tokio::test]
async fn held_messages_wait_for_a_provider_then_reach_configured_recipients() {
    let Some(pool) = database().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let _outbox = OUTBOX.lock().await;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();

    // Before Resend: delivery on hold and no team recipients configured yet.
    let mut held = config(&url);
    held.email.mode = EmailMode::Hold;
    held.email.team_recipients = vec![];
    let app = app_with(pool.clone(), held);
    let key = Uuid::new_v4();
    let response = app
        .oneshot(post_enquiry(&valid_demo_request(), Some(key)))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let statuses: Vec<(String, Vec<String>)> = sqlx::query_as(
        "SELECT o.status, o.to_addresses FROM email_outbox o JOIN enquiries e ON e.id = o.enquiry_id
          WHERE e.idempotency_key = $1 AND o.template = 'team_notification'",
    )
    .bind(key)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(statuses, vec![("pending".to_owned(), vec![])]);

    // Resend configured later: the held notification goes to today's recipients.
    let sender = AcceptingSender::default();
    let mut live = config(&url).email;
    live.team_recipients = vec!["cto@example.com".into()];
    for _ in 0..20 {
        outbox::deliver_due(&pool, &sender, &live).await.unwrap();
        let (status, to, sent_at): (String, Vec<String>, Option<chrono::DateTime<chrono::Utc>>) =
            sqlx::query_as(
                "SELECT o.status, o.to_addresses, o.sent_at FROM email_outbox o
                   JOIN enquiries e ON e.id = o.enquiry_id
                  WHERE e.idempotency_key = $1 AND o.template = 'team_notification'",
            )
            .bind(key)
            .fetch_one(&pool)
            .await
            .unwrap();
        if status == "sent" {
            assert_eq!(to, vec!["cto@example.com".to_owned()]);
            assert!(sent_at.is_some());
            return;
        }
    }
    panic!("held team notification was never delivered");
}

#[tokio::test]
async fn automated_submissions_are_stored_but_never_emailed() {
    let Some(pool) = database().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let app = app_with(pool.clone(), config(&url));
    let key = Uuid::new_v4();
    let mut body = valid_demo_request();
    body["website"] = json!("https://spam.example");

    let response = app.oneshot(post_enquiry(&body, Some(key))).await.unwrap();
    // Bots receive the same success response as people.
    assert_eq!(response.status(), StatusCode::CREATED);

    let (is_spam, emails): (bool, i64) = sqlx::query_as(
        "SELECT e.is_spam, (SELECT count(*) FROM email_outbox o WHERE o.enquiry_id = e.id)
           FROM enquiries e WHERE e.idempotency_key = $1",
    )
    .bind(key)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(is_spam);
    assert_eq!(emails, 0);
}
