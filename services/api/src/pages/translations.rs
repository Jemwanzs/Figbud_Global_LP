//! Page translations (P7-L2, owner's brief, 14 Nov 2026): each published
//! page's visible text in another language, kept beside the English page as
//! a layer of translated fields rather than a second document.
//!
//! A field is addressed by its section's id and its path inside the section
//! (`hero-1/items/0/title`), or `@title`, `@seo_title`, `@seo_description`
//! for the page itself, so reordering sections never breaks a translation.
//! Each translated field keeps the English it was translated from: when the
//! English changes, that field counts as needing an update and visitors see
//! the English there, never an outdated translation.
//!
//! Workflow: Draft → Needs review (only when complete) → Complete (a reviewer
//! records the review) → Published (only when complete and reviewed). Saving
//! a change sends a reviewed translation back to draft. Websites read the
//! published layer only, over the published English page (`?locale=`).

use std::collections::BTreeMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::blocks::PageDoc;
use crate::{
    admin::{AdminSession, Role},
    error::{ApiError, FieldError},
    routes::SharedState,
    sites::audit_site,
};

/// Languages pages can be translated into (English is the source).
pub const LOCALES: [&str; 4] = ["sw", "fr", "ar", "zh"];

/// Keys whose strings (or the strings inside them) are visible text.
const TEXT_KEYS: [&str; 17] = [
    "eyebrow",
    "heading",
    "headline",
    "accent",
    "lead",
    "intro",
    "body",
    "title",
    "label",
    "question",
    "answer",
    "caption",
    "value",
    "source",
    "highlights",
    "bullets",
    "messages",
];

/// Keys never translated, even inside text (addresses, ids, settings).
const NEVER: [&str; 6] = ["id", "type", "href", "image_id", "modules", "tone"];

const MAX_TEXT: usize = 5000;

/// One translated field and the English it was translated from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Field {
    pub text: String,
    pub source: String,
}

pub type Fields = BTreeMap<String, Field>;

/// The English texts of a page to translate, by field key, in page order.
pub fn sources(title: &str, doc: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    out.push(("@title".to_owned(), title.to_owned()));
    for key in ["seo_title", "seo_description"] {
        if let Some(s) = doc[key].as_str().filter(|s| !s.trim().is_empty()) {
            out.push((format!("@{key}"), s.to_owned()));
        }
    }
    for section in doc["sections"].as_array().into_iter().flatten() {
        if section["hidden"] == json!(true) {
            continue;
        }
        let Some(id) = section["id"].as_str() else {
            continue;
        };
        let mut found = Vec::new();
        texts_in(section, "", false, &mut found);
        out.extend(
            found
                .into_iter()
                .map(|(path, text)| (format!("{id}{path}"), text)),
        );
    }
    out
}

/// Visible strings inside a value, by path (`/items/0/title`).
fn texts_in(value: &Value, path: &str, text: bool, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if NEVER.contains(&key.as_str()) || key.ends_with("_html") {
                    continue;
                }
                let inside = text || TEXT_KEYS.contains(&key.as_str());
                texts_in(child, &format!("{path}/{key}"), inside, out);
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                texts_in(item, &format!("{path}/{i}"), text, out);
            }
        }
        Value::String(s) if text && !s.trim().is_empty() => out.push((path.to_owned(), s.clone())),
        _ => {}
    }
}

/// How far a translation covers the page's English: current fields over all.
#[derive(Serialize, Debug, PartialEq)]
pub struct Coverage {
    pub translated: usize,
    pub total: usize,
    /// Fields whose English changed since they were translated.
    pub outdated: usize,
}

impl Coverage {
    pub fn complete(&self) -> bool {
        self.total > 0 && self.translated == self.total
    }
}

pub fn coverage(sources: &[(String, String)], fields: &Fields) -> Coverage {
    let mut translated = 0;
    let mut outdated = 0;
    for (key, english) in sources {
        match fields.get(key) {
            Some(f) if &f.source == english && !f.text.trim().is_empty() => translated += 1,
            Some(_) => outdated += 1,
            None => {}
        }
    }
    Coverage {
        translated,
        total: sources.len(),
        outdated,
    }
}

/// Puts the current translated fields over the English document (in place);
/// a field missing or translated from different English stays English.
/// Returns the translated page title, when there is one.
pub fn apply(doc: &mut Value, title: &str, fields: &Fields) -> Option<String> {
    let current = |key: &str, english: &str| {
        fields
            .get(key)
            .filter(|f| f.source == english && !f.text.trim().is_empty())
            .map(|f| f.text.clone())
    };
    for key in ["seo_title", "seo_description"] {
        if let Some(english) = doc[key].as_str().map(str::to_owned)
            && let Some(text) = current(&format!("@{key}"), &english)
        {
            doc[key] = json!(text);
        }
    }
    if let Some(sections) = doc["sections"].as_array_mut() {
        for section in sections {
            let Some(id) = section["id"].as_str().map(str::to_owned) else {
                continue;
            };
            let mut found = Vec::new();
            texts_in(section, "", false, &mut found);
            for (path, english) in found {
                if let Some(text) = current(&format!("{id}{path}"), &english)
                    && let Some(slot) = section.pointer_mut(&path)
                {
                    *slot = json!(text);
                }
            }
        }
    }
    current("@title", title)
}

// ---------------------------------------------------------------- store

#[derive(sqlx::FromRow)]
struct Row {
    fields: Value,
    status: String,
    reviewer: String,
    reviewed_at: Option<DateTime<Utc>>,
    published: Option<Value>,
    published_at: Option<DateTime<Utc>>,
    version: i32,
}

async fn row(pool: &PgPool, page: Uuid, locale: &str) -> Result<Option<Row>, sqlx::Error> {
    sqlx::query_as(
        "SELECT fields, status, reviewer, reviewed_at, published, published_at, version
           FROM page_translations WHERE page_id = $1 AND locale = $2",
    )
    .bind(page)
    .bind(locale)
    .fetch_optional(pool)
    .await
}

fn fields_of(value: Value) -> Fields {
    serde_json::from_value(value).unwrap_or_default()
}

/// The published translation of a published page, for websites.
pub async fn published(pool: &PgPool, page: Uuid, locale: &str) -> Result<Option<Fields>, sqlx::Error> {
    let value: Option<Option<Value>> =
        sqlx::query_scalar("SELECT published FROM page_translations WHERE page_id = $1 AND locale = $2")
            .bind(page)
            .bind(locale)
            .fetch_optional(pool)
            .await?;
    Ok(value.flatten().map(fields_of))
}

struct PageSource {
    site_id: Uuid,
    title: String,
    published: Option<Value>,
}

async fn page_source(pool: &PgPool, id: Uuid) -> Result<PageSource, ApiError> {
    let row: Option<(Uuid, String, Option<Value>)> =
        sqlx::query_as("SELECT site_id, title, published FROM pages WHERE id = $1 AND archived_at IS NULL")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    let (site_id, title, published) = row.ok_or(ApiError::NotFound)?;
    Ok(PageSource {
        site_id,
        title,
        published,
    })
}

/// The English to translate: the published page, as websites show it.
fn english(source: &PageSource) -> Result<Vec<(String, String)>, ApiError> {
    let published = source.published.clone().ok_or(ApiError::Conflict(
        "Publish the English page first: translations follow the published page.",
    ))?;
    let doc: PageDoc = serde_json::from_value(published).map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(sources(&source.title, &doc.render(false)))
}

fn check_locale(locale: &str) -> Result<(), ApiError> {
    if LOCALES.contains(&locale) {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/pages/{id}/translations", get(list))
        .route("/v1/admin/pages/{id}/translations/{locale}", get(read).post(save))
        .route(
            "/v1/admin/pages/{id}/translations/{locale}/{action}",
            post(action),
        )
}

/// Every language's status for a page.
async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let source = page_source(&state.pool, id).await?;
    session.require_site(source.site_id, Role::Viewer)?;
    let texts = english(&source).unwrap_or_default();
    let mut out = Vec::new();
    for locale in LOCALES {
        let r = row(&state.pool, id, locale).await?;
        let fields = r
            .as_ref()
            .map(|r| fields_of(r.fields.clone()))
            .unwrap_or_default();
        out.push(json!({
            "locale": locale,
            "status": r.as_ref().map_or("draft", |r| r.status.as_str()),
            "started": r.is_some(),
            "published": r.as_ref().is_some_and(|r| r.published.is_some()),
            "coverage": coverage(&texts, &fields),
        }));
    }
    Ok(Json(
        json!({ "translations": out, "source_published": source.published.is_some() }),
    ))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, locale)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    check_locale(&locale)?;
    let source = page_source(&state.pool, id).await?;
    session.require_site(source.site_id, Role::Viewer)?;
    let texts = english(&source)?;
    let r = row(&state.pool, id, &locale).await?;
    let fields = r
        .as_ref()
        .map(|r| fields_of(r.fields.clone()))
        .unwrap_or_default();
    let published_fields = r.as_ref().and_then(|r| r.published.clone()).map(fields_of);
    Ok(Json(json!({
        "locale": locale,
        "sources": texts.iter().map(|(key, text)| json!({ "key": key, "english": text })).collect::<Vec<_>>(),
        "fields": fields,
        "status": r.as_ref().map_or("draft", |r| r.status.as_str()),
        "reviewer": r.as_ref().map(|r| r.reviewer.clone()).unwrap_or_default(),
        "reviewed_at": r.as_ref().and_then(|r| r.reviewed_at),
        "published": published_fields.is_some(),
        "published_at": r.as_ref().and_then(|r| r.published_at),
        "changes_pending": published_fields.is_some_and(|p| p != fields),
        "coverage": coverage(&texts, &fields),
        "version": r.as_ref().map_or(0, |r| r.version),
        "can_edit": session.site_role(source.site_id) >= Some(Role::Editor),
        "can_review": session.site_role(source.site_id) >= Some(Role::Reviewer),
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveInput {
    /// Translated text by field key (empty removes it).
    texts: BTreeMap<String, String>,
    version: i32,
}

/// Saves translated text; each field remembers the English it translates.
async fn save(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, locale)): Path<(Uuid, String)>,
    Json(input): Json<SaveInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Editor)?;
    check_locale(&locale)?;
    let source = page_source(&state.pool, id).await?;
    session.require_site(source.site_id, Role::Editor)?;
    let texts = english(&source)?;
    let english: BTreeMap<&str, &str> = texts.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let mut errors = Vec::new();
    let mut fields = Fields::new();
    for (key, text) in &input.texts {
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        let Some(original) = english.get(key.as_str()) else {
            errors.push(FieldError {
                field: "texts",
                code: "unknown",
                message: "Some texts aren't on the published page any more. Reload to see the latest.",
            });
            break;
        };
        if text.chars().count() > MAX_TEXT {
            errors.push(FieldError {
                field: "texts",
                code: "length",
                message: "Each text can be up to 5,000 characters.",
            });
            break;
        }
        fields.insert(
            key.clone(),
            Field {
                text: text.to_owned(),
                source: (*original).to_owned(),
            },
        );
    }
    if !errors.is_empty() {
        return Err(ApiError::Validation(errors));
    }
    let value = serde_json::to_value(&fields).map_err(|e| ApiError::Internal(e.to_string()))?;
    let before = row(&state.pool, id, &locale).await?;
    let saved: Option<i32> = if before.is_some() {
        // A changed translation needs its review again.
        sqlx::query_scalar(
            "UPDATE page_translations SET fields = $3,
                    status = CASE WHEN fields = $3 THEN status ELSE 'draft' END,
                    version = version + 1, updated_by = $5, updated_at = now()
              WHERE page_id = $1 AND locale = $2 AND version = $4 RETURNING version",
        )
        .bind(id)
        .bind(&locale)
        .bind(&value)
        .bind(input.version)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_scalar(
            "INSERT INTO page_translations (page_id, locale, fields, updated_by) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING RETURNING version",
        )
        .bind(id)
        .bind(&locale)
        .bind(&value)
        .bind(session.user.id)
        .fetch_optional(&state.pool)
        .await?
    };
    let version = saved.ok_or(ApiError::Conflict(
        "Someone else changed this translation. Reload to see their changes.",
    ))?;
    if before.as_ref().map(|b| &b.fields) != Some(&value) {
        audit_site(
            &state.pool,
            &session,
            source.site_id,
            "page.translation_saved",
            json!({ "page": id, "locale": locale,
                    "before": before.map(|b| b.fields), "after": value }),
        )
        .await?;
    }
    Ok(Json(
        json!({ "version": version, "coverage": coverage(&texts, &fields) }),
    ))
}

#[derive(Deserialize, Default)]
#[serde(default, deny_unknown_fields)]
struct ActionInput {
    version: i32,
    /// Approve: who reviewed it (a native speaker, by name).
    reviewer: String,
}

/// submit (editors) · approve, publish, unpublish, back_to_draft (reviewers).
async fn action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, locale, action)): Path<(Uuid, String, String)>,
    Json(input): Json<ActionInput>,
) -> Result<impl IntoResponse, ApiError> {
    check_locale(&locale)?;
    let needed = if action == "submit" {
        Role::Editor
    } else {
        Role::Reviewer
    };
    session.require(needed)?;
    let source = page_source(&state.pool, id).await?;
    session.require_site(source.site_id, needed)?;
    let texts = english(&source)?;
    let r = row(&state.pool, id, &locale)
        .await?
        .ok_or(ApiError::Conflict("Start the translation first."))?;
    if r.version != input.version {
        return Err(ApiError::Conflict(
            "Someone else changed this translation. Reload to see their changes.",
        ));
    }
    let fields = fields_of(r.fields.clone());
    let complete = coverage(&texts, &fields).complete();
    let incomplete =
        || ApiError::Conflict("Translate every text first (texts whose English changed need updating too).");
    let (sql, audit): (&str, &str) = match action.as_str() {
        "submit" => {
            if !complete {
                return Err(incomplete());
            }
            (
                "UPDATE page_translations SET status = 'needs_review', version = version + 1,
                        updated_by = $3, updated_at = now() WHERE page_id = $1 AND locale = $2",
                "page.translation_submitted",
            )
        }
        "approve" => {
            if !complete {
                return Err(incomplete());
            }
            if r.status != "needs_review" {
                return Err(ApiError::Conflict("Ask for a review first."));
            }
            let name = input.reviewer.trim();
            if name.is_empty() || name.chars().count() > 120 {
                return Err(ApiError::Validation(vec![FieldError {
                    field: "reviewer",
                    code: "required",
                    message: "Record who reviewed it (a native speaker), up to 120 characters.",
                }]));
            }
            (
                "UPDATE page_translations SET status = 'complete', reviewer = $4, reviewed_at = now(),
                        version = version + 1, updated_by = $3, updated_at = now()
                  WHERE page_id = $1 AND locale = $2",
                "page.translation_approved",
            )
        }
        "publish" => {
            if !complete || r.status != "complete" {
                return Err(ApiError::Conflict(
                    "Only a complete, reviewed translation can be published.",
                ));
            }
            (
                "UPDATE page_translations SET published = fields, published_at = now(),
                        version = version + 1, updated_by = $3, updated_at = now()
                  WHERE page_id = $1 AND locale = $2",
                "page.translation_published",
            )
        }
        "unpublish" => (
            "UPDATE page_translations SET published = NULL, published_at = NULL,
                    version = version + 1, updated_by = $3, updated_at = now()
              WHERE page_id = $1 AND locale = $2",
            "page.translation_unpublished",
        ),
        "back_to_draft" => (
            "UPDATE page_translations SET status = 'draft', version = version + 1,
                    updated_by = $3, updated_at = now() WHERE page_id = $1 AND locale = $2",
            "page.translation_back_to_draft",
        ),
        _ => return Err(ApiError::NotFound),
    };
    sqlx::query(sql)
        .bind(id)
        .bind(&locale)
        .bind(session.user.id)
        .bind(input.reviewer.trim())
        .execute(&state.pool)
        .await?;
    audit_site(
        &state.pool,
        &session,
        source.site_id,
        audit,
        json!({ "page": id, "locale": locale, "reviewer": input.reviewer.trim() }),
    )
    .await?;
    read(State(state), session, Path((id, locale))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc() -> Value {
        json!({
            "seo_title": "Payroll for Kenya", "seo_description": "",
            "sections": [
                { "id": "h", "type": "hero", "heading": "Pay people right", "lead": "Every time.",
                  "primary": { "label": "Book a demo", "href": "/contact" },
                  "highlights": ["Statutory rules", "Payslips"] },
                { "id": "f", "type": "faq", "items": [{ "question": "Is it hosted?", "answer": "Yes." }] },
                { "id": "x", "type": "text", "hidden": true, "body": "Draft only" }
            ]
        })
    }

    #[test]
    fn visible_text_is_found_by_section_and_path_without_addresses_or_hidden_sections() {
        let keys: Vec<String> = sources("Payroll", &doc()).into_iter().map(|(k, _)| k).collect();
        assert_eq!(
            keys,
            [
                "@title",
                "@seo_title",
                "h/heading",
                "h/highlights/0",
                "h/highlights/1",
                "h/lead",
                "h/primary/label",
                "f/items/0/answer",
                "f/items/0/question",
            ]
        );
    }

    #[test]
    fn translations_apply_only_where_the_english_is_unchanged() {
        let english = sources("Payroll", &doc());
        let field = |text: &str, source: &str| Field {
            text: text.into(),
            source: source.into(),
        };
        let mut fields = Fields::new();
        fields.insert("@title".into(), field("Mishahara", "Payroll"));
        fields.insert("h/heading".into(), field("Lipa watu sawa", "Pay people right"));
        // Translated from an older English lead: needs an update, shown in English.
        fields.insert("h/lead".into(), field("Kila mara.", "Each time."));
        let c = coverage(&english, &fields);
        assert_eq!((c.translated, c.total, c.outdated), (2, 9, 1));
        assert!(!c.complete());
        let mut page = doc();
        let title = apply(&mut page, "Payroll", &fields);
        assert_eq!(title.as_deref(), Some("Mishahara"));
        assert_eq!(page["sections"][0]["heading"], "Lipa watu sawa");
        assert_eq!(page["sections"][0]["lead"], "Every time.");
        assert_eq!(page["sections"][0]["primary"]["href"], "/contact");
    }
}
