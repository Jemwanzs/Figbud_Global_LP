-- Corporate pages in the Studio (30 Oct 2026). The corporate website shows
-- About Us from approved copy; these drafts let editors change it through
-- the usual draft → review → publish flow (a published Studio page replaces
-- the built-in one). The legal pages start as drafts awaiting counsel's
-- text: nothing here is published, and no legal commitment is written.

INSERT INTO pages (id, site_id, path, title, position, draft)
SELECT v.id::uuid, s.id, v.path, v.title, v.position, v.draft::jsonb
  FROM sites s,
       (VALUES
          ('01930000-0000-7000-8000-00000000a001', 'about', 'About Us', 10, $about$
{"seo_description": "FigBud Global builds configurable enterprise software in Kenya, for Africa and beyond.",
 "sections": [
  {"id": "intro", "type": "text", "heading": "Technology should adapt to your business. Not the other way around.",
   "body": "FigBud Global is an African technology company building enterprise software for organisations whose operations are too important for generic tools."},
  {"id": "philosophy", "type": "feature_grid", "heading": "Software should fit the way you work. So we build it to bend, not break.",
   "items": [
    {"title": "Configurable by design.", "body": "Policies, workflows, approval levels and rules live in configuration, not code. Your organisation's way of working becomes the product's way of working."},
    {"title": "Reliable by architecture.", "body": "Audit trails, idempotent transactions, role-based access and tested calculation engines are the foundation, not features added later."},
    {"title": "Flexible for growth.", "body": "New branches, entities, currencies, languages and markets arrive as validated configuration, so growing never means starting again."}]},
  {"id": "start", "type": "text", "heading": "Kenya is where we start. Not where we stop.",
   "body": "Every platform is engineered with multilingual, multicurrency and jurisdiction-aware foundations. New markets arrive as validated market packs: local statutory rules, payment rails and languages, reviewed before they go live."},
  {"id": "cta", "type": "call_to_action", "heading": "See how FigBud platforms fit your organisation.",
   "cta": {"label": "Talk to our team", "href": "/contact"}}]}
$about$),
          ('01930000-0000-7000-8000-00000000a002', 'legal/privacy', 'Privacy Policy', 20, $legal$
{"seo_noindex": true, "sections": [{"id": "pending", "type": "text",
  "body": "Replace this with the Privacy Policy reviewed by legal counsel, then submit it for approval."}]}
$legal$),
          ('01930000-0000-7000-8000-00000000a003', 'legal/terms', 'Terms of Use', 21, $legal$
{"seo_noindex": true, "sections": [{"id": "pending", "type": "text",
  "body": "Replace this with the Terms of Use reviewed by legal counsel, then submit it for approval."}]}
$legal$),
          ('01930000-0000-7000-8000-00000000a004', 'legal/cookies', 'Cookie Policy', 22, $legal$
{"seo_noindex": true, "sections": [{"id": "pending", "type": "text",
  "body": "Replace this with the Cookie Policy text reviewed by legal counsel, then submit it for approval. The list of cookies in use is added below it automatically."}]}
$legal$)
       ) AS v (id, path, title, position, draft)
 WHERE s.slug = 'figbud'
   AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.site_id = s.id AND p.path = v.path AND p.archived_at IS NULL);

-- Official slogans supplied by the owner (30 Oct 2026); a tagline changed in
-- the Studio since is kept.
UPDATE sites SET tagline = 'One Vision. Endless Solutions.'
 WHERE slug = 'figbud' AND tagline = 'From vision to value, we deliver.';
UPDATE sites SET tagline = 'HR Simplified. Business Amplified.'
 WHERE slug = 'zirahr' AND tagline = 'People. Payroll. Progress. Connected.';
