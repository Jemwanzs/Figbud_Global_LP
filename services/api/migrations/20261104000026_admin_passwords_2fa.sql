-- Password sign-in with mandatory two-factor (P13-A). Passkeys are unchanged.
-- Passwords are Argon2id hashes; TOTP secrets are encrypted with a key held
-- outside the database (ADMIN_SECRETS_KEY); recovery codes and reset tokens are
-- stored only as hashes.

ALTER TABLE admin_users
    ADD COLUMN password_hash            TEXT,
    ADD COLUMN password_set_at          TIMESTAMPTZ,
    ADD COLUMN password_failed_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN password_locked_until    TIMESTAMPTZ,
    -- Encrypted TOTP secrets: the live one, and one being set up until its first code.
    ADD COLUMN totp_secret              BYTEA,
    ADD COLUMN totp_pending_secret      BYTEA,
    ADD COLUMN totp_confirmed_at        TIMESTAMPTZ,
    -- The last accepted time step: a code can't be used twice.
    ADD COLUMN totp_last_step           BIGINT,
    -- A password can't exist without two-factor.
    ADD CONSTRAINT admin_users_password_needs_2fa
        CHECK (password_hash IS NULL OR totp_confirmed_at IS NOT NULL);

CREATE TABLE admin_recovery_codes (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    code_hash  BYTEA       NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, code_hash)
);

-- Single-use, time-limited password recovery links.
CREATE TABLE admin_password_resets (
    id         UUID PRIMARY KEY,
    token_hash BYTEA       NOT NULL UNIQUE,
    user_id    UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    -- The owner who created the link; null when requested by email.
    created_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_password_resets_user_idx ON admin_password_resets (user_id, created_at DESC);

ALTER TABLE admin_sessions
    -- How the session was signed in, shown in Security & Authentication.
    ADD COLUMN auth_method    TEXT NOT NULL DEFAULT 'passkey',
    -- Sensitive changes need a recent identity check.
    ADD COLUMN verified_until TIMESTAMPTZ;

ALTER TABLE admin_challenges DROP CONSTRAINT admin_challenges_kind_check;
ALTER TABLE admin_challenges ADD CONSTRAINT admin_challenges_kind_check
    CHECK (kind IN ('register', 'login', 'password_2fa', 'step_up', 'add_passkey'));
