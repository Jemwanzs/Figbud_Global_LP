//! Performance budgets for builder-made pages (P7-G4): what a visitor's phone
//! downloads for a page, measured from the page as websites receive it
//! (shared content resolved, hidden sections left out). Going past a
//! warning is shown in the Studio; going past a limit stops the page being
//! submitted or approved until it's lighter.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

/// A phone about 390 CSS pixels wide at 2× density picks the first media
/// rendition at least this wide (`sizes` is `100vw` on phones).
const PHONE_WIDTH: i32 = 780;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Ok,
    Warn,
    Over,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    Count,
    Bytes,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Check {
    pub key: &'static str,
    pub label: &'static str,
    pub value: u64,
    pub warn: u64,
    pub limit: u64,
    pub unit: Unit,
    pub level: Level,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Budget {
    pub level: Level,
    pub checks: Vec<Check>,
}

impl Budget {
    pub fn over(&self) -> bool {
        self.level == Level::Over
    }
}

/// `(key, label, warn, limit, unit)` for each measure, in display order.
const BUDGETS: [(&str, &str, u64, u64, Unit); 5] = [
    ("sections", "Sections shown", 16, 30, Unit::Count),
    ("images", "Images", 6, 12, Unit::Count),
    (
        "image_bytes",
        "Image download on a phone",
        800 * 1024,
        2 * 1024 * 1024,
        Unit::Bytes,
    ),
    (
        "largest_image",
        "Largest image on a phone",
        250 * 1024,
        500 * 1024,
        Unit::Bytes,
    ),
    (
        "text_bytes",
        "Text and layout",
        50 * 1024,
        120 * 1024,
        Unit::Bytes,
    ),
];

/// The budget for measured values, in `BUDGETS` order.
pub fn judge(values: [u64; 5]) -> Budget {
    let checks: Vec<Check> = BUDGETS
        .iter()
        .zip(values)
        .map(|(&(key, label, warn, limit, unit), value)| Check {
            key,
            label,
            value,
            warn,
            limit,
            unit,
            level: if value > limit {
                Level::Over
            } else if value > warn {
                Level::Warn
            } else {
                Level::Ok
            },
        })
        .collect();
    let level = checks.iter().map(|c| c.level).max().unwrap_or(Level::Ok);
    Budget { level, checks }
}

/// Measures a rendered page (`PageDoc::render`, shared content resolved).
/// Hidden sections and unresolved shared items are never sent, so they
/// don't count; an image used twice downloads once.
pub async fn assess(pool: &PgPool, site_id: Uuid, rendered: &Value) -> Result<Budget, sqlx::Error> {
    let shown: Vec<&Value> = rendered["sections"]
        .as_array()
        .map(|s| {
            s.iter()
                .filter(|s| s["hidden"] != true && s["type"] != "shared")
                .collect()
        })
        .unwrap_or_default();
    let ids: Vec<Uuid> = shown
        .iter()
        .filter(|s| s["type"] == "image")
        .filter_map(|s| s["image_id"].as_str().and_then(|id| Uuid::parse_str(id).ok()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    #[derive(FromRow)]
    struct Weight {
        bytes: i64,
    }
    let weights: Vec<Weight> = if ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT COALESCE((SELECT octet_length(r.data) FROM media_renditions r
                               WHERE r.asset_id = m.id AND r.width >= $3 ORDER BY r.width LIMIT 1),
                             octet_length(m.data))::bigint AS bytes
               FROM media_assets m WHERE m.site_id = $1 AND m.id = ANY($2) AND m.archived_at IS NULL",
        )
        .bind(site_id)
        .bind(&ids)
        .bind(PHONE_WIDTH)
        .fetch_all(pool)
        .await?
    };
    let bytes = |w: &Weight| u64::try_from(w.bytes).unwrap_or(0);
    let text: usize = shown
        .iter()
        .filter(|s| s["type"] != "image")
        .map(|s| {
            // Websites show the rendered Markdown, not its source.
            let mut s = (*s).clone();
            if let Some(section) = s.as_object_mut().filter(|o| o.contains_key("body_html")) {
                section.remove("body");
            }
            s.to_string().len()
        })
        .sum();
    Ok(judge([
        shown.len() as u64,
        weights.len() as u64,
        weights.iter().map(bytes).sum(),
        weights.iter().map(bytes).max().unwrap_or(0),
        text as u64,
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_follow_warnings_and_limits() {
        let light = judge([5, 1, 120_000, 120_000, 8_000]);
        assert_eq!(light.level, Level::Ok);
        assert!(!light.over());

        let heavy = judge([17, 1, 120_000, 120_000, 8_000]);
        assert_eq!(heavy.level, Level::Warn);
        assert_eq!(heavy.checks[0].level, Level::Warn);

        let over = judge([5, 1, 120_000, 600 * 1024, 8_000]);
        assert!(over.over());
        assert_eq!(over.checks[3].key, "largest_image");
        assert_eq!(over.checks[3].level, Level::Over);
    }

    #[test]
    fn values_at_a_limit_are_within_it() {
        let budget = judge(BUDGETS.map(|b| b.3));
        assert!(budget.checks.iter().all(|c| c.level == Level::Warn));
    }
}
