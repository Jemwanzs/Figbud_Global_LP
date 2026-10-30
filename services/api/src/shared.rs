//! Content library (P7-D1): sections written once and used on pages of any
//! FigBud website through the Shared content block (`shared_id`).
//!
//! - Pages reference an item, never copy it, and always show its latest
//!   published version, so one change reaches every website using it.
//! - Editors edit the draft; reviewers publish it. Each publish is kept as a
//!   numbered version with a note; any version can be restored into the draft.
//! - Items can't hold media images (those belong to one website) or other
//!   shared items. An item in use can't be archived; unpublished or archived
//!   items never reach a website.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
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
    pages::blocks::{Block, PageDoc, Section},
    routes::SharedState,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/shared", get(list).post(create))
        .route("/v1/admin/shared/{id}", get(read))
        .route("/v1/admin/shared/{id}/draft", post(save_draft))
        .route("/v1/admin/shared/{id}/publish", post(publish))
        .route(
            "/v1/admin/shared/{id}/versions/{number}/restore",
            post(restore_version),
        )
        .route("/v1/admin/shared/{id}/{action}", post(archive_action))
}

// ----------------------------------------------------------------- content

fn invalid(field: &'static str, message: &'static str) -> ApiError {
    ApiError::Validation(vec![FieldError {
        field,
        code: "invalid",
        message,
    }])
}

/// Reads and checks an item's content: one block, validated like a page
/// section, never an image or another shared item.
fn content(value: Value) -> Result<Block, ApiError> {
    let block: Block = serde_json::from_value(value)
        .map_err(|_| invalid("content", "The content couldn't be read. Reload and try again."))?;
    if matches!(block, Block::Image { .. } | Block::Shared { .. }) {
        return Err(invalid(
            "content",
            "Shared content can't hold media images or other shared content.",
        ));
    }
    let doc = PageDoc {
        seo_title: None,
        seo_description: None,
        seo_image_id: None,
        seo_noindex: false,
        sections: vec![Section {
            id: "content".into(),
            hidden: false,
            tone: None,
            block: block.clone(),
        }],
    };
    doc.validate().map_err(ApiError::Validation)?;
    Ok(block)
}

fn name(raw: &str) -> Result<String, ApiError> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(invalid("name", "Name this content (up to 120 characters)."));
    }
    Ok(name.to_owned())
}

// ----------------------------------------------------------------- pages

fn shared_ids(doc: &PageDoc) -> Vec<Uuid> {
    let mut ids: Vec<Uuid> = doc
        .sections
        .iter()
        .filter_map(|s| match &s.block {
            Block::Shared { shared_id } => Some(*shared_id),
            _ => None,
        })
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

/// Refuses a page that uses unknown or archived library items.
pub async fn check_refs(pool: &PgPool, doc: &PageDoc) -> Result<(), ApiError> {
    let ids = shared_ids(doc);
    if ids.is_empty() {
        return Ok(());
    }
    let found: i64 =
        sqlx::query_scalar("SELECT count(*) FROM shared_blocks WHERE id = ANY($1) AND archived_at IS NULL")
            .bind(&ids)
            .fetch_one(pool)
            .await?;
    if found as usize == ids.len() {
        Ok(())
    } else {
        Err(invalid(
            "sections",
            "Choose shared content from the library (archived content can't be used).",
        ))
    }
}

/// Which library item a resolved section came from.
pub struct Origin {
    section: String,
    info: Value,
}

/// Replaces each Shared content section with its item's published content.
/// On websites (`public`), a section whose item is unpublished or archived
/// is left out; previews keep it unresolved so editors see the gap.
pub async fn resolve(pool: &PgPool, doc: &mut PageDoc, public: bool) -> Result<Vec<Origin>, sqlx::Error> {
    let ids = shared_ids(doc);
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows: Vec<(Uuid, String, Value, i32)> = sqlx::query_as(
        "SELECT id, name, published, published_number FROM shared_blocks
          WHERE id = ANY($1) AND archived_at IS NULL AND published IS NOT NULL",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let mut origins = Vec::new();
    let mut missing = Vec::new();
    for section in &mut doc.sections {
        let Block::Shared { shared_id } = section.block else {
            continue;
        };
        let found = rows
            .iter()
            .find(|r| r.0 == shared_id)
            .and_then(|r| serde_json::from_value::<Block>(r.2.clone()).ok().map(|b| (r, b)));
        match found {
            Some(((id, name, _, number), block)) => {
                section.block = block;
                origins.push(Origin {
                    section: section.id.clone(),
                    info: json!({ "id": id, "name": name, "version": number }),
                });
            }
            None => missing.push(section.id.clone()),
        }
    }
    if public {
        doc.sections.retain(|s| !missing.contains(&s.id));
    }
    Ok(origins)
}

/// Marks resolved sections in a rendered document (`shared`: id, name, version).
pub fn annotate(rendered: &mut Value, origins: &[Origin]) {
    let Some(sections) = rendered["sections"].as_array_mut() else {
        return;
    };
    for section in sections {
        if let Some(origin) = origins.iter().find(|o| section["id"] == o.section.as_str()) {
            section["shared"] = origin.info.clone();
        }
    }
}

// ----------------------------------------------------------------- studio

async fn audit(
    pool: &PgPool,
    session: &AdminSession,
    action: &str,
    id: Uuid,
    detail: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, detail)
         VALUES ($1, $2, $3, 'shared_block', $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(session.user.id)
    .bind(action)
    .bind(id.to_string())
    .bind(detail)
    .execute(pool)
    .await?;
    Ok(())
}

/// Pages using each item: (item id, page id, title, path, site slug, site name, "draft" | "published").
async fn usage(
    pool: &PgPool,
    id: Option<Uuid>,
) -> Result<Vec<(String, Uuid, String, String, String, String, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT DISTINCT u.shared_id, p.id, p.title, p.path, s.slug, s.name, u.state
           FROM pages p JOIN sites s ON s.id = p.site_id,
                LATERAL (SELECT jsonb_path_query(p.draft, '$.sections[*].shared_id') #>> '{}' AS shared_id,
                                'draft'::text AS state
                         UNION ALL
                         SELECT jsonb_path_query(p.published, '$.sections[*].shared_id') #>> '{}', 'published') u
          WHERE p.archived_at IS NULL AND ($1::uuid IS NULL OR u.shared_id = $1::text)
          ORDER BY s.name, p.title",
    )
    .bind(id)
    .fetch_all(pool)
    .await
}

fn usage_json(used: &[(String, Uuid, String, String, String, String, String)], id: &str) -> Value {
    json!(
        used.iter()
            .filter(|u| u.0 == id)
            .map(|(_, page, title, path, slug, site, state)| json!({
                "page": page, "title": title, "path": format!("/{path}"),
                "site": slug, "site_name": site, "state": state,
            }))
            .collect::<Vec<_>>()
    )
}

#[derive(Serialize, FromRow)]
struct Row {
    id: Uuid,
    name: String,
    draft: Value,
    draft_version: i32,
    published: Option<Value>,
    published_number: Option<i32>,
    published_at: Option<DateTime<Utc>>,
    archived_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
    updated_by: Option<String>,
}

macro_rules! select {
    () => {
        "SELECT b.id, b.name, b.draft, b.draft_version, b.published, b.published_number, b.published_at,
                b.archived_at, b.updated_at, u.name AS updated_by
           FROM shared_blocks b LEFT JOIN admin_users u ON u.id = b.updated_by "
    };
}

async fn load(pool: &PgPool, id: Uuid) -> Result<Row, ApiError> {
    sqlx::query_as(concat!(select!(), "WHERE b.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound)
}

async fn list(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let rows: Vec<Row> = sqlx::query_as(concat!(select!(), "ORDER BY b.archived_at IS NOT NULL, b.name"))
        .fetch_all(&state.pool)
        .await?;
    let mut used = usage(&state.pool, None).await?;
    // Pages on websites someone can't access stay out of the usage lists.
    used.retain(|u| session.sees_slug(&u.4));
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let id = row.id.to_string();
            let mut value = serde_json::to_value(&row).unwrap_or(Value::Null);
            value["draft_differs"] = json!(row.published.as_ref() != Some(&row.draft));
            value["used_on"] = usage_json(&used, &id);
            value
        })
        .collect();
    Ok(Json(json!({
        "items": items,
        "can_edit": session.user.role >= Role::Editor && session.all_sites(),
        "can_publish": session.user.role >= Role::Reviewer && session.all_sites(),
    })))
}

async fn read(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Viewer)?;
    let row = load(&state.pool, id).await?;
    let versions: Vec<(i32, String, Option<String>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT v.number, v.note, u.name, v.published_at FROM shared_block_versions v
           LEFT JOIN admin_users u ON u.id = v.published_by
          WHERE v.block_id = $1 ORDER BY v.number DESC LIMIT 50",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;
    let mut used = usage(&state.pool, Some(id)).await?;
    used.retain(|u| session.sees_slug(&u.4));
    let mut value = serde_json::to_value(&row).map_err(|e| ApiError::Internal(e.to_string()))?;
    value["draft_differs"] = json!(row.published.as_ref() != Some(&row.draft));
    value["used_on"] = usage_json(&used, &id.to_string());
    value["versions"] = json!(versions
        .into_iter()
        .map(|(number, note, by, at)| json!({ "number": number, "note": note, "published_by": by, "published_at": at }))
        .collect::<Vec<_>>());
    value["can_edit"] =
        json!(session.user.role >= Role::Editor && session.all_sites() && row.archived_at.is_none());
    value["can_publish"] =
        json!(session.user.role >= Role::Reviewer && session.all_sites() && row.archived_at.is_none());
    Ok(Json(value))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    name: String,
    content: Value,
}

async fn create(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<CreateInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_all_sites(Role::Editor)?;
    let name = name(&input.name)?;
    let block = content(input.content)?;
    let id = Uuid::now_v7();
    let draft = serde_json::to_value(&block).map_err(|e| ApiError::Internal(e.to_string()))?;
    sqlx::query(
        "INSERT INTO shared_blocks (id, name, draft, created_by, updated_by) VALUES ($1, $2, $3, $4, $4)",
    )
    .bind(id)
    .bind(&name)
    .bind(&draft)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        &session,
        "shared.created",
        id,
        json!({ "name": name }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": id }))))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftInput {
    name: String,
    content: Value,
    version: i32,
}

/// Saves the draft (and name). Never publishes.
async fn save_draft(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<DraftInput>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_all_sites(Role::Editor)?;
    let row = load(&state.pool, id).await?;
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this content before editing it."));
    }
    let name = name(&input.name)?;
    let block = content(input.content)?;
    let draft = serde_json::to_value(&block).map_err(|e| ApiError::Internal(e.to_string()))?;
    let updated = sqlx::query(
        "UPDATE shared_blocks SET name = $3, draft = $4, draft_version = draft_version + 1,
                updated_by = $5, updated_at = now()
          WHERE id = $1 AND draft_version = $2",
    )
    .bind(id)
    .bind(input.version)
    .bind(&name)
    .bind(&draft)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "Someone else changed this content. Reload to see their changes.",
        ));
    }
    if row.draft != draft || row.name != name {
        audit(
            &state.pool,
            &session,
            "shared.draft_saved",
            id,
            json!({ "from": { "name": row.name, "content": row.draft }, "to": { "name": name, "content": draft } }),
        )
        .await?;
    }
    Ok(Json(json!({ "draft_version": input.version + 1 })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PublishInput {
    note: String,
}

/// Publishes the draft everywhere it's used, as the next version (reviewers).
async fn publish(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
    Json(input): Json<PublishInput>,
) -> Result<impl IntoResponse, ApiError> {
    // One change reaches every website using the content: reviewers only.
    session.require_all_sites(Role::Reviewer)?;
    let note = input.note.trim().to_owned();
    if note.is_empty() || note.chars().count() > 300 {
        return Err(invalid("note", "Say what changed (up to 300 characters)."));
    }
    let row = load(&state.pool, id).await?;
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this content before publishing it."));
    }
    if row.published.as_ref() == Some(&row.draft) {
        return Err(ApiError::Conflict("The draft is already published."));
    }
    let mut tx = state.pool.begin().await?;
    let number: i32 = sqlx::query_scalar(
        "SELECT COALESCE(max(number), 0) + 1 FROM shared_block_versions WHERE block_id = $1",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO shared_block_versions (block_id, number, content, note, published_by) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(number)
    .bind(&row.draft)
    .bind(&note)
    .bind(session.user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE shared_blocks SET published = draft, published_number = $2, published_at = now(), updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(number)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state.pool,
        &session,
        "shared.published",
        id,
        json!({ "version": number, "note": note }),
    )
    .await?;
    Ok(Json(json!({ "version": number })))
}

/// Copies an earlier version into the draft (publish it to make it live).
async fn restore_version(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, number)): Path<(Uuid, i32)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_all_sites(Role::Editor)?;
    let row = load(&state.pool, id).await?;
    if row.archived_at.is_some() {
        return Err(ApiError::Conflict("Restore this content before editing it."));
    }
    let version: Value =
        sqlx::query_scalar("SELECT content FROM shared_block_versions WHERE block_id = $1 AND number = $2")
            .bind(id)
            .bind(number)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::NotFound)?;
    sqlx::query(
        "UPDATE shared_blocks SET draft = $2, draft_version = draft_version + 1, updated_by = $3, updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(&version)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        &session,
        "shared.version_restored",
        id,
        json!({ "version": number }),
    )
    .await?;
    Ok(Json(json!({ "restored": number })))
}

async fn archive_action(
    State(state): State<SharedState>,
    session: AdminSession,
    Path((id, action)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    session.require_all_sites(Role::Editor)?;
    let row = load(&state.pool, id).await?;
    match action.as_str() {
        "archive" => {
            if row.archived_at.is_some() {
                return Err(ApiError::Conflict("This content is already archived."));
            }
            if !usage(&state.pool, Some(id)).await?.is_empty() {
                return Err(ApiError::Conflict(
                    "This content is used on pages. Remove it from those pages (and publish) first.",
                ));
            }
            sqlx::query("UPDATE shared_blocks SET archived_at = now(), updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await?;
            audit(&state.pool, &session, "shared.archived", id, json!({})).await?;
        }
        "unarchive" => {
            if row.archived_at.is_none() {
                return Err(ApiError::Conflict("This content isn't archived."));
            }
            sqlx::query("UPDATE shared_blocks SET archived_at = NULL, updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(&state.pool)
                .await?;
            audit(&state.pool, &session, "shared.unarchived", id, json!({})).await?;
        }
        _ => return Err(ApiError::NotFound),
    }
    Ok(Json(json!({ "id": id })))
}
