-- Per-site themes (P7-E1): Ziwa LMS's section bands use its brand brown and
-- the ivory of its approved brand sheet (owner request, 28-29 Oct 2026).
-- Only fills colours that were never set, so a Studio choice is kept.
UPDATE sites
   SET settings = jsonb_set(
           settings,
           '{theme}',
           '{"brand_section": "#4e2d17", "soft_section": "#fdf9f4"}'::jsonb || COALESCE(settings->'theme', '{}'::jsonb)
       ),
       settings_version = settings_version + 1
 WHERE slug = 'ziwa';
