//! Device experience (owner's brief, 20 Nov 2026, P14-W8): how each website
//! shows its product in desktop, tablet and phone frames.
//!
//! - Website level, in the website's settings (drafted and published like
//!   them, audited, with the last published versions kept for rollback):
//!   which devices, the device shown, whether visitors may switch, whether
//!   changes are animated, whether a page's previews follow each other,
//!   the frame for each device, how screenshots fit and align, and what to
//!   do when a device has no screenshot. The approved defaults: all three
//!   devices, Phone shown, switching, transitions and synchronised previews
//!   off.
//! - Section level (`blocks::DevicePreview`): each section's screenshots,
//!   and either the website's settings (inherit, the default) or its own.
//! - Until a website publishes device settings, its sections keep their own
//!   (as before), so nothing changes on a website by itself.

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{error::FieldError, pages::blocks::Device};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DesktopFrame {
    /// A browser window with its address bar.
    #[default]
    Browser,
    /// A laptop: screen, thin bezel and base.
    Laptop,
    /// A desktop monitor on its stand.
    Monitor,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TabletFrame {
    Portrait,
    #[default]
    Landscape,
    Minimal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PhoneFrame {
    #[default]
    Portrait,
    Landscape,
    /// A rounded outline with the browser bar.
    Minimal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImageFit {
    /// Fills the screen; the bottom may be cut (top kept).
    #[default]
    Cover,
    /// The whole screenshot, with space around it if its shape differs.
    Contain,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImageAlign {
    #[default]
    Top,
    Center,
}

/// When the device shown has no screenshot.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Fallback {
    /// Show the next device that has one.
    #[default]
    NextDevice,
    /// Show nothing.
    Hide,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct Frames {
    pub desktop: DesktopFrame,
    pub tablet: TabletFrame,
    pub phone: PhoneFrame,
}

impl Default for Frames {
    fn default() -> Self {
        Self {
            desktop: DesktopFrame::Browser,
            tablet: TabletFrame::Landscape,
            phone: PhoneFrame::Portrait,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct DeviceExperience {
    pub enabled: bool,
    pub devices: Vec<Device>,
    pub default_device: Device,
    /// Visitors may switch devices (buttons). Off: only the device shown, no controls.
    pub visitor_switching: bool,
    /// Fades between devices (only when visitors may switch).
    pub transitions: bool,
    /// With switching on: every device preview on a page follows the
    /// visitor's choice in any one of them.
    pub synchronized_previews: bool,
    pub frames: Frames,
    pub fit: ImageFit,
    pub align: ImageAlign,
    pub fallback: Fallback,
}

impl Default for DeviceExperience {
    /// The owner's approved starting point (20 Nov 2026).
    fn default() -> Self {
        Self {
            enabled: true,
            devices: vec![Device::Desktop, Device::Tablet, Device::Phone],
            default_device: Device::Phone,
            visitor_switching: false,
            transitions: false,
            synchronized_previews: false,
            frames: Frames::default(),
            fit: ImageFit::Cover,
            align: ImageAlign::Top,
            fallback: Fallback::NextDevice,
        }
    }
}

/// A published device experience, kept for rollback (newest first, up to 10).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DeviceVersion {
    pub published_at: String,
    pub by: Option<String>,
    pub devices: DeviceExperience,
}

pub fn remember(history: &mut Vec<DeviceVersion>, devices: &DeviceExperience, by: Option<String>) {
    history.insert(
        0,
        DeviceVersion {
            published_at: Utc::now().to_rfc3339(),
            by,
            devices: devices.clone(),
        },
    );
    history.truncate(10);
}

pub fn check(e: &mut Vec<FieldError>, d: &DeviceExperience, field: &'static str) {
    let mut seen = std::collections::HashSet::new();
    if d.devices.is_empty() || !d.devices.iter().all(|x| seen.insert(*x)) {
        e.push(FieldError {
            field,
            code: "devices",
            message: "Choose each device once, at least one.",
        });
    } else if !d.devices.contains(&d.default_device) {
        e.push(FieldError {
            field,
            code: "default",
            message: "The device shown must be one of the enabled devices.",
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_approved_defaults_and_their_checks() {
        let d = DeviceExperience::default();
        assert_eq!(d.default_device, Device::Phone);
        assert!(!d.visitor_switching && !d.transitions && !d.synchronized_previews);
        assert_eq!(d.devices.len(), 3);
        let mut e = Vec::new();
        check(&mut e, &d, "devices");
        assert!(e.is_empty());
        let no_phone = DeviceExperience {
            devices: vec![Device::Desktop],
            ..DeviceExperience::default()
        };
        check(&mut e, &no_phone, "devices");
        assert_eq!(e.len(), 1, "the device shown must be enabled");
        let mut h = Vec::new();
        for _ in 0..12 {
            remember(&mut h, &d, None);
        }
        assert_eq!(h.len(), 10);
    }
}
