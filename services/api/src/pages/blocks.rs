//! The page document and its block library (decision D17): a page is an
//! ordered list of sections, each a typed block with validated properties.
//! No markup, scripts or styles are stored; rich text is Markdown rendered
//! by the API's sanitiser. Links are site paths or https URLs only.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use uuid::Uuid;

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
    /// Stable id given by the Studio, so a visual (and anything else tied to
    /// the question) follows the item, never its wording (P14-W5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The visual this answer shows while it's open, when the FAQ has a showcase.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene: Option<FaqScene>,
    /// Up to four floating labels for its scene (the scene's own otherwise).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    /// An approved screenshot from the media library, shown in the scene's frame.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_id: Option<Uuid>,
}

/// The product scenes an FAQ answer can show (owner's brief, 19 Nov 2026).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FaqScene {
    /// Self-service in desktop and phone browsers: payslips, leave, profile.
    EmployeeAccess,
    /// Branches reporting into one central HR workspace.
    Branches,
    /// Gross to net with PAYE, NSSF, SHIF and Housing Levy (illustrative amounts).
    Payroll,
    /// A request moving through configurable approval stages.
    Workflows,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ShowcaseSpeed {
    Calm,
    #[default]
    Normal,
    Lively,
}

/// An FAQ's interactive visual beside the questions (P14-W5): each open
/// question shows its scene; with none open, a connected workspace (and,
/// with `autoplay`, the scenes in turn until someone interacts).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FaqShowcase {
    #[serde(default = "yes")]
    pub enabled: bool,
    #[serde(default)]
    pub speed: ShowcaseSpeed,
    #[serde(default)]
    pub autoplay: bool,
    /// A small button in the workflows scene, e.g. "Book a personalised demo" → `#book-demo`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cta: Option<Cta>,
}

fn yes() -> bool {
    true
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
        /// Product screenshots beside the words, in a browser-style frame
        /// with tabs (owner's brief, 18 Nov 2026); replaces the visual.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        showcase: Option<Box<Showcase>>,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        showcase: Option<FaqShowcase>,
    },
    /// The website on desktop, tablet and phone, as its own section (P14-W6):
    /// a heading, a sentence and the device preview, placed anywhere on a page.
    DeviceShowcase {
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        body: Option<String>,
        devices: DevicePreview,
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

/// Product screenshots in a browser-style frame (owner's brief, 18 Nov
/// 2026): one tab per view, each a media library image with its own title
/// and sentence; optional rotation, floating notes and a larger preview.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Showcase {
    /// The frame's header ("ZiraHR Workspace").
    #[serde(default)]
    pub title: Option<String>,
    /// A line under the frame ("Illustrative product preview").
    #[serde(default)]
    pub caption: Option<String>,
    pub views: Vec<ShowcaseView>,
    /// Moves to the next view by itself (pauses on interaction, off with reduced motion).
    #[serde(default)]
    pub rotate: bool,
    /// Seconds per view while rotating.
    #[serde(default = "Showcase::default_interval")]
    pub interval: u8,
    /// Short notes floating beside the frame (wide screens).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub indicators: Vec<ShowcaseIndicator>,
    /// Lets visitors open the screenshot larger.
    #[serde(default = "Showcase::yes")]
    pub preview: bool,
}

impl Showcase {
    fn default_interval() -> u8 {
        8
    }
    fn yes() -> bool {
        true
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShowcaseView {
    /// The tab's name ("HR Overview").
    pub label: String,
    /// What it shows ("People Intelligence").
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    /// From the website's media library; its alt text comes from there.
    pub image_id: uuid::Uuid,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShowcaseIndicator {
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
}

/// A short highlight: a heading and a sentence or two.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Highlight {
    pub heading: String,
    pub body: String,
    /// Self-service on each device (P14-W6): the device labels become buttons
    /// that show the website in a desktop, tablet or phone frame.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub devices: Option<DevicePreview>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Device {
    Desktop,
    Tablet,
    Phone,
}

/// Which device shows first: the visitor's own (by screen width), or one chosen.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DefaultDevice {
    #[default]
    Visitor,
    Desktop,
    Tablet,
    Phone,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FrameStyle {
    /// Laptop, tablet and phone hardware with a browser bar.
    #[default]
    Realistic,
    /// Just the screen's rounded outline and the browser bar.
    Minimal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Orientation {
    #[default]
    Landscape,
    Portrait,
}

/// Approved screenshots, one per device, each taken at that device's width
/// (never a desktop image scaled down). A live page preview isn't offered:
/// the websites refuse to be framed (`frame-ancestors 'none'`), and that
/// protection stays.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DevicePreview {
    #[serde(default = "yes")]
    pub enabled: bool,
    pub devices: Vec<Device>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desktop_image_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tablet_image_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone_image_id: Option<Uuid>,
    #[serde(default)]
    pub default_device: DefaultDevice,
    #[serde(default)]
    pub frame: FrameStyle,
    #[serde(default)]
    pub tablet_orientation: Orientation,
    /// The address shown in the browser bar (e.g. the website's name or domain).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(default = "yes")]
    pub transitions: bool,
    /// 300–450 ms.
    #[serde(default = "device_duration")]
    pub duration_ms: u16,
    /// Use the website's device settings (P14-W8) when it has published some;
    /// off: this section's own. The screenshots are always the section's.
    #[serde(default = "yes")]
    pub inherit: bool,
    /// Visitors may switch devices (unset: yes, as before).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visitor_switching: Option<bool>,
    /// Frames from the library, per device (unset: from `frame` and `tablet_orientation`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frames: Option<crate::devices::Frames>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<crate::devices::ImageFit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<crate::devices::ImageAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback: Option<crate::devices::Fallback>,
    /// Frame size limits in pixels (240–1400), on wide screens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_width: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_height: Option<u16>,
}

fn device_duration() -> u16 {
    380
}

impl DevicePreview {
    pub fn image(&self, device: Device) -> Option<Uuid> {
        match device {
            Device::Desktop => self.desktop_image_id,
            Device::Tablet => self.tablet_image_id,
            Device::Phone => self.phone_image_id,
        }
    }

    pub fn image_ids(&self) -> Vec<Uuid> {
        [self.desktop_image_id, self.tablet_image_id, self.phone_image_id]
            .into_iter()
            .flatten()
            .collect()
    }
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
    /// A gentle scroll reveal for the section's contents (P14-W7); none when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reveal: Option<Reveal>,
    /// Space above and below the section; the usual when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacing: Option<Spacing>,
    /// Screenshot and words swap sides (side-by-side layouts on wide screens).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub flip: bool,
    #[serde(flatten)]
    pub block: Block,
}

/// How a section's contents arrive as it scrolls into view (owner's brief, 20
/// Nov 2026). Scroll-driven, so it plays back as well as forwards, and never
/// with reduced motion.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Reveal {
    None,
    Subtle,
    Standard,
}

/// Spacing presets for a section.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Spacing {
    Compact,
    Standard,
    Spacious,
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

    /// A device preview: each device once, a screenshot for each, a 0.3–0.45 s fade.
    fn devices(&mut self, d: &DevicePreview) {
        let mut seen = std::collections::HashSet::new();
        if d.devices.is_empty() || !d.devices.iter().all(|x| seen.insert(*x)) {
            self.push("sections", "Choose each device once, at least one.");
        }
        if d.devices.iter().any(|x| d.image(*x).is_none()) {
            self.push(
                "sections",
                "Each device shown needs its own screenshot, taken at that device's size.",
            );
        }
        if !(300..=450).contains(&d.duration_ms) {
            self.push("sections", "Device changes take 0.3–0.45 seconds.");
        }
        if [d.max_width, d.max_height]
            .into_iter()
            .flatten()
            .any(|px| !(240..=1400).contains(&px))
        {
            self.push("sections", "Frame sizes are between 240 and 1,400 pixels.");
        }
        self.optional(
            "sections",
            &d.address,
            60,
            "The browser address is up to 60 characters.",
        );
    }

    fn count<T>(&mut self, items: &[T], max: usize) {
        if items.is_empty() || items.len() > max {
            self.push("sections", "Lists need at least one item and at most 12.");
        }
    }
}

/// Button actions any website's buttons can take instead of a link (P8-M8):
/// the Start Now workspace request and demo booking, opened in place.
pub const ACTION_HREFS: [&str; 2] = ["#start-now", "#book-demo"];

/// Site-relative paths, https URLs or a button action; nothing that could run code.
pub fn safe_href(href: &str) -> bool {
    let href = href.trim();
    if ACTION_HREFS.contains(&href) {
        return true;
    }
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
                    showcase,
                    visual,
                    ..
                } => {
                    if let Some(s) = showcase {
                        if visual.is_some() {
                            c.push(
                                "sections",
                                "A hero shows either the animated visual or the screenshots, not both.",
                            );
                        }
                        c.optional(
                            "sections",
                            &s.title,
                            40,
                            "The frame's title can be up to 40 characters.",
                        );
                        c.optional(
                            "sections",
                            &s.caption,
                            80,
                            "The note under the frame can be up to 80 characters.",
                        );
                        if s.views.is_empty() || s.views.len() > 4 {
                            c.push("sections", "The screenshots need one to four views.");
                        }
                        for view in &s.views {
                            c.text(
                                "sections",
                                &view.label,
                                24,
                                "Each tab name needs 1–24 characters.",
                            );
                            c.text(
                                "sections",
                                &view.title,
                                60,
                                "Each view's title needs 1–60 characters.",
                            );
                            c.optional(
                                "sections",
                                &view.body,
                                160,
                                "Each view's sentence can be up to 160 characters.",
                            );
                        }
                        if !(5..=20).contains(&s.interval) {
                            c.push("sections", "Rotation shows each view for 5–20 seconds.");
                        }
                        if s.indicators.len() > 3 {
                            c.push("sections", "Up to three floating notes.");
                        }
                        for note in &s.indicators {
                            c.text(
                                "sections",
                                &note.title,
                                40,
                                "Each floating note needs a title of 1–40 characters.",
                            );
                            c.optional(
                                "sections",
                                &note.body,
                                80,
                                "Each floating note's text can be up to 80 characters.",
                            );
                        }
                    }
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
                        if let Some(d) = &ess.devices {
                            c.devices(d);
                        }
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
                Block::Faq {
                    heading,
                    items,
                    showcase,
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.count(items, 12);
                    let mut ids = std::collections::HashSet::new();
                    for item in items.iter() {
                        if let Some(id) = &item.id
                            && (id.is_empty()
                                || id.len() > 40
                                || !id
                                    .chars()
                                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
                                || !ids.insert(id.clone()))
                        {
                            c.push(
                                "sections",
                                "FAQ question ids are unique letters, numbers and dashes (up to 40).",
                            );
                        }
                        if item.labels.len() > 4 {
                            c.push("sections", "A question's visual has up to four labels.");
                        }
                        for label in &item.labels {
                            c.text("sections", label, 32, "Visual labels need 1–32 characters.");
                        }
                        if item.image_id.is_some() && item.scene.is_none() {
                            c.push("sections", "Choose the question's scene before its screenshot.");
                        }
                    }
                    if let Some(cta) = showcase.as_ref().and_then(|s| s.cta.as_ref()) {
                        c.cta(cta);
                    }
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
                Block::DeviceShowcase {
                    heading,
                    body,
                    devices,
                } => {
                    c.optional("sections", heading, 120, "Headings can be up to 120 characters.");
                    c.optional("sections", body, 400, "Text can be up to 400 characters.");
                    c.devices(devices);
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
                                .map(|i| {
                                    // Everything but the Markdown answer, which websites get rendered.
                                    let mut item = serde_json::to_value(i).unwrap_or(Value::Null);
                                    if let Some(map) = item.as_object_mut() {
                                        map.remove("answer");
                                        map.insert(
                                            "answer_html".into(),
                                            json!(markdown::render(&i.answer).html),
                                        );
                                    }
                                    item
                                })
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
    fn sections_take_a_reveal_spacing_and_side() {
        // P14-W7 (owner's brief, 20 Nov 2026): set per section, omitted when not set.
        let page = doc(json!([
            { "id": "a", "type": "demo", "demo": "leave_flow", "layout": "split", "tone": "dark",
              "reveal": "subtle", "spacing": "compact", "flip": true },
            { "id": "b", "type": "text", "body": "x" },
        ]))
        .unwrap();
        assert!(page.validate().is_ok());
        let rendered = page.render(false);
        assert_eq!(rendered["sections"][0]["reveal"], "subtle");
        assert_eq!(rendered["sections"][0]["flip"], true);
        assert!(rendered["sections"][1].get("reveal").is_none());
        assert!(rendered["sections"][1].get("flip").is_none());
        assert!(doc(json!([{ "id": "a", "type": "text", "body": "x", "reveal": "wild" }])).is_err());
    }

    #[test]
    fn device_previews_need_a_screenshot_per_device() {
        let id = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
        let hero = |devices: Value| {
            doc(json!([{ "id": "h", "type": "hero", "heading": "Your people.",
                "ess": { "heading": "Your team. Their HR.", "body": "In any browser.", "devices": devices } }]))
            .unwrap()
        };
        let good =
            hero(json!({ "devices": ["desktop", "phone"], "desktop_image_id": id, "phone_image_id": id }));
        assert!(good.validate().is_ok());
        assert_eq!(
            crate::media::image_ids(&good).len(),
            1,
            "the same screenshot counts once"
        );
        let missing = hero(json!({ "devices": ["desktop", "tablet"], "desktop_image_id": id }));
        assert!(missing.validate().is_err(), "the tablet has no screenshot");
        let twice = hero(json!({ "devices": ["phone", "phone"], "phone_image_id": id }));
        assert!(twice.validate().is_err());
        let slow = hero(json!({ "devices": ["phone"], "phone_image_id": id, "duration_ms": 900 }));
        assert!(slow.validate().is_err());
        assert!(
            doc(json!([{ "id": "h", "type": "hero", "heading": "x",
                "ess": { "heading": "a", "body": "b", "devices": { "devices": ["watch"] } } }]))
            .is_err()
        );
        // As its own section, placed anywhere on a page.
        let section = doc(
            json!([{ "id": "d", "type": "device_showcase", "heading": "On every device",
            "devices": { "devices": ["tablet"], "tablet_image_id": id } }]),
        )
        .unwrap();
        assert!(section.validate().is_ok());
        assert_eq!(crate::media::image_ids(&section).len(), 1);
        let empty =
            doc(json!([{ "id": "d", "type": "device_showcase", "devices": { "devices": [] } }])).unwrap();
        assert!(empty.validate().is_err());
    }

    #[test]
    fn faq_visuals_follow_stable_question_ids() {
        let faq = |items: Value, showcase: Value| {
            doc(json!([{ "id": "f", "type": "faq", "heading": "Good to know", "items": items, "showcase": showcase }]))
                .unwrap()
        };
        let good = faq(
            json!([
                { "id": "q-install", "question": "Install an app?", "answer": "No.", "scene": "employee_access",
                  "labels": ["Payslips", "Leave Requests"] },
                { "id": "q-flows", "question": "My own workflows?", "answer": "Yes.", "scene": "workflows" },
            ]),
            json!({ "speed": "calm", "cta": { "label": "Book a personalised demo", "href": "#book-demo" } }),
        );
        assert!(good.validate().is_ok());
        // Websites get everything but the Markdown answer, which comes rendered.
        let rendered = good.render(false);
        let item = &rendered["sections"][0]["items"][0];
        assert_eq!(item["scene"], "employee_access");
        assert_eq!(item["id"], "q-install");
        assert!(item["answer"].is_null() && item["answer_html"].as_str().unwrap().contains("No."));
        assert_eq!(rendered["sections"][0]["showcase"]["enabled"], true);

        let same_id = faq(
            json!([{ "id": "q", "question": "A?", "answer": "a" }, { "id": "q", "question": "B?", "answer": "b" }]),
            Value::Null,
        );
        assert!(same_id.validate().is_err(), "ids are unique");
        let too_many = faq(
            json!([{ "id": "q", "question": "A?", "answer": "a", "scene": "payroll", "labels": ["1", "2", "3", "4", "5"] }]),
            Value::Null,
        );
        assert!(too_many.validate().is_err());
        assert!(doc(json!([{ "id": "f", "type": "faq", "items": [{ "question": "A?", "answer": "a", "scene": "rockets" }] }])).is_err());
        let bad_link = faq(
            json!([{ "question": "A?", "answer": "a" }]),
            json!({ "cta": { "label": "Go", "href": "javascript:alert(1)" } }),
        );
        assert!(bad_link.validate().is_err());
        // An FAQ without a visual is as it was.
        let plain = faq(json!([{ "question": "A?", "answer": "a" }]), Value::Null);
        assert!(plain.validate().is_ok());
        assert!(plain.render(false)["sections"][0].get("showcase").is_none());
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
