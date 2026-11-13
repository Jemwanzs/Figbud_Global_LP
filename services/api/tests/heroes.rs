//! Hero Design Studio (P12) against real PostgreSQL (`TEST_DATABASE_URL`):
//! drafts never reach the website, approval publishes exactly one variant,
//! versions roll back, and products keep their own collections.

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
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Hero Tester', $3)")
            .bind(id)
            .bind(format!(
                "hero-{role}-{}-{}@figbud.test",
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

    /// Saves `draft` as the website's hero draft (reading the current version first).
    async fn save(&self, slug: &str, cookie: &str, draft: &Value) -> (StatusCode, Value) {
        let (_, current) = self
            .call("GET", &format!("/v1/admin/sites/{slug}/hero"), Some(cookie), None)
            .await;
        self.call(
            "POST",
            &format!("/v1/admin/sites/{slug}/hero/draft"),
            Some(cookie),
            Some(json!({ "document": draft, "version": current["draft_version"] })),
        )
        .await
    }

    async fn live(&self, slug: &str) -> Value {
        let (status, body) = self
            .call("GET", &format!("/v1/sites/{slug}/hero"), None, None)
            .await;
        assert_eq!(status, StatusCode::OK);
        body["hero"].clone()
    }
}

#[tokio::test]
async fn heroes_publish_one_variant_with_approval_and_roll_back() {
    let Some(t) = T::new().await else { return };
    let editor = t.admin("editor").await;
    let reviewer = t.admin("reviewer").await;
    let other = t.admin("reviewer").await;
    let base = "/v1/admin/sites/zirahr/hero";

    // ZiraHR's own collection, starting with its default design.
    let (status, read) = t.call("GET", base, Some(&editor), None).await;
    assert_eq!(status, StatusCode::OK);
    let designs: Vec<&str> = read["designs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["key"].as_str().unwrap())
        .collect();
    assert_eq!(designs, ["workforce", "payroll", "journey", "chapters"]);
    let mut draft = read["draft"].clone();

    // A FigBud design or an unsafe link is refused.
    let mut wrong = draft.clone();
    wrong["variants"][0]["design"] = json!("cinematic");
    assert_eq!(
        t.save("zirahr", &editor, &wrong).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let mut unsafe_link = draft.clone();
    unsafe_link["variants"][0]["config"]["primary_href"] = json!("javascript:alert(1)");
    assert_eq!(
        t.save("zirahr", &editor, &unsafe_link).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );

    // Draft: Payroll in Motion selected, with its own headline.
    let marker = format!("Payroll you can see {}", t.run);
    draft["variants"][1]["config"]["headline"] = json!(marker);
    draft["selected"] = json!("v2");
    let (status, body) = t.save("zirahr", &editor, &draft).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let before = t.live("zirahr").await;
    assert_ne!(
        before["config"]["headline"],
        json!(marker),
        "drafts never reach the website"
    );

    // Maker-checker.
    t.call(
        "POST",
        &format!("{base}/submit"),
        Some(&reviewer),
        Some(json!({ "note": "Payroll focus" })),
    )
    .await;
    assert_eq!(
        t.call("POST", &format!("{base}/publish"), Some(&editor), None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        t.call("POST", &format!("{base}/publish"), Some(&reviewer), None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        t.call("POST", &format!("{base}/publish"), Some(&other), None)
            .await
            .0,
        StatusCode::OK
    );
    let live = t.live("zirahr").await;
    assert_eq!(live["design"], "payroll");
    assert_eq!(live["config"]["headline"], json!(marker));
    assert!(
        live.get("variants").is_none(),
        "only the published variant is public"
    );

    // Selecting another variant changes nothing live until it's approved.
    draft["selected"] = json!("v3");
    t.save("zirahr", &editor, &draft).await;
    assert_eq!(t.live("zirahr").await["design"], "payroll");
    t.call("POST", &format!("{base}/submit"), Some(&editor), None)
        .await;
    t.call("POST", &format!("{base}/publish"), Some(&reviewer), None)
        .await;
    assert_eq!(t.live("zirahr").await["design"], "journey");

    // One-step rollback to the previous approved version (reviewers only).
    let (_, read) = t.call("GET", base, Some(&editor), None).await;
    let previous = read["versions"][1]["number"].as_i64().unwrap();
    assert_eq!(
        t.call(
            "POST",
            &format!("{base}/rollback"),
            Some(&editor),
            Some(json!({ "version": previous }))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, _) = t
        .call(
            "POST",
            &format!("{base}/rollback"),
            Some(&reviewer),
            Some(json!({ "version": previous })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(t.live("zirahr").await["design"], "payroll");
    let (_, read) = t.call("GET", base, Some(&editor), None).await;
    assert_eq!(read["live"], read["published"]["variant_id"]);

    // The website's own hero is listed and publishable too (owner's brief, 12 Nov
    // 2026): published as nothing, so the home page shows its own hero again.
    draft["selected"] = json!("own");
    let (status, body) = t.save("zirahr", &editor, &draft).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    t.call("POST", &format!("{base}/submit"), Some(&editor), None)
        .await;
    assert_eq!(
        t.call("POST", &format!("{base}/publish"), Some(&reviewer), None)
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(t.live("zirahr").await, Value::Null);
    let (_, read) = t.call("GET", base, Some(&editor), None).await;
    assert_eq!(read["live"], "own");
    assert_eq!(read["status"], "published");
    assert!(read["published"].is_null());
    // Already live: nothing to ask approval for.
    assert_eq!(
        t.call("POST", &format!("{base}/submit"), Some(&editor), None)
            .await
            .0,
        StatusCode::CONFLICT
    );
    // And it rolls back like any version.
    let previous = read["versions"][1]["number"].as_i64().unwrap();
    t.call(
        "POST",
        &format!("{base}/rollback"),
        Some(&reviewer),
        Some(json!({ "version": previous })),
    )
    .await;
    assert_eq!(t.live("zirahr").await["design"], "payroll");
    // "own" can't be taken as a variant's name.
    let mut reserved = draft.clone();
    reserved["variants"][0]["id"] = json!("own");
    assert_eq!(
        t.save("zirahr", &editor, &reserved).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE site_id = (SELECT id FROM sites WHERE slug = 'zirahr') AND action LIKE 'hero.%'",
    )
    .fetch_all(&t.pool)
    .await
    .unwrap();
    for action in [
        "hero.draft_saved",
        "hero.submitted",
        "hero.published",
        "hero.rolled_back",
    ] {
        assert!(actions.iter().any(|a| a == action), "{action} audited");
    }

    // Products without their own designs get none copied in.
    let (_, ziwa) = t
        .call("GET", "/v1/admin/sites/ziwa/hero", Some(&editor), None)
        .await;
    assert_eq!(ziwa["designs"], json!([]));
    assert_eq!(t.save("ziwa", &editor, &draft).await.0, StatusCode::CONFLICT);
}

#[tokio::test]
async fn a_design_added_later_is_offered_once_in_a_saved_draft() {
    let Some(pool) = database().await else { return };
    let site: Uuid = sqlx::query_scalar("SELECT id FROM sites WHERE slug = 'figbud'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let before: Option<(Value, i32)> =
        sqlx::query_as("SELECT draft, draft_version FROM site_heroes WHERE site_id = $1")
            .bind(site)
            .fetch_optional(&pool)
            .await
            .unwrap();
    let forget = || {
        sqlx::query("DELETE FROM audit_log WHERE site_id = $1 AND action = 'hero.edition_added'").bind(site)
    };
    let store = |draft: Value| {
        sqlx::query(
            "INSERT INTO site_heroes (site_id, draft) VALUES ($1, $2)
             ON CONFLICT (site_id) DO UPDATE SET draft = EXCLUDED.draft",
        )
        .bind(site)
        .bind(draft)
    };
    let variants = |draft: &Value| -> Vec<(String, String, String)> {
        draft["variants"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| {
                (
                    v["id"].as_str().unwrap().to_owned(),
                    v["design"].as_str().unwrap().to_owned(),
                    v["name"].as_str().unwrap().to_owned(),
                )
            })
            .collect()
    };
    let draft = || async {
        sqlx::query_scalar::<_, Value>("SELECT draft FROM site_heroes WHERE site_id = $1")
            .bind(site)
            .fetch_one(&pool)
            .await
            .unwrap()
    };

    // A draft saved before the editorial design existed, with the third
    // variant duplicated and the original v3 removed by an editor.
    let old = json!({ "variants": [
        { "id": "v1", "design": "ecosystem", "name": "01 · Connected Ecosystem" },
        { "id": "v2", "design": "cinematic", "name": "02 · Beyond the Ordinary" },
        { "id": "v4", "design": "universe", "name": "Universe copy" },
    ], "selected": "v2" });
    store(old.clone()).execute(&pool).await.unwrap();
    forget().execute(&pool).await.unwrap();
    figbud_api::heroes::offer_added_designs(&pool).await.unwrap();
    let now = draft().await;
    let list = variants(&now);
    // The editorial design, then the five platform heroes (13 Nov 2026), each once.
    assert_eq!(list.len(), 9);
    let added: Vec<_> = list[4..]
        .iter()
        .map(|(_, design, name)| (design.as_str(), name.as_str()))
        .collect();
    assert_eq!(
        added,
        [
            ("emerald", "05 · Emerald Innovation"),
            ("digital", "06 · Digital Future"),
            ("ecosystem_light", "07 · Connected Ecosystem · Light"),
            ("orbit", "08 · Enterprise Orbit"),
            ("dark_enterprise", "09 · Dark Enterprise"),
        ]
    );
    assert_eq!(
        list[3],
        (
            "v3".to_owned(),
            "edition".to_owned(),
            "04 · The FigBud Edition".to_owned()
        ),
        "the first free id, at the end"
    );
    assert_eq!(now["selected"], "v2", "nothing is selected for the editor");

    // Once only: removed afterwards, it stays removed.
    store(old).execute(&pool).await.unwrap();
    figbud_api::heroes::offer_added_designs(&pool).await.unwrap();
    assert_eq!(variants(&draft().await).len(), 3);

    // Leave the shared database as it was.
    match before {
        Some((draft, version)) => {
            sqlx::query("UPDATE site_heroes SET draft = $2, draft_version = $3 WHERE site_id = $1")
                .bind(site)
                .bind(draft)
                .bind(version)
                .execute(&pool)
                .await
                .unwrap();
        }
        None => {
            sqlx::query("DELETE FROM site_heroes WHERE site_id = $1")
                .bind(site)
                .execute(&pool)
                .await
                .unwrap();
        }
    }
}
