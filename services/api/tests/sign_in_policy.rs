//! The organisation's sign-in policy (P13-B4) against real PostgreSQL
//! (`TEST_DATABASE_URL`). The policy is one row for the whole Studio, so
//! everything that changes it is one test, in a file of its own (test files
//! run one after another), and it puts the defaults back at the end.

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

struct P {
    app: Router,
    pool: PgPool,
    run: String,
}

impl P {
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
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// Someone with the given ways in (a stand-in passkey record, a password with two-factor).
    async fn person(&self, role: &str, passkey: bool, password: bool) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO admin_users (id, email, name, role, password_hash, password_set_at, totp_confirmed_at)
             VALUES ($1, $2, 'Policy Tester', $3, $4, $5, $5)",
        )
        .bind(id)
        .bind(format!("policy-{role}-{}-{}@figbud.test", self.run, &id.simple().to_string()[24..]))
        .bind(role)
        .bind(password.then_some("$argon2id$stand-in"))
        .bind(password.then(chrono::Utc::now))
        .execute(&self.pool)
        .await
        .unwrap();
        if passkey {
            sqlx::query(
                "INSERT INTO admin_passkeys (id, user_id, credential_id, passkey) VALUES ($1, $2, $3, '{}')",
            )
            .bind(Uuid::now_v7())
            .bind(id)
            .bind(Uuid::now_v7().as_bytes().to_vec())
            .execute(&self.pool)
            .await
            .unwrap();
        }
        id
    }

    /// A session started with `method` ("passkey" or "password").
    async fn session(&self, id: Uuid, method: &str) -> String {
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session_via(&self.pool, &admin_config, id, "test", None, method)
            .await
            .unwrap();
        format!("figbud_admin={token}")
    }

    async fn signed_in(&self, cookie: &str) -> bool {
        self.call("GET", "/v1/admin/me", cookie, None).await.0 == StatusCode::OK
    }

    async fn reset(&self) {
        sqlx::query(
            "UPDATE admin_sign_in_policy SET password_sign_in = true, passkey_sign_in = true,
                    passkey_only_roles = '{}', idle_minutes = NULL",
        )
        .execute(&self.pool)
        .await
        .unwrap();
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn owners_set_the_sign_in_policy_and_it_applies_at_once_without_locking_an_owner_out() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let t = P {
        app: app_with(pool.clone(), config(&url)),
        pool,
        run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
    };
    t.reset().await;
    let _restore = Restore(
        t.pool.clone(),
        "UPDATE admin_sign_in_policy SET password_sign_in = true, passkey_sign_in = true,
                passkey_only_roles = '{}', idle_minutes = NULL",
    );
    // Other tests' owners have no ways in at all; set them aside while this runs.
    let parked: Vec<Uuid> = sqlx::query_scalar(
        "UPDATE admin_users SET disabled_at = now() WHERE role = 'owner' AND disabled_at IS NULL RETURNING id",
    )
    .fetch_all(&t.pool)
    .await
    .unwrap();

    let owner = t.person("owner", true, false).await;
    let owner_cookie = t.session(owner, "passkey").await;
    let second_owner = t.person("owner", true, true).await;
    let second_cookie = t.session(second_owner, "password").await;
    let editor = t.person("editor", true, true).await;
    let editor_password = t.session(editor, "password").await;
    let editor_passkey = t.session(editor, "passkey").await;

    // Owners only.
    let (status, body) = t
        .call("GET", "/v1/admin/sign-in-policy", &owner_cookie, None)
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["policy"]["password_sign_in"], true);
    assert_eq!(body["policy"]["idle_minutes"], Value::Null);
    assert!(
        body["people"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["id"] == json!(editor))
    );
    assert_eq!(
        t.call("GET", "/v1/admin/sign-in-policy", &editor_passkey, None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );

    let save = |cookie: &str, policy: Value| {
        let cookie = cookie.to_owned();
        let t = &t;
        async move {
            t.call("POST", "/v1/admin/sign-in-policy", &cookie, Some(policy))
                .await
        }
    };
    let policy = |password: bool, passkey: bool, roles: Value, idle: Value| json!({ "password_sign_in": password, "passkey_sign_in": passkey, "passkey_only_roles": roles, "idle_minutes": idle });

    // Always a way in; only listed timeouts.
    let (status, _) = save(&owner_cookie, policy(false, false, json!([]), Value::Null)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = save(&owner_cookie, policy(true, true, json!([]), json!(7))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    // Passkeys off would leave the first owner (passkey only) with no way in.
    let (status, body) = save(&second_cookie, policy(true, false, json!([]), Value::Null)).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert!(body.to_string().contains("owner without a way"), "{body}");
    // Owners passkey-only would end the session the second owner is using (a password one).
    let (status, body) = save(&second_cookie, policy(true, true, json!(["owner"]), Value::Null)).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert!(body.to_string().contains("session you're using"), "{body}");

    // Editors must use a passkey: their password session ends at once, their passkey one doesn't.
    let (status, body) = save(
        &owner_cookie,
        policy(true, true, json!(["editor", "editor"]), Value::Null),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["policy"]["passkey_only_roles"], json!(["editor"]));
    assert!(body["sessions_ended"].as_u64().unwrap() >= 1);
    assert!(!t.signed_in(&editor_password).await);
    assert!(t.signed_in(&editor_passkey).await);
    // A new password session for them is refused before it starts.
    let refused = admin::policy::check_sign_in(&t.pool, editor, admin::policy::Method::Password).await;
    assert!(refused.is_err());

    // Inactivity: an unused session ends; one in use carries on.
    let (status, _) = save(&owner_cookie, policy(true, true, json!(["editor"]), json!(15))).await;
    assert_eq!(status, StatusCode::OK);
    let idle = t.session(editor, "passkey").await;
    let token = idle.split_once('=').unwrap().1;
    sqlx::query(
        "UPDATE admin_sessions SET last_seen_at = now() - interval '20 minutes' WHERE token_hash = $1",
    )
    .bind(admin::token_hash(token))
    .execute(&t.pool)
    .await
    .unwrap();
    assert!(!t.signed_in(&idle).await);
    assert!(t.signed_in(&owner_cookie).await);

    // Owners see and end anyone's sessions, one at a time.
    let fresh = t.session(editor, "passkey").await;
    let (status, body) = t
        .call(
            "GET",
            &format!("/v1/admin/team/{editor}/sessions"),
            &owner_cookie,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let sessions = body["sessions"].as_array().unwrap();
    assert!(!sessions.is_empty());
    assert!(sessions.iter().all(|s| s["method"] == "passkey"), "{body}");
    for s in sessions {
        let (status, _) = t
            .call(
                "POST",
                &format!(
                    "/v1/admin/team/{editor}/sessions/{}/revoke",
                    s["id"].as_str().unwrap()
                ),
                &owner_cookie,
                Some(json!({})),
            )
            .await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }
    assert!(!t.signed_in(&fresh).await);
    let (status, _) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{owner}/sessions/{}/revoke", Uuid::now_v7()),
            &owner_cookie,
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let other = t.session(owner, "passkey").await;
    assert_eq!(
        t.call("GET", &format!("/v1/admin/team/{owner}/sessions"), &other, None)
            .await
            .0,
        StatusCode::OK
    );
    let viewer = t.person("viewer", false, false).await;
    let viewer_cookie = t.session(viewer, "passkey").await;
    assert_eq!(
        t.call(
            "GET",
            &format!("/v1/admin/team/{owner}/sessions"),
            &viewer_cookie,
            None
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );

    // Nobody becomes an owner without a way in.
    let (status, body) = t
        .call(
            "POST",
            &format!("/v1/admin/team/{viewer}/role"),
            &owner_cookie,
            Some(json!({ "role": "owner" })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    // Passkeys off (the second owner signs in with a password): passkey sign-in stops, and so do passkey sessions.
    let (status, body) = save(&second_cookie, policy(true, false, json!([]), Value::Null)).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}"); // the first owner has only a passkey
    sqlx::query("UPDATE admin_users SET password_hash = '$argon2id$stand-in', password_set_at = now(), totp_confirmed_at = now() WHERE id = $1")
        .bind(owner)
        .execute(&t.pool)
        .await
        .unwrap();
    let (status, body) = save(&second_cookie, policy(true, false, json!([]), Value::Null)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!t.signed_in(&owner_cookie).await);
    assert!(t.signed_in(&second_cookie).await);
    let start = Request::builder()
        .method("POST")
        .uri("/v1/admin/login/start")
        .header(header::ORIGIN, ORIGIN)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "email": "anyone@figbud.test" }).to_string()))
        .unwrap();
    let response = t.app.clone().oneshot(start).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // Every change is audited, with what it was and what it became.
    let changes: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'admin.sign_in_policy_changed' AND actor_user_id IN ($1, $2)",
    )
    .bind(owner)
    .bind(second_owner)
    .fetch_one(&t.pool)
    .await
    .unwrap();
    assert_eq!(changes, 3);

    t.reset().await;
    sqlx::query("UPDATE admin_users SET disabled_at = NULL WHERE id = ANY($1)")
        .bind(&parked)
        .execute(&t.pool)
        .await
        .unwrap();
}
