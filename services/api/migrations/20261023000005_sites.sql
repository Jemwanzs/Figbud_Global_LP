-- Admin Studio, Phase B: the website and product registry.
-- One row per website (the corporate site and each product). Marketing
-- lifecycle status only: it never switches on the operational product (D19).

CREATE TABLE sites (
    id              UUID PRIMARY KEY,
    -- Immutable once created: enquiries, links and content refer to it.
    slug            TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$' AND length(slug) <= 40),
    kind            TEXT        NOT NULL CHECK (kind IN ('corporate', 'product')),
    name            TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    tagline         TEXT        CHECK (tagline IS NULL OR length(tagline) <= 160),
    description     TEXT        CHECK (description IS NULL OR length(description) <= 600),
    category        TEXT        NOT NULL CHECK (category IN (
                        'corporate', 'hr_workforce', 'lending_credit', 'finance_payments', 'custom_enterprise')),
    template        TEXT        NOT NULL CHECK (template IN ('corporate', 'hr', 'lending', 'finance', 'custom')),
    status          TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft', 'coming_soon', 'beta', 'active', 'retired')),
    primary_domain  TEXT        UNIQUE CHECK (primary_domain IS NULL OR
                        primary_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
    position        INTEGER     NOT NULL DEFAULT 0,
    archived_at     TIMESTAMPTZ,
    version         INTEGER     NOT NULL DEFAULT 1,
    created_by      UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_by      UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Exactly one corporate site.
    CONSTRAINT sites_corporate_is_figbud CHECK (kind <> 'corporate' OR slug = 'figbud')
);

CREATE INDEX sites_listing_idx ON sites (position, name) WHERE archived_at IS NULL;

-- Lifecycle transitions go through a request and a second person's decision.
CREATE TABLE site_status_requests (
    id            UUID PRIMARY KEY,
    site_id       UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    from_status   TEXT        NOT NULL,
    to_status     TEXT        NOT NULL CHECK (to_status IN ('draft', 'coming_soon', 'beta', 'active', 'retired')),
    reason        TEXT        NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    requested_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decision      TEXT        NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected', 'cancelled')),
    decided_by    UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    decision_note TEXT        CHECK (decision_note IS NULL OR length(decision_note) <= 500),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at    TIMESTAMPTZ,
    CHECK (from_status <> to_status)
);

-- At most one open request per site.
CREATE UNIQUE INDEX site_status_requests_one_pending ON site_status_requests (site_id) WHERE decision = 'pending';

-- Audit entries can now name the website they concern.
ALTER TABLE audit_log ADD COLUMN site_id UUID REFERENCES sites (id) ON DELETE SET NULL;
CREATE INDEX audit_log_site_idx ON audit_log (site_id, created_at DESC);

-- Today's websites, matching the code registry in @figbud/brand.
INSERT INTO sites (id, slug, kind, name, tagline, description, category, template, status, position) VALUES
    ('01928d6c-0000-7000-8000-000000000001', 'figbud', 'corporate', 'FigBud Global',
     'From vision to value, we deliver.',
     'Enterprise technology that moves business forward. Configurable. Reliable. Ready to scale.',
     'corporate', 'corporate', 'active', 0),
    ('01928d6c-0000-7000-8000-000000000002', 'zirahr', 'product', 'ZiraHR',
     'People. Payroll. Progress. Connected.',
     'Workforce operations, compliant payroll, approvals and intelligence in one configurable platform.',
     'hr_workforce', 'hr', 'active', 1),
    ('01928d6c-0000-7000-8000-000000000003', 'jasiri', 'product', 'Jasiri LMS',
     'Every loan. Every decision. Connected.',
     'From origination and credit assessment to disbursement, collections and portfolio intelligence.',
     'lending_credit', 'lending', 'active', 2),
    ('01928d6c-0000-7000-8000-000000000004', 'expense_now', 'product', 'Expense Now',
     'Spend smarter. Move money better.',
     'Expense controls, payment workflows, approvals and multicurrency financial operations.',
     'finance_payments', 'finance', 'coming_soon', 3)
ON CONFLICT (slug) DO NOTHING;
