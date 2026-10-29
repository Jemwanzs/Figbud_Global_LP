//! Privacy & Cookies (P7-PC1): the cookie banner's settings and consent records.
//!
//! The websites show a consent banner from these settings. Only strictly
//! necessary storage is used until a visitor chooses; analytics and marketing
//! integrations load only for the categories they allow. Integrations are a
//! fixed list of providers configured by ID (never pasted scripts), and the
//! websites' Content Security Policy allows only those providers.
//!
//! Consent records prove a choice without personal data: a random ID kept in
//! the visitor's consent cookie, the choices, the policy version and the
//! website. They are deleted after the configured number of months.

use std::{net::SocketAddr, time::Duration};

use axum::{
    Json, Router,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::sync::watch;
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    rate_limit::client_ip,
    routes::SharedState,
};

pub const RETENTION_DAYS: std::ops::RangeInclusive<u16> = 30..=395;
pub const RECORD_MONTHS: std::ops::RangeInclusive<u16> = 6..=60;
const MAX_INTEGRATIONS: usize = 8;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Banner {
    pub title: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Category {
    pub label: String,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Categories {
    pub necessary: Category,
    pub analytics: Category,
    pub preferences: Category,
    pub marketing: Category,
}

/// The providers the websites know how to load (and their CSP allows).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Plausible,
    GoogleAnalytics,
    MetaPixel,
    LinkedinInsight,
}

impl Provider {
    /// The consent category that must be granted before it loads.
    pub fn category(self) -> &'static str {
        match self {
            Self::Plausible | Self::GoogleAnalytics => "analytics",
            Self::MetaPixel | Self::LinkedinInsight => "marketing",
        }
    }

    /// The shape of the provider's ID: a domain for Plausible, otherwise the
    /// ID the provider issues.
    fn valid_id(self, id: &str) -> bool {
        let digits = |min: usize, max: usize| {
            (min..=max).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
        };
        match self {
            Self::Plausible => {
                (4..=100).contains(&id.len())
                    && id.contains('.')
                    && !id.starts_with(['.', '-'])
                    && !id.ends_with(['.', '-'])
                    && id
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
            }
            Self::GoogleAnalytics => id.strip_prefix("G-").is_some_and(|rest| {
                (4..=12).contains(&rest.len())
                    && rest.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
            }),
            Self::MetaPixel => digits(10, 20),
            Self::LinkedinInsight => digits(4, 12),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Integration {
    pub provider: Provider,
    pub tracking_id: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PrivacyConfig {
    pub banner: Banner,
    pub categories: Categories,
    /// How long a visitor's choice is remembered before they are asked again.
    pub retention_days: u16,
    /// How long consent records are kept.
    pub record_months: u16,
    /// A path on the website ("/legal/privacy") or an https:// address.
    pub privacy_url: String,
    pub cookie_url: String,
    #[serde(default)]
    pub integrations: Vec<Integration>,
    /// Raised when visitors must choose again (set by the server).
    #[serde(default = "first_version")]
    pub policy_version: i32,
}

fn first_version() -> i32 {
    1
}

impl Default for PrivacyConfig {
    fn default() -> Self {
        let category = |label: &str, description: &str| Category {
            label: label.into(),
            description: description.into(),
        };
        Self {
            banner: Banner {
                title: "Your privacy matters".into(),
                body: "We use essential cookies to keep our website working. With your permission, we may also use optional cookies to understand website usage and improve your experience.".into(),
            },
            categories: Categories {
                necessary: category(
                    "Strictly necessary",
                    "Keep the website working and secure: they remember your cookie choices, your theme and your language, and protect forms from abuse. Always on.",
                ),
                analytics: category(
                    "Analytics",
                    "Help us understand how the website is used, such as which pages are visited, so we can improve it.",
                ),
                preferences: category(
                    "Preferences",
                    "Remember optional personal settings beyond the essentials, to tailor your experience.",
                ),
                marketing: category(
                    "Marketing",
                    "Measure the reach of our marketing and show relevant FigBud content on other websites.",
                ),
            },
            retention_days: 180,
            record_months: 24,
            privacy_url: "/legal/privacy".into(),
            cookie_url: "/legal/cookies".into(),
            integrations: Vec::new(),
            policy_version: 1,
        }
    }
}

fn text(errors: &mut Vec<FieldError>, value: &mut String, field: &'static str, max: usize) {
    *value = value.trim().to_owned();
    if value.is_empty() || value.chars().count() > max {
        errors.push(FieldError {
            field,
            code: "length",
            message: "Required, and within the length limit.",
        });
    }
}

/// A path on the website ("/legal/privacy") or an https:// address.
pub(crate) fn valid_link(value: &str) -> bool {
    let path_ok = |p: &str| {
        p.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'-' | b'_' | b'.' | b'#'))
    };
    value.len() <= 200
        && (value.starts_with('/') && !value.starts_with("//") && path_ok(value)
            || value.strip_prefix("https://").is_some_and(|rest| {
                !rest.is_empty()
                    && !rest.contains(char::is_whitespace)
                    && !rest.contains(['<', '>', '"', '\''])
            }))
}

impl PrivacyConfig {
    /// Checks and normalises an edited configuration (the policy version is
    /// the server's and is set by the caller).
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut e = Vec::new();
        text(&mut e, &mut self.banner.title, "banner.title", 80);
        text(&mut e, &mut self.banner.body, "banner.body", 400);
        let c = &mut self.categories;
        for (cat, label, description) in [
            (
                &mut c.necessary,
                "categories.necessary.label",
                "categories.necessary.description",
            ),
            (
                &mut c.analytics,
                "categories.analytics.label",
                "categories.analytics.description",
            ),
            (
                &mut c.preferences,
                "categories.preferences.label",
                "categories.preferences.description",
            ),
            (
                &mut c.marketing,
                "categories.marketing.label",
                "categories.marketing.description",
            ),
        ] {
            text(&mut e, &mut cat.label, label, 40);
            text(&mut e, &mut cat.description, description, 300);
        }
        if !RETENTION_DAYS.contains(&self.retention_days) {
            e.push(FieldError {
                field: "retention_days",
                code: "range",
                message: "Remember choices for 30 to 395 days (about 13 months).",
            });
        }
        if !RECORD_MONTHS.contains(&self.record_months) {
            e.push(FieldError {
                field: "record_months",
                code: "range",
                message: "Keep consent records for 6 to 60 months.",
            });
        }
        for (field, value) in [
            ("privacy_url", &mut self.privacy_url),
            ("cookie_url", &mut self.cookie_url),
        ] {
            *value = value.trim().to_owned();
            if !valid_link(value) {
                e.push(FieldError {
                    field,
                    code: "format",
                    message: "Use a path on the website such as /legal/privacy, or an https:// address.",
                });
            }
        }
        if self.integrations.len() > MAX_INTEGRATIONS {
            e.push(FieldError {
                field: "integrations",
                code: "too_many",
                message: "Up to 8 integrations.",
            });
        }
        for integration in &mut self.integrations {
            integration.tracking_id = integration.tracking_id.trim().to_owned();
        }
        for (i, integration) in self.integrations.iter().enumerate() {
            if !integration.provider.valid_id(&integration.tracking_id) {
                e.push(FieldError {
                    field: "integrations.tracking_id",
                    code: "format",
                    message: "That ID doesn't match the provider's format.",
                });
            }
            if self.integrations[..i]
                .iter()
                .any(|o| o.provider == integration.provider)
            {
                e.push(FieldError {
                    field: "integrations.provider",
                    code: "duplicate",
                    message: "Each provider can be added once.",
                });
            }
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    fn enabled(&self) -> impl Iterator<Item = &Integration> {
        self.integrations.iter().filter(|i| i.enabled)
    }

    /// What the websites need: the texts, links and the integrations to load.
    pub fn public(&self) -> Value {
        json!({
            "banner": self.banner,
            "categories": self.categories,
            "retention_days": self.retention_days,
            "privacy_url": self.privacy_url,
            "cookie_url": self.cookie_url,
            "policy_version": self.policy_version,
            "integrations": self.enabled().map(|i| json!({
                "provider": i.provider,
                "tracking_id": i.tracking_id,
                "category": i.provider.category(),
            })).collect::<Vec<_>>(),
        })
    }
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/privacy", get(public_settings))
        .route("/v1/privacy/consent", post(record_consent))
        .route("/v1/admin/privacy", get(admin_read).post(admin_update))
}

/// The saved settings and their version (defaults until first saved).
async fn load(
    pool: &PgPool,
) -> Result<(PrivacyConfig, i32, Option<DateTime<Utc>>, Option<String>), ApiError> {
    let row: Option<(Value, i32, DateTime<Utc>, Option<String>)> = sqlx::query_as(
        "SELECT p.config, p.version, p.updated_at, u.email
           FROM privacy_settings p LEFT JOIN admin_users u ON u.id = p.updated_by",
    )
    .fetch_optional(pool)
    .await?;
    Ok(match row {
        Some((config, version, at, by)) => (
            serde_json::from_value(config).map_err(|e| ApiError::Internal(e.to_string()))?,
            version,
            Some(at),
            by,
        ),
        None => (PrivacyConfig::default(), 0, None, None),
    })
}

async fn public_settings(State(state): State<SharedState>) -> Result<impl IntoResponse, ApiError> {
    let (config, ..) = load(&state.pool).await?;
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        )],
        Json(config.public()),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConsentInput {
    consent_id: Uuid,
    site: String,
    action: String,
    analytics: bool,
    preferences: bool,
    marketing: bool,
    policy_version: i32,
}

async fn record_consent(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Result<Json<ConsentInput>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    // The address only counts requests here; it is never stored.
    let ip = client_ip(&headers, peer, state.config.trust_proxy);
    state
        .consent_limiter
        .check(ip)
        .map_err(|retry| ApiError::RateLimited {
            retry_after_secs: retry.as_secs().max(1),
        })?;
    let Json(input) = body.map_err(|_| ApiError::BadRequest("Request body must be valid JSON."))?;
    let all = input.analytics && input.preferences && input.marketing;
    let none = !(input.analytics || input.preferences || input.marketing);
    let consistent = match input.action.as_str() {
        "accept_all" => all,
        "reject_optional" => none,
        "custom" => true,
        _ => false,
    };
    if !consistent {
        return Err(ApiError::BadRequest("The action doesn't match the choices."));
    }
    let (config, ..) = load(&state.pool).await?;
    if !(1..=config.policy_version).contains(&input.policy_version) {
        return Err(ApiError::BadRequest("Unknown policy version."));
    }
    let known: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM sites WHERE slug = $1)")
        .bind(&input.site)
        .fetch_one(&state.pool)
        .await?;
    if !known {
        return Err(ApiError::BadRequest("Unknown website."));
    }
    sqlx::query(
        "INSERT INTO consent_records (id, consent_id, site, action, analytics, preferences, marketing, policy_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(Uuid::now_v7())
    .bind(input.consent_id)
    .bind(&input.site)
    .bind(&input.action)
    .bind(input.analytics)
    .bind(input.preferences)
    .bind(input.marketing)
    .bind(input.policy_version)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Totals for the last 30 days: choices made, and the share of visitors whose
/// latest choice allows each optional category.
async fn report(pool: &PgPool) -> Result<Value, sqlx::Error> {
    let (total, accept_all, reject_optional, custom): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT count(*),
                count(*) FILTER (WHERE action = 'accept_all'),
                count(*) FILTER (WHERE action = 'reject_optional'),
                count(*) FILTER (WHERE action = 'custom')
           FROM consent_records WHERE created_at > now() - interval '30 days'",
    )
    .fetch_one(pool)
    .await?;
    let (visitors, analytics, preferences, marketing): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE analytics), count(*) FILTER (WHERE preferences),
                count(*) FILTER (WHERE marketing)
           FROM (SELECT DISTINCT ON (consent_id) analytics, preferences, marketing
                   FROM consent_records WHERE created_at > now() - interval '30 days'
                  ORDER BY consent_id, created_at DESC) latest",
    )
    .fetch_one(pool)
    .await?;
    Ok(json!({
        "days": 30,
        "choices": { "total": total, "accept_all": accept_all, "reject_optional": reject_optional, "custom": custom },
        "visitors": visitors,
        "allowed": { "analytics": analytics, "preferences": preferences, "marketing": marketing },
    }))
}

async fn admin_read(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let (config, version, updated_at, updated_by) = load(&state.pool).await?;
    Ok(Json(json!({
        "config": config,
        "version": version,
        "updated_at": updated_at,
        "updated_by": updated_by,
        "report": report(&state.pool).await?,
        "can_edit": session.user.role >= Role::Owner,
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    config: PrivacyConfig,
    /// The version the editor started from (0 before the first save).
    version: i32,
    /// Ask every visitor to choose again.
    #[serde(default)]
    ask_again: bool,
}

async fn admin_update(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    // Consent settings decide what tracking may run: owners only.
    session.require(Role::Owner)?;
    let (current, version, ..) = load(&state.pool).await?;
    if input.version != version {
        return Err(ApiError::Conflict(
            "Someone changed these settings after you opened them. Reload to see the latest.",
        ));
    }
    let mut next = input.config.normalise().map_err(ApiError::Validation)?;
    // Visitors choose again when asked, or when a provider starts loading
    // that their earlier choice didn't cover.
    let new_provider = next
        .enabled()
        .any(|i| !current.enabled().any(|o| o.provider == i.provider));
    let reconsent = input.ask_again || new_provider;
    next.policy_version = current.policy_version + i32::from(reconsent);
    let value = serde_json::to_value(&next).map_err(|e| ApiError::Internal(e.to_string()))?;
    let saved: Option<i32> = if version == 0 {
        sqlx::query_scalar(
            "INSERT INTO privacy_settings (id, config, version, updated_by) VALUES (true, $1, 1, $2)
             ON CONFLICT (id) DO NOTHING RETURNING version",
        )
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_scalar(
            "UPDATE privacy_settings SET config = $1, version = version + 1, updated_by = $2, updated_at = now()
              WHERE version = $3 RETURNING version",
        )
        .bind(&value)
        .bind(session.user.id)
        .bind(version)
        .fetch_optional(&state.pool)
        .await?
    };
    if saved.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed these settings after you opened them. Reload to see the latest.",
        ));
    }
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail)
         VALUES ($1, $2, 'privacy.updated', 'privacy', 'settings', $3)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(json!({ "before": current, "after": next, "visitors_asked_again": reconsent }))
    .execute(&state.pool)
    .await?;
    admin_read(State(state), session).await
}

/// Deletes consent records older than the configured number of months.
pub async fn purge(pool: &PgPool) -> Result<u64, ApiError> {
    let (config, ..) = load(pool).await?;
    let deleted =
        sqlx::query("DELETE FROM consent_records WHERE created_at < now() - make_interval(months => $1)")
            .bind(i32::from(config.record_months))
            .execute(pool)
            .await?
            .rows_affected();
    Ok(deleted)
}

/// Runs [`purge`] now and then every `every`, until shutdown.
pub async fn run_purger(pool: PgPool, every: Duration, mut shutdown: watch::Receiver<bool>) {
    let mut ticker = tokio::time::interval(every);
    loop {
        tokio::select! {
            _ = ticker.tick() => match purge(&pool).await {
                Ok(0) => {}
                Ok(deleted) => tracing::info!(deleted, "expired consent records deleted"),
                Err(err) => tracing::warn!(error = %err, "consent record purge failed"),
            },
            _ = shutdown.changed() => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert!(PrivacyConfig::default().normalise().is_ok());
    }

    #[test]
    fn provider_ids_are_checked() {
        assert!(Provider::GoogleAnalytics.valid_id("G-AB12CD34"));
        assert!(!Provider::GoogleAnalytics.valid_id("UA-1234-1"));
        assert!(!Provider::GoogleAnalytics.valid_id("G-<script>"));
        assert!(Provider::Plausible.valid_id("figbudglobal.com"));
        assert!(!Provider::Plausible.valid_id("figbud global.com"));
        assert!(Provider::MetaPixel.valid_id("123456789012345"));
        assert!(!Provider::MetaPixel.valid_id("12345"));
        assert!(Provider::LinkedinInsight.valid_id("1234567"));
    }

    #[test]
    fn links_are_paths_or_https() {
        assert!(valid_link("/legal/cookies"));
        assert!(valid_link("https://example.com/privacy"));
        assert!(!valid_link("//evil.example"));
        assert!(!valid_link("javascript:alert(1)"));
        assert!(!valid_link("http://example.com"));
        assert!(!valid_link("https://example.com/\"onload"));
    }

    #[test]
    fn duplicate_providers_and_ranges_are_rejected() {
        let config = PrivacyConfig {
            retention_days: 400,
            integrations: vec![
                Integration {
                    provider: Provider::Plausible,
                    tracking_id: "figbud.com".into(),
                    enabled: true,
                },
                Integration {
                    provider: Provider::Plausible,
                    tracking_id: "figbud.com".into(),
                    enabled: false,
                },
            ],
            ..PrivacyConfig::default()
        };
        let errors = config.normalise().unwrap_err();
        let fields: Vec<_> = errors.iter().map(|e| e.field).collect();
        assert!(fields.contains(&"retention_days"));
        assert!(fields.contains(&"integrations.provider"));
    }
}
