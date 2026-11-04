//! The Payroll Calculator end to end: drafts, the verification gate, approval,
//! the public switch, rollback and what visitors can reach (`TEST_DATABASE_URL`).

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use figbud_api::admin::{self, Role};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const ORIGIN: &str = "http://localhost:3000";
const BASE: &str = "/v1/admin/sites/zirahr/payroll-calculator";
const PUBLIC: &str = "/v1/sites/zirahr/payroll-calculator";

struct T {
    app: Router,
    pool: PgPool,
}

impl T {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        // Each test starts from nothing published.
        sqlx::query(
            "DELETE FROM site_payroll_calculators WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
        )
        .execute(&pool)
        .await
        .ok();
        sqlx::query(
            "DELETE FROM payroll_calculator_versions WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr')",
        )
        .execute(&pool)
        .await
        .ok();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
        })
    }

    async fn user(&self, role: Role) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Test', $3)")
            .bind(id)
            .bind(format!("{}-{id}@figbud.test", role.as_str()))
            .bind(role.as_str())
            .execute(&self.pool)
            .await
            .unwrap();
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session(&self.pool, &admin_config, id, "test", None)
            .await
            .unwrap();
        format!("figbud_admin={token}")
    }

    async fn send(&self, uri: &str, cookie: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
        let method = if body.is_some() { "POST" } else { "GET" };
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

    async fn post(&self, path: &str, cookie: &str, body: Value) -> (StatusCode, Value) {
        self.send(&format!("{BASE}/{path}"), Some(cookie), Some(body))
            .await
    }

    async fn save(&self, editor: &str, change: impl FnOnce(&mut Value)) -> (StatusCode, Value) {
        let (_, state) = self.send(BASE, Some(editor), None).await;
        let mut draft = state["draft"].clone();
        change(&mut draft);
        self.post(
            "draft",
            editor,
            json!({ "config": draft, "version": state["draft_version"] }),
        )
        .await
    }

    /// Checked, approved by someone else and published.
    async fn publish(&self, editor: &str, reviewer: &str, change: impl FnOnce(&mut Value)) {
        let (status, body) = self
            .save(editor, |d| {
                change(d);
                for set in d["rule_sets"].as_array_mut().unwrap() {
                    set["verified_on"] = json!("2026-11-05");
                }
            })
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let (status, body) = self.post("submit", editor, json!({})).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let (status, body) = self.post("publish", reviewer, json!({})).await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
}

/// Amounts are decimal strings; their scale doesn't matter.
fn amount(value: &Value) -> f64 {
    value.as_str().unwrap().parse().unwrap()
}

fn gross(amount: &str) -> Value {
    json!({ "mode": "gross_to_net", "amount": amount, "pay_month": "2026-11-01" })
}

/// One website's single calculator: these share it, so they run in order.
#[tokio::test]
async fn the_payroll_calculator() {
    let Some(t) = T::new().await else { return };
    nothing_is_public_until_verified_approved_published_and_switched_on(&t).await;
    let Some(t) = T::new().await else { return };
    drafts_never_reach_visitors_and_rules_change_by_date_with_rollback(&t).await;
}

async fn nothing_is_public_until_verified_approved_published_and_switched_on(t: &T) {
    let editor = t.user(Role::Editor).await;
    let reviewer = t.user(Role::Reviewer).await;
    let viewer = t.user(Role::Viewer).await;
    let calc = format!("{PUBLIC}/calculate");

    // Off and unreachable to start with.
    let (_, body) = t.send(PUBLIC, None, None).await;
    assert_eq!(body, json!({ "calculator": null }));
    let (status, _) = t.send(&calc, None, Some(gross("100000"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // The draft can be tried in the Studio, by anyone with access.
    let (status, body) = t
        .post(
            "calculate",
            &viewer,
            json!({ "source": "draft", "input": gross("150000") }),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(amount(&body["result"]["breakdown"]["net"]), 103618.15);
    assert_eq!(amount(&body["result"]["breakdown"]["nssf"]), 6480.0);
    assert_eq!(body["result"]["rules"]["effective_from"], "2026-02-01");
    let (status, _) = t
        .post(
            "calculate",
            &viewer,
            json!({ "source": "published", "input": gross("150000") }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "nothing to mix it with");

    // Viewers can't edit; nobody can publish rules that weren't checked.
    let (status, _) = t.save(&viewer, |_| {}).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = t.post("submit", &editor, json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(body.to_string().contains("official sources"));
    let (status, _) = t.post("publish", &reviewer, json!({})).await;
    assert_eq!(status, StatusCode::CONFLICT, "no approval was asked for");
    let (status, _) = t.post("visibility", &reviewer, json!({ "public": true })).await;
    assert_eq!(status, StatusCode::CONFLICT, "nothing is published");

    // Broken rules never save.
    let (status, _) = t
        .save(&editor, |d| d["rule_sets"][0]["nssf"]["rate"] = json!("600"))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    // Approval by someone else.
    let (status, _) = t
        .save(&editor, |d| {
            for set in d["rule_sets"].as_array_mut().unwrap() {
                set["verified_on"] = json!("2026-11-05");
            }
        })
        .await;
    assert_eq!(status, StatusCode::OK);
    t.post("submit", &editor, json!({})).await;
    let (status, _) = t.post("publish", &editor, json!({})).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = t.post("publish", &reviewer, json!({})).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Published but still off: the switch is separate.
    let (_, body) = t.send(PUBLIC, None, None).await;
    assert_eq!(body, json!({ "calculator": null }));
    let (status, _) = t.post("visibility", &editor, json!({ "public": true })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t.post("visibility", &reviewer, json!({ "public": true })).await;
    assert_eq!(status, StatusCode::OK);

    // Now visitors can use it: both directions, reconciled.
    let (_, body) = t.send(PUBLIC, None, None).await;
    assert_eq!(body["calculator"]["version"], 1);
    assert!(
        body["calculator"]["disclaimer"]
            .as_str()
            .unwrap()
            .starts_with("Estimate only")
    );
    let (status, forward) = t.send(&calc, None, Some(gross("150000"))).await;
    assert_eq!(status, StatusCode::OK, "{forward}");
    let net = forward["result"]["breakdown"]["net"].as_str().unwrap();
    let (status, back) = t
        .send(
            &calc,
            None,
            Some(json!({ "mode": "net_to_gross", "amount": net, "pay_month": "2026-11-01" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{back}");
    let difference: f64 = back["result"]["difference"].as_str().unwrap().parse().unwrap();
    assert!(difference.abs() <= 0.05);

    // Errors are explained, not silently zero.
    let (status, body) = t
        .send(
            &calc,
            None,
            Some(json!({ "mode": "gross_to_net", "amount": "-5" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["field"], "amount");
    let (status, body) = t
        .send(
            &calc,
            None,
            Some(json!({ "mode": "gross_to_net", "amount": "1000", "pay_month": "2020-01-01" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["field"], "pay_month");

    // Other websites don't have it.
    let (_, body) = t.send("/v1/sites/jasiri/payroll-calculator", None, None).await;
    assert_eq!(body, json!({ "calculator": null }));
    let (status, _) = t
        .send("/v1/admin/sites/jasiri/payroll-calculator", Some(&reviewer), None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

async fn drafts_never_reach_visitors_and_rules_change_by_date_with_rollback(t: &T) {
    let editor = t.user(Role::Editor).await;
    let reviewer = t.user(Role::Reviewer).await;
    let calc = format!("{PUBLIC}/calculate");
    t.publish(&editor, &reviewer, |_| {}).await;
    t.post("visibility", &reviewer, json!({ "public": true })).await;

    // A draft change is visible in the Studio only.
    let (status, _) = t
        .save(&editor, |d| d["rule_sets"][0]["shif"]["rate"] = json!("10"))
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, draft) = t
        .post(
            "calculate",
            &editor,
            json!({ "source": "draft", "input": gross("100000") }),
        )
        .await;
    assert_eq!(amount(&draft["result"]["breakdown"]["shif"]), 10000.0);
    let (_, public) = t.send(&calc, None, Some(gross("100000"))).await;
    assert_eq!(amount(&public["result"]["breakdown"]["shif"]), 2750.0);
    let (_, published) = t
        .post(
            "calculate",
            &editor,
            json!({ "source": "published", "input": gross("100000") }),
        )
        .await;
    assert_eq!(amount(&published["result"]["breakdown"]["shif"]), 2750.0);

    // The pay month chooses the period.
    let (_, january) = t
        .send(
            &calc,
            None,
            Some(json!({ "mode": "gross_to_net", "amount": "150000", "pay_month": "2026-01-15" })),
        )
        .await;
    assert_eq!(amount(&january["result"]["breakdown"]["nssf"]), 4320.0);
    assert_eq!(january["result"]["rules"]["effective_from"], "2025-02-01");

    // A later version, then back in one step, recorded as a new version.
    t.publish(&editor, &reviewer, |d| {
        d["rule_sets"][0]["shif"]["rate"] = json!("3")
    })
    .await;
    let (_, public) = t.send(&calc, None, Some(gross("100000"))).await;
    assert_eq!(amount(&public["result"]["breakdown"]["shif"]), 3000.0);
    let (status, _) = t.post("rollback", &editor, json!({ "version": 1 })).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, body) = t.post("rollback", &reviewer, json!({ "version": 1 })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (_, public) = t.send(&calc, None, Some(gross("100000"))).await;
    assert_eq!(amount(&public["result"]["breakdown"]["shif"]), 2750.0);
    let (_, state) = t.send(BASE, Some(&editor), None).await;
    assert_eq!(state["published_number"], 3);
    assert_eq!(state["versions"].as_array().unwrap().len(), 3);

    // Stale saves are refused rather than overwriting.
    let (status, _) = t
        .post(
            "draft",
            &editor,
            json!({ "config": state["draft"], "version": state["draft_version"].as_i64().unwrap() - 1 }),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Switching off takes effect at once, and it's all in the audit log.
    t.post("visibility", &reviewer, json!({ "public": false })).await;
    let (status, _) = t.send(&calc, None, Some(gross("100000"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let actions: Vec<String> =
        sqlx::query_scalar("SELECT action FROM audit_log WHERE action LIKE 'payroll_calculator.%'")
            .fetch_all(&t.pool)
            .await
            .unwrap();
    for action in [
        "draft_saved",
        "submitted",
        "published",
        "rolled_back",
        "visibility",
    ] {
        assert!(
            actions
                .iter()
                .any(|a| a == &format!("payroll_calculator.{action}")),
            "{action}"
        );
    }
}
