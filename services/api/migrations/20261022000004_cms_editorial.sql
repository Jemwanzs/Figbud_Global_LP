-- Editorial workflow on top of the CMS: who created, last edited and
-- submitted each article, so approvals can enforce maker-checker (the
-- approver differs from the last editor) and history stays attributable.

ALTER TABLE cms_articles
    ADD COLUMN created_by      UUID REFERENCES admin_users (id) ON DELETE SET NULL,
    ADD COLUMN last_edited_by  UUID REFERENCES admin_users (id) ON DELETE SET NULL,
    ADD COLUMN submitted_at    TIMESTAMPTZ;

ALTER TABLE cms_article_versions
    ADD COLUMN edited_by_user  UUID REFERENCES admin_users (id) ON DELETE SET NULL;

-- Editors list articles by recency of change.
CREATE INDEX cms_articles_updated_idx ON cms_articles (updated_at DESC);
