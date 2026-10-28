//! Transactional email templates. All visitor-supplied values are HTML-escaped
//! before they are placed into markup.

use crate::enquiry::{Enquiry, EnquiryKind, Product};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedEmail {
    pub template: &'static str,
    pub subject: String,
    pub html: String,
    pub text: String,
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

pub fn visitor_acknowledgement(enquiry: &Enquiry, reference: &str) -> RenderedEmail {
    let product = enquiry.product.display_name();
    let first_name = enquiry.name.split_whitespace().next().unwrap_or(&enquiry.name);

    let (subject, headline, next_steps) = match (enquiry.kind, enquiry.product) {
        (EnquiryKind::Waitlist, _) => (
            format!("You're on the {product} waitlist"),
            format!("You're on the {product} waitlist"),
            format!(
                "We'll let you know as soon as {product} opens to early customers. There's nothing else you need to do for now."
            ),
        ),
        (EnquiryKind::EarlyAccess, _) => (
            format!("Your {product} early-access request"),
            "We've received your early-access request".to_owned(),
            "Our team reviews early-access requests in batches and will contact you about next steps."
                .to_owned(),
        ),
        (EnquiryKind::DemoRequest, _) => (
            format!("Your {product} demo request"),
            format!("Thanks for your interest in {product}"),
            "A member of our team will contact you to arrange a demo at a time that suits you.".to_owned(),
        ),
        (EnquiryKind::Partnership, _) => (
            "Your partnership enquiry with FigBud Global".to_owned(),
            "Thanks for reaching out about partnering with us".to_owned(),
            "The right person on our team will review your enquiry and get back to you.".to_owned(),
        ),
        (EnquiryKind::Sales | EnquiryKind::Contact, Product::Figbud) => (
            "We've received your message".to_owned(),
            "Thanks for getting in touch".to_owned(),
            "A member of our team will review your message and get back to you.".to_owned(),
        ),
        (EnquiryKind::Sales | EnquiryKind::Contact, _) => (
            format!("We've received your {product} enquiry"),
            "Thanks for getting in touch".to_owned(),
            format!("A member of the {product} team will review your message and get back to you."),
        ),
    };

    let body = format!(
        r#"<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">{}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">Hi {},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">{}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569">Your reference is <strong style="color:#0f172a;font-family:ui-monospace,Menlo,monospace">{}</strong>. Quote it if you need to follow up.</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">If you didn't submit this request, you can safely ignore this email.</p>"#,
        escape_html(&headline),
        escape_html(first_name),
        escape_html(&next_steps),
        escape_html(reference),
    );

    let text = format!(
        "{headline}\n\nHi {first_name},\n\n{next_steps}\n\nYour reference is {reference}.\n\nIf you didn't submit this request, you can safely ignore this email.\n\nFigBud Global"
    );

    RenderedEmail {
        template: "visitor_acknowledgement",
        subject,
        html: layout(&body),
        text,
    }
}

fn layout(body: &str) -> String {
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FigBud Global</title></head>
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

    fn enquiry(kind: EnquiryKind, product: Product) -> Enquiry {
        Enquiry {
            kind,
            product,
            name: "Baraka <script>alert(1)</script> Otieno".into(),
            email: "baraka@example.com".into(),
            company: Some("Mfano & Sons".into()),
            job_title: None,
            phone: None,
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
        );
        assert_eq!(email.subject, "You're on the Expense Now waitlist");
        assert!(email.html.contains("Hi Baraka,"));
        assert!(email.text.contains("FBG-2610-ABCDEF"));
    }

    #[test]
    fn escape_html_covers_attribute_characters() {
        assert_eq!(
            escape_html(r#"<a href="x">'&'</a>"#),
            "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
    }
}
