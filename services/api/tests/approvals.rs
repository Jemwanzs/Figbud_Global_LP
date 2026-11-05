//! The approval queue across websites and the activity log (P7-F2), against
//! real PostgreSQL (`TEST_DATABASE_URL`).

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

struct Studio {
    app: Router,
    pool: PgPool,
}

impl Studio {
    /// Someone with a Studio role, limited to the given websites when any are named.
    async fn person(&self, role: &str, sites: &[(Uuid, &str)]) -> (Uuid, String) {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(format!("queue-{id}@figbud.test"))
            .bind(format!("Queue {role}"))
            .bind(role)
            .execute(&self.pool)
            .await
            .unwrap();
        if !sites.is_empty() {
            sqlx::query("UPDATE admin_users SET all_sites = false WHERE id = $1")
                .bind(id)
                .execute(&self.pool)
                .await
                .unwrap();
        }
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
        (id, format!("figbud_admin={token}"))
    }

    async fn get(&self, uri: &str, cookie: &str) -> (StatusCode, Value) {
        let request = Request::get(uri)
            .header(header::COOKIE, cookie)
            .body(Body::empty())
            .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 22).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// A page on a website, with a change waiting for approval.
    async fn pending_page(&self, site: Uuid, title: &str, requester: Uuid) -> Uuid {
        let page = Uuid::now_v7();
        let document = json!({ "sections": [] });
        sqlx::query("INSERT INTO pages (id, site_id, path, title, draft) VALUES ($1, $2, $3, $4, $5)")
            .bind(page)
            .bind(site)
            .bind(format!("q{}", page.simple()))
            .bind(title)
            .bind(&document)
            .execute(&self.pool)
            .await
            .unwrap();
        let revision = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO page_revisions (id, page_id, number, document, note, requested_by)
             VALUES ($1, $2, 1, $3, 'Please review', $4)",
        )
        .bind(revision)
        .bind(page)
        .bind(&document)
        .bind(requester)
        .execute(&self.pool)
        .await
        .unwrap();
        revision
    }

    /// A website of this test's own, so its pages don't touch the seeded ones.
    async fn own_site(&self) -> (Uuid, String) {
        let id = Uuid::now_v7();
        let slug = format!("queue_{}", &id.simple().to_string()[20..]);
        sqlx::query(
            "INSERT INTO sites (id, slug, name, kind, status, category, template)
             VALUES ($1, $2, 'Queue Site', 'product', 'active', 'hr_workforce', 'hr')",
        )
        .bind(id)
        .bind(&slug)
        .execute(&self.pool)
        .await
        .unwrap();
        (id, slug)
    }

    async fn site(&self, slug: &str) -> Uuid {
        sqlx::query_scalar("SELECT id FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
}

fn find(queue: &Value, id: Uuid) -> Option<Value> {
    queue["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == id.to_string())
        .cloned()
}

#[tokio::test]
async fn the_queue_shows_whose_turn_it_is_and_hides_other_websites() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let s = Studio {
        app: app_with(pool.clone(), config(&url)),
        pool,
    };
    let (own, own_slug) = s.own_site().await;
    let jasiri = s.site("jasiri").await;

    let (editor_id, editor) = s.person("editor", &[(own, "editor")]).await;
    let (_, reviewer) = s.person("reviewer", &[(own, "reviewer")]).await;
    let (_, elsewhere) = s.person("reviewer", &[(jasiri, "reviewer")]).await;
    let (_, viewer) = s.person("viewer", &[(own, "viewer")]).await;
    let (owner_id, owner) = s.person("owner", &[]).await;

    let page = s.pending_page(own, "Queue page", editor_id).await;
    let owners_own = s.pending_page(own, "Owner's page", owner_id).await;

    // Whoever asked waits; a different reviewer decides.
    let (status, queue) = s.get("/v1/admin/approvals", &editor).await;
    assert_eq!(status, StatusCode::OK);
    let mine = find(&queue, page).expect("the requester sees their request");
    assert_eq!(
        (&mine["mine"], &mine["can_decide"]),
        (&json!(true), &json!(false))
    );
    assert_eq!(mine["kind"], "page");
    assert_eq!(mine["title"], "Queue page");
    assert_eq!(mine["note"], "Please review");
    assert_eq!(mine["sites"][0]["slug"], own_slug);
    assert_eq!(mine["requested_by"], "Queue editor");

    let (_, queue) = s.get("/v1/admin/approvals", &reviewer).await;
    let theirs = find(&queue, page).unwrap();
    assert_eq!(
        (&theirs["mine"], &theirs["can_decide"]),
        (&json!(false), &json!(true))
    );
    assert!(queue["waiting_for_you"].as_u64().unwrap() >= 2);

    // Someone who can only see: it's listed, but it isn't their turn.
    let (_, queue) = s.get("/v1/admin/approvals", &viewer).await;
    assert_eq!(find(&queue, page).unwrap()["can_decide"], false);
    assert_eq!(queue["waiting_for_you"], 0);

    // Another website's reviewer doesn't learn it exists.
    let (_, queue) = s.get("/v1/admin/approvals", &elsewhere).await;
    assert!(find(&queue, page).is_none());
    assert!(queue["items"].as_array().unwrap().iter().all(|i| {
        i["sites"]
            .as_array()
            .unwrap()
            .iter()
            .all(|n| n["slug"] == "jasiri")
    }));

    // Owners may approve their own, as on the page's own screen.
    let (_, queue) = s.get("/v1/admin/approvals", &owner).await;
    let own = find(&queue, owners_own).unwrap();
    assert_eq!((&own["mine"], &own["can_decide"]), (&json!(true), &json!(true)));

    // Once decided it leaves the queue.
    sqlx::query("UPDATE page_revisions SET state = 'rejected', decided_at = now() WHERE id = $1")
        .bind(page)
        .execute(&s.pool)
        .await
        .unwrap();
    let (_, queue) = s.get("/v1/admin/approvals", &owner).await;
    assert!(find(&queue, page).is_none());

    // Not signed in: nothing.
    let (status, _) = s.get("/v1/admin/approvals", "figbud_admin=nope").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn every_kind_of_request_appears_with_its_own_rules() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let s = Studio {
        app: app_with(pool.clone(), config(&url)),
        pool,
    };
    let site = s.site("expense_now").await;
    let (requester, _) = s.person("editor", &[]).await;
    let (_, owner) = s.person("owner", &[]).await;

    let run = Uuid::now_v7();
    let doc = json!({ "name": "Queue organisation" });
    sqlx::query(
        "INSERT INTO proof_items (id, kind, draft, draft_sites, review_requested_by, review_requested_at, review_note)
         VALUES ($1, 'organization', $2, ARRAY['figbud', 'zirahr'], $3, now(), 'Check permission')",
    )
    .bind(run)
    .bind(&doc)
    .bind(requester)
    .execute(&s.pool)
    .await
    .unwrap();
    let article = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO cms_articles (id, slug, locale, title, excerpt, body_markdown, status, last_edited_by, submitted_at)
         VALUES ($1, $2, 'en', 'Queue article', 'x', 'x', 'in_review', $3, now())",
    )
    .bind(article)
    .bind(format!("queue-{article}"))
    .bind(requester)
    .execute(&s.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO site_heroes (site_id, draft, review_requested_by, review_requested_at, review_note)
         VALUES ($1, '{}', $2, now(), 'Hero ready')
         ON CONFLICT (site_id) DO UPDATE
            SET review_requested_by = $2, review_requested_at = now(), review_note = 'Hero ready'",
    )
    .bind(site)
    .bind(requester)
    .execute(&s.pool)
    .await
    .unwrap();

    let (status, queue) = s.get("/v1/admin/approvals", &owner).await;
    assert_eq!(status, StatusCode::OK);
    let proof = find(&queue, run).unwrap();
    assert_eq!(proof["kind"], "proof");
    assert_eq!(proof["title"], "Queue organisation");
    let slugs: Vec<_> = proof["sites"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["slug"].as_str().unwrap())
        .collect();
    assert_eq!(
        slugs,
        ["figbud", "zirahr"],
        "the corporate website isn't listed twice"
    );
    assert_eq!(find(&queue, article).unwrap()["kind"], "article");
    assert_eq!(find(&queue, site).unwrap()["kind"], "hero");
    assert_eq!(find(&queue, site).unwrap()["note"], "Hero ready");

    // A reviewer limited to one website can't see a record that's also on another.
    let zirahr = s.site("zirahr").await;
    let (_, limited) = s.person("reviewer", &[(zirahr, "reviewer")]).await;
    let (_, queue) = s.get("/v1/admin/approvals", &limited).await;
    assert!(find(&queue, run).is_none());
    assert!(
        find(&queue, article).is_none(),
        "articles live with the corporate website"
    );

    sqlx::query("UPDATE site_heroes SET review_requested_by = NULL, review_requested_at = NULL, review_note = NULL WHERE site_id = $1")
        .bind(site)
        .execute(&s.pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn the_activity_log_compares_values_for_owners_only() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let s = Studio {
        app: app_with(pool.clone(), config(&url)),
        pool,
    };
    let site = s.site("zirahr").await;
    let (_, owner) = s.person("owner", &[]).await;
    let (_, reviewer) = s.person("reviewer", &[]).await;

    let entry = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, 'page.published', 'site', $2, $3, $4)",
    )
    .bind(entry)
    .bind(site.to_string())
    .bind(json!({ "note": "kept", "from": { "title": "Old" }, "to": { "title": "New" } }))
    .bind(site)
    .execute(&s.pool)
    .await
    .unwrap();

    // The feed says changes exist without sending whole documents.
    let (status, feed) = s.get("/v1/admin/audit?site=zirahr", &owner).await;
    assert_eq!(status, StatusCode::OK);
    let row = feed
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == entry.to_string())
        .expect("in the website's log");
    assert_eq!(row["has_changes"], true);
    assert_eq!(row["detail"], json!({ "note": "kept" }));

    let (_, other) = s.get("/v1/admin/audit?site=jasiri", &owner).await;
    assert!(
        other
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["id"] != entry.to_string())
    );

    // Older entries come by cursor.
    let (_, older) = s
        .get(
            &format!(
                "/v1/admin/audit?before={}",
                row["created_at"].as_str().unwrap().replace('+', "%2B")
            ),
            &owner,
        )
        .await;
    assert!(
        older
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["id"] != entry.to_string())
    );

    let (status, changes) = s.get(&format!("/v1/admin/audit/{entry}/changes"), &owner).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        changes["changes"],
        json!([{ "path": "title", "before": "Old", "after": "New" }])
    );

    let (status, _) = s
        .get(&format!("/v1/admin/audit/{entry}/changes"), &reviewer)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = s
        .get(&format!("/v1/admin/audit/{}/changes", Uuid::now_v7()), &owner)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
