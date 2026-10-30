-- SEO & search visibility per website (P9-S1). Kept apart from the website
-- settings document so saving navigation or footers never touches it.
-- `seo` is validated by services/api/src/seo.rs; `{}` means the defaults
-- (indexable, no templates or verification tags).
ALTER TABLE sites ADD COLUMN seo JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN seo_version INTEGER NOT NULL DEFAULT 1;
