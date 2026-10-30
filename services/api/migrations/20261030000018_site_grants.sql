-- Per-website permissions (P7-F1). Everyone keeps one Studio role; people
-- can also be limited to selected websites, each with its own role (never
-- above their Studio role). Owners always have every website.

ALTER TABLE admin_users ADD COLUMN all_sites BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE admin_site_grants (
    user_id     UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    site_id     UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    role        TEXT        NOT NULL CHECK (role IN ('reviewer', 'editor', 'viewer')),
    granted_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, site_id)
);

CREATE INDEX admin_site_grants_site_idx ON admin_site_grants (site_id);

-- Website access chosen when inviting: null for every website, otherwise
-- `[{ "site_id": …, "role": … }]`, applied when the invite is accepted.
ALTER TABLE admin_invites ADD COLUMN site_grants JSONB;
