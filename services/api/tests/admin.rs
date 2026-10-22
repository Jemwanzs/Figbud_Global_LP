//! Admin sign-in end to end: real WebAuthn ceremonies (a software passkey
//! plays the browser) against the API and PostgreSQL (`TEST_DATABASE_URL`).

mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use common::{app_with, config, database, json_body, lazy_app};
use figbud_api::admin::{self, Role};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{WebauthnAuthenticator, softpasskey::SoftPasskey};
use webauthn_rs::prelude::{CreationChallengeResponse, RequestChallengeResponse};

const ORIGIN: &str = "http://localhost:3000";

struct Admin {
    app: Router,
    pool: PgPool,
}

impl Admin {
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
        method: &str,
        uri: &str,
        cookie: Option<&str>,
        origin: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Option<String>, Value) {
        let mut req = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            req = req.header(header::COOKIE, cookie);
        }
        if let Some(origin) = origin {
            req = req.header(header::ORIGIN, origin);
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
        let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, cookie, json)
    }

    async fn post(&self, uri: &str, body: Value) -> (StatusCode, Option<String>, Value) {
        self.send("POST", uri, None, Some(ORIGIN), Some(body)).await
    }

    async fn invite(&self, email: &str, role: Role) -> String {
        let admin_config = config("unused").admin.unwrap();
        let (url, _) = admin::create_invite(&self.pool, &admin_config, email, role, None)
            .await
            .unwrap();
        url.split("#token=").nth(1).unwrap().to_owned()
    }

    /// Accepts an invite with a fresh software passkey; returns it and the session cookie.
    async fn register(&self, token: &str, name: &str) -> (WebauthnAuthenticator<SoftPasskey>, String, Value) {
        let (status, _, start) = self
            .post(
                "/v1/admin/invites/accept/start",
                json!({ "token": token, "name": name }),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{start}");
        let options: CreationChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
        let mut passkey = WebauthnAuthenticator::new(SoftPasskey::new(true));
        let credential = passkey
            .do_registration(Url::parse(ORIGIN).unwrap(), options)
            .unwrap();
        let (status, cookie, body) = self
            .post(
                "/v1/admin/invites/accept/finish",
                json!({ "challenge_id": start["challenge_id"], "credential": credential }),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        (passkey, cookie.expect("session cookie"), body)
    }

    async fn login(
        &self,
        passkey: &mut WebauthnAuthenticator<SoftPasskey>,
        email: &str,
    ) -> (StatusCode, Option<String>, Value) {
        let (status, _, start) = self
            .post("/v1/admin/login/start", json!({ "email": email }))
            .await;
        assert_eq!(status, StatusCode::OK, "{start}");
        let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
        let credential = passkey
            .do_authentication(Url::parse(ORIGIN).unwrap(), options)
            .unwrap();
        self.post(
            "/v1/admin/login/finish",
            json!({ "challenge_id": start["challenge_id"], "credential": credential }),
        )
        .await
    }
}

fn unique_email(prefix: &str) -> String {
    format!(
        "{prefix}-{}@figbud.test",
        &Uuid::new_v4().simple().to_string()[..8]
    )
}

#[tokio::test]
async fn invite_passkey_session_login_and_logout() {
    let Some(a) = Admin::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let email = unique_email("owner");
    let token = a.invite(&email, Role::Owner).await;

    let (mut passkey, cookie, body) = a.register(&token, "Ada Owner").await;
    assert_eq!(body["user"]["email"], email.as_str());
    assert_eq!(body["user"]["role"], "owner");
    assert!(cookie.starts_with("figbud_admin="));

    let (status, _, me) = a.send("GET", "/v1/admin/me", Some(&cookie), None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["user"]["name"], "Ada Owner");

    // Invites are single-use.
    let (status, _, _) = a
        .post(
            "/v1/admin/invites/accept/start",
            json!({ "token": token, "name": "Again" }),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Sign in again with the same passkey: a new, independent session.
    let (status, second, _) = a.login(&mut passkey, &email).await;
    assert_eq!(status, StatusCode::OK);
    let second = second.unwrap();
    assert_ne!(second, cookie);

    // Logout requires the admin origin (CSRF), then revokes only that session.
    let (status, _, _) = a
        .send("POST", "/v1/admin/logout", Some(&second), None, None)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _, _) = a
        .send(
            "POST",
            "/v1/admin/logout",
            Some(&second),
            Some("https://evil.example"),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, cleared, _) = a
        .send("POST", "/v1/admin/logout", Some(&second), Some(ORIGIN), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(cleared.as_deref(), Some("figbud_admin="));
    let (status, _, _) = a.send("GET", "/v1/admin/me", Some(&second), None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = a.send("GET", "/v1/admin/me", Some(&cookie), None, None).await;
    assert_eq!(status, StatusCode::OK, "other sessions stay signed in");
}

#[tokio::test]
async fn ceremonies_cannot_be_replayed_or_forged() {
    let Some(a) = Admin::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let email = unique_email("reviewer");
    let token = a.invite(&email, Role::Reviewer).await;
    let (mut passkey, _, _) = a.register(&token, "Rae Reviewer").await;

    let (_, _, start) = a.post("/v1/admin/login/start", json!({ "email": email })).await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let credential = passkey
        .do_authentication(Url::parse(ORIGIN).unwrap(), options)
        .unwrap();
    let finish = json!({ "challenge_id": start["challenge_id"], "credential": credential });
    let (status, _, _) = a.post("/v1/admin/login/finish", finish.clone()).await;
    assert_eq!(status, StatusCode::OK);
    let (status, cookie, _) = a.post("/v1/admin/login/finish", finish).await;
    assert_eq!(
        (status, cookie),
        (StatusCode::UNAUTHORIZED, None),
        "a challenge is single-use"
    );

    // A passkey from a different origin is rejected.
    let (_, _, start) = a.post("/v1/admin/login/start", json!({ "email": email })).await;
    let options: RequestChallengeResponse = serde_json::from_value(start["options"].clone()).unwrap();
    let forged = passkey.do_authentication(Url::parse("https://evil.example").unwrap(), options);
    if let Ok(credential) = forged {
        let (status, _, _) = a
            .post(
                "/v1/admin/login/finish",
                json!({ "challenge_id": start["challenge_id"], "credential": credential }),
            )
            .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    let (status, _, _) = a
        .post(
            "/v1/admin/login/start",
            json!({ "email": unique_email("nobody") }),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = a
        .send(
            "POST",
            "/v1/admin/login/start",
            None,
            None,
            Some(json!({ "email": email })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "ceremonies also require the admin origin"
    );
}

#[tokio::test]
async fn only_owners_invite_and_read_the_audit_log() {
    let Some(a) = Admin::new().await else {
        eprintln!("skipping: TEST_DATABASE_URL not set");
        return;
    };
    let owner_email = unique_email("owner");
    let (_, owner, _) = a
        .register(&a.invite(&owner_email, Role::Owner).await, "Olu Owner")
        .await;
    let (_, editor, _) = a
        .register(
            &a.invite(&unique_email("editor"), Role::Editor).await,
            "Eve Editor",
        )
        .await;

    let new_invite = json!({ "email": unique_email("viewer"), "role": "viewer" });
    let (status, _, _) = a
        .send(
            "POST",
            "/v1/admin/invites",
            Some(&editor),
            Some(ORIGIN),
            Some(new_invite.clone()),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _, created) = a
        .send(
            "POST",
            "/v1/admin/invites",
            Some(&owner),
            Some(ORIGIN),
            Some(new_invite),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(
        created["invite_url"]
            .as_str()
            .unwrap()
            .starts_with("http://localhost:3000/admin/invite#token=")
    );
    let (status, _, _) = a
        .send(
            "POST",
            "/v1/admin/invites",
            Some(&owner),
            Some(ORIGIN),
            Some(json!({ "email": "x@y.z", "role": "root" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _, _) = a.send("GET", "/v1/admin/audit", Some(&editor), None, None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _, log) = a.send("GET", "/v1/admin/audit", Some(&owner), None, None).await;
    assert_eq!(status, StatusCode::OK);
    let mine: Vec<&str> = log
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["actor_email"] == owner_email.as_str())
        .map(|e| e["action"].as_str().unwrap())
        .collect();
    assert!(
        mine.contains(&"admin.user_created") && mine.contains(&"admin.invite_created"),
        "{mine:?}"
    );
}

#[tokio::test]
async fn admin_endpoints_need_a_session_and_vanish_when_disabled() {
    let app = lazy_app();
    let response = app
        .clone()
        .oneshot(Request::get("/v1/admin/me").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers().get(header::CACHE_CONTROL).unwrap(), "no-store");
    let body = json_body(response).await;
    assert_eq!(body["error"]["code"], "unauthorized");

    let mut disabled = config("postgres://nobody:nothing@127.0.0.1:1/none");
    disabled.admin = None;
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://nobody:nothing@127.0.0.1:1/none")
        .unwrap();
    let app = app_with(pool, disabled);
    let response = app
        .oneshot(Request::get("/v1/admin/me").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
