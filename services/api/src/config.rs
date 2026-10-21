//! Environment-driven configuration. Every secret and deployment-specific
//! value comes from the environment; nothing production-specific is baked in.

use std::{env, net::SocketAddr, time::Duration};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable {0}")]
    Missing(&'static str),
    #[error("invalid value for {name}: {reason}")]
    Invalid { name: &'static str, reason: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEnv {
    Development,
    Staging,
    Production,
}

impl AppEnv {
    pub fn is_production(self) -> bool {
        matches!(self, AppEnv::Production)
    }
}

/// How outbound email is delivered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmailMode {
    /// Render and log messages, mark them as delivered, never call a provider.
    Log,
    /// Deliver through the Resend HTTP API.
    Resend { api_key: String },
}

#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub mode: EmailMode,
    /// Verified sender, e.g. `FigBud Global <hello@notify.example.com>`.
    pub from: String,
    pub reply_to: Option<String>,
    /// Default recipients for all team notifications.
    pub team_recipients: Vec<String>,
    pub zirahr_recipients: Vec<String>,
    pub jasiri_recipients: Vec<String>,
    pub expense_now_recipients: Vec<String>,
    pub partnership_recipients: Vec<String>,
    pub send_acknowledgements: bool,
    pub worker_interval: Duration,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub app_env: AppEnv,
    pub bind_addr: SocketAddr,
    pub database_url: String,
    pub database_max_connections: u32,
    pub cors_allowed_origins: Vec<String>,
    /// Trust the left-most `X-Forwarded-For` hop (set when behind Railway's proxy).
    pub trust_proxy: bool,
    pub ip_hash_salt: String,
    pub enquiry_rate_limit: u32,
    pub enquiry_rate_window: Duration,
    /// Submissions completed faster than this are treated as automated.
    pub min_form_fill: Duration,
    pub email: EmailConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let app_env = match optional("APP_ENV").as_deref() {
            None | Some("development") => AppEnv::Development,
            Some("staging") => AppEnv::Staging,
            Some("production") => AppEnv::Production,
            Some(other) => {
                return Err(ConfigError::Invalid {
                    name: "APP_ENV",
                    reason: format!("expected development|staging|production, got {other}"),
                });
            }
        };

        let host = optional("HOST").unwrap_or_else(|| "0.0.0.0".into());
        let port: u16 = parse_or("PORT", 8080)?;
        let bind_addr = format!("{host}:{port}")
            .parse()
            .map_err(|e: std::net::AddrParseError| ConfigError::Invalid {
                name: "HOST",
                reason: e.to_string(),
            })?;

        let ip_hash_salt = match optional("IP_HASH_SALT") {
            Some(salt) => salt,
            None if app_env.is_production() => return Err(ConfigError::Missing("IP_HASH_SALT")),
            None => "local-development-salt".into(),
        };

        let mode = match optional("EMAIL_MODE").as_deref() {
            None | Some("log") => EmailMode::Log,
            Some("resend") => EmailMode::Resend {
                api_key: optional("RESEND_API_KEY").ok_or(ConfigError::Missing("RESEND_API_KEY"))?,
            },
            Some(other) => {
                return Err(ConfigError::Invalid {
                    name: "EMAIL_MODE",
                    reason: format!("expected log|resend, got {other}"),
                });
            }
        };

        let team_recipients = list("EMAIL_TEAM_RECIPIENTS");
        if matches!(mode, EmailMode::Resend { .. }) && team_recipients.is_empty() {
            return Err(ConfigError::Missing("EMAIL_TEAM_RECIPIENTS"));
        }
        let from = match optional("EMAIL_FROM") {
            Some(from) => from,
            None if matches!(mode, EmailMode::Resend { .. }) => {
                return Err(ConfigError::Missing("EMAIL_FROM"));
            }
            None => "FigBud Global <no-reply@localhost>".into(),
        };

        Ok(Self {
            app_env,
            bind_addr,
            database_url: optional("DATABASE_URL").ok_or(ConfigError::Missing("DATABASE_URL"))?,
            database_max_connections: parse_or("DATABASE_MAX_CONNECTIONS", 10)?,
            cors_allowed_origins: list("CORS_ALLOWED_ORIGINS"),
            trust_proxy: parse_or("TRUST_PROXY", false)?,
            ip_hash_salt,
            enquiry_rate_limit: parse_or("ENQUIRY_RATE_LIMIT", 8)?,
            enquiry_rate_window: Duration::from_secs(parse_or("ENQUIRY_RATE_WINDOW_SECS", 600)?),
            min_form_fill: Duration::from_millis(parse_or("MIN_FORM_FILL_MS", 2500)?),
            email: EmailConfig {
                mode,
                from,
                reply_to: optional("EMAIL_REPLY_TO"),
                team_recipients,
                zirahr_recipients: list("EMAIL_RECIPIENTS_ZIRAHR"),
                jasiri_recipients: list("EMAIL_RECIPIENTS_JASIRI"),
                expense_now_recipients: list("EMAIL_RECIPIENTS_EXPENSE_NOW"),
                partnership_recipients: list("EMAIL_RECIPIENTS_PARTNERSHIPS"),
                send_acknowledgements: parse_or("EMAIL_SEND_ACKNOWLEDGEMENTS", true)?,
                worker_interval: Duration::from_secs(parse_or("EMAIL_WORKER_INTERVAL_SECS", 5)?),
            },
        })
    }
}

fn optional(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn list(name: &str) -> Vec<String> {
    optional(name)
        .map(|v| {
            v.split(',')
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn parse_or<T: std::str::FromStr>(name: &'static str, default: T) -> Result<T, ConfigError>
where
    T::Err: std::fmt::Display,
{
    match optional(name) {
        None => Ok(default),
        Some(raw) => raw.parse().map_err(|e: T::Err| ConfigError::Invalid {
            name,
            reason: e.to_string(),
        }),
    }
}
