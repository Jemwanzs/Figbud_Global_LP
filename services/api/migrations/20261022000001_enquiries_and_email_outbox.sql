-- Enquiries captured from public website forms (demo requests, contact,
-- early access, waitlists, partnerships, sales) and the transactional
-- email outbox that delivers team notifications and visitor acknowledgements.

CREATE TABLE enquiries (
    id               UUID PRIMARY KEY,
    reference        TEXT        NOT NULL UNIQUE,
    idempotency_key  UUID        NOT NULL UNIQUE,
    kind             TEXT        NOT NULL CHECK (kind IN (
                         'demo_request', 'contact', 'early_access',
                         'waitlist', 'partnership', 'sales')),
    product          TEXT        NOT NULL CHECK (product IN (
                         'figbud', 'zirahr', 'jasiri', 'expense_now')),
    name             TEXT        NOT NULL,
    email            TEXT        NOT NULL,
    company          TEXT,
    job_title        TEXT,
    phone            TEXT,
    country          TEXT,
    company_size     TEXT,
    message          TEXT,
    locale           TEXT        NOT NULL DEFAULT 'en',
    source_path      TEXT,
    user_agent       TEXT,
    ip_hash          TEXT,
    is_spam          BOOLEAN     NOT NULL DEFAULT FALSE,
    status           TEXT        NOT NULL DEFAULT 'new' CHECK (status IN (
                         'new', 'contacted', 'qualified', 'closed', 'spam')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX enquiries_created_at_idx ON enquiries (created_at DESC);
CREATE INDEX enquiries_kind_product_idx ON enquiries (kind, product, created_at DESC);
CREATE INDEX enquiries_email_idx ON enquiries (lower(email));

CREATE TABLE email_outbox (
    id                   UUID PRIMARY KEY,
    enquiry_id           UUID        REFERENCES enquiries (id) ON DELETE CASCADE,
    template             TEXT        NOT NULL,
    to_addresses         TEXT[]      NOT NULL,
    reply_to             TEXT,
    subject              TEXT        NOT NULL,
    html_body            TEXT        NOT NULL,
    text_body            TEXT        NOT NULL,
    status               TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN (
                             'pending', 'sending', 'retry', 'sent', 'failed', 'skipped')),
    attempts             INTEGER     NOT NULL DEFAULT 0,
    max_attempts         INTEGER     NOT NULL DEFAULT 6,
    next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at            TIMESTAMPTZ,
    last_error           TEXT,
    provider             TEXT,
    provider_message_id  TEXT,
    sent_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The delivery worker only ever scans deliverable rows.
CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at)
    WHERE status IN ('pending', 'retry');
CREATE INDEX email_outbox_enquiry_idx ON email_outbox (enquiry_id);
