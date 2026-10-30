//! The campaign document (P8-M1): content, design, where and when it shows,
//! and optional rewards. Typed and validated like page blocks: no markup,
//! scripts or styles are stored; rich text is Markdown rendered by the API's
//! sanitiser and links are site paths or https URLs only.

use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{cms::markdown, error::FieldError, pages::blocks::safe_href};

pub const KINDS: [&str; 10] = [
    "hero",
    "announcement",
    "floating",
    "modal",
    "seasonal",
    "countdown",
    "launch",
    "rewards",
    "referral",
    "event",
];

/// What a call to action does. Enquiry actions open the existing contact
/// form, pre-filled for the campaign's website, and remember the campaign.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Link,
    Demo,
    Waitlist,
    Contact,
    Webinar,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Cta {
    pub label: String,
    pub action: Action,
    /// Required for `link`; ignored otherwise.
    #[serde(default)]
    pub href: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(deny_unknown_fields)]
pub struct Content {
    #[serde(default)]
    pub badge: Option<String>,
    pub headline: String,
    #[serde(default)]
    pub subheadline: Option<String>,
    /// Markdown.
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub primary: Option<Cta>,
    #[serde(default)]
    pub secondary: Option<Cta>,
    /// Markdown; shown under the campaign and in the rewards rules.
    #[serde(default)]
    pub terms: Option<String>,
    #[serde(default)]
    pub promo_code: Option<String>,
    /// Shows a live countdown to the campaign's end.
    #[serde(default)]
    pub countdown: bool,
    /// An image from the website's media library.
    #[serde(default)]
    pub image_id: Option<uuid::Uuid>,
}

macro_rules! choice {
    ($name:ident { $($variant:ident),+ $(,)? } default $default:ident) => {
        #[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
        #[serde(rename_all = "snake_case")]
        pub enum $name {
            #[default]
            $default,
            $($variant),+
        }
    };
}

choice!(Template { Split, Minimal } default Spotlight);
choice!(Align { Center } default Start);
choice!(Background { Gradient, Soft, Surface } default Brand);
choice!(Radius { Soft, Square } default Rounded);
choice!(Animation { None, Fade } default Rise);
choice!(ButtonStyle { Outline } default Solid);
choice!(ImagePosition { Start, Background } default End);
choice!(Scale { Compact, Large } default Standard);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(deny_unknown_fields, default)]
pub struct Design {
    pub template: Template,
    pub align: Align,
    pub background: Background,
    pub show_logo: bool,
    pub radius: Radius,
    pub animation: Animation,
    pub button: ButtonStyle,
    pub image_position: ImagePosition,
    pub scale: Scale,
}

/// Where a campaign can appear on a website.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Placement {
    /// A slim bar above the header on every matching page.
    AnnouncementBar,
    /// A banner directly below the navigation.
    BelowNav,
    /// The top of the home page (corporate) or landing page (product sites).
    HomeHero,
    /// A compact card in the bottom corner.
    Floating,
    /// A centred dialog.
    Modal,
    /// A band above the footer.
    Footer,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Pages {
    #[default]
    All,
    Home,
    Blog,
    Contact,
    Products,
    Custom,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Devices {
    #[default]
    All,
    Desktop,
    Mobile,
}

/// How often one visitor sees the campaign (kept in their browser only).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Frequency {
    Always,
    #[default]
    Session,
    Once,
    Daily,
    Weekly,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Trigger {
    #[default]
    Immediate,
    Delay,
    Scroll,
    /// Desktop only: the pointer leaves the top of the window.
    ExitIntent,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Display {
    pub placements: Vec<Placement>,
    #[serde(default)]
    pub pages: Pages,
    /// For `custom`: site paths, each a prefix (e.g. `/pricing`).
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub devices: Devices,
    #[serde(default)]
    pub frequency: Frequency,
    #[serde(default)]
    pub trigger: Trigger,
    /// Seconds for `delay`; percent of the page for `scroll`.
    #[serde(default)]
    pub trigger_value: u16,
    #[serde(default = "yes")]
    pub dismissible: bool,
}

fn yes() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Recurrence {
    #[default]
    None,
    /// The same dates every year (anniversaries, seasonal offers).
    Yearly,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Schedule {
    #[serde(default)]
    pub starts_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub ends_at: Option<DateTime<Utc>>,
    /// IANA time zone the dates were chosen in (shown in the Studio).
    #[serde(default = "nairobi")]
    pub timezone: String,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub recurrence: Recurrence,
}

fn nairobi() -> String {
    "Africa/Nairobi".into()
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RewardKind {
    Discount,
    TrialExtension,
    Credit,
    OnboardingDiscount,
    Merchandise,
    Training,
    Other,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Reward {
    /// Stable id (client-generated); keeps stock across versions.
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub kind: RewardKind,
    /// `None`: unlimited.
    #[serde(default)]
    pub quantity: Option<u32>,
    /// Relative chance (0–1000); odds are shown to visitors.
    pub weight: u16,
    /// How to redeem it (shown with the code).
    pub instructions: String,
}

/// Interactive rewards (spin to win). Rewards are decided by the API, never
/// by the animation; free to enter (no payment or purchase can be required).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rewards {
    pub rewards: Vec<Reward>,
    /// Attempts per participant (email address).
    #[serde(default = "one")]
    pub max_attempts: u8,
    /// Who may take part, shown before playing.
    pub eligibility: String,
    /// Days a reward can be redeemed after it's won.
    #[serde(default = "thirty")]
    pub redeem_days: u16,
    /// Products or plans the rewards apply to.
    #[serde(default)]
    pub applicable: Option<String>,
    /// Geographic or other restrictions.
    #[serde(default)]
    pub restrictions: Option<String>,
    /// Confirmation that promotion, consumer-protection and gambling rules
    /// were checked for the markets it runs in (required to submit).
    #[serde(default)]
    pub legal_review: String,
}

fn one() -> u8 {
    1
}

fn thirty() -> u16 {
    30
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CampaignDoc {
    pub content: Content,
    #[serde(default)]
    pub design: Design,
    pub display: Display,
    pub schedule: Schedule,
    #[serde(default)]
    pub rewards: Option<Rewards>,
}

struct Checker(Vec<FieldError>);

impl Checker {
    fn push(&mut self, field: &'static str, message: &'static str) {
        if !self.0.iter().any(|e| e.field == field) {
            self.0.push(FieldError {
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

    fn cta(&mut self, field: &'static str, cta: &Option<Cta>) {
        let Some(cta) = cta else { return };
        self.text(field, &cta.label, 40, "Button labels need 1–40 characters.");
        if cta.action == Action::Link && !cta.href.as_deref().is_some_and(safe_href) {
            self.push(
                field,
                "Links must be a page on the site (starting with /) or an https:// address.",
            );
        }
    }
}

impl CampaignDoc {
    /// Checks a draft: lengths, links and choices. `kind` is the campaign's type.
    pub fn validate(&self, kind: &str) -> Result<(), Vec<FieldError>> {
        let mut c = Checker(Vec::new());
        let content = &self.content;
        c.optional(
            "content",
            &content.badge,
            40,
            "Badges can be up to 40 characters.",
        );
        c.text(
            "content",
            &content.headline,
            120,
            "Headlines need 1–120 characters.",
        );
        c.optional(
            "content",
            &content.subheadline,
            160,
            "Supporting headlines can be up to 160 characters.",
        );
        c.optional(
            "content",
            &content.body,
            1200,
            "Descriptions can be up to 1,200 characters.",
        );
        c.optional(
            "content",
            &content.terms,
            4000,
            "Terms can be up to 4,000 characters.",
        );
        if content.promo_code.as_ref().is_some_and(|code| {
            code.is_empty()
                || code.len() > 32
                || !code.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
        }) {
            c.push(
                "content",
                "Promotional codes use up to 32 letters, digits and hyphens.",
            );
        }
        c.cta("content", &content.primary);
        c.cta("content", &content.secondary);

        let display = &self.display;
        if display.placements.is_empty() || display.placements.len() > 3 {
            c.push("display", "Choose one to three places to show the campaign.");
        }
        if display.pages == Pages::Custom
            && (display.paths.is_empty()
                || display.paths.len() > 10
                || display
                    .paths
                    .iter()
                    .any(|p| !p.starts_with('/') || p.starts_with("//") || p.len() > 120 || !safe_href(p)))
        {
            c.push("display", "List up to ten site paths, each starting with /.");
        }
        match display.trigger {
            Trigger::Delay if display.trigger_value == 0 || display.trigger_value > 120 => {
                c.push("display", "Delays are 1–120 seconds.");
            }
            Trigger::Scroll if display.trigger_value == 0 || display.trigger_value > 100 => {
                c.push("display", "Scroll triggers are 1–100% of the page.");
            }
            _ => {}
        }

        let schedule = &self.schedule;
        if let (Some(start), Some(end)) = (schedule.starts_at, schedule.ends_at)
            && end <= start
        {
            c.push("schedule", "The end must be after the start.");
        }
        if schedule.recurrence == Recurrence::Yearly
            && !matches!((schedule.starts_at, schedule.ends_at), (Some(s), Some(e)) if e - s <= chrono::Duration::days(180))
        {
            c.push(
                "schedule",
                "Yearly campaigns need a start and an end at most six months apart.",
            );
        }
        if schedule.timezone.is_empty() || schedule.timezone.len() > 64 {
            c.push("schedule", "Choose a time zone.");
        }
        if !(-100..=100).contains(&schedule.priority) {
            c.push("schedule", "Priority is between -100 and 100.");
        }
        if content.countdown && schedule.ends_at.is_none() {
            c.push("schedule", "A countdown needs an end date.");
        }

        match (&self.rewards, kind) {
            (None, "rewards") => c.push("rewards", "Add the rewards visitors can win."),
            (Some(_), k) if k != "rewards" => {
                c.push("rewards", "Only interactive reward campaigns have rewards.")
            }
            (Some(r), _) => {
                if r.rewards.is_empty() || r.rewards.len() > 12 {
                    c.push("rewards", "Add between one and twelve rewards.");
                }
                let mut ids = std::collections::HashSet::new();
                for reward in &r.rewards {
                    if reward.id.is_empty() || reward.id.len() > 40 || !ids.insert(reward.id.as_str()) {
                        c.push("rewards", "Each reward needs its own id.");
                    }
                    c.text("rewards", &reward.label, 40, "Reward names need 1–40 characters.");
                    c.optional(
                        "rewards",
                        &reward.description,
                        200,
                        "Reward descriptions can be up to 200 characters.",
                    );
                    c.text(
                        "rewards",
                        &reward.instructions,
                        400,
                        "Explain how to redeem each reward (up to 400 characters).",
                    );
                    if reward.weight > 1000 {
                        c.push("rewards", "Chances are 0–1000.");
                    }
                }
                if r.rewards.iter().all(|w| w.weight == 0) {
                    c.push("rewards", "At least one reward needs a chance above 0.");
                }
                if r.max_attempts == 0 || r.max_attempts > 10 {
                    c.push("rewards", "Allow 1–10 attempts per person.");
                }
                c.text(
                    "rewards",
                    &r.eligibility,
                    400,
                    "Say who can take part (up to 400 characters).",
                );
                c.optional(
                    "rewards",
                    &r.applicable,
                    200,
                    "Applicable products can be up to 200 characters.",
                );
                c.optional(
                    "rewards",
                    &r.restrictions,
                    400,
                    "Restrictions can be up to 400 characters.",
                );
                if r.redeem_days == 0 || r.redeem_days > 365 {
                    c.push("rewards", "Rewards can be redeemed for 1–365 days.");
                }
            }
            _ => {}
        }
        if c.0.is_empty() { Ok(()) } else { Err(c.0) }
    }

    /// Extra checks before a version can go to approval.
    pub fn ready(&self, kind: &str) -> Result<(), &'static str> {
        if self.schedule.ends_at.is_none() && kind == "rewards" {
            return Err("Reward campaigns need an end date.");
        }
        if self.content.primary.is_none() && kind != "rewards" && kind != "announcement" {
            return Err("Add a call to action.");
        }
        if let Some(r) = &self.rewards {
            if r.legal_review.trim().chars().count() < 20 {
                return Err(
                    "Record the legal review (promotion, consumer-protection and gambling rules for each market) before submitting.",
                );
            }
            if self.content.terms.as_deref().is_none_or(|t| t.trim().is_empty()) {
                return Err("Reward campaigns need terms and conditions.");
            }
        }
        Ok(())
    }

    /// Whether the campaign shows at `now` (recurring campaigns every year).
    pub fn live_at(&self, now: DateTime<Utc>) -> bool {
        let (start, end) = (self.schedule.starts_at, self.schedule.ends_at);
        if self.schedule.recurrence == Recurrence::Yearly
            && let (Some(s), Some(e)) = (start, end)
        {
            // Shift the window into the current year (or last year's, if it wraps).
            for years in [0, -1] {
                let shift = now.year() - s.year() + years;
                let (Some(s2), Some(e2)) = (shift_years(s, shift), shift_years(e, shift)) else {
                    continue;
                };
                if s2 <= now && now < e2 {
                    return true;
                }
            }
            return false;
        }
        start.is_none_or(|s| s <= now) && end.is_none_or(|e| now < e)
    }

    /// The document as websites receive it: Markdown rendered, odds disclosed,
    /// stock and internal notes left out.
    pub fn public(&self, available: &[(String, bool)]) -> Value {
        let mut value = serde_json::to_value(self).unwrap_or(Value::Null);
        let html = |md: &Option<String>| md.as_deref().map(|m| markdown::render(m).html);
        value["content"]["body_html"] = json!(html(&self.content.body));
        value["content"]["terms_html"] = json!(html(&self.content.terms));
        if let Some(r) = &self.rewards {
            let open = |id: &str| available.iter().any(|(rid, ok)| rid == id && *ok);
            let total: u32 = r
                .rewards
                .iter()
                .filter(|w| open(&w.id))
                .map(|w| u32::from(w.weight))
                .sum();
            value["rewards"] = json!({
                "max_attempts": r.max_attempts,
                "eligibility": r.eligibility,
                "redeem_days": r.redeem_days,
                "applicable": r.applicable,
                "restrictions": r.restrictions,
                "rewards": r.rewards.iter().map(|w| json!({
                    "id": w.id,
                    "label": w.label,
                    "description": w.description,
                    "kind": w.kind,
                    "available": open(&w.id),
                    // Disclosed chance of winning this reward, in percent.
                    "odds": if total > 0 && open(&w.id) { (f64::from(w.weight) * 1000.0 / f64::from(total)).round() / 10.0 } else { 0.0 },
                })).collect::<Vec<_>>(),
            });
        }
        value
    }
}

fn shift_years(at: DateTime<Utc>, years: i32) -> Option<DateTime<Utc>> {
    use chrono::Months;
    if years >= 0 {
        at.checked_add_months(Months::new(u32::try_from(years).ok()? * 12))
    } else {
        at.checked_sub_months(Months::new(u32::try_from(-years).ok()? * 12))
    }
}

/// A starting document for each kind, so the builder never opens empty.
pub fn template(kind: &str, site_name: &str) -> CampaignDoc {
    let (placements, frequency, trigger, trigger_value, headline, action) = match kind {
        "announcement" => (
            vec![Placement::AnnouncementBar],
            Frequency::Session,
            Trigger::Immediate,
            0,
            format!("News from {site_name}"),
            Action::Link,
        ),
        "floating" => (
            vec![Placement::Floating],
            Frequency::Session,
            Trigger::Delay,
            5,
            format!("See {site_name} in action"),
            Action::Demo,
        ),
        "modal" | "rewards" => (
            vec![Placement::Modal],
            Frequency::Once,
            Trigger::Delay,
            8,
            format!("A note from {site_name}"),
            Action::Contact,
        ),
        "launch" => (
            vec![Placement::HomeHero],
            Frequency::Always,
            Trigger::Immediate,
            0,
            format!("Introducing something new from {site_name}"),
            Action::Waitlist,
        ),
        "event" => (
            vec![Placement::BelowNav],
            Frequency::Session,
            Trigger::Immediate,
            0,
            format!("Join the {site_name} webinar"),
            Action::Webinar,
        ),
        _ => (
            vec![Placement::HomeHero],
            Frequency::Always,
            Trigger::Immediate,
            0,
            format!("Replace with your {site_name} headline"),
            Action::Demo,
        ),
    };
    let primary = Some(Cta {
        label: match action {
            Action::Demo => "Request a demo",
            Action::Waitlist => "Join the waitlist",
            Action::Webinar => "Register",
            Action::Contact => "Talk to us",
            Action::Link => "Learn more",
        }
        .into(),
        action,
        href: (action == Action::Link).then(|| "/".into()),
    });
    CampaignDoc {
        content: Content {
            badge: (kind == "seasonal" || kind == "countdown").then(|| "Limited time".into()),
            headline,
            subheadline: Some("Replace with a supporting line.".into()),
            primary: if kind == "rewards" { None } else { primary },
            countdown: kind == "countdown",
            ..Content::default()
        },
        design: Design {
            show_logo: true,
            ..Design::default()
        },
        display: Display {
            placements,
            pages: if kind == "floating" || kind == "announcement" {
                Pages::All
            } else {
                Pages::Home
            },
            paths: Vec::new(),
            devices: Devices::All,
            frequency,
            trigger,
            trigger_value,
            dismissible: true,
        },
        schedule: Schedule {
            starts_at: None,
            // Countdowns and seasonal offers need an end; two weeks to start from.
            ends_at: matches!(kind, "countdown" | "seasonal")
                .then(|| Utc::now() + chrono::Duration::days(14)),
            timezone: nairobi(),
            priority: 0,
            recurrence: Recurrence::None,
        },
        rewards: (kind == "rewards").then(|| Rewards {
            // A placeholder with no stock: nothing can be won until it's configured.
            rewards: vec![Reward {
                id: "reward-1".into(),
                label: "Replace with a reward".into(),
                description: None,
                kind: RewardKind::Other,
                quantity: Some(0),
                weight: 100,
                instructions: "Replace with how to redeem it.".into(),
            }],
            max_attempts: 1,
            eligibility: "Replace with who can take part.".into(),
            redeem_days: 30,
            applicable: None,
            restrictions: None,
            legal_review: String::new(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn doc(kind: &str) -> CampaignDoc {
        template(kind, "ZiraHR")
    }

    #[test]
    fn templates_validate_for_every_kind() {
        for kind in KINDS {
            assert!(doc(kind).validate(kind).is_ok(), "{kind}");
        }
    }

    #[test]
    fn unsafe_links_and_bad_schedules_are_refused() {
        let mut d = doc("hero");
        d.content.primary = Some(Cta {
            label: "Go".into(),
            action: Action::Link,
            href: Some("javascript:alert(1)".into()),
        });
        assert!(d.validate("hero").is_err());
        let mut d = doc("hero");
        d.schedule.starts_at = Some(Utc.with_ymd_and_hms(2026, 11, 2, 0, 0, 0).unwrap());
        d.schedule.ends_at = Some(Utc.with_ymd_and_hms(2026, 11, 1, 0, 0, 0).unwrap());
        assert!(d.validate("hero").is_err());
    }

    #[test]
    fn reward_campaigns_need_terms_and_a_legal_review() {
        let mut d = doc("rewards");
        d.rewards.as_mut().unwrap().rewards = vec![Reward {
            id: "a".into(),
            label: "10% off".into(),
            description: None,
            kind: RewardKind::Discount,
            quantity: Some(10),
            weight: 100,
            instructions: "Quote the code when you subscribe.".into(),
        }];
        d.schedule.ends_at = Some(Utc.with_ymd_and_hms(2026, 12, 1, 0, 0, 0).unwrap());
        assert!(d.validate("rewards").is_ok());
        assert!(d.ready("rewards").is_err());
        d.content.terms = Some("Terms.".into());
        d.rewards.as_mut().unwrap().legal_review = "Reviewed for Kenya by counsel on 30 Oct 2026.".into();
        assert!(d.ready("rewards").is_ok());
        assert!(
            doc("hero").validate("rewards").is_err(),
            "reward campaigns need rewards"
        );
    }

    #[test]
    fn schedules_and_yearly_recurrence() {
        let mut d = doc("seasonal");
        d.schedule.starts_at = Some(Utc.with_ymd_and_hms(2026, 11, 20, 0, 0, 0).unwrap());
        d.schedule.ends_at = Some(Utc.with_ymd_and_hms(2026, 12, 1, 0, 0, 0).unwrap());
        assert!(d.live_at(Utc.with_ymd_and_hms(2026, 11, 25, 0, 0, 0).unwrap()));
        assert!(!d.live_at(Utc.with_ymd_and_hms(2027, 11, 25, 0, 0, 0).unwrap()));
        d.schedule.recurrence = Recurrence::Yearly;
        assert!(d.live_at(Utc.with_ymd_and_hms(2027, 11, 25, 0, 0, 0).unwrap()));
        assert!(!d.live_at(Utc.with_ymd_and_hms(2027, 12, 5, 0, 0, 0).unwrap()));
    }
}
