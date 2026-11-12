-- Users & Access (owner's brief, 12 Nov 2026): owners can revoke a pending
-- invitation; a revoked link no longer works.

ALTER TABLE admin_invites ADD COLUMN revoked_at TIMESTAMPTZ;
