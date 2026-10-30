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
- **Templates (`services/api/src/pages/templates.rs`, 28 Oct 2026):**
  - **Every website:** blank, home, platform overview, features, integrations, resources, and contact.
  - **Lending & Credit (the shared lending template, P4-L1):** lending home (the loan lifecycle), lending solutions, and the borrower journey (apply, assess, approve, disburse, repay). Jasiri LMS and Ziwa LMS use the same set, each with its own brand, copy and publishing.
  - **HR & Workforce:** HR home, modules, employee journey.
  - **Finance & Payments:** finance home, spend journey.
  - A website is offered its category's set first, then the general set. Templates written for another category are refused by the API.
  - Each template has a description and a suggested title and address. The Studio fills these in unless the admin has typed their own, and warns before creating a page at an address that's already used.
  - Templates fill in the website's name and tagline. Their placeholder text is marked "Replace…" and makes no claims: capabilities, integrations and figures are left for editors to state once verified.
  - Calls to action are labelled for the website's launch status (Join the waitlist, Request early access, Request a demo) and link to `/enquire`. The renderer always sends `/enquire` to the website's enquiry form, even when the website has its own contact page.
- **Workflow:** the same as Branding. Drafts autosave and are never public. Publishing is a submission someone else approves, and owners may approve their own, which is recorded in the audit log. Restoring a published version copies it into the draft. Archiving takes a page off the website. Every action is audited with previous and new values.
- **Scheduled publishing (28 Oct 2026):**
  - When submitting, an editor chooses "When approved" or "At a set time". The time is entered in their own time zone and must be at least a minute ahead and within a year.
  - Approval is still required. An approved change waits as *scheduled* while the current version stays live; the Studio shows "Version N goes live …", and the pages list shows a Scheduled badge.
  - If the requested time has passed by the time it's approved, approving publishes it immediately, and the Studio says so before approval.
  - The API's scheduler (every 15 seconds) publishes due changes. Each is claimed by one instance only (`FOR UPDATE SKIP LOCKED`) and audited as `page.published` by the system, with `scheduled_for`.
  - A schedule can be cancelled by its requester, a reviewer or an owner. Archiving the page cancels it. Only one change per page can be awaiting approval or scheduled at a time.
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
- **Content:** pages are drawn by the shared `PageBlocks`. Block links get the right prefix. `/enquire` always goes to the enquiry form, and `/contact` does too unless the website publishes its own contact page.
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

## Website management workspace (P7-ZR1, from 29 Oct 2026)

**Standing rule (29 Oct 2026).** A website feature isn't complete until it can be managed in the Studio.
- **Register:** whenever a website gains pages, sections or configurable features, they are registered in the Studio's existing schema-driven model: the registry, typed blocks, brand profiles and page settings. No separate admin per product.
- **Wire up:** each control is connected to the API with the usual draft, validation, approval and audit.
- **Test:** each control is tested end to end before the feature is marked done.
- **Keep private things out:** internal or security-sensitive components are never exposed as CMS controls.

**Controls with distinct meanings:**

| Control | Where | Meaning | Who | Takes effect |
| ------- | ----- | ------- | --- | ------------ |
| Draft / Published | page | Edits are drafts until a submitted version is approved | editor submits, reviewer approves | on approval (or at the scheduled time) |
| Visible / Hidden | section | A hidden section stays in the page and its versions; the public API never sends it | editor (part of the draft) | when the draft is published |
| Online / Offline | page | Offline pages answer "not found" and leave the navigation; content and versions are kept. The home page is always online | reviewer | immediately, audited, reversible |
| Show in navigation | page | Left out of the menu but still reachable at its address | reviewer | immediately, audited, reversible |
| Menu: website's pages / links I choose | website | Pages marked for navigation, or up to 8 chosen links (page paths or https:// addresses) | reviewer | immediately, audited |
| Footer note and links | website | A line under the name and up to 8 links (otherwise the menu); FigBud Global's legal links always stay | reviewer | immediately, audited |
| Section style | section | Default, Brand band or Soft band, in the website's theme colours | editor (part of the draft) | when the draft is published |
| Theme: brand and soft bands | website | Colours of the section bands; refused if text on them would be hard to read (4.5:1) | reviewer | immediately, audited |
| Enquiries on / off | website | Off removes the enquiry button, shows a notice on the contact form and makes the API refuse the product (409 `enquiries_closed`); received enquiries are kept. The corporate website is always on | reviewer (confirms before closing) | immediately, audited as `site.enquiries_closed` / `site.enquiries_opened` |

**Navigation, footer & forms** (P7-E2, 29 Oct 2026): Websites → a website → Navigation & forms. Settings live in `sites.settings` (validated by `services/api/src/site_settings.rs`; an empty document means the defaults), are read and saved at `GET/POST /v1/admin/sites/{slug}/settings` with a version check, and reach the websites through `GET /v1/sites` (`settings`). The editor suggests the website's published pages as destinations.

**Website cards** show each workspace at a glance: live pages of total, sections, changes awaiting approval or scheduled (pages and brand), and when anything was last published (`workspace` in `GET /v1/admin/sites`). Actions appear only where the screen exists: Manage, Branding, Pages, Open website.

**ZiraHR, the first complete integration.**
- **Audit (29 Oct 2026):** `apps/zirahr-web` had one built page. Its home page (hero; ten-module feature grid; payroll text; closing call to action) was hard-coded. Seven navigation pages were "coming soon" placeholders. The header and footer come from site-kit.
- **Import:** every home section maps to an existing block, so the API imported the page once into the Studio, word for word, as published version 1 ("Imported from the ZiraHR website", `pages/import.rs`). It now renders from the Studio on the product-site renderer (`/zirahr`). The import runs only if ZiraHR had no Studio pages, so Studio work is never overwritten.
- **One change from the original:** the "Explore the modules" button was left out, because it pointed at a placeholder page.
- **Done since:** navigation and footer settings and the enquiry switch (P7-E2, above), for ZiraHR and every other website.
- **Done since:** per-site themes (P7-E1): section bands in each website's colours; Ziwa uses brown and ivory.
- **Done since:** the media library (P7-D2).
- **Remaining:**
  - deploying the renderer (approval needed), after which `apps/zirahr-web` can be retired.

## Campaigns & promotions (P8, 30 Oct 2026)

Studio → **Marketing** → Campaigns & Promotions. Full design and rules: [CAMPAIGNS.md](CAMPAIGNS.md).

- **Overview:**
  - totals (campaigns, live, scheduled, awaiting approval, completed, reward claims);
  - recorded impressions, clicks, click-through and conversions;
  - a table by website, and filters by website, type and status.
- **Create:** a name, the website (exactly one) and a type. The draft starts from that type's template.
- **Builder:**
  - identity, banner content, visual design (from the website's brand), display settings, schedule, and rewards for spin to win;
  - a live preview of the unsaved draft for each placement, on desktop and phone, in dark and light;
  - results (recorded events, reward stock) and version history.
- **Publishing:**
  - Save draft (only with changes), then Submit for approval (with a note).
  - A reviewer approves, or an owner for reward campaigns.
  - Pause and resume (immediate), archive and restore, duplicate, and restore any published version to the draft.
- **Safeguards:** buttons are links or the existing enquiry form; nothing runs scripts. Reward campaigns need terms, a recorded legal review and an owner's approval.

## Per-website permissions (P7-F1, 30 Oct 2026)

Settings → **Team & access** (owners). Everyone has one Studio role (owner, reviewer, editor, viewer). On top of it, each person (except owners) has website access:

- **All websites:** their Studio role on every website, including new ones. Everyone starts here, so nothing changed for existing people.
- **Selected websites:** only the websites chosen, each with its own role (viewer, editor or reviewer), never above the Studio role. Someone who's an editor in the Studio can be an editor on ZiraHR and a viewer on Jasiri.

What a limit means:

- Websites without access don't appear: the Websites list leaves them out and their pages, media, branding, settings and status requests answer "not found". With a lower role there, editing is refused and the controls are hidden.
- The **Enquiries** inbox shows enquiries for their websites only. **Insights** (the corporate blog) needs access to the corporate website.
- **Shared content** reaches every website that uses it, so creating, editing, publishing or archiving items needs access to all websites; usage lists leave out other websites.
- Changes apply from the person's next click (access is read with every request) and are audited (`admin.access_changed`, with before and after).
- **Invites** can choose the websites too (Overview → Invite an admin → Website access); they're applied when the invite is accepted.

## Performance budgets (P7-G4, 30 Oct 2026)

Every page editor has a **Performance** panel: what a visitor's phone downloads for the saved draft, measured by the API each time the draft saves.

| Measure | Warning | Limit |
| --- | --- | --- |
| Sections shown | 16 | 30 |
| Images | 6 | 12 |
| Image download on a phone (960 px renditions) | 800 KB | 2 MB |
| Largest image on a phone | 250 KB | 500 KB |
| Text and layout | 50 KB | 120 KB |

- Hidden sections don't count; shared content counts as its published version; an image used twice downloads once.
- **Past a warning:** the panel says "Getting heavy" and what to change.
- **Over a limit:** "Over budget"; Submit for publishing is disabled, and the API refuses to submit or approve the page (approval re-checks the version being approved, since shared content can change after submission). Scheduled changes already approved still go live.
- The first section of a page, if it's an image, loads at once with high priority; later images load as visitors scroll.

## Content library (P7-D1, 30 Oct 2026)

Studio → **Content**. Sections written once and used on pages of any FigBud website.

- **Items:** a name and one section (hero, text, features, steps, figures, questions or call to action). Media images can't go in (they belong to one website's library), and items can't contain other items.
- **On pages:** add the **Shared content** section and choose an item. Pages reference the item, never copy it, and always show its latest published version, in the page's own section style (Default, Brand band, Soft band). A draft never reaches a website; an unpublished or archived item is left out of the website (previews show the gap).
- **Publishing and versions:** editors edit and save the draft; **reviewers publish** it, with a note, because one publish changes every page using it. Each publish is a numbered version; any version can be restored into the draft and published again.
- **Usage:** each item lists the pages and websites using it (draft or published); the list shows "On N pages · N websites". An item in use can't be archived.
- **Audit:** `shared.created`, `shared.draft_saved`, `shared.published`, `shared.version_restored`, `shared.archived`, `shared.unarchived`.

## Search settings per page (P7-G1, 30 Oct 2026)

In the page builder's **Page** panel:

- **Search title and description**, with a live preview of the search result (site, address, title, description).
- **Sharing image:** the website's sharing image, or one of the website's media library images (its alt text is used); shared on LinkedIn, WhatsApp, X and similar.
- **Hide from search engines:** the page gets `noindex` and is left out of the sitemap; visitors can still open it. Part of the draft, so it goes live with approval.
- **Old addresses:** when a published page's address changes, the old address forwards to it permanently (308). The address field says so before you change it. Redirects point at the page, so moving it again never chains; an address another page takes stops forwarding; archived or offline pages receive none. Editors can stop a redirect (audited as `page.redirect_removed`).

Websites get canonical URLs, Open Graph and X cards on every page, and a sitemap of indexable published pages.

## Media library (P7-D2, 30 Oct 2026)

Websites → a website → **Media**. One library per website; pages use its images with the **Image** section (an image, an optional caption, text or full width).

- **Uploads:** JPEG, PNG, WebP or SVG, up to 8 MB (SVG 512 KB). The API sniffs the real type, sanitises SVGs (as for logos), decodes rasters with size limits, turns photos upright and re-encodes them, so camera metadata such as location never reaches a website. Images wider than 2400 px are scaled down; renditions at 480, 960, 1440 and 1920 px are made (JPEG, or lossless WebP when the image has transparency). The same file twice is recognised, not stored again.
- **Alt text** is required and lives in the library: written once, editable, and every page using the image shows the current text.
- **Usage:** each image lists the pages that use it, draft or published. An image in use can't be archived; archived images can't be chosen and can be restored.
- **Who:** editors upload, edit and archive; viewers see the library. Every change is audited (`media.uploaded`, `media.updated`, `media.archived`, `media.restored`).
- **On the websites:** the API adds each image's alt text, size and rendition widths to the page; the renderer shows a responsive, lazily loaded image with its size reserved. A file is public (`/v1/media/{id}`, proxied at `/media/{id}`) only while a published page of a listed website uses it; the Studio previews through its private proxy.

## Settings → Privacy & Cookies (P7-PC1, 29 Oct 2026)

One settings document for every FigBud website (one data controller). Everyone signed in can read it and the consent report; **only owners** change it, because it decides what tracking may run. Every change is audited (`privacy.updated`, before and after).

| Control | What it does |
| --- | --- |
| Banner heading and message | Plain text on English pages; other languages show their translation. |
| Category names and descriptions | Strictly necessary (always on), Analytics, Preferences, Marketing. |
| Remember choices for | 30–395 days; visitors are asked again afterwards. |
| Keep consent records for | 6–60 months, then deleted automatically (every 6 hours). |
| Privacy / Cookie Policy links | A path on the website or an https:// address; nothing else is accepted. |
| Integrations | Plausible, Google Analytics 4, Meta Pixel, LinkedIn Insight Tag, configured **by ID only** (no pasted scripts). Enabled ones load only for visitors who allowed their category. |
| Ask every visitor again | Raises the policy version; required automatically when a provider is enabled that earlier choices didn't cover. |

**Consent records** hold a random ID from the visitor's consent cookie, the choices, the action, the policy version and the website. No IP address (it is only counted for rate limiting), user agent, account or form data. The report shows the last 30 days: choices made, browsers, and the share allowing each category.

**On the websites** (`@figbud/site-kit` `CookieConsent`): only strictly necessary storage (`fb_consent`, `fb-locale`, `fb-theme`) until a choice; Accept all and Reject optional have equal weight and nothing optional is preselected; withdrawing removes provider cookies and reloads the page so nothing keeps running. The Content Security Policy allows only the supported providers' origins.

## Safety rules

- No executable content from the CMS; Markdown and typed properties only, validated server-side.
- Optimistic concurrency (`version`) on every editable record; stale saves return `409`.
- Media deletion is refused while a published page references the asset.
- Untranslated content stays in review and is not indexed.
- Public rendering reads published versions only, cached and revalidated on publish.
