-- Approval authority (P13-B5). Without a rule, a kind keeps today's rule: a
-- reviewer on every website involved, never their own request unless an owner.
-- A rule can only narrow that: owners only, or named people (owners always
-- can), and one or two approvals, from different people.
CREATE TABLE approval_rules (
    kind       TEXT        PRIMARY KEY
        CHECK (kind IN ('page', 'brand', 'site_status', 'hero', 'pricing', 'payroll', 'campaign', 'proof', 'article')),
    approvers  TEXT        NOT NULL DEFAULT 'reviewer' CHECK (approvers IN ('reviewer', 'owner', 'people')),
    people     UUID[]      NOT NULL DEFAULT '{}',
    stages     SMALLINT    NOT NULL DEFAULT 1 CHECK (stages BETWEEN 1 AND 2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    CHECK (approvers <> 'people' OR cardinality(people) > 0)
);

-- First approvals of a request that needs two. A request is its revision, or
-- its item and the moment approval was asked for, so asking again (or
-- editing an article) starts over.
CREATE TABLE approval_steps (
    kind        TEXT        NOT NULL,
    request     TEXT        NOT NULL,
    approved_by UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    note        TEXT,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, request, approved_by)
);

-- A request handed to one approver (reassignment); owners can always decide.
CREATE TABLE approval_assignments (
    kind        TEXT        NOT NULL,
    request     TEXT        NOT NULL,
    assigned_to UUID        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    assigned_by UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, request)
);
