//! Starting points for new pages. Placeholder text is marked for replacement;
//! drafts are never public, and publishing needs a second person's approval.

use serde_json::{Value, json};
use uuid::Uuid;

use super::blocks::PageDoc;

pub const TEMPLATES: [(&str, &str); 5] = [
    ("blank", "Blank page"),
    ("home", "Home page"),
    ("overview", "Platform overview"),
    ("features", "Features"),
    ("contact", "Contact and demo"),
];

fn id() -> String {
    Uuid::now_v7().simple().to_string()
}

/// The page document for a template, written for this website.
pub fn document(template: &str, site_name: &str, tagline: Option<&str>) -> Option<PageDoc> {
    let tagline = tagline.unwrap_or("Replace with a one-line promise.");
    let sections: Value = match template {
        "blank" => json!([]),
        "home" => json!([
            { "id": id(), "type": "hero", "eyebrow": site_name, "heading": tagline,
              "lead": "Replace with two sentences on who the product is for and what changes for them.",
              "primary": { "label": "Request a demo", "href": "/contact" },
              "secondary": { "label": "Explore the platform", "href": "/platform" } },
            { "id": id(), "type": "feature_grid", "heading": "What you can do",
              "items": [
                  { "title": "Replace with a capability", "body": "Say what it does and why it matters." },
                  { "title": "Replace with a capability", "body": "Say what it does and why it matters." },
                  { "title": "Replace with a capability", "body": "Say what it does and why it matters." }
              ] },
            { "id": id(), "type": "steps", "heading": "How it works",
              "items": [
                  { "title": "Set up", "body": "Replace with the first step." },
                  { "title": "Run", "body": "Replace with the second step." },
                  { "title": "Improve", "body": "Replace with the third step." }
              ] },
            { "id": id(), "type": "call_to_action", "heading": format!("See {site_name} in action"),
              "body": "Replace with a short invitation.",
              "cta": { "label": "Request a demo", "href": "/contact" } }
        ]),
        "overview" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Platform", "heading": format!("One platform for {site_name}"),
              "lead": "Replace with how the platform fits together." },
            { "id": id(), "type": "text", "heading": "How it fits together",
              "body": "Replace with an overview. **Markdown** is supported: lists, links and emphasis." },
            { "id": id(), "type": "feature_grid", "heading": "Built in",
              "items": [
                  { "title": "Replace with a module", "body": "Describe it." },
                  { "title": "Replace with a module", "body": "Describe it." }
              ] }
        ]),
        "features" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Features", "heading": "Replace with a features headline" },
            { "id": id(), "type": "feature_grid",
              "items": [
                  { "title": "Replace with a feature", "body": "Describe it." },
                  { "title": "Replace with a feature", "body": "Describe it." },
                  { "title": "Replace with a feature", "body": "Describe it." },
                  { "title": "Replace with a feature", "body": "Describe it." }
              ] },
            { "id": id(), "type": "faq", "heading": "Questions",
              "items": [{ "question": "Replace with a common question?", "answer": "Replace with the answer." }] }
        ]),
        "contact" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Contact", "heading": format!("Talk to the {site_name} team"),
              "lead": "Replace with what happens after someone gets in touch." },
            { "id": id(), "type": "call_to_action", "heading": "Request a demo",
              "body": "We reply within one working day.",
              "cta": { "label": "Request a demo", "href": "/contact" } }
        ]),
        _ => return None,
    };
    serde_json::from_value(json!({ "sections": sections })).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_template_is_a_valid_page() {
        for (template, _) in TEMPLATES {
            let doc = document(
                template,
                "Ziwa LMS",
                Some("Lending that flows with your business."),
            )
            .unwrap();
            assert!(doc.validate().is_ok(), "{template}");
        }
        assert!(document("unknown", "x", None).is_none());
    }
}
