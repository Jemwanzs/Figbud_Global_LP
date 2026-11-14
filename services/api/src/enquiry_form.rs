//! A website's enquiry form settings (UI-EF3, owner's brief, 14 Nov 2026):
//! its layout, the categories it offers, which optional fields it shows or
//! requires, and its wording. Kept in the website's settings with a draft
//! (`enquiry_form`, `enquiry_form_draft`), like its footer. The form names
//! its website when it submits (`form`), and the API then enforces that
//! website's categories and required fields on top of its own rules, so
//! hiding or greying out part of the form never weakens validation.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::enquiry::{Enquiry, EnquiryKind};
use crate::error::FieldError;

/// Categories a website form can offer, in their usual order (`enquiryKinds`
/// in packages/site-kit; referrals have their own form).
pub const KINDS: [&str; 6] = [
    "demo_request",
    "sales",
    "contact",
    "partnership",
    "early_access",
    "waitlist",
];

/// Fields a website can make optional, required or hidden. Name, email,
/// company (by category) and consent always follow the API's own rules.
pub const FIELDS: [&str; 5] = ["job_title", "country", "phone", "company_size", "message"];

/// Fields whose label and hint a website can reword.
pub const LABELLED: [&str; 8] = [
    "name",
    "email",
    "company",
    "job_title",
    "country",
    "phone",
    "company_size",
    "message",
];

/// Wording a website can set, with its longest length.
pub const TEXTS: [(&str, usize); 9] = [
    ("intro", 300),
    ("one_title", 60),
    ("one_lead", 120),
    ("two_title", 60),
    ("two_lead", 120),
    ("continue", 30),
    ("submit", 30),
    ("success_title", 90),
    ("success_body", 300),
];

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Layout {
    /// Two stages in one card (UI-EF1).
    #[default]
    Stages,
    /// One column.
    Single,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Rule {
    Optional,
    Required,
    Hidden,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct FormSettings {
    pub layout: Layout,
    /// Offered categories, in order; empty means all of them.
    pub kinds: Vec<String>,
    /// Rules for `FIELDS`; a missing one stays optional.
    pub fields: BTreeMap<String, Rule>,
    /// Reworded labels and hints for `LABELLED`.
    pub labels: BTreeMap<String, String>,
    pub hints: BTreeMap<String, String>,
    /// Wording for `TEXTS`; a missing one keeps the website's own.
    pub texts: BTreeMap<String, String>,
}

impl Default for FormSettings {
    fn default() -> Self {
        Self {
            layout: Layout::Stages,
            kinds: Vec::new(),
            fields: BTreeMap::new(),
            labels: BTreeMap::new(),
            hints: BTreeMap::new(),
            texts: BTreeMap::new(),
        }
    }
}

fn error(field: &'static str, code: &'static str, message: &'static str) -> FieldError {
    FieldError { field, code, message }
}

/// Trims wording, drops empty entries, and checks keys and lengths.
fn tidy(
    errors: &mut Vec<FieldError>,
    map: &mut BTreeMap<String, String>,
    allowed: &[&str],
    max: impl Fn(&str) -> usize,
    field: &'static str,
) {
    map.retain(|_, v| {
        *v = v.trim().to_owned();
        !v.is_empty()
    });
    if map
        .iter()
        .any(|(k, v)| !allowed.contains(&k.as_str()) || v.chars().count() > max(k))
    {
        errors.push(error(
            field,
            "invalid",
            "Wording for the listed parts of the form, within their lengths.",
        ));
    }
}

impl FormSettings {
    /// Checks and tidies a website's settings (draft or published).
    pub fn check(&mut self, errors: &mut Vec<FieldError>, field: &'static str) {
        let mut seen = std::collections::HashSet::new();
        if self.kinds.len() > KINDS.len()
            || self
                .kinds
                .iter()
                .any(|k| !KINDS.contains(&k.as_str()) || !seen.insert(k.clone()))
        {
            errors.push(error(
                field,
                "kinds",
                "Choose categories from the list, each once.",
            ));
        }
        if self.fields.keys().any(|k| !FIELDS.contains(&k.as_str())) {
            errors.push(error(field, "fields", "Rules are for the optional fields."));
        }
        // A message is needed for some categories; it can't be hidden while one is offered.
        let offered: Vec<&str> = if self.kinds.is_empty() {
            KINDS.to_vec()
        } else {
            self.kinds.iter().map(String::as_str).collect()
        };
        let needs_message = offered
            .iter()
            .filter_map(|k| EnquiryKind::parse(k))
            .any(EnquiryKind::requires_message);
        if needs_message && self.fields.get("message") == Some(&Rule::Hidden) {
            errors.push(error(
                field,
                "message",
                "Sales, general and partnership enquiries need a message: keep it, or stop offering them.",
            ));
        }
        tidy(errors, &mut self.labels, &LABELLED, |_| 40, field);
        tidy(errors, &mut self.hints, &LABELLED, |_| 100, field);
        tidy(
            errors,
            &mut self.texts,
            &TEXTS.map(|(k, _)| k),
            |k| TEXTS.iter().find(|(t, _)| *t == k).map_or(0, |(_, n)| *n),
            field,
        );
    }

    fn rule(&self, field: &str) -> Rule {
        self.fields.get(field).copied().unwrap_or(Rule::Optional)
    }

    /// Applies the website's form to an enquiry already valid by the API's own
    /// rules: a category it offers, its required fields present, and nothing
    /// kept from a field it hides.
    pub fn apply(&self, enquiry: &mut Enquiry) -> Result<(), Vec<FieldError>> {
        let mut errors = Vec::new();
        if !self.kinds.is_empty() && !self.kinds.iter().any(|k| k == enquiry.kind.as_str()) {
            errors.push(error(
                "kind",
                "not_offered",
                "Choose one of the options on this form.",
            ));
        }
        let fields: [(&'static str, &mut Option<String>); 5] = [
            ("job_title", &mut enquiry.job_title),
            ("country", &mut enquiry.country),
            ("phone", &mut enquiry.phone),
            ("company_size", &mut enquiry.company_size),
            ("message", &mut enquiry.message),
        ];
        for (name, value) in fields {
            match self.rule(name) {
                Rule::Required if value.as_deref().is_none_or(|v| v.trim().is_empty()) => {
                    errors.push(error(name, "required", "This field is required."));
                }
                Rule::Hidden => *value = None,
                _ => {}
            }
        }
        if enquiry.phone.is_none() {
            enquiry.phone_secondary = None;
        }
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
}

/// A website's published form settings, if it has any (unknown website: none).
pub async fn published(pool: &PgPool, slug: &str) -> Result<Option<FormSettings>, sqlx::Error> {
    let value: Option<serde_json::Value> =
        sqlx::query_scalar("SELECT settings->'enquiry_form' FROM sites WHERE slug = $1")
            .bind(slug)
            .fetch_optional(pool)
            .await?
            .flatten();
    Ok(value.and_then(|v| serde_json::from_value(v).ok()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn form(value: serde_json::Value) -> FormSettings {
        serde_json::from_value(value).unwrap()
    }

    fn codes(mut f: FormSettings) -> Vec<&'static str> {
        let mut e = Vec::new();
        f.check(&mut e, "enquiry_form");
        e.iter().map(|e| e.code).collect()
    }

    #[test]
    fn settings_are_tidied_and_checked() {
        let mut ok = form(json!({
            "layout": "single",
            "kinds": ["demo_request", "waitlist"],
            "fields": { "country": "required", "message": "hidden" },
            "labels": { "company": " Organisation ", "phone": "" },
            "texts": { "submit": "Send it", "intro": "  " }
        }));
        let mut e = Vec::new();
        ok.check(&mut e, "enquiry_form");
        assert!(e.is_empty(), "{e:?}");
        assert_eq!(ok.labels.get("company").map(String::as_str), Some("Organisation"));
        assert!(!ok.labels.contains_key("phone") && !ok.texts.contains_key("intro"));
        assert_eq!(
            codes(form(json!({ "kinds": ["demo_request", "demo_request"] }))),
            ["kinds"]
        );
        assert_eq!(codes(form(json!({ "kinds": ["referral"] }))), ["kinds"]);
        assert_eq!(codes(form(json!({ "fields": { "name": "hidden" } }))), ["fields"]);
        // Sales needs a message: it can't be hidden while sales is offered (all are, by default).
        assert_eq!(
            codes(form(json!({ "fields": { "message": "hidden" } }))),
            ["message"]
        );
        assert_eq!(
            codes(form(json!({ "texts": { "submit": "x".repeat(31) } }))),
            ["invalid"]
        );
        assert_eq!(
            codes(form(json!({ "labels": { "consent": "Yes" } }))),
            ["invalid"]
        );
        assert!(serde_json::from_value::<FormSettings>(json!({ "colour": "red" })).is_err());
    }
}
