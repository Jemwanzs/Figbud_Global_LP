//! Per-website settings (P7-E2, P7-ZR1): navigation, footer and whether the
//! website takes enquiries. Managed in Admin Studio → Websites → a website →
//! Navigation, footer & forms.
//!
//! Like page visibility, these are operational switches: reviewers change
//! them directly (no approval round), every change is audited with the
//! values before and after, and the websites pick them up within minutes.
//! Closing enquiries is enforced here, at `POST /v1/enquiries`, not only by
//! hiding buttons; enquiries already received are never touched.

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    brand::config::{contrast, parse_hex},
    error::{ApiError, FieldError},
    privacy::valid_link,
    routes::SharedState,
    sites::audit_site,
};

const MAX_LINKS: usize = 8;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub label: String,
    /// A path on the website ("/platform") or an https:// address.
    pub href: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum NavMode {
    /// The website's published pages marked "Show in navigation".
    #[default]
    Pages,
    /// The links listed here, in this order.
    Custom,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Navigation {
    pub mode: NavMode,
    pub items: Vec<Link>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Footer {
    /// A short line under the website's name.
    pub note: Option<String>,
    pub links: Vec<Link>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Enquiries {
    pub open: bool,
    /// Shown instead of the form while closed (the websites have a default).
    pub closed_message: Option<String>,
}

impl Default for Enquiries {
    fn default() -> Self {
        Self {
            open: true,
            closed_message: None,
        }
    }
}

/// Colours of the section bands editors can give page sections (P7-E1).
/// Unset means the shared design system's neutral bands.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Theme {
    /// Behind "brand" sections, with white text on it (at least 4.5:1).
    pub brand_section: Option<String>,
    /// Behind "soft" sections in light mode, with the theme's dark text
    /// on it (at least 4.5:1); dark mode uses a deep tint of the brand band.
    pub soft_section: Option<String>,
}

/// Motion on the website's home page (UI-MO2). Rotation is off unless an
/// editor turns it on; the websites still pause it on hover, focus, any
/// interaction and while it's off screen, and never run it for visitors who
/// prefer reduced motion.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Motion {
    /// Slowly move the product showcase from one product to the next.
    pub product_rotation: bool,
    /// Seconds on each product while rotating.
    pub rotation_seconds: u8,
}

impl Default for Motion {
    fn default() -> Self {
        Self {
            product_rotation: false,
            rotation_seconds: 9,
        }
    }
}

const ROTATION_SECONDS: std::ops::RangeInclusive<u8> = 6..=20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct WebsiteSettings {
    pub navigation: Navigation,
    pub footer: Footer,
    pub enquiries: Enquiries,
    pub theme: Theme,
    pub motion: Motion,
}

/// Body and muted text colours of the light theme (packages/brand/src/tokens.css).
const LIGHT_TEXT: [&str; 2] = ["#0f172a", "#475569"];

fn check_colour(
    errors: &mut Vec<FieldError>,
    value: &mut Option<String>,
    field: &'static str,
    against: &[&str],
    message: &'static str,
) {
    *value = value
        .as_deref()
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty());
    let Some(colour) = value.as_deref() else { return };
    if parse_hex(colour).is_none() {
        errors.push(FieldError {
            field,
            code: "format",
            message: "Use a six-digit hex colour such as #4e2d17.",
        });
    } else if against
        .iter()
        .any(|text| contrast(colour, text).unwrap_or(0.0) < 4.5)
    {
        errors.push(FieldError {
            field,
            code: "contrast",
            message,
        });
    }
}

fn check_links(errors: &mut Vec<FieldError>, links: &mut [Link], field: &'static str) {
    if links.len() > MAX_LINKS {
        errors.push(FieldError {
            field,
            code: "too_many",
            message: "Up to 8 links.",
        });
    }
    for link in links.iter_mut() {
        link.label = link.label.trim().to_owned();
        link.href = link.href.trim().to_owned();
        if link.label.is_empty() || link.label.chars().count() > 40 {
            errors.push(FieldError {
                field,
                code: "label",
                message: "Every link needs a label of up to 40 characters.",
            });
        }
        if !valid_link(&link.href) {
            errors.push(FieldError {
                field,
                code: "href",
                message: "Links go to a page path such as /platform, or an https:// address.",
            });
        }
    }
}

fn optional_text(errors: &mut Vec<FieldError>, value: &mut Option<String>, field: &'static str, max: usize) {
    *value = value
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    if value.as_ref().is_some_and(|v| v.chars().count() > max) {
        errors.push(FieldError {
            field,
            code: "length",
            message: "That text is too long.",
        });
    }
}

impl WebsiteSettings {
    /// Reads stored settings; anything unreadable falls back to the defaults.
    pub fn from_stored(value: Value) -> Self {
        serde_json::from_value(value).unwrap_or_default()
    }

    /// Checks and tidies an edited document.
    pub fn normalise(mut self, corporate: bool) -> Result<Self, Vec<FieldError>> {
        let mut e = Vec::new();
        check_links(&mut e, &mut self.navigation.items, "navigation.items");
        if self.navigation.mode == NavMode::Custom && self.navigation.items.is_empty() {
            e.push(FieldError {
                field: "navigation.items",
                code: "required",
                message: "Add at least one link, or use the website's pages.",
            });
        }
        check_links(&mut e, &mut self.footer.links, "footer.links");
        optional_text(&mut e, &mut self.footer.note, "footer.note", 200);
        optional_text(
            &mut e,
            &mut self.enquiries.closed_message,
            "enquiries.closed_message",
            300,
        );
        check_colour(
            &mut e,
            &mut self.theme.brand_section,
            "theme.brand_section",
            &["#ffffff"],
            "Too light: white text on it must stay readable (at least 4.5:1).",
        );
        check_colour(
            &mut e,
            &mut self.theme.soft_section,
            "theme.soft_section",
            &LIGHT_TEXT,
            "Too dark: the page's text on it must stay readable (at least 4.5:1).",
        );
        if !ROTATION_SECONDS.contains(&self.motion.rotation_seconds) {
            e.push(FieldError {
                field: "motion.rotation_seconds",
                code: "range",
                message: "Between 6 and 20 seconds, so visitors have time to read.",
            });
        }
        if corporate && !self.enquiries.open {
            e.push(FieldError {
                field: "enquiries.open",
                code: "corporate",
                message: "The corporate website always takes enquiries.",
            });
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    /// What the websites need.
    pub fn public(&self) -> Value {
        json!({
            "navigation": self.navigation,
            "footer": self.footer,
            "enquiries": self.enquiries,
            "theme": self.theme,
            "motion": self.motion,
        })
    }
}

/// Whether the website for this product takes enquiries (unknown: yes).
pub async fn enquiries_open(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
    let open: Option<bool> = sqlx::query_scalar(
        "SELECT COALESCE((settings->'enquiries'->>'open')::boolean, true) FROM sites WHERE slug = $1",
    )
    .bind(slug)
    .fetch_optional(pool)
    .await?;
    Ok(open.unwrap_or(true))
}

pub fn router() -> Router<SharedState> {
    Router::new().route("/v1/admin/sites/{slug}/settings", get(read).post(update))
}

struct Site {
    id: Uuid,
    kind: String,
    archived: bool,
    settings: WebsiteSettings,
    version: i32,
}

async fn load(pool: &PgPool, slug: &str) -> Result<Site, ApiError> {
    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        kind: String,
        archived_at: Option<DateTime<Utc>>,
        settings: Value,
        settings_version: i32,
    }
    let row: Row =
        sqlx::query_as("SELECT id, kind, archived_at, settings, settings_version FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_optional(pool)
            .await?
            .ok_or(ApiError::NotFound)?;
    Ok(Site {
        id: row.id,
        kind: row.kind,
        archived: row.archived_at.is_some(),
        settings: WebsiteSettings::from_stored(row.settings),
        version: row.settings_version,
    })
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = load(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    // Published pages, offered as navigation and footer destinations.
    let pages: Vec<(String, String, bool)> = sqlx::query_as(
        "SELECT path, title, show_in_nav FROM pages
          WHERE site_id = $1 AND archived_at IS NULL AND published IS NOT NULL AND NOT offline
          ORDER BY position, title",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({
        "settings": site.settings,
        "version": site.version,
        "corporate": site.kind == "corporate",
        "can_edit": session.site_role(site.id) >= Some(Role::Reviewer) && !site.archived,
        "pages": pages.into_iter().map(|(path, title, show_in_nav)| json!({
            "path": format!("/{path}"), "title": title, "show_in_nav": show_in_nav,
        })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    settings: WebsiteSettings,
    version: i32,
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let site = load(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Reviewer)?;
    if site.archived {
        return Err(ApiError::Conflict("Restore this website first."));
    }
    let next = input
        .settings
        .normalise(site.kind == "corporate")
        .map_err(ApiError::Validation)?;
    let value = serde_json::to_value(&next).map_err(|e| ApiError::Internal(e.to_string()))?;
    let saved: Option<i32> = sqlx::query_scalar(
        "UPDATE sites SET settings = $3, settings_version = settings_version + 1
          WHERE slug = $1 AND settings_version = $2 RETURNING settings_version",
    )
    .bind(&slug)
    .bind(input.version)
    .bind(&value)
    .fetch_optional(&state.pool)
    .await?;
    if saved.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed these settings after you opened them. Reload to see the latest.",
        ));
    }
    let action = match (site.settings.enquiries.open, next.enquiries.open) {
        (true, false) => "site.enquiries_closed",
        (false, true) => "site.enquiries_opened",
        _ => "site.settings_updated",
    };
    audit_site(
        &state.pool,
        &session,
        site.id,
        action,
        json!({ "before": site.settings, "after": next }),
    )
    .await?;
    read(State(state), session, Path(slug)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(label: &str, href: &str) -> Link {
        Link {
            label: label.into(),
            href: href.into(),
        }
    }

    #[test]
    fn empty_documents_mean_the_defaults() {
        let settings = WebsiteSettings::from_stored(json!({}));
        assert_eq!(settings, WebsiteSettings::default());
        assert!(settings.enquiries.open);
        assert_eq!(settings.navigation.mode, NavMode::Pages);
        assert_eq!(
            WebsiteSettings::from_stored(json!({ "nonsense": 1 })),
            WebsiteSettings::default()
        );
    }

    #[test]
    fn links_are_checked_and_tidied() {
        let mut settings = WebsiteSettings {
            navigation: Navigation {
                mode: NavMode::Custom,
                items: vec![
                    link("  Platform ", " /platform "),
                    link("Docs", "https://docs.example.com"),
                ],
            },
            ..WebsiteSettings::default()
        };
        let ok = settings.clone().normalise(false).unwrap();
        assert_eq!(ok.navigation.items[0], link("Platform", "/platform"));

        settings.footer.links = vec![link("", "javascript:alert(1)")];
        let fields: Vec<_> = settings
            .normalise(false)
            .unwrap_err()
            .iter()
            .map(|e| e.code)
            .collect();
        assert!(fields.contains(&"label") && fields.contains(&"href"));
    }

    #[test]
    fn theme_colours_keep_text_readable() {
        let theme = |brand: &str, soft: &str| WebsiteSettings {
            theme: Theme {
                brand_section: Some(brand.into()),
                soft_section: Some(soft.into()),
            },
            ..WebsiteSettings::default()
        };
        // Ziwa's brown and ivory.
        let ok = theme(" #4E2D17 ", "#FDF9F4").normalise(false).unwrap();
        assert_eq!(ok.theme.brand_section.as_deref(), Some("#4e2d17"));
        let codes: Vec<_> = theme("#ffc642", "#4e2d17")
            .normalise(false)
            .unwrap_err()
            .iter()
            .map(|e| (e.field, e.code))
            .collect();
        assert_eq!(
            codes,
            [
                ("theme.brand_section", "contrast"),
                ("theme.soft_section", "contrast")
            ]
        );
        assert_eq!(
            theme("brown", "#fff").normalise(false).unwrap_err()[0].code,
            "format"
        );
    }

    #[test]
    fn custom_navigation_needs_links_and_the_corporate_site_stays_open() {
        let mut settings = WebsiteSettings::default();
        settings.navigation.mode = NavMode::Custom;
        settings.enquiries.open = false;
        assert!(settings.clone().normalise(false).is_err());
        settings.navigation.mode = NavMode::Pages;
        assert!(settings.clone().normalise(false).is_ok());
        let errors = settings.normalise(true).unwrap_err();
        assert_eq!(errors[0].field, "enquiries.open");
    }

    #[test]
    fn product_rotation_is_off_by_default_and_never_too_fast() {
        let settings = WebsiteSettings::from_stored(json!({}));
        assert!(!settings.motion.product_rotation);
        let on = WebsiteSettings::from_stored(
            json!({ "motion": { "product_rotation": true, "rotation_seconds": 8 } }),
        );
        assert!(on.clone().normalise(true).unwrap().motion.product_rotation);
        assert_eq!(on.public()["motion"]["rotation_seconds"], 8);
        for seconds in [2, 30] {
            let mut fast = on.clone();
            fast.motion.rotation_seconds = seconds;
            assert_eq!(
                fast.normalise(true).unwrap_err()[0].field,
                "motion.rotation_seconds"
            );
        }
    }
}
