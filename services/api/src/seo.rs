//! SEO & search visibility per website (P9-S1): each website's own search
//! identity (title template, default description, verification tags,
//! official profiles, markets, indexing switch), an audit of its published
//! pages, and an overview across websites.
//!
//! The audit only reports what the API can check itself (metadata, headings,
//! internal links, indexing rules). Indexing counts, rankings, impressions and
//! Core Web Vitals come from Search Console / analytics once connected; until
//! then they're reported as unavailable, never estimated.

use std::collections::{HashMap, HashSet};

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    pages::blocks::{PageDoc, safe_href},
    routes::SharedState,
    sites::audit_site,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/seo", get(overview))
        .route("/v1/admin/sites/{slug}/seo", get(read).post(update))
}

/// Languages the websites can be written in (packages/i18n).
const LANGUAGES: [&str; 5] = ["en", "sw", "fr", "ar", "zh"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct SeoSettings {
    /// Search result titles, with `%s` for the page title (e.g. "%s · ZiraHR").
    pub title_template: Option<String>,
    /// Used by pages without their own search description.
    pub default_description: Option<String>,
    /// Google Search Console HTML-tag verification token.
    pub google_verification: Option<String>,
    /// Bing Webmaster Tools (`msvalidate.01`) token.
    pub bing_verification: Option<String>,
    /// Verified official profiles (LinkedIn, X…), for structured data.
    pub same_as: Vec<String>,
    /// Target markets, ISO 3166-1 alpha-2.
    pub markets: Vec<String>,
    /// Languages the website is written in.
    pub languages: Vec<String>,
    /// Focus search phrases (internal guidance for editors; never output as meta keywords).
    pub focus_keywords: Vec<String>,
    /// Off while a website is being prepared: every page asks not to be indexed.
    pub indexing: bool,
}

impl Default for SeoSettings {
    fn default() -> Self {
        Self {
            title_template: None,
            default_description: None,
            google_verification: None,
            bing_verification: None,
            same_as: Vec::new(),
            markets: Vec::new(),
            languages: vec!["en".into()],
            focus_keywords: Vec::new(),
            indexing: true,
        }
    }
}

fn invalid(field: &'static str, message: &'static str) -> FieldError {
    FieldError {
        field,
        code: "invalid",
        message,
    }
}

fn token_ok(token: &str) -> bool {
    (8..=100).contains(&token.len())
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

impl SeoSettings {
    pub fn from_stored(value: Value) -> Self {
        serde_json::from_value(value).unwrap_or_default()
    }

    /// Checks and tidies an edited document.
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut e = Vec::new();
        let tidy = |v: &mut Option<String>| {
            *v = v
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        };
        tidy(&mut self.title_template);
        tidy(&mut self.default_description);
        tidy(&mut self.google_verification);
        tidy(&mut self.bing_verification);
        if self
            .title_template
            .as_deref()
            .is_some_and(|t| t.matches("%s").count() != 1 || t.chars().count() > 70)
        {
            e.push(invalid(
                "title_template",
                "Use %s once for the page title, up to 70 characters.",
            ));
        }
        if self
            .default_description
            .as_deref()
            .is_some_and(|d| d.chars().count() > 170)
        {
            e.push(invalid(
                "default_description",
                "Descriptions can be up to 170 characters.",
            ));
        }
        if self.google_verification.as_deref().is_some_and(|t| !token_ok(t))
            || self.bing_verification.as_deref().is_some_and(|t| !token_ok(t))
        {
            e.push(invalid(
                "verification",
                "Paste only the token from the verification tag (letters, digits, - and _).",
            ));
        }
        self.same_as = self
            .same_as
            .iter()
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        if self.same_as.len() > 8
            || self
                .same_as
                .iter()
                .any(|s| !s.starts_with("https://") || !safe_href(s))
        {
            e.push(invalid(
                "same_as",
                "Up to eight official profile addresses, each starting with https://.",
            ));
        }
        self.markets = self
            .markets
            .iter()
            .map(|m| m.trim().to_ascii_uppercase())
            .collect();
        self.markets.dedup();
        if self.markets.len() > 30
            || self
                .markets
                .iter()
                .any(|m| crate::enquiry::country_id(m).is_none())
        {
            e.push(invalid("markets", "Choose up to 30 countries from the list."));
        }
        self.languages.retain(|l| !l.trim().is_empty());
        if self.languages.is_empty() || self.languages.iter().any(|l| !LANGUAGES.contains(&l.as_str())) {
            e.push(invalid(
                "languages",
                "Choose at least one of the supported languages.",
            ));
        }
        self.focus_keywords = self
            .focus_keywords
            .iter()
            .map(|k| k.trim().to_owned())
            .filter(|k| !k.is_empty())
            .collect();
        if self.focus_keywords.len() > 20 || self.focus_keywords.iter().any(|k| k.chars().count() > 60) {
            e.push(invalid(
                "focus_keywords",
                "Up to 20 focus phrases of up to 60 characters.",
            ));
        }
        if e.is_empty() { Ok(self) } else { Err(e) }
    }

    /// What websites need (focus phrases stay internal).
    pub fn public(&self) -> Value {
        json!({
            "title_template": self.title_template,
            "default_description": self.default_description,
            "google_verification": self.google_verification,
            "bing_verification": self.bing_verification,
            "same_as": self.same_as,
            "languages": self.languages,
            "indexing": self.indexing,
        })
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

#[derive(Serialize, Clone, Debug)]
pub struct Issue {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct PageAudit {
    pub id: Uuid,
    pub title: String,
    pub path: String,
    /// The title search engines are shown (after the website's template).
    pub search_title: String,
    pub indexable: bool,
    pub issues: Vec<Issue>,
}

fn issue(code: &'static str, severity: Severity, message: impl Into<String>) -> Issue {
    Issue {
        code,
        severity,
        message: message.into(),
    }
}

/// Every `href` in a document.
fn hrefs(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                match (key.as_str(), v) {
                    ("href", Value::String(s)) => out.push(s.clone()),
                    _ => hrefs(v, out),
                }
            }
        }
        Value::Array(items) => items.iter().for_each(|v| hrefs(v, out)),
        _ => {}
    }
}

/// Characters of visible text in a section.
fn text_len(value: &Value) -> usize {
    const TEXT: [&str; 11] = [
        "heading", "body", "lead", "title", "question", "answer", "intro", "label", "value", "caption",
        "eyebrow",
    ];
    match value {
        Value::Object(map) => map
            .iter()
            .map(|(k, v)| match v {
                Value::String(s) if TEXT.contains(&k.as_str()) => s.chars().count(),
                _ => text_len(v),
            })
            .sum(),
        Value::Array(items) => items.iter().map(text_len).sum(),
        _ => 0,
    }
}

#[derive(FromRow)]
struct LivePage {
    id: Uuid,
    path: String,
    title: String,
    published: Value,
}

/// Paths that are always fine on a website: its enquiry route and contact form.
const ALWAYS_OK: [&str; 2] = ["enquire", "contact"];

/// Audits a website's published, online pages.
pub async fn audit(
    pool: &PgPool,
    site_id: Uuid,
    settings: &SeoSettings,
) -> Result<Vec<PageAudit>, sqlx::Error> {
    let pages: Vec<LivePage> = sqlx::query_as(
        "SELECT id, path, title, published FROM pages
          WHERE site_id = $1 AND archived_at IS NULL AND published IS NOT NULL AND NOT offline ORDER BY position, title",
    )
    .bind(site_id)
    .fetch_all(pool)
    .await?;
    let redirects: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT from_path FROM page_redirects WHERE site_id = $1")
            .bind(site_id)
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect();
    let live: HashSet<&str> = pages.iter().map(|p| p.path.as_str()).collect();
    let docs: Vec<Option<PageDoc>> = pages
        .iter()
        .map(|p| serde_json::from_value::<PageDoc>(p.published.clone()).ok())
        .collect();
    let search_title = |page: &LivePage, doc: &Option<PageDoc>| {
        let base = doc
            .as_ref()
            .and_then(|d| d.seo_title.clone())
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| page.title.clone());
        match &settings.title_template {
            Some(template) => template.replacen("%s", &base, 1),
            None => base,
        }
    };
    let description = |doc: &Option<PageDoc>| {
        doc.as_ref()
            .and_then(|d| d.seo_description.clone())
            .filter(|d| !d.trim().is_empty())
    };
    let mut titles: HashMap<String, usize> = HashMap::new();
    let mut descriptions: HashMap<String, usize> = HashMap::new();
    for (page, doc) in pages.iter().zip(&docs) {
        if doc.as_ref().is_some_and(|d| !d.seo_noindex) {
            *titles.entry(search_title(page, doc).to_lowercase()).or_default() += 1;
            if let Some(d) = description(doc) {
                *descriptions.entry(d.to_lowercase()).or_default() += 1;
            }
        }
    }

    let mut out = Vec::with_capacity(pages.len());
    for (page, doc) in pages.iter().zip(&docs) {
        let mut issues = Vec::new();
        let title = search_title(page, doc);
        let Some(doc) = doc else {
            issues.push(issue(
                "unreadable",
                Severity::Error,
                "The published page couldn't be read.",
            ));
            out.push(PageAudit {
                id: page.id,
                title: page.title.clone(),
                path: format!("/{}", page.path),
                search_title: title,
                indexable: false,
                issues,
            });
            continue;
        };
        let indexable = settings.indexing && !doc.seo_noindex;
        let len = title.chars().count();
        if len > 60 {
            issues.push(issue(
                "title_long",
                Severity::Warning,
                format!("The search title is {len} characters; search results show about 60."),
            ));
        } else if len < 15 {
            issues.push(issue(
                "title_short",
                Severity::Info,
                "The search title is very short; say what the page offers.",
            ));
        }
        if indexable && titles.get(&title.to_lowercase()).copied().unwrap_or(0) > 1 {
            issues.push(issue(
                "title_duplicate",
                Severity::Error,
                "Another page has the same search title.",
            ));
        }
        match description(&Some(doc.clone())) {
            None if settings.default_description.is_some() => issues.push(issue(
                "description_default",
                Severity::Info,
                "No search description: the website's default is used. A page-specific one is better.",
            )),
            None => issues.push(issue(
                "description_missing",
                Severity::Warning,
                "Add a search description (about 150 characters).",
            )),
            Some(d) => {
                let n = d.chars().count();
                if n < 70 {
                    issues.push(issue(
                        "description_short",
                        Severity::Info,
                        format!("The search description is {n} characters; aim for 120–160."),
                    ));
                }
                if indexable && descriptions.get(&d.to_lowercase()).copied().unwrap_or(0) > 1 {
                    issues.push(issue(
                        "description_duplicate",
                        Severity::Warning,
                        "Another page has the same search description.",
                    ));
                }
            }
        }
        let visible: Vec<&crate::pages::blocks::Section> =
            doc.sections.iter().filter(|s| !s.hidden).collect();
        if !visible
            .first()
            .is_some_and(|s| matches!(s.block, crate::pages::blocks::Block::Hero { .. }))
        {
            issues.push(issue(
                "no_h1",
                Severity::Warning,
                "Start the page with a hero section: it's the page's main heading (h1).",
            ));
        }
        let value = serde_json::to_value(&visible).unwrap_or(Value::Null);
        let words = text_len(&value);
        if words < 300 {
            issues.push(issue(
                "thin_content",
                Severity::Info,
                "Very little text: search engines may see the page as thin.",
            ));
        }
        let mut links = Vec::new();
        hrefs(&value, &mut links);
        let mut broken: Vec<String> = links
            .into_iter()
            .filter(|h| h.starts_with('/') && !h.starts_with("//"))
            .map(|h| {
                h.split(['?', '#'])
                    .next()
                    .unwrap_or("")
                    .trim_matches('/')
                    .to_owned()
            })
            .filter(|p| !live.contains(p.as_str()) && !ALWAYS_OK.contains(&p.as_str()))
            .collect();
        broken.sort();
        broken.dedup();
        for path in broken {
            let (code, severity, message) = if redirects.contains(&path) {
                (
                    "link_redirected",
                    Severity::Info,
                    format!("A link goes to /{path}, which now forwards elsewhere: link to the new address."),
                )
            } else {
                (
                    "link_broken",
                    Severity::Error,
                    format!("A link goes to /{path}, which isn't a published page."),
                )
            };
            issues.push(issue(code, severity, message));
        }
        if !indexable {
            issues.push(issue(
                "noindex",
                Severity::Info,
                "Hidden from search engines (not in the sitemap).",
            ));
        }
        issues.sort_by_key(|i| std::cmp::Reverse(i.severity));
        out.push(PageAudit {
            id: page.id,
            title: page.title.clone(),
            path: format!("/{}", page.path),
            search_title: title,
            indexable,
            issues,
        });
    }
    Ok(out)
}

/// Website-level findings.
fn site_issues(settings: &SeoSettings, pages: &[PageAudit]) -> Vec<Issue> {
    let mut issues = Vec::new();
    if !settings.indexing {
        issues.push(issue(
            "site_noindex",
            Severity::Warning,
            "Search indexing is off for the whole website.",
        ));
    }
    if settings.default_description.is_none() {
        issues.push(issue(
            "site_description",
            Severity::Info,
            "Add a default search description for pages without their own.",
        ));
    }
    if settings.google_verification.is_none() {
        issues.push(issue(
            "gsc_unverified",
            Severity::Info,
            "Add the Google Search Console verification token to prove ownership.",
        ));
    }
    if pages.is_empty() {
        issues.push(issue("no_pages", Severity::Info, "No published pages yet."));
    }
    issues
}

#[derive(Serialize, Default)]
struct Summary {
    pages: usize,
    indexable: usize,
    errors: usize,
    warnings: usize,
    infos: usize,
}

fn summarise(pages: &[PageAudit], site: &[Issue]) -> Summary {
    let all = pages.iter().flat_map(|p| p.issues.iter()).chain(site.iter());
    let mut s = Summary {
        pages: pages.len(),
        indexable: pages.iter().filter(|p| p.indexable).count(),
        ..Summary::default()
    };
    for i in all {
        match i.severity {
            Severity::Error => s.errors += 1,
            Severity::Warning => s.warnings += 1,
            Severity::Info => s.infos += 1,
        }
    }
    s
}

/// Analytics providers enabled in Privacy & Cookies (they load only with consent).
async fn analytics(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE((SELECT array_agg(i->>'provider') FROM privacy_settings p, jsonb_array_elements(p.config->'integrations') i
                           WHERE (i->>'enabled')::boolean AND i->>'provider' IN ('google_analytics', 'plausible')), '{}')",
    )
    .fetch_one(pool)
    .await
}

/// What's connected. Nothing here is a measurement: data from these
/// services is shown only once a verified connection exists.
fn integrations(settings: &SeoSettings, analytics: &[String]) -> Value {
    json!({
        "search_console": {
            "verification_tag": settings.google_verification.is_some(),
            "data": "not_connected",
        },
        "bing": { "verification_tag": settings.bing_verification.is_some(), "data": "not_connected" },
        "analytics": analytics,
        "core_web_vitals": "lighthouse_ci",
    })
}

#[derive(FromRow)]
struct SiteRow {
    id: Uuid,
    slug: String,
    name: String,
    seo: Value,
    seo_version: i32,
    primary_domain: Option<String>,
    archived_at: Option<chrono::DateTime<chrono::Utc>>,
}

async fn site(pool: &PgPool, slug: &str) -> Result<SiteRow, ApiError> {
    sqlx::query_as(
        "SELECT id, slug, name, seo, seo_version, primary_domain, archived_at FROM sites WHERE slug = $1",
    )
    .bind(slug)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Viewer)?;
    let settings = SeoSettings::from_stored(site.seo.clone());
    let pages = audit(&state.pool, site.id, &settings).await?;
    let site_level = site_issues(&settings, &pages);
    let analytics = analytics(&state.pool).await?;
    Ok(Json(json!({
        "site": { "slug": site.slug, "name": site.name, "primary_domain": site.primary_domain },
        "settings": settings,
        "version": site.seo_version,
        "can_edit": session.site_role(site.id) >= Some(Role::Reviewer) && site.archived_at.is_none(),
        "summary": summarise(&pages, &site_level),
        "site_issues": site_level,
        "pages": pages,
        "integrations": integrations(&settings, &analytics),
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateInput {
    settings: SeoSettings,
    version: i32,
}

async fn update(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(slug): Path<String>,
    Json(input): Json<UpdateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let site = site(&state.pool, &slug).await?;
    session.require_site(site.id, Role::Reviewer)?;
    if site.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this website first."));
    }
    let next = input.settings.normalise().map_err(ApiError::Validation)?;
    let value = serde_json::to_value(&next).map_err(|e| ApiError::Internal(e.to_string()))?;
    let saved: Option<i32> = sqlx::query_scalar(
        "UPDATE sites SET seo = $3, seo_version = seo_version + 1 WHERE id = $1 AND seo_version = $2 RETURNING seo_version",
    )
    .bind(site.id)
    .bind(input.version)
    .bind(&value)
    .fetch_optional(&state.pool)
    .await?;
    let version = saved.ok_or(ApiError::Conflict(
        "Someone changed these settings after you opened them. Reload to see the latest.",
    ))?;
    if site.seo != value {
        audit_site(
            &state.pool,
            &session,
            site.id,
            "site.seo_updated",
            json!({ "from": site.seo, "to": value }),
        )
        .await?;
    }
    Ok(Json(json!({ "settings": next, "version": version })))
}

/// Every website someone can see, with its audit summary.
async fn overview(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let sites: Vec<SiteRow> = sqlx::query_as(
        "SELECT id, slug, name, seo, seo_version, primary_domain, archived_at FROM sites
          WHERE archived_at IS NULL ORDER BY position, name",
    )
    .fetch_all(&state.pool)
    .await?;
    let analytics = analytics(&state.pool).await?;
    let mut rows = Vec::new();
    for site in sites.into_iter().filter(|s| session.site_role(s.id).is_some()) {
        let settings = SeoSettings::from_stored(site.seo.clone());
        let pages = audit(&state.pool, site.id, &settings).await?;
        let site_level = site_issues(&settings, &pages);
        rows.push(json!({
            "site": site.slug,
            "name": site.name,
            "primary_domain": site.primary_domain,
            "indexing": settings.indexing,
            "summary": summarise(&pages, &site_level),
            "integrations": integrations(&settings, &analytics),
        }));
    }
    Ok(Json(json!({ "sites": rows })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_are_validated() {
        let ok = SeoSettings {
            title_template: Some(" %s · ZiraHR ".into()),
            google_verification: Some("abcDEF123_-xyz".into()),
            same_as: vec!["https://www.linkedin.com/company/figbud".into()],
            markets: vec!["ke".into(), "UG".into()],
            ..SeoSettings::default()
        }
        .normalise()
        .unwrap();
        assert_eq!(ok.title_template.as_deref(), Some("%s · ZiraHR"));
        assert_eq!(ok.markets, ["KE", "UG"]);
        for bad in [
            SeoSettings {
                title_template: Some("ZiraHR".into()),
                ..SeoSettings::default()
            },
            SeoSettings {
                google_verification: Some("<meta content=x>".into()),
                ..SeoSettings::default()
            },
            SeoSettings {
                same_as: vec!["http://insecure.example".into()],
                ..SeoSettings::default()
            },
            SeoSettings {
                markets: vec!["Kenya".into()],
                ..SeoSettings::default()
            },
            SeoSettings {
                languages: vec!["de".into()],
                ..SeoSettings::default()
            },
        ] {
            assert!(bad.normalise().is_err());
        }
    }

    #[test]
    fn links_and_text_are_found_in_documents() {
        let doc = json!([{ "type": "hero", "heading": "Payroll", "primary": { "label": "Demo", "href": "/demo?x=1" } },
                         { "type": "faq", "items": [{ "question": "Why?", "answer": "Because." }] }]);
        let mut found = Vec::new();
        hrefs(&doc, &mut found);
        assert_eq!(found, ["/demo?x=1"]);
        assert_eq!(
            text_len(&doc),
            "Payroll".len() + "Demo".len() + "Why?".len() + "Because.".len()
        );
    }
}
