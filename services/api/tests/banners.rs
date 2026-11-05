//! Customer & partner banners (P10-B1, P10-W1) against real PostgreSQL
//! (`TEST_DATABASE_URL`): one record on several websites, naming only an
//! approved organisation, with separate visibility per website.

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
}

impl Studio {
    async fn person(&self, role: &str, sites: &[(Uuid, &str)]) -> String {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role, all_sites) VALUES ($1, $2, $3, $4, $5)")
            .bind(id)
            .bind(format!("banner-{id}@figbud.test"))
            .bind(format!("Banner {role}"))
            .bind(role)
            .bind(sites.is_empty())
            .execute(&self.pool)
            .await
            .unwrap();
        for (site, site_role) in sites {
            sqlx::query("INSERT INTO admin_site_grants (user_id, site_id, role) VALUES ($1, $2, $3)")
                .bind(id)
                .bind(site)
                .bind(site_role)
                .execute(&self.pool)
                .await
                .unwrap();
        }
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
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::ORIGIN, ORIGIN);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        let request = match body {
            Some(body) => request
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string())),
            None => request.body(Body::empty()),
        }
        .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 22).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn site(&self, slug: &str) -> Uuid {
        sqlx::query_scalar("SELECT id FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }

    /// An organisation approved for the given websites in Trusted By.
    async fn organization(&self, name: &str, sites: &[&str]) -> Uuid {
        let id = Uuid::now_v7();
        let document = json!({ "name": name, "relationship": "customer" });
        let sites: Vec<String> = sites.iter().map(|s| (*s).to_owned()).collect();
        sqlx::query(
            "INSERT INTO proof_items (id, kind, draft, draft_sites, published, published_sites, published_number, published_at)
             VALUES ($1, 'organization', $2, $3, $2, $3, 1, now())",
        )
        .bind(id)
        .bind(&document)
        .bind(&sites)
        .execute(&self.pool)
        .await
        .unwrap();
        id
    }

    async fn live(&self, slug: &str, id: &str) -> Option<Value> {
        let (status, list) = self
            .call("GET", &format!("/v1/sites/{slug}/campaigns"), None, None)
            .await;
        assert_eq!(status, StatusCode::OK);
        list["campaigns"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .cloned()
    }
}

async fn studio() -> Option<Studio> {
    let pool = database().await?;
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    Some(Studio {
        app: app_with(pool.clone(), config(&url)),
        pool,
    })
}

/// Saves a change to the draft, returning its new version.
async fn save(s: &Studio, id: &str, who: &str, version: i64, document: &Value) -> (StatusCode, Value) {
    s.call(
        "POST",
        &format!("/v1/admin/campaigns/{id}/draft"),
        Some(who),
        Some(json!({ "version": version, "name": "Banner", "objective": "", "description": "", "document": document })),
    )
    .await
}

#[tokio::test]
async fn a_banner_names_only_an_approved_organisation_on_every_website_it_shows() {
    let Some(s) = studio().await else { return };
    let owner = s.person("owner", &[]).await;
    let run = Uuid::now_v7().simple().to_string();
    let org = s
        .organization(&format!("Mfano {run}"), &["zirahr", "jasiri"])
        .await;

    let (status, created) = s
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&owner),
            Some(json!({ "site": "zirahr", "name": "Banner", "kind": "banner" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, detail) = s
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&owner), None)
        .await;
    assert_eq!(detail["draft"]["announcement"]["kind"], "launch");
    assert!(
        detail["organizations"]
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o["id"] == org.to_string())
    );
    assert!(
        detail["websites"]
            .as_array()
            .unwrap()
            .iter()
            .all(|w| w["slug"] != "zirahr")
    );

    // A customer announcement needs a named organisation.
    let mut document = detail["draft"].clone();
    document["announcement"]["kind"] = json!("new_customer");
    document["content"]["headline"] = json!("Welcome to our newest customer");
    let (status, saved) = save(&s, &id, &owner, 1, &document).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let submit = json!({ "note": "Ready" });
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/submit"),
            Some(&owner),
            Some(submit.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Not approved for one of the websites: refused, with the reason.
    document["announcement"]["organization_id"] = json!(org);
    document["also_on"] = json!(["jasiri", "expense_now"]);
    let (status, _) = save(&s, &id, &owner, 2, &document).await;
    assert_eq!(status, StatusCode::OK);
    let (status, refused) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/submit"),
            Some(&owner),
            Some(submit.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(
        refused["error"]["message"]
            .as_str()
            .unwrap()
            .contains("Trusted By")
    );

    // Only real, other websites can be chosen.
    let mut unknown = document.clone();
    unknown["also_on"] = json!(["nowhere"]);
    let (status, _) = save(&s, &id, &owner, 3, &unknown).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    // Approved for both: one record, live on both, naming the organisation.
    document["also_on"] = json!(["jasiri"]);
    let (status, _) = save(&s, &id, &owner, 3, &document).await;
    assert_eq!(status, StatusCode::OK);
    let (status, revision) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/submit"),
            Some(&owner),
            Some(submit),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{revision}");
    let revision = revision["id"].as_str().unwrap();

    // Not live until approved; then in the queue with both websites.
    assert!(s.live("zirahr", &id).await.is_none());
    let (_, queue) = s.call("GET", "/v1/admin/approvals", Some(&owner), None).await;
    let queued = queue["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == revision)
        .unwrap()
        .clone();
    let slugs: Vec<_> = queued["sites"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["slug"].clone())
        .collect();
    assert_eq!(slugs, [json!("zirahr"), json!("jasiri")]);

    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/revisions/{revision}/approve"),
            Some(&owner),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    for slug in ["zirahr", "jasiri"] {
        let live = s
            .live(slug, &id)
            .await
            .unwrap_or_else(|| panic!("live on {slug}"));
        assert_eq!(live["announcement"]["kind"], "new_customer");
        assert_eq!(
            live["announcement"]["organization"]["name"],
            format!("Mfano {run}")
        );
        assert_eq!(
            live["content"]["badge"], "New customer",
            "the label when no badge is typed"
        );
        assert!(
            live.get("also_on").is_none(),
            "websites aren't told about each other"
        );
        assert!(live["announcement"].get("organization_id").is_none());
    }
    assert!(s.live("ziwa", &id).await.is_none(), "not on other websites");

    // Hiding on one website is immediate, needs no approval and leaves the other.
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/websites"),
            Some(&owner),
            Some(json!({ "site": "jasiri", "visible": false })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(s.live("jasiri", &id).await.is_none());
    assert!(s.live("zirahr", &id).await.is_some());
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/websites"),
            Some(&owner),
            Some(json!({ "site": "ziwa", "visible": false })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "not one of its websites");
    let (_, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/websites"),
            Some(&owner),
            Some(json!({ "site": "jasiri", "visible": true })),
        )
        .await;
    assert!(s.live("jasiri", &id).await.is_some());

    // Withdrawing the organisation's approval takes the banner down by itself.
    sqlx::query("UPDATE proof_items SET published_sites = ARRAY['zirahr'] WHERE id = $1")
        .bind(org)
        .execute(&s.pool)
        .await
        .unwrap();
    assert!(s.live("jasiri", &id).await.is_none(), "no longer approved here");
    assert!(s.live("zirahr", &id).await.is_some());
    sqlx::query("UPDATE proof_items SET active = false WHERE id = $1")
        .bind(org)
        .execute(&s.pool)
        .await
        .unwrap();
    assert!(s.live("zirahr", &id).await.is_none());
}

#[tokio::test]
async fn working_on_a_banner_needs_every_website_it_reaches() {
    let Some(s) = studio().await else { return };
    let owner = s.person("owner", &[]).await;
    let zirahr = s.site("zirahr").await;
    let jasiri = s.site("jasiri").await;
    let editor = s.person("editor", &[(zirahr, "editor")]).await;
    let reviewer = s.person("reviewer", &[(zirahr, "reviewer")]).await;
    let both = s
        .person("reviewer", &[(zirahr, "reviewer"), (jasiri, "reviewer")])
        .await;

    let (_, created) = s
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&owner),
            Some(json!({ "site": "zirahr", "name": "Launch", "kind": "banner" })),
        )
        .await;
    let id = created["id"].as_str().unwrap().to_owned();
    let (_, detail) = s
        .call("GET", &format!("/v1/admin/campaigns/{id}"), Some(&owner), None)
        .await;
    let mut document = detail["draft"].clone();

    // An editor of one website can't reach another.
    document["also_on"] = json!(["jasiri"]);
    let (status, _) = save(&s, &id, &editor, 1, &document).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = save(&s, &id, &owner, 1, &document).await;
    assert_eq!(status, StatusCode::OK);

    // Nor edit, submit or remove it once it does.
    let mut alone = document.clone();
    alone["also_on"] = json!([]);
    let (status, _) = save(&s, &id, &editor, 2, &alone).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, revision) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/submit"),
            Some(&owner),
            Some(json!({ "note": "Launch" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let revision = revision["id"].as_str().unwrap();

    // A reviewer needs every website too.
    let approve = format!("/v1/admin/campaigns/{id}/revisions/{revision}/approve");
    let (status, _) = s.call("POST", &approve, Some(&reviewer), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (_, queue) = s.call("GET", "/v1/admin/approvals", Some(&reviewer), None).await;
    assert!(
        queue["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|i| i["id"] != revision),
        "not listed for someone who can't see every website"
    );
    let (status, _) = s.call("POST", &approve, Some(&both), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(s.live("jasiri", &id).await.is_some());

    // And the switches and pausing follow the same rule.
    let switch = format!("/v1/admin/campaigns/{id}/websites");
    let hide = json!({ "site": "zirahr", "visible": false });
    let (status, _) = s.call("POST", &switch, Some(&reviewer), Some(hide.clone())).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = s.call("POST", &switch, Some(&both), Some(hide)).await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = s
        .call(
            "POST",
            &format!("/v1/admin/campaigns/{id}/pause"),
            Some(&reviewer),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Other kinds stay on one website.
    let (_, other) = s
        .call(
            "POST",
            "/v1/admin/campaigns",
            Some(&owner),
            Some(json!({ "site": "zirahr", "name": "Plain", "kind": "announcement" })),
        )
        .await;
    let other = other["id"].as_str().unwrap().to_owned();
    let (_, detail) = s
        .call("GET", &format!("/v1/admin/campaigns/{other}"), Some(&owner), None)
        .await;
    assert!(detail.get("organizations").is_none());
    assert!(
        detail["draft"].get("announcement").is_none(),
        "stored documents stay as they were"
    );
    let mut document = detail["draft"].clone();
    document["also_on"] = json!(["jasiri"]);
    let (status, _) = save(&s, &other, &owner, 1, &document).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}
