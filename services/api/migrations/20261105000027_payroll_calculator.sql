-- Payroll Calculator (P14-C): dated statutory rule sets per website, with a
-- draft, approval and numbered versions. The public page stays off until a
-- reviewer switches it on. Calculations are never stored.

CREATE TABLE site_payroll_calculators (
    site_id             UUID PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    draft               JSONB       NOT NULL,
    draft_version       INTEGER     NOT NULL DEFAULT 1,
    draft_updated_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    draft_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published           JSONB,
    published_number    INTEGER     NOT NULL DEFAULT 0,
    published_by        UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    published_at        TIMESTAMPTZ,
    public_visible      BOOLEAN     NOT NULL DEFAULT false,
    review_requested_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    review_requested_at TIMESTAMPTZ,
    review_note         TEXT,
    -- Nothing can be switched on before something is published.
    CONSTRAINT payroll_public_needs_published CHECK (NOT public_visible OR published IS NOT NULL)
);

CREATE TABLE payroll_calculator_versions (
    id           UUID PRIMARY KEY,
    site_id      UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    number       INTEGER     NOT NULL,
    config       JSONB       NOT NULL,
    note         TEXT,
    published_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, number)
);
