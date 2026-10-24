//! Website and product registry (Admin Studio, Phase B) against real
//! PostgreSQL (`TEST_DATABASE_URL`).

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

struct Studio {
    app: Router,
    pool: PgPool,
    run: String,
}

impl Studio {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
        })
    }

    async fn admin(&self, role: &str) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Studio Tester', $3)")
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

    async fn call(
        &self,
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
        let response = self.app.clone().oneshot(req).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn public(&self) -> Vec<Value> {
        self.call("GET", "/v1/sites", None, None)
            .await
            .1
            .as_array()
            .unwrap()
            .clone()
    }

    fn slug(&self) -> String {
        format!("payflow_{}", self.run)
    }
}

fn find<'a>(sites: &'a [Value], slug: &str) -> Option<&'a Value> {
    sites.iter().find(|s| s["slug"] == slug)
}

#[tokio::test]
async fn seeded_registry_matches_todays_websites() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let sites = s.public().await;
    assert_eq!(find(&sites, "figbud").unwrap()["kind"], "corporate");
    assert_eq!(find(&sites, "zirahr").unwrap()["cta"], "demo");
    assert_eq!(find(&sites, "jasiri").unwrap()["category"], "lending_credit");
    assert_eq!(find(&sites, "expense_now").unwrap()["cta"], "waitlist");
    let ziwa = find(&sites, "ziwa").unwrap();
    assert_eq!(
        (ziwa["category"].as_str(), ziwa["cta"].as_str()),
        (Some("lending_credit"), Some("waitlist"))
    );
    assert_eq!(ziwa["position"], 4, "Ziwa LMS follows Expense Now");
}

#[tokio::test]
async fn create_then_launch_with_maker_checker() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner, reviewer, second_reviewer, editor) = (
        s.admin("owner").await,
        s.admin("reviewer").await,
        s.admin("reviewer").await,
        s.admin("editor").await,
    );
    let new_site = json!({
        "name": format!("PayFlow {}", s.run),
        "slug": s.slug(),
        "category": "finance_payments",
        "tagline": "Payments, approved.",
        "launch_status": "coming_soon",
    });

    let (status, _) = s
        .call("POST", "/v1/admin/sites", Some(&editor), Some(new_site.clone()))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "only owners create websites");
    let (status, created) = s
        .call("POST", "/v1/admin/sites", Some(&owner), Some(new_site.clone()))
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["status"], "draft", "new websites start as drafts");
    assert_eq!(created["template"], "finance", "template follows the category");
    assert_eq!(
        created["pending_to_status"], "coming_soon",
        "the launch status awaits approval"
    );
    assert!(
        find(&s.public().await, &s.slug()).is_none(),
        "drafts are not public"
    );

    let (status, body) = s
        .call("POST", "/v1/admin/sites", Some(&owner), Some(new_site))
        .await;
    assert_eq!(
        (status, body["error"]["fields"][0]["code"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("taken"))
    );

    // A reviewer approves the owner's launch request.
    let (_, detail) = s
        .call(
            "GET",
            &format!("/v1/admin/sites/{}", s.slug()),
            Some(&reviewer),
            None,
        )
        .await;
    let request = detail["status_requests"][0]["id"].as_str().unwrap().to_owned();
    let base = format!("/v1/admin/sites/{}/status-requests", s.slug());
    let (status, site) = s
        .call(
            "POST",
            &format!("{base}/{request}/approve"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(
        (status, site["status"].as_str()),
        (StatusCode::OK, Some("coming_soon"))
    );
    assert_eq!(find(&s.public().await, &s.slug()).unwrap()["cta"], "waitlist");

    // Going active: the requester cannot approve their own request; another reviewer can.
    let (status, _) = s
        .call(
            "POST",
            &base,
            Some(&reviewer),
            Some(json!({ "to_status": "active", "reason": "Ready to launch." })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, _) = s
        .call(
            "POST",
            &base,
            Some(&second_reviewer),
            Some(json!({ "to_status": "beta", "reason": "Second request." })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "one open request at a time");
    let (_, detail) = s
        .call(
            "GET",
            &format!("/v1/admin/sites/{}", s.slug()),
            Some(&reviewer),
            None,
        )
        .await;
    let request = detail["status_requests"][0]["id"].as_str().unwrap().to_owned();
    let (status, body) = s
        .call(
            "POST",
            &format!("{base}/{request}/approve"),
            Some(&reviewer),
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
    let (status, site) = s
        .call(
            "POST",
            &format!("{base}/{request}/approve"),
            Some(&second_reviewer),
            None,
        )
        .await;
    assert_eq!(
        (status, site["status"].as_str()),
        (StatusCode::OK, Some("active"))
    );
    assert_eq!(find(&s.public().await, &s.slug()).unwrap()["cta"], "demo");

    let (status, _) = s
        .call(
            "POST",
            &base,
            Some(&reviewer),
            Some(json!({ "to_status": "draft", "reason": "Back to draft." })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "active sites cannot return to draft"
    );

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT a.action FROM audit_log a JOIN sites s ON s.id = a.site_id WHERE s.slug = $1 ORDER BY a.created_at, a.id",
    )
    .bind(s.slug())
    .fetch_all(&s.pool)
    .await
    .unwrap();
    assert_eq!(
        actions,
        vec![
            "site.created",
            "site.status_approved",
            "site.status_requested",
            "site.status_approved"
        ]
    );
}

#[tokio::test]
async fn settings_conflicts_archive_and_corporate_rules() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner, reviewer) = (s.admin("owner").await, s.admin("reviewer").await);
    let slug = format!("custom_{}", s.run);
    let (_, created) = s
        .call(
            "POST",
            "/v1/admin/sites",
            Some(&owner),
            Some(json!({ "name": "Custom", "slug": slug, "category": "custom_enterprise" })),
        )
        .await;
    let version = created["version"].clone();

    let edit = json!({ "name": "Custom Suite", "category": "custom_enterprise", "primary_domain": "https://bad", "version": version });
    let (status, body) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}"),
            Some(&owner),
            Some(edit),
        )
        .await;
    assert_eq!(
        (status, body["error"]["fields"][0]["field"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("primary_domain"))
    );

    let edit = json!({ "name": "Custom Suite", "category": "custom_enterprise", "primary_domain": format!("{}.example.com", s.run), "version": version });
    let (status, saved) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}"),
            Some(&owner),
            Some(edit.clone()),
        )
        .await;
    assert_eq!(
        (status, saved["name"].as_str()),
        (StatusCode::OK, Some("Custom Suite"))
    );
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}"),
            Some(&owner),
            Some(edit),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "a stale version is refused");
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}"),
            Some(&reviewer),
            Some(json!({ "name": "x", "category": "custom_enterprise", "version": saved["version"] })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "only owners edit website settings");

    let (status, archived) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}/archive"),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(archived["archived_at"].is_string());
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}/status-requests"),
            Some(&reviewer),
            Some(json!({ "to_status": "coming_soon", "reason": "x" })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "archived websites must be restored first"
    );
    let (status, restored) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}/restore"),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(
        (status, restored["archived_at"].is_null()),
        (StatusCode::OK, true)
    );

    let (status, _) = s
        .call("POST", "/v1/admin/sites/figbud/archive", Some(&owner), None)
        .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "the corporate website cannot be archived"
    );
    let (status, _) = s
        .call(
            "POST",
            "/v1/admin/sites/figbud/status-requests",
            Some(&owner),
            Some(json!({ "to_status": "retired", "reason": "x" })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "the corporate website is always active"
    );
}
