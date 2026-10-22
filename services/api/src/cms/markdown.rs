//! Markdown to HTML for article bodies. The output is safe to embed as-is:
//! raw HTML in the source is escaped, and links and images keep only safe
//! URL schemes, so the website never handles untrusted markup.

use pulldown_cmark::{CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd, html};

/// A heading for the article's table of contents.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Heading {
    pub id: String,
    pub text: String,
    pub level: u8,
}

pub struct Rendered {
    pub html: String,
    pub headings: Vec<Heading>,
}

const WORDS_PER_MINUTE: usize = 200;

/// Estimated reading time from the source text; used by lists and articles alike.
pub fn reading_minutes(markdown: &str) -> u32 {
    markdown
        .split_whitespace()
        .count()
        .div_ceil(WORDS_PER_MINUTE)
        .max(1) as u32
}

pub fn render(markdown: &str) -> Rendered {
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_FOOTNOTES;
    let mut events: Vec<Event> = Parser::new_ext(markdown, options).collect();

    // Give h2/h3 headings stable ids so the page can link to sections.
    let mut headings = Vec::new();
    let mut used = std::collections::HashSet::new();
    let mut i = 0;
    while i < events.len() {
        if let Event::Start(Tag::Heading { level, id, .. }) = &events[i] {
            let level = *level;
            let text: String = events[i + 1..]
                .iter()
                .take_while(|e| !matches!(e, Event::End(TagEnd::Heading(_))))
                .filter_map(|e| match e {
                    Event::Text(t) | Event::Code(t) => Some(t.as_ref()),
                    _ => None,
                })
                .collect();
            if matches!(level, HeadingLevel::H2 | HeadingLevel::H3) && id.is_none() {
                let id = unique_slug(&text, &mut used);
                headings.push(Heading {
                    id: id.clone(),
                    text,
                    level: level as u8,
                });
                if let Event::Start(Tag::Heading { id: slot, .. }) = &mut events[i] {
                    *slot = Some(CowStr::from(id));
                }
            }
        }
        i += 1;
    }

    let safe = events.into_iter().map(|event| match event {
        // Never pass author-supplied HTML through: show it as text instead.
        Event::Html(raw) | Event::InlineHtml(raw) => Event::Text(raw),
        Event::Start(Tag::Link {
            link_type,
            dest_url,
            title,
            id,
        }) => Event::Start(Tag::Link {
            link_type,
            dest_url: safe_url(dest_url, false),
            title,
            id,
        }),
        Event::Start(Tag::Image {
            link_type,
            dest_url,
            title,
            id,
        }) => Event::Start(Tag::Image {
            link_type,
            dest_url: safe_url(dest_url, true),
            title,
            id,
        }),
        other => other,
    });

    let mut out = String::with_capacity(markdown.len() * 3 / 2);
    html::push_html(&mut out, safe);
    Rendered { html: out, headings }
}

/// Links may be https, http, mailto, site-relative or in-page anchors;
/// images must be https. Anything else (javascript:, data:, ...) is dropped.
fn safe_url(url: CowStr<'_>, image: bool) -> CowStr<'_> {
    let lower = url.trim().to_ascii_lowercase();
    let allowed = if image {
        lower.starts_with("https://")
    } else {
        lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:")
            || (lower.starts_with('/') && !lower.starts_with("//"))
            || lower.starts_with('#')
    };
    if allowed { url } else { CowStr::Borrowed("#") }
}

fn unique_slug(text: &str, used: &mut std::collections::HashSet<String>) -> String {
    let mut slug = String::new();
    for c in text.chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let base = match slug.trim_end_matches('-') {
        "" => "section".to_owned(),
        s => s.to_owned(),
    };
    let mut candidate = base.clone();
    let mut n = 2;
    while !used.insert(candidate.clone()) {
        candidate = format!("{base}-{n}");
        n += 1;
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_raw_html() {
        let out = render("Hello <script>alert(1)</script>\n\n<div onclick=x>hi</div>");
        assert!(!out.html.contains("<script>"));
        assert!(!out.html.contains("<div"));
        assert!(out.html.contains("&lt;script&gt;"));
    }

    #[test]
    fn drops_unsafe_link_and_image_schemes() {
        let out = render(
            "[a](javascript:alert(1)) [b](https://ok.example) [c](//evil.example) ![i](http://x/img.png) ![j](https://x/img.png)",
        );
        assert!(!out.html.contains("javascript:"));
        assert!(!out.html.contains("//evil.example"));
        assert!(out.html.contains(r#"href="https://ok.example""#));
        assert!(!out.html.contains("http://x/img.png"));
        assert!(out.html.contains(r#"src="https://x/img.png""#));
    }

    #[test]
    fn collects_headings_with_unique_ids() {
        let out = render("# Title\n\n## Payroll & PAYE\n\n### Steps\n\n## Payroll & PAYE\n");
        let ids: Vec<_> = out.headings.iter().map(|h| (h.id.as_str(), h.level)).collect();
        assert_eq!(
            ids,
            vec![("payroll-paye", 2), ("steps", 3), ("payroll-paye-2", 2)]
        );
        assert!(out.html.contains(r#"<h2 id="payroll-paye">"#));
    }

    #[test]
    fn estimates_reading_time() {
        assert_eq!(reading_minutes("short"), 1);
        assert_eq!(reading_minutes(&"word ".repeat(401)), 3);
    }
}
