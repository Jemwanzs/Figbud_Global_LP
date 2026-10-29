-- Per-website settings managed in the Studio (P7-E2, P7-ZR1): navigation,
-- footer and whether the website takes enquiries. Validated by the API
-- (src/site_settings.rs); an empty document means the defaults.
ALTER TABLE sites ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 1;
