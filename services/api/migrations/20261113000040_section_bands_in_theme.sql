-- Section bands join the Brand & Theme Studio (owner's brief, 13 Nov 2026):
-- one palette for the whole website. Bands now inherit from the theme's
-- colours (the brand band from the dark mode's cards and panels, the soft
-- band from each mode's deeper surface), with optional overrides per mode
-- in `theme.bands`, saved as drafts and published like the rest of the theme.
--
-- The retired `brand_section` / `soft_section` colours:
-- * ZiraHR: dropped. They were the fixed brown and warm white of migration
--   31; the brief asks for its bands to follow its palette instead.
-- * Any other website (Ziwa's brown and ivory): kept as its overrides. The
--   brand colour overrides both modes (it was one colour for both), the soft
--   one the light mode (dark mode derived its own before).
-- Done for the published theme and any Studio draft, so publishing a draft
-- doesn't drop them. Older versions in the history keep the retired fields,
-- which the API still reads and no longer applies.

CREATE FUNCTION pg_temp.with_bands(theme JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
    SELECT (theme - 'brand_section' - 'soft_section')
        || CASE
               WHEN jsonb_typeof(theme->'brand_section') = 'string'
                 OR jsonb_typeof(theme->'soft_section') = 'string'
               THEN jsonb_build_object('bands', jsonb_strip_nulls(jsonb_build_object(
                   'light', NULLIF(jsonb_strip_nulls(jsonb_build_object(
                       'brand', theme->'brand_section',
                       'soft', theme->'soft_section')), '{}'::jsonb),
                   'dark', NULLIF(jsonb_strip_nulls(jsonb_build_object(
                       'brand', theme->'brand_section')), '{}'::jsonb))))
               ELSE '{}'::jsonb
           END
$$;

UPDATE sites
   SET settings = settings || jsonb_strip_nulls(jsonb_build_object(
           'theme', CASE WHEN jsonb_typeof(settings->'theme') = 'object'
                         THEN pg_temp.with_bands(settings->'theme') END,
           'theme_draft', CASE WHEN jsonb_typeof(settings->'theme_draft') = 'object'
                               THEN pg_temp.with_bands(settings->'theme_draft') END)),
       settings_version = settings_version + 1
 WHERE slug <> 'zirahr'
   AND (settings->'theme' ?| ARRAY['brand_section', 'soft_section']
        OR settings->'theme_draft' ?| ARRAY['brand_section', 'soft_section']);

UPDATE sites
   SET settings = settings
           || CASE WHEN jsonb_typeof(settings->'theme') = 'object'
                   THEN jsonb_build_object('theme', settings->'theme' - 'brand_section' - 'soft_section')
                   ELSE '{}'::jsonb END
           || CASE WHEN jsonb_typeof(settings->'theme_draft') = 'object'
                   THEN jsonb_build_object('theme_draft', settings->'theme_draft' - 'brand_section' - 'soft_section')
                   ELSE '{}'::jsonb END,
       settings_version = settings_version + 1
 WHERE slug = 'zirahr'
   AND (settings->'theme' ?| ARRAY['brand_section', 'soft_section']
        OR settings->'theme_draft' ?| ARRAY['brand_section', 'soft_section']);
