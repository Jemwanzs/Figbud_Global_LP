//! The approval queue across websites (P7-F2): everything waiting for a second
//! person, in one list. It only reads: each decision still happens on the
//! item's own screen, with its preview and its own rules.
//!
//! `can_decide` mirrors those rules (a reviewer on every website involved, and
//! not the requester unless they're an owner) so the list can say whose turn
//! it is. The endpoints that decide remain the authority.

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role},
    error::ApiError,
    routes::SharedState,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/approvals", get(queue))
        .route("/v1/admin/audit/{id}/changes", get(changes))
}

/// One row for every kind of request. Sites are slugs: a proof record can be
/// meant for several, and it and articles live with the corporate website.
const PENDING: &str = concat!(
    "SELECT 'page' AS kind, r.id::text AS id, p.id::text AS parent, ARRAY[s.slug] AS sites, p.title, r.note,
            r.requested_by, r.created_at AS requested_at
       FROM page_revisions r JOIN pages p ON p.id = r.page_id JOIN sites s ON s.id = p.site_id
      WHERE r.state = 'pending' AND p.archived_at IS NULL AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'brand', r.id::text, s.id::text, ARRAY[s.slug], 'Brand', r.note, r.requested_by, r.created_at
       FROM brand_revisions r JOIN sites s ON s.id = r.site_id
      WHERE r.state = 'pending' AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'site_status', r.id::text, s.id::text, ARRAY[s.slug], 'Status: ' || replace(r.to_status, '_', ' '),
            r.reason, r.requested_by, r.created_at
       FROM site_status_requests r JOIN sites s ON s.id = r.site_id
      WHERE r.decision = 'pending' AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'hero', s.id::text, s.id::text, ARRAY[s.slug], 'Hero design', COALESCE(h.review_note, ''),
            h.review_requested_by, h.review_requested_at
       FROM site_heroes h JOIN sites s ON s.id = h.site_id
      WHERE h.review_requested_at IS NOT NULL AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'pricing', s.id::text, s.id::text, ARRAY[s.slug], 'Price book', COALESCE(b.review_note, ''),
            b.review_requested_by, b.review_requested_at
       FROM pricing_books b JOIN sites s ON s.id = b.site_id
      WHERE b.review_requested_at IS NOT NULL AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'payroll', s.id::text, s.id::text, ARRAY[s.slug], 'Payroll Calculator rules', COALESCE(c.review_note, ''),
            c.review_requested_by, c.review_requested_at
       FROM site_payroll_calculators c JOIN sites s ON s.id = c.site_id
      WHERE c.review_requested_at IS NOT NULL AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'campaign', r.id::text, c.id::text,
            ARRAY[s.slug] || ARRAY(SELECT jsonb_array_elements_text(r.document -> 'also_on')),
            c.name, r.note, r.requested_by, r.created_at
       FROM campaign_revisions r JOIN campaigns c ON c.id = r.campaign_id JOIN sites s ON s.id = c.site_id
      WHERE r.state = 'pending' AND c.archived_at IS NULL AND s.archived_at IS NULL",
    " UNION ALL
     SELECT 'proof', i.id::text, i.id::text, ARRAY['figbud'] || i.draft_sites,
            left(CASE i.kind WHEN 'organization' THEN i.draft ->> 'name'
                             WHEN 'testimonial' THEN i.draft ->> 'quote'
                             ELSE i.draft ->> 'label' END, 80),
            COALESCE(i.review_note, ''), i.review_requested_by, i.review_requested_at
       FROM proof_items i
      WHERE i.review_requested_at IS NOT NULL AND i.archived_at IS NULL",
    " UNION ALL
     SELECT 'article', a.id::text, a.id::text, ARRAY['figbud'], a.title, '', a.last_edited_by,
            COALESCE(a.submitted_at, a.updated_at)
       FROM cms_articles a
      WHERE a.status = 'in_review'",
    " ORDER BY requested_at",
);

#[derive(FromRow)]
struct Row {
    kind: String,
    id: String,
    parent: String,
    sites: Vec<String>,
    title: Option<String>,
    note: String,
    requested_by: Option<Uuid>,
    requested_at: DateTime<Utc>,
}

#[derive(Serialize)]
struct Item {
    kind: String,
    id: String,
    parent: String,
    sites: Vec<Named>,
    title: String,
    note: String,
    requested_by: Option<String>,
    requested_at: DateTime<Utc>,
    mine: bool,
    can_decide: bool,
}

#[derive(Serialize)]
struct Named {
    slug: String,
    name: String,
}

async fn queue(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    let rows: Vec<Row> = sqlx::query_as(PENDING).fetch_all(&state.pool).await?;
    let sites: Vec<(String, String)> = sqlx::query_as("SELECT slug, name FROM sites")
        .fetch_all(&state.pool)
        .await?;
    let people: Vec<(Uuid, String)> = sqlx::query_as("SELECT id, name FROM admin_users")
        .fetch_all(&state.pool)
        .await?;
    let name_of = |slug: &str| {
        sites
            .iter()
            .find(|s| s.0 == slug)
            .map_or_else(|| slug.to_owned(), |s| s.1.clone())
    };

    let mut items = Vec::new();
    for row in rows {
        let mut slugs: Vec<String> = Vec::new();
        for slug in row.sites {
            if !slugs.contains(&slug) {
                slugs.push(slug);
            }
        }
        // Someone without every website involved doesn't see the request at all.
        if !slugs.iter().all(|slug| session.sees_slug(slug)) {
            continue;
        }
        let reviewer = slugs
            .iter()
            .all(|slug| session.slug_role(slug) >= Some(Role::Reviewer));
        let owner = slugs
            .iter()
            .all(|slug| session.slug_role(slug) == Some(Role::Owner));
        let mine = row.requested_by == Some(session.user.id);
        items.push(Item {
            can_decide: reviewer && (!mine || owner),
            mine,
            requested_by: row
                .requested_by
                .and_then(|id| people.iter().find(|p| p.0 == id).map(|p| p.1.clone())),
            sites: slugs
                .iter()
                .map(|slug| Named {
                    slug: slug.clone(),
                    name: name_of(slug),
                })
                .collect(),
            kind: row.kind,
            id: row.id,
            parent: row.parent,
            title: row.title.unwrap_or_default(),
            note: row.note,
            requested_at: row.requested_at,
        });
    }
    let waiting = items.iter().filter(|i| i.can_decide).count();
    Ok(Json(json!({ "items": items, "waiting_for_you": waiting })))
}

const MAX_CHANGES: usize = 200;
const MAX_TEXT: usize = 400;

#[derive(Serialize, Debug, PartialEq)]
struct Change {
    path: String,
    before: Value,
    after: Value,
}

/// A long value stays readable in a comparison.
fn shorten(value: &Value) -> Value {
    let text = match value {
        Value::String(text) => text.clone(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
        _ => return value.clone(),
    };
    if text.chars().count() <= MAX_TEXT {
        return if value.is_string() {
            value.clone()
        } else {
            Value::String(text)
        };
    }
    let mut short: String = text.chars().take(MAX_TEXT).collect();
    short.push('…');
    Value::String(short)
}

fn joined(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_owned()
    } else {
        format!("{path}.{key}")
    }
}

/// The index of each element, by id, when every element of a list has one.
/// Sections then compare as themselves even after being moved or removed.
fn by_id(list: &[Value]) -> Option<Vec<&str>> {
    list.iter().map(|v| v.get("id").and_then(Value::as_str)).collect()
}

fn compare(path: &str, before: &Value, after: &Value, out: &mut Vec<Change>) {
    if before == after || out.len() >= MAX_CHANGES {
        return;
    }
    match (before, after) {
        (Value::Object(a), Value::Object(b)) => {
            let mut keys: Vec<&String> = a.keys().chain(b.keys()).collect();
            keys.sort();
            keys.dedup();
            for key in keys {
                let (x, y) = (
                    a.get(key).unwrap_or(&Value::Null),
                    b.get(key).unwrap_or(&Value::Null),
                );
                compare(&joined(path, key), x, y, out);
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if let (Some(a_ids), Some(b_ids)) = (by_id(a), by_id(b)) {
                for (i, id) in b_ids.iter().enumerate() {
                    let before = a_ids
                        .iter()
                        .position(|x| x == id)
                        .map_or(&Value::Null, |at| &a[at]);
                    compare(&joined(path, &(i + 1).to_string()), before, &b[i], out);
                }
                for (i, id) in a_ids.iter().enumerate() {
                    if !b_ids.contains(id) {
                        compare(
                            &joined(path, &format!("removed {}", i + 1)),
                            &a[i],
                            &Value::Null,
                            out,
                        );
                    }
                }
            } else {
                for i in 0..a.len().max(b.len()) {
                    let (x, y) = (a.get(i).unwrap_or(&Value::Null), b.get(i).unwrap_or(&Value::Null));
                    compare(&joined(path, &(i + 1).to_string()), x, y, out);
                }
            }
        }
        _ => out.push(Change {
            path: path.to_owned(),
            before: shorten(before),
            after: shorten(after),
        }),
    }
}

/// What one audited action changed. Owners only, like the log itself.
async fn changes(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    let detail: Value = sqlx::query_scalar("SELECT detail FROM audit_log WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    let pair = |from: &str, to: &str| match (detail.get(from), detail.get(to)) {
        (None, None) => None,
        (x, y) => Some((
            x.cloned().unwrap_or(Value::Null),
            y.cloned().unwrap_or(Value::Null),
        )),
    };
    let (before, after) = pair("from", "to")
        .or_else(|| pair("before", "after"))
        .unwrap_or((Value::Null, Value::Null));
    let mut out = Vec::new();
    compare("", &before, &after, &mut out);
    let truncated = out.len() >= MAX_CHANGES;
    Ok(Json(json!({ "changes": out, "truncated": truncated })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diff(before: Value, after: Value) -> Vec<Change> {
        let mut out = Vec::new();
        compare("", &before, &after, &mut out);
        out
    }

    #[test]
    fn names_only_what_changed() {
        let out = diff(
            json!({ "title": "Old", "same": 1, "gone": true, "nested": { "a": 1, "b": 2 } }),
            json!({ "title": "New", "same": 1, "nested": { "a": 1, "b": 3 }, "added": "x" }),
        );
        let paths: Vec<_> = out.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(paths, ["added", "gone", "nested.b", "title"]);
        assert_eq!(out[3].before, "Old");
        assert_eq!(out[3].after, "New");
        assert_eq!(out[0].before, Value::Null);
        assert_eq!(out[1].after, Value::Null);
    }

    #[test]
    fn sections_compare_by_id_so_a_new_one_doesnt_mark_the_rest_changed() {
        let out = diff(
            json!({ "sections": [{ "id": "a", "heading": "One" }, { "id": "b", "heading": "Two" }] }),
            json!({ "sections": [{ "id": "n", "heading": "New" }, { "id": "a", "heading": "One" }, { "id": "b", "heading": "2" }] }),
        );
        let paths: Vec<_> = out.iter().map(|c| c.path.as_str()).collect();
        assert!(paths.contains(&"sections.3.heading"), "{paths:?}");
        assert!(!paths.iter().any(|p| p.starts_with("sections.2")), "{paths:?}");
        assert!(paths.iter().any(|p| p.starts_with("sections.1")));

        let removed = diff(
            json!({ "sections": [{ "id": "a", "heading": "One" }] }),
            json!({ "sections": [] }),
        );
        assert_eq!(removed[0].path, "sections.removed 1");
    }

    #[test]
    fn plain_values_and_long_text_stay_readable() {
        let out = diff(json!("new"), json!("reviewed"));
        assert_eq!(out[0].path, "");
        let long = "x".repeat(MAX_TEXT + 50);
        let out = diff(json!({ "body": long }), json!({ "body": "short" }));
        let shown = out[0].before.as_str().unwrap();
        assert_eq!(shown.chars().count(), MAX_TEXT + 1);
        assert!(shown.ends_with('…'));
        assert!(diff(json!({ "a": 1 }), json!({ "a": 1 })).is_empty());
    }

    #[test]
    fn a_huge_change_stops_at_the_limit() {
        let before: Vec<Value> = (0..1000).map(|i| json!(i)).collect();
        let after: Vec<Value> = (0..1000).map(|i| json!(i + 1)).collect();
        assert_eq!(diff(json!(before), json!(after)).len(), MAX_CHANGES);
    }
}
