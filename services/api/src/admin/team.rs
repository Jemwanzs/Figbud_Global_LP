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
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let members: Vec<Member> = sqlx::query_as(
        "SELECT id, email, name, role, all_sites, last_login_at, disabled_at, created_at FROM admin_users
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
