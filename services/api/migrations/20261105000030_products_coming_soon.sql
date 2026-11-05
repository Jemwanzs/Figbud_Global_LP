-- The owner's instruction of 5 Nov 2026: every product website except ZiraHR
-- shows Coming Soon until it's approved for launch. Recorded as approved status
-- changes, like the Studio's own, so the history and audit log explain it.
-- Owners change a website's status from the Studio when it's ready.
INSERT INTO site_status_requests (id, site_id, from_status, to_status, reason, decision, decision_note, decided_at)
SELECT gen_random_uuid(), id, status, 'coming_soon',
       'The owner''s instruction of 5 Nov 2026: Coming Soon until approved for launch.',
       'approved', 'Applied by migration 30.', now()
  FROM sites
 WHERE kind = 'product' AND slug <> 'zirahr' AND status IN ('beta', 'active') AND archived_at IS NULL;

INSERT INTO audit_log (id, action, target_type, target_id, detail, site_id)
SELECT gen_random_uuid(), 'site.status_approved', 'site', id::text,
       jsonb_build_object('from', status, 'to', 'coming_soon', 'authorised_by', 'owner, 5 Nov 2026'), id
  FROM sites
 WHERE kind = 'product' AND slug <> 'zirahr' AND status IN ('beta', 'active') AND archived_at IS NULL;

UPDATE sites SET status = 'coming_soon', version = version + 1, updated_at = now()
 WHERE kind = 'product' AND slug <> 'zirahr' AND status IN ('beta', 'active') AND archived_at IS NULL;
