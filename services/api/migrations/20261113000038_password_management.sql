-- Database-driven password management (owner's brief, 13 Nov 2026).

-- Two-factor with a password becomes the sign-in policy's choice, per role
-- (it was always required). The default keeps it required for everyone.
ALTER TABLE admin_users DROP CONSTRAINT admin_users_password_needs_2fa;
ALTER TABLE admin_sign_in_policy
    ADD COLUMN two_factor_roles TEXT[] NOT NULL DEFAULT ARRAY['owner', 'reviewer', 'editor', 'viewer']
        CHECK (two_factor_roles <@ ARRAY['owner', 'reviewer', 'editor', 'viewer']);

-- When the account itself last changed (not sign-in bookkeeping).
ALTER TABLE admin_users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE FUNCTION admin_users_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.email, NEW.name, NEW.role, NEW.all_sites, NEW.modules, NEW.disabled_at,
           NEW.password_hash, NEW.totp_confirmed_at)
       IS DISTINCT FROM
       ROW(OLD.email, OLD.name, OLD.role, OLD.all_sites, OLD.modules, OLD.disabled_at,
           OLD.password_hash, OLD.totp_confirmed_at) THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER admin_users_touch BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION admin_users_touch();

-- A passkey proved who this is, recently: it can set a new password without
-- the old one (a forgotten password, reset with the passkey).
ALTER TABLE admin_sessions ADD COLUMN passkey_verified_until TIMESTAMPTZ;

-- Invitations carry the person's name and Studio areas, set by the owner.
ALTER TABLE admin_invites ADD COLUMN name TEXT CHECK (char_length(name) BETWEEN 1 AND 80);
ALTER TABLE admin_invites ADD COLUMN modules JSONB;
