//! Display time zone (owner's brief, 14 Nov 2026). Every timestamp is stored
//! and sent in UTC; the Studio shows it in the organisation's zone (East
//! Africa Time, `Africa/Nairobi`, by default), or in a person's own zone
//! where they chose one. Only zones from a fixed list are accepted, the same
//! list the Studio offers (`apps/figbud-web/src/lib/time.ts`).

use axum::{
    Json, Router,
    extract::State,
    response::IntoResponse,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::{AdminSession, Role, audit};
use crate::{
    error::{ApiError, FieldError},
    routes::SharedState,
};

/// Must match `TIME_ZONES` in `apps/figbud-web/src/lib/time.ts`.
pub const TIME_ZONES: [&str; 22] = [
    "Africa/Nairobi",
    "Africa/Kampala",
    "Africa/Dar_es_Salaam",
    "Africa/Kigali",
    "Africa/Addis_Ababa",
    "Africa/Lagos",
    "Africa/Accra",
    "Africa/Johannesburg",
    "Africa/Cairo",
    "Africa/Casablanca",
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Riyadh",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Shanghai",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
];

pub const DEFAULT_TIME_ZONE: &str = "Africa/Nairobi";

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/time-zone", get(read).post(set_organisation))
        .route("/v1/admin/security/time-zone", post(set_own))
}

fn check(zone: &str) -> Result<(), ApiError> {
    if TIME_ZONES.contains(&zone) {
        Ok(())
    } else {
        Err(ApiError::Validation(vec![FieldError {
            field: "time_zone",
            code: "unknown",
            message: "Choose a time zone from the list.",
        }]))
    }
}

async fn organisation(pool: &PgPool) -> Result<String, sqlx::Error> {
    let zone: Option<String> = sqlx::query_scalar("SELECT time_zone FROM studio_settings")
        .fetch_optional(pool)
        .await?;
    Ok(zone.unwrap_or_else(|| DEFAULT_TIME_ZONE.to_owned()))
}

/// The organisation's zone, this person's own choice, and the one to show.
pub async fn for_user(pool: &PgPool, user: Uuid) -> Result<Value, sqlx::Error> {
    let org = organisation(pool).await?;
    let own: Option<String> = sqlx::query_scalar("SELECT time_zone FROM admin_users WHERE id = $1")
        .bind(user)
        .fetch_optional(pool)
        .await?
        .flatten();
    let effective = own.clone().unwrap_or_else(|| org.clone());
    Ok(json!({ "organisation": org, "own": own, "effective": effective }))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let mut zones = for_user(&state.pool, session.user.id).await?;
    zones["can_edit"] = json!(session.user.role >= Role::Owner);
    Ok(Json(zones))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OrganisationInput {
    time_zone: String,
}

/// Owners only: it changes how every timestamp is shown to everyone following it.
async fn set_organisation(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<OrganisationInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    check(&input.time_zone)?;
    let before = organisation(&state.pool).await?;
    sqlx::query("UPDATE studio_settings SET time_zone = $1, updated_at = now(), updated_by = $2")
        .bind(&input.time_zone)
        .bind(session.user.id)
        .execute(&state.pool)
        .await?;
    if before != input.time_zone {
        audit(
            &state.pool,
            Some(session.user.id),
            "studio.time_zone_changed",
            None,
            json!({ "before": before, "after": input.time_zone }),
            None,
        )
        .await?;
    }
    Ok(Json(for_user(&state.pool, session.user.id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnInput {
    /// `null`: follow the organisation's zone.
    time_zone: Option<String>,
}

/// Anyone, for themselves.
async fn set_own(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<OwnInput>,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(zone) = &input.time_zone {
        check(zone)?;
    }
    sqlx::query("UPDATE admin_users SET time_zone = $1 WHERE id = $2")
        .bind(&input.time_zone)
        .bind(session.user.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(for_user(&state.pool, session.user.id).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_zones_are_accepted_and_the_default_is_east_africa_time() {
        assert!(check("Africa/Nairobi").is_ok());
        assert!(check("UTC").is_ok());
        assert!(check("Mars/Olympus_Mons").is_err());
        assert!(check("").is_err());
        assert_eq!(DEFAULT_TIME_ZONE, "Africa/Nairobi");
        assert!(TIME_ZONES.contains(&DEFAULT_TIME_ZONE));
    }
}
