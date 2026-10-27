-- Scheduled publishing for pages (P7-C3). An editor may ask for a change to
-- go live at a set time; it still needs approval. Once approved it waits as
-- 'scheduled' (the current version stays live) until the API's scheduler
-- publishes it. Only one change per page is in flight at a time.

ALTER TABLE page_revisions ADD COLUMN publish_at TIMESTAMPTZ;

ALTER TABLE page_revisions DROP CONSTRAINT page_revisions_state_check;
ALTER TABLE page_revisions ADD CONSTRAINT page_revisions_state_check
    CHECK (state IN ('pending', 'scheduled', 'published', 'rejected', 'cancelled'));
ALTER TABLE page_revisions ADD CONSTRAINT page_revisions_scheduled_has_time
    CHECK (state <> 'scheduled' OR publish_at IS NOT NULL);

DROP INDEX page_revisions_one_pending;
CREATE UNIQUE INDEX page_revisions_one_pending ON page_revisions (page_id) WHERE state IN ('pending', 'scheduled');

CREATE INDEX page_revisions_due ON page_revisions (publish_at) WHERE state = 'scheduled';
