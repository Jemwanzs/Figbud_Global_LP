//! One-time import of the ZiraHR website's home page into the Studio (P7-ZR1),
//! so its content is managed like every other product website's: edited as
//! blocks, approved, versioned and served by the product-site renderer (D16).
//!
//! The copy is exactly what `apps/zirahr-web` shows (src/i18n/en.ts). It is
//! published as version 1 only if ZiraHR has no pages yet, so work done in the
//! Studio is never overwritten; the audit marker means it never runs twice.

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::blocks::PageDoc;

fn id() -> String {
    Uuid::now_v7().simple().to_string()
}

/// The ZiraHR home page as typed blocks.
fn zirahr_home() -> Value {
    let modules = [
        (
            "Employee 360",
            "Onboarding, confirmation, promotion and departure in one complete record.",
        ),
        (
            "Payroll and compliance",
            "Rules-based, effective-dated payroll, with Kenya as the starting point.",
        ),
        (
            "Leave",
            "Requests, balances and approvals that flow without chasing.",
        ),
        (
            "Attendance",
            "Shifts, geofencing and clock-ins for teams on site and on the move.",
        ),
        (
            "Approvals",
            "Configurable approval chains that follow how your organisation works.",
        ),
        (
            "Performance",
            "Goals, reviews and progress, connected to the people record.",
        ),
        (
            "Collaboration",
            "Keep teams connected around the work they share.",
        ),
        (
            "Executive analytics",
            "Workforce insight for the people who lead the organisation.",
        ),
        (
            "Employee self-service",
            "Payslips, leave and personal details, available to every employee.",
        ),
        (
            "Reporting",
            "The reports HR, finance and leadership rely on, without spreadsheet work.",
        ),
    ];
    json!({
        "seo_title": "ZiraHR · People. Payroll. Progress. Connected.",
        "seo_description": "ZiraHR is the connected workforce platform from FigBud Global: employee records, rules-based payroll, leave, attendance and approvals in one configurable system.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "The Connected Workforce",
              "heading": "People. Payroll. Progress. Connected.",
              "lead": "People aren't spreadsheets. Your HR platform shouldn't treat them like one.",
              "primary": { "label": "Book a demo", "href": "/enquire" } },
            { "id": id(), "type": "feature_grid", "heading": "One platform for the whole employee journey",
              "intro": "From an employee's first day to their last, every record, approval and payslip lives in one configurable system.",
              "items": modules.iter().map(|(title, body)| json!({ "title": title, "body": body })).collect::<Vec<_>>() },
            { "id": id(), "type": "text", "heading": "Payroll you can stand behind",
              "body": "Statutory rules change during the year. ZiraHR calculates with the rules that applied on each date, so every period stays correct and explainable." },
            { "id": id(), "type": "call_to_action", "heading": "See ZiraHR with your own workflows",
              "body": "Tell us how your organisation runs payroll, leave and approvals, and we'll show you ZiraHR configured for it.",
              "cta": { "label": "Book a demo", "href": "/enquire" } }
        ]
    })
}

/// Imports ZiraHR's home page once (see the module docs).
pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let site: Option<Uuid> = sqlx::query_scalar(
        "SELECT s.id FROM sites s WHERE s.slug = 'zirahr' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = 'page.zirahr_imported')
            FOR UPDATE",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(site_id) = site else {
        return Ok(());
    };
    let has_pages: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pages WHERE site_id = $1)")
        .bind(site_id)
        .fetch_one(&mut *tx)
        .await?;
    let mut imported = None;
    if !has_pages {
        let document = zirahr_home();
        // The same validation as any page edited in the Studio.
        let doc: PageDoc = serde_json::from_value(document.clone())?;
        doc.validate().map_err(|e| format!("ZiraHR home page: {e:?}"))?;
        let (page, revision) = (Uuid::now_v7(), Uuid::now_v7());
        sqlx::query(
            "INSERT INTO pages (id, site_id, path, title, position, draft, published, published_revision, published_at)
             VALUES ($1, $2, '', 'Home', 0, $3, $3, $4, now())",
        )
        .bind(page)
        .bind(site_id)
        .bind(&document)
        .bind(revision)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO page_revisions (id, page_id, number, document, note, state, decided_at)
             VALUES ($1, $2, 1, $3, 'Imported from the ZiraHR website', 'published', now())",
        )
        .bind(revision)
        .bind(page)
        .bind(&document)
        .execute(&mut *tx)
        .await?;
        imported = Some(page);
    }
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, 'page.zirahr_imported', 'site', $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(site_id.to_string())
    .bind(json!({ "page": imported, "skipped": has_pages }))
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(imported = imported.is_some(), "ZiraHR home page import");
    Ok(())
}
