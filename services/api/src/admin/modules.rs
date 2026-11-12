//! Studio areas and actions (P13-B3, owner's brief, 12 Nov 2026). On top of
//! a person's Studio role and website access, an owner can limit which
//! areas they open and what they may do there. Unset means every area
//! within their role (how everyone worked before), so nothing changes until
//! an owner sets it. Checked for every admin request when the session is
//! read (`AdminSession`), so no route can be missed; owners are never limited.

use std::collections::BTreeMap;

use axum::http::Method;
use serde::{Deserialize, Serialize};

use crate::error::FieldError;

/// The Studio's areas, as the sidebar groups them.
pub const MODULES: [&str; 12] = [
    "websites",
    "hero",
    "pages",
    "website_settings",
    "branding",
    "content",
    "campaigns",
    "proof",
    "pricing",
    "enquiries",
    "seo",
    "publishing",
];

/// What someone may do in an area. Roles still apply: a viewer can't edit,
/// an editor can't publish, whatever is granted here.
pub const ACTIONS: [&str; 5] = ["view", "edit", "submit", "publish", "export"];

/// Area → actions. `None` on a person: every area.
pub type Modules = BTreeMap<String, Vec<String>>;

/// Which area and action an admin request needs, or `None` for requests
/// every signed-in person may make (their own sign-in and security, the
/// website list the Studio shell needs, and owner-only settings, which the
/// role already guards).
pub fn classify(method: &Method, path: &str) -> Option<(&'static str, &'static str)> {
    let rest = path.strip_prefix("/v1/admin/")?;
    let seg: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
    let read = matches!(*method, Method::GET | Method::HEAD);
    let module = match seg.as_slice() {
        // The website list and a website's summary: the Studio shell and every page need them.
        ["sites"] | ["sites", _] if read => return None,
        ["sites"] | ["sites", _] => "websites",
        ["sites", _, area, ..] => match *area {
            "hero" => "hero",
            "pages" => "pages",
            "settings" => "website_settings",
            "brand" | "media" => "branding",
            "pricing" | "payroll-calculator" => "pricing",
            "seo" => "seo",
            _ => "websites",
        },
        ["pages", ..] => "pages",
        ["brand", ..] | ["media", ..] => "branding",
        ["cms", ..] | ["shared", ..] => "content",
        ["campaigns", ..] => "campaigns",
        ["proof", ..] => "proof",
        ["pricing", ..] => "pricing",
        ["enquiries", ..] => "enquiries",
        ["seo", ..] => "seo",
        ["approvals", ..] => "publishing",
        _ => return None,
    };
    let last = seg.last().copied().unwrap_or_default();
    let action = if read {
        if last == "export" { "export" } else { "view" }
    } else {
        match last {
            // Handing a request to an approver is part of deciding it (P13-B5).
            "publish" | "approve" | "reject" | "decline" | "unpublish" | "rollback" | "assign" => "publish",
            "submit" | "cancel" => "submit",
            _ => "edit",
        }
    };
    Some((module, action))
}

/// Whether `modules` allows `action` in `module`.
pub fn allows(modules: &Modules, module: &str, action: &str) -> bool {
    modules
        .get(module)
        .is_some_and(|actions| actions.iter().any(|a| a == action))
}

/// Checks and tidies a person's areas: known areas and actions, each once;
/// an area that's granted anything can at least be viewed.
pub fn normalise(mut modules: Modules) -> Result<Modules, Vec<FieldError>> {
    let bad = |message: &'static str| {
        vec![FieldError {
            field: "modules",
            code: "invalid",
            message,
        }]
    };
    if modules.keys().any(|m| !MODULES.contains(&m.as_str())) {
        return Err(bad("Choose areas from the list."));
    }
    for actions in modules.values_mut() {
        if actions.iter().any(|a| !ACTIONS.contains(&a.as_str())) {
            return Err(bad("Choose view, edit, submit, publish or export."));
        }
        if !actions.is_empty() && !actions.iter().any(|a| a == "view") {
            actions.push("view".into());
        }
        actions.sort_by_key(|a| ACTIONS.iter().position(|x| x == a));
        actions.dedup();
    }
    modules.retain(|_, actions| !actions.is_empty());
    Ok(modules)
}

#[derive(Serialize, Deserialize)]
pub struct ModulesInput {
    /// `null`: every area within the role.
    pub modules: Option<Modules>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(method: Method, path: &str) -> Option<(&'static str, &'static str)> {
        classify(&method, path)
    }

    #[test]
    fn requests_map_to_areas_and_actions() {
        assert_eq!(
            c(Method::GET, "/v1/admin/sites"),
            None,
            "the shell needs the list"
        );
        assert_eq!(c(Method::GET, "/v1/admin/sites/zirahr"), None);
        assert_eq!(c(Method::POST, "/v1/admin/sites"), Some(("websites", "edit")));
        assert_eq!(
            c(Method::GET, "/v1/admin/sites/zirahr/hero"),
            Some(("hero", "view"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/hero/draft"),
            Some(("hero", "edit"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/hero/submit"),
            Some(("hero", "submit"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/hero/publish"),
            Some(("hero", "publish"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/pricing/rollback"),
            Some(("pricing", "publish"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/settings"),
            Some(("website_settings", "edit"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/sites/zirahr/archive"),
            Some(("websites", "edit"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/pages/1/reject"),
            Some(("pages", "publish"))
        );
        assert_eq!(
            c(Method::GET, "/v1/admin/enquiries/export"),
            Some(("enquiries", "export"))
        );
        assert_eq!(
            c(Method::GET, "/v1/admin/approvals"),
            Some(("publishing", "view"))
        );
        assert_eq!(
            c(Method::POST, "/v1/admin/proof/1/cancel"),
            Some(("proof", "submit"))
        );
        assert_eq!(c(Method::GET, "/v1/admin/shared"), Some(("content", "view")));
        assert_eq!(
            c(Method::POST, "/v1/admin/approvals/assign"),
            Some(("publishing", "publish"))
        );
        assert_eq!(c(Method::GET, "/v1/admin/approval-rules"), None);
        // Their own account and owner settings aren't areas.
        for path in [
            "/v1/admin/me",
            "/v1/admin/security",
            "/v1/admin/team",
            "/v1/admin/privacy",
            "/v1/admin/logout",
        ] {
            assert_eq!(c(Method::GET, path), None, "{path}");
        }
    }

    #[test]
    fn areas_are_checked_and_viewing_comes_with_any_grant() {
        let m: Modules = [("pricing".to_owned(), vec!["edit".to_owned(), "edit".to_owned()])].into();
        let m = normalise(m).unwrap();
        assert_eq!(m["pricing"], ["view", "edit"]);
        assert!(
            allows(&m, "pricing", "view") && !allows(&m, "pricing", "publish") && !allows(&m, "hero", "view")
        );
        assert!(normalise([("payroll".to_owned(), vec!["view".to_owned()])].into()).is_err());
        assert!(normalise([("hero".to_owned(), vec!["delete".to_owned()])].into()).is_err());
        assert!(
            normalise([("hero".to_owned(), vec![])].into())
                .unwrap()
                .is_empty()
        );
    }
}
