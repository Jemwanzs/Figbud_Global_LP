use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

use crate::{
    config::{Config, EmailMode},
    email::{self, outbox, templates},
    enquiry::{EnquiryInput, new_reference},
    error::ApiError,
    rate_limit::{RateLimiter, client_ip},
};

pub struct AppState {
    pub config: Config,
    pub pool: sqlx::PgPool,
    pub enquiry_limiter: RateLimiter,
}

pub type SharedState = Arc<AppState>;

const REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

pub fn router(state: SharedState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(
            state
                .config
                .cors_allowed_origins
                .iter()
                .filter_map(|origin| HeaderValue::from_str(origin).ok()),
        ))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, HeaderName::from_static("idempotency-key")])
        .max_age(Duration::from_secs(3600));

    Router::new()
        .route("/health", get(health))
        .route("/health/ready", get(ready))
        .route("/v1/enquiries", post(create_enquiry))
        .with_state(state)
        .layer(RequestBodyLimitLayer::new(16 * 1024))
        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(15),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(PropagateRequestIdLayer::new(REQUEST_ID))
        .layer(TraceLayer::new_for_http())
        .layer(SetRequestIdLayer::new(REQUEST_ID, MakeRequestUuid))
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "figbud-api",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Serialize)]
struct Readiness {
    status: &'static str,
    database: &'static str,
    email_mode: &'static str,
}

async fn ready(State(state): State<SharedState>) -> impl IntoResponse {
    let database_ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    let email_mode = match state.config.email.mode {
        EmailMode::Log => "log",
        EmailMode::Hold => "hold",
        EmailMode::Resend { .. } => "resend",
    };
    let status = if database_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(Readiness {
            status: if database_ok { "ready" } else { "degraded" },
            database: if database_ok { "ok" } else { "unreachable" },
            email_mode,
        }),
    )
}

#[derive(Serialize)]
struct EnquiryCreated {
    reference: String,
    status: &'static str,
}

async fn create_enquiry(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Result<Json<EnquiryInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let ip = client_ip(&headers, peer, state.config.trust_proxy);
    state
        .enquiry_limiter
        .check(ip)
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;

    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| Uuid::parse_str(v.trim()).ok())
        .ok_or(ApiError::BadRequest(
            "A valid Idempotency-Key header (UUID) is required.",
        ))?;

    let Json(input) = body.map_err(|_| ApiError::BadRequest("Request body must be valid JSON."))?;

    let min_fill_ms = state.config.min_form_fill.as_millis() as u64;
    let automated = input.looks_automated(min_fill_ms);
    let enquiry = input.validate().map_err(ApiError::Validation)?;

    // A replayed submission returns the original reference instead of a duplicate.
    if let Some(reference) = existing_reference(&state.pool, idempotency_key).await? {
        return Ok((
            StatusCode::OK,
            Json(EnquiryCreated {
                reference,
                status: "received",
            }),
        ));
    }

    let id = Uuid::now_v7();
    let reference = new_reference(chrono::Utc::now());
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|ua| ua.chars().take(400).collect::<String>());
    let ip_hash = hex::encode(Sha256::digest(format!("{}:{ip}", state.config.ip_hash_salt)));

    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO enquiries (id, reference, idempotency_key, kind, product, name, email, company, job_title,
                                phone, country, company_size, message, locale, source_path, user_agent, ip_hash,
                                is_spam, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(id)
    .bind(&reference)
    .bind(idempotency_key)
    .bind(enquiry.kind.as_str())
    .bind(enquiry.product.as_str())
    .bind(&enquiry.name)
    .bind(&enquiry.email)
    .bind(&enquiry.company)
    .bind(&enquiry.job_title)
    .bind(&enquiry.phone)
    .bind(&enquiry.country)
    .bind(&enquiry.company_size)
    .bind(&enquiry.message)
    .bind(&enquiry.locale)
    .bind(&enquiry.source_path)
    .bind(user_agent)
    .bind(ip_hash)
    .bind(automated)
    .bind(if automated { "spam" } else { "new" })
    .execute(&mut *tx)
    .await?;

    if inserted.rows_affected() == 0 {
        // Lost a race with a concurrent replay of the same submission.
        tx.rollback().await?;
        let reference = existing_reference(&state.pool, idempotency_key)
            .await?
            .ok_or_else(|| ApiError::Internal("idempotent enquiry vanished".into()))?;
        return Ok((
            StatusCode::OK,
            Json(EnquiryCreated {
                reference,
                status: "received",
            }),
        ));
    }

    // Automated submissions are stored for review but never trigger email.
    if !automated {
        let email_config = &state.config.email;
        // Empty while no recipients are configured: the worker resolves them
        // from the enquiry when it delivers, so held notifications reach the team.
        let team = email::team_recipients(email_config, &enquiry);
        let notification = templates::team_notification(&enquiry, &reference);
        outbox::enqueue(&mut tx, id, &team, Some(&enquiry.email), &notification).await?;

        if email_config.send_acknowledgements {
            let acknowledgement = templates::visitor_acknowledgement(&enquiry, &reference);
            let to = [enquiry.email.clone()];
            outbox::enqueue(
                &mut tx,
                id,
                &to,
                email_config.reply_to.as_deref(),
                &acknowledgement,
            )
            .await?;
        }
    } else {
        tracing::info!(%reference, "enquiry flagged as automated; email suppressed");
    }
    tx.commit().await?;

    tracing::info!(%reference, kind = enquiry.kind.as_str(), product = enquiry.product.as_str(), "enquiry received");
    Ok((
        StatusCode::CREATED,
        Json(EnquiryCreated {
            reference,
            status: "received",
        }),
    ))
}

async fn existing_reference(pool: &sqlx::PgPool, key: Uuid) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT reference FROM enquiries WHERE idempotency_key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
}
