//! Customers & proof (P10-T1..T3) against real PostgreSQL
//! (`TEST_DATABASE_URL`): Trusted By organisations, testimonials and metrics
//! from draft to publication, the permission gates, maker-checker, targeting
//! and what websites receive.

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

    async fn admin(&self, role: &str) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Proof Tester', $3)")
            .bind(id)
            .bind(format!(
                "proof-{role}-{}-{}@figbud.test",
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
        let bytes = axum::body::to_bytes(response.into_body(), 4 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// An image in the corporate media library.
    async fn image(&self) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO media_assets (id, site_id, label, alt_text, content_type, width, height, has_alpha, byte_size, sha256, data)
             SELECT $1, id, 'Logo', 'Example Credit logo', 'image/png', 10, 10, false, 3, $2, '\\x010203'::bytea
               FROM sites WHERE slug = 'figbud'",
        )
        .bind(id)
        .bind(format!("proof-{id}"))
        .execute(&self.pool)
        .await
        .unwrap();
        id
    }

    async fn create(&self, cookie: &str, kind: &str) -> String {
        let (status, body) = self
            .call(
                "POST",
                "/v1/admin/proof",
                Some(cookie),
                Some(json!({ "kind": kind })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        body["id"].as_str().unwrap().to_owned()
    }

    async fn save(&self, id: &str, cookie: &str, document: Value, sites: &[&str]) -> (StatusCode, Value) {
        let (_, detail) = self
            .call("GET", &format!("/v1/admin/proof/{id}"), Some(cookie), None)
            .await;
        self.call(
            "POST",
            &format!("/v1/admin/proof/{id}/draft"),
            Some(cookie),
            Some(json!({ "document": document, "sites": sites, "version": detail["draft_version"] })),
        )
        .await
    }

    async fn act(&self, id: &str, cookie: &str, action: &str, body: Value) -> (StatusCode, Value) {
        self.call(
            "POST",
            &format!("/v1/admin/proof/{id}/{action}"),
            Some(cookie),
            Some(body),
        )
        .await
    }

    async fn public(&self, slug: &str) -> Value {
        let (status, body) = self
            .call("GET", &format!("/v1/sites/{slug}/proof"), None, None)
            .await;
        assert_eq!(status, StatusCode::OK);
        body
    }

    fn names(body: &Value, list: &str, key: &str) -> Vec<String> {
        body[list]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o[key].as_str().unwrap_or_default().to_owned())
            .collect()
    }
}

#[tokio::test]
async fn organisations_publish_only_with_permission_and_only_where_targeted() {
    let Some(t) = T::new().await else { return };
    let editor = t.admin("editor").await;
    let reviewer = t.admin("reviewer").await;
    let other_reviewer = t.admin("reviewer").await;
    let logo = t.image().await;
    let name = format!("Example Credit {}", t.run);
    let id = t.create(&editor, "organization").await;

    // Targets must be real websites; editors can't publish.
    let (status, _) = t
        .save(&id, &editor, json!({ "name": name }), &["no_such_site"])
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let mut doc = json!({ "name": name, "relationship": "customer", "website": "https://example.com", "logo_id": logo,
        "permission": { "relationship_confirmed": true, "display_approved": false, "evidence": "" } });
    let (status, saved) = t.save(&id, &editor, doc.clone(), &["zirahr"]).await;
    assert_eq!(status, StatusCode::OK);
    assert!(!saved["publish_errors"].as_array().unwrap().is_empty());

    // No recorded permission: asking for approval is refused.
    let (status, body) = t.act(&id, &editor, "submit", json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    doc["permission"] = json!({ "relationship_confirmed": true, "display_approved": true,
        "evidence": "Signed consent form, 12 Oct 2026" });
    t.save(&id, &editor, doc.clone(), &["zirahr"]).await;
    let (status, _) = t
        .act(&id, &editor, "submit", json!({ "note": "New customer" }))
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = t.act(&id, &editor, "publish", json!({})).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    // Nothing is public before approval, and the logo isn't served.
    assert!(!T::names(&t.public("zirahr").await, "organizations", "name").contains(&name));
    let (status, _) = t.call("GET", &format!("/v1/media/{logo}"), None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, published) = t.act(&id, &reviewer, "publish", json!({})).await;
    assert_eq!(status, StatusCode::OK, "{published}");
    assert_eq!(published["status"], "published");
    let zirahr = t.public("zirahr").await;
    let org = zirahr["organizations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|o| o["name"] == json!(name))
        .unwrap()
        .clone();
    assert_eq!(org["logo"]["alt"], "Example Credit logo");
    assert!(org.get("permission").is_none(), "evidence never reaches websites");
    assert!(!T::names(&t.public("ziwa").await, "organizations", "name").contains(&name));
    let (status, _) = t.call("GET", &format!("/v1/media/{logo}"), None, None).await;
    assert_eq!(status, StatusCode::OK);

    // A draft change (new website) doesn't reach websites until approved again;
    // reviewers can't approve their own request.
    t.save(&id, &reviewer, doc.clone(), &["zirahr", "ziwa"]).await;
    assert!(!T::names(&t.public("ziwa").await, "organizations", "name").contains(&name));
    t.act(&id, &reviewer, "submit", json!({})).await;
    let (status, _) = t.act(&id, &reviewer, "publish", json!({})).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .act(&id, &other_reviewer, "publish", json!({ "note": "Also on Ziwa" }))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(T::names(&t.public("ziwa").await, "organizations", "name").contains(&name));
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/proof/{id}"), Some(&editor), None)
        .await;
    assert_eq!(detail["versions"].as_array().unwrap().len(), 2);

    // Hidden without unpublishing; unpublished; can't archive while published.
    t.act(&id, &reviewer, "settings", json!({ "active": false }))
        .await;
    assert!(!T::names(&t.public("zirahr").await, "organizations", "name").contains(&name));
    let (status, _) = t.call("GET", &format!("/v1/media/{logo}"), None, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = t.act(&id, &reviewer, "archive", json!({})).await;
    assert_eq!(status, StatusCode::CONFLICT);
    t.act(&id, &reviewer, "unpublish", json!({})).await;
    let (status, archived) = t.act(&id, &reviewer, "archive", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(archived["status"], "archived");
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE target_type = 'proof' AND target_id = $1 ORDER BY created_at",
    )
    .bind(&id)
    .fetch_all(&t.pool)
    .await
    .unwrap();
    for action in [
        "proof.created",
        "proof.submitted",
        "proof.published",
        "proof.settings_changed",
        "proof.unpublished",
        "proof.archived",
    ] {
        assert!(actions.iter().any(|a| a == action), "{action} audited");
    }
}

#[tokio::test]
async fn testimonials_and_metrics_need_their_approvals_and_sources() {
    let Some(t) = T::new().await else { return };
    let editor = t.admin("editor").await;
    let reviewer = t.admin("reviewer").await;

    // A named testimonial needs the person's approval to show the name.
    let quote = format!("Payroll closes in hours now, not days. {}", t.run);
    let id = t.create(&editor, "testimonial").await;
    let mut doc = json!({ "quote": quote, "person_name": "A. Person", "person_title": "Finance lead",
        "product": "zirahr", "country": "ke",
        "permission": { "quote_approved": true, "evidence": "Email, 3 Oct 2026" } });
    let (status, body) = t.save(&id, &editor, doc.clone(), &["figbud", "zirahr"]).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = t.act(&id, &editor, "submit", json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["code"], "name");
    doc["permission"]["name_approved"] = json!(true);
    let (status, saved) = t.save(&id, &editor, doc, &["figbud", "zirahr"]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["publish_errors"], json!([]));
    t.act(&id, &editor, "submit", json!({})).await;
    let (status, _) = t.act(&id, &reviewer, "publish", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let figbud = t.public("figbud").await;
    let shown = figbud["testimonials"]
        .as_array()
        .unwrap()
        .iter()
        .find(|q| q["quote"] == json!(quote))
        .unwrap()
        .clone();
    assert_eq!(shown["person_title"], "Finance lead");
    assert_eq!(shown["country"], "KE");

    // A metric needs a source, a period and verification; currency figures a code.
    let label = format!("Payroll processed {}", t.run);
    let id = t.create(&editor, "metric").await;
    let (status, _) = t
        .save(
            &id,
            &editor,
            json!({ "label": label, "value": 1.5e9, "format": "currency" }),
            &["zirahr"],
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let metric =
        json!({ "label": label, "value": 1.5e9, "format": "currency", "currency": "KES", "compact": true });
    t.save(&id, &editor, metric.clone(), &["zirahr"]).await;
    let (status, _) = t.act(&id, &editor, "submit", json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let mut verified = metric;
    verified["source"] = json!("ZiraHR production payroll ledger");
    verified["period"] = json!("Jan–Sep 2026");
    verified["verified"] = json!(true);
    t.save(&id, &editor, verified, &["zirahr"]).await;
    t.act(&id, &editor, "submit", json!({})).await;
    let (status, _) = t.act(&id, &reviewer, "publish", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let zirahr = t.public("zirahr").await;
    let shown = zirahr["metrics"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["label"] == json!(label))
        .unwrap()
        .clone();
    assert_eq!(shown["currency"], "KES");
    assert_eq!(shown["period"], "Jan–Sep 2026");
    assert!(shown.get("verified").is_none());
}
