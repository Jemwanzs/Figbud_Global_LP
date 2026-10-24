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
    /// Local development: render and log messages, record them as `skipped`
    /// (simulated, never delivered) and never call a provider.
    Log,
    /// No provider configured yet: messages are stored in the outbox as
    /// `pending` and delivered once `EMAIL_MODE=resend` is set. The default
    /// outside development, so nothing is ever lost or falsely marked sent.
    Hold,
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
    pub ziwa_recipients: Vec<String>,
    pub partnership_recipients: Vec<String>,
    pub send_acknowledgements: bool,
    pub worker_interval: Duration,
}

/// Admin sign-in (passkeys). Present only when an admin origin is configured.
#[derive(Debug, Clone)]
pub struct AdminConfig {
    /// The origin the admin UI is served from, e.g. `https://figbudglobal.com`.
    /// Passkeys are bound to it, and state-changing requests must come from it.
    pub origin: url::Url,
    /// WebAuthn relying-party id: the origin's host unless overridden.
    pub rp_id: String,
    pub session_ttl: Duration,
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
    /// `None` disables every admin endpoint.
    pub admin: Option<AdminConfig>,
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

        let mode = parse_email_mode(
            app_env,
            optional("EMAIL_MODE").as_deref(),
            optional("RESEND_API_KEY"),
        )?;

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

        let admin = parse_admin(
            app_env,
            optional("ADMIN_ORIGIN").as_deref(),
            optional("ADMIN_RP_ID"),
            parse_or("ADMIN_SESSION_HOURS", 12)?,
        )?;

        Ok(Self {
            app_env,
            admin,
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
                ziwa_recipients: list("EMAIL_RECIPIENTS_ZIWA"),
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

/// Admin is on when `ADMIN_ORIGIN` is set, and by default in development
/// (`http://localhost:3000`). Production requires an `https` origin.
fn parse_admin(
    app_env: AppEnv,
    origin: Option<&str>,
    rp_id: Option<String>,
    session_hours: u64,
) -> Result<Option<AdminConfig>, ConfigError> {
    let origin = match (origin, app_env) {
        (Some(raw), _) => raw,
        (None, AppEnv::Development) => "http://localhost:3000",
        (None, _) => return Ok(None),
    };
    let invalid = |reason: &str| ConfigError::Invalid {
        name: "ADMIN_ORIGIN",
        reason: reason.into(),
    };
    let url = url::Url::parse(origin).map_err(|_| invalid("not a valid URL"))?;
    if url.path() != "/" || url.query().is_some() {
        return Err(invalid("must be an origin without a path"));
    }
    if app_env.is_production() && url.scheme() != "https" {
        return Err(invalid("must use https in production"));
    }
    let host = url.host_str().ok_or_else(|| invalid("has no host"))?.to_owned();
    if !(1..=720).contains(&session_hours) {
        return Err(ConfigError::Invalid {
            name: "ADMIN_SESSION_HOURS",
            reason: "expected 1..=720".into(),
        });
    }
    Ok(Some(AdminConfig {
        origin: url,
        rp_id: rp_id.unwrap_or(host),
        session_ttl: Duration::from_secs(session_hours * 3600),
    }))
}

/// Resolves `EMAIL_MODE`. Unset means `log` in development and `hold`
/// elsewhere; `log` is refused in production because it would record
/// simulated messages instead of keeping them for real delivery.
fn parse_email_mode(
    app_env: AppEnv,
    raw: Option<&str>,
    resend_api_key: Option<String>,
) -> Result<EmailMode, ConfigError> {
    match raw {
        None if app_env == AppEnv::Development => Ok(EmailMode::Log),
        None | Some("hold") => Ok(EmailMode::Hold),
        Some("log") if app_env.is_production() => Err(ConfigError::Invalid {
            name: "EMAIL_MODE",
            reason: "log is for development only; use hold until Resend is configured".into(),
        }),
        Some("log") => Ok(EmailMode::Log),
        Some("resend") => Ok(EmailMode::Resend {
            api_key: resend_api_key.ok_or(ConfigError::Missing("RESEND_API_KEY"))?,
        }),
        Some(other) => Err(ConfigError::Invalid {
            name: "EMAIL_MODE",
            reason: format!("expected log|hold|resend, got {other}"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_defaults_to_localhost_only_in_development() {
        let dev = parse_admin(AppEnv::Development, None, None, 12).unwrap().unwrap();
        assert_eq!(
            (dev.origin.as_str(), dev.rp_id.as_str()),
            ("http://localhost:3000/", "localhost")
        );
        assert!(parse_admin(AppEnv::Production, None, None, 12).unwrap().is_none());
    }

    #[test]
    fn admin_origin_is_validated() {
        let prod = parse_admin(AppEnv::Production, Some("https://figbudglobal.com"), None, 12)
            .unwrap()
            .unwrap();
        assert_eq!(prod.rp_id, "figbudglobal.com");
        assert!(parse_admin(AppEnv::Production, Some("http://figbudglobal.com"), None, 12).is_err());
        assert!(parse_admin(AppEnv::Production, Some("https://x.com/admin"), None, 12).is_err());
        assert!(parse_admin(AppEnv::Production, Some("https://x.com"), None, 0).is_err());
    }

    #[test]
    fn email_mode_defaults_to_log_only_in_development() {
        assert_eq!(
            parse_email_mode(AppEnv::Development, None, None).unwrap(),
            EmailMode::Log
        );
        assert_eq!(
            parse_email_mode(AppEnv::Staging, None, None).unwrap(),
            EmailMode::Hold
        );
        assert_eq!(
            parse_email_mode(AppEnv::Production, None, None).unwrap(),
            EmailMode::Hold
        );
    }

    #[test]
    fn production_refuses_simulated_delivery() {
        assert!(parse_email_mode(AppEnv::Production, Some("log"), None).is_err());
        assert_eq!(
            parse_email_mode(AppEnv::Staging, Some("log"), None).unwrap(),
            EmailMode::Log
        );
    }

    #[test]
    fn resend_requires_an_api_key() {
        assert!(parse_email_mode(AppEnv::Production, Some("resend"), None).is_err());
        assert_eq!(
            parse_email_mode(AppEnv::Production, Some("resend"), Some("re_test".into())).unwrap(),
            EmailMode::Resend {
                api_key: "re_test".into()
            }
        );
        assert!(parse_email_mode(AppEnv::Production, Some("smtp"), None).is_err());
    }
}
