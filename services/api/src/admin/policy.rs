//! The organisation's sign-in policy (P13-B4), set by owners in Users &
//! access: which ways in are on (passkeys, password with two-factor), which
//! roles must use a passkey, and how long an unused session lasts. Every way
//! in is already two-factor (a passkey is the device plus its PIN or
//! biometric; a password always needs an authenticator code), so the
//! per-role choice is the stronger one: passkeys only, which resist phishing.
//!
//! Enforced in three places: before a session starts (`check_sign_in`),
//! for every request when the session is read (`authenticate` joins the
//! policy, so a change applies at once), and when the policy is saved, which
//! is refused if any active owner, or the owner saving it, would be left
//! without a way in. Sessions the new policy no longer allows are ended.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{AdminSession, Role, audit};
use crate::{
    error::{ApiError, FieldError},
    routes::SharedState,
};

pub const PASSKEYS_OFF: &str =
    "Passkey sign-in is turned off for this Studio. Sign in with your password and authenticator code.";
pub const PASSWORDS_OFF: &str = "Password sign-in is turned off for this Studio. Sign in with your passkey.";
pub const PASSKEY_REQUIRED: &str = "Your role signs in with a passkey. Use your passkey to sign in.";

/// Inactivity timeouts an owner can choose, in minutes (`None`: off).
pub const IDLE_CHOICES: [i32; 6] = [15, 30, 60, 120, 480, 1440];

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/sign-in-policy", get(show).post(save))
        .route("/v1/admin/team/{id}/sessions", get(member_sessions))
        .route(
            "/v1/admin/team/{id}/sessions/{session}/revoke",
            post(revoke_member_session),
        )
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow, PartialEq)]
pub struct Policy {
    pub password_sign_in: bool,
    pub passkey_sign_in: bool,
    pub passkey_only_roles: Vec<String>,
    pub idle_minutes: Option<i32>,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            password_sign_in: true,
            passkey_sign_in: true,
            passkey_only_roles: Vec::new(),
            idle_minutes: None,
        }
    }
}

/// How a session was started (`admin_sessions.auth_method`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method {
    Passkey,
    Password,
    /// Accepting an invitation: the first session, whatever the policy, so a
    /// newcomer can set up a way in the policy allows.
    Invite,
}

impl Method {
    pub fn parse(value: &str) -> Self {
        match value {
            "password" => Self::Password,
            "invite" => Self::Invite,
            _ => Self::Passkey,
        }
    }
}

impl Policy {
    /// Whether someone with `role` may use `method`; `Err` says why not.
    pub fn allows(&self, role: &str, method: Method) -> Result<(), &'static str> {
        match method {
            Method::Invite => Ok(()),
            Method::Passkey if !self.passkey_sign_in => Err(PASSKEYS_OFF),
            Method::Passkey => Ok(()),
            Method::Password if !self.password_sign_in => Err(PASSWORDS_OFF),
            Method::Password if self.passkey_only_roles.iter().any(|r| r == role) => Err(PASSKEY_REQUIRED),
            Method::Password => Ok(()),
        }
    }

    /// Whether someone has a way in this policy allows. A password counts
    /// only where password sign-in can work (it needs two-factor, and the
    /// server's secrets key to check the codes).
    pub fn way_in(&self, role: &str, passkeys: i64, password: bool, passwords_work: bool) -> bool {
        (passkeys > 0 && self.allows(role, Method::Passkey).is_ok())
            || (password && passwords_work && self.allows(role, Method::Password).is_ok())
    }

    fn check(&self) -> Result<(), Vec<FieldError>> {
        let mut errors = Vec::new();
        if !self.password_sign_in && !self.passkey_sign_in {
            errors.push(FieldError {
                field: "password_sign_in",
                code: "required",
                message: "Keep at least one way to sign in turned on.",
            });
        }
        if self.passkey_only_roles.iter().any(|r| Role::parse(r).is_none()) {
            errors.push(FieldError {
                field: "passkey_only_roles",
                code: "invalid",
                message: "Choose roles from the list.",
            });
        }
        if self.idle_minutes.is_some_and(|m| !IDLE_CHOICES.contains(&m)) {
            errors.push(FieldError {
                field: "idle_minutes",
                code: "invalid",
                message: "Choose a timeout from the list.",
            });
        }
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }

    /// Roles once each, in the Studio's order, so saved policies compare cleanly.
    fn tidy(mut self) -> Self {
        let order = ["owner", "reviewer", "editor", "viewer"];
        self.passkey_only_roles.retain(|r| order.contains(&r.as_str()));
        self.passkey_only_roles
            .sort_by_key(|r| order.iter().position(|o| o == r));
        self.passkey_only_roles.dedup();
        self
    }
}

pub async fn load(pool: &PgPool) -> Result<Policy, sqlx::Error> {
    Ok(sqlx::query_as(
        "SELECT password_sign_in, passkey_sign_in, passkey_only_roles, idle_minutes FROM admin_sign_in_policy",
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or_default())
}

/// Refuses a sign-in the policy doesn't allow, before any session exists.
pub async fn check_sign_in(pool: &PgPool, user_id: Uuid, method: Method) -> Result<(), ApiError> {
    let role: String = sqlx::query_scalar("SELECT role FROM admin_users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    load(pool)
        .await?
        .allows(&role, method)
        .map_err(ApiError::Unauthorized)
}

#[derive(Serialize, FromRow)]
struct Person {
    id: Uuid,
    name: String,
    email: String,
    role: String,
    passkeys: i64,
    password: bool,
}

async fn people(pool: &PgPool) -> Result<Vec<Person>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, name, email, role,
                (SELECT count(*) FROM admin_passkeys p WHERE p.user_id = u.id) AS passkeys,
                (password_hash IS NOT NULL AND totp_confirmed_at IS NOT NULL) AS password
           FROM admin_users u
          WHERE disabled_at IS NULL
          ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'reviewer' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, name",
    )
    .fetch_all(pool)
    .await
}

fn passwords_work(state: &SharedState) -> bool {
    state
        .config
        .admin
        .as_ref()
        .is_some_and(|a| a.secrets_key.is_some())
}

/// The policy and, for the preview of a change, each active person's ways in.
async fn show(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let updated: Option<(DateTime<Utc>, Option<String>)> = sqlx::query_as(
        "SELECT p.updated_at, u.name FROM admin_sign_in_policy p LEFT JOIN admin_users u ON u.id = p.updated_by",
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(json!({
        "policy": load(&state.pool).await?,
        "people": people(&state.pool).await?,
        "passwords_available": passwords_work(&state),
        "idle_choices": IDLE_CHOICES,
        "updated_at": updated.as_ref().map(|u| u.0),
        "updated_by": updated.and_then(|u| u.1),
    })))
}

async fn save(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<Policy>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    session.require_verified()?;
    input.check().map_err(ApiError::Validation)?;
    let next = input.tidy();
    let works = passwords_work(&state);

    // Never leave an owner without a way in.
    let everyone = people(&state.pool).await?;
    if everyone
        .iter()
        .filter(|p| p.role == "owner")
        .any(|p| !next.way_in(&p.role, p.passkeys, p.password, works))
    {
        return Err(ApiError::Conflict(
            "This would leave an owner without a way to sign in. Each owner needs a way in that stays turned on: a passkey, or a password with two-factor.",
        ));
    }
    // Nor sign out the owner making the change.
    let method: String = sqlx::query_scalar("SELECT auth_method FROM admin_sessions WHERE id = $1")
        .bind(session.session_id)
        .fetch_one(&state.pool)
        .await?;
    if next.allows("owner", Method::parse(&method)).is_err() {
        return Err(ApiError::Conflict(
            "This would end the session you're using now. Sign in with a way in that stays turned on first.",
        ));
    }

    let before = load(&state.pool).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "UPDATE admin_sign_in_policy
            SET password_sign_in = $1, passkey_sign_in = $2, passkey_only_roles = $3,
                idle_minutes = $4, updated_at = now(), updated_by = $5",
    )
    .bind(next.password_sign_in)
    .bind(next.passkey_sign_in)
    .bind(&next.passkey_only_roles)
    .bind(next.idle_minutes)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    // Sessions started a way that's no longer allowed end now (the session
    // check would refuse them anyway; this keeps everyone's lists honest).
    let ended = sqlx::query(
        "UPDATE admin_sessions s SET revoked_at = now()
           FROM admin_users u
          WHERE u.id = s.user_id AND s.revoked_at IS NULL AND s.expires_at > now()
            AND CASE s.auth_method
                  WHEN 'passkey' THEN NOT $1
                  WHEN 'password' THEN NOT $2 OR u.role = ANY($3)
                  ELSE false
                END",
    )
    .bind(next.passkey_sign_in)
    .bind(next.password_sign_in)
    .bind(&next.passkey_only_roles)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    tx.commit().await?;

    let locked_out: Vec<&str> = everyone
        .iter()
        .filter(|p| !next.way_in(&p.role, p.passkeys, p.password, works))
        .map(|p| p.email.as_str())
        .collect();
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.sign_in_policy_changed",
        None,
        json!({
            "from": before,
            "to": next,
            "sessions_ended": ended,
            "without_a_way_in": locked_out.len(),
        }),
        None,
    )
    .await?;
    Ok(Json(json!({
        "policy": next,
        "sessions_ended": ended,
        "without_a_way_in": locked_out,
    })))
}

#[derive(FromRow)]
struct SessionRow {
    id: Uuid,
    user_agent: Option<String>,
    auth_method: String,
    created_at: DateTime<Utc>,
    last_seen_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
}

/// Someone's signed-in devices, for owners (the person sees their own in
/// Security & Authentication).
async fn member_sessions(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM admin_users WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    if !exists {
        return Err(ApiError::NotFound);
    }
    let policy = load(&state.pool).await?;
    let rows: Vec<SessionRow> = sqlx::query_as(
        "SELECT s.id, s.user_agent, s.auth_method, s.created_at, s.last_seen_at, s.expires_at
           FROM admin_sessions s
          WHERE s.user_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
            AND ($2::int IS NULL OR s.last_seen_at > now() - make_interval(mins => $2))
          ORDER BY s.last_seen_at DESC",
    )
    .bind(id)
    .bind(policy.idle_minutes)
    .fetch_all(&state.pool)
    .await?;
    let sessions: Vec<Value> = rows
        .into_iter()
        .map(|s| {
            json!({
                "id": s.id,
                "current": s.id == session.session_id,
                "user_agent": s.user_agent,
                "method": s.auth_method,
                "created_at": s.created_at,
                "last_seen_at": s.last_seen_at,
                "expires_at": s.expires_at,
            })
        })
        .collect();
    Ok(Json(json!({ "sessions": sessions })))
}

/// Ends one of someone's sessions (an owner's own are ended in Security & Authentication).
async fn revoke_member_session(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, session_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    if id == session.user.id {
        return Err(ApiError::Conflict(
            "Your own sessions are in Security & Authentication.",
        ));
    }
    let email: Option<String> = sqlx::query_scalar(
        "UPDATE admin_sessions s SET revoked_at = now()
           FROM admin_users u
          WHERE s.id = $1 AND s.user_id = $2 AND u.id = s.user_id AND s.revoked_at IS NULL
      RETURNING u.email",
    )
    .bind(session_id)
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let email = email.ok_or(ApiError::NotFound)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.session_revoked",
        Some(("session", session_id.to_string())),
        json!({ "email": email }),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_way_in_is_checked_against_the_policy() {
        let open = Policy::default();
        assert!(open.allows("owner", Method::Password).is_ok());
        assert!(open.allows("viewer", Method::Passkey).is_ok());

        let strict = Policy {
            passkey_only_roles: vec!["owner".into(), "reviewer".into()],
            ..Policy::default()
        };
        assert_eq!(strict.allows("owner", Method::Password), Err(PASSKEY_REQUIRED));
        assert!(strict.allows("editor", Method::Password).is_ok());

        let no_passkeys = Policy {
            passkey_sign_in: false,
            ..Policy::default()
        };
        assert_eq!(no_passkeys.allows("editor", Method::Passkey), Err(PASSKEYS_OFF));
        // Accepting an invitation always opens a first session.
        assert!(no_passkeys.allows("editor", Method::Invite).is_ok());
    }

    #[test]
    fn a_password_only_counts_where_password_sign_in_can_work() {
        let p = Policy::default();
        assert!(p.way_in("owner", 1, false, false));
        assert!(!p.way_in("owner", 0, true, false));
        assert!(p.way_in("owner", 0, true, true));
        let no_passkeys = Policy {
            passkey_sign_in: false,
            ..Policy::default()
        };
        assert!(!no_passkeys.way_in("owner", 2, false, true));
    }

    #[test]
    fn a_policy_is_checked_and_tidied_before_saving() {
        let none = Policy {
            password_sign_in: false,
            passkey_sign_in: false,
            ..Policy::default()
        };
        assert!(none.check().is_err());
        let odd = Policy {
            idle_minutes: Some(7),
            ..Policy::default()
        };
        assert!(odd.check().is_err());
        let roles = Policy {
            passkey_only_roles: vec!["viewer".into(), "owner".into(), "viewer".into()],
            ..Policy::default()
        };
        assert_eq!(roles.tidy().passkey_only_roles, ["owner", "viewer"]);
    }
}
