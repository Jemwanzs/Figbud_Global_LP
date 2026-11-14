-- Page translations (P7-L2, owner's brief, 14 Nov 2026): each published
-- page's visible text in another language, as translated fields over the
-- English page (services/api/src/pages/translations.rs). Each field keeps the
-- English it was translated from, so outdated fields show in English.
-- Draft -> needs_review (complete) -> complete (a recorded reviewer) ->
-- published (a snapshot of the complete, reviewed fields).

CREATE TABLE page_translations (
    page_id      UUID        NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
    locale       TEXT        NOT NULL CHECK (locale IN ('sw', 'fr', 'ar', 'zh')),
    fields       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status       TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs_review', 'complete')),
    reviewer     TEXT        NOT NULL DEFAULT '' CHECK (length(reviewer) <= 120),
    reviewed_at  TIMESTAMPTZ,
    published    JSONB,
    published_at TIMESTAMPTZ,
    version      INTEGER     NOT NULL DEFAULT 1,
    updated_by   UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (page_id, locale),
    -- A reviewed translation names its reviewer.
    CHECK (status <> 'complete' OR (reviewer <> '' AND reviewed_at IS NOT NULL))
);
