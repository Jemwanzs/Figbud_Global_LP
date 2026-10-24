-- Admin Studio, Phase C: pages built from typed blocks (D17), with drafts,
-- approved versions and rollback (D20). Page documents are validated by the
-- API (services/api/src/pages/blocks.rs); no markup is stored.

CREATE TABLE pages (
    id                  UUID PRIMARY KEY,
    site_id             UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    -- '' is the home page; otherwise lower-case segments joined by '/'.
    path                TEXT        NOT NULL CHECK (path = '' OR path ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,2}$'),
    title               TEXT        NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    position            INTEGER     NOT NULL DEFAULT 0,
    draft               JSONB       NOT NULL,
    draft_version       INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published           JSONB,
    published_revision  UUID,
    published_at        TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    created_by          UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live page per path on each website; archived pages free their path.
CREATE UNIQUE INDEX pages_site_path ON pages (site_id, path) WHERE archived_at IS NULL;
CREATE INDEX pages_site_position ON pages (site_id, position);

-- Submissions for publishing; approved ones are the version history.
CREATE TABLE page_revisions (
    id             UUID PRIMARY KEY,
    page_id        UUID        NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
    number         INTEGER     NOT NULL,
    document       JSONB       NOT NULL,
    note           TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    state          TEXT        NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'published', 'rejected', 'cancelled')),
    requested_by   UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decided_by     UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decision_note  TEXT        CHECK (decision_note IS NULL OR length(decision_note) <= 300),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at     TIMESTAMPTZ,
    UNIQUE (page_id, number)
);

CREATE UNIQUE INDEX page_revisions_one_pending ON page_revisions (page_id) WHERE state = 'pending';
