//! HTTP endpoints for admin sign-in. Passkey ceremonies are two steps
//! (`start` returns WebAuthn options, `finish` verifies the browser's
//! credential); ceremony state never leaves the server.

use std::net::SocketAddr;

use axum::{
    Json, Router,
    extract::{ConnectInfo, State},
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;
use webauthn_rs::prelude::{
    AuthenticationResult, Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential,
};

use super::{
    AdminSession, Role, audit, challenge_ttl_secs, check_origin, client_meta, create_invite_for,
    create_session_via, set_cookie, token_hash,
};
use crate::{config::AdminConfig, error::ApiError, rate_limit::client_ip, routes::SharedState};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/invites/accept/start", post(accept_start))
        .route("/v1/admin/invites/accept/finish", post(accept_finish))
        .route("/v1/admin/login/start", post(login_start))
        .route("/v1/admin/login/finish", post(login_finish))
        .route("/v1/admin/logout", post(logout))
        .route("/v1/admin/me", get(me))
        .route("/v1/admin/invites", post(invite))
        .route("/v1/admin/audit", get(audit_log))
}

/// Context every unauthenticated admin endpoint needs: admin enabled, the
/// request from the admin origin, and within the per-IP attempt budget.
pub(super) struct Public<'a> {
    admin: &'a AdminConfig,
    webauthn: &'a webauthn_rs::Webauthn,
    pub(super) ip_hash: String,
    user_agent: Option<String>,
}

pub(super) fn public<'a>(
    state: &'a SharedState,
    headers: &HeaderMap,
    peer: SocketAddr,
) -> Result<Public<'a>, ApiError> {
    let (Some(admin), Some(webauthn)) = (state.config.admin.as_ref(), state.webauthn.as_ref()) else {
        return Err(ApiError::NotFound);
    };
    check_origin(&Method::POST, headers, admin)?;
    let ip = client_ip(headers, peer, state.config.trust_proxy);
    state
        .auth_limiter
        .check(ip)
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let (ip_hash, user_agent) = client_meta(state, headers, ip);
    Ok(Public {
        admin,
        webauthn,
        ip_hash,
        user_agent,
    })
}

#[derive(Serialize)]
struct Ceremony<T: Serialize> {
    challenge_id: Uuid,
    options: T,
}

#[derive(Deserialize)]
struct AcceptStart {
    token: String,
    name: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct RegisterState {
    reg: PasskeyRegistration,
    user_id: Uuid,
    existing: bool,
}

async fn accept_start(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<AcceptStart>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    let invite: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, email FROM admin_invites WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()",
    )
    .bind(token_hash(body.token.trim()))
    .fetch_optional(&state.pool)
    .await?;
    let (invite_id, email) =
        invite.ok_or(ApiError::Unauthorized("This invite is invalid, used or expired."))?;

    // A re-invite for an existing user adds a passkey (e.g. a new device).
    let existing: Option<(Uuid, String, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as("SELECT id, name, disabled_at FROM admin_users WHERE lower(email) = $1")
            .bind(&email)
            .fetch_optional(&state.pool)
            .await?;
    let (user_id, name, exclude) = match existing {
        Some((_, _, Some(_))) => return Err(ApiError::Forbidden),
        Some((id, name, None)) => {
            let registered = passkeys(&state, id)
                .await?
                .iter()
                .map(|p| p.cred_id().clone())
                .collect();
            (id, name, Some(registered))
        }
        None => {
            let name = body.name.as_deref().map(str::trim).unwrap_or_default();
            if name.is_empty() || name.chars().count() > 80 {
                return Err(ApiError::BadRequest(
                    "please enter your name (up to 80 characters)",
                ));
            }
            (Uuid::now_v7(), name.to_owned(), None)
        }
    };
    let existing = exclude.is_some();

    let (options, reg) = ctx
        .webauthn
        .start_passkey_registration(user_id, &email, &name, exclude)
        .map_err(|e| ApiError::Internal(format!("passkey registration start: {e}")))?;
    let challenge_id = store_challenge(
        &state,
        "register",
        Some(invite_id),
        None,
        Some(&name),
        json!(RegisterState {
            reg,
            user_id,
            existing
        }),
    )
    .await?;
    Ok(Json(Ceremony {
        challenge_id,
        options,
    }))
}

#[derive(Deserialize)]
struct AcceptFinish {
    challenge_id: Uuid,
    credential: RegisterPublicKeyCredential,
}

async fn accept_finish(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<AcceptFinish>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    let Challenge {
        invite_id,
        name,
        state: raw,
        ..
    } = consume_challenge(&state, body.challenge_id, "register").await?;
    let invite_id = invite_id.ok_or(ApiError::Internal("registration challenge without invite".into()))?;
    let reg: RegisterState =
        serde_json::from_value(raw).map_err(|e| ApiError::Internal(format!("challenge state: {e}")))?;
    let passkey = ctx
        .webauthn
        .finish_passkey_registration(&body.credential, &reg.reg)
        .map_err(|_| ApiError::Unauthorized("The passkey could not be verified. Please try again."))?;

    let mut tx = state.pool.begin().await?;
    // Claiming the invite inside the transaction makes it strictly single-use.
    let claimed: Option<(String, String, Option<Value>)> = sqlx::query_as(
        "UPDATE admin_invites SET used_at = now()
          WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING email, role, site_grants",
    )
    .bind(invite_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (email, role, site_grants) =
        claimed.ok_or(ApiError::Unauthorized("This invite is invalid, used or expired."))?;
    if !reg.existing {
        sqlx::query("INSERT INTO admin_users (id, email, name, role) VALUES ($1, $2, $3, $4)")
            .bind(reg.user_id)
            .bind(&email)
            .bind(name.as_deref().unwrap_or(&email))
            .bind(&role)
            .execute(&mut *tx)
            .await?;
        // Website access chosen in the invite (websites deleted since are skipped).
        if let Some(Value::Array(grants)) = site_grants {
            let granted: Vec<(Uuid, Role)> = grants
                .iter()
                .filter_map(|g| {
                    let site = g["site_id"].as_str().and_then(|s| Uuid::parse_str(s).ok())?;
                    Some((site, Role::parse(g["role"].as_str()?)?))
                })
                .collect();
            let exists: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM sites WHERE id = ANY($1)")
                .bind(granted.iter().map(|(s, _)| *s).collect::<Vec<_>>())
                .fetch_all(&mut *tx)
                .await?;
            let granted: Vec<(Uuid, Role)> =
                granted.into_iter().filter(|(s, _)| exists.contains(s)).collect();
            super::team::store_grants(&mut tx, reg.user_id, Some(&granted), None).await?;
        }
    }
    sqlx::query("INSERT INTO admin_passkeys (id, user_id, credential_id, passkey) VALUES ($1, $2, $3, $4)")
        .bind(Uuid::now_v7())
        .bind(reg.user_id)
        .bind(passkey.cred_id().as_ref())
        .bind(json!(passkey))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let action = if reg.existing {
        "admin.passkey_added"
    } else {
        "admin.user_created"
    };
    audit(
        &state.pool,
        Some(reg.user_id),
        action,
        Some(("invite", invite_id.to_string())),
        json!({ "email": email, "role": role }),
        Some(&ctx.ip_hash),
    )
    .await?;
    // An invitation's first session, so a newcomer can set up a way in the
    // sign-in policy allows, whichever that is (P13-B4).
    signed_in(&state, ctx, reg.user_id, "invite").await
}

#[derive(Deserialize)]
struct LoginStart {
    email: String,
}

async fn login_start(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginStart>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    // Turned off for everyone, so saying so reveals nothing about any account.
    if !super::policy::load(&state.pool).await?.passkey_sign_in {
        return Err(ApiError::Unauthorized(super::policy::PASSKEYS_OFF));
    }
    let user: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM admin_users WHERE lower(email) = lower($1) AND disabled_at IS NULL",
    )
    .bind(body.email.trim())
    .fetch_optional(&state.pool)
    .await?;
    let keys = match user {
        Some(user_id) => passkeys(&state, user_id).await?,
        None => Vec::new(),
    };
    let Some(user_id) = user.filter(|_| !keys.is_empty()) else {
        // Same answer as a real account, so this can't be used to find out
        // who has one: the browser just finds no passkey for it on the device.
        let challenge_id = store_challenge(&state, "login", None, None, None, json!({})).await?;
        return Ok(Json(json!({
            "challenge_id": challenge_id,
            "options": decoy_options(&state.config.ip_hash_salt, ctx.admin, &body.email),
        })));
    };
    let (options, auth) = ctx
        .webauthn
        .start_passkey_authentication(&keys)
        .map_err(|e| ApiError::Internal(format!("passkey authentication start: {e}")))?;
    let challenge_id = store_challenge(&state, "login", None, Some(user_id), None, json!(auth)).await?;
    Ok(Json(json!(Ceremony {
        challenge_id,
        options,
    })))
}

/// Request options for an email with no passkeys, shaped like the real ones.
/// The credential id is derived from the email, so asking twice gives the
/// same answer, as it would for a real account.
fn decoy_options(salt: &str, admin: &AdminConfig, email: &str) -> Value {
    use base64::Engine as _;
    use rand::RngCore as _;
    use sha2::{Digest, Sha256};
    let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let mut challenge = [0u8; 32];
    rand::rng().fill_bytes(&mut challenge);
    let id = Sha256::digest(format!("{salt}:decoy:{}", email.trim().to_lowercase()));
    json!({
        "publicKey": {
            "challenge": b64.encode(challenge),
            "timeout": 60000,
            "rpId": admin.rp_id,
            "allowCredentials": [{ "type": "public-key", "id": b64.encode(id) }],
            "userVerification": "required",
        },
    })
}

#[derive(Deserialize)]
struct LoginFinish {
    challenge_id: Uuid,
    credential: PublicKeyCredential,
}

async fn login_finish(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginFinish>,
) -> Result<impl IntoResponse, ApiError> {
    let ctx = public(&state, &headers, peer)?;
    let Challenge {
        user_id, state: raw, ..
    } = consume_challenge(&state, body.challenge_id, "login").await?;
    let user_id = user_id.ok_or(ApiError::Unauthorized(
        "The passkey could not be verified. Please try again.",
    ))?;
    let auth: PasskeyAuthentication =
        serde_json::from_value(raw).map_err(|e| ApiError::Internal(format!("challenge state: {e}")))?;

    let result = match ctx
        .webauthn
        .finish_passkey_authentication(&body.credential, &auth)
    {
        Ok(result) => result,
        Err(_) => {
            audit(
                &state.pool,
                Some(user_id),
                "admin.login_failed",
                None,
                json!({}),
                Some(&ctx.ip_hash),
            )
            .await?;
            return Err(ApiError::Unauthorized(
                "The passkey could not be verified. Please try again.",
            ));
        }
    };

    update_passkey(&state, user_id, &result).await?;

    audit(
        &state.pool,
        Some(user_id),
        "admin.login",
        None,
        json!({ "method": "passkey" }),
        Some(&ctx.ip_hash),
    )
    .await?;
    signed_in(&state, ctx, user_id, "passkey").await
}

/// Keeps the stored credential's signature counter and backup state current.
pub(super) async fn update_passkey(
    state: &SharedState,
    user_id: Uuid,
    result: &AuthenticationResult,
) -> Result<(), ApiError> {
    let mut tx = state.pool.begin().await?;
    let stored: Option<(Uuid, Value)> = sqlx::query_as(
        "SELECT id, passkey FROM admin_passkeys WHERE user_id = $1 AND credential_id = $2 FOR UPDATE",
    )
    .bind(user_id)
    .bind(result.cred_id().as_ref())
    .fetch_optional(&mut *tx)
    .await?;
    let (passkey_id, raw) = stored.ok_or(ApiError::Unauthorized("This passkey is no longer registered."))?;
    let mut passkey: Passkey =
        serde_json::from_value(raw).map_err(|e| ApiError::Internal(format!("stored passkey: {e}")))?;
    passkey.update_credential(result);
    sqlx::query("UPDATE admin_passkeys SET passkey = $2, last_used_at = now() WHERE id = $1")
        .bind(passkey_id)
        .bind(json!(passkey))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub(super) async fn signed_in(
    state: &SharedState,
    ctx: Public<'_>,
    user_id: Uuid,
    method: &str,
) -> Result<Response, ApiError> {
    super::policy::check_sign_in(&state.pool, user_id, super::policy::Method::parse(method)).await?;
    let token = create_session_via(
        &state.pool,
        ctx.admin,
        user_id,
        &ctx.ip_hash,
        ctx.user_agent.as_deref(),
        method,
    )
    .await?;
    let session = super::authenticate(&state.pool, &token)
        .await?
        .ok_or(ApiError::Internal("new session not found".into()))?;
    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, set_cookie(ctx.admin, Some(&token)))],
        Json(json!({ "user": session.user })),
    )
        .into_response())
}

async fn logout(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let admin = state.config.admin.as_ref().ok_or(ApiError::NotFound)?;
    sqlx::query("UPDATE admin_sessions SET revoked_at = now() WHERE id = $1")
        .bind(session.session_id)
        .execute(&state.pool)
        .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.logout",
        None,
        json!({}),
        None,
    )
    .await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, set_cookie(admin, None))],
    ))
}

async fn me(session: AdminSession) -> Json<Value> {
    Json(json!({ "user": session.user, "access": session.access_json() }))
}

#[derive(Deserialize)]
struct NewInvite {
    email: String,
    role: String,
    /// Selected websites (P7-F1); omitted or null means every website.
    #[serde(default)]
    sites: Option<Vec<super::team::GrantInput>>,
}

async fn invite(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(body): Json<NewInvite>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let admin = state.config.admin.as_ref().ok_or(ApiError::NotFound)?;
    let role = Role::parse(&body.role).ok_or(ApiError::BadRequest("unknown role"))?;
    let email = body.email.trim();
    if !crate::enquiry::is_valid_email(email) {
        return Err(ApiError::BadRequest("invalid email address"));
    }
    let sites = match &body.sites {
        Some(sites) => Some(super::team::resolve_grants(&state.pool, role, sites).await?),
        None => None,
    };
    let (url, expires_at) = create_invite_for(
        &state.pool,
        admin,
        email,
        role,
        Some(session.user.id),
        sites.as_deref(),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "invite_url": url, "expires_at": expires_at })),
    ))
}

#[derive(Serialize, sqlx::FromRow)]
struct AuditEntry {
    id: Uuid,
    action: String,
    actor_email: Option<String>,
    /// The website the action concerns, when there is one.
    site_name: Option<String>,
    target_type: Option<String>,
    target_id: Option<String>,
    detail: Value,
    /// Whether previous and new values are recorded (`/audit/{id}/changes`).
    has_changes: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
struct AuditQuery {
    site: Option<String>,
    before: Option<chrono::DateTime<chrono::Utc>>,
}

async fn audit_log(
    State(state): State<SharedState>,
    session: AdminSession,
    axum::extract::Query(query): axum::extract::Query<AuditQuery>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    // The feed names what happened; previous and new values (whole page
    // documents, brand drafts) stay in the log without being sent.
    let entries: Vec<AuditEntry> = sqlx::query_as(
        "SELECT a.id, a.action, u.email AS actor_email, s.name AS site_name, a.target_type, a.target_id,
                a.detail - 'from' - 'to' - 'before' - 'after' AS detail,
                (jsonb_exists(a.detail, 'from') AND jsonb_exists(a.detail, 'to'))
                  OR (jsonb_exists(a.detail, 'before') AND jsonb_exists(a.detail, 'after')) AS has_changes,
                a.created_at
           FROM audit_log a
           LEFT JOIN admin_users u ON u.id = a.actor_user_id
           LEFT JOIN sites s ON s.id = a.site_id
          WHERE ($1::text IS NULL OR s.slug = $1)
            AND ($2::timestamptz IS NULL OR a.created_at < $2)
          ORDER BY a.created_at DESC LIMIT 200",
    )
    .bind(query.site)
    .bind(query.before)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(entries))
}

pub(super) async fn passkeys(state: &SharedState, user_id: Uuid) -> Result<Vec<Passkey>, ApiError> {
    let rows: Vec<Value> = sqlx::query_scalar("SELECT passkey FROM admin_passkeys WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&state.pool)
        .await?;
    rows.into_iter()
        .map(|raw| {
            serde_json::from_value(raw).map_err(|e| ApiError::Internal(format!("stored passkey: {e}")))
        })
        .collect()
}

pub(super) async fn store_challenge(
    state: &SharedState,
    kind: &str,
    invite_id: Option<Uuid>,
    user_id: Option<Uuid>,
    name: Option<&str>,
    ceremony: Value,
) -> Result<Uuid, ApiError> {
    let id = Uuid::now_v7();
    // Expired ceremonies are pruned opportunistically.
    sqlx::query("DELETE FROM admin_challenges WHERE expires_at < now()")
        .execute(&state.pool)
        .await?;
    sqlx::query(
        "INSERT INTO admin_challenges (id, kind, invite_id, user_id, name, state, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))",
    )
    .bind(id)
    .bind(kind)
    .bind(invite_id)
    .bind(user_id)
    .bind(name)
    .bind(ceremony)
    .bind(challenge_ttl_secs() as f64)
    .execute(&state.pool)
    .await?;
    Ok(id)
}

#[derive(sqlx::FromRow)]
pub(super) struct Challenge {
    invite_id: Option<Uuid>,
    pub(super) user_id: Option<Uuid>,
    name: Option<String>,
    pub(super) state: Value,
}

/// Removes and returns a live ceremony: each challenge can be finished once.
pub(super) async fn consume_challenge(
    state: &SharedState,
    id: Uuid,
    kind: &str,
) -> Result<Challenge, ApiError> {
    sqlx::query_as(
        "DELETE FROM admin_challenges WHERE id = $1 AND kind = $2 AND expires_at > now()
      RETURNING invite_id, user_id, name, state",
    )
    .bind(id)
    .bind(kind)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::Unauthorized(
        "This sign-in attempt expired. Please try again.",
    ))
}
