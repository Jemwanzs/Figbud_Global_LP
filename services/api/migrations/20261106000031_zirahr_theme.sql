-- ZiraHR's section bands in its warm palette (owner, 6 Nov 2026): "brand"
-- sections on warm brown with white text, "soft" sections on warm white in
-- the light theme. Only fills colours that were never set (nulls count as
-- unset), so a Studio choice is kept.
UPDATE sites
   SET settings = jsonb_set(
           settings,
           '{theme}',
           '{"brand_section": "#5c3317", "soft_section": "#fff7ee"}'::jsonb
               || jsonb_strip_nulls(COALESCE(settings->'theme', '{}'::jsonb))
       ),
       settings_version = settings_version + 1
 WHERE slug = 'zirahr';
