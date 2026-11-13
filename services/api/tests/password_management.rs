//! Database-driven password management (owner's brief, 13 Nov 2026) against
//! real PostgreSQL (`TEST_DATABASE_URL`): first passwords after a passkey,
//! sign-in with a password where the policy doesn't ask for two-factor,
//! changing it with the current password, resetting a forgotten one with a
//! passkey, invitations accepted with a password, and owner recovery links,
//! none of it needing email. The sign-in policy is one shared row, so this
//! file changes it in one test and puts it back however the test ends.

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
const FIRST: &str = "granite river lantern";
const SECOND: &str = "copper meadow compass";
const THIRD: &str = "silver harbour beacon";

/// Puts the shared policy row back however the test ends.
struct Restore(PgPool);

impl Drop for Restore {
    fn drop(&mut self) {
        let pool = self.0.clone();
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async move {
                let _ = sqlx::query(
                    "UPDATE admin_sign_in_policy SET password_sign_in = true, passkey_sign_in = true,
                            passkey_only_roles = '{}', idle_minutes = NULL,
                            two_factor_roles = '{owner,reviewer,editor,viewer}'",
                )
                .execute(&pool)
                .await;
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
    /// A request; returns the status, a new session cookie if one was set, and the body.
    async fn send(
        &self,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Option<String>, Value) {
        let mut req = Request::builder()
            .method(if body.is_some() { "POST" } else { "GET" })
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
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().split(';').next().unwrap().to_owned())
            .filter(|c| !c.ends_with('='));
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (
            status,
            cookie,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    async fn person(&self, role: &str, name: &str) -> (Uuid, String) {
        let id = Uuid::now_v7();
        let email = format!(
            "pw-{role}-{}-{}@figbud.test",
            self.run,
            &id.simple().to_string()[24..]
        );
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(&email)
            .bind(name)
            .bind(role)
            .execute(&self.pool)
            .await
            .unwrap();
        // A stand-in passkey record: passkeys must survive every password change.
        sqlx::query(
            "INSERT INTO admin_passkeys (id, user_id, credential_id, passkey) VALUES ($1, $2, $3, '{}')",
        )
        .bind(Uuid::now_v7())
        .bind(id)
        .bind(Uuid::now_v7().as_bytes().to_vec())
        .execute(&self.pool)
        .await
        .unwrap();
        (id, email)
    }

    /// A session as if just signed in with `method` (a passkey sign-in counts as a passkey check).
    async fn session(&self, id: Uuid, method: &str) -> String {
        let admin_config = config("unused").admin.unwrap();
        let token = admin::create_session_via(&self.pool, &admin_config, id, "test", None, method)
            .await
            .unwrap();
        format!("figbud_admin={token}")
    }

    async fn signed_in(&self, cookie: &str) -> bool {
        self.send("/v1/admin/me", Some(cookie), None).await.0 == StatusCode::OK
    }

    async fn login(&self, email: &str, password: &str) -> (StatusCode, Option<String>, Value) {
        self.send(
            "/v1/admin/password/login",
            None,
            Some(json!({ "email": email, "password": password })),
        )
        .await
    }

    async fn two_factor_roles(&self, roles: &[&str]) {
        sqlx::query("UPDATE admin_sign_in_policy SET two_factor_roles = $1")
            .bind(roles.iter().map(|r| r.to_string()).collect::<Vec<_>>())
            .execute(&self.pool)
            .await
            .unwrap();
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn passwords_live_in_the_database_and_never_need_email() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let t = T {
        app: app_with(pool.clone(), config(&url)),
        pool: pool.clone(),
        run: Uuid::new_v4().simple().to_string()[..8].to_owned(),
    };
    let _restore = Restore(pool);
    t.two_factor_roles(&["owner", "reviewer", "editor", "viewer"])
        .await;
    let (ada, ada_email) = t.person("editor", "Ada Editor").await;
    let passkey = t.session(ada, "passkey").await;

    // By default every role needs two-factor with a password: it isn't stored without it.
    let (status, _, body) = t
        .send(
            "/v1/admin/security/password",
            Some(&passkey),
            Some(json!({ "password": FIRST })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert!(body.to_string().contains("two-factor first"), "{body}");

    // The owner lets editors use a password alone.
    t.two_factor_roles(&["owner", "reviewer"]).await;
    let (status, _, _) = t
        .send(
            "/v1/admin/security/password",
            Some(&passkey),
            Some(json!({ "password": "short" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _, body) = t
        .send(
            "/v1/admin/security/password",
            Some(&passkey),
            Some(json!({ "password": FIRST })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    let stored: String = sqlx::query_scalar("SELECT password_hash FROM admin_users WHERE id = $1")
        .bind(ada)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert!(stored.starts_with("$argon2id$") && !stored.contains(FIRST));

    // Sign-in: the right password opens a session at once; a wrong one, or an unknown email, the same error.
    let (status, cookie, body) = t.login(&ada_email, FIRST).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["user"]["role"], "editor");
    let password_session = cookie.unwrap();
    assert!(t.signed_in(&password_session).await);
    let (wrong, _, wrong_body) = t.login(&ada_email, "not the password").await;
    let (unknown, _, unknown_body) = t.login("nobody-at-all@figbud.test", FIRST).await;
    assert_eq!(
        (wrong, unknown),
        (StatusCode::UNAUTHORIZED, StatusCode::UNAUTHORIZED)
    );
    assert_eq!(wrong_body, unknown_body);

    // Changing it needs the current password (this session wasn't a passkey check).
    let change = |current: Option<&str>, next: &str| {
        let mut body = json!({ "password": next });
        if let Some(current) = current {
            body["current_password"] = json!(current);
        }
        body
    };
    let (status, _, body) = t
        .send(
            "/v1/admin/security/password",
            Some(&password_session),
            Some(change(None, SECOND)),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["error"]["fields"][0]["field"], "current_password");
    let (status, _, _) = t
        .send(
            "/v1/admin/security/password",
            Some(&password_session),
            Some(change(Some("wrong guess here"), SECOND)),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _, _) = t
        .send(
            "/v1/admin/security/password",
            Some(&password_session),
            Some(change(Some(FIRST), FIRST)),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _, body) = t
        .send(
            "/v1/admin/security/password",
            Some(&password_session),
            Some(change(Some(FIRST), SECOND)),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    // The old password stops working; other sessions end; this one and the passkeys stay.
    assert_eq!(t.login(&ada_email, FIRST).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(t.login(&ada_email, SECOND).await.0, StatusCode::OK);
    assert!(!t.signed_in(&passkey).await);
    assert!(t.signed_in(&password_session).await);
    // Forgotten: a passkey check is enough to set a new one.
    let fresh_passkey = t.session(ada, "passkey").await;
    let (status, _, body) = t
        .send(
            "/v1/admin/security/password",
            Some(&fresh_passkey),
            Some(change(None, THIRD)),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    assert_eq!(t.login(&ada_email, THIRD).await.0, StatusCode::OK);
    let passkeys: i64 = sqlx::query_scalar("SELECT count(*) FROM admin_passkeys WHERE user_id = $1")
        .bind(ada)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(passkeys, 1);

    // If the policy asks for two-factor again, the password alone stops working, sessions included.
    let still = t.login(&ada_email, THIRD).await.1.unwrap();
    t.two_factor_roles(&["editor"]).await;
    let (status, _, body) = t.login(&ada_email, THIRD).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(body.to_string().contains("needs two-factor"), "{body}");
    assert!(!t.signed_in(&still).await);
    t.two_factor_roles(&["owner", "reviewer"]).await;

    // Owners add people; nobody signs up publicly.
    let (owner, _) = t.person("owner", "Olu Owner").await;
    let owner_cookie = t.session(owner, "passkey").await;
    let ivy_email = format!("ivy-{}@figbud.test", t.run);
    let (status, _, invite) = t
        .send(
            "/v1/admin/invites",
            Some(&owner_cookie),
            Some(
                json!({ "email": ivy_email, "role": "editor", "name": "Ivy Invitee",
                         "modules": { "pricing": ["edit"] } }),
            ),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{invite}");
    let token = invite["invite_url"]
        .as_str()
        .unwrap()
        .split("#token=")
        .nth(1)
        .unwrap()
        .to_owned();
    // A weak password doesn't use up the invitation.
    let (status, _, _) = t
        .send(
            "/v1/admin/invites/accept/password",
            None,
            Some(json!({ "token": token, "password": "short" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, cookie, body) = t
        .send(
            "/v1/admin/invites/accept/password",
            None,
            Some(json!({ "token": token, "password": FIRST })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["user"]["name"], "Ivy Invitee");
    assert!(t.signed_in(&cookie.unwrap()).await);
    let (role, modules): (String, Value) =
        sqlx::query_as("SELECT role, modules FROM admin_users WHERE email = $1")
            .bind(&ivy_email)
            .fetch_one(&t.pool)
            .await
            .unwrap();
    assert_eq!(role, "editor");
    assert_eq!(modules, json!({ "pricing": ["view", "edit"] }));
    assert_eq!(t.login(&ivy_email, FIRST).await.0, StatusCode::OK);
    // Single use.
    let (status, _, _) = t
        .send(
            "/v1/admin/invites/accept/password",
            None,
            Some(json!({ "token": token, "password": SECOND })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Recovery without email: an owner's link, inside the Studio. Owners and reviewers need two-factor for it.
    let (reviewer, _) = t.person("reviewer", "Rex Reviewer").await;
    let (status, _, body) = t
        .send(
            &format!("/v1/admin/team/{reviewer}/recovery-link"),
            Some(&owner_cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    let ivy: Uuid = sqlx::query_scalar("SELECT id FROM admin_users WHERE email = $1")
        .bind(&ivy_email)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    let (status, _, link) = t
        .send(
            &format!("/v1/admin/team/{ivy}/recovery-link"),
            Some(&owner_cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{link}");
    assert_eq!(link["hours"], 24.0);
    let reset = link["recovery_url"]
        .as_str()
        .unwrap()
        .split("#token=")
        .nth(1)
        .unwrap()
        .to_owned();
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": reset, "password": SECOND })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(t.login(&ivy_email, SECOND).await.0, StatusCode::OK);
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": reset, "password": THIRD })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // An email address alone resets nothing: the request is accepted the same way and changes no password.
    let before: String = sqlx::query_scalar("SELECT password_hash FROM admin_users WHERE id = $1")
        .bind(ivy)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    let (status, _, _) = t
        .send(
            "/v1/admin/password/forgot",
            None,
            Some(json!({ "email": ivy_email })),
        )
        .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let after: String = sqlx::query_scalar("SELECT password_hash FROM admin_users WHERE id = $1")
        .bind(ivy)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(before, after);

    // Every step is in the security trail.
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT action FROM audit_log WHERE actor_user_id = ANY($1)
            AND action IN ('admin.password_created', 'admin.password_changed', 'admin.password_reset',
                           'admin.recovery_link_created', 'admin.user_created')",
    )
    .bind(vec![ada, ivy, owner])
    .fetch_all(&t.pool)
    .await
    .unwrap();
    assert_eq!(actions.len(), 5, "{actions:?}");
}
