//! Password sign-in with mandatory two-factor, password recovery and each
//! administrator's Security & Authentication settings (P13-A). Passkeys keep
//! working exactly as before and are never affected by a password lockout.
//!
//! - A password can only exist alongside confirmed two-factor (also a database
//!   constraint), so a password alone never opens a session.
//! - Sign-in errors are the same whether or not the account exists.
//! - Sensitive changes need a recent identity check ([`AdminSession::verified`]):
//!   a fresh sign-in, a passkey, or password plus two-factor.
//! - A recovery link changes only the password. Two-factor is still required
//!   afterwards, and accounts without two-factor can't be recovered by link.

use std::{
    net::SocketAddr,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use webauthn_rs::prelude::{
    PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential, RegisterPublicKeyCredential,
};

use super::{
    AdminSession, Role, audit, credentials as cred,
    handlers::{consume_challenge, passkeys, public, signed_in, store_challenge, update_passkey},
    new_token, passkeys_of, token_hash,
};
use crate::{
    config::{AdminConfig, EmailMode},
    email::{outbox, templates},
    error::{ApiError, FieldError},
    routes::SharedState,
};

/// Failed passwords or codes before password sign-in pauses for an account.
const MAX_FAILURES: i32 = 5;
const LOCK_MINUTES: f64 = 15.0;
const RESET_LINK_MINUTES: f64 = 60.0;
const OWNER_LINK_HOURS: f64 = 24.0;
/// How long an identity check lasts for sensitive changes.
const VERIFIED_MINUTES: f64 = 10.0;
const ISSUER: &str = "FigBud Studio";

const BAD_LOGIN: &str = "That email and password didn't work. After several attempts, password sign-in pauses for 15 minutes. You can also use a passkey or reset your password.";
const BAD_CODE: &str = "That code didn't work. Check your authenticator app and try again.";
const BAD_RESET: &str = "This recovery link is invalid, used or expired. Please ask for a new one.";

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/password/login", post(password_login))
        .route("/v1/admin/password/verify", post(password_verify))
        .route("/v1/admin/password/forgot", post(forgot))
        .route("/v1/admin/password/reset", post(reset))
        .route("/v1/admin/security", get(overview))
        .route("/v1/admin/security/verify/password", post(verify_with_password))
        .route(
            "/v1/admin/security/verify/passkey/start",
            post(verify_passkey_start),
        )
        .route(
            "/v1/admin/security/verify/passkey/finish",
            post(verify_passkey_finish),
        )
        .route("/v1/admin/security/two-factor/start", post(two_factor_start))
        .route("/v1/admin/security/two-factor/confirm", post(two_factor_confirm))
        .route("/v1/admin/security/two-factor/remove", post(two_factor_remove))
        .route("/v1/admin/security/recovery-codes", post(recovery_codes))
        .route("/v1/admin/security/password", post(set_password))
        .route("/v1/admin/security/password/remove", post(remove_password))
        .route("/v1/admin/security/passkeys/start", post(add_passkey_start))
        .route("/v1/admin/security/passkeys/finish", post(add_passkey_finish))
        .route("/v1/admin/security/passkeys/{id}/remove", post(remove_passkey))
        .route("/v1/admin/security/sessions/{id}/revoke", post(revoke_session))
        .route("/v1/admin/security/sessions/revoke-others", post(revoke_others))
        .route("/v1/admin/team/{id}/recovery-link", post(owner_recovery_link))
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn secrets_key(admin: &AdminConfig) -> Result<&[u8; 32], ApiError> {
    admin.secrets_key.as_ref().map(|k| &k.0).ok_or(ApiError::Conflict(
        "Two-factor isn't available on this server yet (ADMIN_SECRETS_KEY isn't set).",
    ))
}

fn admin_config(state: &SharedState) -> Result<&AdminConfig, ApiError> {
    state.config.admin.as_ref().ok_or(ApiError::NotFound)
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> ApiError {
    ApiError::Validation(vec![FieldError { field, code, message }])
}

/// Hashing is deliberately slow, so it runs off the async threads.
async fn verify_blocking(stored: Option<String>, password: String) -> Result<bool, ApiError> {
    tokio::task::spawn_blocking(move || cred::verify_password(stored.as_deref(), &password))
        .await
        .map_err(|e| ApiError::Internal(format!("password check: {e}")))
}

async fn hash_blocking(password: String) -> Result<String, ApiError> {
    tokio::task::spawn_blocking(move || cred::hash_password(&password))
        .await
        .map_err(|e| ApiError::Internal(format!("password hash: {e}")))?
        .map_err(ApiError::Internal)
}

#[derive(FromRow)]
struct Credentials {
    id: Uuid,
    email: String,
    name: String,
    password_hash: Option<String>,
    locked: bool,
    disabled: bool,
    totp_secret: Option<Vec<u8>>,
    totp_last_step: Option<i64>,
    has_two_factor: bool,
}

macro_rules! credentials_where {
    ($condition:literal) => {
        concat!(
            "SELECT id, email, name, password_hash,
                    COALESCE(password_locked_until > now(), false) AS locked,
                    disabled_at IS NOT NULL AS disabled,
                    totp_secret, totp_last_step, totp_confirmed_at IS NOT NULL AS has_two_factor
               FROM admin_users WHERE ",
            $condition
        )
    };
}

async fn credentials_by_email(pool: &PgPool, email: &str) -> Result<Option<Credentials>, sqlx::Error> {
    sqlx::query_as(credentials_where!("lower(email) = lower($1)"))
        .bind(email.trim())
        .fetch_optional(pool)
        .await
}

async fn credentials_by_id(pool: &PgPool, id: Uuid) -> Result<Credentials, sqlx::Error> {
    sqlx::query_as(credentials_where!("id = $1"))
        .bind(id)
        .fetch_one(pool)
        .await
}

/// Counts a failed password or code; repeated failures pause password sign-in.
async fn record_failure(
    pool: &PgPool,
    user_id: Uuid,
    ip_hash: &str,
    method: &str,
) -> Result<(), sqlx::Error> {
    let attempts: i32 = sqlx::query_scalar(
        "UPDATE admin_users SET password_failed_attempts = password_failed_attempts + 1
          WHERE id = $1 RETURNING password_failed_attempts",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    audit(
        pool,
        Some(user_id),
        "admin.login_failed",
        None,
        json!({ "method": method }),
        Some(ip_hash),
    )
    .await?;
    if attempts >= MAX_FAILURES {
        sqlx::query(
            "UPDATE admin_users SET password_failed_attempts = 0,
                    password_locked_until = now() + make_interval(mins => $2)
              WHERE id = $1",
        )
        .bind(user_id)
        .bind(LOCK_MINUTES as i32)
        .execute(pool)
        .await?;
        sqlx::query("DELETE FROM admin_challenges WHERE user_id = $1 AND kind = 'password_2fa'")
            .bind(user_id)
            .execute(pool)
            .await?;
        audit(
            pool,
            Some(user_id),
            "admin.password_locked",
            None,
            json!({ "minutes": LOCK_MINUTES }),
            Some(ip_hash),
        )
        .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct PasswordLogin {
    email: String,
    password: String,
}

async fn password_login(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<PasswordLogin>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    // Oversized input never reaches the hash, and is treated like any wrong password.
    let password: String = body.password.chars().take(cred::MAX_PASSWORD + 1).collect();
    let account = credentials_by_email(&state.pool, &body.email).await?;
    let stored = account.as_ref().and_then(|a| a.password_hash.clone());
    let matches = verify_blocking(stored, password).await?;
    let Some(account) = account else {
        return Err(ApiError::Unauthorized(BAD_LOGIN));
    };
    if account.disabled || account.locked || account.password_hash.is_none() || !account.has_two_factor {
        return Err(ApiError::Unauthorized(BAD_LOGIN));
    }
    if !matches {
        record_failure(&state.pool, account.id, &ctx.ip_hash, "password").await?;
        return Err(ApiError::Unauthorized(BAD_LOGIN));
    }
    // The password was right; nothing is signed in until the second factor is.
    let secret = new_token();
    let challenge_id = store_challenge(
        &state,
        "password_2fa",
        None,
        Some(account.id),
        None,
        json!({ "token_hash": hex::encode(token_hash(&secret)) }),
    )
    .await?;
    Ok(Json(
        json!({ "two_factor": { "pending": format!("{challenge_id}.{secret}") } }),
    ))
}

#[derive(Deserialize)]
struct PasswordVerify {
    pending: String,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    recovery_code: Option<String>,
}

async fn password_verify(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<PasswordVerify>,
) -> Result<Response, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    const EXPIRED: ApiError = ApiError::Unauthorized("This sign-in attempt expired. Please start again.");
    let (id, secret) = body.pending.split_once('.').ok_or(EXPIRED)?;
    let id = Uuid::parse_str(id).map_err(|_| EXPIRED)?;
    let pending: Option<(Option<Uuid>, Value)> = sqlx::query_as(
        "SELECT user_id, state FROM admin_challenges
          WHERE id = $1 AND kind = 'password_2fa' AND expires_at > now()",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (user_id, stored) = pending.ok_or(EXPIRED)?;
    let user_id = user_id.ok_or(EXPIRED)?;
    if stored["token_hash"].as_str() != Some(hex::encode(token_hash(secret)).as_str()) {
        return Err(EXPIRED);
    }
    let account = credentials_by_id(&state.pool, user_id).await?;
    if account.disabled || account.locked {
        return Err(EXPIRED);
    }

    let method = match (&body.code, &body.recovery_code) {
        (_, Some(code)) => use_recovery_code(&state.pool, user_id, code)
            .await?
            .then_some("recovery_code"),
        (Some(code), None) => use_totp(&state, &account, code).await?.then_some("password"),
        (None, None) => None,
    };
    let Some(method) = method else {
        record_failure(&state.pool, user_id, &ctx.ip_hash, "two_factor").await?;
        return Err(ApiError::Unauthorized(BAD_CODE));
    };

    sqlx::query("DELETE FROM admin_challenges WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    sqlx::query(
        "UPDATE admin_users SET password_failed_attempts = 0, password_locked_until = NULL WHERE id = $1",
    )
    .bind(user_id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        Some(user_id),
        "admin.login",
        None,
        json!({ "method": method }),
        Some(&ctx.ip_hash),
    )
    .await?;
    signed_in(&state, ctx, user_id, "password").await
}

/// Checks a code against the live secret and records its time step, so it can't be used twice.
async fn use_totp(state: &SharedState, account: &Credentials, code: &str) -> Result<bool, ApiError> {
    let key = secrets_key(admin_config(state)?)?;
    let Some(secret) = account.totp_secret.as_deref().and_then(|s| cred::open(key, s)) else {
        return Ok(false);
    };
    let Some(step) = cred::verify_totp(&secret, code, unix_now(), account.totp_last_step) else {
        return Ok(false);
    };
    // Conditional, so two simultaneous uses of one code can't both pass.
    let claimed = sqlx::query(
        "UPDATE admin_users SET totp_last_step = $2
          WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)",
    )
    .bind(account.id)
    .bind(step)
    .execute(&state.pool)
    .await?;
    Ok(claimed.rows_affected() == 1)
}

async fn use_recovery_code(pool: &PgPool, user_id: Uuid, code: &str) -> Result<bool, sqlx::Error> {
    let used = sqlx::query(
        "UPDATE admin_recovery_codes SET used_at = now()
          WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL",
    )
    .bind(user_id)
    .bind(cred::recovery_hash(user_id, code))
    .execute(pool)
    .await?;
    Ok(used.rows_affected() == 1)
}

#[derive(Deserialize)]
struct Forgot {
    email: String,
}

/// Always the same answer. The work happens after responding, so neither the
/// wording nor the timing reveals whether the account exists.
async fn forgot(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Forgot>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    let ip_hash = ctx.ip_hash.clone();
    let task_state = state.clone();
    tokio::spawn(async move {
        if let Err(err) = send_recovery(&task_state, &body.email, &ip_hash).await {
            tracing::warn!(error = ?err, "password recovery request failed");
        }
    });
    Ok(StatusCode::ACCEPTED)
}

async fn send_recovery(state: &SharedState, email: &str, ip_hash: &str) -> Result<(), ApiError> {
    let admin = admin_config(state)?;
    let Some(account) = credentials_by_email(&state.pool, email).await? else {
        return Ok(());
    };
    if account.disabled {
        return Ok(());
    }
    // Email is on hold until Resend is configured: nothing is sent or implied. Owners can create a link.
    let held = matches!(state.config.email.mode, EmailMode::Hold);
    audit(
        &state.pool,
        Some(account.id),
        "admin.password_reset_requested",
        None,
        json!({ "delivery": if held { "held" } else { "queued" } }),
        Some(ip_hash),
    )
    .await?;
    if held {
        return Ok(());
    }
    // One email every few minutes per account, however often it's requested.
    let recent: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM admin_password_resets
          WHERE user_id = $1 AND created_at > now() - interval '5 minutes')",
    )
    .bind(account.id)
    .fetch_one(&state.pool)
    .await?;
    if recent {
        return Ok(());
    }
    let origin = admin.origin.as_str().trim_end_matches('/');
    let message = if account.has_two_factor {
        let url = recovery_link(&state.pool, admin, account.id, None, RESET_LINK_MINUTES).await?;
        templates::password_recovery(&account.name, &url, RESET_LINK_MINUTES as u32)
    } else {
        // Email alone must never set up a way in: the passkey proves who they are.
        templates::password_needs_passkey(&account.name, &format!("{origin}/admin/login"))
    };
    let mut tx = state.pool.begin().await?;
    outbox::enqueue_account(&mut tx, std::slice::from_ref(&account.email), &message).await?;
    tx.commit().await?;
    Ok(())
}

/// A new single-use link; any earlier one stops working.
async fn recovery_link(
    pool: &PgPool,
    admin: &AdminConfig,
    user_id: Uuid,
    created_by: Option<Uuid>,
    minutes: f64,
) -> Result<String, sqlx::Error> {
    sqlx::query("UPDATE admin_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL")
        .bind(user_id)
        .execute(pool)
        .await?;
    let token = new_token();
    sqlx::query(
        "INSERT INTO admin_password_resets (id, token_hash, user_id, created_by, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))",
    )
    .bind(Uuid::now_v7())
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(created_by)
    .bind(minutes * 60.0)
    .execute(pool)
    .await?;
    let origin = admin.origin.as_str().trim_end_matches('/');
    // In the fragment, so the token never reaches logs or `Referer` headers.
    Ok(format!("{origin}/admin/reset-password#token={token}"))
}

#[derive(Deserialize)]
struct Reset {
    token: String,
    password: String,
}

async fn reset(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Reset>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    let hash = token_hash(body.token.trim());
    let user_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM admin_password_resets
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
    )
    .bind(&hash)
    .fetch_optional(&state.pool)
    .await?;
    let user_id = user_id.ok_or(ApiError::Unauthorized(BAD_RESET))?;
    let account = credentials_by_id(&state.pool, user_id).await?;
    if account.disabled || !account.has_two_factor {
        return Err(ApiError::Unauthorized(BAD_RESET));
    }
    // A weak password doesn't use up the link.
    if let Some(problem) = cred::password_problem(&body.password, &account.email, &account.name) {
        return Err(field("password", "weak", problem));
    }
    let password_hash = hash_blocking(body.password).await?;

    let mut tx = state.pool.begin().await?;
    // Claiming inside the transaction makes the link strictly single-use.
    let claimed = sqlx::query(
        "UPDATE admin_password_resets SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
    )
    .bind(&hash)
    .execute(&mut *tx)
    .await?;
    if claimed.rows_affected() != 1 {
        return Err(ApiError::Unauthorized(BAD_RESET));
    }
    sqlx::query(
        "UPDATE admin_users SET password_hash = $2, password_set_at = now(),
                password_failed_attempts = 0, password_locked_until = NULL
          WHERE id = $1",
    )
    .bind(user_id)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await?;
    // Anyone signed in with the old password is signed out.
    sqlx::query("UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    if !matches!(state.config.email.mode, EmailMode::Hold) {
        outbox::enqueue_account(
            &mut tx,
            std::slice::from_ref(&account.email),
            &templates::password_changed(&account.name),
        )
        .await?;
    }
    tx.commit().await?;
    audit(
        &state.pool,
        Some(user_id),
        "admin.password_reset",
        None,
        json!({}),
        Some(&ctx.ip_hash),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// For when email isn't available: an owner creates a link to pass on, like
/// an invite. It only changes the password, so it gives the owner no way in.
async fn owner_recovery_link(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    session.require_verified()?;
    let admin = admin_config(&state)?;
    let target: Option<(String, bool, bool)> = sqlx::query_as(
        "SELECT email, disabled_at IS NOT NULL, totp_confirmed_at IS NOT NULL FROM admin_users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let (email, disabled, two_factor) = target.ok_or(ApiError::NotFound)?;
    if disabled {
        return Err(ApiError::Conflict("This person's access is disabled."));
    }
    if !two_factor {
        return Err(ApiError::Conflict(
            "This person hasn't set up two-factor, so a password can't be recovered. Send them a new invite instead: it adds a passkey for this account.",
        ));
    }
    let url = recovery_link(
        &state.pool,
        admin,
        id,
        Some(session.user.id),
        OWNER_LINK_HOURS * 60.0,
    )
    .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.recovery_link_created",
        Some(("admin_user", id.to_string())),
        json!({ "email": email }),
        None,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "recovery_url": url, "hours": OWNER_LINK_HOURS })),
    ))
}

#[derive(Serialize, FromRow)]
struct PasskeyRow {
    id: Uuid,
    label: String,
    created_at: DateTime<Utc>,
    last_used_at: Option<DateTime<Utc>>,
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

#[derive(Serialize, FromRow)]
struct ActivityRow {
    id: Uuid,
    action: String,
    detail: Value,
    created_at: DateTime<Utc>,
}

/// One person's own security state; nothing here is about anyone else.
async fn overview(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let admin = admin_config(&state)?;
    let user = session.user.id;
    let (password_set_at, two_factor_at): (Option<DateTime<Utc>>, Option<DateTime<Utc>>) =
        sqlx::query_as("SELECT password_set_at, totp_confirmed_at FROM admin_users WHERE id = $1")
            .bind(user)
            .fetch_one(&state.pool)
            .await?;
    let codes_left: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM admin_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
    )
    .bind(user)
    .fetch_one(&state.pool)
    .await?;
    let passkeys: Vec<PasskeyRow> = sqlx::query_as(
        "SELECT id, label, created_at, last_used_at FROM admin_passkeys WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(user)
    .fetch_all(&state.pool)
    .await?;
    let sessions: Vec<SessionRow> = sqlx::query_as(
        "SELECT id, user_agent, auth_method, created_at, last_seen_at, expires_at FROM admin_sessions
          WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
          ORDER BY last_seen_at DESC",
    )
    .bind(user)
    .fetch_all(&state.pool)
    .await?;
    let activity: Vec<ActivityRow> = sqlx::query_as(
        "SELECT id, action, detail - 'from' - 'to' AS detail, created_at FROM audit_log
          WHERE actor_user_id = $1 AND action LIKE 'admin.%'
          ORDER BY created_at DESC LIMIT 30",
    )
    .bind(user)
    .fetch_all(&state.pool)
    .await?;
    let sessions: Vec<Value> = sessions
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
    Ok(Json(json!({
        "available": admin.secrets_key.is_some(),
        "verified": session.verified,
        "password": { "set": password_set_at.is_some(), "set_at": password_set_at },
        "two_factor": {
            "enabled": two_factor_at.is_some(),
            "confirmed_at": two_factor_at,
            "recovery_codes_left": codes_left,
        },
        "passkeys": passkeys,
        "sessions": sessions,
        "activity": activity,
    })))
}

async fn mark_verified(pool: &PgPool, session_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE admin_sessions SET verified_until = now() + make_interval(mins => $2) WHERE id = $1")
        .bind(session_id)
        .bind(VERIFIED_MINUTES as i32)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Deserialize)]
struct VerifyPassword {
    password: String,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    recovery_code: Option<String>,
}

/// Identity check with password and two-factor, for devices without a passkey.
async fn verify_with_password(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    session: AdminSession,
    Json(body): Json<VerifyPassword>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    const WRONG: ApiError = ApiError::Unauthorized("That password or code didn't work. Please try again.");
    let account = credentials_by_id(&state.pool, session.user.id).await?;
    if account.password_hash.is_none() {
        return Err(ApiError::Conflict(
            "You don't have a password yet: use your passkey.",
        ));
    }
    let password: String = body.password.chars().take(cred::MAX_PASSWORD + 1).collect();
    let matches = verify_blocking(account.password_hash.clone(), password).await?;
    if !matches || account.locked {
        record_failure(&state.pool, account.id, &ctx.ip_hash, "identity_check").await?;
        return Err(WRONG);
    }
    let second = match (&body.code, &body.recovery_code) {
        (_, Some(code)) => use_recovery_code(&state.pool, account.id, code).await?,
        (Some(code), None) => use_totp(&state, &account, code).await?,
        (None, None) => false,
    };
    if !second {
        record_failure(&state.pool, account.id, &ctx.ip_hash, "identity_check").await?;
        return Err(WRONG);
    }
    mark_verified(&state.pool, session.session_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn verify_passkey_start(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let webauthn = state.webauthn.as_ref().ok_or(ApiError::NotFound)?;
    let keys = passkeys(&state, session.user.id).await?;
    if keys.is_empty() {
        return Err(ApiError::Conflict("You don't have a passkey yet."));
    }
    let (options, auth) = webauthn
        .start_passkey_authentication(&keys)
        .map_err(|e| ApiError::Internal(format!("passkey authentication start: {e}")))?;
    let challenge_id =
        store_challenge(&state, "step_up", None, Some(session.user.id), None, json!(auth)).await?;
    Ok(Json(json!({ "challenge_id": challenge_id, "options": options })))
}

#[derive(Deserialize)]
struct VerifyPasskey {
    challenge_id: Uuid,
    credential: PublicKeyCredential,
}

async fn verify_passkey_finish(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(body): Json<VerifyPasskey>,
) -> Result<impl IntoResponse, ApiError> {
    let webauthn = state.webauthn.as_ref().ok_or(ApiError::NotFound)?;
    let challenge = consume_challenge(&state, body.challenge_id, "step_up").await?;
    // A check started by one person can't vouch for another.
    if challenge.user_id != Some(session.user.id) {
        return Err(ApiError::Forbidden);
    }
    let auth: PasskeyAuthentication = serde_json::from_value(challenge.state)
        .map_err(|e| ApiError::Internal(format!("challenge state: {e}")))?;
    let result = webauthn
        .finish_passkey_authentication(&body.credential, &auth)
        .map_err(|_| ApiError::Unauthorized("The passkey could not be verified. Please try again."))?;
    update_passkey(&state, session.user.id, &result).await?;
    mark_verified(&state.pool, session.session_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn two_factor_start(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let key = secrets_key(admin_config(&state)?)?;
    let secret = cred::new_totp_secret();
    sqlx::query("UPDATE admin_users SET totp_pending_secret = $2 WHERE id = $1")
        .bind(session.user.id)
        .bind(cred::seal(key, &secret).map_err(ApiError::Internal)?)
        .execute(&state.pool)
        .await?;
    let url = cred::otpauth_url(ISSUER, &session.user.email, &secret);
    let (size, modules) = cred::qr_modules(&url).map_err(ApiError::Internal)?;
    Ok(Json(json!({
        "secret": cred::base32(&secret),
        "url": url,
        "qr": { "size": size, "modules": modules },
    })))
}

async fn store_recovery_codes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query("DELETE FROM admin_recovery_codes WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    let codes = cred::new_recovery_codes();
    for code in &codes {
        sqlx::query("INSERT INTO admin_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)")
            .bind(Uuid::now_v7())
            .bind(user_id)
            .bind(cred::recovery_hash(user_id, code))
            .execute(&mut **tx)
            .await?;
    }
    Ok(codes)
}

#[derive(Deserialize)]
struct Confirm {
    code: String,
}

/// Turns two-factor on with the first correct code, replacing any earlier
/// authenticator only now. Returns the recovery codes, shown once.
async fn two_factor_confirm(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(body): Json<Confirm>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let key = secrets_key(admin_config(&state)?)?;
    let pending: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT totp_pending_secret FROM admin_users WHERE id = $1")
            .bind(session.user.id)
            .fetch_one(&state.pool)
            .await?;
    let pending = pending.ok_or(ApiError::Conflict("Start two-factor setup first."))?;
    let secret = cred::open(key, &pending).ok_or(ApiError::Internal("pending secret unreadable".into()))?;
    let step = cred::verify_totp(&secret, &body.code, unix_now(), None).ok_or(field(
        "code",
        "invalid",
        "That code didn't work. Check your authenticator app and try the newest code.",
    ))?;
    let mut tx = state.pool.begin().await?;
    let replacing: bool =
        sqlx::query_scalar("SELECT totp_confirmed_at IS NOT NULL FROM admin_users WHERE id = $1 FOR UPDATE")
            .bind(session.user.id)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query(
        "UPDATE admin_users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
                totp_confirmed_at = now(), totp_last_step = $2
          WHERE id = $1",
    )
    .bind(session.user.id)
    .bind(step)
    .execute(&mut *tx)
    .await?;
    let codes = store_recovery_codes(&mut tx, session.user.id).await?;
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        if replacing {
            "admin.two_factor_replaced"
        } else {
            "admin.two_factor_enabled"
        },
        None,
        json!({}),
        None,
    )
    .await?;
    Ok(Json(json!({ "recovery_codes": codes })))
}

async fn two_factor_remove(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let account = credentials_by_id(&state.pool, session.user.id).await?;
    if account.password_hash.is_some() {
        return Err(ApiError::Conflict(
            "A password always needs two-factor. Remove the password first, or set up a new authenticator.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "UPDATE admin_users SET totp_secret = NULL, totp_pending_secret = NULL,
                totp_confirmed_at = NULL, totp_last_step = NULL
          WHERE id = $1",
    )
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM admin_recovery_codes WHERE user_id = $1")
        .bind(session.user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.two_factor_removed",
        None,
        json!({}),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn recovery_codes(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let account = credentials_by_id(&state.pool, session.user.id).await?;
    if !account.has_two_factor {
        return Err(ApiError::Conflict("Set up two-factor first."));
    }
    let mut tx = state.pool.begin().await?;
    let codes = store_recovery_codes(&mut tx, session.user.id).await?;
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.recovery_codes_replaced",
        None,
        json!({}),
        None,
    )
    .await?;
    Ok(Json(json!({ "recovery_codes": codes })))
}

#[derive(Deserialize)]
struct SetPassword {
    password: String,
}

/// Creates or changes the password. Other sessions end; this one stays.
async fn set_password(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(body): Json<SetPassword>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let account = credentials_by_id(&state.pool, session.user.id).await?;
    if !account.has_two_factor {
        return Err(ApiError::Conflict(
            "Set up two-factor first: a password alone can't open the Studio.",
        ));
    }
    if let Some(problem) = cred::password_problem(&body.password, &account.email, &account.name) {
        return Err(field("password", "weak", problem));
    }
    let password_hash = hash_blocking(body.password).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "UPDATE admin_users SET password_hash = $2, password_set_at = now(),
                password_failed_attempts = 0, password_locked_until = NULL
          WHERE id = $1",
    )
    .bind(account.id)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE admin_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL")
        .bind(account.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE admin_sessions SET revoked_at = now()
          WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL",
    )
    .bind(account.id)
    .bind(session.session_id)
    .execute(&mut *tx)
    .await?;
    if !matches!(state.config.email.mode, EmailMode::Hold) {
        outbox::enqueue_account(
            &mut tx,
            std::slice::from_ref(&account.email),
            &templates::password_changed(&account.name),
        )
        .await?;
    }
    tx.commit().await?;
    audit(
        &state.pool,
        Some(account.id),
        if account.password_hash.is_some() {
            "admin.password_changed"
        } else {
            "admin.password_created"
        },
        None,
        json!({}),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn remove_password(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    if passkeys_of(&state.pool, session.user.id).await? == 0 {
        return Err(ApiError::Conflict(
            "Add a passkey first: your password is your only way to sign in.",
        ));
    }
    sqlx::query(
        "UPDATE admin_users SET password_hash = NULL, password_set_at = NULL,
                password_failed_attempts = 0, password_locked_until = NULL
          WHERE id = $1",
    )
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.password_removed",
        None,
        json!({}),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize, Deserialize)]
struct AddPasskeyState {
    reg: PasskeyRegistration,
}

async fn add_passkey_start(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let webauthn = state.webauthn.as_ref().ok_or(ApiError::NotFound)?;
    let exclude = passkeys(&state, session.user.id)
        .await?
        .iter()
        .map(|p| p.cred_id().clone())
        .collect();
    let (options, reg) = webauthn
        .start_passkey_registration(
            session.user.id,
            &session.user.email,
            &session.user.name,
            Some(exclude),
        )
        .map_err(|e| ApiError::Internal(format!("passkey registration start: {e}")))?;
    let challenge_id = store_challenge(
        &state,
        "add_passkey",
        None,
        Some(session.user.id),
        None,
        json!(AddPasskeyState { reg }),
    )
    .await?;
    Ok(Json(json!({ "challenge_id": challenge_id, "options": options })))
}

#[derive(Deserialize)]
struct AddPasskey {
    challenge_id: Uuid,
    credential: RegisterPublicKeyCredential,
    #[serde(default)]
    label: Option<String>,
}

async fn add_passkey_finish(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(body): Json<AddPasskey>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let webauthn = state.webauthn.as_ref().ok_or(ApiError::NotFound)?;
    let challenge = consume_challenge(&state, body.challenge_id, "add_passkey").await?;
    if challenge.user_id != Some(session.user.id) {
        return Err(ApiError::Forbidden);
    }
    let stored: AddPasskeyState = serde_json::from_value(challenge.state)
        .map_err(|e| ApiError::Internal(format!("challenge state: {e}")))?;
    let passkey = webauthn
        .finish_passkey_registration(&body.credential, &stored.reg)
        .map_err(|_| ApiError::Unauthorized("The passkey could not be verified. Please try again."))?;
    let label: String = body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .unwrap_or("Passkey")
        .chars()
        .take(60)
        .collect();
    sqlx::query(
        "INSERT INTO admin_passkeys (id, user_id, credential_id, passkey, label) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(passkey.cred_id().as_ref())
    .bind(json!(passkey))
    .bind(&label)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.passkey_added",
        None,
        json!({ "label": label }),
        None,
    )
    .await?;
    Ok(StatusCode::CREATED)
}

async fn remove_passkey(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_verified()?;
    let account = credentials_by_id(&state.pool, session.user.id).await?;
    if account.password_hash.is_none() && passkeys_of(&state.pool, session.user.id).await? <= 1 {
        return Err(ApiError::Conflict(
            "This is your only way to sign in. Add another passkey or a password first.",
        ));
    }
    // Only ever one's own: someone else's id simply isn't found.
    let label: Option<String> =
        sqlx::query_scalar("DELETE FROM admin_passkeys WHERE id = $1 AND user_id = $2 RETURNING label")
            .bind(id)
            .bind(session.user.id)
            .fetch_optional(&state.pool)
            .await?;
    let label = label.ok_or(ApiError::NotFound)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.passkey_removed",
        None,
        json!({ "label": label }),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_session(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    if id == session.session_id {
        return Err(ApiError::Conflict("To end this session, sign out."));
    }
    let revoked = sqlx::query(
        "UPDATE admin_sessions SET revoked_at = now()
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    )
    .bind(id)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    if revoked.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.session_revoked",
        Some(("session", id.to_string())),
        json!({}),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_others(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let revoked = sqlx::query(
        "UPDATE admin_sessions SET revoked_at = now()
          WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL",
    )
    .bind(session.user.id)
    .bind(session.session_id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.sessions_revoked",
        None,
        json!({ "count": revoked.rows_affected() }),
        None,
    )
    .await?;
    Ok(Json(json!({ "revoked": revoked.rows_affected() })))
}
