//! Pricing Studio (P11) against real PostgreSQL (`TEST_DATABASE_URL`): the
//! price book lifecycle, public visibility (off by default), public prices,
//! quotation snapshots, approval rules and customer links.

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
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Pricing Tester', $3)")
            .bind(id)
            .bind(format!(
                "pricing-{role}-{}-{}@figbud.test",
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
        self.call_with(method, uri, cookie, body, None).await
    }

    async fn call_with(
        &self,
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
        quote_token: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::ORIGIN, ORIGIN);
        if let Some(cookie) = cookie {
            req = req.header(header::COOKIE, cookie);
        }
        if let Some(token) = quote_token {
            req = req.header("x-quote-token", token);
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
        let slug = format!("price_{}", self.run);
        let (status, _) = self
            .call(
                "POST",
                "/v1/admin/sites",
                Some(owner),
                Some(json!({ "name": "Pricing Site", "slug": slug, "category": "hr_workforce", "launch_status": "coming_soon" })),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED);
        let (_, detail) = self
            .call("GET", &format!("/v1/admin/sites/{slug}"), Some(owner), None)
            .await;
        let request = detail["status_requests"][0]["id"].as_str().unwrap().to_owned();
        self.call(
            "POST",
            &format!("/v1/admin/sites/{slug}/status-requests/{request}/approve"),
            Some(owner),
            None,
        )
        .await;
        slug
    }
}

fn item(id: &str, method: &str, billing: &str, rate: Option<&str>, public: bool) -> Value {
    json!({ "id": id, "name": id.replace('_', " "), "category": if billing == "one_off" { "implementation" } else { "core" },
        "method": method, "unit_label": "employees", "billing": billing, "rate": rate, "public": public })
}

fn book(core_rate: &str) -> Value {
    let cycles: Vec<Value> = ["monthly", "quarterly", "semi_annual", "annual"]
        .iter()
        .map(|k| json!({ "key": k, "enabled": true, "discount": if *k == "annual" { json!({ "kind": "percent", "value": "10" }) } else { json!({ "kind": "none", "value": "0" }) } }))
        .collect();
    json!({
        "currency": "KES",
        "tax": { "name": "VAT", "rate": "16", "presentation": "exclusive" },
        "cycles": cycles,
        "items": [
            item("core_hr", "per_employee", "monthly", Some(core_rate), true),
            item("payroll", "per_payroll_employee", "monthly", Some("150"), false),
            item("setup", "flat", "one_off", Some("80000"), false),
            item("custom_work", "custom_quote", "one_off", None, false),
        ],
        "terms": "Prices exclude VAT unless stated.",
        "quote_validity_days": 30,
    })
}

fn calc_input() -> Value {
    json!({ "employees": 250, "cycle": "monthly", "lines": [{ "item_id": "core_hr" }, { "item_id": "payroll" }, { "item_id": "setup" }] })
}

#[tokio::test]
async fn price_books_publish_with_approval_and_stay_off_the_website_until_shown() {
    let Some(t) = T::new().await else { return };
    let owner = t.admin("owner").await;
    let editor = t.admin("editor").await;
    let reviewer = t.admin("reviewer").await;
    let other = t.admin("reviewer").await;
    let slug = t.site(&owner).await;
    let base = format!("/v1/admin/sites/{slug}/pricing");

    // Before anything is saved: an empty catalogue in KES, nothing public.
    let (status, start) = t.call("GET", &base, Some(&editor), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(start["draft"]["currency"], "KES");
    assert_eq!(start["draft_version"], 0);
    assert_eq!(start["public_visible"], false);
    let (_, public) = t
        .call("GET", &format!("/v1/sites/{slug}/pricing"), None, None)
        .await;
    assert_eq!(public, json!({ "visible": false }));

    // Invalid books are refused; a valid one is saved as a draft.
    let mut bad = book("100");
    bad["cycles"][0]["discount"] = json!({ "kind": "percent", "value": "150" });
    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(json!({ "document": bad, "version": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, saved) = t
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(json!({ "document": book("100"), "version": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    // The draft calculates; nothing is published, so quotes and the public can't use it.
    let (status, calc) = t
        .call(
            "POST",
            &format!("{base}/calculate"),
            Some(&editor),
            Some(json!({ "input": calc_input() })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{calc}");
    assert_eq!(calc["subscription_subtotal"], "62500.00");
    assert_eq!(calc["one_off_total"], "80000.00");
    assert_eq!(calc["renewal_amount"], "72500.00");
    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/visibility"),
            Some(&reviewer),
            Some(json!({ "visible": true })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "nothing published yet");

    // Maker-checker: editors can't publish, reviewers not their own request.
    t.call(
        "POST",
        &format!("{base}/submit"),
        Some(&reviewer),
        Some(json!({ "note": "First prices", "effective_from": "2026-11-01" })),
    )
    .await;
    let (status, _) = t
        .call("POST", &format!("{base}/publish"), Some(&editor), None)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .call("POST", &format!("{base}/publish"), Some(&reviewer), None)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .call("POST", &format!("{base}/publish"), Some(&other), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, read) = t.call("GET", &base, Some(&editor), None).await;
    assert_eq!(read["status"], "published");
    assert_eq!(read["published_number"], 1);
    assert_eq!(read["versions"][0]["effective_from"], "2026-11-01");

    // Published, but not shown: the public still sees nothing.
    let (_, public) = t
        .call("GET", &format!("/v1/sites/{slug}/pricing"), None, None)
        .await;
    assert_eq!(public["visible"], false);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/sites/{slug}/pricing/calculate"),
            None,
            Some(calc_input()),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Shown: only public, priced items; internal terms never.
    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/visibility"),
            Some(&editor),
            Some(json!({ "visible": true })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    t.call(
        "POST",
        &format!("{base}/visibility"),
        Some(&reviewer),
        Some(json!({ "visible": true })),
    )
    .await;
    let (_, public) = t
        .call("GET", &format!("/v1/sites/{slug}/pricing"), None, None)
        .await;
    assert_eq!(public["visible"], true);
    let ids: Vec<&str> = public["book"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["core_hr"]);
    assert_eq!(public["book"]["terms"], "");
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/sites/{slug}/pricing/calculate"),
            None,
            Some(calc_input()),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "non-public items can't be priced publicly"
    );
    let (status, public_calc) = t
        .call(
            "POST",
            &format!("/v1/sites/{slug}/pricing/calculate"),
            None,
            Some(json!({ "employees": 10, "cycle": "annual", "lines": [{ "item_id": "core_hr" }] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    // 10 × 100 × 12 = 12,000, less the configured 10% annual discount.
    assert_eq!(public_calc["subscription_net"], "10800.00");

    // A draft change shows as a comparison and needs approval again; rollback restores a version into the draft.
    let (_, current) = t.call("GET", &base, Some(&editor), None).await;
    t.call(
        "POST",
        &format!("{base}/draft"),
        Some(&editor),
        Some(json!({ "document": book("120"), "version": current["draft_version"] })),
    )
    .await;
    let (_, changed) = t.call("GET", &base, Some(&editor), None).await;
    assert_eq!(changed["status"], "changes_pending");
    assert_eq!(changed["changes"]["items"][0]["item_id"], "core_hr");
    assert_eq!(changed["changes"]["items"][0]["before"], "100");
    let (_, public) = t
        .call("GET", &format!("/v1/sites/{slug}/pricing"), None, None)
        .await;
    assert_eq!(
        public["book"]["items"][0]["rate"], "100",
        "drafts never reach the website"
    );
    t.call(
        "POST",
        &format!("{base}/rollback"),
        Some(&editor),
        Some(json!({ "version": 1 })),
    )
    .await;
    let (_, rolled) = t.call("GET", &base, Some(&editor), None).await;
    assert_eq!(rolled["status"], "published");

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE site_id = (SELECT id FROM sites WHERE slug = $1) AND action LIKE 'pricing.%'",
    )
    .bind(&slug)
    .fetch_all(&t.pool)
    .await
    .unwrap();
    for action in [
        "pricing.draft_saved",
        "pricing.submitted",
        "pricing.published",
        "pricing.visibility_changed",
        "pricing.rolled_back",
    ] {
        assert!(actions.iter().any(|a| a == action), "{action} audited");
    }
}

/// Regression (31 Oct 2026): a full price book is far larger than a form; it
/// was refused by the API's 16 KB body limit, so saves failed and calculators
/// kept pricing the old draft.
#[tokio::test]
async fn a_full_price_book_saves_and_calculates_with_its_new_rates() {
    let Some(t) = T::new().await else { return };
    let owner = t.admin("owner").await;
    let editor = t.admin("editor").await;
    let slug = t.site(&owner).await;
    let base = format!("/v1/admin/sites/{slug}/pricing");
    let mut doc = serde_json::to_value(figbud_api::pricing::engine::zirahr_starting_book()).unwrap();
    for item in doc["items"].as_array_mut().unwrap() {
        if item["method"] != "custom_quote" {
            item["rate"] = json!("1250.75");
            item["description"] =
                json!("A long description so the book is the size of a real catalogue with detail.");
            item["tiers"] = json!([{ "up_to": 100, "rate": "1300" }, { "up_to": 500, "rate": "1250.75" }, { "up_to": null, "rate": "1200" }]);
        }
    }
    assert!(doc.to_string().len() > 16 * 1024, "bigger than the general limit");
    let (status, body) = t
        .call(
            "POST",
            &format!("{base}/draft"),
            Some(&editor),
            Some(json!({ "document": doc, "version": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, calc) = t
        .call(
            "POST",
            &format!("{base}/calculate"),
            Some(&editor),
            Some(json!({ "input": { "employees": 250, "cycle": "monthly", "lines": [{ "item_id": "core_hr" }] } })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        calc["subscription_subtotal"], "312687.50",
        "250 × 1250.75 from the saved draft"
    );
    assert_eq!(calc["unpriced"], json!([]));
}

#[tokio::test]
async fn quotations_keep_their_snapshot_need_approval_and_share_safely() {
    let Some(t) = T::new().await else { return };
    let owner = t.admin("owner").await;
    let editor = t.admin("editor").await;
    let reviewer = t.admin("reviewer").await;
    let viewer = t.admin("viewer").await;
    let slug = t.site(&owner).await;
    let base = format!("/v1/admin/sites/{slug}/pricing");
    t.call(
        "POST",
        &format!("{base}/draft"),
        Some(&editor),
        Some(json!({ "document": book("100"), "version": 0 })),
    )
    .await;

    // No published book: no quotations.
    let quote = json!({ "customer_name": "Example Ltd", "customer_contact": "finance@example.test",
        "input": calc_input(), "internal_notes": "Margin note: never shown to customers" });
    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/quotes"),
            Some(&editor),
            Some(quote.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    t.call("POST", &format!("{base}/submit"), Some(&editor), None)
        .await;
    t.call("POST", &format!("{base}/publish"), Some(&reviewer), None)
        .await;

    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/quotes"),
            Some(&viewer),
            Some(quote.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, created) = t
        .call(
            "POST",
            &format!("{base}/quotes"),
            Some(&editor),
            Some(quote.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    assert!(created["reference"].as_str().unwrap().starts_with("PRICE"));

    // Prices change and are republished: the quotation keeps what was offered.
    let (_, current) = t.call("GET", &base, Some(&editor), None).await;
    t.call(
        "POST",
        &format!("{base}/draft"),
        Some(&editor),
        Some(json!({ "document": book("500"), "version": current["draft_version"] })),
    )
    .await;
    t.call("POST", &format!("{base}/submit"), Some(&editor), None)
        .await;
    t.call("POST", &format!("{base}/publish"), Some(&reviewer), None)
        .await;
    let (_, q) = t
        .call(
            "GET",
            &format!("/v1/admin/pricing/quotes/{id}"),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(q["snapshot"]["calculation"]["subscription_subtotal"], "62500.00");
    assert_eq!(q["book_version"], 1);

    // Approval: editors submit, a different reviewer approves.
    let qbase = format!("/v1/admin/pricing/quotes/{id}");
    let (status, _) = t
        .call("POST", &format!("{qbase}/share"), Some(&editor), None)
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "drafts can't be shared");
    t.call("POST", &format!("{qbase}/submit"), Some(&editor), None)
        .await;
    let (status, _) = t
        .call("POST", &format!("{qbase}/approve"), Some(&editor), None)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, approved) = t
        .call("POST", &format!("{qbase}/approve"), Some(&reviewer), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(approved["status"], "approved");
    let (status, _) = t
        .call(
            "POST",
            &format!("{qbase}/update"),
            Some(&editor),
            Some(json!({ "version": 1 })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "approved quotations are frozen");

    // A customer link: approved quotations only; no internal notes, inputs or price book.
    let (_, shared) = t
        .call("POST", &format!("{qbase}/share"), Some(&editor), None)
        .await;
    let token = shared["token"].as_str().unwrap().to_owned();
    assert_eq!(shared["status"], "sent");
    let (status, view) = t
        .call_with("GET", "/v1/quotes/shared", None, None, Some(&token))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["customer_name"], "Example Ltd");
    assert_eq!(view["calculation"]["renewal_amount"], "72500.00");
    let text = view.to_string();
    assert!(!text.contains("Margin note") && !text.contains("internal_notes") && !text.contains("\"input\""));
    let (status, _) = t
        .call_with("GET", "/v1/quotes/shared", None, None, Some(&"0".repeat(64)))
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    // A new link replaces the old one; unsharing ends access.
    let (_, again) = t
        .call("POST", &format!("{qbase}/share"), Some(&editor), None)
        .await;
    let (status, _) = t
        .call_with("GET", "/v1/quotes/shared", None, None, Some(&token))
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    t.call("POST", &format!("{qbase}/unshare"), Some(&editor), None)
        .await;
    let (status, _) = t
        .call_with(
            "GET",
            "/v1/quotes/shared",
            None,
            None,
            Some(again["token"].as_str().unwrap()),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, accepted) = t
        .call("POST", &format!("{qbase}/accept"), Some(&reviewer), None)
        .await;
    assert_eq!(accepted["status"], "accepted");

    // Quotations with unpriced items can't go for approval.
    let mut scoped = quote.clone();
    scoped["input"]["lines"] = json!([{ "item_id": "core_hr" }, { "item_id": "custom_work" }]);
    let (_, draft) = t
        .call("POST", &format!("{base}/quotes"), Some(&editor), Some(scoped))
        .await;
    let (status, body) = t
        .call(
            "POST",
            &format!(
                "/v1/admin/pricing/quotes/{}/submit",
                draft["id"].as_str().unwrap()
            ),
            Some(&editor),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"]["fields"][0]["code"], "unpriced");
}
