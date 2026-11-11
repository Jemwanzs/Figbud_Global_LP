-- The Admin Studio's own appearance (owner's brief, 12 Nov 2026): its light
-- and dark colours, managed in Settings & Security → Appearance & themes and
-- independent of every website's theme. One row: the published appearance
-- (empty means the built-in palette), a draft, and the published versions
-- kept for rollback (newest first, at most ten).

CREATE TABLE studio_appearance (
    id          BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    published   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    draft       JSONB,
    history     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    version     INTEGER     NOT NULL DEFAULT 1,
    updated_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO studio_appearance (id) VALUES (true);
