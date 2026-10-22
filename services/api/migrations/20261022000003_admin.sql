-- Admin access: invited users who sign in with passkeys (WebAuthn), server-side
-- sessions, single-use ceremony challenges, and an audit log of admin actions.
-- Secrets (invite and session tokens) are stored only as SHA-256 hashes.

CREATE TABLE admin_users (
    id             UUID PRIMARY KEY,
    email          TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    -- owner: everything incl. users · reviewer: approve and publish ·
    -- editor: write drafts · viewer: read only.
    role           TEXT        NOT NULL CHECK (role IN ('owner', 'reviewer', 'editor', 'viewer')),
    disabled_at    TIMESTAMPTZ,
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_users_email_idx ON admin_users (lower(email));

CREATE TABLE admin_passkeys (
    id             UUID PRIMARY KEY,
    user_id        UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    credential_id  BYTEA       NOT NULL UNIQUE,
    -- Serialised webauthn-rs Passkey (public key, counter, backup state).
    passkey        JSONB       NOT NULL,
    label          TEXT        NOT NULL DEFAULT 'Passkey',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at   TIMESTAMPTZ
);

CREATE INDEX admin_passkeys_user_idx ON admin_passkeys (user_id);

CREATE TABLE admin_invites (
    id          UUID PRIMARY KEY,
    token_hash  BYTEA       NOT NULL UNIQUE,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('owner', 'reviewer', 'editor', 'viewer')),
    created_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
    id            UUID PRIMARY KEY,
    token_hash    BYTEA       NOT NULL UNIQUE,
    user_id       UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    ip_hash       TEXT,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX admin_sessions_user_idx ON admin_sessions (user_id);

-- Server-side WebAuthn ceremony state: consumed once, expires in minutes.
CREATE TABLE admin_challenges (
    id          UUID PRIMARY KEY,
    kind        TEXT        NOT NULL CHECK (kind IN ('register', 'login')),
    invite_id   UUID        REFERENCES admin_invites (id) ON DELETE CASCADE,
    user_id     UUID        REFERENCES admin_users (id) ON DELETE CASCADE,
    name        TEXT,
    state       JSONB       NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id             UUID PRIMARY KEY,
    actor_user_id  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    action         TEXT        NOT NULL,
    target_type    TEXT,
    target_id      TEXT,
    detail         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ip_hash        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, created_at DESC);
