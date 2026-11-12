//! The team and per-website permissions (P7-F1). Owners see everyone and
//! decide which websites each person works on: every website with their
//! Studio role, or selected websites, each with a role no higher than it.

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{AdminSession, Role, SiteGrant, audit, grants};
use crate::{
    error::{ApiError, FieldError},
    routes::SharedState,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/team", get(list))
        .route("/v1/admin/team/{id}/access", post(set_access))
        .route("/v1/admin/team/{id}/role", post(set_role))
        .route("/v1/admin/team/{id}/modules", post(set_modules))
        .route("/v1/admin/team/{id}/suspend", post(suspend))
        .route("/v1/admin/team/{id}/reactivate", post(reactivate))
        .route("/v1/admin/team/{id}/sessions/revoke", post(revoke_sessions))
        .route("/v1/admin/invites/pending", get(pending_invites))
        .route("/v1/admin/invites/{id}/revoke", post(revoke_invite))
}

#[derive(Serialize, FromRow)]
struct Member {
    id: Uuid,
    email: String,
    name: String,
    role: String,
    all_sites: bool,
    last_login_at: Option<DateTime<Utc>>,
    disabled_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    /// Whether they can sign in with a password; never the password itself.
    has_password: bool,
    has_two_factor: bool,
    passkeys: i64,
    /// Studio areas (P13-B3); `null`: every area within their role.
    modules: Option<Value>,
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let members: Vec<Member> = sqlx::query_as(
        "SELECT id, email, name, role, all_sites, last_login_at, disabled_at, created_at,
                password_hash IS NOT NULL AS has_password, totp_confirmed_at IS NOT NULL AS has_two_factor,
                (SELECT count(*) FROM admin_passkeys p WHERE p.user_id = admin_users.id) AS passkeys,
                modules
           FROM admin_users
          ORDER BY disabled_at IS NOT NULL, CASE role WHEN 'owner' THEN 0 WHEN 'reviewer' THEN 1
                   WHEN 'editor' THEN 2 ELSE 3 END, name",
    )
    .fetch_all(&state.pool)
    .await?;
    let mut people = Vec::with_capacity(members.len());
    for member in members {
        let sites = if member.all_sites || member.role == "owner" {
            Vec::new()
        } else {
            grants(&state.pool, member.id).await?
        };
        let mut value = json!(member);
        value["all_sites"] = json!(member.all_sites || member.role == "owner");
        value["sites"] = json!(sites);
        people.push(value);
    }
    let sites: Vec<(String, String, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT slug, name, archived_at FROM sites ORDER BY archived_at IS NOT NULL, position, name",
    )
    .fetch_all(&state.pool)
    .await?;
    let sites: Vec<Value> = sites
        .into_iter()
        .map(|(slug, name, archived_at)| json!({ "site": slug, "name": name, "archived": archived_at.is_some() }))
        .collect();
    Ok(Json(json!({ "members": people, "sites": sites })))
}

#[derive(Deserialize)]
pub(super) struct GrantInput {
    site: String,
    role: String,
}

#[derive(Deserialize)]
struct AccessInput {
    all_sites: bool,
    #[serde(default)]
    sites: Vec<GrantInput>,
}

fn invalid(message: &'static str) -> ApiError {
    ApiError::Validation(vec![FieldError {
        field: "sites",
        code: "invalid",
        message,
    }])
}

/// Checks chosen websites for someone with `role`: known websites, each
/// once, roles no higher than `role` (and never owner). Returns `(site_id, role)`.
pub(super) async fn resolve_grants(
    pool: &PgPool,
    role: Role,
    input: &[GrantInput],
) -> Result<Vec<(Uuid, Role)>, ApiError> {
    if role == Role::Owner {
        return Err(invalid("Owners always have every website."));
    }
    if input.is_empty() {
        return Err(invalid(
            "Choose at least one website, or give access to all websites.",
        ));
    }
    let mut resolved: Vec<(Uuid, Role)> = Vec::with_capacity(input.len());
    for grant in input {
        let site_role = match Role::parse(&grant.role) {
            Some(r) if r != Role::Owner => r,
            _ => return Err(invalid("Choose viewer, editor or reviewer for each website.")),
        };
        if site_role > role {
            return Err(invalid(
                "A website role can't be higher than the person's Studio role.",
            ));
        }
        let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM sites WHERE slug = $1")
            .bind(&grant.site)
            .fetch_optional(pool)
            .await?;
        let id = id.ok_or(invalid("One of the chosen websites doesn't exist."))?;
        if resolved.iter().any(|(s, _)| *s == id) {
            return Err(invalid("Each website can be chosen once."));
        }
        resolved.push((id, site_role));
    }
    Ok(resolved)
}

/// Replaces someone's website access (inside the caller's transaction).
pub(super) async fn store_grants(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    granted: Option<&[(Uuid, Role)]>,
    by: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM admin_site_grants WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE admin_users SET all_sites = $2 WHERE id = $1")
        .bind(user_id)
        .bind(granted.is_none())
        .execute(&mut **tx)
        .await?;
    for (site_id, role) in granted.unwrap_or_default() {
        sqlx::query(
            "INSERT INTO admin_site_grants (user_id, site_id, role, granted_by) VALUES ($1, $2, $3, $4)",
        )
        .bind(user_id)
        .bind(site_id)
        .bind(role.as_str())
        .bind(by)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

fn describe(all_sites: bool, sites: &[SiteGrant]) -> Value {
    if all_sites {
        json!({ "all_sites": true })
    } else {
        json!({ "all_sites": false, "sites": sites })
    }
}

async fn set_access(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<AccessInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let target: Option<(String, String, bool)> =
        sqlx::query_as("SELECT email, role, all_sites FROM admin_users WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (email, role, was_all) = target.ok_or(ApiError::NotFound)?;
    let role = Role::parse(&role).ok_or(ApiError::Internal("unknown stored role".into()))?;
    if role == Role::Owner {
        return Err(ApiError::Conflict("Owners always have every website."));
    }
    let granted = if input.all_sites {
        None
    } else {
        Some(resolve_grants(&state.pool, role, &input.sites).await?)
    };
    let before = grants(&state.pool, id).await?;
    let mut tx = state.pool.begin().await?;
    store_grants(&mut tx, id, granted.as_deref(), Some(session.user.id)).await?;
    tx.commit().await?;
    let after = grants(&state.pool, id).await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.access_changed",
        Some(("admin_user", id.to_string())),
        json!({ "email": email, "from": describe(was_all, &before), "to": describe(input.all_sites, &after) }),
        None,
    )
    .await?;
    Ok(Json(
        json!({ "all_sites": input.all_sites, "sites": if input.all_sites { vec![] } else { after } }),
    ))
}

// ---------------------------------------------------------------- Users & Access
// Owner's brief, 12 Nov 2026: change a Studio role, suspend and reactivate,
// sign someone out everywhere, and manage pending invitations. Owners only;
// no one changes their own access this way, the last active owner can't be
// demoted or suspended, and owner-level changes need a recent verification.

struct Target {
    email: String,
    role: Role,
    disabled: bool,
}

async fn target(pool: &PgPool, id: Uuid) -> Result<Target, ApiError> {
    let row: Option<(String, String, bool)> =
        sqlx::query_as("SELECT email, role, disabled_at IS NOT NULL FROM admin_users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    let (email, role, disabled) = row.ok_or(ApiError::NotFound)?;
    let role = Role::parse(&role).ok_or(ApiError::Internal("unknown stored role".into()))?;
    Ok(Target {
        email,
        role,
        disabled,
    })
}

fn not_yourself(session: &AdminSession, id: Uuid) -> Result<(), ApiError> {
    if session.user.id == id {
        return Err(ApiError::Conflict(
            "You can't change your own access here. Another owner can.",
        ));
    }
    Ok(())
}

/// Other active owners besides `id`.
async fn other_owners(pool: &PgPool, id: Uuid) -> Result<i64, ApiError> {
    Ok(sqlx::query_scalar(
        "SELECT count(*) FROM admin_users WHERE role = 'owner' AND disabled_at IS NULL AND id <> $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}

async fn end_sessions(pool: &PgPool, id: Uuid) -> Result<u64, ApiError> {
    Ok(
        sqlx::query("UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL")
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected(),
    )
}

#[derive(Deserialize)]
struct RoleInput {
    role: String,
}

async fn set_role(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<RoleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    not_yourself(&session, id)?;
    let role = Role::parse(&input.role).ok_or(ApiError::Validation(vec![FieldError {
        field: "role",
        code: "invalid",
        message: "Choose owner, reviewer, editor or viewer.",
    }]))?;
    let before = target(&state.pool, id).await?;
    if before.role == role {
        return Ok(Json(json!({ "role": role.as_str(), "changed": false })));
    }
    // Making or unmaking an owner needs a recent verification.
    if role == Role::Owner || before.role == Role::Owner {
        session.require_verified()?;
    }
    if before.role == Role::Owner && other_owners(&state.pool, id).await? == 0 {
        return Err(ApiError::Conflict(
            "The Studio always keeps at least one active owner.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query("UPDATE admin_users SET role = $2 WHERE id = $1")
        .bind(id)
        .bind(role.as_str())
        .execute(&mut *tx)
        .await?;
    if role == Role::Owner {
        // Owners have every website.
        store_grants(&mut tx, id, None, Some(session.user.id)).await?;
    } else {
        // Website roles never rise above the Studio role.
        sqlx::query(
            "UPDATE admin_site_grants SET role = $2 WHERE user_id = $1 AND
                CASE role WHEN 'reviewer' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END >
                CASE $2 WHEN 'reviewer' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END",
        )
        .bind(id)
        .bind(role.as_str())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.role_changed",
        Some(("admin_user", id.to_string())),
        json!({ "email": before.email, "from": before.role.as_str(), "to": role.as_str() }),
        None,
    )
    .await?;
    Ok(Json(json!({ "role": role.as_str(), "changed": true })))
}

async fn suspend(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    not_yourself(&session, id)?;
    let t = target(&state.pool, id).await?;
    if t.disabled {
        return Ok(Json(json!({ "suspended": true })));
    }
    if t.role == Role::Owner {
        session.require_verified()?;
        if other_owners(&state.pool, id).await? == 0 {
            return Err(ApiError::Conflict(
                "The Studio always keeps at least one active owner.",
            ));
        }
    }
    sqlx::query("UPDATE admin_users SET disabled_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    let sessions = end_sessions(&state.pool, id).await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.suspended",
        Some(("admin_user", id.to_string())),
        json!({ "email": t.email, "sessions_ended": sessions }),
        None,
    )
    .await?;
    Ok(Json(json!({ "suspended": true })))
}

async fn reactivate(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    not_yourself(&session, id)?;
    let t = target(&state.pool, id).await?;
    if t.role == Role::Owner {
        session.require_verified()?;
    }
    sqlx::query("UPDATE admin_users SET disabled_at = NULL WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.reactivated",
        Some(("admin_user", id.to_string())),
        json!({ "email": t.email }),
        None,
    )
    .await?;
    Ok(Json(json!({ "suspended": false })))
}

/// Signs someone out of every device (they sign in again as usual).
async fn revoke_sessions(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    not_yourself(&session, id)?;
    let t = target(&state.pool, id).await?;
    let ended = end_sessions(&state.pool, id).await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.sessions_revoked",
        Some(("admin_user", id.to_string())),
        json!({ "email": t.email, "sessions_ended": ended }),
        None,
    )
    .await?;
    Ok(Json(json!({ "sessions_ended": ended })))
}

#[derive(Serialize, FromRow)]
struct PendingInvite {
    id: Uuid,
    email: String,
    role: String,
    invited_by: Option<String>,
    expires_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

/// Invitations not yet accepted, revoked or expired.
async fn pending_invites(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let invites: Vec<PendingInvite> = sqlx::query_as(
        "SELECT i.id, i.email, i.role, u.name AS invited_by, i.expires_at, i.created_at
           FROM admin_invites i LEFT JOIN admin_users u ON u.id = i.created_by
          WHERE i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
          ORDER BY i.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "invites": invites })))
}

async fn revoke_invite(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let email: Option<String> = sqlx::query_scalar(
        "UPDATE admin_invites SET revoked_at = now()
          WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING email",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;
    let email = email.ok_or(ApiError::NotFound)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.invite_revoked",
        Some(("admin_invite", id.to_string())),
        json!({ "email": email }),
        None,
    )
    .await?;
    Ok(Json(json!({ "revoked": true })))
}

/// Sets which Studio areas someone may open and what they may do there
/// (P13-B3). `null` gives back every area within their role. Owners are
/// never limited; it applies from their next request.
async fn set_modules(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<super::modules::ModulesInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    not_yourself(&session, id)?;
    let t = target(&state.pool, id).await?;
    if t.role == Role::Owner {
        return Err(ApiError::Conflict("Owners always have every area."));
    }
    let next = match input.modules {
        None => None,
        Some(m) => Some(super::modules::normalise(m).map_err(ApiError::Validation)?),
    };
    let before: Option<Value> = sqlx::query_scalar("SELECT modules FROM admin_users WHERE id = $1")
        .bind(id)
        .fetch_one(&state.pool)
        .await?;
    let value = next.as_ref().map(|m| json!(m));
    sqlx::query("UPDATE admin_users SET modules = $2 WHERE id = $1")
        .bind(id)
        .bind(&value)
        .execute(&state.pool)
        .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.modules_changed",
        Some(("admin_user", id.to_string())),
        json!({ "email": t.email, "from": before, "to": value }),
        None,
    )
    .await?;
    Ok(Json(json!({ "modules": value })))
}
