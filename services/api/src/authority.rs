//! Approval authority (P13-B5): who may approve each kind of change, and how
//! many approvals it needs. Every kind keeps the maker-checker rule each
//! decision already enforces (a reviewer on every website involved, never
//! their own request unless an owner); a rule set here only narrows it:
//!
//! - **Approvers:** reviewers (the default), owners only, or named people
//!   (owners can always approve).
//! - **Approvals needed:** one, or two from different people. The first is
//!   recorded and answered with 202 (`ApiError::ApprovalRecorded`), so nothing
//!   reads it as published; the second publishes as before.
//! - **Reassignment:** a request can be handed to one approver
//!   (`approvals.rs`); then only they, or an owner, decide it.
//!
//! Each decision calls [`gate`] once, right after its own maker-checker
//! check and before it changes anything.

use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    admin::{AdminSession, Role, audit},
    error::{ApiError, FieldError},
    routes::SharedState,
};

/// The kinds of change that go through approval, as the queue names them.
pub const KINDS: [(&str, &str); 9] = [
    ("page", "Pages"),
    ("hero", "Hero designs"),
    ("brand", "Brand and logos"),
    ("campaign", "Campaigns"),
    ("proof", "Customer proof"),
    ("article", "Articles"),
    ("pricing", "Price books"),
    ("payroll", "Payroll Calculator rules"),
    ("site_status", "Website status"),
];

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/v1/admin/approval-rules", get(show))
        .route("/v1/admin/approval-rules/{kind}", post(save))
}

#[derive(Clone, Debug, Serialize, Deserialize, FromRow, PartialEq, Eq)]
pub struct Rule {
    /// "reviewer", "owner" or "people".
    pub approvers: String,
    pub people: Vec<Uuid>,
    pub stages: i16,
}

impl Default for Rule {
    fn default() -> Self {
        Self {
            approvers: "reviewer".into(),
            people: Vec::new(),
            stages: 1,
        }
    }
}

impl Rule {
    /// Whether this person may approve under the rule (the website role is
    /// checked by the decision itself).
    pub fn allows(&self, user: Uuid, role: Role) -> bool {
        match self.approvers.as_str() {
            "owner" => role == Role::Owner,
            "people" => role == Role::Owner || self.people.contains(&user),
            _ => true,
        }
    }
}

/// Which request an approval belongs to: a revision is one request; an item
/// with a single draft (a hero, a price book…) is one per time it's sent for
/// approval, so asking again starts over.
pub fn request_key(kind: &str, id: &str, requested_at: DateTime<Utc>) -> String {
    match kind {
        "page" | "brand" | "site_status" | "campaign" => id.to_owned(),
        _ => format!("{id}@{}", requested_at.timestamp_micros()),
    }
}

pub async fn rules(pool: &PgPool) -> Result<HashMap<String, Rule>, sqlx::Error> {
    let rows: Vec<(String, String, Vec<Uuid>, i16)> =
        sqlx::query_as("SELECT kind, approvers, people, stages FROM approval_rules")
            .fetch_all(pool)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(kind, approvers, people, stages)| {
            (
                kind,
                Rule {
                    approvers,
                    people,
                    stages,
                },
            )
        })
        .collect())
}

pub async fn rule(pool: &PgPool, kind: &str) -> Result<Rule, sqlx::Error> {
    Ok(rules(pool).await?.remove(kind).unwrap_or_default())
}

/// The approval rules' part of a decision to approve `request`. `Ok` means
/// go ahead and publish; a first of two approvals is recorded and returned
/// as [`ApiError::ApprovalRecorded`].
pub async fn gate(pool: &PgPool, session: &AdminSession, kind: &str, request: &str) -> Result<(), ApiError> {
    let me = session.user.id;
    let rule = rule(pool, kind).await?;
    if !rule.allows(me, session.user.role) {
        return Err(ApiError::NotPermitted(if rule.approvers == "owner" {
            "Only an owner can approve this kind of change (approval rules, in Users & access)."
        } else {
            "Only the approvers chosen for this kind of change can approve it (approval rules, in Users & access)."
        }));
    }
    let assigned: Option<Uuid> =
        sqlx::query_scalar("SELECT assigned_to FROM approval_assignments WHERE kind = $1 AND request = $2")
            .bind(kind)
            .bind(request)
            .fetch_optional(pool)
            .await?;
    if assigned.is_some_and(|a| a != me) && session.user.role != Role::Owner {
        return Err(ApiError::NotPermitted(
            "This request is assigned to another approver. They, or an owner, can decide it.",
        ));
    }
    if rule.stages < 2 {
        return Ok(());
    }
    let approved: Vec<Uuid> =
        sqlx::query_scalar("SELECT approved_by FROM approval_steps WHERE kind = $1 AND request = $2")
            .bind(kind)
            .bind(request)
            .fetch_all(pool)
            .await?;
    if approved.contains(&me) {
        return Err(ApiError::Conflict(
            "You've already approved this. It needs a second approver: someone else.",
        ));
    }
    if approved.is_empty() {
        sqlx::query("INSERT INTO approval_steps (kind, request, approved_by) VALUES ($1, $2, $3)")
            .bind(kind)
            .bind(request)
            .bind(me)
            .execute(pool)
            .await?;
        audit(
            pool,
            Some(me),
            "approval.recorded",
            Some((kind, request.to_owned())),
            json!({ "approval": 1, "needed": rule.stages }),
            None,
        )
        .await?;
        return Err(ApiError::ApprovalRecorded(
            "Your approval is recorded (1 of 2). It's published when a second approver approves it.",
        ));
    }
    Ok(())
}

#[derive(Serialize, FromRow)]
struct Approver {
    id: Uuid,
    name: String,
    role: String,
}

/// The rules, and who could be chosen as an approver.
async fn show(
    State(state): State<SharedState>,
    session: AdminSession,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Reviewer)?;
    let mut rules = rules(&state.pool).await?;
    let kinds: Vec<_> = KINDS
        .iter()
        .map(|(kind, label)| {
            let rule = rules.remove(*kind).unwrap_or_default();
            json!({ "kind": kind, "label": label, "approvers": rule.approvers, "people": rule.people,
                    "stages": rule.stages })
        })
        .collect();
    let approvers: Vec<Approver> = sqlx::query_as(
        "SELECT id, name, role FROM admin_users
          WHERE disabled_at IS NULL AND role IN ('owner', 'reviewer')
          ORDER BY role = 'owner' DESC, name",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "kinds": kinds, "approvers": approvers })))
}

fn invalid(field: &'static str, message: &'static str) -> ApiError {
    ApiError::Validation(vec![FieldError {
        field,
        code: "invalid",
        message,
    }])
}

async fn save(
    State(state): State<SharedState>,
    session: AdminSession,
    Path(kind): Path<String>,
    Json(input): Json<Rule>,
) -> Result<impl IntoResponse, ApiError> {
    session.require(Role::Owner)?;
    session.require_verified()?;
    if !KINDS.iter().any(|(k, _)| *k == kind) {
        return Err(ApiError::NotFound);
    }
    if !(1..=2).contains(&input.stages) {
        return Err(invalid("stages", "Choose one or two approvals."));
    }
    let mut next = input;
    match next.approvers.as_str() {
        "reviewer" | "owner" => next.people.clear(),
        "people" => {
            next.people.sort();
            next.people.dedup();
            if next.people.is_empty() {
                return Err(invalid("people", "Choose at least one approver."));
            }
            let eligible: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM admin_users
                  WHERE id = ANY($1) AND disabled_at IS NULL AND role IN ('owner', 'reviewer')",
            )
            .bind(&next.people)
            .fetch_one(&state.pool)
            .await?;
            if eligible != next.people.len() as i64 {
                return Err(invalid("people", "Approvers must be active reviewers or owners."));
            }
        }
        _ => return Err(invalid("approvers", "Choose who approves.")),
    }
    let before = rule(&state.pool, &kind).await?;
    sqlx::query(
        "INSERT INTO approval_rules (kind, approvers, people, stages, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (kind) DO UPDATE SET approvers = $2, people = $3, stages = $4, updated_by = $5,
                updated_at = now()",
    )
    .bind(&kind)
    .bind(&next.approvers)
    .bind(&next.people)
    .bind(next.stages)
    .bind(session.user.id)
    .execute(&state.pool)
    .await?;
    audit(
        &state.pool,
        Some(session.user.id),
        "admin.approval_rule_changed",
        Some(("approval_rule", kind.clone())),
        json!({ "from": before, "to": next }),
        None,
    )
    .await?;
    Ok(Json(json!({ "kind": kind, "rule": next })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_only_narrow_who_approves() {
        let me = Uuid::now_v7();
        let default = Rule::default();
        assert!(default.allows(me, Role::Reviewer));
        let owners = Rule {
            approvers: "owner".into(),
            ..Rule::default()
        };
        assert!(!owners.allows(me, Role::Reviewer) && owners.allows(me, Role::Owner));
        let named = Rule {
            approvers: "people".into(),
            people: vec![me],
            stages: 2,
        };
        assert!(named.allows(me, Role::Reviewer));
        assert!(!named.allows(Uuid::now_v7(), Role::Reviewer));
        assert!(named.allows(Uuid::now_v7(), Role::Owner));
    }

    #[test]
    fn asking_again_is_a_new_request_but_a_revision_is_one() {
        let at = Utc::now();
        assert_eq!(request_key("page", "r1", at), "r1");
        let first = request_key("hero", "s1", at);
        let again = request_key("hero", "s1", at + chrono::Duration::seconds(1));
        assert_ne!(first, again);
    }
}
