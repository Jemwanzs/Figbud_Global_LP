-- Privacy & Cookies (P7-PC1): the cookie banner's settings and anonymous
-- consent records. One settings row for every FigBud website (one data
-- controller); records name the website the choice was made on.

CREATE TABLE privacy_settings (
    id          BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    config      JSONB       NOT NULL,
    version     INTEGER     NOT NULL DEFAULT 1,
    updated_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proof of consent without personal data: a random identifier kept in the
-- visitor's consent cookie, the choices and the policy version. No IP
-- address, user agent or account is stored.
CREATE TABLE consent_records (
    id              UUID PRIMARY KEY,
    consent_id      UUID        NOT NULL,
    site            TEXT        NOT NULL CHECK (site ~ '^[a-z][a-z_]{1,31}$'),
    action          TEXT        NOT NULL CHECK (action IN ('accept_all', 'reject_optional', 'custom')),
    analytics       BOOLEAN     NOT NULL,
    preferences     BOOLEAN     NOT NULL,
    marketing       BOOLEAN     NOT NULL,
    policy_version  INTEGER     NOT NULL CHECK (policy_version > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consent_records_created_idx ON consent_records (created_at DESC);
CREATE INDEX consent_records_consent_idx ON consent_records (consent_id, created_at DESC);
