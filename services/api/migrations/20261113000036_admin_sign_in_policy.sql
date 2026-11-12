-- Organisation sign-in policy (P13-B4): one row for the whole Studio.
-- The defaults are today's behaviour, so nobody's sign-in changes until an
-- owner changes the policy.
CREATE TABLE admin_sign_in_policy (
    id                 BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
    password_sign_in   BOOLEAN     NOT NULL DEFAULT true,
    passkey_sign_in    BOOLEAN     NOT NULL DEFAULT true,
    -- Roles that must sign in with a passkey (phishing-resistant); password
    -- sign-in, which already always needs an authenticator code, is refused.
    passkey_only_roles TEXT[]      NOT NULL DEFAULT '{}'
        CHECK (passkey_only_roles <@ ARRAY['owner', 'reviewer', 'editor', 'viewer']),
    -- Signed out after this long without using the Studio; NULL: only the session's own expiry.
    idle_minutes       INTEGER     CHECK (idle_minutes BETWEEN 15 AND 1440),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by         UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    -- There is always a way in.
    CHECK (password_sign_in OR passkey_sign_in)
);

INSERT INTO admin_sign_in_policy DEFAULT VALUES;
