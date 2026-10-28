//! The brand profile document (`site_brands.draft` / `published`) and its
//! guard rails. Logos are references to immutable assets in the library;
//! colours are hex values checked for contrast against both site themes.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::error::FieldError;

/// Background colours of the shared site themes (packages/brand/src/tokens.css).
pub const DARK_BACKGROUND: &str = "#020617";
pub const LIGHT_BACKGROUND: &str = "#f8fafc";
pub const LOGO_HEIGHT: std::ops::RangeInclusive<u8> = 20..=48;

/// One logo slot: the file for dark backgrounds and the file for light ones.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThemePair {
    #[serde(default)]
    pub on_dark: Option<Uuid>,
    #[serde(default)]
    pub on_light: Option<Uuid>,
}

impl ThemePair {
    fn ids(&self) -> impl Iterator<Item = Uuid> + '_ {
        self.on_dark.iter().chain(self.on_light.iter()).copied()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Logos {
    #[serde(default)]
    pub horizontal: ThemePair,
    #[serde(default)]
    pub stacked: ThemePair,
    #[serde(default)]
    pub symbol: ThemePair,
    #[serde(default)]
    pub wordmark: ThemePair,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Colors {
    pub primary: String,
    pub secondary: String,
    pub accent: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BrandConfig {
    #[serde(default)]
    pub logos: Logos,
    #[serde(default)]
    pub favicon: Option<Uuid>,
    #[serde(default)]
    pub app_icon: Option<Uuid>,
    #[serde(default)]
    pub social_image: Option<Uuid>,
    pub colors: Colors,
    /// Header logo height in CSS pixels; other placements scale from it.
    pub logo_height: u8,
}

/// Where an asset is used, for the library's "used in" list.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Placement {
    pub slot: &'static str,
    pub theme: Option<&'static str>,
}

impl BrandConfig {
    /// The starting profile for a website: its current token colours, no logos.
    pub fn default_for(slug: &str) -> Self {
        let (primary, secondary, accent) = match slug {
            // The FigBud Global parent palette: emerald, electric blue, violet.
            "figbud" => ("#22c55e", "#3b82f6", "#a855f7"),
            "zirahr" => ("#22d3ee", "#0891b2", "#11e6ff"),
            "jasiri" => ("#22c55e", "#7c3aed", "#4ade80"),
            "expense_now" => ("#f97316", "#ea580c", "#fdba74"),
            // The approved Ziwa LMS palette: primary blue, primary green, gold accent.
            "ziwa" => ("#0b6edb", "#10b981", "#c9a87a"),
            _ => ("#22c55e", "#3b82f6", "#a855f7"),
        };
        Self {
            logos: Logos::default(),
            favicon: None,
            app_icon: None,
            social_image: None,
            colors: Colors {
                primary: primary.into(),
                secondary: secondary.into(),
                accent: accent.into(),
            },
            logo_height: 32,
        }
    }

    pub fn asset_ids(&self) -> Vec<Uuid> {
        let l = &self.logos;
        let mut ids: Vec<Uuid> = l
            .horizontal
            .ids()
            .chain(l.stacked.ids())
            .chain(l.symbol.ids())
            .chain(l.wordmark.ids())
            .chain(self.favicon)
            .chain(self.app_icon)
            .chain(self.social_image)
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }

    pub fn placements(&self, id: Uuid) -> Vec<Placement> {
        let mut out = Vec::new();
        let l = &self.logos;
        for (slot, pair) in [
            ("horizontal", &l.horizontal),
            ("stacked", &l.stacked),
            ("symbol", &l.symbol),
            ("wordmark", &l.wordmark),
        ] {
            if pair.on_dark == Some(id) {
                out.push(Placement {
                    slot,
                    theme: Some("dark"),
                });
            }
            if pair.on_light == Some(id) {
                out.push(Placement {
                    slot,
                    theme: Some("light"),
                });
            }
        }
        for (slot, value) in [
            ("favicon", self.favicon),
            ("app_icon", self.app_icon),
            ("social_image", self.social_image),
        ] {
            if value == Some(id) {
                out.push(Placement { slot, theme: None });
            }
        }
        out
    }

    /// Shape checks that need no database. Colours are normalised to lower case.
    pub fn normalise(mut self) -> Result<Self, Vec<FieldError>> {
        let mut errors = Vec::new();
        for (field, value) in [
            ("colors.primary", &mut self.colors.primary),
            ("colors.secondary", &mut self.colors.secondary),
            ("colors.accent", &mut self.colors.accent),
        ] {
            *value = value.trim().to_ascii_lowercase();
            if parse_hex(value).is_none() {
                errors.push(FieldError {
                    field,
                    code: "format",
                    message: "Use a six-digit hex colour such as #22d3ee.",
                });
            }
        }
        if !LOGO_HEIGHT.contains(&self.logo_height) {
            errors.push(FieldError {
                field: "logo_height",
                code: "range",
                message: "Logo height must be between 20 and 48 pixels.",
            });
        }
        if errors.is_empty() { Ok(self) } else { Err(errors) }
    }

    /// Readiness checks shown in the Studio. `required` checks block publishing.
    pub fn checks(&self) -> Vec<Value> {
        let primary = &self.colors.primary;
        let on_dark = contrast(primary, DARK_BACKGROUND).unwrap_or(0.0);
        let on_light = contrast(primary, LIGHT_BACKGROUND).unwrap_or(0.0);
        let l = &self.logos;
        let has_dark_logo = l.horizontal.on_dark.is_some() || l.symbol.on_dark.is_some();
        let has_light_logo = l.horizontal.on_light.is_some() || l.symbol.on_light.is_some();
        vec![
            json!({
                "id": "logo_on_dark", "required": true, "ok": has_dark_logo,
                "label": "A horizontal or symbol logo for dark backgrounds (the default theme)",
            }),
            json!({
                "id": "logo_on_light", "required": false, "ok": has_light_logo,
                "label": "A logo for light backgrounds (otherwise the light theme shows the dark-background logo on a dark plate)",
            }),
            json!({
                "id": "primary_on_dark", "required": true, "ok": on_dark >= 3.0, "ratio": round(on_dark),
                "label": "Primary colour stands out on the dark theme (at least 3:1)",
            }),
            json!({
                "id": "primary_on_light", "required": false, "ok": on_light >= 3.0, "ratio": round(on_light),
                "label": "Primary colour stands out on the light theme (at least 3:1; darker shades are used for text)",
            }),
        ]
    }

    pub fn publishable(&self) -> bool {
        self.checks()
            .iter()
            .all(|c| c["ok"] == true || c["required"] == false)
    }
}

fn round(ratio: f64) -> f64 {
    (ratio * 100.0).round() / 100.0
}

pub fn parse_hex(value: &str) -> Option<[u8; 3]> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some([byte(0)?, byte(2)?, byte(4)?])
}

fn luminance([r, g, b]: [u8; 3]) -> f64 {
    let channel = |c: u8| {
        let c = c as f64 / 255.0;
        if c <= 0.03928 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/// WCAG 2 contrast ratio between two hex colours.
pub fn contrast(a: &str, b: &str) -> Option<f64> {
    let (la, lb) = (luminance(parse_hex(a)?), luminance(parse_hex(b)?));
    let (hi, lo) = if la > lb { (la, lb) } else { (lb, la) };
    Some((hi + 0.05) / (lo + 0.05))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contrast_matches_wcag() {
        assert!((contrast("#000000", "#ffffff").unwrap() - 21.0).abs() < 0.01);
        assert!((contrast("#777777", "#ffffff").unwrap() - 4.48).abs() < 0.01);
        assert_eq!(contrast("#12345", "#ffffff"), None);
    }

    #[test]
    fn defaults_pass_the_colour_checks_but_need_a_logo() {
        for slug in ["figbud", "zirahr", "jasiri", "expense_now", "ziwa"] {
            let config = BrandConfig::default_for(slug);
            let checks = config.checks();
            assert_eq!(checks[2]["ok"], true, "{slug} primary on dark");
            assert!(!config.publishable(), "{slug} has no logo yet");
        }
    }

    #[test]
    fn normalise_rejects_bad_colours_and_sizes() {
        let mut config = BrandConfig::default_for("zirahr");
        config.colors.primary = " #22D3EE ".into();
        assert_eq!(config.clone().normalise().unwrap().colors.primary, "#22d3ee");
        config.colors.accent = "cyan".into();
        config.logo_height = 90;
        let fields: Vec<&str> = config.normalise().unwrap_err().iter().map(|e| e.field).collect();
        assert_eq!(fields, vec!["colors.accent", "logo_height"]);
    }

    #[test]
    fn placements_and_ids() {
        let id = Uuid::now_v7();
        let mut config = BrandConfig::default_for("jasiri");
        config.logos.horizontal.on_dark = Some(id);
        config.favicon = Some(id);
        assert_eq!(config.asset_ids(), vec![id]);
        assert_eq!(
            config.placements(id),
            vec![
                Placement {
                    slot: "horizontal",
                    theme: Some("dark")
                },
                Placement {
                    slot: "favicon",
                    theme: None
                }
            ]
        );
        assert!(config.publishable());
    }

    #[test]
    fn unknown_fields_are_refused() {
        let value = json!({ "colors": { "primary": "#000000", "secondary": "#000000", "accent": "#000000" },
                            "logo_height": 32, "custom_css": "body{}" });
        assert!(serde_json::from_value::<BrandConfig>(value).is_err());
    }
}
