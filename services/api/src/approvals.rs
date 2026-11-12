//! The approval queue across websites (P7-F2): everything waiting for a second
//! person, in one list. It only reads: each decision still happens on the
//! item's own screen, with its preview and its own rules.
//!
//! `can_decide` mirrors those rules (a reviewer on every website involved, and
//! not the requester unless they're an owner), plus the approval rules
//! (P13-B5, `authority.rs`): who approves each kind, how many approvals it
//! needs and who it's assigned to, so the list can say whose turn it is. The
//! endpoints that decide remain the authority. Requests can be reassigned
//! here, to one eligible approver.

use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role, audit, grants},
    authority::{self, Rule},
    error::ApiError,
    routes::SharedState,
};

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/approvals", get(queue))
        .route("/v1/admin/approvals/assign", post(assign))
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
    /// The request, for its approvals and assignment (`authority::request_key`).
    request: String,
    sites: Vec<Named>,
    title: String,
    note: String,
    requested_by: Option<String>,
    requested_at: DateTime<Utc>,
    mine: bool,
    can_decide: bool,
    /// Approvals so far and needed (P13-B5), and who gave them.
    approvals: usize,
    needed: i16,
    approved_by: Vec<String>,
    assigned_to: Option<Person>,
    /// "reviewer", "owner" or "people".
    approvers: String,
}

#[derive(Serialize, Clone)]
struct Person {
    id: Uuid,
    name: String,
}

/// Pending requests with their sites (each once) and request keys.
async fn pending(pool: &PgPool) -> Result<Vec<(Row, String, Vec<String>)>, sqlx::Error> {
    let rows: Vec<Row> = sqlx::query_as(PENDING).fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let mut slugs: Vec<String> = Vec::new();
            for slug in &row.sites {
                if !slugs.contains(slug) {
                    slugs.push(slug.clone());
                }
            }
            let key = authority::request_key(&row.kind, &row.id, row.requested_at);
            (row, key, slugs)
        })
        .collect())
}

type Steps = HashMap<(String, String), Vec<Uuid>>;
type Assignments = HashMap<(String, String), Uuid>;

async fn progress(pool: &PgPool) -> Result<(Steps, Assignments), sqlx::Error> {
    let mut steps: Steps = HashMap::new();
    let rows: Vec<(String, String, Uuid)> =
        sqlx::query_as("SELECT kind, request, approved_by FROM approval_steps ORDER BY approved_at")
            .fetch_all(pool)
            .await?;
    for (kind, request, by) in rows {
        steps.entry((kind, request)).or_default().push(by);
    }
    let rows: Vec<(String, String, Uuid)> =
        sqlx::query_as("SELECT kind, request, assigned_to FROM approval_assignments")
            .fetch_all(pool)
            .await?;
    let assignments = rows.into_iter().map(|(k, r, to)| ((k, r), to)).collect();
    Ok((steps, assignments))
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
    let rows = pending(&state.pool).await?;
    let rules = authority::rules(&state.pool).await?;
    let (steps, assignments) = progress(&state.pool).await?;
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

    let person = |id: Uuid| {
        people.iter().find(|p| p.0 == id).map(|p| Person {
            id,
            name: p.1.clone(),
        })
    };
    let mut items = Vec::new();
    for (row, key, slugs) in rows {
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
        let rule = rules.get(&row.kind).cloned().unwrap_or_default();
        let done = steps
            .get(&(row.kind.clone(), key.clone()))
            .cloned()
            .unwrap_or_default();
        let assigned = assignments.get(&(row.kind.clone(), key.clone())).copied();
        let me = session.user.id;
        let by_rule = rule.allows(me, session.user.role)
            && (assigned.is_none_or(|a| a == me) || session.user.role == Role::Owner)
            && !done.contains(&me);
        items.push(Item {
            can_decide: reviewer && (!mine || owner) && by_rule,
            mine,
            request: key,
            approvals: done.len(),
            needed: rule.stages,
            approved_by: done.iter().filter_map(|id| person(*id)).map(|p| p.name).collect(),
            assigned_to: assigned.and_then(person),
            approvers: rule.approvers,
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

#[derive(Deserialize)]
struct AssignInput {
    kind: String,
    request: String,
    /// `null` hands it back to every eligible approver.
    to: Option<Uuid>,
}

/// A person's role on a website, as their session would see it.
async fn role_on(pool: &PgPool, user: Uuid, slugs: &[String]) -> Result<Option<(Role, bool)>, ApiError> {
    let row: Option<(String, bool)> =
        sqlx::query_as("SELECT role, all_sites FROM admin_users WHERE id = $1 AND disabled_at IS NULL")
            .bind(user)
            .fetch_optional(pool)
            .await?;
    let Some((role, all)) = row else { return Ok(None) };
    let role = Role::parse(&role).ok_or(ApiError::Internal("unknown stored role".into()))?;
    if role == Role::Owner || all {
        return Ok(Some((role, role >= Role::Reviewer)));
    }
    let granted = grants(pool, user).await?;
    let reviews_all = slugs.iter().all(|slug| {
        granted
            .iter()
            .find(|g| &g.slug == slug)
            .is_some_and(|g| g.role.min(role) >= Role::Reviewer)
    });
    Ok(Some((role, reviews_all)))
}

/// Hands a request to one approver, or back to everyone (owners, and
/// reviewers who could decide it themselves).
async fn assign(
    State(state): State<SharedState>,
    session: AdminSession,
    Json(input): Json<AssignInput>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = pending(&state.pool).await?;
    let (row, key, slugs) = rows
        .into_iter()
        .find(|(row, key, _)| row.kind == input.kind && *key == input.request)
        .ok_or(ApiError::NotFound)?;
    if !slugs
        .iter()
        .all(|slug| session.slug_role(slug) >= Some(Role::Reviewer))
    {
        return Err(ApiError::Forbidden);
    }
    let rule: Rule = authority::rule(&state.pool, &row.kind).await?;
    let name = match input.to {
        None => {
            sqlx::query("DELETE FROM approval_assignments WHERE kind = $1 AND request = $2")
                .bind(&row.kind)
                .bind(&key)
                .execute(&state.pool)
                .await?;
            None
        }
        Some(to) => {
            let Some((role, reviews)) = role_on(&state.pool, to, &slugs).await? else {
                return Err(ApiError::Conflict("Choose an active approver."));
            };
            if !reviews || !rule.allows(to, role) {
                return Err(ApiError::Conflict(
                    "They can't approve this: choose a reviewer with every website involved, allowed by the approval rules.",
                ));
            }
            if row.requested_by == Some(to) && role != Role::Owner {
                return Err(ApiError::Conflict(
                    "They asked for this approval: choose someone else (maker-checker).",
                ));
            }
            sqlx::query(
                "INSERT INTO approval_assignments (kind, request, assigned_to, assigned_by) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (kind, request) DO UPDATE SET assigned_to = $3, assigned_by = $4, assigned_at = now()",
            )
            .bind(&row.kind)
            .bind(&key)
            .bind(to)
            .bind(session.user.id)
            .execute(&state.pool)
            .await?;
            sqlx::query_scalar::<_, String>("SELECT name FROM admin_users WHERE id = $1")
                .bind(to)
                .fetch_optional(&state.pool)
                .await?
        }
    };
    audit(
        &state.pool,
        Some(session.user.id),
        "approval.assigned",
        Some((row.kind.as_str(), key.clone())),
        json!({ "title": row.title, "to": input.to, "to_name": name }),
        None,
    )
    .await?;
    Ok(Json(
        json!({ "request": key, "assigned_to": input.to.map(|id| json!({ "id": id, "name": name })) }),
    ))
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
