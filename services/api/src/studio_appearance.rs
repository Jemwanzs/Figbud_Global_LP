//! The Admin Studio's own appearance (owner's brief, 12 Nov 2026): Settings &
//! Security → Appearance & themes. Light and dark colours for the Studio
//! itself (page, sidebar, cards, hover, text, borders, form fields, buttons,
//! links, status colours and the glow), plus shared brand colours. It never
//! touches a website: websites have their own themes (`site_theme`).
//!
//! Owners save drafts (warnings allowed) and publish; publishing refuses
//! unreadable text (WCAG AA 4.5:1) so no one can make the Studio unusable.
//! Each published appearance is kept (newest ten) for rollback; saves are
//! version-checked and audited. An empty appearance is the built-in palette.

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::get,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    brand::config::{contrast, parse_hex},
    error::{ApiError, FieldError},
    routes::SharedState,
};

const MAX_HISTORY: usize = 10;
const MAX_SWATCHES: usize = 16;

/// One mode's Studio colours. Unset means the built-in palette; a mode that
/// sets any sets the core together, so it can be checked.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct StudioMode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidebar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hover: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_muted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub danger: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glow: Option<String>,
    /// The glow's strength, 0–40 %.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glow_intensity: Option<u8>,
}

impl StudioMode {
    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }

    fn colours_mut(&mut self) -> [&mut Option<String>; 15] {
        [
            &mut self.background,
            &mut self.sidebar,
            &mut self.surface,
            &mut self.hover,
            &mut self.field,
            &mut self.border,
            &mut self.text,
            &mut self.text_muted,
            &mut self.action,
            &mut self.action_text,
            &mut self.accent_text,
            &mut self.success,
            &mut self.warning,
            &mut self.danger,
            &mut self.glow,
        ]
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Swatch {
    pub name: String,
    pub hex: String,
}

/// Brand colours shared by both modes.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Shared {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub palette: Vec<Swatch>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Appearance {
    #[serde(skip_serializing_if = "StudioMode::is_empty")]
    pub light: StudioMode,
    #[serde(skip_serializing_if = "StudioMode::is_empty")]
    pub dark: StudioMode,
    #[serde(skip_serializing_if = "Shared::is_default")]
    pub shared: Shared,
}

impl Shared {
    fn is_default(&self) -> bool {
        self == &Self::default()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Version {
    pub published_at: String,
    pub by: Option<String>,
    pub appearance: Appearance,
}

fn colour(errors: &mut Vec<FieldError>, value: &mut Option<String>, field: &'static str) {
    if let Some(v) = value {
        *v = v.trim().to_ascii_lowercase();
        if v.is_empty() {
            *value = None;
        } else if parse_hex(v).is_none() {
            errors.push(FieldError {
                field,
                code: "format",
                message: "Use a six-digit hex colour such as #f28c38.",
            });
        }
    }
}

fn readable(
    errors: &mut Vec<FieldError>,
    fg: &str,
    backs: &[&str],
    field: &'static str,
    message: &'static str,
) {
    if backs.iter().any(|b| contrast(fg, b).unwrap_or(0.0) < 4.5) {
        errors.push(FieldError {
            field,
            code: "contrast",
            message,
        });
    }
}

fn check_mode(errors: &mut Vec<FieldError>, m: &mut StudioMode, field: &'static str, strict: bool) {
    let before = errors.len();
    for value in m.colours_mut() {
        colour(errors, value, field);
    }
    if m.glow_intensity.is_some_and(|i| i > 40) {
        errors.push(FieldError {
            field,
            code: "range",
            message: "The glow's intensity is 0 to 40 %.",
        });
    }
    if !strict || errors.len() > before || m.is_empty() {
        return;
    }
    let core = [
        &m.background,
        &m.sidebar,
        &m.surface,
        &m.hover,
        &m.border,
        &m.text,
        &m.text_muted,
        &m.action,
        &m.action_text,
        &m.accent_text,
        &m.success,
        &m.warning,
        &m.danger,
    ];
    if core.iter().any(|c| c.is_none()) {
        errors.push(FieldError {
            field,
            code: "incomplete",
            message: "Set every colour of the mode (form fields and the glow are optional), so it can be checked.",
        });
        return;
    }
    let get = |v: &Option<String>| v.clone().unwrap_or_default();
    let (bg, sidebar, surface, hover) = (
        get(&m.background),
        get(&m.sidebar),
        get(&m.surface),
        get(&m.hover),
    );
    let mut panels = vec![bg.as_str(), sidebar.as_str(), surface.as_str(), hover.as_str()];
    let field_bg = m.field.clone();
    if let Some(f) = field_bg.as_deref() {
        panels.push(f);
    }
    readable(
        errors,
        &get(&m.text),
        &panels,
        field,
        "Headings and text need at least 4.5:1 on every background, card, hover and field.",
    );
    readable(
        errors,
        &get(&m.text_muted),
        &panels,
        field,
        "Body text needs at least 4.5:1 on every background, card, hover and field.",
    );
    readable(
        errors,
        &get(&m.accent_text),
        &[&bg, &sidebar, &surface],
        field,
        "Links and active labels need at least 4.5:1 on the page, sidebar and cards.",
    );
    readable(
        errors,
        &get(&m.action_text),
        &[&get(&m.action)],
        field,
        "Button text needs at least 4.5:1 on the button colour.",
    );
    for (status, message) in [
        (
            &m.success,
            "Success messages need at least 4.5:1 on the page and cards.",
        ),
        (&m.warning, "Warnings need at least 4.5:1 on the page and cards."),
        (&m.danger, "Errors need at least 4.5:1 on the page and cards."),
    ] {
        readable(errors, &get(status), &[&bg, &surface], field, message);
    }
}

impl Appearance {
    /// Checks and tidies; publishing (`strict`) enforces readability.
    pub fn check(&mut self, strict: bool) -> Vec<FieldError> {
        let mut e = Vec::new();
        colour(&mut e, &mut self.shared.primary, "shared");
        colour(&mut e, &mut self.shared.secondary, "shared");
        if self.shared.palette.len() > MAX_SWATCHES {
            e.push(FieldError {
                field: "shared",
                code: "too_many",
                message: "Up to 16 palette colours.",
            });
        }
        for s in &mut self.shared.palette {
            s.name = s.name.trim().to_owned();
            let mut hex = Some(std::mem::take(&mut s.hex));
            colour(&mut e, &mut hex, "shared");
            s.hex = hex.unwrap_or_default();
            if s.name.is_empty() || s.name.chars().count() > 40 || s.hex.is_empty() {
                e.push(FieldError {
                    field: "shared",
                    code: "name",
                    message: "Each palette colour needs a name (up to 40 characters) and a hex value.",
                });
            }
        }
        check_mode(&mut e, &mut self.light, "light", strict);
        check_mode(&mut e, &mut self.dark, "dark", strict);
        e
    }
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/studio/appearance", get(public))
        .route("/v1/admin/studio-appearance", get(read).post(update))
}

struct Row {
    published: Appearance,
    draft: Option<Appearance>,
    history: Vec<Version>,
    version: i32,
}

async fn load(pool: &PgPool) -> Result<Row, ApiError> {
    let (published, draft, history, version): (Value, Option<Value>, Value, i32) =
        sqlx::query_as("SELECT published, draft, history, version FROM studio_appearance WHERE id")
            .fetch_one(pool)
            .await?;
    Ok(Row {
        // Anything unreadable falls back to the built-in palette.
        published: serde_json::from_value(published).unwrap_or_default(),
        draft: draft.and_then(|d| serde_json::from_value(d).ok()),
        history: serde_json::from_value(history).unwrap_or_default(),
        version,
    })
}

/// What the Studio applies: the published colours (no draft, no history).
async fn public(State(state): State<SharedState>) -> Result<impl IntoResponse, ApiError> {
    let row = load(&state.pool).await?;
    Ok((
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(json!({ "appearance": row.published })),
    ))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let row = load(&state.pool).await?;
    Ok(Json(json!({
        "appearance": row.published,
        "draft": row.draft,
        "history": row.history,
        "version": row.version,
        "can_edit": session.user.role == Role::Owner,
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    appearance: Appearance,
    draft: Option<Appearance>,
    version: i32,
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    // Every Studio user sees it: owners decide.
    session.require(Role::Owner)?;
    let row = load(&state.pool).await?;
    let mut next = input.appearance;
    let mut errors = next.check(true);
    let mut draft = input.draft;
    if let Some(d) = &mut draft {
        errors.extend(d.check(false));
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    let published = next != row.published;
    let mut history = row.history.clone();
    if published {
        history.insert(
            0,
            Version {
                published_at: Utc::now().to_rfc3339(),
                by: Some(session.user.name.clone()),
                appearance: next.clone(),
            },
        );
        history.truncate(MAX_HISTORY);
    }
    let value = |v: &Appearance| serde_json::to_value(v).map_err(|e| ApiError::Internal(e.to_string()));
    let saved: Option<i32> = sqlx::query_scalar(
        "UPDATE studio_appearance SET published = $1, draft = $2, history = $3, version = version + 1,
                updated_by = $4, updated_at = now()
          WHERE id AND version = $5 RETURNING version",
    )
    .bind(value(&next)?)
    .bind(draft.as_ref().map(value).transpose()?)
    .bind(serde_json::to_value(&history).map_err(|e| ApiError::Internal(e.to_string()))?)
    .bind(session.user.id)
    .bind(input.version)
    .fetch_optional(&state.pool)
    .await?;
    if saved.is_none() {
        return Err(ApiError::Conflict(
            "Someone changed the Studio's appearance after you opened it. Reload to see the latest.",
        ));
    }
    let action = if published {
        "studio.appearance_published"
    } else {
        "studio.appearance_draft_saved"
    };
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail)
         VALUES ($1, $2, $3, 'studio', 'appearance', $4)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(action)
    .bind(json!({ "before": row.published, "after": next, "draft": draft }))
    .execute(&state.pool)
    .await?;
    read(State(state), session).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The built-in dark palette (packages/brand/src/tokens.css, `[data-studio]`).
    fn dark() -> Value {
        json!({
            "background": "#0c0806", "sidebar": "#130d09", "surface": "#1a120d", "hover": "#241810",
            "border": "#4a3e35", "text": "#f8f1e8", "text_muted": "#e3d4c3", "action": "#f28c38",
            "action_text": "#2a170c", "accent_text": "#f28c38", "success": "#4ade80", "warning": "#fbbf24",
            "danger": "#f87171", "glow": "#f28c38", "glow_intensity": 22
        })
    }

    fn codes(value: Value, strict: bool) -> Vec<(&'static str, &'static str)> {
        let mut a: Appearance = serde_json::from_value(value).unwrap();
        a.check(strict).into_iter().map(|e| (e.field, e.code)).collect()
    }

    #[test]
    fn a_readable_appearance_publishes() {
        assert!(codes(json!({ "dark": dark() }), true).is_empty());
        assert!(codes(json!({}), true).is_empty(), "empty is the built-in palette");
    }

    #[test]
    fn unreadable_colours_wait_in_the_draft() {
        let mut bad = dark();
        bad["text_muted"] = json!("#3a2a20");
        assert_eq!(codes(json!({ "dark": bad }), true), [("dark", "contrast")]);
        assert!(codes(json!({ "dark": bad }), false).is_empty());
        let mut buttons = dark();
        buttons["action_text"] = json!("#f8f1e8");
        assert_eq!(codes(json!({ "dark": buttons }), true), [("dark", "contrast")]);
        let mut field = dark();
        field["field"] = json!("#f8f1e8");
        assert!(codes(json!({ "dark": field }), true).contains(&("dark", "contrast")));
    }

    #[test]
    fn modes_are_complete_and_colours_valid() {
        assert_eq!(
            codes(json!({ "light": { "background": "#ffffff" } }), true),
            [("light", "incomplete")]
        );
        assert_eq!(
            codes(json!({ "light": { "text": "brown" } }), false),
            [("light", "format")]
        );
        let mut glow = dark();
        glow["glow_intensity"] = json!(80);
        assert_eq!(codes(json!({ "dark": glow }), false), [("dark", "range")]);
        assert_eq!(
            codes(
                json!({ "shared": { "palette": [{ "name": "", "hex": "#ffffff" }] } }),
                false
            ),
            [("shared", "name")]
        );
        assert!(serde_json::from_value::<Appearance>(json!({ "dark": { "sidebar_glow": "#fff" } })).is_err());
    }
}
