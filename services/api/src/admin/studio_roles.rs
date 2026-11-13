//! Named Studio roles (P13-B3, the saved, reusable part): owners save a set
//! of Studio areas and actions under a name ("Regional content editor") and
//! give it to people. Each person's own areas (`admin_users.modules`) stay
//! what the API enforces (`modules.rs`); linking someone copies the role's
//! areas to them, and changing a role updates everyone linked to it in the
//! same transaction. Editing someone's areas by hand unlinks them; deleting
//! a role keeps everyone's areas as they were.

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
use sqlx::FromRow;
use uuid::Uuid;

use super::{AdminSession, Role, audit, modules};
use crate::{
    error::{ApiError, FieldError},
    routes::SharedState,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/studio-roles", get(list).post(create))
        .route("/v1/admin/studio-roles/{id}", post(update))
        .route("/v1/admin/studio-roles/{id}/delete", post(delete))
}

#[derive(Serialize, FromRow)]
struct StudioRole {
    id: Uuid,
    name: String,
    modules: Value,
    /// How many people it's given to.
    members: i64,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
struct RoleInput {
    name: String,
    modules: modules::Modules,
}

fn invalid(field: &'static str, message: &'static str) -> ApiError {
    ApiError::Validation(vec![FieldError {
        field,
        code: "invalid",
        message,
    }])
}

/// A checked name and tidied, non-empty areas.
fn check(input: RoleInput) -> Result<(String, modules::Modules), ApiError> {
    let name = input.name.split_whitespace().collect::<Vec<_>>().join(" ");
    if !(2..=60).contains(&name.chars().count()) {
        return Err(invalid("name", "Give the role a name of 2 to 60 characters."));
    }
    let areas = modules::normalise(input.modules).map_err(ApiError::Validation)?;
    if areas.is_empty() {
        return Err(invalid("modules", "Tick at least one area for the role."));
    }
    Ok((name, areas))
}

fn taken(err: sqlx::Error) -> ApiError {
    match &err {
        sqlx::Error::Database(db) if db.constraint() == Some("studio_roles_name_key") => {
            invalid("name", "There's already a role with that name.")
        }
        _ => err.into(),
    }
}

pub(super) async fn list_roles(pool: &sqlx::PgPool) -> Result<Vec<Value>, sqlx::Error> {
    let roles: Vec<StudioRole> = sqlx::query_as(
        "SELECT r.id, r.name, r.modules, r.updated_at,
                (SELECT count(*) FROM admin_users u WHERE u.studio_role_id = r.id AND u.disabled_at IS NULL) AS members
           FROM studio_roles r ORDER BY lower(r.name)",
    )
    .fetch_all(pool)
    .await?;
    Ok(roles.into_iter().map(|r| json!(r)).collect())
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    Ok(Json(json!({ "roles": list_roles(&state.pool).await? })))
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<RoleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let (name, areas) = check(input)?;
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO studio_roles (id, name, modules, created_by) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind(&name)
        .bind(json!(areas))
        .bind(session.user.id)
        .execute(&state.pool)
        .await
        .map_err(taken)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.studio_role_created",
        Some(("studio_role", id.to_string())),
        json!({ "name": name, "modules": areas }),
        None,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "name": name, "modules": areas, "members": 0 })),
    ))
}

/// Renames a role or changes its areas; everyone linked to it gets the new areas at once.
async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<RoleInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let (name, areas) = check(input)?;
    let before: Option<(String, Value)> =
        sqlx::query_as("SELECT name, modules FROM studio_roles WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.pool)
            .await?;
    let (old_name, old_modules) = before.ok_or(ApiError::NotFound)?;
    let value = json!(areas);
    let mut tx = state.pool.begin().await?;
    sqlx::query("UPDATE studio_roles SET name = $2, modules = $3, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(&name)
        .bind(&value)
        .execute(&mut *tx)
        .await
        .map_err(taken)?;
    // Owners are never limited, so a role never reaches them.
    let updated =
        sqlx::query("UPDATE admin_users SET modules = $2 WHERE studio_role_id = $1 AND role <> 'owner'")
            .bind(id)
            .bind(&value)
            .execute(&mut *tx)
            .await?
            .rows_affected();
    tx.commit().await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.studio_role_changed",
        Some(("studio_role", id.to_string())),
        json!({ "name": name, "from": { "name": old_name, "modules": old_modules }, "to": { "name": name, "modules": value },
                "people_updated": updated }),
        None,
    )
    .await?;
    Ok(Json(
        json!({ "id": id, "name": name, "modules": value, "people_updated": updated }),
    ))
}

/// Removes a role; the people who had it keep their areas, unlinked.
async fn delete(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let name: Option<String> = sqlx::query_scalar("DELETE FROM studio_roles WHERE id = $1 RETURNING name")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    let name = name.ok_or(ApiError::NotFound)?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.studio_role_deleted",
        Some(("studio_role", id.to_string())),
        json!({ "name": name }),
        None,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
