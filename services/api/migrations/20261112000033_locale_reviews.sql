-- Localisation workflow (P7-G2): which translated languages of FigBud Global
-- are published (indexed, in sitemaps and hreflang), with the human review
-- that allowed it. English is always published and isn't listed. A language
-- is published only with a recorded review (who, when, where it's kept).

CREATE TABLE locale_reviews (
    code          TEXT PRIMARY KEY CHECK (code IN ('sw', 'fr', 'ar', 'zh')),
    status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    reviewer      TEXT        NOT NULL DEFAULT '' CHECK (length(reviewer) <= 120),
    reviewed_on   DATE,
    evidence      TEXT        NOT NULL DEFAULT '' CHECK (length(evidence) <= 300),
    note          TEXT        NOT NULL DEFAULT '' CHECK (length(note) <= 300),
    version       INTEGER     NOT NULL DEFAULT 1,
    updated_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status = 'draft' OR (reviewer <> '' AND reviewed_on IS NOT NULL AND evidence <> ''))
);

INSERT INTO locale_reviews (code) VALUES ('sw'), ('fr'), ('ar'), ('zh');
