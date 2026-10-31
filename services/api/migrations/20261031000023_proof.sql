-- Customers & proof (P10-T1..T3): Trusted By organisations, testimonials and
-- verified success metrics, managed once in the Studio (Content & Marketing)
-- and shown on any number of websites without copies.
--
-- Each record has a working draft and, once a reviewer approves it, a
-- published snapshot with the websites it was approved for; websites only
-- ever read published snapshots. The API refuses to publish an organisation
-- or testimonial without recorded permission, or a metric without a source,
-- a measurement period and verification (services/api/src/proof.rs).

CREATE TABLE proof_items (
    id                   UUID PRIMARY KEY,
    kind                 TEXT        NOT NULL CHECK (kind IN ('organization', 'testimonial', 'metric')),
    draft                JSONB       NOT NULL,
    -- Websites (slugs) the draft is meant for.
    draft_sites          TEXT[]      NOT NULL DEFAULT '{}',
    draft_version        INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by     UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- What websites show, and where: changed only by approval.
    published            JSONB,
    published_sites      TEXT[]      NOT NULL DEFAULT '{}',
    published_number     INTEGER     NOT NULL DEFAULT 0,
    published_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_at         TIMESTAMPTZ,
    -- A pending request for approval of the current draft.
    review_requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    review_requested_at  TIMESTAMPTZ,
    review_note          TEXT        CHECK (length(review_note) <= 300),
    -- Operational switches (reviewers, audited): hide without unpublishing, and order.
    active               BOOLEAN     NOT NULL DEFAULT true,
    sort_order           INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
    archived_at          TIMESTAMPTZ,
    created_by           UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (published IS NOT NULL OR published_sites = '{}'),
    CHECK (archived_at IS NULL OR published IS NULL)
);

CREATE INDEX proof_items_live_idx ON proof_items USING gin (published_sites)
    WHERE published IS NOT NULL AND active AND archived_at IS NULL;

-- Every approved version, for history and audit.
CREATE TABLE proof_versions (
    id            UUID PRIMARY KEY,
    item_id       UUID        NOT NULL REFERENCES proof_items (id) ON DELETE CASCADE,
    number        INTEGER     NOT NULL,
    document      JSONB       NOT NULL,
    sites         TEXT[]      NOT NULL,
    note          TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, number)
);
