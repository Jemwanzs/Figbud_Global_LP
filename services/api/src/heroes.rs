//! Hero Design Studio (P12-H1..H6): Websites → a website → Hero Design Studio.
//!
//! - Each website has its own collection of hero designs (`DESIGNS`); a
//!   website without one (yet) has none, so designs are never copied
//!   between products.
//! - The draft holds saved variants (a design plus its settings) and the one
//!   selected to publish. Settings are a closed schema: text within limits,
//!   safe links, and choices from fixed lists, so edits can't break a design.
//! - Editors save drafts and ask for approval; a different reviewer (owners
//!   may approve their own) publishes. Exactly one variant is live per
//!   website. Every publication is versioned; a reviewer can roll back to an
//!   earlier approved version in one step. Everything is audited.
//! - Websites read only the published variant (`GET /v1/sites/{slug}/hero`);
//!   with none published they keep their existing hero.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    privacy::valid_link,
    routes::SharedState,
    sites::audit_site,
};

/// Each website's hero collection, in order (the first is the default).
pub const DESIGNS: &[(&str, &[&str])] = &[
    ("figbud", &["ecosystem", "cinematic", "universe"]),
    ("zirahr", &["workforce", "payroll", "journey"]),
];

pub fn designs_for(slug: &str) -> &'static [&'static str] {
    DESIGNS
        .iter()
        .find(|(s, _)| *s == slug)
        .map(|(_, d)| *d)
        .unwrap_or(&[])
}

const MAX_VARIANTS: usize = 9;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Speed {
    Slow,
    #[default]
    Normal,
    Fast,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Intensity {
    Subtle,
    #[default]
    Standard,
    Bold,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Height {
    #[default]
    Auto,
    Tall,
    Screen,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Align {
    #[default]
    Start,
    Center,
}

/// Accents within the approved palettes: the brand's own, or its approved secondary hues.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Accent {
    #[default]
    Brand,
    Blue,
    Violet,
    Neutral,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MobileLayout {
    #[default]
    Stacked,
    Compact,
}

/// A variant's settings. Unset text keeps the design's approved copy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct HeroConfig {
    pub eyebrow: Option<String>,
    pub headline: Option<String>,
    pub headline_accent: Option<String>,
    pub lead: Option<String>,
    pub primary_label: Option<String>,
    pub primary_href: Option<String>,
    pub secondary_label: Option<String>,
    pub secondary_href: Option<String>,
    pub motion: bool,
    pub speed: Speed,
    pub intensity: Intensity,
    pub height: Height,
    pub align: Align,
    pub accent: Accent,
    pub mobile_layout: MobileLayout,
    /// Background image from the website's media library (designs that use one).
    pub background_image_id: Option<Uuid>,
}

impl Default for HeroConfig {
    fn default() -> Self {
        Self {
            eyebrow: None,
            headline: None,
            headline_accent: None,
            lead: None,
            primary_label: None,
            primary_href: None,
            secondary_label: None,
            secondary_href: None,
            motion: true,
            speed: Speed::Normal,
            intensity: Intensity::Standard,
            height: Height::Auto,
            align: Align::Start,
            accent: Accent::Brand,
            mobile_layout: MobileLayout::Stacked,
            background_image_id: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Variant {
    pub id: String,
    pub design: String,
    pub name: String,
    #[serde(default)]
    pub config: HeroConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct HeroDraft {
    pub variants: Vec<Variant>,
    /// The variant to publish.
    pub selected: String,
}

fn field(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

fn tidy(value: &mut Option<String>) {
    *value = value
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
}

fn longer(value: &Option<String>, max: usize) -> bool {
    value.as_ref().is_some_and(|v| v.chars().count() > max)
}

/// The names the Studio shows for a website's collection.
pub fn design_name(design: &str) -> &'static str {
    match design {
        "ecosystem" => "Connected Ecosystem",
        "cinematic" => "Beyond the Ordinary",
        "universe" => "The FigBud Universe",
        "workforce" => "Your Workforce, Connected",
        "payroll" => "Payroll in Motion",
        "journey" => "The Employee Journey",
        _ => "Hero",
    }
}

impl HeroDraft {
    /// One variant per design in the website's collection, with its approved copy.
    pub fn starting(slug: &str) -> Self {
        let variants: Vec<Variant> = designs_for(slug)
            .iter()
            .enumerate()
            .map(|(i, design)| Variant {
                id: format!("v{}", i + 1),
                design: (*design).to_owned(),
                name: format!("{:02} · {}", i + 1, design_name(design)),
                config: HeroConfig::default(),
            })
            .collect();
        let selected = variants.first().map(|v| v.id.clone()).unwrap_or_default();
        Self { variants, selected }
    }

    pub fn variant(&self, id: &str) -> Option<&Variant> {
        self.variants.iter().find(|v| v.id == id)
    }

    /// Checks and tidies a draft for this website's collection.
    pub fn normalise(mut self, slug: &str) -> Result<Self, Vec<FieldError>> {
        let designs = designs_for(slug);
        let mut e = Vec::new();
        if self.variants.is_empty() || self.variants.len() > MAX_VARIANTS {
            e.push(field("variants", "count", "Keep between 1 and 9 hero variants."));
        }
        let mut ids = std::collections::HashSet::new();
        for v in &mut self.variants {
            v.id = v.id.trim().to_owned();
            v.name = v.name.trim().to_owned();
            if v.id.is_empty()
                || v.id.len() > 24
                || !v
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                || !ids.insert(v.id.clone())
            {
                e.push(field("variants", "id", "Each variant needs a unique id."));
            }
            if !designs.contains(&v.design.as_str()) {
                e.push(field(
                    "variants",
                    "design",
                    "Choose a design from this website's collection.",
                ));
            }
            if v.name.is_empty() || v.name.chars().count() > 60 {
                e.push(field(
                    "name",
                    "length",
                    "Name each variant (up to 60 characters).",
                ));
            }
            let c = &mut v.config;
            for value in [
                &mut c.eyebrow,
                &mut c.headline,
                &mut c.headline_accent,
                &mut c.lead,
                &mut c.primary_label,
                &mut c.primary_href,
                &mut c.secondary_label,
                &mut c.secondary_href,
            ] {
                tidy(value);
            }
            if longer(&c.eyebrow, 60) || longer(&c.headline, 90) || longer(&c.headline_accent, 60) {
                e.push(field(
                    "headline",
                    "length",
                    "Headlines up to 90 characters (second line 60, eyebrow 60).",
                ));
            }
            if longer(&c.lead, 260) {
                e.push(field("lead", "length", "Supporting text up to 260 characters."));
            }
            if longer(&c.primary_label, 32) || longer(&c.secondary_label, 32) {
                e.push(field(
                    "primary_label",
                    "length",
                    "Button labels up to 32 characters.",
                ));
            }
            for href in [&c.primary_href, &c.secondary_href].into_iter().flatten() {
                let anchor = href.starts_with('#') && href.len() > 1 && href.len() <= 60;
                if !anchor && !valid_link(href) {
                    e.push(field(
                        "primary_href",
                        "href",
                        "Buttons go to a page path such as /contact, a section such as #platforms, or an https:// address.",
                    ));
                }
            }
        }
        if !self.variants.iter().any(|v| v.id == self.selected) {
            e.push(field("selected", "missing", "Choose which variant to publish."));
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    /// What goes live: the selected variant.
    pub fn snapshot(&self) -> Option<Value> {
        let v = self.variant(&self.selected)?;
        Some(json!({ "variant_id": v.id, "design": v.design, "name": v.name, "config": v.config }))
    }
}

// ---------------------------------------------------------------- routes

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/sites/{slug}/hero", get(public_hero))
        .route("/v1/admin/sites/{slug}/hero", get(read))
        .route("/v1/admin/sites/{slug}/hero/draft", post(save_draft))
        .route("/v1/admin/sites/{slug}/hero/{action}", post(action))
}

struct Site {
    id: Uuid,
    name: String,
    archived: bool,
}

async fn site(pool: &PgPool, slug: &str) -> Result<Site, ApiError> {
    let row: Option<(Uuid, String, Option<DateTime<Utc>>)> =
        sqlx::query_as("SELECT id, name, archived_at FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_optional(pool)
            .await?;
    let (id, name, archived_at) = row.ok_or(ApiError::NotFound)?;
    Ok(Site {
        id,
        name,
        archived: archived_at.is_some(),
    })
}

#[derive(FromRow)]
struct Row {
    draft: Value,
    draft_version: i32,
    published: Option<Value>,
    published_number: i32,
    published_at: Option<DateTime<Utc>>,
    review_requested_by: Option<Uuid>,
    review_requested_at: Option<DateTime<Utc>>,
    review_note: Option<String>,
}

async fn load(pool: &PgPool, site_id: Uuid) -> Result<Option<Row>, sqlx::Error> {
    sqlx::query_as(
        "SELECT draft, draft_version, published, published_number, published_at, review_requested_by,
                review_requested_at, review_note FROM site_heroes WHERE site_id = $1",
    )
    .bind(site_id)
    .fetch_optional(pool)
    .await
}

fn decode(value: Value) -> Result<HeroDraft, ApiError> {
    serde_json::from_value(value).map_err(|_| {
        ApiError::Validation(vec![field(
            "document",
            "invalid",
            "That hero draft isn't in the expected shape.",
        )])
    })
}

#[derive(FromRow, Serialize)]
struct Version {
    number: i32,
    note: String,
    hero: Value,
    requested_by: Option<String>,
    published_by: Option<String>,
    created_at: DateTime<Utc>,
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let row = load(&state.pool, site.id).await?;
    let versions: Vec<Version> = sqlx::query_as(
        "SELECT v.number, v.note, v.hero, rq.name AS requested_by, pb.name AS published_by, v.created_at
           FROM hero_versions v
           LEFT JOIN admin_users rq ON rq.id = v.requested_by
           LEFT JOIN admin_users pb ON pb.id = v.published_by
          WHERE v.site_id = $1 ORDER BY v.number DESC LIMIT 30",
    )
    .bind(site.id)
    .fetch_all(&state.pool)
    .await?;
    let designs: Vec<Value> = designs_for(&slug)
        .iter()
        .map(|d| json!({ "key": d, "name": design_name(d) }))
        .collect();
    let can_edit = session.require_site(site.id, Role::Editor).is_ok() && !site.archived;
    let can_review = session.require_site(site.id, Role::Reviewer).is_ok() && !site.archived;
    let (draft, version, published, number, published_at, review) = match &row {
        None => (HeroDraft::starting(&slug), 0, None, 0, None, None),
        Some(r) => {
            let requester: Option<String> = match r.review_requested_by {
                Some(id) => {
                    sqlx::query_scalar("SELECT name FROM admin_users WHERE id = $1")
                        .bind(id)
                        .fetch_optional(&state.pool)
                        .await?
                }
                None => None,
            };
            (
                decode(r.draft.clone())?,
                r.draft_version,
                r.published.clone(),
                r.published_number,
                r.published_at,
                r.review_requested_at.map(|at| {
                    json!({ "requested_at": at, "requested_by": requester, "note": r.review_note,
                        "own": r.review_requested_by == Some(session.user.id) })
                }),
            )
        }
    };
    let status = if review.is_some() {
        "in_review"
    } else if published.is_none() {
        "draft"
    } else if published.as_ref() != draft.snapshot().as_ref() {
        "changes_pending"
    } else {
        "published"
    };
    Ok(Json(json!({
        "site": { "slug": slug, "name": site.name },
        "designs": designs,
        "draft": draft,
        "draft_version": version,
        "published": published,
        "published_number": number,
        "published_at": published_at,
        "review": review,
        "versions": versions,
        "status": status,
        "can_edit": can_edit,
        "can_review": can_review,
    })))
}

#[derive(Deserialize)]
struct DraftInput {
    document: Value,
    version: i32,
}

/// Saving never changes the live hero.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Editor)?;
    if site.archived {
        return Err(ApiError::Conflict("Restore this website first."));
    }
    if designs_for(&slug).is_empty() {
        return Err(ApiError::Conflict("This website has no hero designs yet."));
    }
    let draft = decode(input.document)?
        .normalise(&slug)
        .map_err(ApiError::Validation)?;
    // Background images must come from this website's media library.
    for image in draft.variants.iter().filter_map(|v| v.config.background_image_id) {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM media_assets WHERE id = $1 AND site_id = $2 AND archived_at IS NULL)",
        )
        .bind(image)
        .bind(site.id)
        .fetch_one(&state.pool)
        .await?;
        if !ok {
            return Err(ApiError::Validation(vec![field(
                "background_image_id",
                "image",
                "Choose a background from this website's media library.",
            )]));
        }
    }
    let value = serde_json::to_value(&draft).map_err(|e| ApiError::Internal(e.to_string()))?;
    let version: Option<i32> = if input.version == 0 {
        sqlx::query_scalar(
            "INSERT INTO site_heroes (site_id, draft, draft_updated_by) VALUES ($1, $2, $3)
             ON CONFLICT (site_id) DO NOTHING RETURNING draft_version",
        )
        .bind(site.id)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_scalar(
            "UPDATE site_heroes SET draft = $3, draft_version = draft_version + 1, draft_updated_by = $4,
                    draft_updated_at = now(),
                    review_requested_by = CASE WHEN draft = $3 THEN review_requested_by END,
                    review_requested_at = CASE WHEN draft = $3 THEN review_requested_at END,
                    review_note = CASE WHEN draft = $3 THEN review_note END
              WHERE site_id = $1 AND draft_version = $2 RETURNING draft_version",
        )
        .bind(site.id)
        .bind(input.version)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    };
    let version = version.ok_or(ApiError::Conflict(
        "Someone else saved this hero meanwhile. Reload to see their changes.",
    ))?;
    audit_site(
        &state.pool,
        &session,
        site.id,
        "hero.draft_saved",
        json!({ "variants": draft.variants.len(), "selected": draft.selected }),
    )
    .await?;
    Ok(Json(json!({ "version": version })))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ActionInput {
    note: Option<String>,
    version: Option<i32>,
}

async fn action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((slug, action)): Path<(String, String)>,
    body: Option<Json<ActionInput>>,
) -> Result<impl IntoResponse, ApiError> {
    let input = body.map(|Json(b)| b).unwrap_or_default();
    let pool = &state.pool;
    let site = site(pool, &slug).await?;
    if site.archived {
        return Err(ApiError::Conflict("Restore this website first."));
    }
    let note = input.note.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > 300) {
        return Err(ApiError::Validation(vec![field(
            "note",
            "length",
            "Notes are up to 300 characters.",
        )]));
    }
    let row = load(pool, site.id)
        .await?
        .ok_or(ApiError::Conflict("Save the hero draft first."))?;
    let draft = decode(row.draft.clone())?;
    match action.as_str() {
        "submit" => {
            session.require_site(site.id, Role::Editor)?;
            if row.published.as_ref() == draft.snapshot().as_ref() {
                return Err(ApiError::Conflict(
                    "The selected variant is already live, unchanged.",
                ));
            }
            sqlx::query(
                "UPDATE site_heroes SET review_requested_by = $2, review_requested_at = now(), review_note = $3 WHERE site_id = $1",
            )
            .bind(site.id)
            .bind(session.user.id)
            .bind(note)
            .execute(pool)
            .await?;
            audit_site(
                pool,
                &session,
                site.id,
                "hero.submitted",
                json!({ "selected": draft.selected, "note": note }),
            )
            .await?;
        }
        "publish" => {
            session.require_site(site.id, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("Ask for approval first."));
            }
            if row.review_requested_by == Some(session.user.id) && session.user.role != Role::Owner {
                return Err(ApiError::NotPermitted(
                    "A different reviewer must approve your own request (maker-checker).",
                ));
            }
            let hero = draft
                .snapshot()
                .ok_or(ApiError::Conflict("Choose which variant to publish."))?;
            publish(
                pool,
                &session,
                site.id,
                &row,
                hero,
                note.or(row.review_note.as_deref()).unwrap_or("Approved"),
                row.review_requested_by,
                "hero.published",
            )
            .await?;
        }
        "reject" => {
            session.require_site(site.id, Role::Reviewer)?;
            if row.review_requested_at.is_none() {
                return Err(ApiError::Conflict("There's no request to decline."));
            }
            sqlx::query(
                "UPDATE site_heroes SET review_requested_by = NULL, review_requested_at = NULL, review_note = NULL WHERE site_id = $1",
            )
            .bind(site.id)
            .execute(pool)
            .await?;
            audit_site(pool, &session, site.id, "hero.rejected", json!({ "note": note })).await?;
        }
        "rollback" => {
            // An earlier version was already approved: reviewers restore it live in one step.
            session.require_site(site.id, Role::Reviewer)?;
            let number = input.version.ok_or(ApiError::BadRequest("Choose a version."))?;
            let hero: Value =
                sqlx::query_scalar("SELECT hero FROM hero_versions WHERE site_id = $1 AND number = $2")
                    .bind(site.id)
                    .bind(number)
                    .fetch_optional(pool)
                    .await?
                    .ok_or(ApiError::NotFound)?;
            let label = format!("Rolled back to version {number}");
            publish(
                pool,
                &session,
                site.id,
                &row,
                hero,
                &label,
                None,
                "hero.rolled_back",
            )
            .await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    Ok(Json(json!({ "ok": true })))
}

#[allow(clippy::too_many_arguments)]
async fn publish(
    pool: &PgPool,
    session: &AdminSession,
    site_id: Uuid,
    row: &Row,
    hero: Value,
    note: &str,
    requested_by: Option<Uuid>,
    audit_action: &str,
) -> Result<(), ApiError> {
    let number = row.published_number + 1;
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE site_heroes SET published = $2, published_number = $3, published_by = $4, published_at = now(),
                review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
          WHERE site_id = $1",
    )
    .bind(site_id)
    .bind(&hero)
    .bind(number)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO hero_versions (id, site_id, number, hero, note, requested_by, published_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id)
    .bind(number)
    .bind(&hero)
    .bind(note)
    .bind(requested_by)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit_site(
        pool,
        session,
        site_id,
        audit_action,
        json!({ "version": number, "design": hero["design"], "variant": hero["name"],
            "before": row.published.as_ref().map(|p| &p["name"]) }),
    )
    .await?;
    Ok(())
}

/// The website's live hero, or `{ "hero": null }` (it keeps its existing hero).
async fn public_hero(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let hero: Option<Value> = sqlx::query_scalar(
        "SELECT h.published FROM site_heroes h JOIN sites s ON s.id = h.site_id
          WHERE s.slug = $1 AND s.archived_at IS NULL",
    )
    .bind(&slug)
    .fetch_optional(&state.pool)
    .await?
    .flatten();
    Ok((
        [(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=60"),
        )],
        Json(json!({ "hero": hero })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_website_starts_with_its_own_collection() {
        let figbud = HeroDraft::starting("figbud");
        let designs: Vec<_> = figbud.variants.iter().map(|v| v.design.as_str()).collect();
        assert_eq!(designs, ["ecosystem", "cinematic", "universe"]);
        assert_eq!(figbud.selected, "v1");
        assert_eq!(figbud.variants[0].name, "01 · Connected Ecosystem");
        let zirahr = HeroDraft::starting("zirahr");
        assert_eq!(zirahr.variants[1].design, "payroll");
        assert!(
            HeroDraft::starting("jasiri").variants.is_empty(),
            "never copied to other products"
        );
    }

    #[test]
    fn settings_stay_within_the_design() {
        let mut d = HeroDraft::starting("zirahr");
        d.variants[0].config.headline = Some("  HR Simplified. Business Amplified.  ".into());
        d.variants[0].config.primary_href = Some("#features".into());
        let ok = d.clone().normalise("zirahr").unwrap();
        assert_eq!(
            ok.variants[0].config.headline.as_deref(),
            Some("HR Simplified. Business Amplified.")
        );
        // FigBud designs aren't available to ZiraHR; unsafe links and long text are refused.
        d.variants[1].design = "cinematic".into();
        d.variants[2].config.secondary_href = Some("javascript:alert(1)".into());
        d.variants[0].config.lead = Some("x".repeat(300));
        d.selected = "nope".into();
        let codes: Vec<_> = d
            .normalise("zirahr")
            .unwrap_err()
            .iter()
            .map(|e| (e.field, e.code))
            .collect();
        assert!(codes.contains(&("variants", "design")));
        assert!(codes.contains(&("primary_href", "href")));
        assert!(codes.contains(&("lead", "length")));
        assert!(codes.contains(&("selected", "missing")));
    }

    #[test]
    fn the_snapshot_is_the_selected_variant_only() {
        let mut d = HeroDraft::starting("figbud");
        d.selected = "v3".into();
        let s = d.snapshot().unwrap();
        assert_eq!(s["design"], "universe");
        assert_eq!(s["config"]["motion"], true);
        assert!(s.get("variants").is_none());
    }
}
