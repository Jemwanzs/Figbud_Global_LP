-- Pricing Studio (P11-PR1..PR6): one price book per product website, priced
-- in exact decimals by services/api/src/pricing/engine.rs, and quotations
-- that keep a frozen snapshot of what was offered.
--
-- Publishing a price book makes it available to the Studio's calculators
-- and quotations; showing prices on the website is a separate switch that is
-- off by default and only ever shows public, approved items.

CREATE TABLE pricing_books (
    site_id              UUID PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    draft                JSONB       NOT NULL,
    draft_version        INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by     UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published            JSONB,
    published_number     INTEGER     NOT NULL DEFAULT 0,
    published_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_at         TIMESTAMPTZ,
    effective_from       DATE,
    review_requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    review_requested_at  TIMESTAMPTZ,
    review_note          TEXT        CHECK (length(review_note) <= 300),
    -- Show pricing on the website: off until a reviewer switches it on.
    public_visible       BOOLEAN     NOT NULL DEFAULT false,
    CHECK (NOT public_visible OR published IS NOT NULL)
);

CREATE TABLE pricing_versions (
    id             UUID PRIMARY KEY,
    site_id        UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    number         INTEGER     NOT NULL,
    document       JSONB       NOT NULL,
    note           TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    effective_from DATE,
    requested_by   UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_by   UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, number)
);

CREATE TABLE pricing_quotes (
    id                 UUID PRIMARY KEY,
    site_id            UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    reference          TEXT        NOT NULL UNIQUE,
    customer_name      TEXT        NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 160),
    customer_contact   TEXT        NOT NULL DEFAULT '' CHECK (length(customer_contact) <= 200),
    status             TEXT        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired')),
    -- What was asked for, and the frozen result (lines, totals, terms) from
    -- price book version `book_version`: never recalculated afterwards.
    input              JSONB       NOT NULL,
    snapshot           JSONB       NOT NULL,
    book_version       INTEGER     NOT NULL,
    currency           TEXT        NOT NULL,
    due_first_period   NUMERIC(18, 4) NOT NULL,
    renewal_amount     NUMERIC(18, 4) NOT NULL,
    issue_date         DATE        NOT NULL,
    expiry_date        DATE        NOT NULL CHECK (expiry_date >= issue_date),
    terms              TEXT        NOT NULL DEFAULT '' CHECK (length(terms) <= 4000),
    -- Never shown to customers.
    internal_notes     TEXT        NOT NULL DEFAULT '' CHECK (length(internal_notes) <= 2000),
    -- Customer link: only a hash is kept; the token is shown once.
    share_token_hash   TEXT        UNIQUE,
    version            INTEGER     NOT NULL DEFAULT 1,
    created_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    submitted_by       UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    approved_by        UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pricing_quotes_site_idx ON pricing_quotes (site_id, created_at DESC);
