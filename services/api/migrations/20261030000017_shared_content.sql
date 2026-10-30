-- Content library (P7-D1): sections written once and used on pages of any
-- FigBud website. Pages reference an item (`shared_id`), never copy it, and
-- always show its latest published version. Each publish is kept as a
-- numbered version that can be restored into the draft.

CREATE TABLE shared_blocks (
    id                 UUID PRIMARY KEY,
    name               TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    -- One block (see services/api/src/pages/blocks.rs), validated by the API.
    draft              JSONB       NOT NULL,
    draft_version      INTEGER     NOT NULL DEFAULT 1,
    published          JSONB,
    published_number   INTEGER,
    published_at       TIMESTAMPTZ,
    archived_at        TIMESTAMPTZ,
    created_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shared_block_versions (
    block_id      UUID        NOT NULL REFERENCES shared_blocks (id) ON DELETE CASCADE,
    number        INTEGER     NOT NULL CHECK (number > 0),
    content       JSONB       NOT NULL,
    note          TEXT        NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
    published_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (block_id, number)
);
