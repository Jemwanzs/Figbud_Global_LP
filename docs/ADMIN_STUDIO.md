# FigBud Admin Studio — Design

> Build once. Configure continuously. Publish confidently.

The Admin Studio turns the existing admin portal (passkey sign-in, roles, Insights editor, enquiries inbox, audit log) into a multi-website management studio. Authorised, non-technical administrators manage FigBud Global and every product website — pages, cards, announcements, navigation, branding, product status — without routine developer work. Developers keep control of application code, infrastructure, integrations and security.

This document records the architecture and decisions. Delivery status lives in [ROADMAP.md](ROADMAP.md) (Phase 7).

## Audit of the starting point (23 Oct 2026)

| Area | Today | Studio direction |
| --- | --- | --- |
| Product registry | Hard-coded in `@figbud/brand` (`products`, `productSites`), used by 12 corporate files | `sites` table managed in the Studio; the code registry remains the fallback when the API is unreachable |
| Product websites | `apps/zirahr-web`, one Next.js app per product (decision D7) | One multi-site renderer (D16); ZiraHR becomes its first configured site |
| Pages | Hand-built React pages | Schema-driven pages of typed blocks for product sites; the corporate site keeps its crafted pages and gains configurable areas |
| Content | Blog articles (`cms_articles`), editorial workflow with maker-checker | Unified content library: one canonical record targeted at several sites |
| Admins | Global roles owner > reviewer > editor > viewer | Plus per-site grants (Phase F); global roles keep working |
| Audit | `audit_log` with actor, action, target, detail | Plus site, previous/new values and publication version |

Everything that works today is preserved: admin accounts and passkeys, enquiries, articles, the email outbox and the live deployments.

## Architecture decisions

- **D16 — One renderer for product websites.** Product websites are rendered by a single Next.js app that resolves the site from the request host (or a `/{site}` path prefix while sites share a Railway domain) and renders published configuration from the API. Adding a product is data, not a deployment. The corporate site stays its own app because its pages are bespoke and performance-critical; its product cards, statuses, destinations and announcements read the registry.
- **D17 — Typed blocks, never markup.** A page is an ordered list of sections; each section is a block type from an approved library (hero, text, product cards, feature grid, statistics, FAQ, timeline, pricing, comparison, gallery, banner, CTA, form, tabs, accordion, workflow demo, …) with properties validated against a versioned schema on the API. No arbitrary HTML, scripts or style strings are stored; rich text is Markdown rendered by the API's sanitiser.
- **D18 — Guard-railed design tokens.** Themes choose from enumerated presets (accent palette, typography preset, button and card styles, spacing scale, container width, animation preset). Each preset maps to classes that exist at build time, so production CSS never misses a runtime-generated class, and design quality stays consistent.
- **D19 — Marketing status is not operational readiness.** A site's lifecycle (Draft → Coming Soon → Beta / Early Access → Active → Retired) controls what the marketing website says and which call to action it offers. It never switches on the operational product, payments, customer sign-ups or production integrations; those have separate, verified readiness controls outside the Studio.
- **D20 — Draft, review, publish, roll back.** Every editable entity has a working draft and immutable published versions. Autosave writes drafts only. Publishing creates a version; rollback republishes an earlier validated version. Sensitive changes (site publication, lifecycle transitions, navigation, major branding) require a second person (maker-checker); owners may self-approve, which is audited.

## Data model

All tables use UUID keys, foreign keys, check constraints and indexes for their read paths; migrations are forward-only and additive.

**Phase B — registry**

- `sites` — `slug` (unique, immutable; lower-case letters and numbers joined by `-` or `_`), `kind` (`corporate` | `product`), `name`, `tagline`, `description`, `category` (`corporate`, `hr_workforce`, `lending_credit`, `finance_payments`, `custom_enterprise`), `template`, `status` (`draft`, `coming_soon`, `beta`, `active`, `retired`), `primary_domain`, `position`, `archived_at`, `version`, authorship and timestamps.
- `site_status_requests` — requested lifecycle transitions: from/to status, reason, requester, decision (`pending`, `approved`, `rejected`, `cancelled`), decider, timestamps. Approving applies the transition and is audited.

**Later phases** (designed here, built in order): `site_themes` and `site_navigation` (E); `pages`, `page_versions`, `page_sections` (C); `content_items`, `content_targets`, `content_versions` (D, generalising `cms_articles`); `media_assets`, `media_variants`, `media_usages` (D); `site_grants` and `approval_requests` (F); `redirects`, `translations` (G).

**Brand management (delivered 23 Oct 2026).** `site_brands` (draft and published profile per website), `brand_revisions` (submissions and version history), `brand_assets` and `brand_asset_renditions` (immutable logo library with WebP copies). This is the single place where logos and brand colours are configured; the page builder and product registry read it, with no second logo system. Details: [BRAND_ASSETS.md](BRAND_ASSETS.md).

**Pages (Phase C, delivered 25 Oct 2026).** `pages` (one row per page and website: address, title, order, working draft, published document, archive flag) and `page_revisions` (submissions and version history). A page document is a list of sections, each a typed block from the approved library:
- **Blocks:** hero, text (Markdown), feature grid, steps, figures, questions and call to action.
- **Validation (`services/api/src/pages/blocks.rs`):** the API validates every block. It refuses unknown block types and fields, and allows only site paths or https links. Figures need a stated source, so unverified numbers aren't published. Markdown goes through the article sanitiser.
- **Templates:** blank, home, platform overview, features, and contact. They fill in the website's name and tagline, and mark placeholder text for replacement.
- **Workflow:** the same as Branding. Drafts autosave and are never public. Publishing is a submission someone else approves, and owners may approve their own, which is recorded in the audit log. Restoring a published version copies it into the draft. Archiving takes a page off the website. Every action is audited with previous and new values.
- **Public reads:** `GET /v1/sites/{slug}/pages` and `GET /v1/sites/{slug}/page?path=` return published pages of listed websites only.
- **Rendering:** the shared `PageBlocks` renderer in `@figbud/site-kit` draws the Studio preview, the full-page draft preview and, once P7-E3 lands, the product websites. Blocks size themselves to their container, so the preview matches the website at the same width.

**Product-site renderer (D16, built 27 Oct 2026; not deployed yet).** `apps/sites-web` serves every listed product website from the Studio's data: the registry, published pages and published brand. Nothing in it is specific to one product.
- **Addresses:**
  - On the shared domain, websites live at `/{site}/{path}`.
  - A website whose domain is set in the registry is served from that domain's root. The proxy rewrites those requests internally to `/~{site}`, which can't be requested directly.
  - `/` on the shared domain sends visitors to FigBud Global.
- **Page layout:**
  - The header shows the website's published logo (or its name), its published pages as navigation, and its call to action: waitlist, early access or demo, all through the corporate enquiry form (D14).
  - The footer links back to FigBud Global.
  - Brand colours, favicon and app icon come from the published brand.
- **Content:** pages are drawn by the shared `PageBlocks`. Block links get the right prefix, and `/contact` goes to the enquiry form unless the website publishes its own contact page.
- **Missing pages:** unknown addresses and unlisted websites return a real 404. A listed website with no published home page shows a holding page built from the registry: its name, tagline, description and call to action, not indexed.
- **SEO:** canonical URLs, search titles and descriptions per page, a host-aware sitemap and robots rules. Pages are not indexed unless `NEXT_PUBLIC_ALLOW_INDEXING` is on. Product websites are English, `lang="en"` (D15).
- **Freshness:** pages and the registry are cached for minutes and refresh on their own after publishing.

## Permissions

Global roles remain: owner (platform owner), reviewer, editor, viewer. Phase F adds per-site grants that narrow them: website administrator, product manager, content editor, reviewer / approver, publisher, viewer, scoped to one site. Every administrative endpoint authorises the actor against the site it touches.

Phase B rules: everyone signed in can read the registry; owners create, edit, archive and restore sites; reviewers and owners request lifecycle transitions; a different reviewer or an owner approves them.

Phase B delivery: the admin has a Websites area (`/admin/sites`: list, guided creation, settings, lifecycle panel, archive/restore). The corporate site reads `GET /v1/sites` through `apps/figbud-web/src/lib/products.ts` (cached for minutes, falling back to the code registry in `@figbud/brand` when the API is unreachable): unlisted products disappear from the Products page and homepage, and the status chooses the call to action. Beta is shown as "coming soon" there until early-access copy is reviewed in every language (P7-B6).

## Lifecycle transitions

| From → To | Allowed | Website behaviour |
| --- | --- | --- |
| draft → coming_soon / beta / active | yes | appears on the corporate site with the matching card and CTA |
| coming_soon → beta / active | yes | CTA changes from waitlist to early access or demo |
| beta → active | yes | early access → demo |
| active → beta / coming_soon | yes (rare; audited) | reverts the CTA |
| any → retired | yes | hidden from listings; existing pages show a retirement notice |
| retired → coming_soon | yes | re-announcement |

Every transition goes through a request and an approval. Each status maps to one public CTA (waitlist, early access or demo) so cards, navigation and pages stay consistent.

## Action buttons and change detection

Every Studio form uses the same pattern (`apps/figbud-web/src/lib/form-state.ts` and `components/admin/action-button.tsx`):

- **Change detection.** A form compares its current values with the values last saved (`useSavedBaseline`). The comparison is structural and local: editing a value back to what it was makes the form clean again, and no request is made just to find out. Each form or scope tracks only its own fields, so a change elsewhere on the screen never enables another form's button.
- **One button component.** `ActionButton` is enabled only when its action is ready: Save or Update when something changed, Create or Submit when the required fields are complete, Apply when the filters differ from those applied, Publish or Submit when there are valid unpublished changes, Discard when there is something to revert. While busy it shows progress and can't be pressed again. When it isn't ready, it says why ("Nothing to save", "Say what changed", "Add a reason for the change").
- **After a save,** the saved values become the new baseline and the button disables again. After a failure, the entered values are kept, the error is shown and the button is available again.
- **Unsaved changes** trigger a warning before the page is left (`useUnsavedChangesWarning`). Autosaved drafts (Branding) never publish. Publishing is always a separate, approved step. Version checks refuse conflicting edits with a way to reload.
- **Where it is used:** website creation and settings, the lifecycle request form, Branding (autosave skips unchanged drafts; Submit explains what's missing; Discard draft changes), brand file uploads, the Insights editor, enquiry follow-up status, the inbox filters, admin invites and sign-in.

## Studio shell and continuous polish

Studio UI polish is a standing priority (P7-UX2): every milestone reviews the screens it touches for spacing, consistency, accessibility and needless steps.
- **Header:** the official symbol and "FigBud Global", a divider and "Studio"; the section navigation (scrolls sideways on phones); the account menu on the right.
- **Account menu:** a disclosure button (initials, name and role; initials only on phones) opening a panel with the admin's email, role and Sign out. Escape or a click outside closes it, and focus returns to the button.
- **Invites (owners):** a full-width work email field, the four roles as cards that say what each can do, and a note that the link works once and expires after 7 days.
- **Recent activity:** every audited action has a readable label; actions without one are turned into words rather than shown as codes. Entries name the website they concern (`site_name` in `GET /v1/admin/audit`).

## Safety rules

- No executable content from the CMS; Markdown and typed properties only, validated server-side.
- Optimistic concurrency (`version`) on every editable record; stale saves return `409`.
- Media deletion is refused while a published page references the asset.
- Untranslated content stays in review and is not indexed.
- Public rendering reads published versions only, cached and revalidated on publish.
