-- Campaigns & promotions (P8-M1). A campaign belongs to exactly one website
-- (corporate or product). Its content, design, display rules, schedule and
-- rewards are one typed document (services/api/src/campaigns/doc.rs) with a
-- working draft and approved, versioned publications, like pages.

CREATE TABLE campaigns (
    id                  UUID PRIMARY KEY,
    site_id             UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    name                TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    -- Short internal reference, unique across campaigns (e.g. ZHR-2026-BF).
    reference           TEXT        NOT NULL UNIQUE CHECK (reference ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
    kind                TEXT        NOT NULL CHECK (kind IN ('hero', 'announcement', 'floating', 'modal', 'seasonal',
                                                             'countdown', 'launch', 'rewards', 'referral', 'event')),
    objective           TEXT        NOT NULL DEFAULT '' CHECK (length(objective) <= 200),
    description         TEXT        NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    owner_id            UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft               JSONB       NOT NULL,
    draft_version       INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published           JSONB,
    published_revision  UUID,
    published_at        TIMESTAMPTZ,
    -- When the published version is shown (copied from it on approval, so
    -- websites can filter without reading documents).
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    priority            INTEGER     NOT NULL DEFAULT 0,
    paused_at           TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    created_by          UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaigns_live_idx ON campaigns (site_id, starts_at, ends_at)
    WHERE published IS NOT NULL AND paused_at IS NULL AND archived_at IS NULL;

CREATE TABLE campaign_revisions (
    id              UUID PRIMARY KEY,
    campaign_id     UUID        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    number          INTEGER     NOT NULL,
    document        JSONB       NOT NULL,
    note            TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    state           TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (state IN ('pending', 'published', 'rejected', 'cancelled')),
    requested_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decided_by      UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decision_note   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at      TIMESTAMPTZ,
    UNIQUE (campaign_id, number)
);

CREATE UNIQUE INDEX campaign_revisions_one_pending ON campaign_revisions (campaign_id) WHERE state = 'pending';

-- Visitor events, counted per day: no identifiers, cookies or personal data.
CREATE TABLE campaign_events (
    campaign_id  UUID   NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    day          DATE   NOT NULL,
    kind         TEXT   NOT NULL CHECK (kind IN ('impression', 'click', 'dismiss', 'conversion')),
    count        BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (campaign_id, day, kind)
);

-- Reward stock for interactive campaigns, synced from the published document
-- (rewards keep their id across versions, so awarded counts carry over).
CREATE TABLE campaign_rewards (
    campaign_id  UUID    NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    reward_id    TEXT    NOT NULL,
    label        TEXT    NOT NULL,
    -- NULL: unlimited.
    quantity     INTEGER CHECK (quantity IS NULL OR quantity >= 0),
    awarded      INTEGER NOT NULL DEFAULT 0 CHECK (awarded >= 0),
    weight       INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 1000),
    active       BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (campaign_id, reward_id),
    CHECK (quantity IS NULL OR awarded <= quantity)
);

-- Entries: one row per attempt. Participants are identified by a salted hash
-- of their email (the email itself is kept only to deliver the reward).
CREATE TABLE campaign_entries (
    id                UUID PRIMARY KEY,
    campaign_id       UUID        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    participant_hash  TEXT        NOT NULL,
    email             TEXT        NOT NULL CHECK (length(email) <= 254),
    reward_id         TEXT,
    code              TEXT        UNIQUE,
    redeem_by         TIMESTAMPTZ,
    redeemed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaign_entries_participant_idx ON campaign_entries (campaign_id, participant_hash);

-- Enquiries remember the campaign that brought them (attribution).
ALTER TABLE enquiries ADD COLUMN campaign_id UUID REFERENCES campaigns (id) ON DELETE SET NULL;
