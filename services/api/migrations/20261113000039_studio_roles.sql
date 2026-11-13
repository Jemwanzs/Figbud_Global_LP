-- Named Studio roles (P13-B3): saved sets of Studio areas and actions that
-- owners give to people. A person's own `admin_users.modules` stays what the
-- API checks; linking copies the role's areas, and changing a role updates
-- everyone linked to it.
CREATE TABLE studio_roles (
    id         UUID        PRIMARY KEY,
    name       TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
    modules    JSONB       NOT NULL,
    created_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX studio_roles_name_key ON studio_roles (lower(btrim(name)));

-- Deleting a role keeps everyone's areas as they are; only the link goes.
ALTER TABLE admin_users
    ADD COLUMN studio_role_id UUID REFERENCES studio_roles (id) ON DELETE SET NULL;
