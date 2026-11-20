//! Sample identities (owner's brief, 20 Nov 2026, P14-W10): the fictional
//! people every website's illustrations and demonstrations use (a profile,
//! a leave list, an approval), managed once on FigBud Global (Studio →
//! Marketing → Sample identities): display name, first name, initials, an
//! optional fictional role, whether active, the order they're used in, and
//! which one leads on each website. Drafted, published, audited and kept
//! for rollback with FigBud Global's settings.
//!
//! Only fictional marketing content: real users, customers, testimonials,
//! records and audit trails never come from here and are never changed by it.
//! Avatars are drawn from the initials; no portrait is generated.

use std::collections::BTreeMap;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::FieldError;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DemoIdentity {
    /// Stable key (lowercase letters, digits, hyphens), so a person stays the
    /// same person across modules and illustrations.
    pub id: String,
    /// As shown in full: "Libbie Sonia".
    pub name: String,
    /// Unset: the first word of the name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    /// Unset: from the name ("LS").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initials: Option<String>,
    /// A fictional job role, where an illustration shows one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default = "yes")]
    pub active: bool,
}

fn yes() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct DemoIdentities {
    /// In the order illustrations use them.
    pub people: Vec<DemoIdentity>,
    /// The identity that leads on a website (by its slug); unset: the first.
    pub leads: BTreeMap<String, String>,
}

/// A published set, kept for rollback (newest first, up to 10).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct IdentitiesVersion {
    pub published_at: String,
    pub by: Option<String>,
    pub identities: DemoIdentities,
}

pub fn remember(history: &mut Vec<IdentitiesVersion>, identities: &DemoIdentities, by: Option<String>) {
    history.insert(
        0,
        IdentitiesVersion {
            published_at: Utc::now().to_rfc3339(),
            by,
            identities: identities.clone(),
        },
    );
    history.truncate(10);
}

/// What websites receive: the active people, in order, and the leads among them.
pub fn public(identities: &DemoIdentities) -> DemoIdentities {
    let people: Vec<DemoIdentity> = identities.people.iter().filter(|p| p.active).cloned().collect();
    let leads = identities
        .leads
        .iter()
        .filter(|(_, id)| people.iter().any(|p| &p.id == *id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    DemoIdentities { people, leads }
}

pub fn check(e: &mut Vec<FieldError>, d: &mut DemoIdentities, field: &'static str) {
    let mut bad = |code: &'static str, message: &'static str| e.push(FieldError { field, code, message });
    if d.people.is_empty() || d.people.len() > 20 {
        bad("count", "Keep between 1 and 20 sample identities.");
    }
    if !d.people.iter().any(|p| p.active) {
        bad("active", "Keep at least one sample identity active.");
    }
    let mut seen = std::collections::HashSet::new();
    for p in &mut d.people {
        p.name = p.name.split_whitespace().collect::<Vec<_>>().join(" ");
        p.first_name = p
            .first_name
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        p.role = p
            .role
            .take()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        p.initials = p
            .initials
            .take()
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty());
        let id_ok = !p.id.is_empty()
            && p.id.len() <= 24
            && p.id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        if !id_ok || !seen.insert(p.id.clone()) {
            bad(
                "id",
                "Give each identity its own key: lowercase letters, digits and hyphens.",
            );
        }
        if p.name.is_empty() || p.name.chars().count() > 40 {
            bad("name", "Names need 1 to 40 characters.");
        }
        if p.first_name.as_ref().is_some_and(|f| f.chars().count() > 20) {
            bad("first_name", "First names need at most 20 characters.");
        }
        if p.initials
            .as_ref()
            .is_some_and(|i| i.chars().count() > 3 || !i.chars().all(char::is_alphabetic))
        {
            bad("initials", "Initials are up to three letters.");
        }
        if p.role.as_ref().is_some_and(|r| r.chars().count() > 48) {
            bad("role", "Roles need at most 48 characters.");
        }
    }
    let ids: Vec<&String> = d.people.iter().map(|p| &p.id).collect();
    if d.leads.values().any(|id| !ids.contains(&id)) {
        bad("leads", "Choose each website's lead from the identities.");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn person(id: &str, name: &str, active: bool) -> DemoIdentity {
        DemoIdentity {
            id: id.into(),
            name: name.into(),
            first_name: None,
            initials: None,
            role: None,
            active,
        }
    }

    #[test]
    fn identities_are_checked_and_only_active_ones_published() {
        let mut d = DemoIdentities {
            people: vec![
                person("libbie", " Libbie   Sonia ", true),
                person("titus", "Titus", false),
            ],
            leads: BTreeMap::from([("zirahr".into(), "titus".into())]),
        };
        let mut e = Vec::new();
        check(&mut e, &mut d, "demo_identities");
        assert!(e.is_empty(), "{e:?}");
        assert_eq!(d.people[0].name, "Libbie Sonia");
        let p = public(&d);
        assert_eq!(p.people.len(), 1);
        assert!(p.leads.is_empty(), "an inactive lead isn't published");

        let mut dup = DemoIdentities {
            people: vec![person("a", "A", true), person("a", "B", true)],
            leads: BTreeMap::from([("x".into(), "missing".into())]),
        };
        check(&mut e, &mut dup, "demo_identities");
        assert_eq!(e.len(), 2, "duplicate key and unknown lead");
    }
}
