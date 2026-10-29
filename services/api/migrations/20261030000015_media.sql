-- Media library (P7-D2): images editors upload once per website and use on
-- its pages. Files are validated and re-encoded by the API (no metadata
-- survives); the bytes never change, while the name and alt text can be
-- edited. Usage is read from the pages themselves (`image_id` in sections).

CREATE TABLE media_assets (
    id            UUID PRIMARY KEY,
    site_id       UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    label         TEXT        NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    alt_text      TEXT        NOT NULL CHECK (length(alt_text) BETWEEN 1 AND 250),
    content_type  TEXT        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
    width         INTEGER     NOT NULL CHECK (width BETWEEN 1 AND 8192),
    height        INTEGER     NOT NULL CHECK (height BETWEEN 1 AND 8192),
    has_alpha     BOOLEAN     NOT NULL,
    byte_size     INTEGER     NOT NULL CHECK (byte_size > 0),
    -- Of the uploaded file, so the same upload isn't stored twice.
    sha256        TEXT        NOT NULL,
    data          BYTEA       NOT NULL,
    archived_at   TIMESTAMPTZ,
    created_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, sha256)
);

CREATE INDEX media_assets_site_idx ON media_assets (site_id, created_at DESC);

CREATE TABLE media_renditions (
    asset_id      UUID    NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
    width         INTEGER NOT NULL,
    content_type  TEXT    NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp')),
    data          BYTEA   NOT NULL,
    PRIMARY KEY (asset_id, width)
);
