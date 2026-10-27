//! Starting points for new pages: a general set for every website, and sets
//! for each product category (P7-C3; the lending set is the shared lending
//! template of P4-L1, used by Jasiri LMS and Ziwa LMS with their own copy).
//!
//! Placeholder text is marked "Replace…" and makes no claims: capabilities,
//! figures and integrations are the editor's to state once verified. Drafts
//! are never public, and publishing needs a second person's approval.
//! Calls to action link to `/enquire`, which websites send to their enquiry
//! form, and are labelled for the website's launch status.

use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::blocks::PageDoc;
use crate::sites::cta_for;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Template {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    /// Suggested page title and address ("" is the home page).
    pub title: &'static str,
    pub path: &'static str,
    /// The website category this template is written for; `None` suits all.
    pub category: Option<&'static str>,
}

const fn t(
    id: &'static str,
    label: &'static str,
    description: &'static str,
    title: &'static str,
    path: &'static str,
    category: Option<&'static str>,
) -> Template {
    Template {
        id,
        label,
        description,
        title,
        path,
        category,
    }
}

const LENDING: Option<&str> = Some("lending_credit");
const HR: Option<&str> = Some("hr_workforce");
const FINANCE: Option<&str> = Some("finance_payments");

pub const TEMPLATES: [Template; 15] = [
    t(
        "blank",
        "Blank page",
        "An empty page to build section by section.",
        "",
        "",
        None,
    ),
    t(
        "home",
        "Home page",
        "Promise, capabilities, how it works and a call to action.",
        "Home",
        "",
        None,
    ),
    t(
        "overview",
        "Platform overview",
        "How the platform fits together, with its main modules.",
        "Platform",
        "platform",
        None,
    ),
    t(
        "features",
        "Features",
        "A grid of features with common questions.",
        "Features",
        "features",
        None,
    ),
    t(
        "integrations",
        "Integrations",
        "The systems the product connects to today.",
        "Integrations",
        "integrations",
        None,
    ),
    t(
        "resources",
        "Resources",
        "Guides and answers to common questions.",
        "Resources",
        "resources",
        None,
    ),
    t(
        "contact",
        "Contact and demo",
        "What happens after someone gets in touch.",
        "Contact",
        "contact",
        None,
    ),
    t(
        "lending_home",
        "Lending home page",
        "For lenders: the loan lifecycle from application to repayment.",
        "Home",
        "",
        LENDING,
    ),
    t(
        "lending_solutions",
        "Lending solutions",
        "The kinds of lending the platform supports, one card each.",
        "Lending solutions",
        "lending-solutions",
        LENDING,
    ),
    t(
        "borrower_journey",
        "Borrower journey",
        "Apply, assess, approve, disburse and repay, step by step.",
        "How it works",
        "how-it-works",
        LENDING,
    ),
    t(
        "hr_home",
        "HR home page",
        "For people teams: the employee lifecycle in one place.",
        "Home",
        "",
        HR,
    ),
    t(
        "hr_modules",
        "HR modules",
        "One card per module, from records to payroll.",
        "Modules",
        "modules",
        HR,
    ),
    t(
        "employee_journey",
        "Employee journey",
        "Hire, onboard, pay and grow, step by step.",
        "How it works",
        "how-it-works",
        HR,
    ),
    t(
        "finance_home",
        "Finance home page",
        "For finance teams: spend, approvals and payments.",
        "Home",
        "",
        FINANCE,
    ),
    t(
        "spend_journey",
        "Spend journey",
        "Request, approve, pay and reconcile, step by step.",
        "How it works",
        "how-it-works",
        FINANCE,
    ),
];

/// The templates offered to a website: its category's set first, then the general set.
pub fn for_category(category: &str) -> impl Iterator<Item = &'static Template> {
    let own = TEMPLATES.iter().filter(move |t| t.category == Some(category));
    own.chain(TEMPLATES.iter().filter(|t| t.category.is_none()))
}

/// What a template is written for.
pub struct Context<'a> {
    pub site_name: &'a str,
    pub tagline: Option<&'a str>,
    pub category: &'a str,
    pub status: &'a str,
}

impl Context<'_> {
    /// The call to action for the website's launch status (as on its header).
    fn cta(&self) -> &'static str {
        match cta_for(self.status) {
            Some("waitlist") => "Join the waitlist",
            Some("early_access") => "Request early access",
            Some("demo") => "Request a demo",
            _ => "Get in touch",
        }
    }
}

fn id() -> String {
    Uuid::now_v7().simple().to_string()
}

fn cards(titles: &[&str], body: &str) -> Value {
    Value::Array(
        titles
            .iter()
            .map(|title| json!({ "title": title, "body": body }))
            .collect(),
    )
}

fn hero(eyebrow: &str, heading: &str, lead: &str, cta: &str, secondary: Option<(&str, &str)>) -> Value {
    let mut hero = json!({ "id": id(), "type": "hero", "eyebrow": eyebrow, "heading": heading, "lead": lead,
                           "primary": { "label": cta, "href": "/enquire" } });
    if let Some((label, href)) = secondary {
        hero["secondary"] = json!({ "label": label, "href": href });
    }
    hero
}

fn closing(heading: String, cta: &str) -> Value {
    json!({ "id": id(), "type": "call_to_action", "heading": heading,
            "body": "Replace with a short invitation.",
            "cta": { "label": cta, "href": "/enquire" } })
}

fn steps(heading: &str, titles: &[&str]) -> Value {
    json!({ "id": id(), "type": "steps", "heading": heading,
            "items": cards(titles, "Replace with what happens at this step.") })
}

/// The page document for a template, written for this website. `None` for an
/// unknown template or one written for another category.
pub fn document(template: &str, cx: &Context) -> Option<PageDoc> {
    let found = TEMPLATES.iter().find(|t| t.id == template)?;
    if found.category.is_some_and(|c| c != cx.category) {
        return None;
    }
    let name = cx.site_name;
    let tagline = cx.tagline.unwrap_or("Replace with a one-line promise.");
    let cta = cx.cta();
    let capability = "Replace with what it does and why it matters.";
    let sections: Value = match template {
        "blank" => json!([]),
        "home" => json!([
            hero(name, tagline,
                 "Replace with two sentences on who the product is for and what changes for them.",
                 cta, Some(("Explore the platform", "/platform"))),
            { "id": id(), "type": "feature_grid", "heading": "What you can do",
              "items": cards(&["Replace with a capability"; 3], capability) },
            steps("How it works", &["Set up", "Run", "Improve"]),
            closing(format!("See {name} in action"), cta)
        ]),
        "overview" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Platform", "heading": format!("One platform for {name}"),
              "lead": "Replace with how the platform fits together." },
            { "id": id(), "type": "text", "heading": "How it fits together",
              "body": "Replace with an overview. **Markdown** is supported: lists, links and emphasis." },
            { "id": id(), "type": "feature_grid", "heading": "Built in",
              "items": cards(&["Replace with a module"; 2], "Describe it.") }
        ]),
        "features" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Features", "heading": "Replace with a features headline" },
            { "id": id(), "type": "feature_grid", "items": cards(&["Replace with a feature"; 4], "Describe it.") },
            { "id": id(), "type": "faq", "heading": "Questions",
              "items": [{ "question": "Replace with a common question?", "answer": "Replace with the answer." }] }
        ]),
        "integrations" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Integrations", "heading": format!("{name} works with your systems"),
              "lead": "Replace with how connections are set up." },
            { "id": id(), "type": "feature_grid", "heading": "Available today",
              "items": cards(&["Replace with a connected system"; 4],
                             "List only integrations that are live; mark planned ones as planned.") },
            closing("Need another connection?".to_owned(), cta)
        ]),
        "resources" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Resources", "heading": format!("Get the most from {name}") },
            { "id": id(), "type": "text", "heading": "Guides",
              "body": "Replace with links to guides, documentation or articles." },
            { "id": id(), "type": "faq", "heading": "Common questions",
              "items": [
                  { "question": "Replace with a common question?", "answer": "Replace with the answer." },
                  { "question": "Replace with a common question?", "answer": "Replace with the answer." }
              ] }
        ]),
        "contact" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Contact", "heading": format!("Talk to the {name} team"),
              "lead": "Replace with what happens after someone gets in touch." },
            { "id": id(), "type": "call_to_action", "heading": cta,
              "body": "Replace with when and how the team replies.",
              "cta": { "label": cta, "href": "/enquire" } }
        ]),
        "lending_home" => json!([
            hero(name, tagline,
                 "Replace with two sentences on the lenders it serves and what changes for their borrowers.",
                 cta, Some(("Lending solutions", "/lending-solutions"))),
            { "id": id(), "type": "feature_grid", "heading": "Across the loan lifecycle",
              "items": cards(&["Origination", "Credit decisions", "Disbursement", "Collections"],
                             "Replace with what the platform does at this stage.") },
            steps("From application to repayment", &["Apply", "Assess", "Approve", "Disburse", "Repay"]),
            { "id": id(), "type": "faq", "heading": "Questions lenders ask",
              "items": [{ "question": "Replace with a common question?", "answer": "Replace with the answer." }] },
            closing(format!("See {name} in action"), cta)
        ]),
        "lending_solutions" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Lending solutions",
              "heading": "Replace with a headline for the lending you support",
              "lead": "Replace with who each product is for." },
            { "id": id(), "type": "feature_grid",
              "items": cards(&["Replace with a lending product"; 4],
                             "Replace with who it serves and how it works. List only products that are live.") },
            closing("Find the right fit".to_owned(), cta)
        ]),
        "borrower_journey" => json!([
            { "id": id(), "type": "hero", "eyebrow": "How it works", "heading": "Every step of the loan, in one place",
              "lead": "Replace with how borrowers and lenders move through each step." },
            steps("The borrower journey", &["Apply", "Assess", "Approve", "Disburse", "Repay"]),
            closing(format!("Walk through {name}"), cta)
        ]),
        "hr_home" => json!([
            hero(name, tagline,
                 "Replace with two sentences on the teams it serves and what changes for their people.",
                 cta, Some(("Explore the modules", "/modules"))),
            { "id": id(), "type": "feature_grid", "heading": "Across the employee lifecycle",
              "items": cards(&["Recruitment", "Onboarding", "Payroll", "Performance"],
                             "Replace with what the platform does here.") },
            steps("How it works", &["Hire", "Onboard", "Pay", "Grow"]),
            closing(format!("See {name} in action"), cta)
        ]),
        "hr_modules" => json!([
            { "id": id(), "type": "hero", "eyebrow": "Modules", "heading": "Replace with a modules headline" },
            { "id": id(), "type": "feature_grid",
              "items": cards(&["Replace with a module"; 6], "Replace with what it covers. List only modules that are live.") },
            closing("Choose the modules you need".to_owned(), cta)
        ]),
        "employee_journey" => json!([
            { "id": id(), "type": "hero", "eyebrow": "How it works", "heading": "From first day to every payday",
              "lead": "Replace with how employees and HR teams move through each step." },
            steps("The employee journey", &["Hire", "Onboard", "Pay", "Grow"]),
            closing(format!("Walk through {name}"), cta)
        ]),
        "finance_home" => json!([
            hero(name, tagline,
                 "Replace with two sentences on the finance teams it serves and what changes for them.",
                 cta, Some(("How it works", "/how-it-works"))),
            { "id": id(), "type": "feature_grid", "heading": "Control every payment",
              "items": cards(&["Requests", "Approvals", "Payments", "Reconciliation"],
                             "Replace with what the platform does here.") },
            closing(format!("See {name} in action"), cta)
        ]),
        "spend_journey" => json!([
            { "id": id(), "type": "hero", "eyebrow": "How it works", "heading": "From request to reconciled",
              "lead": "Replace with how teams and approvers move through each step." },
            steps("The spend journey", &["Request", "Approve", "Pay", "Reconcile"]),
            closing(format!("Walk through {name}"), cta)
        ]),
        _ => return None,
    };
    serde_json::from_value(json!({ "sections": sections })).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cx(category: &'static str, status: &'static str) -> Context<'static> {
        Context {
            site_name: "Test",
            tagline: None,
            category,
            status,
        }
    }

    #[test]
    fn every_template_builds_a_valid_document() {
        for template in &TEMPLATES {
            let category = template.category.unwrap_or("custom_enterprise");
            let doc = document(template.id, &cx(category, "active"))
                .unwrap_or_else(|| panic!("{} builds", template.id));
            doc.validate()
                .unwrap_or_else(|e| panic!("{} validates: {e:?}", template.id));
            assert_eq!(doc.sections.is_empty(), template.id == "blank", "{}", template.id);
        }
    }

    #[test]
    fn category_templates_stay_with_their_category() {
        assert!(document("lending_home", &cx("lending_credit", "active")).is_some());
        assert!(document("lending_home", &cx("hr_workforce", "active")).is_none());
        let offered: Vec<_> = for_category("lending_credit").map(|t| t.id).collect();
        assert_eq!(
            offered[..3],
            ["lending_home", "lending_solutions", "borrower_journey"]
        );
        assert!(offered.contains(&"home") && !offered.contains(&"hr_home"));
    }

    #[test]
    fn calls_to_action_follow_the_launch_status() {
        let doc =
            serde_json::to_value(document("home", &cx("lending_credit", "coming_soon")).unwrap()).unwrap();
        let sections = doc["sections"].as_array().unwrap();
        assert_eq!(sections[0]["primary"]["label"], "Join the waitlist");
        assert_eq!(sections[0]["primary"]["href"], "/enquire");
        assert_eq!(sections.last().unwrap()["cta"]["label"], "Join the waitlist");
    }
}
