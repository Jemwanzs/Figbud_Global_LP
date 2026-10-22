//! Admin access: invited users sign in with passkeys (WebAuthn) and receive a
//! server-side session. No passwords exist anywhere.
//!
//! - Invites carry a single-use token (stored hashed); the first owner is
//!   invited from the command line (`figbud-api admin invite`).
//! - Sessions are random tokens, stored hashed, sent as an HttpOnly,
//!   SameSite=Strict cookie. State-changing requests must also carry the admin
//!   origin in `Origin` (CSRF defence in depth).
//! - Every security-relevant action is written to `audit_log`.

mod handlers;

use std::{net::IpAddr, time::Duration};

use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, HeaderValue, Method, header, request::Parts},
};
use chrono::{DateTime, Utc};
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use webauthn_rs::{Webauthn, WebauthnBuilder};

pub use handlers::router;

use crate::{config::AdminConfig, error::ApiError, routes::SharedState};

/// `__Host-` binds the cookie to the exact origin over HTTPS; plain HTTP
/// development (localhost) cannot use the prefix.
const COOKIE_SECURE: &str = "__Host-figbud_admin";
const COOKIE_DEV: &str = "figbud_admin";
pub const INVITE_TTL: Duration = Duration::from_secs(7 * 24 * 3600);
/// WebAuthn ceremonies must finish within this window.
const CHALLENGE_TTL_SECS: i64 = 300;

pub fn relying_party(config: &AdminConfig) -> Result<Webauthn, String> {
    WebauthnBuilder::new(&config.rp_id, &config.origin)
        .and_then(|b| b.rp_name("FigBud Global Admin").build())
        .map_err(|e| format!("invalid admin WebAuthn configuration: {e}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Viewer,
    Editor,
    Reviewer,
    Owner,
}

impl Role {
    pub fn parse(raw: &str) -> Option<Self> {
        Some(match raw {
            "viewer" => Self::Viewer,
            "editor" => Self::Editor,
            "reviewer" => Self::Reviewer,
            "owner" => Self::Owner,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Reviewer => "reviewer",
            Self::Owner => "owner",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AdminUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: Role,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<DateTime<Utc>>,
}

/// An authenticated admin request. Extracting it enforces a live session and,
/// for state-changing methods, the admin origin.
#[derive(Debug, Clone)]
pub struct AdminSession {
    pub user: AdminUser,
    pub session_id: Uuid,
}

impl AdminSession {
    /// Roles are ordered: owner > reviewer > editor > viewer.
    pub fn require(&self, role: Role) -> Result<(), ApiError> {
        if self.user.role >= role {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }
}

impl FromRequestParts<SharedState> for AdminSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &SharedState) -> Result<Self, ApiError> {
        let admin = state.config.admin.as_ref().ok_or(ApiError::NotFound)?;
        check_origin(&parts.method, &parts.headers, admin)?;
        let token = session_cookie(&parts.headers).ok_or(ApiError::Unauthorized("Please sign in."))?;
        authenticate(&state.pool, &token)
            .await?
            .ok_or(ApiError::Unauthorized(
                "Your session has ended. Please sign in again.",
            ))
    }
}

/// Rejects cross-site state changes: the browser's `Origin` must be the admin
/// origin. SameSite=Strict cookies already block most CSRF; this is the
/// second, independent check.
pub fn check_origin(method: &Method, headers: &HeaderMap, admin: &AdminConfig) -> Result<(), ApiError> {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(());
    }
    let expected = admin.origin.as_str().trim_end_matches('/');
    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(origin) if origin == expected => Ok(()),
        _ => Err(ApiError::Forbidden),
    }
}

/// 32 random bytes, hex encoded: the secret handed to the browser or invitee.
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

fn cookie_name(admin: &AdminConfig) -> &'static str {
    if admin.origin.scheme() == "https" {
        COOKIE_SECURE
    } else {
        COOKIE_DEV
    }
}

fn session_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(name, _)| *name == COOKIE_SECURE || *name == COOKIE_DEV)
        .map(|(_, value)| value.to_owned())
        .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// `Set-Cookie` for a new session (or, with `None`, one that clears it).
pub fn set_cookie(admin: &AdminConfig, token: Option<&str>) -> HeaderValue {
    let name = cookie_name(admin);
    let secure = if admin.origin.scheme() == "https" {
        "; Secure"
    } else {
        ""
    };
    let value = match token {
        Some(token) => format!(
            "{name}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}{secure}",
            admin.session_ttl.as_secs()
        ),
        None => format!("{name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{secure}"),
    };
    HeaderValue::from_str(&value).expect("cookie value is ASCII")
}

pub async fn create_session(
    pool: &PgPool,
    admin: &AdminConfig,
    user_id: Uuid,
    ip_hash: &str,
    user_agent: Option<&str>,
) -> Result<String, sqlx::Error> {
    let token = new_token();
    sqlx::query(
        "INSERT INTO admin_sessions (id, token_hash, user_id, ip_hash, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))",
    )
    .bind(Uuid::now_v7())
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(ip_hash)
    .bind(user_agent.map(|ua| ua.chars().take(300).collect::<String>()))
    .bind(admin.session_ttl.as_secs_f64())
    .execute(pool)
    .await?;
    sqlx::query("UPDATE admin_users SET last_login_at = now() WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(token)
}

#[derive(FromRow)]
struct SessionRow {
    session_id: Uuid,
    id: Uuid,
    email: String,
    name: String,
    role: String,
    last_login_at: Option<DateTime<Utc>>,
}

/// The live session for a token: not revoked, not expired, user enabled.
pub async fn authenticate(pool: &PgPool, token: &str) -> Result<Option<AdminSession>, sqlx::Error> {
    let row: Option<SessionRow> = sqlx::query_as(
        "UPDATE admin_sessions s SET last_seen_at = now()
           FROM admin_users u
          WHERE s.token_hash = $1 AND u.id = s.user_id
            AND s.revoked_at IS NULL AND s.expires_at > now() AND u.disabled_at IS NULL
      RETURNING s.id AS session_id, u.id, u.email, u.name, u.role, u.last_login_at",
    )
    .bind(token_hash(token))
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|r| {
        Some(AdminSession {
            session_id: r.session_id,
            user: AdminUser {
                id: r.id,
                email: r.email,
                name: r.name,
                role: Role::parse(&r.role)?,
                last_login_at: r.last_login_at,
            },
        })
    }))
}

pub async fn audit(
    pool: &PgPool,
    actor: Option<Uuid>,
    action: &str,
    target: Option<(&str, String)>,
    detail: serde_json::Value,
    ip_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    let (target_type, target_id) = target.map_or((None, None), |(t, id)| (Some(t), Some(id)));
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::now_v7())
    .bind(actor)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(detail)
    .bind(ip_hash)
    .execute(pool)
    .await?;
    Ok(())
}

/// Creates an invite and returns the link to send (token in the URL fragment,
/// so it never reaches server logs or `Referer` headers).
pub async fn create_invite(
    pool: &PgPool,
    admin: &AdminConfig,
    email: &str,
    role: Role,
    created_by: Option<Uuid>,
) -> Result<(String, DateTime<Utc>), sqlx::Error> {
    let token = new_token();
    let id = Uuid::now_v7();
    let expires_at: DateTime<Utc> = sqlx::query_scalar(
        "INSERT INTO admin_invites (id, token_hash, email, role, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
      RETURNING expires_at",
    )
    .bind(id)
    .bind(token_hash(&token))
    .bind(email.trim().to_lowercase())
    .bind(role.as_str())
    .bind(created_by)
    .bind(INVITE_TTL.as_secs_f64())
    .fetch_one(pool)
    .await?;
    audit(
        pool,
        created_by,
        "admin.invite_created",
        Some(("invite", id.to_string())),
        serde_json::json!({ "email": email.trim().to_lowercase(), "role": role.as_str() }),
        None,
    )
    .await?;
    let origin = admin.origin.as_str().trim_end_matches('/');
    Ok((format!("{origin}/admin/invite#token={token}"), expires_at))
}

pub fn client_meta(state: &SharedState, headers: &HeaderMap, ip: IpAddr) -> (String, Option<String>) {
    let ip_hash = crate::rate_limit::ip_hash(&state.config.ip_hash_salt, ip);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    (ip_hash, user_agent)
}

pub fn challenge_ttl_secs() -> i64 {
    CHALLENGE_TTL_SECS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admin(origin: &str) -> AdminConfig {
        AdminConfig {
            origin: origin.parse().unwrap(),
            rp_id: "localhost".into(),
            session_ttl: Duration::from_secs(3600),
        }
    }

    #[test]
    fn roles_are_ordered_by_privilege() {
        assert!(Role::Owner > Role::Reviewer && Role::Reviewer > Role::Editor && Role::Editor > Role::Viewer);
        assert_eq!(Role::parse("reviewer"), Some(Role::Reviewer));
        assert_eq!(Role::parse("admin"), None);
    }

    #[test]
    fn state_changes_require_the_admin_origin() {
        let config = admin("https://figbudglobal.com");
        let mut headers = HeaderMap::new();
        assert!(check_origin(&Method::GET, &headers, &config).is_ok());
        assert!(check_origin(&Method::POST, &headers, &config).is_err());
        headers.insert(header::ORIGIN, HeaderValue::from_static("https://evil.example"));
        assert!(check_origin(&Method::POST, &headers, &config).is_err());
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://figbudglobal.com"),
        );
        assert!(check_origin(&Method::POST, &headers, &config).is_ok());
    }

    #[test]
    fn cookies_are_strict_and_secure_over_https() {
        let prod = set_cookie(&admin("https://figbudglobal.com"), Some("ab"));
        let prod = prod.to_str().unwrap();
        assert!(prod.starts_with("__Host-figbud_admin=ab;"));
        assert!(prod.contains("HttpOnly") && prod.contains("SameSite=Strict") && prod.contains("Secure"));
        let dev = set_cookie(&admin("http://localhost:3000"), None);
        assert_eq!(
            dev.to_str().unwrap(),
            "figbud_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
        );
    }

    #[test]
    fn only_well_formed_session_tokens_are_read() {
        let token = new_token();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_str(&format!("a=1; figbud_admin={token}")).unwrap(),
        );
        assert_eq!(session_cookie(&headers).as_deref(), Some(token.as_str()));
        headers.insert(header::COOKIE, HeaderValue::from_static("figbud_admin=../../etc"));
        assert_eq!(session_cookie(&headers), None);
        assert_eq!(token_hash(&token).len(), 32);
    }
}
