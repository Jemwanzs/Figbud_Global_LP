//! Durable email outbox. Messages are written in the same transaction as the
//! enquiry they belong to, then delivered by a background worker with
//! exponential backoff. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so
//! several API replicas can run the worker safely.

use std::{sync::Arc, time::Duration};

use sqlx::{FromRow, PgPool, Postgres, Transaction};
use tokio::sync::watch;
use uuid::Uuid;

use super::{EmailSender, OutgoingEmail, SendError, team_recipients_for, templates::RenderedEmail};
use crate::{
    config::EmailConfig,
    enquiry::{EnquiryKind, Product},
};

const BATCH_SIZE: i64 = 10;
const BASE_BACKOFF_SECS: i64 = 30;
const MAX_BACKOFF_SECS: i64 = 3600;

pub async fn enqueue(
    tx: &mut Transaction<'_, Postgres>,
    enquiry_id: Uuid,
    to: &[String],
    reply_to: Option<&str>,
    email: &RenderedEmail,
) -> Result<Uuid, sqlx::Error> {
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO email_outbox (id, enquiry_id, template, to_addresses, reply_to, subject, html_body, text_body)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(id)
    .bind(enquiry_id)
    .bind(email.template)
    .bind(to)
    .bind(reply_to)
    .bind(&email.subject)
    .bind(&email.html)
    .bind(&email.text)
    .execute(&mut **tx)
    .await?;
    Ok(id)
}

#[derive(Debug, FromRow)]
struct ClaimedEmail {
    id: Uuid,
    enquiry_id: Uuid,
    to_addresses: Vec<String>,
    reply_to: Option<String>,
    subject: String,
    html_body: String,
    text_body: String,
    attempts: i32,
    max_attempts: i32,
}

/// Runs until `shutdown` flips to `true`.
pub async fn run_worker(
    pool: PgPool,
    sender: Arc<dyn EmailSender>,
    config: EmailConfig,
    mut shutdown: watch::Receiver<bool>,
) {
    tracing::info!(provider = sender.provider(), "email outbox worker started");
    let mut ticker = tokio::time::interval(config.worker_interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Err(err) = deliver_due(&pool, sender.as_ref(), &config).await {
                    tracing::warn!(error = %err, "email outbox pass failed");
                }
            }
            _ = shutdown.changed() => break,
        }
    }
    tracing::info!("email outbox worker stopped");
}

/// Claims and delivers one batch of due messages. Returns how many were attempted.
pub async fn deliver_due(
    pool: &PgPool,
    sender: &dyn EmailSender,
    config: &EmailConfig,
) -> Result<usize, sqlx::Error> {
    let claimed: Vec<ClaimedEmail> = sqlx::query_as(
        "UPDATE email_outbox
            SET status = 'sending', attempts = attempts + 1, locked_at = now(), updated_at = now()
          WHERE id IN (
                SELECT id FROM email_outbox
                 WHERE (status IN ('pending', 'retry') AND next_attempt_at <= now())
                    OR (status = 'sending' AND locked_at < now() - interval '10 minutes')
                 ORDER BY next_attempt_at
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED)
      RETURNING id, enquiry_id, to_addresses, reply_to, subject, html_body, text_body, attempts, max_attempts",
    )
    .bind(BATCH_SIZE)
    .fetch_all(pool)
    .await?;

    let count = claimed.len();
    for row in claimed {
        let mut to = row.to_addresses;
        if to.is_empty() {
            to = resolve_team(pool, config, row.enquiry_id).await?;
        }
        let email = OutgoingEmail {
            id: row.id,
            from: config.from.clone(),
            to,
            reply_to: row.reply_to,
            subject: row.subject,
            html: row.html_body,
            text: row.text_body,
        };
        let result = if email.to.is_empty() {
            Err(SendError::Transient("no team recipients configured".into()))
        } else {
            sender.send(&email).await
        };
        match result {
            Ok(message_id) => {
                // Only a provider's acceptance counts as sent; simulations are `skipped`.
                let status = if sender.simulated() { "skipped" } else { "sent" };
                sqlx::query(
                    "UPDATE email_outbox
                        SET status = $4, sent_at = CASE WHEN $4 = 'sent' THEN now() END,
                            provider = $2, provider_message_id = $3, to_addresses = $5,
                            last_error = NULL, locked_at = NULL, updated_at = now()
                      WHERE id = $1",
                )
                .bind(row.id)
                .bind(sender.provider())
                .bind(message_id)
                .bind(status)
                .bind(&email.to)
                .execute(pool)
                .await?;
            }
            Err(err) => {
                let exhausted = row.attempts >= row.max_attempts;
                let permanent = matches!(err, SendError::Permanent(_));
                let status = if exhausted || permanent { "failed" } else { "retry" };
                tracing::warn!(email_id = %row.id, attempt = row.attempts, status, error = %err, "email delivery failed");
                sqlx::query(
                    "UPDATE email_outbox
                        SET status = $2, last_error = $3, locked_at = NULL, provider = $4,
                            next_attempt_at = now() + make_interval(secs => $5), updated_at = now()
                      WHERE id = $1",
                )
                .bind(row.id)
                .bind(status)
                .bind(err.to_string())
                .bind(sender.provider())
                .bind(backoff(row.attempts).as_secs_f64())
                .execute(pool)
                .await?;
            }
        }
    }
    Ok(count)
}

/// Team recipients for a notification queued before any were configured.
async fn resolve_team(
    pool: &PgPool,
    config: &EmailConfig,
    enquiry_id: Uuid,
) -> Result<Vec<String>, sqlx::Error> {
    let (kind, product): (String, String) =
        sqlx::query_as("SELECT kind, product FROM enquiries WHERE id = $1")
            .bind(enquiry_id)
            .fetch_one(pool)
            .await?;
    Ok(match (EnquiryKind::parse(&kind), Product::parse(&product)) {
        (Some(kind), Some(product)) => team_recipients_for(config, kind, product),
        _ => config.team_recipients.clone(),
    })
}

/// 30s, 60s, 120s, ... capped at one hour.
pub fn backoff(attempt: i32) -> Duration {
    let exponent = attempt.saturating_sub(1).clamp(0, 16) as u32;
    let secs = BASE_BACKOFF_SECS
        .saturating_mul(1_i64 << exponent)
        .min(MAX_BACKOFF_SECS);
    Duration::from_secs(secs as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_exponentially_and_caps() {
        assert_eq!(backoff(1), Duration::from_secs(30));
        assert_eq!(backoff(2), Duration::from_secs(60));
        assert_eq!(backoff(4), Duration::from_secs(240));
        assert_eq!(backoff(20), Duration::from_secs(3600));
        assert_eq!(backoff(0), Duration::from_secs(30));
    }
}
