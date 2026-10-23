-- Admin Studio: brand profiles and the logo library (docs/BRAND_ASSETS.md).
-- One brand profile per website. Assets are immutable once stored (a
-- replacement is a new asset), so earlier versions and published pages
-- never break; unused assets are archived, not deleted.

CREATE TABLE brand_assets (
    id            UUID PRIMARY KEY,
    site_id       UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    label         TEXT        NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    alt_text      TEXT        NOT NULL CHECK (length(alt_text) BETWEEN 1 AND 200),
    content_type  TEXT        NOT NULL CHECK (content_type IN ('image/svg+xml', 'image/png', 'image/webp')),
    width         INTEGER     NOT NULL CHECK (width BETWEEN 1 AND 8192),
    height        INTEGER     NOT NULL CHECK (height BETWEEN 1 AND 8192),
    has_alpha     BOOLEAN     NOT NULL,
    byte_size     INTEGER     NOT NULL CHECK (byte_size > 0),
    sha256        TEXT        NOT NULL,
    -- SVGs are stored sanitised (parsed and re-serialised); rasters as uploaded.
    data          BYTEA       NOT NULL,
    -- official: FigBud's supplied artwork (or an exact crop of it);
    -- proposed: derived or concept artwork awaiting the owner's approval.
    origin        TEXT        NOT NULL DEFAULT 'upload' CHECK (origin IN ('official', 'proposed', 'upload')),
    archived_at   TIMESTAMPTZ,
    created_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, sha256)
);

CREATE INDEX brand_assets_site_idx ON brand_assets (site_id, created_at DESC);

-- Downscaled copies for responsive delivery and admin thumbnails (WebP).
CREATE TABLE brand_asset_renditions (
    asset_id      UUID    NOT NULL REFERENCES brand_assets (id) ON DELETE CASCADE,
    width         INTEGER NOT NULL CHECK (width > 0),
    content_type  TEXT    NOT NULL,
    data          BYTEA   NOT NULL,
    PRIMARY KEY (asset_id, width)
);

-- The working draft and the published profile. `config` documents are
-- validated by the API (services/api/src/brand/config.rs).
CREATE TABLE site_brands (
    site_id             UUID PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    draft               JSONB       NOT NULL,
    draft_version       INTEGER     NOT NULL DEFAULT 1,
    draft_note          TEXT        CHECK (draft_note IS NULL OR length(draft_note) <= 300),
    draft_updated_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published           JSONB,
    published_revision  UUID,
    published_at        TIMESTAMPTZ
);

-- Every submission for publishing; approved revisions are the version history
-- that rollback restores from.
CREATE TABLE brand_revisions (
    id             UUID PRIMARY KEY,
    site_id        UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    number         INTEGER     NOT NULL,
    config         JSONB       NOT NULL,
    note           TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    state          TEXT        NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'published', 'rejected', 'cancelled')),
    requested_by   UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decided_by     UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decision_note  TEXT        CHECK (decision_note IS NULL OR length(decision_note) <= 300),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at     TIMESTAMPTZ,
    UNIQUE (site_id, number)
);

CREATE UNIQUE INDEX brand_revisions_one_pending ON brand_revisions (site_id) WHERE state = 'pending';
