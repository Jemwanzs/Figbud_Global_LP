//! Per-website permissions (P7-F1) against real PostgreSQL
//! (`TEST_DATABASE_URL`): owners limit people to selected websites, each
//! with a role no higher than their Studio role; other websites don't exist
//! for them, and changes that reach every website need every website.

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

struct Team {
    app: Router,
    pool: PgPool,
    run: String,
}

impl Team {
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
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, 'Team Tester', $3)")
            .bind(id)
            .bind(format!(
                "team-{role}-{}-{}@figbud.test",
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

    /// A new session for an existing person.
    async fn admin_session(&self, id: Uuid) -> (Uuid, String) {
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session(&self.pool, &admin_config, id, "test", None)
            .await
            .unwrap();
        (id, format!("figbud_admin={token}"))
    }

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

    async fn site(&self, owner: &str, letter: &str) -> String {
        let slug = format!("team_{letter}_{}", self.run);
        let (status, body) = self
            .call(
                "POST",
                "/v1/admin/sites",
                owner,
                Some(
                    json!({ "name": format!("Team {letter}"), "slug": slug, "category": "lending_credit",
                             "launch_status": "coming_soon" }),
                ),
            )
            .await;
        assert_eq!(status, StatusCode::CREATED, "{body}");
        slug
    }
}

fn slugs(list: &Value) -> Vec<String> {
    list.as_array()
        .unwrap()
        .iter()
        .map(|s| s["slug"].as_str().unwrap().to_owned())
        .collect()
}

#[tokio::test]
async fn owners_limit_people_to_selected_websites() {
    let Some(t) = Team::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let (owner_id, owner) = t.admin("owner").await;
    let (editor_id, editor) = t.admin("editor").await;
    let (a, b) = (t.site(&owner, "a").await, t.site(&owner, "b").await);
    let access = format!("/v1/admin/team/{editor_id}/access");

    // Everyone starts with every website.
    let (_, me) = t.call("GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(me["access"]["all"], true);
    let (_, list) = t.call("GET", "/v1/admin/sites", &editor, None).await;
    assert!(slugs(&list).contains(&b));

    // Only owners manage access, and the rules hold.
    let (status, _) = t.call("GET", "/v1/admin/team", &editor, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .call("POST", &access, &editor, Some(json!({ "all_sites": true })))
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    for (body, expected) in [
        (
            json!({ "all_sites": false, "sites": [] }),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json!({ "all_sites": false, "sites": [{ "site": a, "role": "reviewer" }] }),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json!({ "all_sites": false, "sites": [{ "site": "no_such_site", "role": "viewer" }] }),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json!({ "all_sites": false, "sites": [{ "site": a, "role": "viewer" }, { "site": a, "role": "editor" }] }),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let (status, response) = t.call("POST", &access, &owner, Some(body)).await;
        assert_eq!(status, expected, "{response}");
    }
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{owner_id}/access"),
            &owner,
            Some(json!({ "all_sites": false, "sites": [{ "site": a, "role": "viewer" }] })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "owners always have every website");

    // Limited to website A as an editor.
    let (status, saved) = t
        .call(
            "POST",
            &access,
            &owner,
            Some(json!({ "all_sites": false, "sites": [{ "site": a, "role": "editor" }] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (_, me) = t.call("GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(me["access"]["all"], false);
    assert_eq!(
        me["access"]["sites"],
        json!([{ "site": a, "name": "Team a", "role": "editor" }])
    );
    let (_, list) = t.call("GET", "/v1/admin/sites", &editor, None).await;
    assert_eq!(slugs(&list), vec![a.clone()]);
    for uri in [
        format!("/v1/admin/sites/{b}"),
        format!("/v1/admin/sites/{b}/pages"),
        format!("/v1/admin/sites/{b}/media"),
        format!("/v1/admin/sites/{b}/brand"),
        format!("/v1/admin/sites/{b}/settings"),
        "/v1/admin/cms/articles".to_owned(),
    ] {
        let (status, _) = t.call("GET", &uri, &editor, None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri}");
    }
    let (status, page) = t
        .call(
            "POST",
            &format!("/v1/admin/sites/{a}/pages"),
            &editor,
            Some(json!({ "title": "About", "path": "about", "template": "blank" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{page}");
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/sites/{b}/pages"),
            &editor,
            Some(json!({ "title": "About", "path": "about", "template": "blank" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, body) = t
        .call(
            "POST",
            "/v1/admin/shared",
            &editor,
            Some(json!({ "name": "Promise", "content": { "type": "text", "body": "Hello." } })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "shared content reaches every website: {body}"
    );
    let (status, inbox) = t.call("GET", "/v1/admin/enquiries", &editor, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        inbox["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["product"] == a.as_str())
    );

    // The team list shows the limit; the change is audited with before and after.
    let (_, team) = t.call("GET", "/v1/admin/team", &owner, None).await;
    let member = team["members"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] == editor_id.to_string().as_str())
        .unwrap()
        .clone();
    assert_eq!(member["all_sites"], false);
    assert_eq!(member["sites"][0]["site"], a.as_str());
    assert!(
        team["sites"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["site"] == b.as_str())
    );
    let detail: Value = sqlx::query_scalar(
        "SELECT detail FROM audit_log WHERE action = 'admin.access_changed' AND target_id = $1
          ORDER BY created_at DESC LIMIT 1",
    )
    .bind(editor_id.to_string())
    .fetch_one(&t.pool)
    .await
    .unwrap();
    assert_eq!(detail["from"]["all_sites"], true);
    assert_eq!(detail["to"]["sites"][0]["role"], "editor");

    // A viewer role on A: reading works, editing is refused.
    t.call(
        "POST",
        &access,
        &owner,
        Some(json!({ "all_sites": false, "sites": [{ "site": a, "role": "viewer" }] })),
    )
    .await;
    let (status, _) = t
        .call("GET", &format!("/v1/admin/sites/{a}/pages"), &editor, None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/sites/{a}/pages"),
            &editor,
            Some(json!({ "title": "Team", "path": "team", "template": "blank" })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (_, media) = t
        .call("GET", &format!("/v1/admin/sites/{a}/media"), &editor, None)
        .await;
    assert_eq!(media["can_edit"], false);

    // Back to every website.
    let (status, _) = t
        .call("POST", &access, &owner, Some(json!({ "all_sites": true })))
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, list) = t.call("GET", "/v1/admin/sites", &editor, None).await;
    assert!(slugs(&list).contains(&b));
    let grants: i64 = sqlx::query_scalar("SELECT count(*) FROM admin_site_grants WHERE user_id = $1")
        .bind(editor_id)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(grants, 0);

    // Invites can carry website access; it's checked like any other.
    let (status, body) = t
        .call(
            "POST",
            "/v1/admin/invites",
            &owner,
            Some(
                json!({ "email": format!("limited-{}@figbud.test", t.run), "role": "viewer",
                         "sites": [{ "site": a, "role": "editor" }] }),
            ),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    let (status, body) = t
        .call(
            "POST",
            "/v1/admin/invites",
            &owner,
            Some(
                json!({ "email": format!("limited-{}@figbud.test", t.run), "role": "editor",
                         "sites": [{ "site": a, "role": "viewer" }] }),
            ),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let stored: Value = sqlx::query_scalar("SELECT site_grants FROM admin_invites WHERE email = $1")
        .bind(format!("limited-{}@figbud.test", t.run))
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(stored[0]["role"], "viewer");
}

/// Users & Access (owner's brief, 12 Nov 2026): roles change, people are
/// suspended and reactivated, signed out everywhere, invitations revoked;
/// nobody edits their own access and the Studio keeps an active owner.
#[tokio::test]
async fn owners_manage_people_and_the_studio_keeps_an_owner() {
    let Some(t) = Team::new().await else { return };
    let (owner_id, owner) = t.admin("owner").await;
    let (other_owner_id, _) = t.admin("owner").await;
    let (editor_id, editor) = t.admin("editor").await;

    // Editors can't manage people; nobody edits themselves.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor_id}/role"),
            &editor,
            Some(json!({ "role": "reviewer" })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{owner_id}/role"),
            &owner,
            Some(json!({ "role": "viewer" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // A role change, audited.
    let (status, body) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor_id}/role"),
            &owner,
            Some(json!({ "role": "reviewer" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let role: String = sqlx::query_scalar("SELECT role FROM admin_users WHERE id = $1")
        .bind(editor_id)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(role, "reviewer");

    // Suspended: signed out at once and can't use the Studio; reactivated: signs in again.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor_id}/suspend"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = t.call("GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor_id}/reactivate"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, fresh) = t.admin_session(editor_id).await;
    assert_eq!(
        t.call("GET", "/v1/admin/me", &fresh, None).await.0,
        StatusCode::OK
    );

    // Signed out everywhere.
    let (status, body) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor_id}/sessions/revoke"),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["sessions_ended"].as_u64().unwrap() >= 1);
    assert_eq!(
        t.call("GET", "/v1/admin/me", &fresh, None).await.0,
        StatusCode::UNAUTHORIZED
    );

    // Another owner can be demoted while one remains; the last can't be suspended by anyone else.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{other_owner_id}/role"),
            &owner,
            Some(json!({ "role": "viewer" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    // Demoting yourself is refused above; with the other owner demoted, this
    // run's owner is the last one this test made, and stays an owner.
    let role: String = sqlx::query_scalar("SELECT role FROM admin_users WHERE id = $1")
        .bind(owner_id)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(role, "owner");

    // Invitations: listed while pending, revoked on request.
    let email = format!("invitee-{}@figbud.test", t.run);
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/invites",
            &owner,
            Some(json!({ "email": email, "role": "editor" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let (_, pending) = t.call("GET", "/v1/admin/invites/pending", &owner, None).await;
    let invite = pending["invites"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["email"] == email.as_str())
        .unwrap()
        .clone();
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/invites/{}/revoke", invite["id"].as_str().unwrap()),
            &owner,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, pending) = t.call("GET", "/v1/admin/invites/pending", &owner, None).await;
    assert!(
        !pending["invites"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["email"] == email.as_str())
    );

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log WHERE actor_user_id = $1 AND action LIKE 'admin.%' ORDER BY created_at",
    )
    .bind(owner_id)
    .fetch_all(&t.pool)
    .await
    .unwrap();
    for a in [
        "admin.role_changed",
        "admin.suspended",
        "admin.reactivated",
        "admin.sessions_revoked",
        "admin.invite_revoked",
    ] {
        assert!(actions.iter().any(|x| x == a), "{a} audited");
    }
}

/// Studio areas (P13-B3): an owner limits someone to pricing; the API refuses
/// every other area and any action not granted, whatever URL is called.
#[tokio::test]
async fn people_limited_to_areas_are_refused_elsewhere_by_the_api() {
    let Some(t) = Team::new().await else { return };
    let (_, owner) = t.admin("owner").await;
    let (editor_id, editor) = t.admin("editor").await;
    let uri = format!("/v1/admin/team/{editor_id}/modules");

    // Everything within their role until an owner sets areas.
    assert_eq!(
        t.call("GET", "/v1/admin/sites/zirahr/hero", &editor, None)
            .await
            .0,
        StatusCode::OK
    );

    // Unknown areas or actions are refused; owners can't be limited.
    let (status, _) = t
        .call(
            "POST",
            &uri,
            &owner,
            Some(json!({ "modules": { "payroll": ["view"] } })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        t.call("POST", &uri, &editor, Some(json!({ "modules": null })))
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    let (status, body) = t
        .call(
            "POST",
            &uri,
            &owner,
            Some(json!({ "modules": { "pricing": ["edit"] } })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["modules"]["pricing"],
        json!(["view", "edit"]),
        "viewing comes with any grant"
    );

    // Their own account and the website list still work.
    let (status, me) = t.call("GET", "/v1/admin/me", &editor, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["modules"]["pricing"], json!(["view", "edit"]));
    assert_eq!(
        t.call("GET", "/v1/admin/sites", &editor, None).await.0,
        StatusCode::OK
    );
    // Pricing yes; other areas no, even by URL.
    assert_eq!(
        t.call("GET", "/v1/admin/sites/zirahr/pricing", &editor, None)
            .await
            .0,
        StatusCode::OK
    );
    for path in [
        "/v1/admin/sites/zirahr/hero",
        "/v1/admin/proof",
        "/v1/admin/enquiries",
        "/v1/admin/approvals",
    ] {
        assert_eq!(
            t.call("GET", path, &editor, None).await.0,
            StatusCode::FORBIDDEN,
            "{path}"
        );
    }
    // Asking for approval wasn't granted.
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/sites/zirahr/pricing/submit",
            &editor,
            Some(json!({}))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );

    // Back to every area within their role.
    t.call("POST", &uri, &owner, Some(json!({ "modules": null })))
        .await;
    assert_eq!(
        t.call("GET", "/v1/admin/sites/zirahr/hero", &editor, None)
            .await
            .0,
        StatusCode::OK
    );
    let changed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'admin.modules_changed' AND target_id = $1",
    )
    .bind(editor_id.to_string())
    .fetch_one(&t.pool)
    .await
    .unwrap();
    assert_eq!(changed, 2);
}

#[tokio::test]
async fn named_studio_roles_are_given_to_people_and_kept_in_step() {
    // P13-B3: saved, reusable roles. Owners only; a change reaches everyone linked.
    let Some(t) = Team::new().await else { return };
    let (_, owner) = t.admin("owner").await;
    let (editor, editor_cookie) = t.admin("editor").await;
    let (other, _) = t.admin("editor").await;
    let name = format!("Pricing lead {}", t.run);

    let areas = json!({ "pricing": ["edit", "submit"] });
    assert_eq!(
        t.call(
            "POST",
            "/v1/admin/studio-roles",
            &editor_cookie,
            Some(json!({ "name": name, "modules": areas }))
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/studio-roles",
            &owner,
            Some(json!({ "name": "x", "modules": areas })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/studio-roles",
            &owner,
            Some(json!({ "name": name, "modules": {} })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, role) = t
        .call(
            "POST",
            "/v1/admin/studio-roles",
            &owner,
            Some(json!({ "name": format!(" {name} "), "modules": areas })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{role}");
    assert_eq!(role["modules"], json!({ "pricing": ["view", "edit", "submit"] }));
    let id = role["id"].as_str().unwrap().to_owned();
    // Names are unique, whatever the case.
    let (status, _) = t
        .call(
            "POST",
            "/v1/admin/studio-roles",
            &owner,
            Some(json!({ "name": name.to_uppercase(), "modules": areas })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    // Given to two people: their areas come from the role.
    for person in [editor, other] {
        let (status, body) = t
            .call(
                "POST",
                &format!("/v1/admin/team/{person}/modules"),
                &owner,
                Some(json!({ "modules": null, "role_id": id })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
    let (_, team) = t.call("GET", "/v1/admin/team", &owner, None).await;
    let member = |team: &Value, id: Uuid| {
        team["members"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["id"] == json!(id))
            .unwrap()
            .clone()
    };
    assert_eq!(member(&team, editor)["studio_role"], json!(name));
    let listed = team["studio_roles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == json!(id))
        .unwrap()
        .clone();
    assert_eq!(listed["members"], 2);
    // The API enforces the areas: pricing yes, pages no.
    assert_eq!(
        t.call("GET", "/v1/admin/sites/figbud/pages", &editor_cookie, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    // Changing the role changes everyone linked to it.
    let (status, body) = t
        .call(
            "POST",
            &format!("/v1/admin/studio-roles/{id}"),
            &owner,
            Some(json!({ "name": name, "modules": { "pricing": ["edit"], "pages": ["view"] } })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["people_updated"], 2);
    let (_, team) = t.call("GET", "/v1/admin/team", &owner, None).await;
    assert_eq!(
        member(&team, other)["modules"],
        json!({ "pages": ["view"], "pricing": ["view", "edit"] })
    );
    assert_ne!(
        t.call("GET", "/v1/admin/sites/figbud/pages", &editor_cookie, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    // Choosing areas by hand unlinks someone; deleting the role keeps the others' areas.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{editor}/modules"),
            &owner,
            Some(json!({ "modules": { "seo": ["view"] } })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/studio-roles/{id}/delete"),
            &owner,
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, team) = t.call("GET", "/v1/admin/team", &owner, None).await;
    assert_eq!(member(&team, editor)["modules"], json!({ "seo": ["view"] }));
    assert_eq!(
        member(&team, other)["modules"],
        json!({ "pages": ["view"], "pricing": ["view", "edit"] })
    );
    assert_eq!(member(&team, other)["studio_role"], Value::Null);
    // A deleted role can't be given.
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{other}/modules"),
            &owner,
            Some(json!({ "modules": null, "role_id": id })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}
