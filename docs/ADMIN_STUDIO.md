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
  - **Hero with the connected-modules visual (8 Nov 2026):** tick the ZiraHR modules to show (at least three) and order them, or leave all eight; choose the animation (standard, subtle, or off, when visitors choose with the dots); switch on the Employee Self-Service highlight and edit its heading and words. Module names and descriptions come from the shared catalogue, as on the Platform page's showcase. The API refuses unknown or repeated modules.
  - **Steps:** cards, or a numbered story (outlined numbers, each step current as visitors scroll) with an optional introduction, a dot pattern and an animation setting. A story has up to eight steps.
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

**Header (31 Oct 2026):**
- One compact, sticky row: the FigBud Global logo and "Studio", the main links, and the account control. The name and role show from 1280 px; below that, the initials.
- Below 1024 px the links open from a menu button. Escape, an outside press or choosing a link closes it.
- The header sits above page content (z-index 40; the account menu 50), with a translucent background, and is hidden when printing.
- Page tabs (for example the Pricing Studio's sections) stay in the page, not sticky, so only one layer sticks.


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
| Footer (P7-FT1) | website | Call to action (heading, description, button, destination, on or off); tagline and description; up to three link groups of up to 8 links, in order; contact email and phone; official social profiles; show or hide the columns. Legal & Support (policies and cookie settings) always stays. On FigBud Global, text replaces the approved wording on English pages only | reviewer | draft, then publish; audited. Social profiles (UI-FT2, 13 Nov 2026): up to eight, including Google Play and App Store; an empty address shows the icon without a link until one is added; "Show social icons in the footer" turns the row off |
| Section style | section | Default, Brand band or Soft band, in the website's theme colours | editor (part of the draft) | when the draft is published |
| Theme: brand and soft bands | website | Shown here as published, with where each colour comes from. Set in Colours & themes → Section bands (UI-BT2, 13 Nov 2026): inherited from the palette, or a custom override per band and mode | reviewer | draft, then publish (Colours & themes); audited |
| Enquiries on / off | website | Off removes the enquiry button, shows a notice on the contact form and makes the API refuse the product (409 `enquiries_closed`); received enquiries are kept. The corporate website is always on | reviewer (confirms before closing) | immediately, audited as `site.enquiries_closed` / `site.enquiries_opened` |

**Navigation, footer & forms** (P7-E2, 29 Oct 2026): Websites → a website → Navigation & forms. Settings live in `sites.settings` (validated by `services/api/src/site_settings.rs`; an empty document means the defaults), are read and saved at `GET/POST /v1/admin/sites/{slug}/settings` with a version check, and reach the websites through `GET /v1/sites` (`settings`). The editor suggests the website's published pages as destinations.

**Our Platforms** (UI-MO5, 1 Nov 2026): FigBud Global → **Our Platforms**. How the home page's product showcase moves, stored in the website's settings (same audit and version check; the home page updates at once):

- **Scroll-driven animation** (on by default): scrolling moves through the products while the showcase stays in view, then the page carries on. It only pins where the whole showcase fits the screen, and never for reduced motion; elsewhere visitors get the carousel.
- **Sticky showcase:** off, the products move as the section passes instead of pinning.
- **Animation intensity** (subtle, standard, bold) and **transition smoothness** (direct, smooth, gentle).
- **On phones:** the swipe carousel (recommended), or scroll-driven only where the whole showcase fits.
- **Previous and next arrows; progress dots and position** (screen readers always hear the position).
- **Product order:** the tabs and cards; products added later follow at the end.
- **Automatic rotation** (moved here from Navigation & forms; described below). It runs only where the carousel shows.

**Automatic rotation** (UI-MO2, 31 Oct 2026; now in Our Platforms). One switch makes Our Platforms move slowly from product to product, at 6–20 seconds per product (the API refuses anything else). It's off by default, and reviewers change it like the other settings (audited, version-checked). The website still pauses rotation on hover, keyboard focus, any tap or swipe, while it's off screen or the tab is hidden; it stops for good once a visitor chooses a product, has a pause button, and never moves for visitors who prefer reduced motion.

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

## SEO & search visibility (P9, 30 Oct 2026)

Studio → **SEO** (overview of every website you can access), and Websites → a website → **SEO**. Full specification: [SEO.md](SEO.md).

- **Search identity (reviewers and owners):** indexing switch, title template with preview, default description, languages, target markets, focus phrases (internal), official profiles, and Search Console and Bing verification tokens. Applies to that website only; version-checked and audited.
- **Health check:** live pages, pages in search, and issues to fix, improve or note for each published page, linking to the page editor. Page-level SEO stays in each page's Search settings and its approval flow.
- **Search data:** Search Console and Bing are shown as not connected until API access exists (Q21). Analytics follows Privacy & Cookies; Core Web Vitals come from Lighthouse in CI.

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

## Content & Marketing: Trusted By, testimonials and metrics (P10-T1..T3, 31 Oct 2026)

Studio → Marketing, then the tabs **Trusted By**, **Testimonials** and **Success metrics**, next to Campaigns & Promotions. Records are created once and shown on any selection of websites, without copies.

- **Model:** `proof_items` (migration 23), one table for the three kinds, with typed content validated by `services/api/src/proof.rs`.
  - Each record has a working **draft** (with its chosen websites) and a **published snapshot** (with the websites it was approved for). Websites only ever read the snapshot.
  - Every approval adds a row to `proof_versions` (history), and every action is audited (`proof.created`, `proof.draft_saved`, `proof.submitted`, `proof.published`, `proof.rejected`, `proof.unpublished`, `proof.settings_changed`, `proof.archived`, `proof.restored`).
- **Kinds:**
  - **Organisation (Trusted By):** name, relationship (customer, partner, technology provider, other), website, short description, one approved logo from the FigBud Global media library (UI-TB1: chosen in a picker with thumbnails, search, light and dark previews, Replace and Remove; no separate icon), and permission (relationship confirmed, display approved, where the approval is recorded).
  - **Testimonial:** the approved quotation, an organisation from Trusted By (its name and logo) or a name, the person's name and designation, a photograph, product, industry, country, and permission (quote approved, name approved, photo approved, where it's recorded). The designation only shows with an approved name.
  - **Metric:** what it measures, the figure, shown as number, currency (ISO code such as KES) or percentage, compact notation, decimals, short marks before or after (">", "+"), the source and the measurement period (both shown publicly), and "checked against its source".
- **Workflow:**
  - Editors with access to FigBud Global and every targeted website save drafts. Saving never changes what websites show, and a changed draft cancels a pending request, because approval covers what was asked for.
  - The publishing checklist follows unsaved edits: `POST /v1/admin/proof/{id}/check` applies the publishing rules without saving. "Save and ask for approval" saves and requests in one step. A progress list shows Draft → Requirements complete → Approval requested → Published.
  - "Ask for approval" works only when the API's publication checks pass:
    - organisations: a name, a logo, a confirmed relationship, display approval and evidence;
    - testimonials: a quote of 20+ characters, an attribution, quote approval, name and photo approval when those are shown, and evidence;
    - metrics: a label, a source, a period and verification;
    - all: at least one website.
    The editor shows the same checklist.
  - Reviewers approve and publish, or decline. A reviewer can't approve their own request; owners can (maker-checker, as for pages and campaigns). A testimonial naming an organisation needs that organisation published first, and carries its approved name.
  - Reviewers can also hide a record without unpublishing it (active switch), set its display order, unpublish it, and archive or restore it. A published record can't be archived, and an organisation used by a testimonial can't be archived.
- **Publicly:** `GET /v1/sites/{slug}/proof` returns the published, active records approved for that website, in order, without permission evidence. Logos and photos are served from the website's own origin (`/media/{id}`), and only while a published, active record uses them. Sections render only when there's something to show:
  - FigBud Global: Trusted By after Our Platforms, then metrics and testimonials after What We Engineer.
  - Product websites: all three after the home page's own sections.
  Studio actions refresh the corporate website at once (cache tag `proof`); product websites within minutes.
- **Never invented:** the seeded records in the e2e mock API are synthetic test fixtures. Production starts empty, and Q22 lists what's needed before any organisation can be shown.

## Payroll Calculator and new page blocks (P14, 5 Nov 2026)

- **Payroll Calculator** (Websites → ZiraHR): dated statutory rules, page text, draft, approval, versions, a public switch and a Try it panel. Rules: [PAYROLL_CALCULATOR.md](PAYROLL_CALCULATOR.md).
- **Page builder** gains **Module catalogue** (name, headline, description, key points, a Planned label) and **Product demonstration** (one of ten, including two scroll stories with an animation setting, with an editable heading and introduction; sample data is fixed and labelled).
- **Page builder** also gains **Referral form** (heading, introduction and the number people call to follow their referral; nothing is shown until a number is entered). Submissions appear in the enquiry inbox as Referral.
- ZiraHR's content plan and sign-offs: [ZIRAHR_WEBSITE.md](ZIRAHR_WEBSITE.md).

## Hover Previews (UI-NAV2, 5 Nov 2026)

Websites → a website → Navigation & forms → **Hover Previews**.

- **Show hover previews:** the switch for the whole website. Off hides every card and keeps the wording.
- **Each menu link:** its own switch, headline (60 characters), description (120 characters) and icon from a fixed set, with the card shown as visitors get it on the light and dark website.
- **Save draft, then Publish:** drafts stay in the Studio and never reach the website (`nav_previews_draft` is left out of `GET /v1/sites`). Publishing is applied directly by reviewers, audited and version-checked, like the website's other settings.
- **Defaults:** FigBud Global starts with its approved wording, and empty fields keep it. Product websites start with none, so a link shows nothing until its own headline is written. Studio edits apply to English pages; other languages keep their own wording.
- **Where it runs:** `NavPreview` in `@figbud/site-kit`, used by the corporate header and the product renderer. Stored as `nav_previews` in the website's settings.

## Languages (P7-G2, 12 Nov 2026)

Settings & Security → **Languages**: Kiswahili, French, Arabic and Chinese for FigBud Global (English is always published).

- **Coverage:** how many of the English texts each translation covers, with examples still shown in English (worked out from the dictionaries in `apps/figbud-web/src/i18n`).
- **Review record:** who reviewed it, the date, where the review is kept, and a note.
- **Acknowledgement emails (P5-12):** each language's draft acknowledgement emails (one per kind of enquiry) are listed for the same reviewer. Once the language is published, visitors who write in it receive them; until then, English. Wording in `services/api/src/email/acknowledgement_text.rs`.
- **Publish:** owners only, and only with a recorded review (the API and a database check both refuse otherwise). A published language is indexed and listed in the sitemap and `hreflang`; **Back to draft** takes it out again. Drafts can still be read, fall back to English where untranslated, and carry `noindex`.
- **Where it runs:** `locale_reviews` (migration 33), `services/api/src/locales.rs` (`GET /v1/locales`, `GET`/`POST /v1/admin/locales…`, audited as `locale.published`, `locale.unpublished`, `locale.review_recorded`). The corporate site reads the published list through `publishedLocales()` (`apps/figbud-web/src/lib/locales.ts`), cached for minutes; without the API it uses the languages published in code (English).

## Each website's languages (P7-L1, 14 Nov 2026)

Websites → a website → **Languages**. One language model for every website: the languages and their reviews are shared (Settings & Security → Languages, above); each website chooses from them, and never changes another's.

- **Choices:** which languages the website offers (English, the language every page is written in, is always on), the one it opens in, and the fallback for text not translated yet (then English, so nothing is blank or shows a raw key). Each language shows whether it is reviewed and published.
- **Rules:** a website opens only in English or a reviewed language (the API refuses others, `languages`/`unreviewed`). FigBud Global lists unreviewed languages as "In review" and keeps them out of search (decision D9); product websites show only reviewed ones (owner, 14 Nov 2026). Product websites stay in English until their pages can be translated (P7-L2): the Studio says so, and their selector offers only pages that exist.
- **Publishing:** Save draft, Publish (with a confirmation), Discard draft. Drafts never reach the websites. Version-checked and audited (`site.languages_draft_saved`, `site.languages_published`). Nothing set means the built-in languages: all five on FigBud Global, English on a product website.
- **FigBud Global follows its own:** its selector and mobile menu list only the languages switched on; addresses in a switched-off language go to the same page in its default language; a first visit opens in a saved choice it still offers, else the visitor's browser language if reviewed, else its default; sitemaps and `hreflang` list languages that are both reviewed and switched on; untranslated text comes from its fallback language, then English.
- **Product websites:** the same selector as FigBud Global (globe, language code, native names, the current one marked, in the website's own colours, keyboard accessible). It stays on the website and never sends visitors to FigBud Global.
- **Settings & Security → Languages** shows which websites have switched each language on.
- **Where it runs:** `languages` and `languages_draft` in the website's settings (`services/api/src/site_settings.rs`); `builtInLanguages`, `liveLanguages`, `fallbackChain` and `negotiateLocale` in `@figbud/i18n`; `localeProxy` in `@figbud/site-kit` with `apps/figbud-web/src/proxy.ts` (refreshed each minute) and `figbudLanguages()` in `apps/figbud-web/src/lib/locales.ts`; the renderer's `RENDERED_LANGUAGES`.

## Appearance & themes: the Studio's own colours (UI-AP1, 12 Nov 2026)

Settings & Security → **Appearance & themes**. This changes the Admin Studio only; websites have their own themes (Colours & themes, below).

- **Shared brand colours:** primary, secondary and a named palette (warm cream, cream, warm orange, warm brown, brown to start with), offered in every colour field.
- **Light mode and Dark mode:** page background, sidebar and navigation, cards and panels, hover background, form fields (optional), borders, headings, body text, buttons and active states, text on buttons, links and active labels (also the focus ring), success, warning, error, and the gradient glow with its intensity.
- **Checks:** text on every background, card, hover and field, links, button text and status colours need 4.5:1. Failures block Publish here and in the API; faint borders or hover are warnings.
- **Actions:** Save draft, Publish, Discard draft, Restore defaults, and History (the last ten, with who and when; load one and publish to roll back). Owners change it; everyone sees it. Saves are version-checked and audited (`studio.appearance_draft_saved`, `studio.appearance_published`).
- **Where it runs:** `studio_appearance` (migration 32) through `services/api/src/studio_appearance.rs`; `GET /v1/admin/studio-appearance`, `POST` the same, and `GET /v1/studio/appearance`. The Studio layout turns the published colours into tokens on its own `<html>` (`apps/figbud-web/src/lib/studio-appearance.ts`), whose built-in values a unit test keeps equal to `tokens.css`.

## Colours & themes: the Brand & Theme Studio (UI-BT1, 11 Nov 2026)

Websites → any website → **Colours & themes** (also under Products & Branding). FigBud Global joined on 14 Nov 2026 (UI-BT3): its built-in theme is the shared colours it was built with, plus its brand palette; the corporate site applies a published theme scoped to `data-site="figbud"` (`getCorporateTheme`, `siteThemeCss`), so nothing changes until one is published. Its official logos and the hero designs that keep their own look are unaffected. Once published, its accent fills (badges, pills) follow "Links and labels", as the preview shows.

- **Palette:** up to 16 named colours. Add, rename, duplicate or remove them; set each by hex or with the colour picker. Any colour below can be picked from the palette.
- **Light mode and Dark mode,** edited independently. Each has ten semantic colours: background, cards and panels, headings and text, secondary text, buttons and active states, text on buttons, links and labels, and optionally borders, the focus ring and secondary text on gradients. The deeper surfaces are derived from the cards and text colours, the same way on the website and in the API.
- **Gradients:** per mode, for the hero, feature bands, demonstrations, the call to action and the footer's call to action. Linear (with an angle) or radial (with a centre), 2 to 5 colour stops, each with a position and an opacity.
  - **Gradients follow the colours (UI-TH7, 12 Nov 2026):** if a mode's background or surface is changed and a gradient is left as built in, the website (and the preview) makes that gradient from the new colours by the built-in recipe: hero from the background into the surface, bands and demonstration stages lit at one corner by 6 % of the button colour, the call to action the other way round (`derivedGradients` and `modeGradientCss` in `@figbud/site-kit`). A gradient set here is always used as set. So bands, demonstration stages and calls to action never keep colours from a palette that's no longer published.
- **Preview:** a sample page in either mode, at desktop, tablet or phone width, updating as you edit.
- **Contrast checks:** shown as you edit, with ratios.
  - Critical, blocking Publish (WCAG AA): text, secondary text and link text on the background, every surface and every gradient stop (4.5:1); text on buttons (4.5:1); the focus ring (3:1).
  - Warnings: buttons that barely stand out from the background, faint borders.
  - The API makes the same critical checks, so nothing unreadable is published even from elsewhere.
- **Actions:**
  - **Save draft** keeps your work (warnings allowed); visitors don't see it.
  - **Publish** is available only when something changed and no critical check fails.
  - **Discard draft** goes back to the published colours.
  - **Restore defaults** puts the website's built-in colours back in the editor; publish to use them.
  - **History** lists the last ten published themes with who published them and when. Load one, then publish it to roll back.
- **Safety:**
  - saves are checked against the version you opened, so two editors can't overwrite each other;
  - every draft and publish is in the audit log (`site.theme_draft_saved`, `site.theme_published`);
  - each website's theme is scoped to that website (`data-site`), so no colour leaks to another.
- **Section bands (UI-BT2, 13 Nov 2026):** one palette for the whole website. The **brand band** is a dark band in either mode, on the dark mode's cards and panels colour, and its contents take the dark mode's colours (text, links, buttons, focus). The **soft band** is each mode's own deeper surface (cards and panels, 6 % towards the text), with that mode's text. The Section bands tab shows each band in each mode with its colour, hex value, where it comes from (such as "Dark mode → Cards and panels"), a live sample and its text contrast, and a choice of **Use brand default** or **Custom override**.
  - An override applies to that band in that mode only; the palette and other websites don't change. It stays as set when the palette changes, and is marked "Custom override" here, in the preview and on Navigation, footer & forms.
  - **Reset to brand default** removes the override: the band inherits the theme's current colour again.
  - Overrides are drafted, checked (their text needs 4.5:1, in the Studio and the API), published and rolled back with the rest of the theme.
  - Navigation, footer & forms → Theme shows the bands as published, with a link here. Saving that page no longer changes the theme: before, it sent only the two old band colours, which removed a published palette, colours and gradients and discarded a theme draft.
  - The old band fields (`brand_section`, `soft_section`) are retired (migration 40). ZiraHR's fixed brown and warm white (migration 31) were dropped, so its bands follow its palette; other websites' colours (Ziwa's brown and ivory) became their overrides.
- **Section styles** (Page builder → a section): besides Brand band, Soft band and Contrasting band, a section can be a Light surface or Dark surface (the same in either theme) or sit on the hero, band or call-to-action gradient.
- **Where it runs:**
  - stored in the website's settings: `theme` (published), `theme_draft`, `theme_history`;
  - checked by `services/api/src/site_theme.rs`;
  - turned into CSS by `siteThemeCss` in `@figbud/site-kit` (`site-theme.ts`), on the product renderer and in Studio previews; the section bands (`bandColours`, `--section-brand`, `--section-brand-text`, `--section-brand-muted`, `--section-soft`) are always included, from the built-in colours when nothing is published;
  - built-in themes are `BUILT_IN_THEMES`, which a unit test keeps equal to `tokens.css`.

## Security & Authentication (P13, 5 Nov 2026)

Settings → **Security & Authentication** (also in the account menu), for every role and only for one's own account. The rules are in [SECURITY.md](SECURITY.md).

- **Two-factor:** QR setup, recovery codes (copy, download, replace), replace authenticator.
- **Password:** create, change, remove. Needs two-factor first.
- **Passkeys:** register this device, name it, remove it. The last way in can't be removed.
- **Active sessions and devices:** sign out one, or all others.
- **Security activity:** the person's own sign-ins and changes.
- **Users & access** shows who has two-factor, a password (never the password) and passkeys, and owners can create a recovery link.
- **Help signing in** (`/admin/sign-in-help`, linked from the login card as "Set up a password" and "Need help signing in?"): the same guidance for everyone; a password is set up after signing in with a passkey, never from an email address alone.
- **API:** public `POST /v1/admin/password/{login|verify|forgot|reset}`; `GET /v1/admin/security`; `POST …/security/verify/{password|passkey/start|passkey/finish}`, `…/two-factor/{start|confirm|remove}`, `…/recovery-codes`, `…/password`, `…/password/remove`, `…/passkeys/{start|finish}`, `…/passkeys/{id}/remove`, `…/sessions/{id}/revoke`, `…/sessions/revoke-others`; `POST /v1/admin/team/{id}/recovery-link`. Migration 26.

## Hero Design Studio (P12, 31 Oct 2026)

Websites → a website → **Hero Design Studio**. The rules are in [HEROES.md](HEROES.md).

- **Variant cards:** live preview frames, "Live" and "Selected to publish" badges, and Preview, Edit, Duplicate, Select for publishing and Remove.
- **The website's own hero (UI-HM1):** always listed first. It's what the website shows with no design published: a product website's home page hero section (edited in the Page builder), FigBud Global's built-in hero. It's labelled Live when it is, and can be selected and published like a design (stored as a published "none", with its own version for rollback).
- **Preview:** a Light / Dark switch for every frame, and a full-screen preview with desktop, tablet and phone sizes.
- **Edit panel:** shows only the chosen design's settings. FigBud Global's platform heroes (05–09) add light and dark behaviour, badges, a product checklist with ordering, and colour pickers with per-colour reset. **Reset to default** and **Discard changes** ask first.
- **Pause motion:** holds every preview frame still; the saved setting is unchanged.
- **Publishing:** Save draft, Ask for approval, Approve and publish or Decline. Version history has "Roll back to this".
- **API:**
  - Studio: `GET /v1/admin/sites/{slug}/hero`; `POST …/hero/draft`; `POST …/hero/{submit|publish|reject|rollback}`.
  - Public: `GET /v1/sites/{slug}/hero`.
  - Tables (migration 25): `site_heroes` and `hero_versions`.

## Pricing Studio (P11, 31 Oct 2026)

Websites → a product website → **Pricing**. The rules are in [PRICING.md](PRICING.md); this section covers the workspace.

- **Tabs:**
  - Overview;
  - Modules & items (recurring);
  - Plans;
  - Billing, tax & terms: cycles and discounts, minimum subscription, currency and manual rates, tax, rounding, commercial models, quotation validity and terms;
  - Implementation (one-off groups A–E);
  - Calculator;
  - Quotes;
  - Publishing;
  - History.
- **Draft:** saving never changes published prices (version-checked; a changed draft cancels a pending request). Amounts are validated as you type.
- **Open calculator in a new tab:** `/admin/pricing-workspace/{slug}` has the product's branding, no Studio navigation and a print-ready layout. It uses the published prices, or the draft with a notice when nothing is published.
- **Quotations:** `/admin/pricing/quotes/{id}` shows the customer document plus the workflow and internal notes.
  - The customer page is `/quote#t=…`, loaded through `/quote/api`, so the API's shared endpoint needs no browser access.
  - That page is noindex and sends no referrer.
- **API:**
  - Studio: `GET /v1/admin/sites/{slug}/pricing`; `POST …/pricing/draft`; `POST …/pricing/{submit|publish|reject|rollback|visibility}`; `POST …/pricing/calculate` (draft or published); `GET/POST …/pricing/quotes`; `GET /v1/admin/pricing/quotes/{id}`; `POST …/{update|submit|approve|reject|share|unshare|mark_sent|accept|decline}`.
  - Public: `GET /v1/sites/{slug}/pricing`, `POST /v1/sites/{slug}/pricing/calculate` (only while shown, rate-limited) and `GET /v1/quotes/shared` (`x-quote-token`).
  - Tables (migration 24): `pricing_books`, `pricing_versions` and `pricing_quotes`.

## Per-website permissions (P7-F1, 30 Oct 2026)

Settings & Security → **Users & access** (owners; formerly Team & access). Everyone has one Studio role (owner, reviewer, editor, viewer). On top of it, each person (except owners) has website access:

- **All websites:** their Studio role on every website, including new ones. Everyone starts here, so nothing changed for existing people.
- **Selected websites:** only the websites chosen, each with its own role (viewer, editor or reviewer), never above the Studio role. Someone who's an editor in the Studio can be an editor on ZiraHR and a viewer on Jasiri.

What a limit means:

- Websites without access don't appear: the Websites list leaves them out and their pages, media, branding, settings and status requests answer "not found". With a lower role there, editing is refused and the controls are hidden.
- The **Enquiries** inbox shows enquiries for their websites only. **Insights** (the corporate blog) needs access to the corporate website.
- **Shared content** reaches every website that uses it, so creating, editing, publishing or archiving items needs access to all websites; usage lists leave out other websites.
- Changes apply from the person's next click (access is read with every request) and are audited (`admin.access_changed`, with before and after).
- **Invites** can choose the websites too (Overview → Invite an admin → Website access); they're applied when the invite is accepted.
- **Named Studio roles (P13-B3, 13 Nov 2026):** under Change access → Selected areas, **Save these areas as a named role**, then Save areas to give it; others get it from **Start from → Saved roles** (linked: "Uses the saved role …"). **Studio roles** (Users & access) lists them with how many people have each: Edit (name and areas; everyone linked is updated) or Delete (they keep their areas). Add admin user can start from a saved role too (a copy). API: `GET`/`POST /v1/admin/studio-roles`, `POST /v1/admin/studio-roles/{id}`, `POST /v1/admin/studio-roles/{id}/delete`; `POST /v1/admin/team/{id}/modules` with `{ "modules": null, "role_id": … }` links a role.
- **Studio areas (P13-B3, 12 Nov 2026):** under Change access, "Every area their role allows" (the default) or "Selected areas": a grid of areas (websites, hero, pages, navigation/footer/colours, branding and media, content, campaigns, customer proof, pricing, enquiries, SEO, approvals) by action (view, edit, ask for approval, approve and publish, export), with presets (website admin, content manager, marketing manager, pricing manager, publisher / approver, viewer / auditor) and a summary of the changes before saving. The role still applies on top. The API checks every admin request against the person's areas when it reads the session (`services/api/src/admin/modules.rs` maps each route to an area and action); their own account, sign-in and the website list stay available. API: `POST /v1/admin/team/{id}/modules` (`{ "modules": null | { area: [actions] } }`).
- **Add admin user and passwords (P13-B6, 13 Nov 2026):** at the top of Users & access, **Add admin user** (also on the Overview): full name (optional), work email, role, websites and Studio areas (every area, or selected areas from presets), then **Create invite** for a single-use link valid 7 days, sent privately. The newcomer chooses a passkey or a password on the invitation page. The sign-in policy has **Roles that need two-factor with a password** (every role by default). In Security & Authentication, **Password** shows Current password (when one is set), New password and Confirm new password with show/hide, a strength guide and inline checks; a forgotten password can be reset there after **Confirm with passkey**, or from `/admin/create-password`.
- **Approval rules (P13-B5, 13 Nov 2026):** below the sign-in policy in Users & access. For each kind of change (pages, hero designs, brand and logos, campaigns, customer proof, articles, price books, Payroll Calculator rules, website status): **Who approves** (Reviewers, Owners only, or Chosen people, ticked from the active reviewers; owners can always approve) and **Approvals needed** (One, or Two from different people). Saving needs a recent identity check. With two, the first approver sees "Your approval is recorded (1 of 2)" and nothing is published until someone else approves. In **Approvals**, each request shows "Approval 1 of 2 · approved by …" and "Assigned to …", with **Assign to** (anyone the rule allows; the API also checks their websites and that they didn't ask for it) and back to "Any approver". API: `GET /v1/admin/approval-rules` (reviewers and owners), `POST /v1/admin/approval-rules/{kind}` (owners), `POST /v1/admin/approvals/assign` (`{ kind, request, to }`); queue items carry `request`, `approvals`, `needed`, `approved_by`, `assigned_to`.
- **Sign-in policy (P13-B4, 13 Nov 2026):** at the foot of Users & access. Ways to sign in (passkeys; password with two-factor), roles that must use a passkey, and sign out after inactivity (never, or 15 minutes to 24 hours). A preview lists anyone a change would leave without a way in; it can't be saved if that includes an owner, or if it would end the session you're using. Saving needs a recent identity check, applies at once and ends sessions started a way that's now off. Where the server has no secrets key, passwords don't count as a way in. Each person's card has **Devices and sessions**: browser and system, how they signed in, when, last active, and a Sign out for each. API: `GET`/`POST /v1/admin/sign-in-policy`, `GET /v1/admin/team/{id}/sessions`, `POST /v1/admin/team/{id}/sessions/{session}/revoke`.
- **Managing people (P13-B1, 12 Nov 2026):** filter by role, website and status; change a Studio role (website roles never rise above it); suspend (signed out everywhere at once) and reactivate; sign someone out of every device; see pending invitations and revoke one (its link stops working; to resend, create a new invite). Nobody changes their own access here, the Studio always keeps an active owner, and changes to an owner need a recent identity check. API: `POST /v1/admin/team/{id}/{role|suspend|reactivate|sessions/revoke}`, `GET /v1/admin/invites/pending`, `POST /v1/admin/invites/{id}/revoke`.

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

## Approvals and Activity (P7-F2)

- **Approvals** lists everything waiting for a second person, across pages, brand, website status, heroes, pricing, the Payroll Calculator, campaigns, customer proof and articles. It shows whose turn it is and links to the item's own screen, where the decision is made. People only see requests for websites they can access; a request on several websites needs access to all of them.
- **Activity** (owners, from Overview) lists who did what, by website, with **Show changes** for before and after values. Undoing a change happens on the item's own screen, by restoring an earlier version.

## Guided demonstrations (UI-SS1, 12 Nov 2026)

Page builder → a demonstration section → **Guide it with scrolling** (on by default) for demonstrations with steps (pay run, payslip, self-service, leave flow, team calendar, attendance). On wide screens the section stays in view and scrolling moves it through its steps, with a progress bar, a step count and a skip control; on phones and with reduced motion it plays by itself. Studio previews show it unguided.

## Contrasting sections (UI-TH3)

- **Section style → Contrasting band:** a full-width band in the opposite of the visitor's theme. Demonstrations inside it flip too, so they still contrast.
- **Demonstration → Layout:** heading above the demonstration, or beside it on wide screens.
- Previews follow the theme you choose, exactly as visitors see it.

## Enquiry form (UI-F2)

- **Enquiry form** section: the same form as the corporate contact page (demo request, sales, question, partnership), sent to the enquiry inbox. On a product's own website the product is fixed, so there's no product choice.
- **Enquiry form settings (UI-EF3, 14 Nov 2026):** Websites → a website → **Enquiry form**.
  - Layout (two stages or one column), categories offered and their order, each optional field (job title, country, phone, company size, message) optional, required or hidden, labels and hints of every field, and the wording (introduction, stage titles and lines, Continue and Send, success title and message; the reference is always shown). A message can't be hidden while a category needs one.
  - Live preview of the real form in the website's colours: it checks as usual and is never sent ("Preview · not sent").
  - Save draft, Publish (confirmed), Discard draft; version-checked and audited (`site.enquiry_form_draft_saved`, `site.enquiry_form_published`). Whether the website takes enquiries at all stays on Navigation, footer & forms.
  - Enforced by the API: the form sends its website's slug (`form`); `services/api/src/enquiry_form.rs` refuses a category it doesn't offer or a missing required field, and drops hidden fields. Without `form`, the usual enquiry rules alone. Name, work email, company (demos, sales, partnerships) and consent always follow those rules.
  - On FigBud Global, the wording applies to English pages; other languages keep their own (as with hero text).
- **Two stages everywhere (UI-EF1, UI-EF2):** product websites since 13 Nov 2026, FigBud Global's Contact page since 14 Nov 2026 (with its product choice in the first stage). One shared component (`EnquiryForm` with `stages`, `@figbud/site-kit/enquiry-form`); each website keeps its own product context, routing and wording. Its Studio settings: above.
- Put it on a website's **Contact** page and that website's demo and contact buttons open it there, instead of the FigBud Global contact page. Remove it and they go back to the corporate form.

## Hero section options (UI-HE1)

- **Accent line:** a second line of the headline in the website's colour.
- **Visual:** none, or "Connected modules": module cards lit in turn by a signal line (animated, settled for visitors who prefer reduced motion).
- **Highlights:** up to four short benefits, one per line, shown with ticks under the buttons.
