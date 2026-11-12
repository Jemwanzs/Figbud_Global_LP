//! Approval authority (P13-B5) against real PostgreSQL (`TEST_DATABASE_URL`),
//! on website status requests: named approvers, two approvals from different
//! people, and reassignment. Rules are shared rows, so this file changes them
//! in one test and removes its rule at the end.

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

/// Puts the shared rows back however the test ends, so a failure here can't
/// change how other tests' approvals and sign-ins behave.
struct Restore(PgPool, &'static str);

impl Drop for Restore {
    fn drop(&mut self) {
        let (pool, sql) = (self.0.clone(), self.1);
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async move {
                let _ = sqlx::query(sql).execute(&pool).await;
            })
        });
    }
}

struct T {
    app: Router,
    pool: PgPool,
    run: String,
}

impl T {
    async fn call(&self, method: &str, uri: &str, cookie: &str, body: Option<Value>) -> (StatusCode, Value) {
        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::ORIGIN, ORIGIN)
            .header(header::COOKIE, cookie);
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

    async fn person(&self, role: &str, name: &str) -> (Uuid, String) {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(format!(
                "rules-{role}-{}-{}@figbud.test",
                self.run,
                &id.simple().to_string()[24..]
            ))
            .bind(name)
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

    async fn item(&self, cookie: &str, slug: &str) -> Value {
        let (status, body) = self.call("GET", "/v1/admin/approvals", cookie, None).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        body["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["kind"] == "site_status" && i["sites"][0]["slug"] == slug)
            .cloned()
            .unwrap_or(Value::Null)
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn named_approvers_two_approvals_and_reassignment() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let t = T {
        app: app_with(pool.clone(), config(&url)),
        pool,
        run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
    };
    sqlx::query("DELETE FROM approval_rules WHERE kind = 'site_status'")
        .execute(&t.pool)
        .await
        .unwrap();
    let _restore = Restore(
        t.pool.clone(),
        "DELETE FROM approval_rules WHERE kind = 'site_status'",
    );
    let (_, owner) = t.person("owner", "Rules Owner").await;
    let (ada, ada_cookie) = t.person("reviewer", "Ada Reviewer").await;
    let (ben, ben_cookie) = t.person("reviewer", "Ben Reviewer").await;
    let (cy, cy_cookie) = t.person("reviewer", "Cy Reviewer").await;
    let (_, editor) = t.person("editor", "Rules Editor").await;

    // The rules: every kind, today's rule by default; reviewers may read them, owners change them.
    let (status, body) = t.call("GET", "/v1/admin/approval-rules", &ada_cookie, None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["kinds"].as_array().unwrap().len(), 9);
    let status_rule = body["kinds"]
        .as_array()
        .unwrap()
        .iter()
        .find(|k| k["kind"] == "site_status")
        .unwrap()
        .clone();
    assert_eq!(
        (status_rule["approvers"].as_str(), status_rule["stages"].as_i64()),
        (Some("reviewer"), Some(1))
    );
    assert!(
        body["approvers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["id"] == json!(ben))
    );
    assert_eq!(
        t.call("GET", "/v1/admin/approval-rules", &editor, None).await.0,
        StatusCode::FORBIDDEN
    );
    let rule = json!({ "approvers": "people", "people": [ada, ben], "stages": 2 });
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/approval-rules/site_status",
            &ada_cookie,
            Some(rule.clone())
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/approval-rules/site_status",
            &owner,
            Some(json!({ "approvers": "people", "people": [], "stages": 1 })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/approval-rules/site_status",
            &owner,
            Some(json!({ "approvers": "reviewer", "people": [], "stages": 3 })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, body) = t
        .call("POST", "/v1/admin/approval-rules/site_status", &owner, Some(rule))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/approval-rules/unknown",
            &owner,
            Some(json!({ "approvers": "owner", "people": [], "stages": 1 }))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );

    // A new website: its launch status waits for approval.
    let slug = format!("rules_{}", t.run);
    let (status, body) = t
        .call(
            "POST",
            "/v1/admin/sites",
            &owner,
            Some(json!({ "name": "Rules Test", "slug": slug, "category": "lending_credit", "launch_status": "coming_soon" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/sites/{slug}"), &owner, None)
        .await;
    let id = detail["status_requests"][0]["id"].as_str().unwrap().to_owned();
    let approve = format!("/v1/admin/sites/{slug}/status-requests/{id}/approve");

    // The queue says whose turn it is under the rule.
    let item = t.item(&ada_cookie, &slug).await;
    assert_eq!(
        (
            item["needed"].as_i64(),
            item["approvals"].as_u64(),
            item["can_decide"].as_bool()
        ),
        (Some(2), Some(0), Some(true))
    );
    assert_eq!(t.item(&cy_cookie, &slug).await["can_decide"], false);
    // Cy isn't one of the chosen approvers.
    let (status, body) = t.call("POST", &approve, &cy_cookie, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    assert!(body.to_string().contains("approvers chosen"), "{body}");

    // Reassignment: only to someone who could approve it.
    let request = item["request"].as_str().unwrap().to_owned();
    let assign = |to: Value| json!({ "kind": "site_status", "request": request, "to": to });
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/approvals/assign",
            &ada_cookie,
            Some(assign(json!(cy)))
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/approvals/assign",
            &editor,
            Some(assign(json!(ben)))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, body) = t
        .call(
            "POST",
            "/v1/admin/approvals/assign",
            &ada_cookie,
            Some(assign(json!(ben))),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["assigned_to"]["name"], "Ben Reviewer");
    assert_eq!(
        t.item(&ada_cookie, &slug).await["assigned_to"]["name"],
        "Ben Reviewer"
    );
    assert_eq!(t.item(&ada_cookie, &slug).await["can_decide"], false);
    let (status, body) = t.call("POST", &approve, &ada_cookie, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    assert!(
        body.to_string().contains("assigned to another approver"),
        "{body}"
    );
    // Back to everyone it may go to.
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/approvals/assign",
            &ben_cookie,
            Some(assign(Value::Null)),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Two approvals, from different people: the first is recorded (202), nothing changes yet.
    let (status, body) = t.call("POST", &approve, &ada_cookie, None).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    assert_eq!(body["error"]["code"], "approval_recorded");
    let (_, detail) = t
        .call("GET", &format!("/v1/admin/sites/{slug}"), &owner, None)
        .await;
    assert_ne!(detail["status"], "coming_soon", "{detail}");
    assert_eq!(detail["status_requests"][0]["id"], json!(id));
    let item = t.item(&ben_cookie, &slug).await;
    assert_eq!(
        (item["approvals"].as_u64(), item["can_decide"].as_bool()),
        (Some(1), Some(true))
    );
    assert_eq!(item["approved_by"], json!(["Ada Reviewer"]));
    assert_eq!(t.item(&ada_cookie, &slug).await["can_decide"], false);
    assert_eq!(
        t.call("POST", &approve, &ada_cookie, None).await.0,
        StatusCode::CONFLICT
    );
    let (status, body) = t.call("POST", &approve, &ben_cookie, None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["status"], "coming_soon");

    // Audited.
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE actor_user_id = ANY($1) AND action IN
            ('admin.approval_rule_changed', 'approval.assigned', 'approval.recorded') ORDER BY created_at",
    )
    .bind(vec![ada, ben, cy])
    .fetch_all(&t.pool)
    .await
    .unwrap();
    assert_eq!(
        actions,
        ["approval.assigned", "approval.assigned", "approval.recorded"]
    );

    sqlx::query("DELETE FROM approval_rules WHERE kind = 'site_status'")
        .execute(&t.pool)
        .await
        .unwrap();
}
