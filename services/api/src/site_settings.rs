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

/// The website's footer (P7-E2; redesigned on the owner's brief of 7 Nov
/// 2026): a call to action above it, the identity column, link groups, and a
/// bottom bar. Empty text means the website's built-in wording.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct Footer {
    /// A short introduction under the tagline.
    pub note: Option<String>,
    /// Older single list of links, shown as one group while `groups` is empty.
    pub links: Vec<Link>,
    /// The line beside the logo, e.g. "HR Simplified. Business Amplified."
    pub tagline: Option<String>,
    /// Titled columns of links, in order.
    pub groups: Vec<FooterGroup>,
    pub cta: FooterCta,
    /// Verified official profiles only; none are shown until added.
    pub social: Vec<SocialLink>,
    pub contact: FooterContact,
    /// Hide the footer's columns (the legal links and copyright always stay).
    pub hidden: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct FooterGroup {
    pub title: String,
    pub links: Vec<Link>,
}

/// The panel above the footer's columns.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct FooterCta {
    pub show: bool,
    pub heading: Option<String>,
    pub body: Option<String>,
    pub label: Option<String>,
    pub href: Option<String>,
}

impl Default for FooterCta {
    fn default() -> Self {
        Self {
            show: true,
            heading: None,
            body: None,
            label: None,
            href: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SocialNetwork {
    Linkedin,
    X,
    Facebook,
    Instagram,
    Youtube,
    Tiktok,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SocialLink {
    pub network: SocialNetwork,
    /// An https:// address of the official profile.
    pub href: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct FooterContact {
    pub email: Option<String>,
    /// International format, e.g. +254 798 993 404.
    pub phone: Option<String>,
}

/// Beside the identity column and the fixed Legal & Support column.
const MAX_FOOTER_GROUPS: usize = 3;
const MAX_SOCIAL: usize = 6;

/// A footer destination: a page path, which may carry a query and an anchor
/// ("/contact?kind=demo_request#enquire"), or an https:// address.
fn valid_footer_link(href: &str) -> bool {
    match href.split_once('?') {
        Some((path, query)) => {
            path.starts_with('/')
                && valid_link(path)
                && query.len() <= 120
                && query
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'=' | b'&' | b'-' | b'_' | b'#'))
        }
        None => valid_link(href),
    }
}

fn check_footer_links(errors: &mut Vec<FieldError>, links: &mut [Link], field: &'static str) {
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
        if !valid_footer_link(&link.href) {
            errors.push(FieldError {
                field,
                code: "href",
                message: "Links go to a page path such as /platform, or an https:// address.",
            });
        }
    }
}

fn valid_email(email: &str) -> bool {
    email.split_once('@').is_some_and(|(user, domain)| {
        !user.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
            && !domain.contains('@')
            && email
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'@' | b'.' | b'-' | b'_' | b'+'))
    })
}

fn valid_phone(phone: &str) -> bool {
    let digits = phone.bytes().filter(u8::is_ascii_digit).count();
    phone.starts_with('+')
        && (8..=15).contains(&digits)
        && phone[1..].bytes().all(|b| b.is_ascii_digit() || b == b' ')
}

fn check_footer(e: &mut Vec<FieldError>, footer: &mut Footer) {
    check_footer_links(e, &mut footer.links, "footer.links");
    optional_text(e, &mut footer.note, "footer.note", 280);
    optional_text(e, &mut footer.tagline, "footer.tagline", 80);
    if footer.groups.len() > MAX_FOOTER_GROUPS {
        e.push(FieldError {
            field: "footer.groups",
            code: "too_many",
            message: "Up to three groups of links.",
        });
    }
    for group in footer.groups.iter_mut() {
        group.title = group.title.trim().to_owned();
        if group.title.is_empty() || group.title.chars().count() > 30 {
            e.push(FieldError {
                field: "footer.groups",
                code: "title",
                message: "Every group needs a title of up to 30 characters.",
            });
        }
        if group.links.is_empty() {
            e.push(FieldError {
                field: "footer.groups",
                code: "empty",
                message: "Every group needs at least one link.",
            });
        }
        check_footer_links(e, &mut group.links, "footer.groups");
    }
    let cta = &mut footer.cta;
    optional_text(e, &mut cta.heading, "footer.cta.heading", 80);
    optional_text(e, &mut cta.body, "footer.cta.body", 200);
    optional_text(e, &mut cta.label, "footer.cta.label", 32);
    optional_text(e, &mut cta.href, "footer.cta.href", 200);
    if cta.href.as_deref().is_some_and(|h| !valid_footer_link(h)) {
        e.push(FieldError {
            field: "footer.cta.href",
            code: "href",
            message: "The button goes to a page path such as /contact, or an https:// address.",
        });
    }
    if footer.social.len() > MAX_SOCIAL {
        e.push(FieldError {
            field: "footer.social",
            code: "too_many",
            message: "Up to six profiles.",
        });
    }
    let mut networks = std::collections::HashSet::new();
    for profile in footer.social.iter_mut() {
        profile.href = profile.href.trim().to_owned();
        if !profile.href.starts_with("https://") || !valid_link(&profile.href) {
            e.push(FieldError {
                field: "footer.social",
                code: "href",
                message: "Profiles need the full https:// address of the official page.",
            });
        }
        if !networks.insert(profile.network) {
            e.push(FieldError {
                field: "footer.social",
                code: "duplicate",
                message: "List each network once.",
            });
        }
    }
    let contact = &mut footer.contact;
    optional_text(e, &mut contact.email, "footer.contact.email", 120);
    if let Some(email) = &mut contact.email {
        *email = email.to_ascii_lowercase();
        if !valid_email(email) {
            e.push(FieldError {
                field: "footer.contact.email",
                code: "format",
                message: "Use an email address such as hello@example.com.",
            });
        }
    }
    optional_text(e, &mut contact.phone, "footer.contact.phone", 24);
    if contact.phone.as_deref().is_some_and(|p| !valid_phone(p)) {
        e.push(FieldError {
            field: "footer.contact.phone",
            code: "format",
            message: "Use the international format, such as +254 798 993 404.",
        });
    }
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

/// How strongly the scroll-driven showcase adds depth (scale and fade).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Intensity {
    Subtle,
    #[default]
    Standard,
    Bold,
}

/// How closely the products follow the scroll position.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Smoothness {
    /// Exactly with the scroll.
    Direct,
    #[default]
    Smooth,
    /// A little more easing, for a slower glide.
    Gentle,
}

/// Our Platforms on phones.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MobileShowcase {
    /// The swipeable carousel with natural vertical scrolling.
    #[default]
    Swipe,
    /// Scroll-driven too, but only where the whole showcase fits the screen.
    ScrollWhereComfortable,
}

/// Our Platforms on the corporate home page (UI-MO5). With scroll-driven
/// motion on, the showcase stays in view while vertical scrolling moves
/// through the products, then the page scrolls on; it only pins where the
/// whole showcase fits the screen, and never for reduced motion. Off, it's
/// the carousel.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Showcase {
    pub scroll_driven: bool,
    /// Keep the showcase in view while scrolling through the products.
    pub sticky: bool,
    pub intensity: Intensity,
    pub smoothness: Smoothness,
    pub mobile: MobileShowcase,
    pub show_arrows: bool,
    pub show_progress: bool,
    /// Product slugs in display order; products not listed follow in their usual order.
    pub order: Vec<String>,
}

impl Default for Showcase {
    fn default() -> Self {
        Self {
            scroll_driven: true,
            sticky: true,
            intensity: Intensity::default(),
            smoothness: Smoothness::default(),
            mobile: MobileShowcase::default(),
            show_arrows: true,
            show_progress: true,
            order: Vec::new(),
        }
    }
}

const MAX_ORDER: usize = 12;

/// The small floating cards under ordinary menu links (UI-NAV2). Text only,
/// from a fixed set of icons; they never contain links or markup.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct NavPreviews {
    /// The website-wide switch. Off: no previews on any menu link.
    pub enabled: bool,
    pub items: Vec<NavPreviewItem>,
}

impl Default for NavPreviews {
    fn default() -> Self {
        Self {
            enabled: true,
            items: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct NavPreviewItem {
    /// Which menu link: a corporate menu key ("about") or a page path ("/platform").
    pub key: String,
    pub enabled: bool,
    pub icon: Option<String>,
    pub headline: Option<String>,
    pub description: Option<String>,
}

impl Default for NavPreviewItem {
    fn default() -> Self {
        Self {
            key: String::new(),
            enabled: true,
            icon: None,
            headline: None,
            description: None,
        }
    }
}

/// Must match `NAV_PREVIEW_ICONS` in `packages/site-kit/src/brand.ts`.
const NAV_PREVIEW_ICONS: &[&str] = &[
    "sparkles",
    "compass",
    "book-open",
    "message-circle",
    "building",
    "users",
    "layers",
    "rocket",
    "shield",
    "chart",
    "globe",
    "wallet",
    "calendar",
    "briefcase",
    "phone",
    "lightbulb",
];
const MAX_PREVIEW_ITEMS: usize = 16;

fn check_nav_previews(errors: &mut Vec<FieldError>, previews: &mut NavPreviews, field: &'static str) {
    if previews.items.len() > MAX_PREVIEW_ITEMS {
        errors.push(FieldError {
            field,
            code: "too_many",
            message: "Up to 16 menu links can have previews.",
        });
    }
    let mut seen = std::collections::HashSet::new();
    for item in &mut previews.items {
        item.key = item.key.trim().to_owned();
        let valid_key = !item.key.is_empty()
            && item.key.len() <= 200
            && !item.key.contains(['<', '>', '"'])
            && seen.insert(item.key.clone());
        if !valid_key {
            errors.push(FieldError {
                field,
                code: "key",
                message: "Each menu link can have one preview.",
            });
        }
        optional_text(errors, &mut item.headline, field, 60);
        optional_text(errors, &mut item.description, field, 120);
        if item
            .icon
            .as_deref()
            .is_some_and(|icon| !NAV_PREVIEW_ICONS.contains(&icon))
        {
            errors.push(FieldError {
                field,
                code: "icon",
                message: "Choose one of the offered icons.",
            });
        }
    }
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 40
        && slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct WebsiteSettings {
    pub navigation: Navigation,
    pub footer: Footer,
    pub enquiries: Enquiries,
    pub theme: Theme,
    pub motion: Motion,
    pub showcase: Showcase,
    /// What the website shows.
    pub nav_previews: NavPreviews,
    /// Saved in the Studio but not published: never sent to the websites.
    pub nav_previews_draft: Option<NavPreviews>,
    /// The footer being edited in the Studio; likewise never sent.
    pub footer_draft: Option<Footer>,
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
        check_footer(&mut e, &mut self.footer);
        if let Some(draft) = &mut self.footer_draft {
            check_footer(&mut e, draft);
        }
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
        check_nav_previews(&mut e, &mut self.nav_previews, "nav_previews");
        if let Some(draft) = &mut self.nav_previews_draft {
            check_nav_previews(&mut e, draft, "nav_previews");
        }
        let order = &mut self.showcase.order;
        for slug in order.iter_mut() {
            *slug = slug.trim().to_ascii_lowercase();
        }
        let mut seen = std::collections::HashSet::new();
        if order.len() > MAX_ORDER || !order.iter().all(|s| valid_slug(s) && seen.insert(s.clone())) {
            e.push(FieldError {
                field: "showcase.order",
                code: "format",
                message: "List each product once, by its website address name.",
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
            "showcase": self.showcase,
            "nav_previews": self.nav_previews,
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
    fn footers_are_checked_tidied_and_drafts_never_reach_the_websites() {
        let settings = WebsiteSettings::from_stored(json!({
            "footer": {
                "tagline": " HR Simplified. Business Amplified. ",
                "groups": [{ "title": " Platform ", "links": [
                    { "label": "Book a demo", "href": "/contact?kind=demo_request#enquire" },
                    { "label": "FigBud Global", "href": "https://figbud.example/en" },
                ] }],
                "cta": { "heading": "Ready?", "label": "Book a demo", "href": "/contact?kind=demo_request#enquire" },
                "social": [{ "network": "linkedin", "href": "https://www.linkedin.com/company/example" }],
                "contact": { "email": " Hello@Example.com ", "phone": "+254 798 993 404" },
            },
            "footer_draft": { "tagline": "Unpublished footer", "hidden": true },
        }))
        .normalise(false)
        .unwrap();
        let footer = &settings.footer;
        assert_eq!(
            footer.tagline.as_deref(),
            Some("HR Simplified. Business Amplified.")
        );
        assert_eq!(footer.groups[0].title, "Platform");
        assert!(footer.cta.show, "the call to action shows unless switched off");
        assert_eq!(footer.contact.email.as_deref(), Some("hello@example.com"));
        assert!(!footer.hidden);
        let public = settings.public();
        assert_eq!(
            public["footer"]["groups"][0]["links"][0]["href"],
            "/contact?kind=demo_request#enquire"
        );
        assert!(public.get("footer_draft").is_none());
        assert!(!public.to_string().contains("Unpublished footer"));

        for (bad, field) in [
            (
                json!({ "groups": [{ "title": "", "links": [{ "label": "A", "href": "/a" }] }] }),
                "footer.groups",
            ),
            (
                json!({ "groups": [{ "title": "Empty", "links": [] }] }),
                "footer.groups",
            ),
            (
                json!({ "groups": [{ "title": "X", "links": [{ "label": "A", "href": "javascript:alert(1)" }] }] }),
                "footer.groups",
            ),
            (
                json!({ "groups": [{ "title": "X", "links": [{ "label": "A", "href": "/a?x=<b>" }] }] }),
                "footer.groups",
            ),
            (
                json!({ "groups": (0..5).map(|i| json!({ "title": format!("G{i}"), "links": [{ "label": "A", "href": "/a" }] })).collect::<Vec<_>>() }),
                "footer.groups",
            ),
            (json!({ "tagline": "x".repeat(81) }), "footer.tagline"),
            (json!({ "note": "x".repeat(281) }), "footer.note"),
            (
                json!({ "cta": { "href": "javascript:alert(1)" } }),
                "footer.cta.href",
            ),
            (
                json!({ "cta": { "heading": "x".repeat(81) } }),
                "footer.cta.heading",
            ),
            (
                json!({ "social": [{ "network": "x", "href": "http://x.com/figbud" }] }),
                "footer.social",
            ),
            (
                json!({ "social": [
                { "network": "x", "href": "https://x.com/a" },
                { "network": "x", "href": "https://x.com/b" },
            ] }),
                "footer.social",
            ),
            (
                json!({ "contact": { "email": "not-an-email" } }),
                "footer.contact.email",
            ),
            (
                json!({ "contact": { "phone": "0798 993 404" } }),
                "footer.contact.phone",
            ),
        ] {
            let draft = WebsiteSettings::from_stored(json!({ "footer_draft": bad.clone() }));
            assert_eq!(draft.normalise(false).unwrap_err()[0].field, field, "{bad}");
        }
    }

    #[test]
    fn nav_previews_are_checked_and_drafts_never_reach_the_websites() {
        let settings = WebsiteSettings::from_stored(json!({
            "nav_previews": { "items": [{ "key": "about", "headline": " Built with purpose. ", "icon": "compass" }] },
            "nav_previews_draft": { "enabled": false, "items": [{ "key": "about", "headline": "Unpublished" }] },
        }))
        .normalise(true)
        .unwrap();
        assert!(settings.nav_previews.enabled, "on unless switched off");
        assert_eq!(
            settings.nav_previews.items[0].headline.as_deref(),
            Some("Built with purpose.")
        );
        let public = settings.public();
        assert_eq!(public["nav_previews"]["items"][0]["key"], "about");
        assert!(public.get("nav_previews_draft").is_none());
        assert!(!public.to_string().contains("Unpublished"));

        for bad in [
            json!({ "items": [{ "key": "a", "icon": "skull" }] }),
            json!({ "items": [{ "key": "a", "headline": "x".repeat(61) }] }),
            json!({ "items": [{ "key": "a", "description": "x".repeat(121) }] }),
            json!({ "items": [{ "key": "a" }, { "key": "a" }] }),
            json!({ "items": [{ "key": "<b>" }] }),
            json!({ "items": [{ "key": "" }] }),
        ] {
            let draft = WebsiteSettings::from_stored(json!({ "nav_previews_draft": bad.clone() }));
            assert_eq!(
                draft.normalise(false).unwrap_err()[0].field,
                "nav_previews",
                "{bad}"
            );
        }
    }

    #[test]
    fn the_showcase_is_scroll_driven_by_default_and_orders_each_product_once() {
        let settings = WebsiteSettings::from_stored(json!({ "motion": { "product_rotation": false } }));
        assert!(settings.showcase.scroll_driven && settings.showcase.sticky);
        assert_eq!(settings.showcase.mobile, MobileShowcase::Swipe);
        let ordered = WebsiteSettings::from_stored(json!({
            "showcase": { "order": [" Jasiri ", "zirahr"], "intensity": "subtle", "mobile": "scroll_where_comfortable" }
        }))
        .normalise(true)
        .unwrap();
        assert_eq!(ordered.showcase.order, ["jasiri", "zirahr"]);
        assert_eq!(ordered.public()["showcase"]["intensity"], "subtle");
        for order in [json!(["zirahr", "zirahr"]), json!(["<script>"]), json!([""])] {
            let bad = WebsiteSettings::from_stored(json!({ "showcase": { "order": order } }));
            assert_eq!(bad.normalise(true).unwrap_err()[0].field, "showcase.order");
        }
        // Unknown choices are refused when saving, not silently reset.
        assert!(serde_json::from_value::<Showcase>(json!({ "intensity": "extreme" })).is_err());
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
