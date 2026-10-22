//! Editorial workflow against real PostgreSQL (`TEST_DATABASE_URL`): roles,
//! maker-checker, optimistic concurrency, scheduling, archive/restore and the
//! effect of each step on the public Blog & Insights API.

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

struct Desk {
    app: Router,
    pool: PgPool,
    run: String,
}

impl Desk {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run: Uuid::new_v4().simple().to_string()[..10].to_owned(),
        })
    }

    /// An admin with a live session; returns their session cookie.
    async fn admin(&self, role: &str) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(format!(
                "{role}-{}-{}@figbud.test",
                self.run,
                &id.simple().to_string()[24..]
            ))
            .bind(format!("Test {role}"))
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

    async fn call(&self, method: &str, uri: &str, cookie: &str, body: Option<Value>) -> (StatusCode, Value) {
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
        let bytes = axum::body::to_bytes(response.into_body(), 4 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    fn draft(&self, name: &str) -> Value {
        json!({
            "slug": format!("{name}-{}", self.run),
            "title": format!("Article {name}"),
            "excerpt": "A short summary.",
            "body_markdown": "## Section\n\nBody text.",
            "tags": ["Payroll", "Compliance"],
        })
    }

    async fn public_status(&self, slug: &str) -> StatusCode {
        let response = self
            .app
            .clone()
            .oneshot(
                Request::get(format!("/v1/articles/{slug}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        response.status()
    }

    async fn audit_actions(&self, article: &str) -> Vec<String> {
        sqlx::query_scalar("SELECT action FROM audit_log WHERE target_id = $1 ORDER BY created_at, id")
            .bind(article)
            .fetch_all(&self.pool)
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn draft_review_publish_with_maker_checker() {
    let Some(d) = Desk::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (editor, reviewer, viewer) = (
        d.admin("editor").await,
        d.admin("reviewer").await,
        d.admin("viewer").await,
    );

    let (status, _) = d
        .call("POST", "/v1/admin/cms/articles", &viewer, Some(d.draft("x")))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "viewers cannot write");

    let (status, article) = d
        .call("POST", "/v1/admin/cms/articles", &editor, Some(d.draft("guide")))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{article}");
    let id = article["id"].as_str().unwrap().to_owned();
    let slug = article["slug"].as_str().unwrap().to_owned();
    assert_eq!(
        (article["status"].as_str(), article["version"].as_i64()),
        (Some("draft"), Some(1))
    );
    assert_eq!(article["tags"], json!(["Compliance", "Payroll"]));
    assert_eq!(
        d.public_status(&slug).await,
        StatusCode::NOT_FOUND,
        "drafts are never public"
    );

    let (status, body) = d
        .call("POST", "/v1/admin/cms/articles", &editor, Some(d.draft("guide")))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["code"], "taken");

    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/submit"),
            &editor,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &editor,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "editors cannot publish");

    // The reviewer edits the article, so they may no longer approve it themselves.
    let mut edit = d.draft("guide");
    edit["title"] = json!("Article guide, reviewed");
    edit["version"] = json!(1);
    let (status, edited) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}"),
            &reviewer,
            Some(edit),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    let (status, body) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &reviewer,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(
        body["error"]["message"]
            .as_str()
            .unwrap()
            .contains("maker-checker")
    );

    let second_reviewer = d.admin("reviewer").await;
    let (status, published) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &second_reviewer,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{published}");
    assert_eq!(published["status"], "published");
    assert!(
        published["approved_by"]
            .as_str()
            .unwrap()
            .starts_with("reviewer-")
    );
    assert_eq!(d.public_status(&slug).await, StatusCode::OK);

    assert_eq!(
        d.audit_actions(&id).await,
        vec![
            "cms.article_created",
            "cms.article_submitted",
            "cms.article_updated",
            "cms.article_published"
        ]
    );
}

#[tokio::test]
async fn stale_saves_conflict_and_every_save_is_versioned() {
    let Some(d) = Desk::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let editor = d.admin("editor").await;
    let (_, article) = d
        .call(
            "POST",
            "/v1/admin/cms/articles",
            &editor,
            Some(d.draft("versions")),
        )
        .await;
    let id = article["id"].as_str().unwrap().to_owned();

    let mut first = d.draft("versions");
    first["version"] = json!(1);
    first["body_markdown"] = json!("Second draft");
    let (status, saved) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}"),
            &editor,
            Some(first.clone()),
        )
        .await;
    assert_eq!((status, saved["version"].as_i64()), (StatusCode::OK, Some(2)));

    // A second tab still holding version 1 must not overwrite version 2.
    let (status, body) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}"),
            &editor,
            Some(first),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["error"]["code"], "conflict");

    let (status, versions) = d
        .call(
            "GET",
            &format!("/v1/admin/cms/articles/{id}/versions"),
            &editor,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let numbers: Vec<i64> = versions
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["version"].as_i64().unwrap())
        .collect();
    assert_eq!(numbers, vec![2, 1]);

    // Long-form articles exceed the 16 KB form limit and are accepted here.
    let mut long = d.draft("versions");
    long["version"] = json!(2);
    long["body_markdown"] = json!("Lorem ipsum dolor sit amet. ".repeat(2500));
    let (status, saved) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}"),
            &editor,
            Some(long),
        )
        .await;
    assert_eq!((status, saved["version"].as_i64()), (StatusCode::OK, Some(3)));
}

#[tokio::test]
async fn scheduling_archive_restore_and_live_edits() {
    let Some(d) = Desk::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (editor, owner) = (d.admin("editor").await, d.admin("owner").await);
    let (_, article) = d
        .call(
            "POST",
            "/v1/admin/cms/articles",
            &editor,
            Some(d.draft("scheduled")),
        )
        .await;
    let id = article["id"].as_str().unwrap().to_owned();
    let slug = article["slug"].as_str().unwrap().to_owned();

    let past = json!({ "published_at": "2020-01-01T00:00:00Z" });
    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &owner,
            Some(past),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "no backdating");

    let future = (chrono::Utc::now() + chrono::Duration::days(2)).to_rfc3339();
    let (status, scheduled) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &owner,
            Some(json!({ "published_at": future })),
        )
        .await;
    assert_eq!(
        (status, scheduled["status"].as_str()),
        (StatusCode::OK, Some("published"))
    );
    assert_eq!(
        d.public_status(&slug).await,
        StatusCode::NOT_FOUND,
        "scheduled articles wait for their time"
    );

    // Live (published) articles are edited by reviewers or owners, not editors.
    let mut edit = d.draft("scheduled");
    edit["version"] = scheduled["version"].clone();
    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}"),
            &editor,
            Some(edit),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, archived) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/archive"),
            &owner,
            None,
        )
        .await;
    assert_eq!(
        (status, archived["status"].as_str()),
        (StatusCode::OK, Some("archived"))
    );
    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/archive"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, restored) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/restore"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        (restored["status"].as_str(), restored["approved_by"].as_str()),
        (Some("draft"), None)
    );

    // Owners may approve their own edits (a one-person team is never blocked); it is audited.
    let mut own = d.draft("scheduled");
    own["version"] = restored["version"].clone();
    d.call("POST", &format!("/v1/admin/cms/articles/{id}"), &owner, Some(own))
        .await;
    let (status, _) = d
        .call(
            "POST",
            &format!("/v1/admin/cms/articles/{id}/publish"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(d.public_status(&slug).await, StatusCode::OK);
    let self_approved: bool = sqlx::query_scalar(
        "SELECT (detail->>'self_approved')::bool FROM audit_log
          WHERE target_id = $1 AND action = 'cms.article_published' ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .bind(&id)
    .fetch_one(&d.pool)
    .await
    .unwrap();
    assert!(self_approved);
}

#[tokio::test]
async fn validation_taxonomy_preview_and_csrf() {
    let Some(d) = Desk::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (editor, reviewer, owner) = (
        d.admin("editor").await,
        d.admin("reviewer").await,
        d.admin("owner").await,
    );

    let mut bad = d.draft("bad");
    bad["slug"] = json!("Not A Slug");
    bad["category"] = json!("no-such-topic");
    let (status, body) = d.call("POST", "/v1/admin/cms/articles", &editor, Some(bad)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["field"], "slug");

    let topic = json!({ "name": format!("Payroll {}", d.run) });
    let (status, _) = d
        .call("POST", "/v1/admin/cms/categories", &editor, Some(topic.clone()))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, created) = d
        .call("POST", "/v1/admin/cms/categories", &reviewer, Some(topic.clone()))
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["slug"], format!("payroll-{}", d.run).as_str());
    let (status, _) = d
        .call("POST", "/v1/admin/cms/categories", &reviewer, Some(topic))
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    let author = json!({ "name": format!("Real Person {}", d.run), "detail": "Head of Payroll" });
    let (status, _) = d
        .call("POST", "/v1/admin/cms/authors", &reviewer, Some(author.clone()))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "only owners add bylines");
    let (status, _) = d
        .call("POST", "/v1/admin/cms/authors", &owner, Some(author))
        .await;
    assert_eq!(status, StatusCode::CREATED);

    let mut categorised = d.draft("categorised");
    categorised["category"] = created["slug"].clone();
    let (status, article) = d
        .call("POST", "/v1/admin/cms/articles", &editor, Some(categorised))
        .await;
    assert_eq!(
        (status, article["category"].clone()),
        (StatusCode::CREATED, created["slug"].clone())
    );

    let (status, taxonomy) = d.call("GET", "/v1/admin/cms/taxonomy", &editor, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        taxonomy["categories"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["slug"] == created["slug"])
    );

    let (status, preview) = d
        .call(
            "POST",
            "/v1/admin/cms/preview",
            &editor,
            Some(json!({ "body_markdown": "<script>x</script>\n\n## Hi" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!preview["html"].as_str().unwrap().contains("<script>"));
    assert_eq!(preview["headings"][0]["id"], "hi");

    // Without the admin Origin, writes are refused even with a valid session.
    let request = Request::post("/v1/admin/cms/articles")
        .header(header::COOKIE, &editor)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(d.draft("csrf").to_string()))
        .unwrap();
    assert_eq!(
        d.app.clone().oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}
