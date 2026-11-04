//! Password sign-in with mandatory two-factor, recovery and account security
//! (P13-A), end to end against the API and PostgreSQL (`TEST_DATABASE_URL`).

mod common;

use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database};
use figbud_api::admin::{self, Role, credentials};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{WebauthnAuthenticator, softpasskey::SoftPasskey};
use webauthn_rs::prelude::{CreationChallengeResponse, RequestChallengeResponse};

const ORIGIN: &str = "http://localhost:3000";
const PASSWORD: &str = "granite river lantern";

struct T {
    app: Router,
    pool: PgPool,
}

/// A code for the current time step, or `step` steps from it.
fn code(secret: &str, step: i64) -> String {
    let raw = base32(secret);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64 / 30;
    credentials::totp_code(&raw, (now + step) as u64)
}

fn base32(secret: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let (mut bits, mut value, mut out) = (0u32, 0u64, Vec::new());
    for c in secret.bytes() {
        value = (value << 5) | ALPHABET.iter().position(|a| *a == c).unwrap() as u64;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((value >> bits) as u8);
            value &= (1 << bits) - 1;
        }
    }
    out
}

fn unique_email(prefix: &str) -> String {
    format!("{prefix}-{}@figbud.test", Uuid::now_v7().simple())
}

impl T {
    async fn new() -> Option<Self> {
        let pool = database().await?;
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        Some(Self {
            app: app_with(pool.clone(), config(&url)),
            pool,
        })
    }

    async fn send(
        &self,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Option<String>, Value) {
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
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .map(|v| v.to_str().unwrap().split(';').next().unwrap().to_owned());
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (
            status,
            cookie,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    /// A new administrator with a passkey and a fresh session.
    async fn passkey_admin(&self, role: Role) -> (WebauthnAuthenticator<SoftPasskey>, String, String) {
        let email = unique_email(role.as_str());
        let admin_config = config("unused").admin.unwrap();
        let (url, _) = admin::create_invite(&self.pool, &admin_config, &email, role, None)
            .await
            .unwrap();
        let token = url.split("#token=").nth(1).unwrap();
        let (_, _, start) = self
            .send(
                "/v1/admin/invites/accept/start",
                None,
                Some(json!({ "token": token, "name": "Asha Test" })),
            )
            .await;
        let options: CreationChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
        let mut passkey = WebauthnAuthenticator::new(SoftPasskey::new(true));
        let credential = passkey
            .do_registration(Url::parse(ORIGIN).unwrap(), options)
            .unwrap();
        let (status, cookie, body) = self
            .send(
                "/v1/admin/invites/accept/finish",
                None,
                Some(json!({ "challenge_id": start["challenge_id"], "credential": credential })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        (passkey, cookie.unwrap(), email)
    }

    /// Sets up two-factor; returns the authenticator's secret and the recovery codes.
    async fn enrol_two_factor(&self, cookie: &str) -> (String, Vec<String>) {
        let (status, _, start) = self
            .send(
                "/v1/admin/security/two-factor/start",
                Some(cookie),
                Some(json!({})),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{start}");
        let secret = start["secret"].as_str().unwrap().to_owned();
        assert_eq!(
            start["qr"]["modules"].as_str().unwrap().len() as u64,
            start["qr"]["size"].as_u64().unwrap().pow(2)
        );
        let (status, _, done) = self
            .send(
                "/v1/admin/security/two-factor/confirm",
                Some(cookie),
                Some(json!({ "code": code(&secret, -1) })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{done}");
        let codes = done["recovery_codes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c.as_str().unwrap().to_owned())
            .collect();
        (secret, codes)
    }

    async fn set_password(&self, cookie: &str, password: &str) -> (StatusCode, Value) {
        let (status, _, body) = self
            .send(
                "/v1/admin/security/password",
                Some(cookie),
                Some(json!({ "password": password })),
            )
            .await;
        (status, body)
    }

    async fn login_password(&self, email: &str, password: &str) -> (StatusCode, Option<String>, Value) {
        self.send(
            "/v1/admin/password/login",
            None,
            Some(json!({ "email": email, "password": password })),
        )
        .await
    }

    async fn verify(&self, pending: &Value, code: Value) -> (StatusCode, Option<String>, Value) {
        let mut body = code;
        body["pending"] = pending.clone();
        self.send("/v1/admin/password/verify", None, Some(body)).await
    }

    async fn security(&self, cookie: &str) -> Value {
        let (status, _, body) = self.send("/v1/admin/security", Some(cookie), None).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        body
    }

    /// Ends the recent identity check, as time passing would.
    async fn expire_check(&self, cookie: &str) {
        let token = cookie.split('=').nth(1).unwrap();
        sqlx::query(
            "UPDATE admin_sessions SET verified_until = now() - interval '1 minute' WHERE token_hash = $1",
        )
        .bind(admin::token_hash(token))
        .execute(&self.pool)
        .await
        .unwrap();
    }

    async fn actions(&self, email: &str) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT a.action FROM audit_log a JOIN admin_users u ON u.id = a.actor_user_id
              WHERE lower(u.email) = lower($1) ORDER BY a.created_at",
        )
        .bind(email)
        .fetch_all(&self.pool)
        .await
        .unwrap()
    }
}

#[tokio::test]
async fn a_passkey_admin_enrols_then_signs_in_from_a_new_device_with_password_and_two_factor() {
    let Some(t) = T::new().await else { return };
    let (mut passkey, cookie, email) = t.passkey_admin(Role::Editor).await;

    // A password can't come first: it would be a single factor.
    let (status, body) = t.set_password(&cookie, PASSWORD).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    let (secret, codes) = t.enrol_two_factor(&cookie).await;
    assert_eq!(codes.len(), 10);
    // Weak passwords are refused with a reason.
    let (status, body) = t.set_password(&cookie, "short").await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    let (status, body) = t.set_password(&cookie, PASSWORD).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let security = t.security(&cookie).await;
    assert_eq!(security["password"]["set"], true);
    assert_eq!(security["two_factor"]["enabled"], true);
    assert_eq!(security["two_factor"]["recovery_codes_left"], 10);
    assert_eq!(security["passkeys"].as_array().unwrap().len(), 1);
    assert!(
        !security.to_string().contains("argon2"),
        "no secrets are ever sent"
    );

    // Stored as a hash and an encrypted secret, never as given.
    let (hash, sealed): (String, Vec<u8>) =
        sqlx::query_as("SELECT password_hash, totp_secret FROM admin_users WHERE lower(email) = lower($1)")
            .bind(&email)
            .fetch_one(&t.pool)
            .await
            .unwrap();
    assert!(hash.starts_with("$argon2id$") && !hash.contains(PASSWORD));
    let raw = base32(&secret);
    assert!(!sealed.windows(raw.len()).any(|w| w == raw));

    // New device: the password alone opens nothing.
    let (status, cookie2, first) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(cookie2, None, "no session before the second factor");
    let pending = &first["two_factor"]["pending"];
    let (status, cookie2, _) = t.verify(pending, json!({ "code": "000000" })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(cookie2, None);
    let (status, cookie2, body) = t.verify(pending, json!({ "code": code(&secret, 0) })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let cookie2 = cookie2.expect("session cookie");
    assert_eq!(body["user"]["email"], email);

    // The same code can't be used twice.
    let (_, _, again) = t.login_password(&email, PASSWORD).await;
    let (status, _, _) = t
        .verify(
            &again["two_factor"]["pending"],
            json!({ "code": code(&secret, 0) }),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "replay refused");

    // A pending sign-in can't be used without its secret part.
    let bare = again["two_factor"]["pending"]
        .as_str()
        .unwrap()
        .split('.')
        .next()
        .unwrap();
    let (status, _, _) = t
        .verify(
            &json!(format!("{bare}.nope")),
            json!({ "code": code(&secret, 1) }),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Sessions are visible, and the second device's sign-in method is recorded.
    let security = t.security(&cookie).await;
    let sessions = security["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions.iter().filter(|s| s["current"] == true).count(), 1);
    assert!(sessions.iter().any(|s| s["method"] == "password"));

    // A recovery code works once.
    let (_, _, third) = t.login_password(&email, PASSWORD).await;
    let lower = codes[0].to_lowercase();
    let (status, cookie3, _) = t
        .verify(&third["two_factor"]["pending"], json!({ "recovery_code": lower }))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(cookie3.is_some());
    let (_, _, fourth) = t.login_password(&email, PASSWORD).await;
    let (status, _, _) = t
        .verify(
            &fourth["two_factor"]["pending"],
            json!({ "recovery_code": codes[0] }),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "single use");
    assert_eq!(t.security(&cookie).await["two_factor"]["recovery_codes_left"], 9);

    // Existing passkey sign-in is untouched.
    let (_, _, start) = t
        .send("/v1/admin/login/start", None, Some(json!({ "email": email })))
        .await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let credential = passkey
        .do_authentication(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let (status, cookie4, body) = t
        .send(
            "/v1/admin/login/finish",
            None,
            Some(json!({ "challenge_id": start["challenge_id"], "credential": credential })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(cookie4.is_some());

    // Roles don't change with the sign-in method.
    let (status, _, _) = t.send("/v1/admin/team", Some(&cookie2), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "still an editor");

    let actions = t.actions(&email).await;
    for action in [
        "admin.two_factor_enabled",
        "admin.password_created",
        "admin.login_failed",
        "admin.login",
    ] {
        assert!(actions.iter().any(|a| a == action), "{action} in {actions:?}");
    }
}

#[tokio::test]
async fn sign_in_errors_never_reveal_whether_an_account_exists() {
    let Some(t) = T::new().await else { return };
    let (_, cookie, email) = t.passkey_admin(Role::Viewer).await;
    let (_passkey_only, _, passkey_email) = t.passkey_admin(Role::Viewer).await;
    t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;

    let (unknown_status, _, unknown) = t.login_password(&unique_email("nobody"), PASSWORD).await;
    let (wrong_status, _, wrong) = t.login_password(&email, "not the right password").await;
    let (passkey_status, _, passkey) = t.login_password(&passkey_email, PASSWORD).await;
    assert_eq!(unknown_status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong_status, StatusCode::UNAUTHORIZED);
    assert_eq!(passkey_status, StatusCode::UNAUTHORIZED);
    assert_eq!(unknown, wrong);
    assert_eq!(unknown, passkey);

    // Recovery answers the same way for anyone.
    let (a, _, a_body) = t
        .send("/v1/admin/password/forgot", None, Some(json!({ "email": email })))
        .await;
    let (b, _, b_body) = t
        .send(
            "/v1/admin/password/forgot",
            None,
            Some(json!({ "email": unique_email("nobody") })),
        )
        .await;
    assert_eq!((a, a_body), (StatusCode::ACCEPTED, Value::Null));
    assert_eq!((b, b_body), (StatusCode::ACCEPTED, Value::Null));
}

#[tokio::test]
async fn repeated_failures_pause_password_sign_in_but_never_passkeys() {
    let Some(t) = T::new().await else { return };
    let (mut passkey, cookie, email) = t.passkey_admin(Role::Viewer).await;
    let (secret, _) = t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;

    for _ in 0..5 {
        let (status, _, _) = t.login_password(&email, "not the right password").await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    // Paused: even the right password gets the same answer, so nothing is learned.
    let (status, _, body) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");
    assert!(
        t.actions(&email)
            .await
            .iter()
            .any(|a| a == "admin.password_locked")
    );

    // A passkey still gets in.
    let (_, _, start) = t
        .send("/v1/admin/login/start", None, Some(json!({ "email": email })))
        .await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let credential = passkey
        .do_authentication(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let (status, _, _) = t
        .send(
            "/v1/admin/login/finish",
            None,
            Some(json!({ "challenge_id": start["challenge_id"], "credential": credential })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // The pause ends on its own.
    sqlx::query("UPDATE admin_users SET password_locked_until = now() - interval '1 minute' WHERE lower(email) = lower($1)")
        .bind(&email)
        .execute(&t.pool)
        .await
        .unwrap();
    let (status, _, first) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::OK);

    // Wrong codes count too, and end the attempt.
    let pending = &first["two_factor"]["pending"];
    for _ in 0..5 {
        let (status, _, _) = t.verify(pending, json!({ "code": "000000" })).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (status, _, _) = t.verify(pending, json!({ "code": code(&secret, 0) })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "attempt ended by the pause");
}

#[tokio::test]
async fn recovery_links_are_single_use_expire_and_never_bypass_two_factor() {
    let Some(t) = T::new().await else { return };
    let (_owner_key, owner, _) = t.passkey_admin(Role::Owner).await;
    let (_, cookie, email) = t.passkey_admin(Role::Editor).await;
    let (_, passkey_cookie, passkey_email) = t.passkey_admin(Role::Viewer).await;
    let id_of = |email: String| {
        let pool = t.pool.clone();
        async move {
            let id: Uuid = sqlx::query_scalar("SELECT id FROM admin_users WHERE lower(email) = lower($1)")
                .bind(email)
                .fetch_one(&pool)
                .await
                .unwrap();
            id
        }
    };
    let id = id_of(email.clone()).await;

    // Accounts without two-factor can't be recovered by a link: it would set up a way in.
    let passkey_id = id_of(passkey_email).await;
    let (status, _, body) = t
        .send(
            &format!("/v1/admin/team/{passkey_id}/recovery-link"),
            Some(&owner),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    let (secret, _) = t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;

    // Only owners create links.
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/team/{id}/recovery-link"),
            Some(&passkey_cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _, link) = t
        .send(
            &format!("/v1/admin/team/{id}/recovery-link"),
            Some(&owner),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{link}");
    let url = link["recovery_url"].as_str().unwrap();
    assert!(url.contains("/admin/reset-password#token="));
    let token = url.split("#token=").nth(1).unwrap();

    // A weak password doesn't use up the link.
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": token, "password": "short" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let new_password = "copper meadow compass";
    let (status, _, body) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": token, "password": new_password })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    // Single use.
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": token, "password": "another fine passphrase" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Existing sessions end; the old password stops working; two-factor is still required.
    let (status, _, _) = t.send("/v1/admin/me", Some(&cookie), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, no_session, first) = t.login_password(&email, new_password).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(no_session, None, "the link doesn't skip two-factor");
    let (status, session, _) = t
        .verify(
            &first["two_factor"]["pending"],
            json!({ "code": code(&secret, 0) }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(session.is_some());

    // Links expire, and a new one replaces the last.
    let (_, _, link) = t
        .send(
            &format!("/v1/admin/team/{id}/recovery-link"),
            Some(&owner),
            Some(json!({})),
        )
        .await;
    let old = link["recovery_url"]
        .as_str()
        .unwrap()
        .split("#token=")
        .nth(1)
        .unwrap()
        .to_owned();
    let (_, _, link) = t
        .send(
            &format!("/v1/admin/team/{id}/recovery-link"),
            Some(&owner),
            Some(json!({})),
        )
        .await;
    let current = link["recovery_url"]
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
            Some(json!({ "token": old, "password": "another fine passphrase" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "replaced");
    sqlx::query(
        "UPDATE admin_password_resets SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
    )
    .bind(admin::token_hash(&current))
    .execute(&t.pool)
    .await
    .unwrap();
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": current, "password": "another fine passphrase" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "expired");
}

#[tokio::test]
async fn sensitive_changes_need_a_recent_identity_check_and_only_touch_your_own_account() {
    let Some(t) = T::new().await else { return };
    let (mut passkey, cookie, email) = t.passkey_admin(Role::Reviewer).await;
    let (_, other_cookie, _) = t.passkey_admin(Role::Reviewer).await;

    // Stale session: nothing sensitive until identity is confirmed.
    t.expire_check(&cookie).await;
    assert_eq!(t.security(&cookie).await["verified"], false);
    for path in [
        "two-factor/start",
        "password",
        "passkeys/start",
        "recovery-codes",
        "two-factor/remove",
        "password/remove",
    ] {
        let (status, _, body) = t
            .send(
                &format!("/v1/admin/security/{path}"),
                Some(&cookie),
                Some(json!({ "password": PASSWORD })),
            )
            .await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{path}: {body}");
    }

    // A passkey confirms it, and a check started by one person can't vouch for another.
    let (_, _, start) = t
        .send(
            "/v1/admin/security/verify/passkey/start",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let credential = passkey
        .do_authentication(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let (status, _, _) = t
        .send(
            "/v1/admin/security/verify/passkey/finish",
            Some(&other_cookie),
            Some(json!({ "challenge_id": start["challenge_id"], "credential": credential })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (_, _, start) = t
        .send(
            "/v1/admin/security/verify/passkey/start",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let credential = passkey
        .do_authentication(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let (status, _, body) = t
        .send(
            "/v1/admin/security/verify/passkey/finish",
            Some(&cookie),
            Some(json!({ "challenge_id": start["challenge_id"], "credential": credential })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    assert_eq!(t.security(&cookie).await["verified"], true);

    // Add a second passkey from settings.
    let (status, _, start) = t
        .send(
            "/v1/admin/security/passkeys/start",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{start}");
    let options: CreationChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let mut second = WebauthnAuthenticator::new(SoftPasskey::new(true));
    let credential = second
        .do_registration(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let (status, _, body) = t
        .send(
            "/v1/admin/security/passkeys/finish",
            Some(&cookie),
            Some(json!({ "challenge_id": start["challenge_id"], "credential": credential, "label": "Work phone" })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    let security = t.security(&cookie).await;
    let keys = security["passkeys"].as_array().unwrap();
    assert_eq!(keys.len(), 2);
    assert!(keys.iter().any(|k| k["label"] == "Work phone"));

    // Other people's passkeys don't exist for you (given another way in, so the
    // last-passkey protection isn't what answers).
    let id = keys[1]["id"].as_str().unwrap();
    t.enrol_two_factor(&other_cookie).await;
    t.set_password(&other_cookie, PASSWORD).await;
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/passkeys/{id}/remove"),
            Some(&other_cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/passkeys/{id}/remove"),
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // The last way in can't be removed.
    let id = t.security(&cookie).await["passkeys"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/passkeys/{id}/remove"),
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Two-factor can't go while a password depends on it; a password can't be the last way in.
    let (secret, _) = t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;
    let (status, _, _) = t
        .send(
            "/v1/admin/security/two-factor/remove",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // Password and two-factor also confirm identity (for devices without a passkey).
    t.expire_check(&cookie).await;
    let (status, _, _) = t
        .send(
            "/v1/admin/security/verify/password",
            Some(&cookie),
            Some(json!({ "password": "not the right password", "code": code(&secret, 0) })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, body) = t
        .send(
            "/v1/admin/security/verify/password",
            Some(&cookie),
            Some(json!({ "password": PASSWORD, "code": code(&secret, 1) })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    // Removing the password, then two-factor, returns to passkey only.
    let (status, _, _) = t
        .send(
            "/v1/admin/security/password/remove",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, _) = t
        .send(
            "/v1/admin/security/two-factor/remove",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, _) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn sessions_can_be_revoked_and_changing_the_password_ends_the_others() {
    let Some(t) = T::new().await else { return };
    let (_, cookie, email) = t.passkey_admin(Role::Viewer).await;
    let (_, other, _) = t.passkey_admin(Role::Viewer).await;
    let (secret, _) = t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;

    let sign_in = |step: i64| {
        let email = email.clone();
        let secret = secret.clone();
        let t = &t;
        async move {
            let (_, _, first) = t.login_password(&email, PASSWORD).await;
            let (status, cookie, body) = t
                .verify(
                    &first["two_factor"]["pending"],
                    json!({ "code": code(&secret, step) }),
                )
                .await;
            assert_eq!(status, StatusCode::OK, "{body}");
            cookie.unwrap()
        }
    };
    let phone = sign_in(0).await;

    let security = t.security(&cookie).await;
    let sessions = security["sessions"].as_array().unwrap();
    let current = sessions.iter().find(|s| s["current"] == true).unwrap()["id"]
        .as_str()
        .unwrap();
    let other_id = sessions.iter().find(|s| s["current"] == false).unwrap()["id"]
        .as_str()
        .unwrap();

    // Your own session ends by signing out; someone else's isn't yours to end.
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/sessions/{current}/revoke"),
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/sessions/{other_id}/revoke"),
            Some(&other),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _, _) = t
        .send(
            &format!("/v1/admin/security/sessions/{other_id}/revoke"),
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, _) = t.send("/v1/admin/me", Some(&phone), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "revoked at once");
    assert!(
        t.actions(&email)
            .await
            .iter()
            .any(|a| a == "admin.session_revoked")
    );

    // Changing the password signs out everywhere else, keeping this session.
    let tablet = sign_in(1).await;
    let (status, _) = t.set_password(&cookie, "copper meadow compass").await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _, _) = t.send("/v1/admin/me", Some(&tablet), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = t.send("/v1/admin/me", Some(&cookie), None).await;
    assert_eq!(status, StatusCode::OK);
}

/// The text of a queued email, once the background task has written it.
async fn queued_email(pool: &PgPool, email: &str, template: &str) -> String {
    for _ in 0..100 {
        let row: Option<String> = sqlx::query_scalar(
            "SELECT text_body FROM email_outbox WHERE $1 = ANY(to_addresses) AND template = $2
              ORDER BY created_at DESC LIMIT 1",
        )
        .bind(email)
        .bind(template)
        .fetch_optional(pool)
        .await
        .unwrap();
        if let Some(row) = row {
            return row;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("no {template} email queued for {email}");
}

#[tokio::test]
async fn forgot_password_emails_a_link_only_to_accounts_with_two_factor() {
    let Some(t) = T::new().await else { return };
    let (_, cookie, email) = t.passkey_admin(Role::Viewer).await;
    let (secret, _) = t.enrol_two_factor(&cookie).await;
    t.set_password(&cookie, PASSWORD).await;
    let (_, _, passkey_email) = t.passkey_admin(Role::Viewer).await;

    let (status, _, _) = t
        .send("/v1/admin/password/forgot", None, Some(json!({ "email": email })))
        .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let body = queued_email(&t.pool, &email, "admin_password_recovery").await;
    let token = body
        .split("#token=")
        .nth(1)
        .unwrap()
        .split_whitespace()
        .next()
        .unwrap();

    // Asking again straight away sends nothing more, and the link still works.
    t.send("/v1/admin/password/forgot", None, Some(json!({ "email": email })))
        .await;
    let new_password = "copper meadow compass";
    let (status, _, _) = t
        .send(
            "/v1/admin/password/reset",
            None,
            Some(json!({ "token": token, "password": new_password })),
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    // They're told it changed.
    queued_email(&t.pool, &email, "admin_password_changed").await;
    let (_, _, first) = t.login_password(&email, new_password).await;
    let (status, _, _) = t
        .verify(
            &first["two_factor"]["pending"],
            json!({ "code": code(&secret, 0) }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Email alone can't set up a way in to a passkey-only account: no link is sent.
    t.send(
        "/v1/admin/password/forgot",
        None,
        Some(json!({ "email": passkey_email })),
    )
    .await;
    let body = queued_email(&t.pool, &passkey_email, "admin_password_needs_passkey").await;
    assert!(!body.contains("#token="));
}

#[tokio::test]
async fn without_the_secrets_key_the_studio_stays_passkey_only() {
    let Some(pool) = database().await else { return };
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let mut no_key = config(&url);
    no_key.admin.as_mut().unwrap().secrets_key = None;
    let t = T {
        app: app_with(pool.clone(), no_key),
        pool,
    };
    // Passkey sign-up and sessions work as usual.
    let (_, cookie, email) = t.passkey_admin(Role::Viewer).await;
    assert_eq!(t.security(&cookie).await["available"], false);
    // Two-factor can't start, so a password can't be created either.
    let (status, _, body) = t
        .send(
            "/v1/admin/security/two-factor/start",
            Some(&cookie),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    let (status, _) = t.set_password(&cookie, PASSWORD).await;
    assert_eq!(status, StatusCode::CONFLICT);
    // Password sign-in simply doesn't work, with the usual message.
    let (status, cookie2, _) = t.login_password(&email, PASSWORD).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(cookie2, None);
}
