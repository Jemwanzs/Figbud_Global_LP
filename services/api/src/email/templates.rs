//! Transactional email templates. All visitor-supplied values are HTML-escaped
//! before they are placed into markup.

use super::acknowledgement_text;
use crate::enquiry::Enquiry;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedEmail {
    pub template: &'static str,
    pub subject: String,
    pub html: String,
    pub text: String,
}

/// A short message about someone's own account, with an optional button.
fn account_email(
    template: &'static str,
    subject: &str,
    name: &str,
    paragraphs: &[&str],
    action: Option<(&str, &str)>,
) -> RenderedEmail {
    let first_name = name.split_whitespace().next().unwrap_or(name);
    let mut text = format!("Hello {first_name},\n\n");
    let mut html = format!(
        "<div style=\"font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f172a\"><p>Hello {},</p>",
        escape_html(first_name)
    );
    for paragraph in paragraphs {
        text.push_str(paragraph);
        text.push_str("\n\n");
        html.push_str(&format!("<p>{}</p>", escape_html(paragraph)));
    }
    if let Some((label, url)) = action {
        text.push_str(&format!("{label}: {url}\n\n"));
        html.push_str(&format!(
            "<p><a href=\"{}\" style=\"color:#15803d;font-weight:600\">{}</a></p>",
            escape_html(url),
            escape_html(label)
        ));
    }
    text.push_str("FigBud Global");
    html.push_str("<p>FigBud Global</p></div>");
    RenderedEmail {
        template,
        subject: subject.to_owned(),
        html,
        text,
    }
}

pub fn password_recovery(name: &str, url: &str, minutes: u32) -> RenderedEmail {
    let expires = format!("This link works once and expires in {minutes} minutes.");
    account_email(
        "admin_password_recovery",
        "Reset your FigBud Studio password",
        name,
        &[
            "Someone asked to reset your FigBud Studio password. Use the link below to choose a new one.",
            &expires,
            "You'll still need your authenticator app to sign in. If this wasn't you, you can ignore this email: your password hasn't changed.",
        ],
        Some(("Choose a new password", url)),
    )
}

pub fn password_needs_passkey(name: &str, url: &str) -> RenderedEmail {
    account_email(
        "admin_password_needs_passkey",
        "Signing in to FigBud Studio",
        name,
        &[
            "Someone asked to reset your FigBud Studio password, but your account doesn't have a password with two-factor yet.",
            "Sign in with your passkey, then add both under Settings, Security & Authentication. If you no longer have your passkey, ask an owner for a new invite. If this wasn't you, you can ignore this email.",
        ],
        Some(("Sign in", url)),
    )
}

pub fn password_changed(name: &str) -> RenderedEmail {
    account_email(
        "admin_password_changed",
        "Your FigBud Studio password was changed",
        name,
        &[
            "Your FigBud Studio password was just changed, and your other sessions were signed out.",
            "If this wasn't you, contact a FigBud owner straight away.",
        ],
        None,
    )
}

pub fn team_notification(enquiry: &Enquiry, reference: &str) -> RenderedEmail {
    let product = enquiry.product.display_name();
    let who = match &enquiry.company {
        Some(company) => format!("{} ({company})", enquiry.name),
        None => enquiry.name.clone(),
    };
    let subject = format!("[{product}] {} from {who} · {reference}", enquiry.kind.label());

    let rows: Vec<(&str, Option<&str>)> = vec![
        ("Reference", Some(reference)),
        ("Type", Some(enquiry.kind.label())),
        ("Product", Some(product)),
        ("Name", Some(&enquiry.name)),
        ("Email", Some(&enquiry.email)),
        ("Company", enquiry.company.as_deref()),
        ("Job title", enquiry.job_title.as_deref()),
        ("Phone", enquiry.phone.as_deref()),
        ("Second phone", enquiry.phone_secondary.as_deref()),
        ("Country", enquiry.country.as_deref()),
        ("Company size", enquiry.company_size.as_deref()),
        ("Locale", Some(&enquiry.locale)),
        ("Submitted from", enquiry.source_path.as_deref()),
    ];
    let present = rows.iter().filter_map(|(k, v)| v.map(|v| (*k, v)));

    let mut table = String::new();
    let mut text = format!("New {} for {product}\n\n", enquiry.kind.label().to_lowercase());
    for (label, value) in present {
        table.push_str(&format!(
            r#"<tr><td style="padding:8px 16px 8px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">{label}</td><td style="padding:8px 0;color:#0f172a;font-size:14px">{}</td></tr>"#,
            escape_html(value)
        ));
        text.push_str(&format!("{label}: {value}\n"));
    }
    if let Some(message) = &enquiry.message {
        table.push_str(&format!(
            r#"<tr><td colspan="2" style="padding:16px 0 0"><div style="color:#64748b;font-size:13px;margin-bottom:6px">Message</div><div style="color:#0f172a;font-size:14px;line-height:1.6;white-space:pre-wrap;background:#f8fafc;border-radius:10px;padding:14px 16px">{}</div></td></tr>"#,
            escape_html(message)
        ));
        text.push_str(&format!("\nMessage:\n{message}\n"));
    }
    text.push_str("\nReply directly to this email to respond to the sender.\n");

    let body = format!(
        r#"<p style="margin:0 0 4px;color:#15803d;font-size:12px;letter-spacing:.12em;text-transform:uppercase">{product}</p>
<h1 style="margin:0 0 20px;font-size:22px;color:#0f172a">New {}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">{table}</table>"#,
        escape_html(&enquiry.kind.label().to_lowercase())
    );

    RenderedEmail {
        template: "team_notification",
        subject,
        html: layout(&body),
        text,
    }
}

/// The visitor's acknowledgement, in `language` (a published language code,
/// else English: see `acknowledgement_text`).
pub fn visitor_acknowledgement(enquiry: &Enquiry, reference: &str, language: &str) -> RenderedEmail {
    let words = acknowledgement_text::text(language);
    let first_name = enquiry.name.split_whitespace().next().unwrap_or(&enquiry.name);
    let [subject, headline, next_steps] = words.for_enquiry(enquiry.kind, enquiry.product);
    let greeting = |name: &str| words.greeting.replace("{name}", name);
    // Our wording, escaped, around the reference in bold.
    let reference_html = words
        .reference
        .split("{reference}")
        .map(escape_html)
        .collect::<Vec<_>>()
        .join(&format!(
            r#"<strong style="color:#0f172a;font-family:ui-monospace,Menlo,monospace">{}</strong>"#,
            escape_html(reference)
        ));

    let body = format!(
        r#"<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">{}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">{}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">{}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569">{}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">{}</p>"#,
        escape_html(&headline),
        escape_html(&greeting(first_name)),
        escape_html(&next_steps),
        reference_html,
        escape_html(words.ignore),
    );

    let text = format!(
        "{headline}

{}

{next_steps}

{}

{}

FigBud Global",
        greeting(first_name),
        words.reference.replace("{reference}", reference),
        words.ignore,
    );

    RenderedEmail {
        template: "visitor_acknowledgement",
        subject,
        html: layout_in(&body, words.lang, words.dir),
        text,
    }
}

fn layout(body: &str) -> String {
    layout_in(body, "en", "ltr")
}

fn layout_in(body: &str, lang: &str, dir: &str) -> String {
    format!(
        r#"<!doctype html><html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FigBud Global</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Outfit,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 8px 16px;font-size:16px;font-weight:600;color:#0f172a">FigBud <span style="color:#15803d">Global</span></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:32px">{body}</td></tr>
<tr><td style="padding:16px 8px 0;font-size:12px;color:#64748b">FigBud Global · From vision to value, we deliver.</td></tr>
</table></td></tr></table></body></html>"#
    )
}

pub fn escape_html(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enquiry::{EnquiryKind, Product};

    fn enquiry(kind: EnquiryKind, product: Product) -> Enquiry {
        Enquiry {
            kind,
            product,
            name: "Baraka <script>alert(1)</script> Otieno".into(),
            email: "baraka@example.com".into(),
            company: Some("Mfano & Sons".into()),
            job_title: None,
            phone: None,
            phone_secondary: None,
            country: Some("Kenya".into()),
            company_size: None,
            message: Some("Hello <b>team</b>".into()),
            locale: "en".into(),
            source_path: Some("/en/contact".into()),
        }
    }

    #[test]
    fn escapes_visitor_input_in_team_notifications() {
        let email = team_notification(
            &enquiry(EnquiryKind::DemoRequest, Product::Zirahr),
            "FBG-2610-ABCDEF",
        );
        assert!(!email.html.contains("<script>"));
        assert!(email.html.contains("&lt;script&gt;"));
        assert!(email.html.contains("Mfano &amp; Sons"));
        assert!(email.html.contains("Hello &lt;b&gt;team&lt;/b&gt;"));
        assert!(email.subject.starts_with("[ZiraHR] Demo request from"));
        assert!(email.text.contains("Reference: FBG-2610-ABCDEF"));
    }

    #[test]
    fn waitlist_acknowledgement_names_the_product() {
        let email = visitor_acknowledgement(
            &enquiry(EnquiryKind::Waitlist, Product::ExpenseNow),
            "FBG-2610-ABCDEF",
            "en",
        );
        assert_eq!(email.subject, "You're on the Expense Now waitlist");
        assert!(email.html.contains("Hi Baraka,"));
        assert!(email.text.contains("FBG-2610-ABCDEF"));
    }

    #[test]
    fn acknowledgements_speak_the_published_language_and_escape_input() {
        let e = enquiry(EnquiryKind::DemoRequest, Product::Zirahr);
        let sw = visitor_acknowledgement(&e, "FBG-2610-ABCDEF", "sw");
        assert_eq!(sw.subject, "Ombi lako la onyesho la ZiraHR");
        assert!(sw.html.contains(r#"<html lang="sw" dir="ltr">"#));
        assert!(sw.text.contains("FBG-2610-ABCDEF"));
        let ar = visitor_acknowledgement(&e, "FBG-2610-ABCDEF", "ar");
        assert!(ar.html.contains(r#"dir="rtl""#));
        assert!(ar.html.contains("ZiraHR"), "product names stay as they are");
        // Visitor input is escaped in every language; an unknown code is English.
        assert!(!ar.html.contains("<script>"));
        assert_eq!(
            visitor_acknowledgement(&e, "X", "de").subject,
            "Your ZiraHR demo request"
        );
        let en = visitor_acknowledgement(&e, "FBG<1>", "en");
        assert!(en.html.contains("FBG&lt;1&gt;") && !en.html.contains("FBG<1>"));
    }

    #[test]
    fn escape_html_covers_attribute_characters() {
        assert_eq!(
            escape_html(r#"<a href="x">'&'</a>"#),
            "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
    }
}
