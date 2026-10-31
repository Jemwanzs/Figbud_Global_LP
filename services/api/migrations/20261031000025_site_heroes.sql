-- Hero Design Studio (P12-H1..H6): each website keeps several hero
-- variants (a design from the website's collection plus that design's own
-- settings) and publishes exactly one. Drafts never reach the website;
-- publishing needs approval, keeps every version and can roll back.

CREATE TABLE site_heroes (
    site_id              UUID PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    -- { variants: [{ id, design, name, config }], selected: variant id }
    draft                JSONB       NOT NULL,
    draft_version        INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by     UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The one live variant: { variant_id, design, name, config }.
    published            JSONB,
    published_number     INTEGER     NOT NULL DEFAULT 0,
    published_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_at         TIMESTAMPTZ,
    review_requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    review_requested_at  TIMESTAMPTZ,
    review_note          TEXT        CHECK (length(review_note) <= 300)
);

CREATE TABLE hero_versions (
    id            UUID PRIMARY KEY,
    site_id       UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    number        INTEGER     NOT NULL,
    hero          JSONB       NOT NULL,
    note          TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, number)
);
