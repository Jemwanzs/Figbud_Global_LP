//! The page document and its block library (decision D17): a page is an
//! ordered list of sections, each a typed block with validated properties.
//! No markup, scripts or styles are stored; rich text is Markdown rendered
//! by the API's sanitiser. Links are site paths or https URLs only.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{cms::markdown, error::FieldError};

pub const MAX_SECTIONS: usize = 40;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Cta {
    pub label: String,
    pub href: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Feature {
    pub title: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Stat {
    pub value: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Faq {
    pub question: String,
    pub answer: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub title: String,
    pub body: String,
}

/// The approved block library. Adding a block type is a code change, reviewed
/// like any other, so every block renders with the design system.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Block {
    Hero {
        #[serde(default)]
        eyebrow: Option<String>,
        heading: String,
        #[serde(default)]
        lead: Option<String>,
        #[serde(default)]
        primary: Option<Cta>,
        #[serde(default)]
        secondary: Option<Cta>,
    },
    Text {
        #[serde(default)]
        heading: Option<String>,
        /// Markdown.
        body: String,
    },
    FeatureGrid {
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        intro: Option<String>,
        items: Vec<Feature>,
    },
    Steps {
        #[serde(default)]
        heading: Option<String>,
        items: Vec<Step>,
    },
    Stats {
        #[serde(default)]
        heading: Option<String>,
        items: Vec<Stat>,
        /// Where the figures come from; required so no unverified claim is published.
        source: String,
    },
    Faq {
        #[serde(default)]
        heading: Option<String>,
        items: Vec<Faq>,
    },
    CallToAction {
        heading: String,
        #[serde(default)]
        body: Option<String>,
        cta: Cta,
    },
}

// No `deny_unknown_fields` here: serde can't combine it with `flatten`; the
// block enum itself refuses unknown fields.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Section {
    /// Stable id for drag-and-drop and previews (client-generated).
    pub id: String,
    /// Hidden sections stay in the document (and its versions) but are never
    /// sent to websites. Omitted when false, so existing documents are unchanged.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
    #[serde(flatten)]
    pub block: Block,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PageDoc {
    /// Search result title (falls back to the page title).
    #[serde(default)]
    pub seo_title: Option<String>,
    /// Search result description.
    #[serde(default)]
    pub seo_description: Option<String>,
    #[serde(default)]
    pub sections: Vec<Section>,
}

struct Checker {
    errors: Vec<FieldError>,
}

impl Checker {
    fn push(&mut self, field: &'static str, message: &'static str) {
        if !self.errors.iter().any(|e| e.field == field) {
            self.errors.push(FieldError {
                field,
                code: "invalid",
                message,
            });
        }
    }

    fn text(&mut self, field: &'static str, value: &str, max: usize, message: &'static str) {
        let len = value.trim().chars().count();
        if len == 0 || len > max {
            self.push(field, message);
        }
    }

    fn optional(&mut self, field: &'static str, value: &Option<String>, max: usize, message: &'static str) {
        if value.as_ref().is_some_and(|v| v.chars().count() > max) {
            self.push(field, message);
        }
    }

    fn cta(&mut self, cta: &Cta) {
        self.text("sections", &cta.label, 40, "Button labels need 1–40 characters.");
        if !safe_href(&cta.href) {
            self.push(
                "sections",
                "Links must be a page on the site (starting with /) or an https:// address.",
            );
        }
    }

    fn count<T>(&mut self, items: &[T], max: usize) {
        if items.is_empty() || items.len() > max {
            self.push("sections", "Lists need at least one item and at most 12.");
        }
    }
}

/// Site-relative paths or https URLs; nothing that could run code.
pub fn safe_href(href: &str) -> bool {
    let href = href.trim();
    if href.is_empty() || href.len() > 300 || href.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return false;
    }
    (href.starts_with('/') && !href.starts_with("//")) || href.starts_with("https://")
}

impl PageDoc {
    /// Validates every section; trims text.
    pub fn validate(&self) -> Result<(), Vec<FieldError>> {
        let mut c = Checker { errors: Vec::new() };
        c.optional(
            "seo_title",
            &self.seo_title,
            70,
            "Search titles can be up to 70 characters.",
        );
        c.optional(
            "seo_description",
            &self.seo_description,
            170,
            "Search descriptions can be up to 170 characters.",
        );
        if self.sections.len() > MAX_SECTIONS {
            c.push("sections", "A page can have up to 40 sections.");
        }
        let mut ids = std::collections::HashSet::new();
        for section in &self.sections {
            if section.id.is_empty() || section.id.len() > 64 || !ids.insert(section.id.as_str()) {
                c.push("sections", "Each section needs its own id. Reload and try again.");
            }
            match &section.block {
                Block::Hero {
                    eyebrow,
                    heading,
                    lead,
                    primary,
                    secondary,
                } => {
                    c.optional("sections", eyebrow, 60, "Eyebrows can be up to 60 characters.");
                    c.text("sections", heading, 120, "Headings need 1–120 characters.");
                    c.optional("sections", lead, 400, "Lead text can be up to 400 characters.");
                    for cta in primary.iter().chain(secondary.iter()) {
                        c.cta(cta);
                    }
                }
                Block::Text { heading, body } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.text(
                        "sections",
                        body,
                        10_000,
                        "Text sections need 1–10,000 characters.",
                    );
                }
                Block::FeatureGrid {
                    heading,
                    intro,
                    items,
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional(
                        "sections",
                        intro,
                        400,
                        "Introductions can be up to 400 characters.",
                    );
                    c.count(items, 12);
                    for item in items {
                        c.text(
                            "sections",
                            &item.title,
                            80,
                            "Feature titles need 1–80 characters.",
                        );
                        c.text(
                            "sections",
                            &item.body,
                            400,
                            "Feature descriptions need 1–400 characters.",
                        );
                    }
                }
                Block::Steps { heading, items } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.count(items, 12);
                    for item in items {
                        c.text("sections", &item.title, 80, "Step titles need 1–80 characters.");
                        c.text(
                            "sections",
                            &item.body,
                            400,
                            "Step descriptions need 1–400 characters.",
                        );
                    }
                }
                Block::Stats {
                    heading,
                    items,
                    source,
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.count(items, 12);
                    for item in items {
                        c.text("sections", &item.value, 20, "Figures need 1–20 characters.");
                        c.text("sections", &item.label, 80, "Figure labels need 1–80 characters.");
                    }
                    c.text(
                        "sections",
                        source,
                        200,
                        "Say where the figures come from (1–200 characters): only verified figures are published.",
                    );
                }
                Block::Faq { heading, items } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.count(items, 12);
                    for item in items {
                        c.text(
                            "sections",
                            &item.question,
                            200,
                            "Questions need 1–200 characters.",
                        );
                        c.text(
                            "sections",
                            &item.answer,
                            2_000,
                            "Answers need 1–2,000 characters.",
                        );
                    }
                }
                Block::CallToAction { heading, body, cta } => {
                    c.text("sections", heading, 120, "Headings need 1–120 characters.");
                    c.optional("sections", body, 400, "Text can be up to 400 characters.");
                    c.cta(cta);
                }
            }
        }
        if c.errors.is_empty() {
            Ok(())
        } else {
            Err(c.errors)
        }
    }

    /// The document as websites receive it: Markdown fields gain sanitised
    /// `*_html` siblings, and hidden sections are left out unless
    /// `include_hidden` (the Studio's previews, which show them dimmed).
    pub fn render(&self, include_hidden: bool) -> Value {
        let sections: Vec<Value> = self
            .sections
            .iter()
            .filter(|section| include_hidden || !section.hidden)
            .map(|section| {
                let mut value = serde_json::to_value(section).unwrap_or(Value::Null);
                match &section.block {
                    Block::Text { body, .. } => value["body_html"] = json!(markdown::render(body).html),
                    Block::Faq { items, .. } => {
                        value["items"] = json!(
                            items
                                .iter()
                                .map(|i| json!({ "question": i.question, "answer_html": markdown::render(&i.answer).html }))
                                .collect::<Vec<_>>()
                        );
                    }
                    _ => {}
                }
                value
            })
            .collect();
        json!({ "seo_title": self.seo_title, "seo_description": self.seo_description, "sections": sections })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(sections: Value) -> Result<PageDoc, serde_json::Error> {
        serde_json::from_value(json!({ "sections": sections }))
    }

    #[test]
    fn valid_documents_round_trip() {
        let page = doc(json!([
            { "id": "a", "type": "hero", "heading": "Every loan. A smoother journey.",
              "primary": { "label": "Request a demo", "href": "/contact" } },
            { "id": "b", "type": "text", "body": "## Why\n\nBecause." },
            { "id": "c", "type": "feature_grid", "items": [{ "title": "Onboarding", "body": "Guided." }] },
            { "id": "d", "type": "call_to_action", "heading": "Ready?", "cta": { "label": "Talk to us", "href": "https://figbud.example/contact" } },
        ]))
        .unwrap();
        assert!(page.validate().is_ok());
        let rendered = page.render(false);
        assert!(
            rendered["sections"][1]["body_html"]
                .as_str()
                .unwrap()
                .contains("<h2")
        );
    }

    #[test]
    fn unknown_blocks_fields_and_markup_are_refused() {
        assert!(doc(json!([{ "id": "a", "type": "script", "code": "alert(1)" }])).is_err());
        assert!(doc(json!([{ "id": "a", "type": "text", "body": "x", "style": "color:red" }])).is_err());
        let page = doc(json!([{ "id": "a", "type": "text", "body": "<script>alert(1)</script>" }])).unwrap();
        let html = page.render(false)["sections"][0]["body_html"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(!html.contains("<script"), "{html}");
    }

    #[test]
    fn links_must_be_safe() {
        for bad in [
            "javascript:alert(1)",
            "//evil.example",
            "http://plain.example",
            "data:text/html,x",
            "/a b",
        ] {
            assert!(!safe_href(bad), "{bad}");
        }
        for good in ["/contact", "/en/products#ziwa", "https://figbud.example"] {
            assert!(safe_href(good), "{good}");
        }
        let page = doc(json!([{ "id": "a", "type": "call_to_action", "heading": "Go", "cta": { "label": "Go", "href": "javascript:alert(1)" } }])).unwrap();
        assert_eq!(page.validate().unwrap_err()[0].field, "sections");
    }

    #[test]
    fn statistics_need_a_source_and_lists_need_items() {
        let page = doc(json!([{ "id": "a", "type": "stats", "items": [{ "value": "99%", "label": "Uptime" }], "source": "" }])).unwrap();
        assert!(page.validate().unwrap_err()[0].message.contains("verified"));
        let page = doc(json!([{ "id": "a", "type": "faq", "items": [] }])).unwrap();
        assert!(page.validate().is_err());
        let page = doc(
            json!([{ "id": "a", "type": "text", "body": "x" }, { "id": "a", "type": "text", "body": "y" }]),
        )
        .unwrap();
        assert!(page.validate().is_err(), "duplicate section ids");
    }
}
