//! A website's Brand & Theme Studio settings (owner's brief, 11 Nov 2026):
//! a named palette, independent light and dark colours, and gradient presets,
//! kept in the website's settings like its other appearance choices. Drafts
//! may save with contrast problems (the Studio shows them as warnings);
//! publishing refuses any critical one (WCAG AA: 4.5:1 for text, 3:1 for
//! focus). The websites turn the published theme into CSS custom properties
//! scoped to the website, so no other website's colours change.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::brand::config::{contrast, parse_hex};
use crate::error::FieldError;
use crate::site_settings::Theme;

/// Gradient presets: where a website uses them (and sections can choose them).
pub const GRADIENT_PRESETS: [&str; 5] = ["hero", "band", "demo", "cta", "footer"];
const MAX_SWATCHES: usize = 16;
const MAX_HISTORY: usize = 10;

/// The derived surfaces, in % towards the text colour (must match
/// `themeTokens` in packages/site-kit/src/site-theme.ts).
pub const ELEVATED: u8 = 3;
pub const SURFACE_2: u8 = 6;
pub const SURFACE_3: u8 = 9;

/// A named colour in the website's palette.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Swatch {
    pub name: String,
    pub hex: String,
}

/// One theme mode's colours. Unset means the website's built-in colours; a
/// mode that sets any must set the readable core, so it can be checked.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct ModeTokens {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_muted: Option<String>,
    /// Button and active-state fill.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    /// Text on that fill.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_text: Option<String>,
    /// The brand colour as text (links, labels).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
    /// Secondary text on gradients and contrasting bands.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_on_gradient: Option<String>,
}

impl ModeTokens {
    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }

    fn fields_mut(&mut self) -> [&mut Option<String>; 10] {
        [
            &mut self.background,
            &mut self.surface,
            &mut self.text,
            &mut self.text_muted,
            &mut self.action,
            &mut self.action_text,
            &mut self.accent_text,
            &mut self.border,
            &mut self.focus,
            &mut self.text_on_gradient,
        ]
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum GradientKind {
    #[default]
    Linear,
    Radial,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Stop {
    pub color: String,
    /// Position, 0–100 %.
    pub at: u8,
    /// Opacity, 0–100 %.
    #[serde(default = "full")]
    pub opacity: u8,
}

fn full() -> u8 {
    100
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Gradient {
    #[serde(default)]
    pub kind: GradientKind,
    /// Linear: direction in degrees.
    #[serde(default)]
    pub angle: u16,
    /// Radial: centre, in % of the width and height.
    #[serde(default = "half")]
    pub x: u8,
    #[serde(default = "half")]
    pub y: u8,
    pub stops: Vec<Stop>,
}

fn half() -> u8 {
    50
}

/// A preset in both modes; either may be unset (the website's built-in one).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct GradientPair {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub light: Option<Gradient>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dark: Option<Gradient>,
}

pub type Gradients = BTreeMap<String, GradientPair>;

/// A published theme kept for rollback: when, by whom, and what it was.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThemeVersion {
    pub published_at: String,
    #[serde(default)]
    pub by: Option<String>,
    pub theme: Theme,
}

/// `a` moved `percent` of the way to `b`, as CSS `color-mix(in srgb, …)` and
/// the websites (`themeTokens`) compute it.
pub fn mix(a: &str, b: &str, percent: u8) -> String {
    let (Some(x), Some(y)) = (parse_hex(a), parse_hex(b)) else {
        return a.to_owned();
    };
    let p = f64::from(percent.min(100)) / 100.0;
    let c = |i: usize| {
        let v = f64::from(x[i]) + (f64::from(y[i]) - f64::from(x[i])) * p;
        (v + 0.5).floor() as u8
    };
    format!("#{:02x}{:02x}{:02x}", c(0), c(1), c(2))
}

fn hex(errors: &mut Vec<FieldError>, value: &mut String, field: &'static str) -> bool {
    *value = value.trim().to_ascii_lowercase();
    if parse_hex(value).is_none() {
        errors.push(FieldError {
            field,
            code: "format",
            message: "Use a six-digit hex colour such as #f7933a.",
        });
        return false;
    }
    true
}

fn pair(
    errors: &mut Vec<FieldError>,
    fg: &str,
    bg: &str,
    min: f64,
    field: &'static str,
    message: &'static str,
) {
    if contrast(fg, bg).unwrap_or(0.0) < min {
        errors.push(FieldError {
            field,
            code: "contrast",
            message,
        });
    }
}

/// Checks a mode's colours and gradients. `strict` (publishing) adds the
/// contrast rules; drafts only need valid colours.
fn check_mode(
    errors: &mut Vec<FieldError>,
    mode: &mut ModeTokens,
    gradients: &mut [(&str, &mut Gradient)],
    field: &'static str,
    strict: bool,
) {
    let before = errors.len();
    for value in mode.fields_mut() {
        if let Some(v) = value {
            if v.trim().is_empty() {
                *value = None;
            } else {
                hex(errors, v, field);
            }
        }
    }
    for (_, gradient) in gradients.iter_mut() {
        if !(2..=5).contains(&gradient.stops.len())
            || gradient.angle > 360
            || gradient.x > 100
            || gradient.y > 100
            || gradient.stops.iter().any(|s| s.at > 100 || s.opacity > 100)
        {
            errors.push(FieldError {
                field,
                code: "gradient",
                message: "Gradients need 2 to 5 colour stops, positions from 0 to 100 % and an angle up to 360°.",
            });
        }
        for stop in &mut gradient.stops {
            hex(errors, &mut stop.color, field);
        }
    }
    if !strict || errors.len() > before || (mode.is_empty() && gradients.is_empty()) {
        return;
    }
    let (Some(bg), Some(surface), Some(text), Some(muted), Some(action), Some(on_action), Some(accent)) = (
        mode.background.as_deref(),
        mode.surface.as_deref(),
        mode.text.as_deref(),
        mode.text_muted.as_deref(),
        mode.action.as_deref(),
        mode.action_text.as_deref(),
        mode.accent_text.as_deref(),
    ) else {
        errors.push(FieldError {
            field,
            code: "incomplete",
            message: "Set the background, surface, text, secondary text, button, button text and accent text together, so they can be checked.",
        });
        return;
    };
    let surfaces = [
        bg.to_owned(),
        mix(bg, text, ELEVATED),
        surface.to_owned(),
        mix(surface, text, SURFACE_2),
        mix(surface, text, SURFACE_3),
    ];
    let mut failed = |fg: &str, message: &'static str| {
        if surfaces.iter().any(|s| contrast(fg, s).unwrap_or(0.0) < 4.5) {
            errors.push(FieldError {
                field,
                code: "contrast",
                message,
            });
        }
    };
    failed(
        text,
        "Text needs at least 4.5:1 on the background and every surface.",
    );
    failed(
        muted,
        "Secondary text needs at least 4.5:1 on the background and every surface.",
    );
    failed(
        accent,
        "Accent text (links, labels) needs at least 4.5:1 on the background and every surface.",
    );
    pair(
        errors,
        on_action,
        action,
        4.5,
        field,
        "Button text needs at least 4.5:1 on the button colour.",
    );
    if let Some(focus) = mode.focus.as_deref() {
        pair(
            errors,
            focus,
            bg,
            3.0,
            field,
            "The focus ring needs at least 3:1 on the background.",
        );
    }
    // Secondary text is its own colour on gradient panels and bands
    // (`--text-on-grad`); the hero keeps the usual secondary text.
    let secondary = mode.text_on_gradient.as_deref().unwrap_or(muted);
    let unreadable = |fg: &str, hero: bool| {
        gradients
            .iter()
            .filter(|(key, _)| (*key == "hero") == hero)
            .any(|(_, g)| {
                // A see-through stop shows the background through it.
                g.stops
                    .iter()
                    .any(|s| contrast(fg, &mix(bg, &s.color, s.opacity)).unwrap_or(0.0) < 4.5)
            })
    };
    if unreadable(text, false) || unreadable(text, true) {
        errors.push(FieldError {
            field,
            code: "contrast",
            message: "Text needs at least 4.5:1 on every gradient colour stop.",
        });
    }
    if unreadable(secondary, false) || unreadable(muted, true) {
        errors.push(FieldError {
            field,
            code: "contrast",
            message: "Secondary text on gradients needs at least 4.5:1 on every colour stop (give it its own colour).",
        });
    }
}

/// Checks the theme's Studio settings. Publishing (`strict`) enforces contrast;
/// the section band colours are checked by the caller when published.
pub fn check(errors: &mut Vec<FieldError>, theme: &mut Theme, strict: bool) {
    if theme.palette.len() > MAX_SWATCHES {
        errors.push(FieldError {
            field: "theme.palette",
            code: "too_many",
            message: "Up to 16 palette colours.",
        });
    }
    for swatch in &mut theme.palette {
        swatch.name = swatch.name.trim().to_owned();
        if swatch.name.is_empty() || swatch.name.chars().count() > 40 {
            errors.push(FieldError {
                field: "theme.palette",
                code: "name",
                message: "Each palette colour needs a name of up to 40 characters.",
            });
        }
        hex(errors, &mut swatch.hex, "theme.palette");
    }
    if theme
        .gradients
        .keys()
        .any(|k| !GRADIENT_PRESETS.contains(&k.as_str()))
    {
        errors.push(FieldError {
            field: "theme.gradients",
            code: "preset",
            message: "Gradients are for the hero, bands, demonstrations, calls to action and footer.",
        });
    }
    if !strict {
        for (value, field) in [
            (&mut theme.brand_section, "theme.brand_section"),
            (&mut theme.soft_section, "theme.soft_section"),
        ] {
            if let Some(v) = value {
                if v.trim().is_empty() {
                    *value = None;
                } else {
                    hex(errors, v, field);
                }
            }
        }
    }
    theme
        .gradients
        .retain(|_, p| p.light.is_some() || p.dark.is_some());
    let mut light = Vec::new();
    let mut dark = Vec::new();
    for (key, preset) in theme.gradients.iter_mut() {
        if let Some(g) = &mut preset.light {
            light.push((key.as_str(), g));
        }
        if let Some(g) = &mut preset.dark {
            dark.push((key.as_str(), g));
        }
    }
    check_mode(errors, &mut theme.light, &mut light, "theme.light", strict);
    check_mode(errors, &mut theme.dark, &mut dark, "theme.dark", strict);
}

/// Keeps the newest published versions for rollback.
pub fn remember(history: &mut Vec<ThemeVersion>, version: ThemeVersion) {
    history.insert(0, version);
    history.truncate(MAX_HISTORY);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn theme(value: Value) -> Theme {
        serde_json::from_value(value).unwrap()
    }

    fn codes(mut t: Theme, strict: bool) -> Vec<(&'static str, &'static str)> {
        let mut e = Vec::new();
        check(&mut e, &mut t, strict);
        e.into_iter().map(|e| (e.field, e.code)).collect()
    }

    /// ZiraHR's own colours (packages/brand/src/tokens.css).
    fn zirahr() -> Value {
        json!({
            "palette": [{ "name": "Signature Orange", "hex": " #F7933A " }, { "name": "Deep Charcoal", "hex": "#292625" }],
            "dark": {
                "background": "#292625", "surface": "#38302d", "text": "#fff5e6", "text_muted": "#d8c9b8",
                "action": "#f7933a", "action_text": "#292625", "accent_text": "#f9a65c", "focus": "#f9a65c",
                "text_on_gradient": "#eadfd2"
            },
            "light": {
                "background": "#f9f5ef", "surface": "#fff5e6", "text": "#292625", "text_muted": "#6a5a51",
                "action": "#f7933a", "action_text": "#292625", "accent_text": "#9a4f17", "focus": "#b05a1c"
            },
            "gradients": {
                "hero": {
                    "dark": { "kind": "linear", "angle": 125, "stops": [
                        { "color": "#292625", "at": 5 }, { "color": "#38302d", "at": 54 }, { "color": "#6b4229", "at": 100 }] },
                    "light": { "kind": "linear", "angle": 125, "stops": [
                        { "color": "#f9f5ef", "at": 5 }, { "color": "#f1dcc2", "at": 100 }] }
                },
                "band": { "dark": { "kind": "radial", "x": 80, "y": 20, "stops": [
                    { "color": "#765037", "at": 0 }, { "color": "#292625", "at": 100 }] } }
            }
        })
    }

    #[test]
    fn a_readable_theme_publishes_tidied() {
        let mut t = theme(zirahr());
        let mut e = Vec::new();
        check(&mut e, &mut t, true);
        assert!(e.is_empty(), "{e:?}");
        assert_eq!(t.palette[0].hex, "#f7933a");
        assert!(codes(Theme::default(), true).is_empty());
    }

    #[test]
    fn publishing_refuses_unreadable_colours_but_drafts_keep_them() {
        let mut bad = zirahr();
        bad["light"]["text_muted"] = json!("#a89a90");
        // On the surfaces, and as secondary text on the light gradients.
        assert_eq!(
            codes(theme(bad.clone()), true),
            vec![("theme.light", "contrast"); 2]
        );
        assert!(codes(theme(bad), false).is_empty());
        // Button text on the button colour.
        let mut bad = zirahr();
        bad["dark"]["action_text"] = json!("#ffffff");
        assert_eq!(codes(theme(bad), true), vec![("theme.dark", "contrast")]);
        // Secondary text on a gradient's lighter end (the hero's #6b4229).
        let mut bad = zirahr();
        bad["dark"]["text_on_gradient"] = json!("#a08f80");
        assert_eq!(codes(theme(bad), true), vec![("theme.dark", "contrast")]);
        // A nearly see-through light stop over a dark background reads as dark.
        let mut faint = zirahr();
        faint["gradients"]["band"]["dark"]["stops"][0] = json!({ "color": "#ffffff", "at": 0, "opacity": 4 });
        assert!(codes(theme(faint.clone()), true).is_empty());
        faint["gradients"]["band"]["dark"]["stops"][0]["opacity"] = json!(100);
        assert!(codes(theme(faint), true).contains(&("theme.dark", "contrast")));
        // A weak focus ring.
        let mut bad = zirahr();
        bad["light"]["focus"] = json!("#f3e8d8");
        assert_eq!(codes(theme(bad), true), vec![("theme.light", "contrast")]);
    }

    #[test]
    fn a_mode_sets_its_core_colours_together() {
        let mut t = zirahr();
        t["light"] = json!({ "background": "#ffffff" });
        assert_eq!(codes(theme(t.clone()), true), vec![("theme.light", "incomplete")]);
        // Gradients alone need the colours they're checked against, too.
        t["light"] = json!({});
        assert_eq!(codes(theme(t.clone()), true), vec![("theme.light", "incomplete")]);
        assert!(codes(theme(t), false).is_empty());
    }

    #[test]
    fn colours_names_and_gradients_are_checked_in_drafts_too() {
        let mut t = zirahr();
        t["dark"]["text"] = json!("white");
        assert_eq!(codes(theme(t), false), vec![("theme.dark", "format")]);
        let mut t = zirahr();
        t["palette"][0]["name"] = json!("  ");
        assert_eq!(codes(theme(t), false), vec![("theme.palette", "name")]);
        let mut t = zirahr();
        t["palette"] = json!(vec![json!({ "name": "x", "hex": "#000000" }); 17]);
        assert_eq!(codes(theme(t), false), vec![("theme.palette", "too_many")]);
        let mut t = zirahr();
        t["gradients"]["sidebar"] = json!({ "light": t["gradients"]["hero"]["light"] });
        assert_eq!(codes(theme(t), false), vec![("theme.gradients", "preset")]);
        let mut t = zirahr();
        t["gradients"]["hero"]["light"]["stops"] = json!([{ "color": "#ffffff", "at": 0 }]);
        assert_eq!(codes(theme(t), false), vec![("theme.light", "gradient")]);
        let mut t = zirahr();
        t["gradients"]["hero"]["dark"]["angle"] = json!(400);
        assert_eq!(codes(theme(t), false), vec![("theme.dark", "gradient")]);
        let mut t = zirahr();
        t["brand_section"] = json!("brown");
        assert_eq!(codes(theme(t), false), vec![("theme.brand_section", "format")]);
        // Unknown fields aren't settings.
        assert!(serde_json::from_value::<Theme>(json!({ "light": { "glow": "#ffffff" } })).is_err());
    }

    #[test]
    fn mixes_like_css() {
        assert_eq!(mix("#000000", "#ffffff", 50), "#808080");
        assert_eq!(mix("#38302d", "#fff5e6", 6), "#443c38");
        assert_eq!(mix("#292625", "#f7933a", 100), "#f7933a");
    }

    #[test]
    fn history_keeps_the_newest_ten() {
        let mut history = Vec::new();
        for i in 0..12 {
            remember(
                &mut history,
                ThemeVersion {
                    published_at: format!("{i}"),
                    by: None,
                    theme: Theme::default(),
                },
            );
        }
        assert_eq!(history.len(), 10);
        assert_eq!(history[0].published_at, "11");
    }
}
