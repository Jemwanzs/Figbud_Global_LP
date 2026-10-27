//! Pages built from typed blocks (Admin Studio, Phase C) against real
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
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Page Tester', $3)")
            .bind(id)
            .bind(format!(
                "pages-{role}-{}-{}@figbud.test",
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

    /// A fresh, listed (coming soon) product website.
    async fn listed_site(&self, owner: &str) -> String {
        let slug = format!("pages_{}", self.run);
        let (status, _) = self
            .call(
                "POST",
                "/v1/admin/sites",
                Some(owner),
                Some(json!({ "name": "Page Site", "slug": slug, "category": "lending_credit", "launch_status": "coming_soon" })),
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
}

#[tokio::test]
async fn build_publish_restore_and_archive_a_page() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner, editor, reviewer, viewer) = (
        s.admin("owner").await,
        s.admin("editor").await,
        s.admin("reviewer").await,
        s.admin("viewer").await,
    );
    let slug = s.listed_site(&owner).await;
    let pages = format!("/v1/admin/sites/{slug}/pages");

    // Create from a template.
    let (status, _) = s
        .call(
            "POST",
            &pages,
            Some(&viewer),
            Some(json!({ "title": "Home", "path": "", "template": "home" })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, created) = s
        .call(
            "POST",
            &pages,
            Some(&editor),
            Some(json!({ "title": "Home", "path": "", "template": "home" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    let (status, body) = s
        .call(
            "POST",
            &pages,
            Some(&editor),
            Some(json!({ "title": "Home again", "path": "/", "template": "blank" })),
        )
        .await;
    assert_eq!(
        (status, body["error"]["fields"][0]["code"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("taken"))
    );
    let (status, body) = s
        .call(
            "POST",
            &pages,
            Some(&editor),
            Some(json!({ "title": "Bad", "path": "Not Valid!", "template": "blank" })),
        )
        .await;
    assert_eq!(
        (status, body["error"]["fields"][0]["field"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("path"))
    );

    let (_, detail) = s
        .call("GET", &format!("/v1/admin/pages/{id}"), Some(&viewer), None)
        .await;
    assert_eq!(detail["page"]["draft"]["sections"][0]["type"], "hero");
    assert_eq!(
        detail["page"]["draft"]["sections"][0]["heading"], "Replace with a one-line promise.",
        "templates mark their placeholder text"
    );
    let version = detail["page"]["draft_version"].clone();

    // Draft saves: validated, version-checked, never public.
    let document = json!({ "seo_title": "Page Site", "sections": [
        { "id": "hero", "type": "hero", "heading": "Every loan. A smoother journey.",
          "primary": { "label": "Request a demo", "href": "/contact" } },
        { "id": "text", "type": "text", "body": "From **application** to repayment." }
    ]});
    let save = |document: Value, version: Value| json!({ "title": "Home", "path": "", "document": document, "version": version });
    let bad = json!({ "sections": [{ "id": "x", "type": "call_to_action", "heading": "Go", "cta": { "label": "Go", "href": "javascript:alert(1)" } }] });
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/draft"),
            Some(&editor),
            Some(save(bad, version.clone())),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "unsafe links are refused"
    );
    let (status, saved) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/draft"),
            Some(&editor),
            Some(save(document.clone(), version.clone())),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert!(
        saved["preview"]["sections"][1]["body_html"]
            .as_str()
            .unwrap()
            .contains("<strong>application</strong>")
    );
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/draft"),
            Some(&editor),
            Some(save(document.clone(), version)),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "stale drafts are refused");
    let (status, _) = s
        .call("GET", &format!("/v1/sites/{slug}/page?path="), None, None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "nothing is public before approval");

    // Submit; the editor can't approve, a reviewer can.
    let (status, created) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/submit"),
            Some(&editor),
            Some(json!({ "note": "First version" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let revision = created["id"].as_str().unwrap().to_owned();
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/submit"),
            Some(&editor),
            Some(json!({ "note": "Again" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "one pending change at a time");
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/revisions/{revision}/approve"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/revisions/{revision}/approve"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, public) = s
        .call("GET", &format!("/v1/sites/{slug}/page?path="), None, None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(public["title"], "Home");
    assert_eq!(
        public["sections"][0]["heading"],
        "Every loan. A smoother journey."
    );
    let (_, list) = s
        .call("GET", &format!("/v1/sites/{slug}/pages"), None, None)
        .await;
    assert_eq!(list[0]["path"], "");

    // Change the draft: the public page stays as approved.
    let (_, detail) = s
        .call("GET", &format!("/v1/admin/pages/{id}"), Some(&owner), None)
        .await;
    let mut changed = document.clone();
    changed["sections"][0]["heading"] = json!("A second headline");
    s.call(
        "POST",
        &format!("/v1/admin/pages/{id}/draft"),
        Some(&owner),
        Some(save(changed, detail["page"]["draft_version"].clone())),
    )
    .await;
    let (_, public) = s.call("GET", &format!("/v1/sites/{slug}/page"), None, None).await;
    assert_eq!(
        public["sections"][0]["heading"], "Every loan. A smoother journey.",
        "drafts never go live"
    );
    let (_, created) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/submit"),
            Some(&owner),
            Some(json!({ "note": "New headline" })),
        )
        .await;
    let second = created["id"].as_str().unwrap().to_owned();
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/revisions/{second}/approve"),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "owners may approve their own change (audited)"
    );
    let (_, public) = s.call("GET", &format!("/v1/sites/{slug}/page"), None, None).await;
    assert_eq!(public["sections"][0]["heading"], "A second headline");

    // Roll back: version 1 into the draft, then republish.
    let (status, restored) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/revisions/{revision}/restore"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!((status, restored["restored"].as_i64()), (StatusCode::OK, Some(1)));
    let (_, detail) = s
        .call("GET", &format!("/v1/admin/pages/{id}"), Some(&owner), None)
        .await;
    assert_eq!(
        detail["page"]["draft"]["sections"][0]["heading"],
        "Every loan. A smoother journey."
    );
    assert_eq!(detail["draft_differs"], true);

    // Duplicate, reorder, archive.
    let (status, copy) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/duplicate"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let copy_id = copy["id"].as_str().unwrap().to_owned();
    let (_, listed) = s.call("GET", &pages, Some(&viewer), None).await;
    let copy_row = listed["pages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == copy_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(
        (copy_row["path"].as_str(), copy_row["published"].as_bool()),
        (Some("home-copy"), Some(false))
    );
    let (status, _) = s
        .call(
            "POST",
            &format!("{pages}/order"),
            Some(&editor),
            Some(json!({ "ids": [copy_id, id] })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = s
        .call(
            "POST",
            &format!("{pages}/order"),
            Some(&editor),
            Some(json!({ "ids": [id] })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "the order must name every page");

    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/archive"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "archiving needs a reviewer");
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/archive"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = s.call("GET", &format!("/v1/sites/{slug}/page"), None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "archived pages leave the website");

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT a.action FROM audit_log a JOIN sites s ON s.id = a.site_id WHERE s.slug = $1 AND a.action LIKE 'page.%'",
    )
    .bind(&slug)
    .fetch_all(&s.pool)
    .await
    .unwrap();
    for expected in [
        "page.created",
        "page.draft_saved",
        "page.submitted",
        "page.published",
        "page.version_restored",
        "page.duplicated",
        "page.reordered",
        "page.archived",
    ] {
        assert!(actions.iter().any(|a| a == expected), "{expected} in {actions:?}");
    }

    // The owner's activity feed names the website each action concerns.
    let (status, log) = s.call("GET", "/v1/admin/audit", Some(&owner), None).await;
    assert_eq!(status, StatusCode::OK);
    let archived = log
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["action"] == "page.archived" && e["detail"]["page"] == id.as_str())
        .expect("page.archived in the feed");
    assert_eq!(archived["site_name"], "Page Site");
}

#[tokio::test]
async fn pages_of_unlisted_websites_are_never_public() {
    let Some(s) = Studio::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let owner = s.admin("owner").await;
    let slug = format!("hidden_{}", s.run);
    s.call(
        "POST",
        "/v1/admin/sites",
        Some(&owner),
        Some(json!({ "name": "Hidden", "slug": slug, "category": "custom_enterprise" })),
    )
    .await;
    let (_, created) = s
        .call(
            "POST",
            &format!("/v1/admin/sites/{slug}/pages"),
            Some(&owner),
            Some(json!({ "title": "Home", "template": "contact" })),
        )
        .await;
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, sub) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/submit"),
            Some(&owner),
            Some(json!({ "note": "Go" })),
        )
        .await;
    let revision = sub["id"].as_str().unwrap().to_owned();
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/pages/{id}/revisions/{revision}/approve"),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = s.call("GET", &format!("/v1/sites/{slug}/page"), None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "the website is still a draft");
}
