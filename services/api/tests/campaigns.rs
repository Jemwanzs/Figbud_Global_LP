//! Campaigns & promotions (P8-M1) against real PostgreSQL
//! (`TEST_DATABASE_URL`): the campaign lifecycle, what websites receive,
//! analytics, and interactive rewards decided by the API under concurrency.

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use chrono::{Duration, Utc};
use common::{app_with, config, database};
use figbud_api::admin;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const ORIGIN: &str = "http://localhost:3000";

struct T {
    app: Router,
    pool: PgPool,
    run: String,
}

impl T {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
            run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
        })
    }

    async fn admin(&self, role: &str) -> (Uuid, String) {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Campaign Tester', $3)")
            .bind(id)
            .bind(format!(
                "campaign-{role}-{}-{}@figbud.test",
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
        (id, format!("figbud_admin={token}"))
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
        let bytes = axum::body::to_bytes(response.into_body(), 4 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// A fresh, listed (coming soon) product website.
    async fn site(&self, owner: &str) -> String {
        let slug = format!("camp_{}", self.run);
        let (status, _) = self
            .call(
                "POST",
                "/v1/admin/sites",
                Some(owner),
                Some(json!({ "name": "Campaign Site", "slug": slug, "category": "finance_payments", "launch_status": "coming_soon" })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
        let (_, detail) = self
            .call("GET", &format!("/v1/admin/sites/{slug}"), Some(owner), None)
            .await;
        let request = detail["status_requests"][0]["id"].as_str().unwrap().to_owned();
        let (status, _) = self
            .call(
                "POST",
                &format!("/v1/admin/sites/{slug}/status-requests/{request}/approve"),
                Some(owner),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK);
        slug
    }

    async fn live(&self, slug: &str) -> Vec<Value> {
        let (status, body) = self
            .call("GET", &format!("/v1/sites/{slug}/campaigns"), None, None)
            .await;
        assert_eq!(status, StatusCode::OK);
        body["campaigns"].as_array().unwrap().clone()
    }

    /// Saves `document` as the draft (fetching the current version first).
    async fn save(&self, id: &str, cookie: &str, document: Value) -> (StatusCode, Value) {
        let (_, detail) = self
            .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(cookie), None)
            .await;
        self.call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/draft"),
            Some(cookie),
            Some(
                json!({ "name": detail["name"], "objective": "Demos", "document": document,
                         "version": detail["draft_version"] }),
            ),
        )
        .await
    }

    /// Submits the draft and approves it as `approver`.
    async fn publish(&self, id: &str, editor: &str, approver: &str) -> StatusCode {
        let (status, submitted) = self
            .call(
                "POST",
                &format!("/v1/admin/campaigns/{id}/submit"),
                Some(editor),
                Some(json!({ "note": "Ready" })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{submitted}");
        let revision = submitted["id"].as_str().unwrap();
        self.call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/revisions/{revision}/approve"),
            Some(approver),
            Some(json!({})),
        )
        .await
        .0
    }
}

#[tokio::test]
async fn campaign_lifecycle_and_what_websites_receive() {
    let Some(t) = T::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (_, owner) = t.admin("owner").await;
    let (_, editor) = t.admin("editor").await;
    let (_, reviewer) = t.admin("reviewer").await;
    let (_, viewer) = t.admin("viewer").await;
    let slug = t.site(&owner).await;

    // Create: editors and above, for a website they can edit.
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&viewer),
            Some(json!({ "site": slug, "name": "Launch", "kind": "hero" })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, created) = t
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&editor),
            Some(json!({ "site": slug, "name": "Launch week", "kind": "hero" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["status"], "draft");
    assert_eq!(detail["kind"], "hero");
    let mut document = detail["draft"].clone();

    // Drafts are validated: unsafe links are refused, stale versions conflict.
    document["content"]["primary"] =
        json!({ "label": "Go", "action": "link", "href": "javascript:alert(1)" });
    let (status, _) = t.save(&id, &editor, document.clone()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    document["content"]["primary"] = json!({ "label": "Request a demo", "action": "demo" });
    document["content"]["headline"] = json!("Meet the new release");
    document["content"]["body"] = json!("Faster **approvals**. <script>alert(1)</script>");
    document["schedule"]["starts_at"] = json!(Utc::now() - Duration::hours(1));
    document["schedule"]["ends_at"] = json!(Utc::now() + Duration::days(2));
    let (status, saved) = t.save(&id, &editor, document.clone()).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/draft"),
            Some(&editor),
            Some(json!({ "name": "Launch week", "document": document, "version": 1 })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale version");

    // Nothing reaches the website until a different reviewer approves.
    assert!(t.live(&slug).await.is_empty());
    assert_eq!(t.publish(&id, &editor, &editor).await, StatusCode::FORBIDDEN);
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&reviewer), None)
        .await;
    let pending = detail["revisions"][0]["id"].as_str().unwrap().to_owned();
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/revisions/{pending}/approve"),
            Some(&reviewer),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let live = t.live(&slug).await;
    assert_eq!(live.len(), 1);
    assert_eq!(live[0]["content"]["headline"], "Meet the new release");
    let body = live[0]["content"]["body_html"].as_str().unwrap();
    assert!(
        body.contains("<strong>approvals</strong>") && !body.contains("<script"),
        "{body}"
    );
    assert!(
        live[0]["schedule"]["ends_at"].is_string(),
        "websites know when it ends"
    );
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["status"], "live");

    // Events are daily counts, with nothing about the visitor.
    for kind in ["impression", "impression", "click"] {
        let (status, _) = t
            .call(
                "POST",
                &format!("/v1/campaigns/{id}/events"),
                None,
                Some(json!({ "kind": kind })),
            )
            .await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/campaigns/{id}/events"),
            None,
            Some(json!({ "kind": "purchase" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["stats"]["impressions"], 2);
    assert_eq!(detail["stats"]["clicks"], 1);

    // Pause and resume take effect at once; viewers can't.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/pause"),
            Some(&viewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/pause"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(t.live(&slug).await.is_empty());
    t.call(
        "POST",
        &format!("/v1/admin/campaigns/{id}/resume"),
        Some(&reviewer),
        None,
    )
    .await;
    assert_eq!(t.live(&slug).await.len(), 1);

    // An ended campaign stops showing and reads as completed.
    document["schedule"]["starts_at"] = json!(Utc::now() - Duration::days(3));
    document["schedule"]["ends_at"] = json!(Utc::now() - Duration::minutes(1));
    t.save(&id, &editor, document.clone()).await;
    assert_eq!(t.publish(&id, &editor, &reviewer).await, StatusCode::OK);
    assert!(t.live(&slug).await.is_empty());
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["status"], "completed");
    assert_eq!(
        detail["revisions"].as_array().unwrap().len(),
        2,
        "version history"
    );

    // Duplicate starts a new draft; archive withdraws the campaign.
    let (status, copy) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/duplicate"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, copied) = t
        .call(
            "GET",
            &format!("/v1/admin/campaigns/{}", copy["id"].as_str().unwrap()),
            Some(&viewer),
            None,
        )
        .await;
    assert_eq!(copied["status"], "draft");
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/archive"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, list) = t
        .call(
            "GET",
            &format!("/v1/admin/campaigns?site={slug}"),
            Some(&viewer),
            None,
        )
        .await;
    let archived = list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id.as_str())
        .unwrap()
        .clone();
    assert_eq!(archived["status"], "archived");

    // People limited to other websites never see it.
    let (limited_id, limited) = t.admin("editor").await;
    sqlx::query("UPDATE admin_users SET all_sites = false WHERE id = $1")
        .bind(limited_id)
        .execute(&t.pool)
        .await
        .unwrap();
    let (status, _) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&limited), None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn rewards_are_decided_by_the_api_within_limits() {
    let Some(t) = T::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (_, owner) = t.admin("owner").await;
    let (_, editor) = t.admin("editor").await;
    let (_, reviewer) = t.admin("reviewer").await;
    let slug = t.site(&owner).await;
    let (_, created) = t
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&editor),
            Some(json!({ "site": slug, "name": "Spin", "kind": "rewards" })),
        )
        .await;
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&editor), None)
        .await;
    let mut document = detail["draft"].clone();
    document["rewards"]["rewards"] = json!([
        { "id": "trial", "label": "One extra trial month", "kind": "trial_extension", "quantity": 1, "weight": 500,
          "instructions": "Quote the code when you start your trial." },
        { "id": "training", "label": "Free training session", "kind": "training", "quantity": 2, "weight": 500,
          "instructions": "Book with the code." }
    ]);
    document["schedule"]["starts_at"] = json!(Utc::now() - Duration::hours(1));
    document["schedule"]["ends_at"] = json!(Utc::now() + Duration::days(7));
    let (status, saved) = t.save(&id, &editor, document.clone()).await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    // Chance-based rewards need terms and a recorded legal review…
    let (status, body) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/submit"),
            Some(&editor),
            Some(json!({ "note": "Ready" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    document["content"]["terms"] = json!("Free to enter. One attempt per email. No purchase necessary.");
    document["rewards"]["legal_review"] =
        json!("Reviewed for Kenya by counsel on 30 Oct 2026; free entry only.");
    t.save(&id, &editor, document.clone()).await;
    // …and an owner's approval.
    assert_eq!(t.publish(&id, &editor, &reviewer).await, StatusCode::FORBIDDEN);
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&owner), None)
        .await;
    let pending = detail["revisions"][0]["id"].as_str().unwrap().to_owned();
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/revisions/{pending}/approve"),
            Some(&owner),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Websites see the rewards and their odds, never the stock.
    let live = t.live(&slug).await;
    let rewards = &live[0]["rewards"]["rewards"];
    assert_eq!(rewards[0]["odds"], 50.0);
    assert!(rewards[0].get("quantity").is_none() && rewards[0].get("weight").is_none());

    let spin = |email: String, accepted: bool| {
        let t = &t;
        let id = id.clone();
        async move {
            t.call(
                "POST",
                &format!("/v1/campaigns/{id}/spin"),
                None,
                Some(json!({ "email": email, "accepted": accepted })),
            )
            .await
        }
    };
    assert_eq!(
        spin("not-an-email".into(), true).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        spin(format!("a-{}@example.com", t.run), false).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let (status, won) = spin(format!("a-{}@example.com", t.run), true).await;
    assert_eq!(status, StatusCode::OK, "{won}");
    assert!(won["code"].as_str().unwrap().starts_with("FB-"));
    assert!(won["reward"]["instructions"].is_string());
    let (status, _) = spin(format!("A-{}@Example.com", t.run), true).await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "one attempt per email, whatever the case"
    );

    // Five people at once for the two rewards left: exactly two win.
    let email = |i: u8| format!("p{i}-{}@example.com", t.run);
    let (r0, r1, r2, r3, r4) = tokio::join!(
        spin(email(0), true),
        spin(email(1), true),
        spin(email(2), true),
        spin(email(3), true),
        spin(email(4), true)
    );
    let results = [r0, r1, r2, r3, r4];
    let wins = results.iter().filter(|(s, _)| *s == StatusCode::OK).count();
    assert_eq!(wins, 2, "{results:?}");
    assert!(
        results
            .iter()
            .all(|(s, _)| *s == StatusCode::OK || *s == StatusCode::CONFLICT)
    );
    let (awarded, quantity): (i64, i64) = sqlx::query_as(
        "SELECT sum(awarded)::bigint, sum(quantity)::bigint FROM campaign_rewards WHERE campaign_id = $1::uuid",
    )
    .bind(&id)
    .fetch_one(&t.pool)
    .await
    .unwrap();
    assert_eq!((awarded, quantity), (3, 3));
    let live = t.live(&slug).await;
    assert!(
        live[0]["rewards"]["rewards"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["available"] == false)
    );
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&owner), None)
        .await;
    assert_eq!(detail["stats"]["entries"], 3);
}
