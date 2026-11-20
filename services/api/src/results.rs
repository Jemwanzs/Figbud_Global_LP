//! Results & achievements and "Our Success Story" (owner's briefs, 19 Nov
//! 2026, P10-R1 and P10-R2). The figures themselves stay where they were:
//! verified metrics in Customers & proof (`proof.rs`: source, period,
//! verification, maker-checker publishing, per-website targeting, versions).
//! What's added here is how each website shows them, saved with its settings
//! (draft, then published; audited; version-checked):
//!
//! - `ResultsDisplay`: the Results band's wording, layout (featured figure
//!   with supporting ones, equal cards, or a carousel), placement and motion.
//! - `SuccessStory`: an optional full-width band after the home page's hero
//!   (off by default): wording, background, overlay, layout, which published
//!   figures in which order, motion, and whether it replaces the Results band
//!   so the same figures don't show twice. Published versions are kept for
//!   rollback.
//! - `TestimonialsDisplay` (owner's brief, 20 Nov 2026, P10-R4): how the
//!   website's approved testimonials are laid out (one centred card, a
//!   carousel moved by hand, or a grid; by default a card for one and a
//!   carousel for more) and the band's spacing. The testimonials themselves
//!   stay in Customers & proof, with their consent and publishing.
//! - `DisplayDefaults`: set once on FigBud Global (Global settings → Website
//!   display) and inherited by every website that hasn't set its own; a
//!   change there never touches a website's content, colours or choices.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::FieldError;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ResultsLayout {
    /// One prominent figure (about a third) with the others beside it.
    #[default]
    Featured,
    /// Every figure with equal weight.
    Cards,
    /// A row of cards with previous/next (and optional rotation).
    Carousel,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Notation {
    #[default]
    Compact,
    Full,
}

/// Motion for figures. Always still with reduced motion; counting never
/// shows a value above the verified one.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Animation {
    pub count_up: bool,
    pub entrance: bool,
    pub hover: bool,
    /// How long counting takes.
    pub duration_ms: u16,
    /// Delay between one figure and the next.
    pub stagger_ms: u16,
}

impl Default for Animation {
    fn default() -> Self {
        Self {
            count_up: true,
            entrance: true,
            hover: true,
            duration_ms: 1600,
            stagger_ms: 120,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ResultsPlacement {
    /// With the website's customer proof, before testimonials (as before).
    #[default]
    Proof,
    /// Straight after the home page's hero.
    AfterHero,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct ResultsDisplay {
    pub enabled: bool,
    pub eyebrow: Option<String>,
    pub title: Option<String>,
    pub lead: Option<String>,
    /// Unset: the website display default.
    pub layout: Option<ResultsLayout>,
    pub placement: ResultsPlacement,
    /// Unset: the website display default.
    pub animation: Option<Animation>,
    /// Carousel only.
    pub autoplay: bool,
    pub interval: u8,
}

impl Default for ResultsDisplay {
    fn default() -> Self {
        Self {
            enabled: true,
            eyebrow: None,
            title: None,
            lead: None,
            layout: None,
            placement: ResultsPlacement::Proof,
            animation: None,
            autoplay: false,
            interval: 6,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum StoryLayout {
    /// A horizontal strip of figures with thin dividers (four across on desktop).
    #[default]
    Strip,
    Cards,
    /// Words on one side, figures on the other.
    Split,
    /// The first figure large, the others beside it (P10-R3).
    Featured,
    /// Large counting numbers, centred (P10-R3).
    Counter,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum StoryBackground {
    /// The website's dark brand band.
    #[default]
    Brand,
    /// The website's band gradient.
    Gradient,
    /// An image from the website's media library, under a brand-aware overlay.
    Image,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct SuccessStory {
    pub enabled: bool,
    pub eyebrow: String,
    pub headline: String,
    pub lead: Option<String>,
    pub layout: StoryLayout,
    pub background: StoryBackground,
    pub image_id: Option<Uuid>,
    /// How dark the overlay over an image is (0–95 %).
    pub overlay: u8,
    /// Published figures from Customers & proof, in this order (up to 8).
    pub metric_ids: Vec<Uuid>,
    pub animation: Option<Animation>,
    /// Slow background movement on wide screens only.
    pub parallax: bool,
    /// Hide the Results band on the home page while this shows the figures.
    pub replaces_results: bool,
    /// How many figures it may show (1–12; 8 by default), set per website (P10-R3).
    pub max_figures: u8,
}

impl Default for SuccessStory {
    fn default() -> Self {
        Self {
            enabled: false,
            eyebrow: "Our Success Story".into(),
            headline: String::new(),
            lead: None,
            layout: StoryLayout::Strip,
            background: StoryBackground::Brand,
            image_id: None,
            overlay: 70,
            metric_ids: Vec::new(),
            animation: None,
            parallax: false,
            replaces_results: false,
            max_figures: 8,
        }
    }
}

/// A published success story, kept for rollback (newest first, up to 10).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StoryVersion {
    pub published_at: String,
    pub by: Option<String>,
    pub story: SuccessStory,
}

pub const STORY_HISTORY: usize = 10;

pub fn remember(history: &mut Vec<StoryVersion>, story: &SuccessStory, by: Option<String>) {
    history.insert(
        0,
        StoryVersion {
            published_at: Utc::now().to_rfc3339(),
            by,
            story: story.clone(),
        },
    );
    history.truncate(STORY_HISTORY);
}

/// Global settings → Website display, on FigBud Global; every website
/// without its own inherits them.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct DisplayDefaults {
    pub notation: Notation,
    pub results_layout: ResultsLayout,
    pub animation: Animation,
}

fn push(e: &mut Vec<FieldError>, field: &'static str, message: &'static str) {
    if !e.iter().any(|x| x.field == field) {
        e.push(FieldError {
            field,
            code: "invalid",
            message,
        });
    }
}

fn tidy(value: &mut Option<String>) {
    *value = value
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
}

fn too_long(value: &Option<String>, max: usize) -> bool {
    value.as_ref().is_some_and(|v| v.chars().count() > max)
}

pub fn check_animation(e: &mut Vec<FieldError>, a: &Animation, field: &'static str) {
    if !(400..=4000).contains(&a.duration_ms) || a.stagger_ms > 600 {
        push(
            e,
            field,
            "Counting takes 0.4–4 seconds, with up to 0.6 seconds between figures.",
        );
    }
}

pub fn check_results(e: &mut Vec<FieldError>, r: &mut ResultsDisplay, field: &'static str) {
    tidy(&mut r.eyebrow);
    tidy(&mut r.title);
    tidy(&mut r.lead);
    if too_long(&r.eyebrow, 40) || too_long(&r.title, 80) || too_long(&r.lead, 200) {
        push(
            e,
            field,
            "Eyebrows are up to 40 characters, headings 80 and descriptions 200.",
        );
    }
    if !(4..=15).contains(&r.interval) {
        push(e, field, "A carousel moves every 4–15 seconds.");
    }
    if let Some(a) = &r.animation {
        check_animation(e, a, field);
    }
}

pub fn check_story(e: &mut Vec<FieldError>, s: &mut SuccessStory, field: &'static str) {
    s.eyebrow = s.eyebrow.trim().to_owned();
    s.headline = s.headline.trim().to_owned();
    tidy(&mut s.lead);
    if s.eyebrow.chars().count() > 40 || s.headline.chars().count() > 90 || too_long(&s.lead, 220) {
        push(
            e,
            field,
            "The title is up to 40 characters, the headline 90 and the description 220.",
        );
    }
    if s.enabled && (s.headline.is_empty() || s.metric_ids.is_empty()) {
        push(
            e,
            field,
            "A success story needs a headline and at least one published figure.",
        );
    }
    let mut seen = std::collections::HashSet::new();
    if !(1..=12).contains(&s.max_figures) {
        push(e, field, "A success story shows between 1 and 12 figures.");
    } else if s.metric_ids.len() > usize::from(s.max_figures)
        || !s.metric_ids.iter().all(|id| seen.insert(*id))
    {
        push(e, field, "Choose different figures, up to the story's limit.");
    }
    if s.overlay > 95 {
        push(e, field, "The overlay is 0–95 %.");
    }
    if s.background == StoryBackground::Image && s.image_id.is_none() {
        push(e, field, "Choose the background image from the media library.");
    }
    if s.background != StoryBackground::Image {
        s.image_id = None;
    }
    if let Some(a) = &s.animation {
        check_animation(e, a, field);
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TestimonialsLayout {
    /// One centred card for one testimonial, a carousel for more.
    #[default]
    Auto,
    /// Centred cards, one under another.
    Card,
    /// One at a time, moved by hand (never rotating by itself).
    Carousel,
    /// Side by side.
    Grid,
}

/// The testimonial band's layout and spacing (P10-R4).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct TestimonialsDisplay {
    pub layout: TestimonialsLayout,
    /// Compact unless set (the owner's brief: content-driven height).
    pub spacing: Option<crate::pages::blocks::Spacing>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn testimonials_display_defaults_to_an_automatic_compact_band() {
        let d: TestimonialsDisplay = serde_json::from_str("{}").unwrap();
        assert_eq!(d.layout, TestimonialsLayout::Auto);
        assert_eq!(d.spacing, None);
        let d: TestimonialsDisplay =
            serde_json::from_str(r#"{"layout":"carousel","spacing":"spacious"}"#).unwrap();
        assert_eq!(d.layout, TestimonialsLayout::Carousel);
        assert!(serde_json::from_str::<TestimonialsDisplay>(r#"{"layout":"wall"}"#).is_err());
    }

    #[test]
    fn results_and_stories_are_checked() {
        let mut e = Vec::new();
        check_results(&mut e, &mut ResultsDisplay::default(), "results");
        let mut story = SuccessStory::default();
        check_story(&mut e, &mut story, "success_story");
        assert!(e.is_empty(), "the defaults are valid: {e:?}");

        let mut on = SuccessStory {
            enabled: true,
            ..SuccessStory::default()
        };
        check_story(&mut e, &mut on, "success_story");
        assert_eq!(e.len(), 1, "on needs a headline and figures");

        let id = Uuid::now_v7();
        let mut e = Vec::new();
        let mut twice = SuccessStory {
            metric_ids: vec![id, id],
            background: StoryBackground::Image,
            overlay: 99,
            ..SuccessStory::default()
        };
        check_story(&mut e, &mut twice, "success_story");
        assert_eq!(e.len(), 1, "one message per field");

        let mut e = Vec::new();
        let mut slow = ResultsDisplay {
            animation: Some(Animation {
                duration_ms: 10_000,
                ..Animation::default()
            }),
            interval: 2,
            ..ResultsDisplay::default()
        };
        check_results(&mut e, &mut slow, "results");
        assert!(!e.is_empty());
    }

    #[test]
    fn history_keeps_the_last_ten() {
        let mut h = Vec::new();
        for _ in 0..12 {
            remember(&mut h, &SuccessStory::default(), Some("Olu".into()));
        }
        assert_eq!(h.len(), STORY_HISTORY);
    }
}
