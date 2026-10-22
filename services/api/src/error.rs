use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FieldError {
    pub field: &'static str,
    pub code: &'static str,
    pub message: &'static str,
}

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("validation failed")]
    Validation(Vec<FieldError>),
    #[error("bad request: {0}")]
    BadRequest(&'static str),
    #[error("not found")]
    NotFound,
    #[error("unauthorized: {0}")]
    Unauthorized(&'static str),
    #[error("forbidden")]
    Forbidden,
    #[error("conflict: {0}")]
    Conflict(&'static str),
    /// Forbidden, with a reason the person can act on.
    #[error("not permitted: {0}")]
    NotPermitted(&'static str),
    #[error("rate limited")]
    RateLimited { retry_after_secs: u64 },
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: ErrorPayload<'a>,
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    code: &'a str,
    message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<&'a [FieldError]>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message, fields) = match &self {
            ApiError::Validation(fields) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_failed",
                "Some fields need attention.",
                Some(fields.as_slice()),
            ),
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, "bad_request", *message, None),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found", "Not found.", None),
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, "unauthorized", *message, None),
            ApiError::Conflict(message) => (StatusCode::CONFLICT, "conflict", *message, None),
            ApiError::NotPermitted(message) => (StatusCode::FORBIDDEN, "forbidden", *message, None),
            ApiError::Forbidden => (
                StatusCode::FORBIDDEN,
                "forbidden",
                "You don't have permission to do that.",
                None,
            ),
            ApiError::RateLimited { .. } => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                "Too many submissions. Please try again shortly.",
                None,
            ),
            ApiError::Database(err) => {
                tracing::error!(error = %err, "database error");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "unavailable",
                    "We couldn't save your request right now. Please try again.",
                    None,
                )
            }
            ApiError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_error",
                    "Something went wrong on our side.",
                    None,
                )
            }
        };

        let mut response = (
            status,
            Json(ErrorBody {
                error: ErrorPayload {
                    code,
                    message,
                    fields,
                },
            }),
        )
            .into_response();

        if let ApiError::RateLimited { retry_after_secs } = self
            && let Ok(value) = HeaderValue::from_str(&retry_after_secs.to_string())
        {
            response.headers_mut().insert(header::RETRY_AFTER, value);
        }
        response
    }
}
