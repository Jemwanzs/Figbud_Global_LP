//! Transactional email: rendering, recipient routing, provider delivery and a
//! durable outbox so that delivery is retryable and never duplicates enquiries.

pub mod outbox;
pub mod templates;

use std::time::Duration;

use async_trait::async_trait;
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    config::{EmailConfig, EmailMode},
    enquiry::{Enquiry, EnquiryKind, Product},
};

#[derive(Debug, Clone)]
pub struct OutgoingEmail {
    /// Stable id used as the provider idempotency key, so retries never send twice.
    pub id: Uuid,
    pub from: String,
    pub to: Vec<String>,
    pub reply_to: Option<String>,
    pub subject: String,
    pub html: String,
    pub text: String,
}

#[derive(Debug, Error)]
pub enum SendError {
    /// Worth retrying: network failures, timeouts, 429 and 5xx responses.
    #[error("transient: {0}")]
    Transient(String),
    /// Retrying will not help: invalid sender, bad recipient, auth failure.
    #[error("permanent: {0}")]
    Permanent(String),
}

#[async_trait]
pub trait EmailSender: Send + Sync {
    fn provider(&self) -> &'static str;
    /// True when `send` only simulates delivery; such messages are recorded
    /// as `skipped`, never `sent`.
    fn simulated(&self) -> bool {
        false
    }
    /// Returns the provider's message id on success.
    async fn send(&self, email: &OutgoingEmail) -> Result<String, SendError>;
}

/// Local development sender: logs the message instead of delivering it.
pub struct LogSender;

#[async_trait]
impl EmailSender for LogSender {
    fn provider(&self) -> &'static str {
        "log"
    }

    fn simulated(&self) -> bool {
        true
    }

    async fn send(&self, email: &OutgoingEmail) -> Result<String, SendError> {
        tracing::info!(
            email_id = %email.id,
            to = ?email.to,
            subject = %email.subject,
            "simulated email delivery (EMAIL_MODE=log)\n{}",
            email.text
        );
        Ok(format!("log-{}", email.id))
    }
}

pub struct ResendSender {
    client: reqwest::Client,
    api_key: String,
}

impl ResendSender {
    const ENDPOINT: &'static str = "https://api.resend.com/emails";

    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .expect("reqwest client builds with static configuration");
        Self { client, api_key }
    }
}

#[derive(Serialize)]
struct ResendPayload<'a> {
    from: &'a str,
    to: &'a [String],
    subject: &'a str,
    html: &'a str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_to: Option<&'a str>,
}

#[derive(serde::Deserialize)]
struct ResendResponse {
    id: String,
}

#[async_trait]
impl EmailSender for ResendSender {
    fn provider(&self) -> &'static str {
        "resend"
    }

    async fn send(&self, email: &OutgoingEmail) -> Result<String, SendError> {
        let response = self
            .client
            .post(Self::ENDPOINT)
            .bearer_auth(&self.api_key)
            .header("Idempotency-Key", email.id.to_string())
            .json(&ResendPayload {
                from: &email.from,
                to: &email.to,
                subject: &email.subject,
                html: &email.html,
                text: &email.text,
                reply_to: email.reply_to.as_deref(),
            })
            .send()
            .await
            .map_err(|e| SendError::Transient(e.to_string()))?;

        let status = response.status();
        if status.is_success() {
            return response
                .json::<ResendResponse>()
                .await
                .map(|r| r.id)
                .map_err(|e| SendError::Transient(format!("unreadable provider response: {e}")));
        }

        let body = response.text().await.unwrap_or_default();
        let detail = format!("resend responded {status}: {}", truncate(&body, 500));
        if status.as_u16() == 429 || status.is_server_error() {
            Err(SendError::Transient(detail))
        } else {
            Err(SendError::Permanent(detail))
        }
    }
}

/// The configured sender, or `None` while delivery is on hold.
pub fn build_sender(config: &EmailConfig) -> Option<Box<dyn EmailSender>> {
    match &config.mode {
        EmailMode::Log => Some(Box::new(LogSender)),
        EmailMode::Hold => None,
        EmailMode::Resend { api_key } => Some(Box::new(ResendSender::new(api_key.clone()))),
    }
}

/// Team recipients for an enquiry: the default team list plus any
/// product- or topic-specific routing, de-duplicated case-insensitively.
pub fn team_recipients(config: &EmailConfig, enquiry: &Enquiry) -> Vec<String> {
    team_recipients_for(config, enquiry.kind, enquiry.product)
}

/// Routing by enquiry kind and product. Also used at delivery time for team
/// notifications queued before any recipients were configured.
pub fn team_recipients_for(config: &EmailConfig, kind: EnquiryKind, product: Product) -> Vec<String> {
    let mut recipients = config.team_recipients.clone();
    let product_specific = match product {
        Product::Zirahr => &config.zirahr_recipients,
        Product::Jasiri => &config.jasiri_recipients,
        Product::ExpenseNow => &config.expense_now_recipients,
        Product::Figbud => &Vec::new(),
    };
    recipients.extend(product_specific.iter().cloned());
    if kind == EnquiryKind::Partnership {
        recipients.extend(config.partnership_recipients.iter().cloned());
    }
    let mut seen = std::collections::HashSet::new();
    recipients.retain(|r| seen.insert(r.to_lowercase()));
    recipients
}

fn truncate(raw: &str, max: usize) -> &str {
    match raw.char_indices().nth(max) {
        Some((idx, _)) => &raw[..idx],
        None => raw,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::EmailMode;

    fn config() -> EmailConfig {
        EmailConfig {
            mode: EmailMode::Log,
            from: "FigBud <no-reply@localhost>".into(),
            reply_to: None,
            team_recipients: vec!["cto@example.com".into()],
            zirahr_recipients: vec!["hr-sales@example.com".into(), "CTO@example.com".into()],
            jasiri_recipients: vec![],
            expense_now_recipients: vec![],
            partnership_recipients: vec!["partners@example.com".into()],
            send_acknowledgements: true,
            worker_interval: Duration::from_secs(5),
        }
    }

    fn enquiry(kind: EnquiryKind, product: Product) -> Enquiry {
        Enquiry {
            kind,
            product,
            name: "Test Person".into(),
            email: "t@example.com".into(),
            company: None,
            job_title: None,
            phone: None,
            country: None,
            company_size: None,
            message: None,
            locale: "en".into(),
            source_path: None,
        }
    }

    #[test]
    fn routes_product_enquiries_and_deduplicates() {
        let to = team_recipients(&config(), &enquiry(EnquiryKind::DemoRequest, Product::Zirahr));
        assert_eq!(to, ["cto@example.com", "hr-sales@example.com"]);
    }

    #[test]
    fn routes_partnerships_to_partnership_inbox() {
        let to = team_recipients(&config(), &enquiry(EnquiryKind::Partnership, Product::Figbud));
        assert_eq!(to, ["cto@example.com", "partners@example.com"]);
    }

    #[test]
    fn truncate_respects_char_boundaries() {
        assert_eq!(truncate("héllo", 2), "hé");
        assert_eq!(truncate("hi", 10), "hi");
    }
}
