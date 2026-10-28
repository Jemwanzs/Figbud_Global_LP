//! First-run brand profiles from the artwork FigBud supplied (docs/BRAND_ASSETS.md).
//!
//! For each website without a profile yet:
//! - `official` files (FigBud's supplied artwork, trimmed or an intact part
//!   cropped, never redrawn) are stored and **published** as revision 1;
//! - `proposed` files (recoloured theme variants, the Expense Now concept) are
//!   stored and placed in the **draft** only, so nothing proposed goes live
//!   until someone submits it and an owner or reviewer approves it.
//!
//! Websites that already have a profile are never touched again, so changes
//! made in the Studio are never overwritten.

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::{
    config::{BrandConfig, ThemePair},
    image::{Kind, process},
    store,
};

struct Seed {
    file: &'static str,
    bytes: &'static [u8],
    origin: &'static str,
}

macro_rules! seed {
    ($file:literal, $origin:literal) => {
        Seed {
            file: $file,
            bytes: include_bytes!(concat!("../../seed/brand/", $file)),
            origin: $origin,
        }
    };
}

/// Where each seeded file goes in the profile.
#[derive(Clone, Copy)]
enum Slot {
    Horizontal,
    Stacked,
    Symbol,
    Favicon,
    AppIcon,
    LibraryOnly,
}

struct Placed {
    seed: Seed,
    label: &'static str,
    slot: Slot,
    on_dark: bool,
    on_light: bool,
}

const fn placed(seed: Seed, label: &'static str, slot: Slot, on_dark: bool, on_light: bool) -> Placed {
    Placed {
        seed,
        label,
        slot,
        on_dark,
        on_light,
    }
}

fn plan(slug: &str) -> (&'static str, Vec<Placed>) {
    use Slot::*;
    match slug {
        "figbud" => (
            "FigBud Global",
            vec![
                placed(
                    seed!("figbud-horizontal-on-dark-official.png", "official"),
                    "FigBud logo (official, for dark backgrounds)",
                    Horizontal,
                    true,
                    false,
                ),
                placed(
                    seed!("figbud-symbol-on-dark-official.png", "official"),
                    "FigBud symbol (official, for dark backgrounds)",
                    Symbol,
                    true,
                    false,
                ),
                placed(
                    seed!("figbud-favicon-official.png", "official"),
                    "FigBud favicon (official symbol on a dark tile)",
                    Favicon,
                    false,
                    false,
                ),
                placed(
                    seed!("figbud-app-icon-official.png", "official"),
                    "FigBud app icon (official symbol on a dark tile)",
                    AppIcon,
                    false,
                    false,
                ),
                placed(
                    seed!("figbud-horizontal-on-light-proposed.png", "proposed"),
                    "FigBud logo for light backgrounds (proposed recolour)",
                    Horizontal,
                    false,
                    true,
                ),
                placed(
                    seed!("figbud-symbol-on-light-proposed.png", "proposed"),
                    "FigBud symbol for light backgrounds (proposed recolour)",
                    Symbol,
                    false,
                    true,
                ),
            ],
        ),
        "zirahr" => (
            "ZiraHR",
            vec![
                placed(
                    seed!("zirahr-symbol-official.png", "official"),
                    "ZiraHR symbol (official)",
                    Symbol,
                    true,
                    true,
                ),
                placed(
                    seed!("zirahr-favicon-official.png", "official"),
                    "ZiraHR favicon (official symbol)",
                    Favicon,
                    false,
                    false,
                ),
                placed(
                    seed!("zirahr-app-icon-official.png", "official"),
                    "ZiraHR app icon (official symbol on a dark tile)",
                    AppIcon,
                    false,
                    false,
                ),
                placed(
                    seed!("zirahr-supplied-incomplete.png", "official"),
                    "ZiraHR logo as supplied (incomplete: “HR” is cut off)",
                    LibraryOnly,
                    false,
                    false,
                ),
            ],
        ),
        "jasiri" => (
            "Jasiri LMS",
            vec![
                placed(
                    seed!("jasiri-horizontal-on-dark-official.png", "official"),
                    "Jasiri logo (official, for dark backgrounds)",
                    Horizontal,
                    true,
                    false,
                ),
                placed(
                    seed!("jasiri-horizontal-on-light-proposed.png", "proposed"),
                    "Jasiri logo for light backgrounds (proposed recolour)",
                    Horizontal,
                    false,
                    true,
                ),
            ],
        ),
        "expense_now" => (
            "Expense Now",
            vec![
                placed(
                    seed!("expense-now-horizontal-on-dark-proposed.svg", "proposed"),
                    "Expense Now logo concept (dark backgrounds)",
                    Horizontal,
                    true,
                    false,
                ),
                placed(
                    seed!("expense-now-horizontal-on-light-proposed.svg", "proposed"),
                    "Expense Now logo concept (light backgrounds)",
                    Horizontal,
                    false,
                    true,
                ),
                placed(
                    seed!("expense-now-stacked-on-dark-proposed.svg", "proposed"),
                    "Expense Now stacked concept (dark backgrounds)",
                    Stacked,
                    true,
                    false,
                ),
                placed(
                    seed!("expense-now-stacked-on-light-proposed.svg", "proposed"),
                    "Expense Now stacked concept (light backgrounds)",
                    Stacked,
                    false,
                    true,
                ),
                placed(
                    seed!("expense-now-symbol-proposed.svg", "proposed"),
                    "Expense Now symbol concept",
                    Symbol,
                    true,
                    true,
                ),
                placed(
                    seed!("expense-now-favicon-proposed.svg", "proposed"),
                    "Expense Now favicon concept",
                    Favicon,
                    false,
                    false,
                ),
            ],
        ),
        "ziwa" => ("Ziwa LMS", ziwa_files()),
        _ => ("", Vec::new()),
    }
}

/// The approved Ziwa LMS identity (owner-approved 28 Oct 2026), rebuilt as
/// vectors from the approved brand sheet by scripts/brand/ziwa/build.py.
fn ziwa_files() -> Vec<Placed> {
    use Slot::*;
    vec![
        placed(
            seed!("ziwa-horizontal-on-light-official.svg", "official"),
            "Ziwa LMS logo (approved, for light backgrounds)",
            Horizontal,
            false,
            true,
        ),
        placed(
            seed!("ziwa-horizontal-on-dark-official.svg", "official"),
            "Ziwa LMS logo (approved, for dark backgrounds)",
            Horizontal,
            true,
            false,
        ),
        placed(
            seed!("ziwa-symbol-official.svg", "official"),
            "Ziwa LMS symbol (approved)",
            Symbol,
            true,
            true,
        ),
        placed(
            seed!("ziwa-favicon-official.svg", "official"),
            "Ziwa LMS favicon (approved symbol)",
            Favicon,
            false,
            false,
        ),
        placed(
            seed!("ziwa-app-icon-official.svg", "official"),
            "Ziwa LMS app icon (approved symbol on a white tile)",
            AppIcon,
            false,
            false,
        ),
        placed(
            seed!("ziwa-horizontal-one-colour-official.svg", "official"),
            "Ziwa LMS logo, one colour (approved)",
            LibraryOnly,
            false,
            false,
        ),
        placed(
            seed!("ziwa-symbol-one-colour-official.svg", "official"),
            "Ziwa LMS symbol, one colour (approved)",
            LibraryOnly,
            false,
            false,
        ),
    ]
}

fn assign(config: &mut BrandConfig, slot: Slot, id: Uuid, on_dark: bool, on_light: bool) {
    let set = |pair: &mut ThemePair| {
        if on_dark {
            pair.on_dark = Some(id);
        }
        if on_light {
            pair.on_light = Some(id);
        }
    };
    match slot {
        Slot::Horizontal => set(&mut config.logos.horizontal),
        Slot::Stacked => set(&mut config.logos.stacked),
        Slot::Symbol => set(&mut config.logos.symbol),
        Slot::Favicon => config.favicon = Some(id),
        Slot::AppIcon => config.app_icon = Some(id),
        Slot::LibraryOnly => {}
    }
}

pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sites: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT s.id, s.slug FROM sites s WHERE NOT EXISTS (SELECT 1 FROM site_brands b WHERE b.site_id = s.id)",
    )
    .fetch_all(pool)
    .await?;
    for (site_id, slug) in sites {
        let (name, files) = plan(&slug);
        let mut published = BrandConfig::default_for(&slug);
        let mut draft = published.clone();
        for file in files {
            let kind = if file.seed.file.ends_with(".svg") {
                Kind::Svg
            } else {
                Kind::Png
            };
            let processed =
                process(file.seed.bytes, kind).map_err(|r| format!("{}: {}", file.seed.file, r.message()))?;
            let (_, id) = store(
                pool,
                site_id,
                &processed,
                file.label,
                name,
                file.seed.origin,
                None,
            )
            .await
            .map_err(|e| format!("{}: {e}", file.seed.file))?;
            if file.seed.origin == "official" {
                assign(&mut published, file.slot, id, file.on_dark, file.on_light);
            }
            assign(&mut draft, file.slot, id, file.on_dark, file.on_light);
        }
        let has_official = !published.asset_ids().is_empty();
        let draft_note = match slug.as_str() {
            "expense_now" => {
                Some("Proposed Expense Now logo concept: not approved. Review before submitting.")
            }
            _ if draft != published => {
                Some("Proposed light-background versions of the official logos: review before submitting.")
            }
            _ => None,
        };
        let mut tx = pool.begin().await?;
        let created = sqlx::query(
            "INSERT INTO site_brands (site_id, draft, draft_note) VALUES ($1, $2, $3) ON CONFLICT (site_id) DO NOTHING",
        )
        .bind(site_id)
        .bind(serde_json::to_value(&draft)?)
        .bind(draft_note)
        .execute(&mut *tx)
        .await?;
        if created.rows_affected() == 0 {
            // Another replica got there first.
            tx.rollback().await?;
            continue;
        }
        if has_official {
            let revision = Uuid::now_v7();
            let value = serde_json::to_value(&published)?;
            sqlx::query(
                "INSERT INTO brand_revisions (id, site_id, number, config, note, state, decided_at)
                 VALUES ($1, $2, 1, $3, 'Official logos supplied by FigBud', 'published', now())",
            )
            .bind(revision)
            .bind(site_id)
            .bind(&value)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE site_brands SET published = $2, published_revision = $3, published_at = now() WHERE site_id = $1",
            )
            .bind(site_id)
            .bind(&value)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query(
            "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
             VALUES ($1, 'brand.seeded', 'site', $2, $3, $4)",
        )
        .bind(Uuid::now_v7())
        .bind(site_id.to_string())
        .bind(json!({ "published_official": has_official }))
        .bind(site_id)
        .execute(&mut *tx)
        .await?;
        mark_icons_seeded(&mut tx, site_id, false).await?;
        if slug == "ziwa" {
            mark_ziwa_identity(&mut tx, site_id, false).await?;
        }
        tx.commit().await?;
        tracing::info!(%slug, has_official, "brand profile seeded");
    }
    upgrade_icons(pool).await?;
    upgrade_ziwa_identity(pool).await?;
    upgrade_figbud_palette(pool).await
}

/// The FigBud Global palette before 28 Oct 2026 (amber, copper).
const FIGBUD_AMBER: [&str; 3] = ["#f0a65d", "#a66538", "#f6bd82"];

/// One-time upgrade to the FigBud Global parent palette (emerald, electric
/// blue, violet; 28 Oct 2026). Only colours still at the old defaults change,
/// so a palette chosen in the Studio is kept; logos are never touched. The new
/// colours are published as a recorded revision and the audit marker means
/// it never runs twice.
async fn upgrade_figbud_palette(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let row: Option<(Uuid, Value, Option<Value>)> = sqlx::query_as(
        "SELECT b.site_id, b.draft, b.published FROM site_brands b JOIN sites s ON s.id = b.site_id
          WHERE s.slug = 'figbud' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = 'brand.figbud_palette_seeded')
            FOR UPDATE OF b",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some((site_id, draft, published)) = row else {
        return Ok(());
    };
    let already: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM audit_log WHERE site_id = $1 AND action = 'brand.figbud_palette_seeded')",
    )
    .bind(site_id)
    .fetch_one(&mut *tx)
    .await?;
    if already {
        // Another replica got there first.
        return Ok(());
    }
    let colors = BrandConfig::default_for("figbud").colors;
    let old = |c: &BrandConfig| {
        [&c.colors.primary, &c.colors.secondary, &c.colors.accent]
            .iter()
            .zip(FIGBUD_AMBER)
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
    };
    let mut published_changed = false;
    if let Some(mut config) = published.and_then(|v| serde_json::from_value::<BrandConfig>(v).ok())
        && old(&config)
    {
        config.colors = colors.clone();
        let value = serde_json::to_value(&config)?;
        let revision = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO brand_revisions (id, site_id, number, config, note, state, decided_at)
             VALUES ($1, $2, COALESCE((SELECT max(number) FROM brand_revisions WHERE site_id = $2), 0) + 1,
                     $3, 'FigBud Global parent palette: emerald, electric blue, violet', 'published', now())",
        )
        .bind(revision)
        .bind(site_id)
        .bind(&value)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE site_brands SET published = $2, published_revision = $3, published_at = now() WHERE site_id = $1",
        )
        .bind(site_id)
        .bind(&value)
        .bind(revision)
        .execute(&mut *tx)
        .await?;
        published_changed = true;
    }
    if let Ok(mut config) = serde_json::from_value::<BrandConfig>(draft)
        && old(&config)
    {
        config.colors = colors;
        sqlx::query(
            "UPDATE site_brands SET draft = $2, draft_version = draft_version + 1, draft_updated_at = now()
              WHERE site_id = $1",
        )
        .bind(site_id)
        .bind(serde_json::to_value(&config)?)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, 'brand.figbud_palette_seeded', 'site', $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id.to_string())
    .bind(json!({ "published": published_changed }))
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(published_changed, "FigBud Global palette applied");
    Ok(())
}

async fn mark_ziwa_identity(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    site_id: Uuid,
    published: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, 'brand.ziwa_identity_seeded', 'site', $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id.to_string())
    .bind(json!({ "published": published }))
    .bind(site_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// One-time upgrade for databases seeded with the earlier Ziwa concept. The
/// owner approved the Ziwa LMS identity on 28 Oct 2026, so its files are
/// stored and published as a recorded revision (logos, favicon, app icon and
/// colours); the concept draft is replaced, a pending brand change it
/// supersedes is withdrawn and the concept files are archived. The audit
/// marker means it never runs twice, so later Studio changes are kept.
async fn upgrade_ziwa_identity(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pending: Option<Uuid> = sqlx::query_scalar(
        "SELECT s.id FROM sites s JOIN site_brands b ON b.site_id = s.id
          WHERE s.slug = 'ziwa' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = 'brand.ziwa_identity_seeded')",
    )
    .fetch_optional(pool)
    .await?;
    let Some(site_id) = pending else {
        return Ok(());
    };
    let mut placed = Vec::new();
    for file in ziwa_files() {
        let processed = process(file.seed.bytes, Kind::Svg)
            .map_err(|r| format!("{}: {}", file.seed.file, r.message()))?;
        let (_, id) = store(
            pool,
            site_id,
            &processed,
            file.label,
            "Ziwa LMS",
            file.seed.origin,
            None,
        )
        .await
        .map_err(|e| format!("{}: {e}", file.seed.file))?;
        placed.push((file.slot, id, file.on_dark, file.on_light));
    }

    let mut tx = pool.begin().await?;
    let current: Option<Value> =
        sqlx::query_scalar("SELECT published FROM site_brands WHERE site_id = $1 FOR UPDATE")
            .bind(site_id)
            .fetch_one(&mut *tx)
            .await?;
    let already: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM audit_log WHERE site_id = $1 AND action = 'brand.ziwa_identity_seeded')",
    )
    .bind(site_id)
    .fetch_one(&mut *tx)
    .await?;
    if already {
        // Another replica got there first.
        tx.rollback().await?;
        return Ok(());
    }
    let defaults = BrandConfig::default_for("ziwa");
    let mut config = current
        .and_then(|v| serde_json::from_value::<BrandConfig>(v).ok())
        .unwrap_or_else(|| defaults.clone());
    config.logos = Default::default();
    config.colors = defaults.colors;
    for (slot, id, on_dark, on_light) in placed {
        assign(&mut config, slot, id, on_dark, on_light);
    }
    let value = serde_json::to_value(&config)?;
    sqlx::query(
        "UPDATE brand_revisions SET state = 'cancelled', decided_at = now(),
                decision_note = 'Superseded by the approved Ziwa LMS identity'
          WHERE site_id = $1 AND state = 'pending'",
    )
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    let revision = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO brand_revisions (id, site_id, number, config, note, state, decided_at)
         VALUES ($1, $2, COALESCE((SELECT max(number) FROM brand_revisions WHERE site_id = $2), 0) + 1,
                 $3, 'Approved Ziwa LMS identity (approved by the owner, 28 Oct 2026)', 'published', now())",
    )
    .bind(revision)
    .bind(site_id)
    .bind(&value)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE site_brands SET published = $2, published_revision = $3, published_at = now(),
                draft = $2, draft_note = NULL, draft_version = draft_version + 1, draft_updated_at = now()
          WHERE site_id = $1",
    )
    .bind(site_id)
    .bind(&value)
    .bind(revision)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE brand_assets SET archived_at = now() WHERE site_id = $1 AND origin = 'proposed' AND archived_at IS NULL")
        .bind(site_id)
        .execute(&mut *tx)
        .await?;
    mark_ziwa_identity(&mut tx, site_id, true).await?;
    tx.commit().await?;
    tracing::info!("approved Ziwa LMS identity published");
    Ok(())
}

async fn mark_icons_seeded(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    site_id: Uuid,
    published: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, 'brand.icons_seeded', 'site', $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id.to_string())
    .bind(json!({ "published": published }))
    .bind(site_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// One-time upgrade for profiles seeded before favicons and app icons
/// existed: adds the official icons where none was ever set and publishes
/// that as a recorded revision. The audit marker means it never runs twice,
/// so an icon an admin later removes is not brought back.
async fn upgrade_icons(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for slug in ["figbud", "zirahr"] {
        let pending: Option<Uuid> = sqlx::query_scalar(
            "SELECT s.id FROM sites s JOIN site_brands b ON b.site_id = s.id
              WHERE s.slug = $1 AND NOT EXISTS (
                    SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = 'brand.icons_seeded')",
        )
        .bind(slug)
        .fetch_optional(pool)
        .await?;
        let Some(site_id) = pending else { continue };
        let (name, files) = plan(slug);
        let mut icons = Vec::new();
        for file in files
            .into_iter()
            .filter(|f| matches!(f.slot, Slot::Favicon | Slot::AppIcon))
        {
            let processed = process(file.seed.bytes, Kind::Png)
                .map_err(|r| format!("{}: {}", file.seed.file, r.message()))?;
            let (_, id) = store(
                pool,
                site_id,
                &processed,
                file.label,
                name,
                file.seed.origin,
                None,
            )
            .await
            .map_err(|e| format!("{}: {e}", file.seed.file))?;
            icons.push((file.slot, id));
        }
        let fill = |config: &mut BrandConfig| {
            let mut changed = false;
            for (slot, id) in &icons {
                let target = match slot {
                    Slot::Favicon => &mut config.favicon,
                    _ => &mut config.app_icon,
                };
                if target.is_none() {
                    *target = Some(*id);
                    changed = true;
                }
            }
            changed
        };

        let mut tx = pool.begin().await?;
        let row: (Value, Option<Value>) =
            sqlx::query_as("SELECT draft, published FROM site_brands WHERE site_id = $1 FOR UPDATE")
                .bind(site_id)
                .fetch_one(&mut *tx)
                .await?;
        let already: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM audit_log WHERE site_id = $1 AND action = 'brand.icons_seeded')",
        )
        .bind(site_id)
        .fetch_one(&mut *tx)
        .await?;
        if already {
            tx.rollback().await?;
            continue;
        }
        let mut published_changed = false;
        if let Some(mut published) = row.1.and_then(|v| serde_json::from_value::<BrandConfig>(v).ok())
            && fill(&mut published)
        {
            let value = serde_json::to_value(&published)?;
            let revision = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO brand_revisions (id, site_id, number, config, note, state, decided_at)
                 VALUES ($1, $2, COALESCE((SELECT max(number) FROM brand_revisions WHERE site_id = $2), 0) + 1,
                         $3, 'Favicon and app icon from the official symbol', 'published', now())",
            )
            .bind(revision)
            .bind(site_id)
            .bind(&value)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE site_brands SET published = $2, published_revision = $3, published_at = now() WHERE site_id = $1",
            )
            .bind(site_id)
            .bind(&value)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
            published_changed = true;
        }
        if let Ok(mut draft) = serde_json::from_value::<BrandConfig>(row.0)
            && fill(&mut draft)
        {
            sqlx::query(
                "UPDATE site_brands SET draft = $2, draft_version = draft_version + 1, draft_updated_at = now()
                  WHERE site_id = $1",
            )
            .bind(site_id)
            .bind(serde_json::to_value(&draft)?)
            .execute(&mut *tx)
            .await?;
        }
        mark_icons_seeded(&mut tx, site_id, published_changed).await?;
        tx.commit().await?;
        tracing::info!(%slug, published_changed, "brand icons added");
    }
    Ok(())
}
