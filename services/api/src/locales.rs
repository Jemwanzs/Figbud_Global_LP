//! Localisation workflow (P7-G2): Settings & Security → Languages. Each
//! translated language of FigBud Global is a draft (it renders for review,
//! falls back to English and isn't indexed) until an owner publishes it with
//! a recorded human review: who reviewed it, when, and where the review is
//! kept. Publishing puts it in sitemaps, `hreflang` and indexing; unpublishing
//! takes it out again. Every change is version-checked and audited.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    routes::SharedState,
};

#[derive(Serialize, FromRow)]
struct Review {
    code: String,
    status: String,
    reviewer: String,
    reviewed_on: Option<NaiveDate>,
    evidence: String,
    note: String,
    version: i32,
    updated_at: chrono::DateTime<Utc>,
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/locales", get(public))
        .route("/v1/admin/locales", get(read))
        .route("/v1/admin/locales/{code}", post(update))
}

/// Published languages, for the websites (English is always published).
async fn public(State(state): State<SharedState>) -> Result<impl IntoResponse, ApiError> {
    let codes: Vec<String> =
        sqlx::query_scalar("SELECT code FROM locale_reviews WHERE status = 'published' ORDER BY code")
            .fetch_all(&state.pool)
            .await?;
    let published: Vec<String> = std::iter::once("en".to_owned()).chain(codes).collect();
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        )],
        Json(json!({ "published": published })),
    ))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let reviews: Vec<Review> = sqlx::query_as(
        "SELECT code, status, reviewer, reviewed_on, evidence, note, version, updated_at
           FROM locale_reviews ORDER BY array_position(ARRAY['sw','fr','ar','zh'], code)",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        json!({ "locales": reviews, "can_edit": session.user.role == Role::Owner }),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    status: String,
    #[serde(default)]
    reviewer: String,
    #[serde(default)]
    reviewed_on: Option<NaiveDate>,
    #[serde(default)]
    evidence: String,
    #[serde(default)]
    note: String,
    version: i32,
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(code): Path<String>,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    // Which languages search engines see is the owner's decision.
    session.require(Role::Owner)?;
    let (reviewer, evidence, note) = (input.reviewer.trim(), input.evidence.trim(), input.note.trim());
    let mut errors = Vec::new();
    if !matches!(input.status.as_str(), "draft" | "published") {
        errors.push(field("status", "invalid", "Choose draft or published."));
    }
    if reviewer.chars().count() > 120 || evidence.chars().count() > 300 || note.chars().count() > 300 {
        errors.push(field("reviewer", "length", "That text is too long."));
    }
    if input.reviewed_on.is_some_and(|d| d > Utc::now().date_naive()) {
        errors.push(field(
            "reviewed_on",
            "future",
            "The review date can't be in the future.",
        ));
    }
    if input.status == "published" {
        if reviewer.is_empty() {
            errors.push(field(
                "reviewer",
                "required",
                "Name who reviewed the translation.",
            ));
        }
        if input.reviewed_on.is_none() {
            errors.push(field("reviewed_on", "required", "Give the date of the review."));
        }
        if evidence.is_empty() {
            errors.push(field("evidence", "required", "Record where the review is kept."));
        }
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    let before: Option<String> = sqlx::query_scalar("SELECT status FROM locale_reviews WHERE code = $1")
        .bind(&code)
        .fetch_optional(&state.pool)
        .await?;
    let before = before.ok_or(ApiError::NotFound)?;
    let saved: Option<i32> = sqlx::query_scalar(
        "UPDATE locale_reviews SET status = $2, reviewer = $3, reviewed_on = $4, evidence = $5, note = $6,
                version = version + 1, updated_by = $7, updated_at = now()
          WHERE code = $1 AND version = $8 RETURNING version",
    )
    .bind(&code)
    .bind(&input.status)
    .bind(reviewer)
    .bind(input.reviewed_on)
    .bind(evidence)
    .bind(note)
    .bind(session.user.id)
    .bind(input.version)
    .fetch_optional(&state.pool)
    .await?;
    if saved.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed this language after you opened it. Reload to see the latest.",
        ));
    }
    let action = match (before.as_str(), input.status.as_str()) {
        ("draft", "published") => "locale.published",
        ("published", "draft") => "locale.unpublished",
        _ => "locale.review_recorded",
    };
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail)
         VALUES ($1, $2, $3, 'locale', $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(action)
    .bind(&code)
    .bind(json!({ "status": input.status, "reviewer": reviewer, "reviewed_on": input.reviewed_on, "evidence": evidence }))
    .execute(&state.pool)
    .await?;
    read(State(state), session).await
}
