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
        /// A second line of the headline, in the product's colour (UI-HE1).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        accent: Option<String>,
        #[serde(default)]
        lead: Option<String>,
        #[serde(default)]
        primary: Option<Cta>,
        #[serde(default)]
        secondary: Option<Cta>,
        /// An animated visual beside the words.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        visual: Option<HeroVisual>,
        /// Short benefits under the buttons, each with a tick.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        highlights: Vec<String>,
        /// The visual's modules in order, from `ZIRAHR_MODULE_KEYS`; all eight when empty.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        modules: Vec<String>,
        /// How much the visual moves by itself.
        #[serde(default, skip_serializing_if = "DemoMotion::is_standard")]
        motion: DemoMotion,
        /// Employee Self-Service, highlighted under the hero (8 Nov 2026).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        // Boxed: the hero is the largest block, and this keeps every block's size close.
        ess: Option<Box<Highlight>>,
        /// Hover messages for the visual's modules, by key; the approved copy
        /// where none is set (11 Nov 2026).
        #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
        messages: std::collections::BTreeMap<String, String>,
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
        /// Cards, or numbered storytelling with outlined numbers (8 Nov 2026).
        #[serde(default, skip_serializing_if = "StepsStyle::is_cards")]
        style: StepsStyle,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        intro: Option<String>,
        /// The dot pattern beside a story.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        dots: bool,
        #[serde(default, skip_serializing_if = "DemoMotion::is_standard")]
        motion: DemoMotion,
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
    /// An image from the website's media library; its alt text comes from
    /// the library, so it's written once and kept up to date everywhere.
    Image {
        image_id: uuid::Uuid,
        #[serde(default)]
        caption: Option<String>,
        #[serde(default)]
        size: ImageSize,
    },
    /// A list of modules with one open at a time (P14-W).
    Modules {
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        intro: Option<String>,
        items: Vec<Module>,
    },
    /// An interactive product demonstration from a fixed set, with synthetic
    /// data in code, so nothing typed in the Studio can present as real figures.
    Demo {
        demo: DemoKind,
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        intro: Option<String>,
        /// How much a scroll story moves.
        #[serde(default, skip_serializing_if = "DemoMotion::is_standard")]
        motion: DemoMotion,
        /// Words above the demonstration, or beside it on wide screens.
        #[serde(default, skip_serializing_if = "DemoLayout::is_stacked")]
        layout: DemoLayout,
        /// Scrolling guides a demonstration with steps (owner's brief, 12 Nov
        /// 2026); `false` turns it off. Unset means on.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        guided: Option<bool>,
    },
    /// Refer & earn: a form that reaches the enquiry inbox (P14-R). The phone
    /// number people call to follow a deal is set here, never invented.
    ReferralForm {
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        intro: Option<String>,
        #[serde(default)]
        contact_phone: Option<String>,
    },
    /// The enquiry form on the website itself (demo requests and questions),
    /// the same form as the corporate contact page's, so visitors stay put.
    EnquiryForm {
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        intro: Option<String>,
    },
    /// An item from the content library, shown as its latest published
    /// version wherever it's used (resolved by `crate::shared::resolve`).
    Shared { shared_id: uuid::Uuid },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DemoKind {
    ConnectedModules,
    PayRun,
    Payslip,
    Rules,
    SelfService,
    Outputs,
    LeaveFlow,
    TeamCalendar,
    /// One day's clock-ins, location check, late arrival and overtime approval (P4-Z5).
    Attendance,
    ScatteredToConnected,
    EmployeeJourney,
}

/// The Studio's animation choice for a demonstration; visitors who prefer
/// reduced motion always get the still version.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DemoMotion {
    #[default]
    Standard,
    Subtle,
    Off,
}

impl DemoMotion {
    fn is_standard(&self) -> bool {
        *self == Self::Standard
    }
}

/// ZiraHR's eight core modules, in their approved order; the same keys as the
/// website's catalogue (`packages/site-kit/src/zirahr-modules.ts`).
pub const ZIRAHR_MODULE_KEYS: [&str; 8] = [
    "core_hr",
    "payroll",
    "leave",
    "attendance",
    "performance",
    "teams",
    "recruitment",
    "learning",
];

/// A short highlight: a heading and a sentence or two.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Highlight {
    pub heading: String,
    pub body: String,
}

/// How a steps block looks.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum StepsStyle {
    #[default]
    Cards,
    /// Outlined numbers, each row current in turn as the page scrolls.
    Story,
}

impl StepsStyle {
    fn is_cards(&self) -> bool {
        *self == Self::Cards
    }
}

/// A hero's animated visual (UI-HE1).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HeroVisual {
    /// Module cards lit in turn by a signal line beneath them.
    ConnectedModules,
}

/// Where a demonstration's heading and introduction sit (UI-TH3).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DemoLayout {
    #[default]
    Stacked,
    Split,
}

impl DemoLayout {
    fn is_stacked(&self) -> bool {
        *self == Self::Stacked
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    #[default]
    Available,
    /// Shown as planned, so a roadmap item can't read as live.
    Planned,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Module {
    pub title: String,
    #[serde(default)]
    pub headline: Option<String>,
    pub body: String,
    #[serde(default)]
    pub bullets: Vec<String>,
    #[serde(default)]
    pub availability: Availability,
    #[serde(default)]
    pub cta: Option<Cta>,
}

/// How wide an Image block is shown.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImageSize {
    /// The width of the text column.
    #[default]
    Content,
    /// The full width of the page.
    Wide,
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
    /// A band behind the section in the website's theme colours (P7-E1).
    /// Omitted for the default, so existing documents are unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tone: Option<Tone>,
    #[serde(flatten)]
    pub block: Block,
}

/// Section styles: the website's brand band (light text on its brand
/// colour), its soft band (a light tint; a deep tint in dark mode), a
/// contrasting band in the opposite of the visitor's theme (UI-TH3), and from
/// the Brand & Theme Studio (11 Nov 2026) a band that stays light or dark in
/// either theme, or one on the website's hero, band or call-to-action gradient.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Tone {
    Brand,
    Soft,
    Inverse,
    Light,
    Dark,
    GradientHero,
    GradientBand,
    GradientCta,
    /// Always on the page background, never alternating (14 Nov 2026).
    Plain,
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
    /// The page's own sharing image, from the website's media library
    /// (otherwise the website's sharing image is used).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seo_image_id: Option<uuid::Uuid>,
    /// Asks search engines not to index the page; it's also left out of the
    /// sitemap. Omitted when false, so existing documents are unchanged.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub seo_noindex: bool,
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
                    accent,
                    lead,
                    primary,
                    secondary,
                    highlights,
                    modules,
                    ess,
                    messages,
                    ..
                } => {
                    c.optional("sections", eyebrow, 60, "Eyebrows can be up to 60 characters.");
                    c.text("sections", heading, 120, "Headings need 1–120 characters.");
                    c.optional("sections", accent, 90, "Accent lines can be up to 90 characters.");
                    // Blank lines (left while typing) are ignored, here and on the website.
                    let filled: Vec<&String> = highlights.iter().filter(|h| !h.trim().is_empty()).collect();
                    if filled.len() > 4 || filled.iter().any(|h| h.trim().chars().count() > 48) {
                        c.push("sections", "Up to four highlights, each up to 48 characters.");
                    }
                    c.optional("sections", lead, 400, "Lead text can be up to 400 characters.");
                    for cta in primary.iter().chain(secondary.iter()) {
                        c.cta(cta);
                    }
                    let unique: std::collections::HashSet<&String> = modules.iter().collect();
                    if modules.iter().any(|m| !ZIRAHR_MODULE_KEYS.contains(&m.as_str()))
                        || unique.len() != modules.len()
                        || (1..3).contains(&modules.len())
                    {
                        c.push(
                            "sections",
                            "Choose at least three of the eight modules for the hero, each once (or leave it to show all eight).",
                        );
                    }
                    if messages.iter().any(|(key, text)| {
                        !ZIRAHR_MODULE_KEYS.contains(&key.as_str())
                            || text.trim().is_empty()
                            || text.chars().count() > 80
                    }) {
                        c.push(
                            "sections",
                            "Hover messages are for the eight modules, each 1–80 characters.",
                        );
                    }
                    if let Some(ess) = ess {
                        c.text(
                            "sections",
                            &ess.heading,
                            90,
                            "Self-service headings need 1–90 characters.",
                        );
                        c.text(
                            "sections",
                            &ess.body,
                            300,
                            "Self-service text needs 1–300 characters.",
                        );
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
                Block::Steps {
                    heading,
                    items,
                    style,
                    intro,
                    ..
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional(
                        "sections",
                        intro,
                        400,
                        "Introductions can be up to 400 characters.",
                    );
                    c.count(items, 12);
                    if *style == StepsStyle::Story && items.len() > 8 {
                        c.push("sections", "A numbered story can have up to eight steps.");
                    }
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
                Block::Image { caption, .. } => {
                    c.optional("sections", caption, 200, "Captions can be up to 200 characters.");
                }
                Block::Modules {
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
                        c.text("sections", &item.title, 80, "Module names need 1–80 characters.");
                        c.optional(
                            "sections",
                            &item.headline,
                            120,
                            "Module headlines can be up to 120 characters.",
                        );
                        c.text(
                            "sections",
                            &item.body,
                            400,
                            "Module descriptions need 1–400 characters.",
                        );
                        if item.bullets.len() > 12 {
                            c.push("sections", "Modules can have up to 12 key points.");
                        }
                        // Blank lines (mid-typing in the Studio) simply aren't shown.
                        for bullet in item.bullets.iter().filter(|b| !b.trim().is_empty()) {
                            c.text(
                                "sections",
                                bullet,
                                120,
                                "Each key point can be up to 120 characters.",
                            );
                        }
                        if let Some(cta) = &item.cta {
                            c.cta(cta);
                        }
                    }
                }
                Block::EnquiryForm { heading, intro } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional(
                        "sections",
                        intro,
                        400,
                        "Introductions can be up to 400 characters.",
                    );
                }
                Block::ReferralForm {
                    heading,
                    intro,
                    contact_phone,
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional(
                        "sections",
                        intro,
                        400,
                        "Introductions can be up to 400 characters.",
                    );
                    let phone_ok = contact_phone.as_deref().is_none_or(|p| {
                        p.is_empty()
                            || (p.len() <= 24
                                && p.chars().filter(char::is_ascii_digit).count() >= 7
                                && p.chars().all(|c| c.is_ascii_digit() || " +-()".contains(c)))
                    });
                    if !phone_ok {
                        c.push(
                            "sections",
                            "Enter the contact number with digits, spaces and + only.",
                        );
                    }
                }
                Block::Demo { heading, intro, .. } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional(
                        "sections",
                        intro,
                        400,
                        "Introductions can be up to 400 characters.",
                    );
                }
                // Checked against the library when the draft is saved.
                Block::Shared { .. } => {}
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
        json!({ "seo_title": self.seo_title, "seo_description": self.seo_description,
                "seo_image_id": self.seo_image_id, "seo_noindex": self.seo_noindex, "sections": sections })
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
    fn demonstrations_are_guided_unless_turned_off() {
        let page = doc(json!([
            { "id": "a", "type": "demo", "demo": "payslip" },
            { "id": "b", "type": "demo", "demo": "self_service", "guided": false },
        ]))
        .unwrap();
        let rendered = page.render(false);
        assert!(rendered["sections"][0].get("guided").is_none(), "unset means on");
        assert_eq!(rendered["sections"][1]["guided"], false);
        assert!(doc(json!([{ "id": "a", "type": "demo", "demo": "payslip", "guided": "yes" }])).is_err());
    }

    #[test]
    fn section_styles_are_kept_and_limited_to_the_theme_bands() {
        let page = doc(json!([
            { "id": "a", "type": "text", "heading": "Why Ziwa", "body": "x", "tone": "brand" },
            { "id": "b", "type": "text", "body": "y", "tone": "soft" },
            { "id": "c", "type": "text", "body": "z" },
        ]))
        .unwrap();
        let rendered = page.render(false);
        assert_eq!(rendered["sections"][0]["tone"], "brand");
        assert_eq!(rendered["sections"][1]["tone"], "soft");
        assert!(
            rendered["sections"][2].get("tone").is_none(),
            "default sections stay unchanged"
        );
        assert!(doc(json!([{ "id": "a", "type": "text", "body": "x", "tone": "#ff0000" }])).is_err());
        // The Brand & Theme Studio's surfaces and gradient presets.
        // ...and "plain": always on the page background (14 Nov 2026).
        for tone in [
            "light",
            "dark",
            "gradient_hero",
            "gradient_band",
            "gradient_cta",
            "plain",
        ] {
            let page = doc(json!([{ "id": "a", "type": "text", "body": "x", "tone": tone }])).unwrap();
            assert_eq!(page.render(false)["sections"][0]["tone"], tone);
        }
        assert!(
            doc(json!([{ "id": "a", "type": "text", "body": "x", "tone": "gradient_sidebar" }])).is_err()
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

    #[test]
    fn the_hero_takes_three_to_eight_known_modules_and_a_self_service_highlight() {
        let hero = |extra: Value| {
            let mut section =
                json!({ "id": "h", "type": "hero", "heading": "Hi", "visual": "connected_modules" });
            section
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            doc(json!([section])).unwrap().validate()
        };
        assert!(hero(json!({})).is_ok(), "all eight when none are chosen");
        assert!(hero(json!({ "modules": ["payroll", "leave", "learning"], "motion": "subtle" })).is_ok());
        assert!(
            hero(json!({ "modules": ["payroll", "leave"] })).is_err(),
            "at least three"
        );
        assert!(
            hero(json!({ "modules": ["payroll", "leave", "leave"] })).is_err(),
            "each once"
        );
        assert!(
            hero(json!({ "modules": ["payroll", "leave", "mobile_app"] })).is_err(),
            "only the eight"
        );
        assert!(hero(json!({ "ess": { "heading": "Your team.", "body": "In any browser." } })).is_ok());
        assert!(hero(json!({ "ess": { "heading": "", "body": "x" } })).is_err());
        // Hover messages: the eight modules only, each 1–80 characters.
        assert!(hero(json!({ "messages": { "payroll": "Payday, sorted." } })).is_ok());
        assert!(hero(json!({ "messages": { "mobile_app": "Download us" } })).is_err());
        assert!(hero(json!({ "messages": { "leave": " " } })).is_err());
        assert!(hero(json!({ "messages": { "leave": "x".repeat(81) } })).is_err());
    }

    #[test]
    fn steps_can_be_a_numbered_story_of_up_to_eight() {
        let step = json!({ "title": "One", "body": "Words." });
        let steps = |style: &str, n: usize| {
            doc(json!([{ "id": "s", "type": "steps", "style": style, "dots": true,
                         "items": vec![step.clone(); n] }]))
            .unwrap()
            .validate()
        };
        assert!(steps("story", 6).is_ok());
        assert!(steps("story", 9).is_err());
        assert!(steps("cards", 9).is_ok());
        // Cards stay the default, and the new fields are left out unless set.
        let plain = doc(json!([{ "id": "s", "type": "steps", "items": [step] }])).unwrap();
        let rendered = plain.render(false);
        assert!(rendered["sections"][0].get("style").is_none());
        assert!(rendered["sections"][0].get("dots").is_none());
    }
}
