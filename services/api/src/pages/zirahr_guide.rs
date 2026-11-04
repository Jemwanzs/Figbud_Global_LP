//! ZiraHR's website content from the Website Content & Developer Guide (5 Nov
//! 2026), loaded once as **unpublished drafts** (P14-W). Nothing here reaches
//! visitors until a person checks the claims and a reviewer approves each page:
//! the guide itself says its capabilities need verifying before publishing
//! (docs/ZIRAHR_WEBSITE.md has the sign-off register).
//!
//! - The published home page isn't touched. Its draft is replaced only if no
//!   one has started editing it.
//! - Modules the guide says to confirm are marked planned, so roadmap items
//!   aren't presented as live even if published unchanged.
//! - Left out until signed off: reward amounts, testimonials, client logos,
//!   salary advances, outsourcing or consultancy, and mobile-app claims.

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::blocks::PageDoc;

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
                        "Comments, mentions and activity notifications"], "planned"),
                  module("Recruitment", "Great hires start with a smoother journey.",
                      "Move from vacancy to shortlist to onboarding in one connected hiring flow.",
                      &["Vacancy and requisition tracking",
                        "Applicant pipeline, screening and interview stages",
                        "Turn successful candidates into employee records"], "planned"),
                  module("Learning & Development", "Skills grow. So does your team.",
                      "Give learning, training and development plans a clear place in the employee journey.",
                      &["Learning plans linked to employee profiles",
                        "Skills, competency and development goals",
                        "Completion evidence and learning history"], "planned"),
              ] },
            { "id": id(), "type": "demo", "demo": "rules",
              "heading": "Payroll rules you can see.",
              "intro": "Statutory rules change during the year. ZiraHR keeps them as dated settings, so each run uses the rules that applied at the time." },
            { "id": id(), "type": "demo", "demo": "self_service",
              "heading": "Your workday, one browser tab away.",
              "intro": "Payslips, leave requests, documents and updates, securely in your web browser, at your desk or on your phone. No app download needed." },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_draft_passes_the_same_checks_as_a_page_in_the_studio() {
        for document in [home(), platform(), about(), contact()] {
            let doc: PageDoc = serde_json::from_value(document).unwrap();
            assert_eq!(doc.validate(), Ok(()));
        }
    }

    #[test]
    fn the_guides_sign_off_rules_hold_in_the_drafts() {
        let text = [home(), platform(), about(), contact()]
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
            "salary advance",
            "guarantee",
        ] {
            assert!(!text.contains(banned), "{banned}");
        }
        // Modules the guide says to confirm can't read as live.
        let platform = platform();
        let modules = platform["sections"][1]["items"].as_array().unwrap();
        assert_eq!(modules.len(), 8);
        for title in ["Teams & Collaboration", "Recruitment", "Learning & Development"] {
            let module = modules.iter().find(|m| m["title"] == title).unwrap();
            assert_eq!(module["availability"], "planned", "{title}");
        }
    }
}
