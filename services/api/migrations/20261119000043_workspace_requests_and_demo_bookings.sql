-- Start Now workspace requests and demo booking (owner's brief, 18 Nov 2026, P8-M8).

-- Workspace requests are enquiries of their own kind, in the same inbox.
ALTER TABLE enquiries DROP CONSTRAINT enquiries_kind_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_kind_check CHECK (kind IN (
    'demo_request', 'contact', 'early_access', 'waitlist', 'partnership', 'sales', 'referral',
    'workspace_request'));

-- New → Contacted → Qualified → Demo scheduled → Converted or Closed (or spam).
ALTER TABLE enquiries DROP CONSTRAINT enquiries_status_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check CHECK (status IN (
    'new', 'contacted', 'qualified', 'demo_scheduled', 'converted', 'closed', 'spam'));

-- Who follows the enquiry up (an editor or above; cleared if they leave).
ALTER TABLE enquiries ADD COLUMN assigned_to UUID REFERENCES admin_users (id) ON DELETE SET NULL;
CREATE INDEX enquiries_assigned_idx ON enquiries (assigned_to) WHERE assigned_to IS NOT NULL;

-- When each website takes demo bookings, in its own time zone (Africa/Nairobi
-- by default). Off until someone sets it up; the slots are worked out from it.
CREATE TABLE demo_availability (
    site_id     UUID        PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    settings    JSONB       NOT NULL,
    version     INTEGER     NOT NULL DEFAULT 1,
    updated_by  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A demo booked for a time slot, always with its enquiry (the visitor's details).
CREATE TABLE demo_bookings (
    id          UUID        PRIMARY KEY,
    enquiry_id  UUID        NOT NULL UNIQUE REFERENCES enquiries (id) ON DELETE CASCADE,
    product     TEXT        NOT NULL,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
    -- The zone the slot was offered in, so it reads the same in the Studio.
    time_zone   TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A slot holds one live booking per website. Reservations also take a
-- per-website lock and check for overlaps, so a changed slot length can't
-- double-book either; this index is the last line.
CREATE UNIQUE INDEX demo_bookings_live_slot ON demo_bookings (product, starts_at)
    WHERE status IN ('pending', 'confirmed');
CREATE INDEX demo_bookings_product_start_idx ON demo_bookings (product, starts_at);
