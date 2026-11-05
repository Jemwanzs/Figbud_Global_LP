//! ZiraHR's website content from the Website Content & Developer Guide (5 Nov
//! 2026), loaded once at start-up (P14-W) and, on the owner's instruction of the
//! same date, published once (`launch`). Anything a person has since edited in
//! the Studio is left alone.
//!
//! - The owner confirmed the guide's modules, so they're listed as available.
//! - Left out: reward amounts (none are approved), testimonials and client logos
//!   without permission, outsourcing or consultancy, and mobile-app claims.

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::blocks::PageDoc;
use crate::site_settings::{Link, WebsiteSettings};

const ACTION: &str = "page.zirahr_guide_drafted";

fn id() -> String {
    Uuid::new_v4().simple().to_string()
}

fn demo_cta() -> Value {
    json!({ "label": "Book a demo", "href": "/enquire" })
}

fn home() -> Value {
    json!({
        "seo_title": "ZiraHR · HR Simplified. Business Amplified.",
        "seo_description": "ZiraHR is cloud HR and payroll software: employee records, leave, payroll, attendance and performance in one connected platform.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "HR Simplified. Business Amplified.",
              "heading": "Your people. Your payroll. One smarter way to work.",
              "lead": "Meet ZiraHR: the connected HR platform that brings employee records, leave, payroll, attendance and performance together, so your team can spend less time chasing processes and more time moving forward.",
              "primary": demo_cta(),
              "secondary": { "label": "Explore the platform", "href": "/platform" } },
            { "id": id(), "type": "demo", "demo": "connected_modules",
              "heading": "Eight connected modules. One smarter workspace.",
              "intro": "No more scattered files, disconnected approvals or last-minute payroll panic. Bring your everyday people operations into one dependable workspace." },
            { "id": id(), "type": "demo", "demo": "payslip",
              "heading": "Payroll day, minus the drama.",
              "intro": "Bring earnings, deductions, reviews, approvals and reporting into a controlled workflow, built for accuracy, visibility and accountability." },
            { "id": id(), "type": "feature_grid", "heading": "Made for the way real teams work.",
              "intro": "Whether you run one office or several branches, ZiraHR gives HR, managers and employees the right information at the right moment.",
              "items": [
                  { "title": "Many branches, one view", "body": "Built for multiple branches, departments and operating regions." },
                  { "title": "Approvals that follow you", "body": "Configurable approvals that follow your organisation." },
                  { "title": "Connected workflows", "body": "Payroll, leave and attendance work from the same records." },
                  { "title": "Self-service in a browser", "body": "On phone, tablet or desktop, with no app to install." },
                  { "title": "Answers, not exports", "body": "Actionable dashboards, reports and role-based access." },
              ] },
            { "id": id(), "type": "demo", "demo": "pay_run",
              "heading": "Every run, in the open.",
              "intro": "Guided payroll cycles with role-based approvals, comments, flags and audit trails." },
            { "id": id(), "type": "call_to_action", "heading": "Know the numbers before payday.",
              "body": "Explore a transparent Kenyan payroll estimate in either direction, with every step visible.",
              "cta": { "label": "Calculate my pay", "href": "/payroll-calculator" } },
            { "id": id(), "type": "call_to_action", "heading": "Ready to give HR its time back?",
              "body": "Tell us what is slowing your team down. We'll show you a clearer, more connected way forward.",
              "cta": demo_cta() },
        ],
    })
}

fn module(title: &str, headline: &str, body: &str, bullets: &[&str], availability: &str) -> Value {
    json!({ "title": title, "headline": headline, "body": body, "bullets": bullets, "availability": availability })
}

fn platform() -> Value {
    json!({
        "seo_title": "The ZiraHR platform: HR, payroll, leave and attendance",
        "seo_description": "Explore ZiraHR's modules: Core HR, payroll with statutory rules, leave, time and attendance, performance and employee self-service in your browser.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "The platform",
              "heading": "Everything your people operations run on.",
              "lead": "One cloud platform for employee records, pay, time and growth, with self-service in any web browser.",
              "primary": demo_cta() },
            { "id": id(), "type": "modules", "heading": "Choose a module",
              "items": [
                  module("Core HR & Employee 360", "Every employee story, all in one place.",
                      "From a new hire's first day to their next big milestone, keep employee information organised, accessible and protected.",
                      &["Complete profiles, emergency contacts and next of kin",
                        "Employment types, job history, promotions and transfers",
                        "Contracts, IDs, certificates, HR letters and expiry alerts",
                        "Onboarding, probation, salary history, suspension and exits"], "available"),
                  module("Payroll & Statutory Compliance", "Payroll day, minus the drama.",
                      "Bring earnings, deductions, reviews, approvals and reporting into a controlled payroll workflow.",
                      &["Cash and non-cash benefits, allowances, bonuses and overtime",
                        "Taxable treatment and statutory rules by component",
                        "Statutory and custom deductions, schedules and bulk uploads",
                        "Guided cycles with approvals, comments, flags and audit trails",
                        "Lock completed payroll and review costs by branch or project"], "available"),
                  module("Leave Management", "Time off, without the back-and-forth.",
                      "A simple way to request leave, a faster way to approve it, and a clear picture of who's available.",
                      &["Self-service requests through the web portal",
                        "Visible balances and request history",
                        "Single- or multi-stage approval routes and notifications",
                        "Policy checks, overlap warnings and holiday-aware calendars"], "available"),
                  module("Time & Attendance", "Know the hours. Keep the whole team in sync.",
                      "Turn clock-ins, shifts and overtime into clear workforce information, without the manual chase.",
                      &["Browser-based attendance, with location checks where configured",
                        "Biometric device integrations where supported",
                        "Working hours, late arrivals and absence insights",
                        "Supervisor-approved overtime with payroll handoff"], "available"),
                  module("Performance Management", "Big goals. Clear progress. Better conversations.",
                      "Make performance a continuous conversation with aligned objectives, structured reviews and useful insights.",
                      &["Company, department and individual goals with KPIs",
                        "Self-assessments, evidence and manager feedback",
                        "Configurable review and approval workflows",
                        "Weighted scoring and team-level trends"], "available"),
                  module("Teams & Collaboration", "One team. Less chasing. More doing.",
                      "Keep conversations, tasks and approvals moving together, without losing the thread.",
                      &["Team and department workspaces",
                        "Task ownership, status and due dates",
                        "Comments, mentions and activity notifications"], "available"),
                  module("Recruitment", "Great hires start with a smoother journey.",
                      "Move from vacancy to shortlist to onboarding in one connected hiring flow.",
                      &["Vacancy and requisition tracking",
                        "Applicant pipeline, screening and interview stages",
                        "Turn successful candidates into employee records"], "available"),
                  module("Learning & Development", "Skills grow. So does your team.",
                      "Give learning, training and development plans a clear place in the employee journey.",
                      &["Learning plans linked to employee profiles",
                        "Skills, competency and development goals",
                        "Completion evidence and learning history"], "available"),
              ] },
            { "id": id(), "type": "demo", "demo": "team_calendar",
              "heading": "See who's out, before you approve.",
              "intro": "Holiday-aware calendars leave weekends and public holidays out of the count, and overlapping requests are flagged." },
            { "id": id(), "type": "demo", "demo": "leave_flow",
              "heading": "Time off, without the back-and-forth.",
              "intro": "Requests follow single- or multi-stage approval routes, and balances update when they're approved. Try it." },
            { "id": id(), "type": "demo", "demo": "outputs",
              "heading": "What a finished run gives you.",
              "intro": "Lock completed payroll, generate reports and review costs. Employees get what's theirs in self-service." },
            { "id": id(), "type": "demo", "demo": "rules",
              "heading": "Payroll rules you can see.",
              "intro": "Statutory rules change during the year. ZiraHR keeps them as dated settings, so each run uses the rules that applied at the time." },
            { "id": id(), "type": "demo", "demo": "self_service",
              "heading": "Your workday, one browser tab away.",
              "intro": "Payslips, P9 forms, leave requests, documents and updates, securely in your web browser, at your desk or on your phone. Salary advances too, where enabled. No app download needed." },
            { "id": id(), "type": "call_to_action", "heading": "See ZiraHR in action",
              "body": "Tell us how your organisation runs payroll, leave and approvals, and we'll show you ZiraHR with your own workflows in mind.",
              "cta": demo_cta() },
        ],
    })
}

fn about() -> Value {
    json!({
        "seo_title": "About ZiraHR",
        "seo_description": "ZiraHR makes people operations simpler, clearer and more connected: cloud HR and payroll software from FigBud Global.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "About ZiraHR",
              "heading": "HR should move people forward, not hold them back.",
              "lead": "ZiraHR is built around a simple belief: when people operations work better, teams can do more. We bring everyday HR activities into one connected platform, so organisations can spend less time managing complexity and more time supporting their people." },
            { "id": id(), "type": "feature_grid", "items": [
                  { "title": "Our mission", "body": "Make people operations simpler, clearer and more connected." },
                  { "title": "Our approach", "body": "Practical automation, thoughtful design and workflows that fit how organisations work." },
                  { "title": "Our promise", "body": "Build for clarity, flexibility and responsible handling of workforce information." },
              ] },
            { "id": id(), "type": "call_to_action", "heading": "Meet the platform",
              "cta": { "label": "Explore the platform", "href": "/platform" } },
        ],
    })
}

fn contact() -> Value {
    json!({
        "seo_title": "Contact ZiraHR and book a demo",
        "seo_description": "Have a payroll challenge, a growing workforce or a process to simplify? Book a ZiraHR demo or send an enquiry.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "Contact and demo",
              "heading": "Tell us what your team needs. We'll take it from there.",
              "lead": "Have a payroll challenge, a growing workforce or a process you want to simplify? Start the conversation with the ZiraHR team.",
              "primary": demo_cta() },
            { "id": id(), "type": "steps", "heading": "What happens next",
              "items": [
                  { "title": "Tell us about your team", "body": "A short form: your details, your team's size and what's slowing you down." },
                  { "title": "We get back to you", "body": "The ZiraHR team reads your enquiry and replies." },
                  { "title": "See it with your workflows", "body": "A demo shaped around how your organisation works." },
              ] },
            { "id": id(), "type": "call_to_action", "heading": "Ready when you are", "cta": demo_cta() },
        ],
    })
}

fn refer() -> Value {
    json!({
        "seo_title": "Refer & earn with ZiraHR",
        "seo_description": "Know a business that could work smarter? Introduce them to ZiraHR and earn once the deal has closed.",
        "sections": [
            { "id": id(), "type": "hero", "eyebrow": "Refer & earn",
              "heading": "Know a business that could work smarter?",
              "lead": "Start with the people you know. Introduce a team that needs better HR or payroll, and you earn once we've closed the deal." },
            { "id": id(), "type": "steps", "heading": "How it works",
              "items": [
                  { "title": "Tell us who to talk to", "body": "Enter the business's details below." },
                  { "title": "We take it from there", "body": "Our team reviews the introduction and arranges a conversation or a demo." },
                  { "title": "Follow the deal", "body": "Keep your reference, and call us any time for an update." },
                  { "title": "Earn when it closes", "body": "You earn only after the deal has closed." },
              ] },
            { "id": id(), "type": "referral_form", "heading": "Submit a referral", "contact_phone": null },
        ],
    })
}

/// Drafts the guide's content once (see the module docs).
pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let site: Option<(Uuid, Value)> = sqlx::query_as(
        "SELECT s.id, s.settings FROM sites s WHERE s.slug = 'zirahr' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = $1)
            FOR UPDATE",
    )
    .bind(ACTION)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((site_id, settings)) = site else {
        return Ok(());
    };

    let mut created = Vec::new();
    for (position, path, title, document, in_nav) in [
        (1, "platform", "Platform", platform(), true),
        (2, "about", "About", about(), true),
        (3, "contact", "Contact & Demo", contact(), true),
    ] {
        let doc: PageDoc = serde_json::from_value(document.clone())?;
        doc.validate().map_err(|e| format!("ZiraHR {path} page: {e:?}"))?;
        // Never over a page someone already made at this address.
        let added = sqlx::query(
            "INSERT INTO pages (id, site_id, path, title, position, draft, show_in_nav)
             SELECT $1, $2, $3, $4, $5, $6, $7
              WHERE NOT EXISTS (SELECT 1 FROM pages WHERE site_id = $2 AND path = $3 AND archived_at IS NULL)",
        )
        .bind(Uuid::now_v7())
        .bind(site_id)
        .bind(path)
        .bind(title)
        .bind(position)
        .bind(&document)
        .bind(in_nav)
        .execute(&mut *tx)
        .await?;
        if added.rows_affected() == 1 {
            created.push(path);
        }
    }

    // The home page: only if its draft is still what's published. Visitors keep the published page.
    let document = home();
    let doc: PageDoc = serde_json::from_value(document.clone())?;
    doc.validate().map_err(|e| format!("ZiraHR home page: {e:?}"))?;
    let home_drafted = sqlx::query(
        "UPDATE pages SET draft = $2, draft_version = draft_version + 1, draft_updated_at = now()
          WHERE site_id = $1 AND path = '' AND archived_at IS NULL AND draft = published",
    )
    .bind(site_id)
    .bind(&document)
    .execute(&mut *tx)
    .await?;

    // Hover previews from the guide, as a draft, unless someone has started one.
    let previews = json!({ "enabled": true, "items": [
        { "key": "/platform", "enabled": true, "icon": "layers", "headline": "Meet the tools behind smoother people operations.", "description": null },
        { "key": "/about", "enabled": true, "icon": "compass", "headline": "The thinking behind ZiraHR.", "description": null },
        { "key": "/contact", "enabled": true, "icon": "message-circle", "headline": "Good conversations start here.", "description": null },
    ]});
    if settings.get("nav_previews_draft").is_none_or(Value::is_null) {
        let mut next = settings.clone();
        if !next.is_object() {
            next = json!({});
        }
        next["nav_previews_draft"] = previews;
        sqlx::query("UPDATE sites SET settings = $2, settings_version = settings_version + 1 WHERE id = $1")
            .bind(site_id)
            .bind(next)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, $2, 'site', $3, $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(ACTION)
    .bind(site_id.to_string())
    .bind(json!({ "pages": created, "home_drafted": home_drafted.rows_affected() == 1 }))
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(pages = ?created, "ZiraHR guide content drafted (unpublished)");
    Ok(())
}

const LAUNCH: &str = "site.zirahr_launched";
const STORIES: &str = "page.zirahr_stories_published";

fn story_sections() -> [Value; 2] {
    [
        json!({ "id": id(), "type": "demo", "demo": "scattered_to_connected",
                "heading": "From scattered to connected.",
                "intro": "Keep scrolling to see what changes when HR stops living in separate places." }),
        json!({ "id": id(), "type": "demo", "demo": "employee_journey",
                "heading": "One employee, one record, start to finish.",
                "intro": "Follow someone from their application to their next goal." }),
    ]
}

/// Adds the scroll stories to the Platform page once (UI-MO6), as a new numbered
/// version that can be restored from in the Studio. A page someone has edited is
/// left alone: they can add the stories themselves from the page builder.
pub async fn publish_stories(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let site: Option<Uuid> = sqlx::query_scalar(
        "SELECT s.id FROM sites s WHERE s.slug = 'zirahr' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = $1)
            FOR UPDATE",
    )
    .bind(STORIES)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(site_id) = site else { return Ok(()) };
    let page: Option<(Uuid, Value, Option<Value>, bool)> = sqlx::query_as(
        "SELECT id, draft, published, draft_updated_by IS NOT NULL FROM pages
          WHERE site_id = $1 AND path = 'platform' AND archived_at IS NULL FOR UPDATE",
    )
    .bind(site_id)
    .fetch_optional(&mut *tx)
    .await?;
    let mut added = false;
    if let Some((page_id, draft, Some(published), false)) = page
        && draft == published
    {
        let mut document = published;
        let sections = document["sections"]
            .as_array_mut()
            .ok_or("Platform page has no sections")?;
        let has_story = sections.iter().any(|s| s["demo"] == "scattered_to_connected");
        if !has_story {
            let [connected, journey] = story_sections();
            let after_hero = usize::from(!sections.is_empty());
            sections.insert(after_hero, connected);
            let before_close = sections.len().saturating_sub(1).max(after_hero + 1);
            sections.insert(before_close, journey);
            let doc: PageDoc = serde_json::from_value(document.clone())?;
            doc.validate()
                .map_err(|e| format!("ZiraHR platform page: {e:?}"))?;
            let revision = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO page_revisions (id, page_id, number, document, note, state, decided_at)
                 SELECT $1, $2, COALESCE(max(number), 0) + 1, $3, $4, 'published', now()
                   FROM page_revisions WHERE page_id = $2",
            )
            .bind(revision)
            .bind(page_id)
            .bind(&document)
            .bind("Scroll stories added on the owner's brief, 5 Nov 2026")
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE pages SET draft = $2, published = $2, published_revision = $3, published_at = now(),
                        draft_version = draft_version + 1, draft_updated_at = now()
                  WHERE id = $1",
            )
            .bind(page_id)
            .bind(&document)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
            added = true;
        }
    }
    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, $2, 'site', $3, $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(STORIES)
    .bind(site_id.to_string())
    .bind(json!({ "added": added, "authorised_by": "owner's brief, 5 Nov 2026" }))
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(added, "ZiraHR scroll stories");
    Ok(())
}
const CHECKED: &str = "2026-11-05";

/// Publishes one page, unless a person has edited it since it was drafted.
/// Returns whether it was published.
async fn publish_page(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    site_id: Uuid,
    (position, path, title, document, in_nav): (i32, &str, &str, Value, bool),
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let doc: PageDoc = serde_json::from_value(document.clone())?;
    doc.validate().map_err(|e| format!("ZiraHR {path} page: {e:?}"))?;
    let existing: Option<(Uuid, bool)> = sqlx::query_as(
        "SELECT id, draft_updated_by IS NOT NULL FROM pages
          WHERE site_id = $1 AND path = $2 AND archived_at IS NULL FOR UPDATE",
    )
    .bind(site_id)
    .bind(path)
    .fetch_optional(&mut **tx)
    .await?;
    let page = match existing {
        Some((_, true)) => return Ok(false),
        Some((id, false)) => id,
        None => {
            let id = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO pages (id, site_id, path, title, position, draft, show_in_nav)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(id)
            .bind(site_id)
            .bind(path)
            .bind(title)
            .bind(position)
            .bind(&document)
            .bind(in_nav)
            .execute(&mut **tx)
            .await?;
            id
        }
    };
    let revision = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO page_revisions (id, page_id, number, document, note, state, decided_at)
         SELECT $1, $2, COALESCE(max(number), 0) + 1, $3, $4, 'published', now()
           FROM page_revisions WHERE page_id = $2",
    )
    .bind(revision)
    .bind(page)
    .bind(&document)
    .bind("Published on the owner's instruction, 5 Nov 2026")
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "UPDATE pages SET draft = $2, published = $2, published_revision = $3, published_at = now(),
                draft_version = draft_version + 1, draft_updated_at = now(), show_in_nav = $4
          WHERE id = $1",
    )
    .bind(page)
    .bind(&document)
    .bind(revision)
    .bind(in_nav)
    .execute(&mut **tx)
    .await?;
    Ok(true)
}

/// The owner's go-live of 5 Nov 2026, once: the pages, the hover previews and
/// footer links, and the payroll calculator with its rules recorded as checked.
pub async fn launch(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut tx = pool.begin().await?;
    let site: Option<(Uuid, Value)> = sqlx::query_as(
        "SELECT s.id, s.settings FROM sites s WHERE s.slug = 'zirahr' AND NOT EXISTS (
                SELECT 1 FROM audit_log a WHERE a.site_id = s.id AND a.action = $1)
            FOR UPDATE",
    )
    .bind(LAUNCH)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((site_id, settings)) = site else {
        return Ok(());
    };

    let mut published = Vec::new();
    let mut skipped = Vec::new();
    for page in [
        (0, "", "Home", home(), true),
        (1, "platform", "Platform", platform(), true),
        (2, "about", "About", about(), true),
        (3, "contact", "Contact & Demo", contact(), true),
        (4, "refer", "Refer & earn", refer(), false),
    ] {
        let path = page.1;
        if publish_page(&mut tx, site_id, page).await? {
            published.push(path);
        } else {
            skipped.push(path);
        }
    }

    let mut next = WebsiteSettings::from_stored(settings);
    if let Some(draft) = next.nav_previews_draft.take() {
        next.nav_previews = draft;
    }
    if next.footer.links.is_empty() {
        next.footer.links = vec![
            Link {
                label: "Payroll calculator".into(),
                href: "/payroll-calculator".into(),
            },
            Link {
                label: "Refer & earn".into(),
                href: "/refer".into(),
            },
        ];
    }
    let next = next
        .normalise(false)
        .map_err(|e| format!("ZiraHR settings: {e:?}"))?;
    sqlx::query("UPDATE sites SET settings = $2, settings_version = settings_version + 1 WHERE id = $1")
        .bind(site_id)
        .bind(serde_json::to_value(&next)?)
        .execute(&mut *tx)
        .await?;

    let calculator = crate::payroll::launch_config(CHECKED)?;
    sqlx::query(
        "INSERT INTO site_payroll_calculators (site_id, draft) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(site_id)
    .bind(&calculator)
    .execute(&mut *tx)
    .await?;
    let switched = sqlx::query(
        "UPDATE site_payroll_calculators
            SET draft = $2, published = $2, published_number = 1, published_at = now(), public_visible = true,
                review_requested_by = NULL, review_requested_at = NULL, review_note = NULL
          WHERE site_id = $1 AND published IS NULL AND draft_updated_by IS NULL",
    )
    .bind(site_id)
    .bind(&calculator)
    .execute(&mut *tx)
    .await?;
    if switched.rows_affected() == 1 {
        sqlx::query(
            "INSERT INTO payroll_calculator_versions (id, site_id, number, config, note)
             VALUES ($1, $2, 1, $3, $4)",
        )
        .bind(Uuid::now_v7())
        .bind(site_id)
        .bind(&calculator)
        .bind("Published on the owner's instruction; rules checked 5 Nov 2026")
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
         VALUES ($1, $2, 'site', $3, $4, $5)",
    )
    .bind(Uuid::now_v7())
    .bind(LAUNCH)
    .bind(site_id.to_string())
    .bind(json!({
        "pages": published, "left_as_edited": skipped,
        "calculator_published": switched.rows_affected() == 1,
        "authorised_by": "owner, 5 Nov 2026",
    }))
    .bind(site_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(pages = ?published, left_as_edited = ?skipped, "ZiraHR website published");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_draft_passes_the_same_checks_as_a_page_in_the_studio() {
        for document in [home(), platform(), about(), contact(), refer()] {
            let doc: PageDoc = serde_json::from_value(document).unwrap();
            assert_eq!(doc.validate(), Ok(()));
        }
    }

    #[test]
    fn the_guides_sign_off_rules_hold_in_the_drafts() {
        let text = [home(), platform(), about(), contact(), refer()]
            .iter()
            .map(Value::to_string)
            .collect::<String>()
            .to_lowercase();
        for banned in [
            "outsourc",
            "consult",
            "app store",
            "play store",
            "android",
            "ios app",
            "100%",
            "ksh 100,000",
            "ksh 250,000",
            "guarantee",
        ] {
            assert!(!text.contains(banned), "{banned}");
        }
        // All eight modules, as the owner confirmed.
        let platform = platform();
        let modules = platform["sections"][1]["items"].as_array().unwrap();
        assert_eq!(modules.len(), 8);
        assert!(modules.iter().all(|m| m["availability"] == "available"));
    }
}
