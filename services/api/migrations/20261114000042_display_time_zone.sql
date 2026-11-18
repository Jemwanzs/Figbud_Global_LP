-- Display time zone (owner's brief, 14 Nov 2026). Timestamps stay stored in
-- UTC; these only choose how the Studio shows them. The organisation's zone
-- (East Africa Time by default), and each person's own choice where they
-- set one (NULL: follow the organisation).
CREATE TABLE studio_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    time_zone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES admin_users (id) ON DELETE SET NULL
);
INSERT INTO studio_settings DEFAULT VALUES;

ALTER TABLE admin_users ADD COLUMN time_zone TEXT;
