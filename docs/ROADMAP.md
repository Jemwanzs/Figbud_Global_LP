# FigBud Global — Master Development Roadmap

> **The single authoritative plan** for the FigBud Global corporate website and its product websites (ZiraHR, Jasiri LMS, Expense Now and future products).
> It consolidates every scope and standards brief supplied to date, records how overlaps and conflicts were resolved, and tracks delivery task by task.
>
> **Owner:** James Sammy (FigBud Global) · **Repository:** [github.com/Jemwanzs/Figbud_Global_LP](https://github.com/Jemwanzs/Figbud_Global_LP) · **Maintained in:** `docs/ROADMAP.md` (updated as work lands) · **Last updated:** 23 October 2026

**Status legend:** ✅ Completed · 🔄 In progress · ⛔ Blocked (waiting on an input listed in §5) · ⬜ Not started

---

## 1. Executive summary

| Phase | Name                                 | Status         | Progress                                | Waiting on                                   |
| ----- | ------------------------------------ | -------------- | --------------------------------------- | -------------------------------------------- |
| 1     | Project foundation                   | ✅ Completed   | 25 / 25 tasks                           | —                                            |
| 2     | FigBud Global homepage               | 🔄 In progress | 17 / 22 tasks (3 more in progress)      | Verified company facts, CI Lighthouse baseline |
| 3     | Corporate pages                      | 🔄 In progress | 7 / 14 tasks                            | Company profile, legal texts                 |
| 4     | Product websites                     | 🔄 In progress | 2 / 22 tasks (template + ZiraHR site started; lending template and Ziwa site added) | Product capability sign-off, payroll rules, Railway service for product sites |
| 5     | Integrations & administration        | 🔄 In progress | 11 / 17 tasks (admin, CMS, inbox done)  | Resend credentials, recipient addresses      |
| 6     | Production deployment                | 🔄 In progress | 9 / 18 tasks                            | Resend, domains, backups/monitoring          |
| 7     | Admin Studio & website builder       | 🔄 In progress | 20 / 37 tasks (registry, brand management, hero, map, icons, branded Studio, Ziwa LMS, smart actions, page builder) | Complete logo files (Q18) |

**Where we are:** the monorepo, shared design system, multilingual architecture, Rust enquiry API with PostgreSQL and a retrying email outbox, and the first complete FigBud Global homepage are built and verified locally. Everything runs without any external service. The next steps that need decisions from FigBud are listed in **§5 Open questions**.

**Verified on 23 Oct 2026 (brand management):** Rust tests 81/81 against real PostgreSQL (logo uploads, type and size checks, SVG sanitising, renditions, draft conflicts, maker-checker publishing, rollback, archive rules, published-only delivery, seeding) · clippy and rustfmt clean · frontend unit tests 35/35 including colour-contrast guard rails · Playwright: brand journeys (upload, preview, publish, replace, roll back) and public logos pass in Chromium, Firefox and WebKit; full corporate suite 198 passed, with 6 Firefox tests that time out only under local parallel load and pass when rerun · ZiraHR site e2e 19/19.

**Verified on 23 Oct 2026 (Admin Studio Phase B):** Rust tests 69/69 against real PostgreSQL (website registry: creation, maker-checker launches, conflicts, archive, corporate rules) · TypeScript, ESLint, Prettier clean · frontend unit tests 23/23 · Playwright 183 passed across Chromium, Firefox and WebKit, including the new Websites journey and axe on the Websites pages · verified against the production API image that a registry status change reaches the public Products page (status, call to action, retired products removed).

**Verified on 22 Oct 2026:** Rust tests 63/63 against real PostgreSQL (real WebAuthn ceremonies, editorial workflow, enquiries inbox and export, CMS visibility, sanitised HTML) · clippy and rustfmt clean · `cargo audit` 0 advisories · `npm audit` 0 vulnerabilities in shipped dependencies · TypeScript strict, ESLint, Prettier clean · frontend unit tests 15/15 · Playwright 177 tests across Chromium, Firefox and WebKit (admin, editor and inbox journeys; axe on every public route) · verified end to end against the production API image: admin sign-in, the editorial flow (write → publish → live → archive) and the inbox (enquiry → follow-up → CSV export) · **Railway live (43792dc):** API ready, website, blog, admin, editor; admin endpoints refuse unauthenticated and forged-origin requests.

### Deployment readiness

| Item                               | Status                                  | Notes                                                                                   |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| GitHub repository                  | ✅ Provided                              | `Jemwanzs/Figbud_Global_LP` (public)                                                     |
| GitHub connection & initial push   | ✅ Completed                             | `main` holds the full project; pushes are fast-forward only                               |
| Continuous integration             | ✅ Completed                             | Lint, types, unit, build, cross-browser e2e, Rust with PostgreSQL, audits, Lighthouse     |
| Railway project ID                 | ✅ Provided                              | `5c4df4db-fd17-4371-9424-df0dde7d32e4`: inspect before configuring; never duplicate      |
| Railway service configuration      | ✅ Completed                             | Existing `figbud-web` kept (Railpack, dashboard commands) + variables, health check, watch paths; `figbud-api` and `Postgres` added; domains generated; `ADMIN_ORIGIN` set |
| Frontend deployment (`figbud-web`) | ✅ Live                                  | `figbud-web-production.up.railway.app`: site, blog, admin sign-in (991f63b, 22 Oct 12:25 UTC); editor UI deploying |
| Rust backend deployment (`figbud-api`) | ✅ Live                              | `/health/ready` ok (now the Railway health check), CMS + editorial + admin APIs, `EMAIL_MODE=hold` |
| PostgreSQL database                | ✅ Provisioned                           | Railway PostgreSQL (private network); backups daily (6 days), weekly (1 month), monthly (3 months) + manual baseline |
| Resend domain and API key          | ⛔ Awaiting configuration                | To be supplied later (Q4); never committed, Railway variables only                       |
| Email integration                  | 🔄 Preparation stage                     | Templates for all form types built; `EMAIL_MODE=hold` stores emails until Resend is set  |
| Production domains                 | ⬜ Pending                               | Domain choice outstanding (Q1); Railway domains used until then, not indexed             |
---

## 2. Vision and positioning

**Concept:** One company. Multiple powerful platforms. One connected digital ecosystem.

FigBud Global should read as a modern African technology company building serious enterprise software, not a corporate site displaying product logos. Within seconds a visitor should understand three things: **we build powerful technology, our products solve real operational complexity, and our platforms are ready for serious business.**

| Element              | Confirmed wording                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Brand line           | From vision to value, we deliver.                                                                    |
| Homepage headline    | Built for complexity. Designed for progress.                                                         |
| Supporting line      | Enterprise technology that moves business forward. Configurable. Reliable. Ready to scale.           |
| Positioning          | Enterprise software. Intelligent automation. Digital infrastructure.                                |
| Origin               | Built in Kenya. Designed for Africa. Engineered to scale.                                            |
| About headline       | Technology should adapt to your business. Not the other way around.                                  |
| Final CTA            | Complex business? Meet simpler technology.                                                           |

**Design principle:** don't merely describe enterprise technology — let visitors experience its intelligence, flexibility and reliability through the website itself.

---

## 3. Consolidated scope

### 3.1 Website architecture

| Site                     | Proposed address                         | Status        | Role                                                         |
| ------------------------ | ---------------------------------------- | ------------- | ------------------------------------------------------------ |
| FigBud Global            | `figbudglobal.com`                       | Building      | Parent corporate site and product ecosystem                  |
| ZiraHR                   | `zirahr.figbudglobal.com`                | Active product | HR, payroll and workforce management website                 |
| Jasiri LMS               | `jasiri.figbudglobal.com`                | Active product | Loan **management** system website (lending, not learning)   |
| Expense Now              | `expense.figbudglobal.com`               | Coming soon   | Expense management and payment orchestration; waitlist only  |
| Future products          | Registered in the product registry       | Extensible    | Added through configuration, listed on `/products`           |

- Addresses are **proposals, not configured deployments** (see Q1 in §5). Product subdomains are preferred over sub-paths so each product owns its SEO, release cycle and brand.
- Each product website has its own navigation, pages, metadata, accents and conversion journeys, shares the FigBud design system, and includes a clear **Back to FigBud Global** link.
- Product cards open the product website **in a new browser tab**. Until a product site is deployed, its CTA links to that product's section on the corporate Products page so no link is ever dead.

### 3.2 FigBud Global corporate website

| Page            | Experience                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Home            | Hero with animated ecosystem → platforms → philosophy → Africa → engineering → company & insights → final CTA |
| Products        | Product gallery with status, capabilities, product-website links                                             |
| About Us        | Story, mission, approach, team, African market vision (light on corporate jargon)                             |
| Blog & Insights | CMS-driven: categories, tags, authors, related articles, SEO metadata, scheduling, approval before publishing |
| Contact         | Enquiry form with product-specific routing: demos, sales, partnerships, early access, waitlists               |
| Legal           | Privacy Policy, Terms of Use, Cookie Policy and cookie preferences                                            |

Navigation: **Home · Products · About Us · Blog · Contact** · language switcher (EN / SW / FR / AR / 中文) · theme toggle · **Let's Talk**.

### 3.3 ZiraHR — "The Connected Workforce"

*People. Payroll. Progress. Connected.* · *People aren't spreadsheets. Your HR platform shouldn't treat them like one.*

- **Navigation:** Platform · Modules · Solutions · Payroll Calculator · Resources · Pricing · Company · Book a Demo.
- **Scope:** Employee 360 (onboarding → confirmation → promotion → departure), payroll and compliance, leave, attendance (shifts, geofencing, clock-ins), approvals, performance, collaboration, executive analytics, employee self-service, reporting.
- **Each major module gets a distinctive page**, not another card grid: payroll is a calculation experience, leave is an animated approval journey, attendance is an interactive location-and-shift experience.
- **Non-negotiable:** the payroll calculator is genuine, rules-based and **effective-dated**. Kenya is the default; other countries become interactive only after their statutory engines are validated.

### 3.4 Jasiri LMS — enterprise lending infrastructure

*Lending is complex. Your technology shouldn't be.* · *Originate. Assess. Disburse. Collect. Grow.*

- **Navigation:** Platform · Lending Solutions · Loan Origination · Credit & Risk · Loan Servicing · Collections · Analytics · Integrations · Security · Resources · Book a Demo.
- **Capabilities:** origination (individual, business, group, check-off), configurable loan products (rates, tenure, fees, frequencies, penalties, grace periods), credit assessment (affordability, internal scoring, CRB integrations, credit policies), approval engine (multi-level, limits, delegation, maker-checker), disbursements (bank, mobile money, approved channels), servicing (schedules, top-ups, restructuring, refinancing, settlement), collections (CRM, agents, promises to pay, arrears, recoveries), security & collateral (registers, valuations, guarantors), portfolio analytics (PAR, NPL, vintage, aging, exposure, profitability), governance (roles, branch restrictions, audit trails, data protection, reconciliation).
- **Lending models via configuration, not separate systems:** personal, business, group, check-off, secured; **asset financing is a roadmap capability** until implemented.
- **Signature demos:** loan application journey, configurable repayment schedule, credit decision workflow, collections dashboard, portfolio-health simulator.
- **Languages:** English and Swahili first; French, Arabic, Chinese in the architecture. Currency and jurisdiction rules configurable independently; Kenya first, other markets via validated market packs.
- Clearly separate operational features from planned ones (asset financing, advanced credit scoring, uncommissioned integrations).

### 3.5 Expense Now — expenses and payment orchestration (Coming soon)

*Every expense has a purpose. Every payment has a trail.* · *Spend smarter. Move money better.*

- **Capabilities:** expense requests, category budgets, reimbursements, advances, receipt capture and OCR, configurable approvals, vendor payments, batch disbursements, transaction tracking, reconciliation, payment integrations, audit trails, exports and reporting.
- **Design for:** multicurrency, country-specific payment rails, localisation, transaction idempotency, approval segregation, tenant-level permissions.
- Shown as **Coming soon** with a **Join the waitlist** action — never a live-product CTA.
- Must **not** be described as a licensed payment service provider or promise settlement without verified licensing and partner arrangements.

### 3.6 Shared design system

| Brand          | Visual character                                 | Implemented accent           |
| -------------- | ------------------------------------------------ | ---------------------------- |
| FigBud Global  | Midnight and slate navy, emerald, electric blue, violet (gradients), slate grey (aligned with the reference site, 28 Oct 2026) | `#020617 #0F172A #22C55E #3B82F6 #A855F7 #94A3B8 #FFFFFF` |
| ZiraHR         | Warm orange, ivory, brown, charcoal              | `#FF8A3D → #C4541B`          |
| Jasiri LMS     | Deep navy, emerald, teal, graphite               | `#20C997 → #0E7C86`          |
| Expense Now    | Midnight blue, mint, silver, soft white          | `#9FB3FF → #6EE7C5`          |

- **Typography:** Google **Outfit** (display and interface), system monospace for technical figures; IBM Plex Sans Arabic loads only on Arabic pages (Outfit has no Arabic glyphs).
- **Themes:** designed dark and light modes (not inversions) with a Light / Dark / System switch on every website and in the Studio. System, the default, follows the device live; a choice is remembered per visitor and applied before first paint. Contrast is unit-tested for text, accents, buttons, focus rings and tinted chips in both modes. Product colours apply on top of either theme. Product palettes: [BRAND_ASSETS.md](BRAND_ASSETS.md) §4.
- **Spacing:** gutters 20 px mobile → 32–40 px tablet → 64 px desktop; sections 80–128 px; card padding 20–48 px; touch targets ≥ 44 px; fluid type scale.
- **Motion:** purposeful only — staggered reveals, animated route lines, dashboard transitions, workflow demonstrations; `transform`/`opacity` only; no scroll hijacking, no loading screens; `prefers-reduced-motion` respected everywhere.
- **Avoid:** cramped layouts, excessive cards, generic templates, copied references, decorative motion.

### 3.7 Engineering standards (targets apply to representative production pages)

| Area          | Standard                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | Next.js 16 (App Router, Cache Components), React 19, TypeScript strict, Tailwind CSS 4 tokens, Motion; GSAP only where a cinematic sequence needs it |
| Backend       | Rust, Axum, Tokio; PostgreSQL via SQLx; structured errors, pooling, timeouts                                              |
| Performance   | p75: LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1 · TTFB ≤ 800 ms; Lighthouse ≥ 90 all categories, SEO ≥ 95                    |
| SEO           | Semantic HTML, metadata, canonical URLs, per-site sitemaps, robots, Schema.org, Open Graph, hreflang + x-default, 404s, redirects, staging never indexed |
| Accessibility | WCAG 2.2 AA, keyboard navigation, visible focus, screen-reader support, contrast                                         |
| Security      | HTTPS, CSP and security headers, server-side validation, rate limiting, CSRF protection where cookies authenticate, parameterised SQL, env-based secrets, restricted admin, audit logs, backups, dependency scanning |
| Data          | Public demonstrations use **synthetic data only**; marketing systems are isolated from customer and tenant systems       |
| Content       | No unverified product, customer, statistical or regulatory claims; no unreviewed machine translation is indexed          |

---

## 4. Decisions and reconciled inconsistencies

These resolve overlaps between the briefs. Latest confirmed requirements win; anything that could not be resolved safely is in §5.

| #   | Topic                       | Inconsistency                                                                                     | Resolution applied                                                                                                       |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Product URLs                | Early notes used `figbud.zirahr`                                                                  | Product subdomains of the corporate domain (`zirahr.figbudglobal.com`)                                                    |
| D2  | Jasiri LMS meaning          | A design board explored a learning-management product and a separate lending brand                | Jasiri LMS = **Loan** Management System. All lending consolidated under Jasiri; separate lending concept removed           |
| D3  | Interface font              | One brief: "Outfit primary"; another: "Outfit display, Inter interface"                          | Outfit for display **and** interface (fewer font downloads); revisit Inter only if dense product UI needs it (Q8)          |
| D4  | Hero headline               | "Built for complexity…", "Enterprise Software for a Smarter Africa", "From vision to value"       | Headline: *Built for complexity. Designed for progress.* Eyebrow: *From vision to value, we deliver.*                       |
| D5  | Statistics in mockups       | Mockups show "1,000+ organisations", "50+ team members", "6+ markets"                             | **Removed.** Not shown until FigBud supplies verified figures                                                            |
| D6  | Expense Now status          | Design shows product cards with live-style CTAs                                                   | Coming soon everywhere; Join the waitlist; planned capabilities labelled as previews                                      |
| D7  | Monorepo shape              | "Separate deployable apps" vs one site                                                            | One app per website under `apps/`, shared `packages/` (brand, ui, i18n); one shared Rust API                               |
| D8  | Product-specific accents    | Jasiri (navy/emerald/teal) and Expense Now (midnight/mint) are close in hue                       | Expense Now leads with silver-blue, mint secondary, so the two are distinguishable at a glance (Q7 to confirm)            |
| D9  | Translations                | "Implement five languages" vs "never publish unreviewed machine translation"                      | All five locales routed; non-English marked **draft**: rendered for review, `noindex`, excluded from sitemap/hreflang, missing strings fall back to English |
| D10 | CMS                         | Headless CMS vs Rust-backed CMS                                                                   | Rust API owns CMS data (per engineering standards); admin UI in Phase 5                                                   |
| D11 | Product-site links before launch | "Open product site in new tab" vs product sites not yet built                                | Link becomes external automatically once `NEXT_PUBLIC_<PRODUCT>_URL` is set; until then it targets the Products page      |
| D12 | Project folder              | Rename to `FigBud_Global_LP`                                                                       | Renamed by FigBud to `FigBud_LP` (22 Oct 2026); the rename script was retired. Repository name unchanged (P1-01)          |
| D13 | Static vs dynamic rendering | SSR/SSG "where appropriate"                                                                       | Marketing pages fully prerendered (SSG/PPR); only the contact form reads request data; OG image rendered on demand        |
| D14 | Product-site enquiries | Each product site could host its own forms | Product sites send demo and waitlist requests to the corporate enquiry form, prefilled: one form, one API, one inbox; no per-site CORS or duplicated validation |
| D21 | Parent brand colours | Warm amber and copper palette | FigBud Global (corporate site, Studio, emails, roadmap page) uses the reference site's palette: midnight navy, emerald, electric blue, violet for gradients only. Products keep their own colours and logos. Official logo files aren't recoloured |
| D15 | Product-site languages | Brief: product sites multilingual; translations not yet reviewed | All locales route (cross-site links never break); copy is English, marked `lang="en"`, non-English URLs `noindex` until reviewed translations exist (Q6) |

---

## 5. Open questions and inputs needed

Items marked **Blocking** stop the listed tasks; everything else proceeds with the stated default.

| #   | Question / input                                                                                     | Needed for              | Blocking? | Current default                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------- | --------- | ------------------------------------------------------------ |
| Q1  | Production domain: `figbudglobal.com` (proposed) or the existing `figbudglobal.online`?              | P6, SEO, email sender   | Yes (P6)  | All origins are environment variables                        |
| Q2  | Verified company profile: history, founding year, team, offices, registered entity, contact details | About page, footer, schema | Yes (P3) | No company facts published beyond the confirmed positioning |
| Q3  | Verified figures (customers, users, markets) and any customer logos with permission                  | Homepage proof section  | No        | No statistics or logos shown                                 |
| Q4  | Resend API key, verified sending domain, CTO/team recipient addresses, per-product routing           | P5 email go-live        | Yes (P5)  | `EMAIL_MODE=hold` stores emails until Resend is configured    |
| Q5  | Legal texts: privacy (Kenya Data Protection Act 2019), terms, cookies — reviewed by counsel          | Legal pages, consent    | Yes (P3)  | Pages exist, `noindex`, state "being finalised"               |
| Q6  | Native-speaker reviewers for Swahili, French, Arabic, Chinese                                        | Locale publication      | No        | Draft translations, not indexed                              |
| Q7  | Product accent colours and logos                                                                     | P4 brand fidelity       | No        | **Resolved 23 Oct:** logos supplied; colours follow them (BRAND_ASSETS.md §4) |
| Q8  | Keep Outfit-only, or add Inter for dense product UI?                                                 | P4 product sites        | No        | Outfit-only                                                  |
| Q9  | Real product screenshots (sanitised) for ZiraHR and Jasiri                                           | P4 mockups              | No        | Original synthetic mockups                                   |
| Q10 | Kenya statutory rules and test cases for the payroll calculator (PAYE bands, reliefs, SHIF, NSSF tiers, Housing Levy, effective dates) and who signs them off | P4 calculator | Yes (P4-Z) | Calculator not built until rules are validated |
| Q11 | Which Jasiri capabilities are live vs planned (asset financing, CRB, scoring, integrations)          | P4 Jasiri copy          | Yes (P4-J) | Asset financing marked planned                               |
| Q12 | Expense Now: which capabilities exist today; licensing and payment-partner status                    | P4 Expense copy         | Yes (P4-E) | Everything shown as planned                                  |
| Q13 | Pricing: publish prices or "Contact sales"?                                                          | ZiraHR Pricing page     | No        | Contact sales                                                |
| Q14 | Analytics tool (privacy-friendly, cookie-less preferred?) and consent requirements                   | P5 analytics            | No        | No analytics or tracking cookies                             |
| Q15 | Spam protection: add Cloudflare Turnstile (privacy-friendly CAPTCHA) on public forms?                | P5 hardening            | No        | Honeypot + fill-time check + rate limiting                   |
| Q16 | Consulting / custom-solutions services alongside products (mentioned as possible)                    | IA, About, Products     | No        | Products only                                                |
| Q20 | Legal review of chance-based promotions (spin to win) per market: Kenya promotion, consumer-protection and betting/gaming rules before any reward campaign goes live | P8-M4 | Yes, before activation | Mechanism built; submission is blocked until a review is recorded and an owner approves |
| Q21 | Search Console and Bing Webmaster API access (and GA4 reporting) with least-privilege credentials, after production domains are live | P9-S4 | No | Verification tags can be added in the Studio; data shown as not connected |
| Q22 | Trusted By: approved logo files and written permission to show Mular Credit, Mali Cash Investment and DidLogic, with each relationship (customer, partner, technology provider). Only one unnamed logo (gold coins and leaf) arrived with the brief, so it can't be attributed; DidLogic's logo is still to be supplied | P10-T1 | Yes, per organisation | Nothing is shown publicly: the section stays hidden until a reviewer publishes an organisation with recorded permission |
| Q19 | Ziwa LMS: commercial launch readiness, confirmed live capabilities, website destination, logo approval | P4-W1 | Partly | Logo approved 28 Oct 2026 and published; launch readiness, live capabilities and destination still to confirm (listed as coming soon with a waitlist) |
| Q18 | Logo files: complete ZiraHR logo (supplied file is missing "HR"), SVG or larger versions, light-background versions, the FigBud "GLOBAL" lockup; ~~approve or replace the Expense Now concept~~ (approved 30 Oct 2026) | P7-BR9 | Partly | Official files published for dark backgrounds; light theme shows them on a dark plate; Expense Now and Ziwa LMS identities approved and published |
| Q17 | Railway project ID, and whether staging and production environments already exist                    | P6 deployment           | Partly    | **ID provided** (`5c4df4db…`); environments confirmed on inspection |

---

## 6. Delivery plan

### Phase 1 — Project foundation ✅

**Goal:** a production-grade monorepo that runs entirely locally. **Depends on:** nothing external.
**Acceptance criteria:** clean install; one-command DB; API, web, tests, lint and build all pass; no external service required. **Met.**

| ID     | Task                                                                                                  | Status |
| ------ | ----------------------------------------------------------------------------------------------------- | ------ |
| P1-01  | Rename project folder (now `FigBud_LP`)                                                               | ✅ |
| P1-02  | Inspect workspace and `draft_designs` (references only; never shipped)                                 | ✅ |
| P1-03  | npm-workspaces monorepo: `apps/`, `packages/`, `services/`, `infra/`, `docs/`                          | ✅ |
| P1-04  | Next.js 16 + React 19 + TypeScript strict app (`apps/figbud-web`)                                      | ✅ |
| P1-05  | Tailwind CSS 4 design tokens package (`@figbud/brand`): palette, semantic tokens, product accents, fluid type | ✅ |
| P1-06  | Shared UI package (`@figbud/ui`): logo, buttons, container, badges, theme, motion primitives           | ✅ |
| P1-07  | Localisation package (`@figbud/i18n`): 5 locales, RTL, draft/published status, hreflang, negotiation  | ✅ |
| P1-08  | Product registry (status, origins, dev ports) driving nav, cards and footer                            | ✅ |
| P1-09  | Rust API (Axum/Tokio): config, structured errors, tracing, graceful shutdown                           | ✅ |
| P1-10  | PostgreSQL + SQLx migrations (enquiries, email outbox) auto-applied on start                           | ✅ |
| P1-11  | Health endpoints: `/health` (liveness), `/health/ready` (database)                                     | ✅ |
| P1-12  | CORS allow-list, body limit, timeouts, compression, request IDs, security headers                      | ✅ |
| P1-13  | Docker Compose PostgreSQL (+ separate test DB) and optional containerised API                          | ✅ |
| P1-14  | `.env.example` files for web and API; no fake credentials                                              | ✅ |
| P1-15  | Dockerfiles: API (multi-stage, non-root) and web (standalone, non-root)                                | ✅ |
| P1-16  | Railway service configs (`railway.toml`) — prepared, not deployed                                      | ✅ |
| P1-17  | Security headers and CSP in Next.js                                                                    | ✅ |
| P1-18  | ESLint, Prettier (+ Tailwind class sorting), EditorConfig, rustfmt, clippy                             | ✅ |
| P1-19  | Unit tests: Vitest (web) and Rust unit tests                                                           | ✅ |
| P1-20  | Rust HTTP integration tests incl. real-PostgreSQL tests                                                | ✅ |
| P1-21  | Playwright end-to-end tests (desktop + mobile)                                                         | ✅ |
| P1-22  | Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `api:*`, `db:*`, `verify`       | ✅ |
| P1-23  | README with local setup and future deployment steps                                                    | ✅ |
| P1-24  | Architecture document and this roadmap                                                                 | ✅ |
| P1-25  | Git repository initialised and pushed to GitHub `main`                                                 | ✅ |

### Phase 2 — FigBud Global homepage 🔄

**Goal:** a premium, original, responsive homepage. **Depends on:** Phase 1.
**Acceptance criteria:** all sections responsive from 360 px to ultrawide with no horizontal scroll; dark/light; RTL; keyboard and reduced-motion support; Lighthouse ≥ 90 / SEO ≥ 95 on a production build; no unverified claims.

| ID     | Task                                                                                          | Status |
| ------ | --------------------------------------------------------------------------------------------- | ------ |
| P2-01  | Sticky header: nav, accessible Products menu, language switcher, theme toggle, Let's Talk      | ✅ |
| P2-02  | Mobile menu (native dialog: focus trap, Escape, products, languages, CTA)                       | ✅ |
| P2-03  | Hero with LCP-safe headline, CTAs, pillars                                                      | ✅ |
| P2-04  | Animated ecosystem visualisation + live activity feed (synthetic, pauses off-screen)            | ✅ |
| P2-05  | Interactive platform showcase: keyboard tabs, product-accented panels                            | ✅ |
| P2-06  | Synthetic product previews: ZiraHR payroll, Jasiri portfolio, Expense Now spend                  | ✅ |
| P2-07  | Philosophy section (configurable, reliable, flexible)                                            | ✅ |
| P2-08  | "Built for Africa. Ready for everywhere." — original SVG map with animated routes from Nairobi   | ✅ |
| P2-09  | "What we engineer" with live approval-workflow demonstration                                    | ✅ |
| P2-10  | Company & insights section                                                                      | ✅ |
| P2-11  | Final CTA and footer                                                                            | ✅ |
| P2-12  | Dark default + light theme without flash                                                        | ✅ |
| P2-13  | Arabic RTL layout, Arabic font, mixed-direction fallback text                                   | ✅ |
| P2-14  | Metadata, canonical, Organization JSON-LD, Open Graph image, sitemap, robots, manifest, icon     | ✅ |
| P2-15  | Reduced-motion support and 44 px touch targets                                                  | ✅ |
| P2-16  | Branded 404 (route-level and global)                                                            | ✅ |
| P2-17  | Visual QA at 390 px / 1440 px, dark, light, Arabic                                              | ✅ |
| P2-18  | Lighthouse and Core Web Vitals audit on production build; fix findings (A11y/SEO/BP 100; LCP and hydration fixes; redundant blur filters removed: homepage first paint ~730 ms → ~190–320 ms locally; CI baseline running) | 🔄 In progress |
| P2-19  | Automated accessibility scan (axe) in Playwright ✅; manual screen-reader pass (NVDA/VoiceOver) pending | 🔄 In progress |
| P2-20  | Cross-browser check: automated on Chromium, Firefox, WebKit/iPhone ✅; real iOS and Samsung Internet devices pending | 🔄 In progress |
| P2-21  | Verified proof section (figures, logos, testimonials)                                           | ⛔ Q3 |
| P2-22  | Stakeholder design review and sign-off                                                          | ⬜ |

### Phase 3 — Corporate pages 🔄

**Goal:** complete corporate site. **Depends on:** Q2, Q5, Phase 5 CMS for the blog.
**Acceptance criteria:** every page published, indexed (English), in sitemap, linked; legal texts approved.

| ID     | Task                                                                                  | Status |
| ------ | ------------------------------------------------------------------------------------- | ------ |
| P3-01  | Products page (registry-driven, anchors per product, demo/waitlist CTAs)               | ✅ |
| P3-02  | Contact page with enquiry form (validation, honeypot, idempotency, success reference)  | ✅ |
| P3-03  | Placeholder routes for About, Blog, legal — `noindex`, out of sitemap                  | ✅ |
| P3-04  | About Us: published and indexed from approved copy only (slogan, company statement, philosophy, products from the registry with status, engineering, Nairobi starting point and markets); editable in the Studio (FigBud Global → Pages → About Us, draft → approval → publish; a published version replaces the built-in page). **Remaining:** history, founding year, team and offices once verified | ✅ Page · ⛔ Q2 company facts |
| P3-05  | Blog index: categories, tags, search, pagination                                       | ✅ |
| P3-06  | Article template: author, reading time, related posts, Article schema, breadcrumbs     | ✅ |
| P3-07  | Privacy Policy: Studio draft ready (FigBud Global → Pages); published and indexed as soon as counsel's text is approved there | ⛔ Q5 |
| P3-08  | Terms of Use: Studio draft ready; published from the Studio once counsel's text is approved | ⛔ Q5 |
| P3-09  | Cookie Policy: preference controls and factual cookie list live (P7-PC1); policy text as a Studio draft, shown above the cookie list once approved | ✅ Controls · ⛔ Q5 text |
| P3-10  | Products page: product comparison and "future products" slot                          | ✅ |
| P3-11  | Breadcrumbs (BreadcrumbList schema) on inner pages                                     | ✅ |
| P3-12  | Site search (pages + articles)                                                         | ⬜ |
| P3-13  | Swahili translation review → publish `sw` locale                                       | ⛔ Q6 |
| P3-14  | French, Arabic, Chinese review → publish                                               | ⛔ Q6 |

### Phase 4 — Product websites 🔄

**Goal:** independently deployable product sites (`apps/zirahr-web`, `apps/jasiri-web`, `apps/expense-web`) sharing packages. **Depends on:** Phase 2 design system; Q7–Q13.
**Acceptance criteria:** each site meets Phase 2 quality bar, has its own nav/SEO/sitemap, Back to FigBud link, and only verified capability claims.

| ID      | Task                                                                                         | Status |
| ------- | -------------------------------------------------------------------------------------------- | ------ |
| P4-01   | App template for product sites: `@figbud/site-kit` (shared security headers, locale proxy, styles, product header with Back to FigBud, footer, product theme) + product nav in the registry | ✅ |
| P4-02   | Cross-site links: env-driven origins, new-tab behaviour with announced "opens in a new tab", Back to FigBud, never-dead fallbacks; product CTAs to the corporate enquiry form | ✅ |
| **ZiraHR** |  |  |
| P4-Z1   | Homepage — The Connected Workforce (`apps/zirahr-web`: hero, modules, payroll, demo CTA; built and tested, not yet deployed) | 🔄 In progress |
| P4-Z2   | Platform and Modules pages (Employee 360, payroll, leave, attendance, performance, collaboration, analytics, ESS) — each a distinct interactive experience | ⬜ |
| P4-Z3   | Kenya payroll engine: rules-based, effective-dated, unit-tested against signed-off cases      | ⛔ Q10 |
| P4-Z4   | Payroll calculator page (Kenya default; other countries disabled until validated)             | ⛔ Q10 |
| P4-Z5   | Leave approval journey animation; attendance location-and-shift demo                           | ⬜ |
| P4-Z6   | Solutions, Resources, Pricing, Company, Book a Demo                                            | ⬜ |
| **Jasiri LMS** |  |  |
| P4-J1   | Homepage — Lending is complex. Your technology shouldn't be.                                   | ⬜ |
| P4-J2   | Lending Solutions (models via configuration), Origination, Credit & Risk, Servicing, Collections, Analytics, Integrations, Security | ⛔ Q11 |
| P4-J3   | Demos: loan application journey, repayment schedule calculator, credit decision workflow, collections dashboard, portfolio-health simulator | ⬜ |
| P4-J4   | English + Swahili at launch                                                                     | ⛔ Q6 |
| **Expense Now** |  |  |
| P4-E1   | Coming-soon homepage with waitlist                                                              | ⬜ |
| P4-E2   | Capability roadmap content: live vs planned clearly marked                                      | ⛔ Q12 |
| P4-E3   | Approval-chain and payment-orchestration storytelling (no PSP or settlement claims)             | ⬜ |
| P4-L1   | Shared lending website template (components, content schemas, demonstrations) used by Jasiri LMS and Ziwa LMS, with independent brand, navigation, copy, SEO, forms and publication per product: lending template set done (lending home, lending solutions, borrower journey), with per-product brand, copy and publishing through the Studio and the renderer; the Jasiri and Ziwa websites themselves need verified copy (Q19) and the renderer's deployment | 🔄 In progress |
| P4-W1   | Ziwa LMS website on the lending template: Home ("Every loan. A smoother journey."), Platform, Lending Solutions, Features, Integrations, Resources, Contact; copy differentiated from Jasiri | ⛔ Q19 |
| **All products** |  |  |
| P4-10   | Per-site metadata ✅ and SoftwareApplication schema ✅ (ZiraHR); per-site sitemaps once pages are published | 🔄 In progress |
| P4-11   | Product-intent SEO content (HR/payroll; loan management; expense management)                    | ⬜ |
| P4-12   | Product accents and logos confirmed                                                             | ⛔ Q7 |
| P4-13   | Real sanitised screenshots where available                                                      | ⛔ Q9 |
| P4-14   | Per-site e2e in CI ✅ (ZiraHR, 5 browser projects); Lighthouse budgets per site | 🔄 In progress |

### Phase 5 — Integrations & administration 🔄

**Goal:** working lead capture, email, CMS and admin. **Depends on:** Q4, Q14, Q15.
**Acceptance criteria:** real email delivery with retries and no duplicates; admin access restricted and audited; CMS publishing with approval.

| ID     | Task                                                                                         | Status |
| ------ | -------------------------------------------------------------------------------------------- | ------ |
| P5-01  | Enquiry API: validation, idempotency keys, spam signals, IP hashing (no raw IPs stored)       | ✅ |
| P5-02  | Email templates: team notification + visitor acknowledgement (HTML-escaped)                   | ✅ |
| P5-03  | Durable outbox with exponential backoff, multi-replica safe (`SKIP LOCKED`)                   | ✅ |
| P5-04  | Resend client with provider idempotency keys; safe `log` mode for development                | ✅ |
| P5-05  | Per-product and partnership recipient routing via environment                                 | ✅ |
| P5-06  | Per-IP rate limiting with `Retry-After`                                                       | ✅ |
| P5-07  | CMS data model and API: schema, public read API, editorial API (drafts, review, maker-checker publishing, scheduling, archive/restore, versions, taxonomy, preview) | ✅ |
| P5-08  | Admin authentication: passkeys (WebAuthn), invite-only onboarding + CLI bootstrap, roles, hashed sessions, CSRF (Origin), rate limits | ✅ |
| P5-09  | Admin UI: sign-in, invites, overview; Insights editor and workflow; enquiries inbox with follow-up statuses and owner-only CSV export | ✅ |
| P5-10  | Audit log for all admin and CMS actions (sign-ins, failures, invites, passkeys, every editorial action; shown to owners) | ✅ |
| P5-11  | Go live on Resend (verified domain, real recipients)                                         | ⛔ Q4 |
| P5-12  | Localised acknowledgement emails                                                             | ⬜ |
| P5-13  | Shared rate-limit store when API runs >1 replica                                             | ⬜ |
| P5-14  | Turnstile on public forms                                                                    | ⬜ Q15 |
| P5-15  | Privacy-friendly analytics and conversion tracking                                           | ⬜ Q14 |
| P5-16  | Data-retention policy and purge job for enquiries                                            | ⬜ Q5 |
| P5-17  | Email hold mode: store emails until Resend is configured; only provider acceptance counts as sent; recipients resolved at delivery | ✅ |

### Phase 6 — Production deployment 🔄

**Goal:** live, monitored, recoverable production. **Depends on:** Railway project details (Q17), domains (Q1), Resend credentials (Q4) and **your authorisation** — nothing is created or purchased without it. **Runbook:** [DEPLOYMENT.md](DEPLOYMENT.md).
**Acceptance criteria:** HTTPS on all domains, CI gates enforced, backups and rollback tested, staging non-indexable, monitoring alerting.

| ID     | Task                                                                                       | Status |
| ------ | ------------------------------------------------------------------------------------------ | ------ |
| P6-01  | Dockerfiles for web and API                                                                 | ✅ |
| P6-02  | Railway service configs with health checks                                                  | ✅ |
| P6-03  | Environment-driven origins, CORS, indexing switch                                           | ✅ |
| P6-03b | Deployment runbook: services, variables, migrations, Resend go-live, rollback               | ✅ |
| P6-04  | Staging never indexable (robots + `noindex` unless explicitly enabled)                      | ✅ |
| P6-05  | GitHub repository connected; initial push to `main`                                        | ✅ |
| P6-05b | PR template ✅; branch protection on `main` (require CI) needs your go-ahead in GitHub settings | 🔄 In progress |
| P6-06  | CI: format, lint, typecheck, unit, Rust (with PostgreSQL), build, e2e                       | ✅ |
| P6-06b | Lighthouse budgets in CI (a11y/SEO/CLS gate; performance warns while baselining)            | 🔄 In progress |
| P6-07  | Dependency and vulnerability scanning (Dependabot / cargo-audit / npm audit)                | ✅ |
| P6-08  | Railway: inspect existing project, then configure web, API, PostgreSQL (production live; staging later) | ✅ Production |
| P6-09  | Domains, DNS, SSL for corporate and product subdomains                                      | ⛔ Q1 |
| P6-10  | CDN caching for static assets and prerendered pages                                         | ⬜ |
| P6-11  | Secrets in Railway variables (IP salt and database reference set; Resend later)            | 🔄 (Resend part ⛔ Q4) |
| P6-12  | Automated database backups ✅ (daily/weekly/monthly + manual baseline, 22 Oct); tested restore in a staging environment (needs your go-ahead: extra Railway cost) | 🔄 In progress |
| P6-13  | Monitoring: uptime checks every 15 min ✅, structured logs ✅, health-check restarts ✅; error tracking and RUM Core Web Vitals (provider choice, Q14) | 🔄 In progress |
| P6-14  | Rollback procedure tested; permanent redirects from any legacy URLs (e.g. `figbudglobal.online`) | ⬜ Q1 |
| P6-15  | Launch checklist and sign-off                                                               | ⬜ |
| P6-16  | Move Railway service settings into infrastructure as code (`.railway/railway.ts`); `railway.toml` is no longer applied | ⬜ |

### Phase 7 — Admin Studio & configurable website builder 🔄

**Goal:** one admin studio that manages the corporate website and every product website: registry, lifecycle, pages built from typed blocks, shared content and media, themes and navigation, granular permissions with approvals and rollback, SEO and localisation. *Build once. Configure continuously. Publish confidently.* **Design:** [ADMIN_STUDIO.md](ADMIN_STUDIO.md) (D16–D20).
**Acceptance criteria:** no arbitrary JavaScript or unsanitised HTML through the CMS; autosave never publishes; every change audited with previous and new values and reversible; marketing status never switches on the operational product, payments, sign-ups or production integrations.

| ID     | Task                                                                                         | Status |
| ------ | -------------------------------------------------------------------------------------------- | ------ |
| P7-A1  | Phase A: audit of the existing admin and design (data model, permissions, lifecycle, safety rules) | ✅ |
| P7-B1  | Website registry schema and migration; today's four websites seeded                              | ✅ |
| P7-B2  | Registry API: public listing with call to action, admin create/update with version conflicts, archive/restore, audit per website | ✅ |
| P7-B3  | Marketing lifecycle Draft → Coming soon → Beta → Active → Retired via requests with maker-checker approval | ✅ |
| P7-B4  | Admin UI: Websites list, guided new-website wizard (category, template, suggested pages, launch status), settings, lifecycle panel, archive/restore, overview tile | ✅ |
| P7-B5  | Corporate Products page and homepage showcase follow the registry (falls back to the code registry if the API is down) | ✅ |
| P7-B6  | Beta / early-access badge and enquiry type on the corporate site (needs reviewed copy in every language) | ⬜ |
| P7-BR1 | Supplied logos (FigBud Global, ZiraHR, Jasiri LMS) preserved unchanged and documented; exact-pixel derived files ([BRAND_ASSETS.md](BRAND_ASSETS.md)) | ✅ |
| P7-BR2 | Brand file library API: uploads with type, size and dimension checks, SVG sanitising, transparency, WebP renditions, archive/restore, where-used | ✅ |
| P7-BR3 | Brand profiles: autosaved drafts (never public), submit → approve (maker-checker), version history and rollback, audit with previous and new values | ✅ |
| P7-BR4 | Studio Branding page: logo slots per theme (horizontal, stacked, symbol, wordmark, favicon, app icon, social image), colours with contrast checks, logo size, live preview (dark/light, desktop/phone), undo/redo | ✅ |
| P7-BR5 | Websites use the published brand: corporate header, footer, product menus, homepage tabs and Products cards; ZiraHR header and footer; logos served from each site's own origin | ✅ |
| P7-BR6 | Product colours follow the official logos (ZiraHR cyan, Jasiri green/purple, Expense Now orange), with WCAG contrast tests | ✅ |
| P7-BR10 | Homepage hero ecosystem: published logos (FigBud core, ZiraHR symbol, Jasiri logo, Expense Now and Ziwa LMS symbols), registry names, statuses and colours; nodes link to configured destinations with descriptions on hover, focus or first tap; reduced motion respected | ✅ |
| P7-BR7 | Expense Now identity: **owner-approved 30 Oct 2026** (radial burst symbol, brown "Expense" over orange "Now"; #FF7A00 / #FFC107 / #4E2D17 / #10B981 / #0B6EDB), replacing the concept; rebuilt as clean vectors from the approved sheet (logos for light and dark, symbols, monochrome, favicons with thicker rays for small sizes, app icons on white and brown tiles); icons served at 16–512 px including 128 and 256; published through the brand system with a one-time upgrade that archives the concept; shown across the corporate site, product website and Studio from its published brand; still Coming soon | ✅ |
| P7-BR8 | Favicons and app icons from brand profiles: official FigBud and ZiraHR symbols on plain tiles, published once to existing profiles as a recorded revision; built-in fallbacks (favicon.ico, icon.png, apple-icon.png) replace the old generated "F" icon on the public site, admin, sign-in and 404 pages and the ZiraHR site | ✅ |
| P7-BR11 | Social sharing images from brand profiles: the image uploaded in Branding is served as the 1200 × 630 PNG social platforms expect (any SVG, PNG or WebP, filled and centre-cropped by the API); without one, the corporate site keeps its generated card and each product website gets a card generated from its published brand (symbol, name, tagline, colours); Open Graph and X (Twitter) cards on every page | ✅ |
| P7-ZW1 | Ziwa LMS registered (fifth website, after Expense Now; coming soon) and shown across the corporate site: product menus, hero (rebalanced four-product layout), homepage tabs with its own preview, Products page, contact form, structured data; enquiries and email routing accept it | ✅ |
| P7-ZW2 | Ziwa LMS identity: **final identity owner-approved 29 Oct 2026** (orange and yellow symbol, brown wordmark, tan LMS; #FB7A1A / #FFC642 / #4E2D17 / #D4A97A), replacing the blue and green version of 28 Oct; rebuilt as clean vectors from the approved sheet (logo for light and dark backgrounds, symbol, favicon and app icon on ivory and brown tiles, one-colour versions); published through the brand system with a one-time upgrade for existing databases that archives the superseded files; orange palette with contrast tests | ✅ |
| P7-BR13 | Branding consistency: one `ProductLogo` rule everywhere (published symbol, else published logo, else temporary icon), used by the platform tabs, hero, Africa map, menus, Products page, product sites and Studio; platform tabs show logos on phones and scroll sideways; browser icons at 16–512 px and per-site web manifests from the published brand | ✅ |
| P7-MAP1 | Africa expansion map: FigBud Global origin at Nairobi with the official symbol ("Where our vision begins."); product logos from the registry and published brands on an ocean-side arc with description cards (hover, focus, tap) linking to product sites or waitlists; compact grid on phones; per-product "Show on the Africa expansion map" setting in Admin → Websites | ✅ |
| P7-UX1 | Smart action buttons: shared change detection and `ActionButton` across Studio forms (enabled only when ready, reasons when not, no double submits, saved baselines, unsaved-changes warning, autosave skips unchanged drafts, Discard draft) | ✅ |
| P7-BR12 | Branded Studio: official symbol in the admin header and sign-in pages; website cards with published logos, temporary-icon notice, custom domain vs website destination, Manage / Branding / Open website actions; admin nav fits phones | ✅ |
| P7-UX2 | Continuous Studio polish (standing priority, reviewed with every milestone): "FigBud Global · Studio" header lockup; account menu (initials, name, role; email and Sign out inside; Escape and click-outside close it); invite form with full-width email, role cards that explain each role and a 7-day expiry note; readable activity labels for every brand and page action plus a fallback for new ones, each naming its website; signed-in dashboard covered by the accessibility scan | 🔄 Ongoing |
| UI-SP1 | Spacing and typography refinement across every website and the Studio: shared fluid spacing tokens (page-top, section, section-sm, stack, block) and a refined type scale with a page-title step (docs/UI_STANDARDS.md); home header-to-hero spacing about halved, hero-to-Our Platforms gap 240px to 128px (stacked padding, no empty elements), Our Philosophy titles smaller and aligned on a shared baseline with tighter rows; section spacing 56–96px instead of 80–128px on the home page, product sites and ZiraHR; page headers, products, contact, blog, footers and the Studio on the same tokens; checked at phone, tablet and desktop with no horizontal overflow | ✅ |
| UI-F1  | Smart contact forms and Blog layout: work email (company preferred, personal accepted, trimmed, checked on leaving the field and by the API); searchable country selector (245 countries, libphonenumber metadata, localised names, flags, calling codes, ISO codes stored); international phone inputs validated per country and stored in E.164 (browser libphonenumber-js, API Rust `phonenumber`); dependent second number (added once the first is valid, inherits its country, no duplicates, removed when the first is cleared; `enquiries.phone_secondary`, migration 21); flag font for Windows; Blog empty state aligned with the page title (no dashed box or extra indentation) listing the planned topics; Blog shows articles automatically once published | ✅ |
| UI-NAV1 | Inverse-theme navbar dropdowns: the Products menu and language selector (corporate site and product websites through the shared `ProductHeader`) use the opposite theme to the page via a shared `InverseTheme` wrapper (dark panel on light pages, light on dark; tokens, product accents and logo variants follow); solid elevated panel, viewport-aware width and height with internal scrolling; Jasiri row aligned with the others (empty logo slot for wordmark-only products); ZiraHR tagline "HR Simplified. Business Amplified."; hover then click keeps the menu open, and Escape returns focus to the trigger; e2e test in both themes (docs/UI_STANDARDS.md) | ✅ |
| P7-BR9 | Complete and vector logo files: ZiraHR with "HR", SVGs, official light-background versions | ⛔ Q18 |
| P7-C1  | Page model: pages, versions, sections; typed block schemas validated by the API (no markup): hero, text, feature grid, steps, figures (source required), questions, call to action; safe links only; published-only public API | ✅ |
| P7-C2  | Visual page builder: drag-and-drop sections (with keyboard arrows), block library, block forms, live desktop/phone preview and full-page draft preview, autosave that never publishes, undo/redo | ✅ |
| P7-C3  | Page templates per category; draft → review → publish → schedule → rollback for pages: workflow, version restore, duplicate, archive and page order; 15 templates (general set plus lending, HR and finance sets) offered by category with suggested titles and addresses; scheduled publishing with approval, a multi-instance-safe scheduler, and cancelling | ✅ |
| P7-D1  | Central content library: sections written once and used on pages of any website through the Shared content block (referenced, never copied); editors edit drafts, reviewers publish numbered versions with a note, any version can be restored; pages always show the latest published version; usage across websites; archive blocked while in use; no media images or nesting inside items | ✅ |
| P7-D2  | Media library per website: uploads (JPEG, PNG, WebP, SVG up to 8 MB) through the shared image pipeline (sniffed, sanitised, decoded with limits, turned upright, re-encoded so camera metadata never ships, capped at 2400 px), responsive renditions (480–1920 px; JPEG, or lossless WebP when transparent), required and editable alt text, usage tracking from page drafts and published versions, archive blocked while in use; Image block (caption, text or full width) in the page builder; public only while a published page uses an image | ✅ |
| P7-E1  | Theme configuration with token guard rails (contrast checks, brand limits); brand colours done (P7-BR4/6); parent palette and themes done (P7-TH1/TH2); **per-site themes done (30 Oct 2026):** each website's brand and soft section bands (Navigation & forms → Theme, contrast-checked by the API), a Section style per page section (Default / Brand band / Soft band, part of the draft and approval), applied on the product sites and in Studio previews in both themes; Ziwa set to brown #4E2D17 and ivory #FDF9F4 | ✅ |
| P7-TH1 | FigBud Global parent palette (D21) and Light / Dark / System switch across the corporate site, product sites and Studio; centralised tokens (`tokens.css`, `themeBackground`), Studio brand colours upgraded once, emails and Open Graph image recoloured; contrast tests for both modes | ✅ |
| P7-TH2 | One-button theme switch (moon while light, sun while dark) on the corporate site, product sites and Studio; **dark is the default for every first-time visitor** whatever the device prefers; a chosen theme is remembered and applied before first paint; older "system" preferences start dark; browser theme colour always dark | ✅ |
| P7-PC1 | Cookie consent on every FigBud website: strictly necessary only until a choice; banner (Accept all / Reject optional / Customize, equal weight, nothing preselected); preferences dialog; "Cookie settings" in every footer; choice kept in a first-party cookie for the configured days and asked again on a new policy version; anonymous consent records (random ID, choices, version, website: no IP or personal data), deleted after the configured months; integrations from a fixed provider list (Plausible, GA4, Meta Pixel, LinkedIn Insight) by ID only, loaded only after consent and stopped on withdrawal, CSP limited to those providers; Admin Studio → Settings → Privacy & Cookies (owners edit; report for everyone); factual cookie list on the Cookie Policy page. **Remaining:** policy text from legal counsel (Kenya Data Protection Act review), then publish the Privacy and Cookie Policy pages | ✅ Mechanism · ⛔ Policy text (legal) |
| P7-ZR1 | ZiraHR website managed from the Studio (first complete integration): audit done; home page imported as published Studio content and served by the renderer; section show/hide, page online/offline and navigation visibility for every website; workspace summary on website cards. navigation, footer and enquiry switch (P7-E2). per-site themes (P7-E1). media library (P7-D2). Remaining: renderer deployment | 🔄 In progress |
| P7-E2  | Navigation and footer configuration per website, with the enquiry switch: menu from the website's pages or up to 8 chosen links, footer note and links, enquiries on/off with a closed message (enforced by the API, 409 `enquiries_closed`; received enquiries kept; the corporate site always open); reviewers change them directly, audited; applied on the product sites and the corporate contact form | ✅ |
| P7-E3  | Multi-site renderer (D16); ZiraHR website moves onto registry-driven pages: renderer built and tested (`apps/sites-web`: path prefix or own domain, published pages, brand, navigation, calls to action, SEO, sitemap, holding pages); deployment needs a Railway service (your approval); ZiraHR's move onto it remains | 🔄 In progress |
| P7-F1  | Per-website permissions on top of Studio roles: everyone keeps one Studio role; owners can limit people to selected websites, each with its own role (never above the Studio role; owners always have every website); websites without access are hidden (404) across websites, pages, media, brand, settings and status requests; enquiries filtered to the person's websites; Insights need the corporate website; shared content changes need every website; Settings → Team & access (owners) and website access in invites; changes apply at once and are audited with before and after | ✅ |
| P7-F2  | Approval queue across websites; audit with previous and new values; rollback                 | ⬜ |
| P7-G1  | SEO per page: search title and description with a live result preview, the page's own sharing image from the media library, "Hide from search engines" (noindex, left out of the sitemap), canonical URLs, automatic 308 redirects when a published page moves (listed in the page, removable), sitemap of indexable published pages | ✅ |
| P7-G2  | Localisation workflow (EN/SW/FR/AR/ZH, Arabic right-to-left); unreviewed translations stay unindexed | ⬜ |
| P7-G3  | Forms and leads per website, delivered through Resend (with P5-11)                          | ⬜ Q4 |
| P7-G4  | Performance budgets for builder-made pages: the API measures what a phone downloads for each draft (sections shown, images, image download at phone size, largest image, text and layout; hidden sections excluded, shared content resolved); Studio Performance panel with warnings and advice; over a limit the page can't be submitted or approved; first image on a page loads at once (high priority) instead of lazily | ✅ |

---

### Phase 8 — Marketing: campaigns & promotions

Scope: a central, multi-website campaign engine in the Studio (Marketing → Campaigns & Promotions), brand-aware templates, scheduling, placements, approvals, secure interactive rewards, reporting and enquiry attribution. Design and rules: [CAMPAIGNS.md](CAMPAIGNS.md).

| ID     | Task | Status |
| ------ | ---- | ------ |
| P8-M1  | Campaign model and API: one website per campaign, ten types from templates, typed and validated document (content, design, display, schedule, rewards), drafts, approval with maker-checker, numbered versions and restore, pause, resume, archive, duplicate, per-website access, audit (migration 20) | ✅ |
| P8-M2  | Websites: brand-aware campaign display on the corporate site and every product website (announcement bar, below navigation, home or landing hero, floating card, dialog, footer band); page, device, frequency and trigger rules; conflict resolution; live countdown; hides at its end; one dialog per page, never over the cookie banner | ✅ |
| P8-M3  | Studio: overview dashboard (counts, recorded performance, per website), filters, create, builder with live desktop/phone and dark/light preview, publishing controls, results, version history | ✅ |
| P8-M4  | Spin to win: rewards decided by the API in a locked transaction (stock, attempts per email, weights), disclosed odds, claim codes and redeem-by dates, free entry, terms and recorded legal review required, owner approval | ✅ · ⛔ Activation per market needs the legal review recorded (Q20) |
| P8-M5  | Reporting and attribution: daily impression, click, dismissal and conversion counts without personal data; enquiries record the campaign that brought them; reward claims and redemptions | ✅ |
| P8-M6  | Reward confirmation emails and redemption marking in the Studio | ⬜ Q4 (Resend) |

### Phase 9 — SEO & search visibility

Scope: SEO as a permanent release requirement across every website: technical audit and fixes, each website's own search identity in the Studio, a health check and overview, structured data, a CI quality gate, then data connections and content work. Specification: [SEO.md](SEO.md).

| ID     | Task | Status |
| ------ | ---- | ------ |
| P9-S1  | Studio → SEO: each website's search identity (indexing switch, title template, default description, languages, target markets, focus phrases, official profiles, Search Console and Bing verification tokens; reviewers, version-checked, audited; migration 22), health check of published pages (titles, descriptions, h1, thin content, broken and redirected links, noindex) and overview across websites | ✅ |
| P9-S2  | Technical fixes and structured data: product sites use their template, default description, verification tags and indexing switch (noindex, sitemap); JSON-LD SoftwareApplication, WebSite, BreadcrumbList, FAQPage on product sites; WebSite and Products ItemList on the corporate site; verified profiles in Organization; official slogan; no ratings or offers | ✅ |
| P9-S3  | CI quality gate: server-rendered h1, unique titles and descriptions, canonicals, JSON-LD, internal links, noindex for drafts, pending legal pages and the Studio, real 404s, robots outside production | ✅ |
| P9-S4  | Search Console, GA4 and Bing data connections (indexing, queries, impressions, clicks, organic conversions) with least-privilege access | ⬜ Q21 |
| P9-S5  | Content: topic clusters, product guides, regional pages with verified local relevance, translated metadata per reviewed language | ⬜ Content, Q6 |

### Phase 10 — Motion, product discovery & customer proof 🔄

Scope: premium, lightweight motion on one shared system; product discovery without long scrolling; centrally managed Trusted By organisations, testimonials, verified success metrics and customer and partner announcements, each targeted to any of the websites. Nothing customer-facing is invented: records need recorded permission, and metrics need a source, a period and verification. Specifications: [UI_STANDARDS.md](UI_STANDARDS.md) (Motion, Product cards), [ADMIN_STUDIO.md](ADMIN_STUDIO.md) (Content & Marketing).

| ID      | Task | Status |
| ------- | ---- | ------ |
| UI-MO1  | Global motion design system: motion tokens (durations, easings, distances, stagger, marquee loop); one scroll trigger (`armReveal`) behind `Reveal`, `RevealGroup` (sequenced CSS reveals: item, accent line, number roll, glow), `CountUp` (formatted, width reserved, final value in server HTML) and `Marquee` (seamless, pause button, hover and focus pause, reduced-motion still row); progressive enhancement: server HTML, no-JS and reduced motion show final states; transforms and opacity only; reading-direction aware | ✅ |
| UI-MO2  | Horizontal product discovery: Our Platforms tabs over a sliding track; previous and "Next: product" controls, position and dots; touch swipe that follows the finger (vertical scrolling never captured), sideways trackpad gestures, arrow keys; next product peeks in on large screens; off-screen panels inert; previews replay on arrival; optional slow rotation set in the Studio (corporate website → Home page motion; off by default, 6–20 s) that pauses on hover, focus, interaction, off screen and hidden tabs, with a pause button and progress line, and never runs with reduced motion | ✅ |
| UI-MO3  | Scroll-triggered philosophy rows: each row on its own as it scrolls in: accent line, number roll, title then description travelling in the reading direction; once per visit; no layout shift | ✅ |
| UI-MO4  | Engineering micro-interactions: accent-line progression, one-off icon glow, staggered text, hover lift and glow; the approval workflow demonstration labelled as illustrative synthetic data | ✅ |
| UI-PR1  | Products page redesign: product jump links; a spotlight for the first live product with its interactive synthetic preview; equal supporting cards (brand accent line, glow, status, highlights, demo or waitlist and website actions) in a responsive grid ready for future products; all content visible without hover; comparison and future-products sections kept | ✅ |
| P10-T1  | Trusted By & partner logo management: Studio → Content & Marketing → Trusted By; organisation, relationship, website, description, logo and icon from the corporate media library, order, active switch, website targeting; publishing needs a confirmed relationship, display approval and recorded evidence; public animated logo row | ✅ Built (migration 23, `proof.rs`, Studio, both website types); content ⛔ Q22 |
| P10-T2  | Customer testimonials: quote, organisation, person and title (only with approval), photo (only with approval), product, industry, country, evidence; maker-checker publication, versions, audit; public cards with product accents | ✅ Built; content: genuine, approved quotes only |
| P10-T3  | Verified success metrics: label, value, number/currency (KES)/percent, compact notation, decimals, marks, source and period (shown publicly), verified flag; count-up showcase | ✅ Built; content: verified figures only |
| P10-B1  | Customer & partner banners on the campaign engine: announcement kinds (new customer, partnership, launch, milestone, success story, event), associated organisation, light and dark appearance, independent website toggles | ⬜ |
| P10-W1  | Multi-website targeting: one record shown on any selection of websites without copies; publication and visibility controlled separately; editors and reviewers need every targeted website | 🔄 Records done; banners with P10-B1 |
| P10-V1  | Responsive, accessibility and performance validation of every new section (360 px to wide screens, both themes, axe, reduced motion, no horizontal overflow, Lighthouse) | 🔄 Continuous: motion and Products page checked |

## 7. Milestones

| Milestone                          | Contents                                    | Exit criteria                                         | Status |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------- | ------ |
| M1 — Foundation ready              | Phase 1                                      | All local checks green                                | ✅ 22 Oct 2026 |
| M2 — Homepage review               | Phase 2 through P2-17                        | Stakeholder review of the running homepage            | 🔄 Ready for review |
| M3 — Homepage sign-off             | P2-18 → P2-22                                | Lighthouse targets met, accessibility pass, approved  | ⬜ |
| M4 — Corporate site complete       | Phase 3                                      | All pages published with approved content             | ⬜ |
| M5 — ZiraHR site                   | P4-01, P4-02, P4-Z*                          | Validated calculator, module pages, SEO               | ⬜ |
| M6 — Jasiri LMS site               | P4-J*                                        | Demos and verified capabilities                       | ⬜ |
| M7 — Expense Now site              | P4-E*                                        | Waitlist live, roadmap content approved               | ⬜ |
| M8 — Integrations live             | Phase 5                                      | Real email, admin, CMS                                | 🔄 Admin and CMS live; email awaits Resend (Q4) |
| M8b — Repository live              | P1-25, P6-05, P6-06                          | Code on GitHub `main`, CI green                       | ✅ 22 Oct 2026 |
| M9 — Production launch             | Phase 6                                      | Launch checklist signed                               | ⬜ |
| M10 — Website registry             | P7-A1 → P7-B5                                | Websites managed from admin; public site follows      | ✅ 23 Oct 2026 |
| M11 — Page builder                 | P7-C*, P7-D*                                 | A product page built, reviewed and published from blocks | 🔄 Built, reviewed and published in the Studio; shown on product websites with P7-E3 |

---

## 8. Risks

| Risk                                                                 | Impact | Mitigation                                                                    |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| Unverified claims published (figures, regulatory, PSP status)        | High   | Content rules in §3.7; claims gated on Q3, Q11, Q12; review in P2-22           |
| Payroll calculator shows incorrect statutory figures                 | High   | Effective-dated rules, signed-off test cases (Q10), calculator disabled until validated |
| Unreviewed translations indexed                                      | Medium | Draft locales `noindex` and excluded from sitemap by design                    |
| Product sites drift from the shared design system                    | Medium | Shared packages; product sites consume tokens, never fork them                 |
| In-memory rate limiting insufficient with multiple API replicas      | Low now | P5-13 before scaling out                                                      |
| CSP requires `'unsafe-inline'` scripts for static Next.js pages      | Low    | All other directives locked down; evaluate nonce/hash approach in P6           |
| Dev-tooling audit findings (ESLint's `braces` dependency)            | Low    | Build-time only; CI audits shipped dependencies (0 findings); Dependabot tracks tooling |
| Local Lighthouse on Windows is noisy (trace errors, CPU contention)  | Low    | Lighthouse measured in CI on a clean Linux runner, median of three runs        |
| Railway platform outage (22 Oct) slows deployments                   | Medium | First deployment completed 10:24 UTC; later builds may queue; queued builds never retriggered (per Railway) |
| Passkeys are bound to the admin origin                               | Low    | When the production domain replaces the Railway domain, admins register a passkey there via a fresh invite |
| Hero description cards on iPhone: headless WebKit stops animation frames while a card overlaps the animated orbit (seen only in the emulator) | Low | Check on a real iPhone; if reproduced, pause the orbit animation while a card is open |
| Blog has no articles until FigBud supplies verified content           | Low    | Honest empty state; blog stays `noindex` and out of the sitemap until the first article is published |

---

## 9. Change log

| Date        | Change                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| 31 Oct 2026 | Motion and product discovery (UI-MO1–MO4, UI-PR1). One motion system: tokens in the brand package and one scroll trigger behind every reveal, count-up and logo marquee. Server HTML, visitors without JavaScript and reduced motion always see the final content. Our Platforms is now a horizontal slider. Tabs, previous and "Next: product" buttons, swipes, trackpad gestures and arrow keys move it, and the next product peeks in on large screens. Optional slow rotation is set in the Studio (corporate website → Home page motion, off by default) and pauses whenever the visitor is involved. Philosophy rows and engineering capabilities reveal one by one, with an accent line, a number roll, a one-off glow and hover lift; the workflow demonstration is labelled as illustrative. The Products page has jump links, a spotlight with the live product's preview and equal supporting cards. Trusted By, testimonials and verified metrics (P10-T1–T3) are managed in Studio → Marketing. One record can show on many websites, with maker-checker publication, versions and audit, and the API refuses to publish without recorded permission or a metric's source, period and verification. The corporate site and product websites show only published records, with a calm logo row, count-ups that state their source and period, and testimonial cards. Nothing renders while nothing is published, and production starts empty. Open question Q22 records which organisations can be shown. |
| 31 Oct 2026 | Inverse-theme navigation dropdowns (UI-NAV1). The Products menu and the language selector now open in the opposite theme to the page: a dark panel on light pages, a light panel on dark pages. They use one shared `InverseTheme` wrapper (`@figbud/ui`) that flips `data-theme`, so colours, product accents and logo variants switch automatically and follow theme changes. The language selector is shared, so product websites get the same behaviour. Panels stay inside the viewport, scroll within themselves if needed and sit above page content. Fixed: the Jasiri row was misaligned (wordmark-only products now get an empty logo slot); the ZiraHR tagline in the menu is now "HR Simplified. Business Amplified."; on desktop, a click right after hovering no longer closes the menu; Escape returns focus to the trigger. The mobile menu stays in the page theme because it's a full-screen dialog. Standard in docs/UI_STANDARDS.md; e2e coverage for both themes. |
| 30 Oct 2026 | SEO & search visibility (P9-S1–S3). Technical audit (docs/SEO.md): rendering, canonicals, sitemaps, noindex rules, status codes and hreflang were already right; product sites had no structured data and the Organization slogan was out of date. Added: Studio → SEO, with each website's search identity (indexing switch, title template, default description, languages, markets, focus phrases, verified profiles, Search Console and Bing tokens; migration 22, `/v1/admin/sites/{slug}/seo`, audited) and a health check of its published pages (duplicate or long titles, missing descriptions, missing h1, thin pages, broken or redirected links), plus an overview across websites (`/v1/admin/seo`). Product sites apply the template, default description, verification tags and indexing switch, and publish SoftwareApplication, WebSite, BreadcrumbList and FAQPage JSON-LD; the corporate site adds WebSite, a Products ItemList and verified profiles. CI quality gate on every push. Search Console and analytics data stay "not connected" until API access is provided (Q21); nothing is estimated. Defects found by the new gate and fixed: the home page's search description was 189 characters (now 147), and an article's language links pointed to addresses that don't exist in other languages (they now go to that language's blog). Also fixed: saving in the content library editor no longer clears the note being written. |
| 30 Oct 2026 | Smart contact forms (UI-F1). Contact form: "Work email" with a "company email preferred" note (personal addresses still accepted), trimmed and checked when the field is left; a searchable country selector and international phone inputs (shared site-kit components with libphonenumber data), numbers validated for their country and sent and stored in E.164; a second number that appears once the first is valid, inherits its country, can't repeat it and is removed when the first is cleared. API: country must be an ISO code, numbers validated with the Rust port of libphonenumber and stored in E.164, `phone_secondary` (migration 21) in the inbox, team email and CSV export (added as the last column). Earlier enquiries are unchanged. Blog: the empty state sits on the page's own alignment without the dashed box and extra top margin, and lists the topics the blog will cover; articles replace it as soon as one is published. Forms specification in docs/UI_STANDARDS.md. |
| 30 Oct 2026 | Campaigns & promotions (P8-M1–M5). Studio → Marketing → Campaigns & Promotions: campaigns for exactly one website each (corporate or product), ten types from templates, a builder for content (sanitised Markdown, buttons that open a link or the existing contact form with the campaign attributed, promotional code, countdown, media-library image), design (inheriting the website's published brand), display (six placements, page and device targeting, frequency, delay/scroll/exit-intent triggers, dismissal) and schedule (start, end, priority, yearly), with live desktop/phone and dark/light preview. Draft → approval (maker-checker) → numbered versions with restore; pause, resume, archive, duplicate; per-website access; audited. Websites show live campaigns only (30-second cache, hidden at their end; the corporate site refreshes at once on Studio changes). Spin to win: rewards decided by the API in a transaction that locks stock (attempts per email, weights, quantities), odds disclosed, claim codes, free entry, terms and a recorded legal review required, owner approval. Reporting: daily event counts without personal data, conversions (campaign enquiries and claims), reward stock. API: migration 20, `/v1/admin/campaigns/*`, `/v1/sites/{slug}/campaigns`, `/v1/campaigns/{id}/events`, `/v1/campaigns/{id}/spin`; enquiries accept `campaign`. Cookie Policy lists the campaign browser storage. Also: the theme switch no longer animates colours (CI's WebKit accessibility scan caught text mid-transition after the switch). |
| 30 Oct 2026 | Website pages completed (P3-04, P3-07–09). About Us is a finished, indexed page built only from approved copy: the official slogan "One Vision. Endless Solutions.", the company statement, philosophy (cards), the four products from the registry with logos and status, engineering capabilities, the Nairobi starting point and market facts, and the closing call to action; no new corporate facts (history, team and offices wait for Q2). About and the three legal pages are now corporate pages in the Studio (migration 19 seeds drafts, never published): a version published there replaces the built-in page, and legal pages become indexed (and join the sitemap) only when counsel's text is published without "Hide from search engines". The corporate site serves media-library images for these pages. The owner's official slogans replace the default taglines in the registry: FigBud Global "One Vision. Endless Solutions.", ZiraHR "HR Simplified. Business Amplified." (only where unchanged in the Studio). |
| 30 Oct 2026 | Expense Now identity (P7-BR7). The owner approved the Expense Now brand sheet; the concept is retired. `scripts/brand/expense_now/build.py` rebuilds it as vectors from measurements of the sheet (15 tapered rays and a dot; primaries snapped to #FF7A00, #FFC107, #4E2D17, #10B981, #0B6EDB) with a Montserrat ExtraBold wordmark: logos for light and dark backgrounds, symbols for each, monochrome logos, favicons (thicker rays for 16–48 px) and app icons on white and brown tiles. The API seeds and publishes them (new databases) or upgrades existing ones once (`brand.expense_now_identity_seeded`; concept archived, Studio uploads kept); the Ziwa and Expense Now upgrades now share one routine. Brand colours, product tokens (contrast-tested) and the mock API follow the palette; icons add 128 and 256 px. Every placement (hero ecosystem, platform tabs, Products page, menus, Africa map, product website, Studio cards and Branding) resolves from the published brand, so no component changed. Expense Now stays Coming soon. Also fixed: enquiry emails in a fixed order in the inbox (a flaky test). |
| 30 Oct 2026 | Spacing and typography refinement (UI-SP1). Cause of the large gaps: stacked section padding (hero bottom 112px plus the next section's 128px), not spacers, fixed heights or hidden elements. New tokens in `packages/brand/src/tokens.css`: `page-top` 28–52px, `section` 56–96px, `section-sm` 40–64px, `stack` 32–56px, `block` 48–72px (Tailwind utilities such as `py-section`, `pt-page-top`, `mt-stack`, `space-y-block`). Type: hero 86px to 76px at most, section titles 56px to 48px, item titles 32px to 28px, new `text-page` (60px) for inner page titles instead of the hero size. Home: header-to-hero about halved, hero to Our Platforms about 47% shorter, Our Philosophy rebalanced (4/7 columns on a shared baseline, rows 48px to 32px, 17px body with 28px lines). Applied to page headers, products, contact, blog, footers, product-site renderer and footer, ZiraHR and the Studio. Standards recorded in docs/UI_STANDARDS.md. |
| 30 Oct 2026 | Per-website permissions (P7-F1). Owners can limit anyone (except owners) to selected websites, with a role on each that can't exceed their Studio role; "All websites" keeps today's behaviour, so existing people are unchanged. The API reads access with every session (changes apply at once) and checks it centrally: websites a person can't access answer 404 (website, pages, media, brand, settings, status requests, Studio image proxies) and lower roles 403; the website list and enquiries inbox show only their websites; Insights need the corporate website; shared content can only be created, edited, published or archived with access to every website, and its usage lists hide other websites. Studio: Settings → Team & access (everyone, their role and websites; Change access), website access when inviting (applied when the invite is accepted), and controls that follow the website role. API: `admin_site_grants`, `admin_users.all_sites`, `admin_invites.site_grants` (migration 18); `/v1/admin/team`, `/v1/admin/team/{id}/access`; `/v1/admin/me` returns `access`; audit `admin.access_changed`. |
| 30 Oct 2026 | Performance budgets (P7-G4). The API measures each draft as a phone downloads it: sections shown (warning 16, limit 30), images (6 / 12), image download at phone size (800 KB / 2 MB, using the 960 px rendition a 2× phone picks), largest image (250 KB / 500 KB), and text and layout (50 KB / 120 KB). Hidden sections don't count, shared content counts as published, an image used twice counts once. The page editor's new Performance panel shows each measure against its limit with advice; over a limit, Submit is disabled and the API refuses submission (409) and approval (re-checked against the version being approved). Also: an image that opens a page loads at once with high priority (better Largest Contentful Paint), and the owner activity feed no longer sends previous and new values (whole page documents); they stay in the audit log. |
| 30 Oct 2026 | Content library (P7-D1). Studio → Content: sections (hero, text, features, steps, figures, questions, call to action) written once and added to pages of any website with the new Shared content section. Pages reference an item and always show its latest published version (with the page's own section style), so one publish updates every website using it; drafts never reach websites, and unpublished or archived items are left out (previews show the gap). Editors edit; reviewers publish numbered versions with a note; any version can be restored into the draft; usage lists every page and website; archive is blocked while in use. API: `shared_blocks` and `shared_block_versions` (migration 17), `/v1/admin/shared/*`, resolution in public pages and previews. Shared items can't hold media images (they belong to one website) or other shared items. |
| 30 Oct 2026 | Search settings per page (P7-G1). The page builder shows a search result preview as the search title and description are typed; a page can share its own image from the media library (its alt text included) and can be hidden from search engines (noindex, left out of the sitemap). When a published page's address changes, its old address forwards to it with a 308: redirects point at the page, so moving it again never chains, an address in use is never a redirect, and editors can stop one from the page. The renderer's proxy keeps the active list (`GET /v1/redirects`) for a minute; resolving them inside the page made Next.js send two `Location` headers, so it moved to the proxy. Also fixed: two API tests could reuse an earlier run's image and fail. |
| 30 Oct 2026 | Social sharing images (P7-BR11). The brand API renders any published brand file as the 1200 × 630 PNG social platforms expect (`?social=1`; SVG, PNG or WebP, filled and centre-cropped). The corporate site shares the image uploaded in Branding when there is one, otherwise its generated card; each product website shares its uploaded image or a card generated from its published brand (symbol, name, tagline and colours). X (Twitter) cards use the same image. Fixed: product pages replaced the website's sharing image with their own Open Graph details, so it never appeared; a page-builder test raced the list refresh after restoring a page. |
| 30 Oct 2026 | Media library (P7-D2). Websites → a website → Media: upload images with a name and required alt text, see where each is used (pages, draft or published), edit names and alt text, archive unused images. The API reuses the brand image pipeline, now with JPEG: files are sniffed and validated, SVGs sanitised, photos turned upright and re-encoded (no camera metadata such as location survives) and capped at 2400 px, with 480–1920 px renditions. New Image block (caption; text or full width); the API adds each image's alt text and sizes to rendered pages, refuses images from other websites or archived ones, and serves a file publicly only while a published page of a listed website uses it (`/v1/media/{id}`, proxied at `/media/{id}` on the renderer with the same locked-down headers as logos). Fixed along the way: the mock API's seeded pages couldn't be opened in the editor (mismatched ids); image crates are optimised in dev and test builds so uploads stay fast. |
| 30 Oct 2026 | Per-site themes (P7-E1). Websites → a website → Navigation & forms → Theme sets the colours of two section bands: brand (white text on it) and soft (dark text in light mode; a deep tint of the brand colour in dark mode). The API refuses colours that would make text hard to read (at least 4.5:1). In the page builder each section has a Section style (Default, Brand band, Soft band), saved with the draft and published through approval; the live preview, the draft preview and the product sites use the website's colours. Ziwa LMS's bands are its brand brown #4E2D17 and ivory #FDF9F4 (migration 14, only where unset). Blocks inside a band keep readable text through re-pointed tokens; checked by an accessibility scan in both themes. |
| 29 Oct 2026 | Navigation, footer & forms per website (P7-E2, continuing P7-ZR1). Studio page Websites → a website → Navigation & forms: the menu (the website's pages, or up to 8 chosen links), a footer note and links, and an enquiry switch with a closed message. Reviewers change them directly; every change is audited (`site.settings_updated`, `site.enquiries_closed`, `site.enquiries_opened`). Closing is enforced by `POST /v1/enquiries` (409 `enquiries_closed`), removes the product site's enquiry button and shows a notice on the corporate contact form (the product can't be chosen); enquiries already received are kept. API: `sites.settings` (migration 13), `GET/POST /v1/admin/sites/{slug}/settings`, settings in `GET /v1/sites`. |
| 29 Oct 2026 | Single theme toggle and cookie consent (P7-TH2, P7-PC1). **Theme:** one button replaces the Light / Dark / System group (moon in light mode, sun in dark); dark is now the default for first-time visitors regardless of the device; the choice is remembered without a flash. **Consent:** banner, preferences dialog and footer "Cookie settings" on the corporate and product sites; only strictly necessary storage until a choice; optional integrations load only for allowed categories and stop on withdrawal; anonymous consent records with automatic deletion; Studio page Settings → Privacy & Cookies (owners only, audited; enabling a new provider asks every visitor again). API: `privacy_settings` and `consent_records` tables, `GET /v1/privacy`, `POST /v1/privacy/consent` (rate-limited, IP never stored), `GET/POST /v1/admin/privacy`. Cookie Policy page lists the real cookies; its legal text waits for counsel. Also removed a stray debug test. |
| 29 Oct 2026 | Final Ziwa LMS identity (P7-ZW2). The owner approved an orange, yellow and brown identity, replacing the blue and green one approved the day before. The new sheet was rebuilt as clean vectors (symbol overlaps the sheet by 99%; the sheet's over-saturated rendering was corrected to the stated palette). Published through the brand system (logos for light and dark backgrounds, symbol, favicon and app icon on ivory tiles, brown-tile variants in the library), with a one-time upgrade (`brand.ziwa_final_identity_seeded`) that archives the superseded seeded files and keeps Studio uploads. Ziwa's accent tokens are now orange (deep-brown text on orange buttons; #A8480C for orange text on light pages); manifest theme colour, mock API and tests updated. Brown and ivory page sections still wait for per-site themes (P7-E1). |
| 29 Oct 2026 | CI repaired. GitHub's API check had failed since 23 Oct: CI used the newest Rust, whose Clippy added lints that pinned local tooling didn't report. Because Clippy failed first, `cargo test` and `cargo audit` hadn't run in CI since then. Rust is now pinned to 1.99 in CI, local tooling and the Railway build, and the lint is fixed. The Lighthouse check's audits always passed, but its summary step read a file LHCI doesn't write for our upload target; it now reads the per-run reports. Website management (P7-ZR1, in progress): ZiraHR's home page imported into the Studio; show/hide sections; pages online/offline and in or out of navigation, independent of publishing; workspace summary on website cards. |
| 28 Oct 2026 | FigBud Global parent palette and themes (P7-TH1, D21): **Palette:** midnight navy, emerald, electric blue and violet, reconciled with the reference site's actual styles (Tailwind slate with green-500 and blue-500). Centralised in `tokens.css` and a `themeBackground` constant, and published to FigBud's brand profile once (only where the old amber defaults were still set). **Themes:** Light / Dark / System switch, defaulting to the device, on the corporate site, product sites and the Studio's account menu. Both modes were designed separately and are contrast-tested (31 token tests). **Fixed:** light-mode success, warning and accent tints fell just under 4.5:1; the Open Graph image left out Ziwa LMS; a copper glow was hard-coded in the hero. Local test servers left from interrupted runs caused false hydration errors, so the build script now refuses to run while one is still up. |
| 28 Oct 2026 | Approved Ziwa LMS identity and branding consistency (P7-ZW2, P7-BR13). The owner-approved Ziwa sheet was rebuilt as clean vectors and published (logos, symbol, favicon, app icon, colours #0B6EDB / #10B981 / #4E2D17 / #C9A87A), with a one-time upgrade that replaced the concept on existing databases. One `ProductLogo` rule now drives every product logo: the "Distinct platforms" tabs show official logos (Jasiri's wordmark instead of a generic icon), also on phones, in a sideways-scrolling row. The API renders square PNG icons (16–512 px); product sites declare SVG and PNG favicons, an Apple touch icon and their own web manifest. Ziwa's accent tokens follow its palette. |
| 28 Oct 2026 | Page templates per category and scheduled publishing (P7-C3 done; P4-L1 lending set done). The template gallery leads with the website's category and fills in suggested titles and addresses; calls to action follow the launch status and use `/enquire`. Changes can be scheduled: approval is still required, the scheduler publishes them on time and audits it, and schedules can be cancelled. Fixed: a contact page built from the template linked its call to action to itself; the contact template promised "We reply within one working day" (unverified, now a placeholder); the new-website form still said the page builder hadn't shipped. Found that the local test database wasn't running, so API database tests had been skipping; they run again and pass. |
| 28 Oct 2026 | Studio polish (P7-UX2, ongoing): new header lockup and account menu; invite form rebuilt (the email field was squeezed to a few characters by the role list); role cards; activity feed shows readable labels and the website for brand and page actions (API audit feed now returns `site_name`). Fixed: the "Expires" note in the invite confirmation failed colour contrast (4.48:1). |
| 27 Oct 2026 | Product-site renderer (P7-E3, in progress): `apps/sites-web` serves listed product websites from the Studio's registry, published pages and brands, under `/{site}` or the website's own domain; header navigation from published pages, status-based calls to action, holding pages, canonical URLs, sitemap and robots; tested in five browsers and in CI. Not deployed: a Railway service needs approval. Fixed: block links lost their #fragment when they also had a ?query. |
| 25 Oct 2026 | Page builder (P7-C1, P7-C2, P7-C3 in progress): pages of typed blocks with server validation, templates, autosaved drafts, maker-checker publishing, version restore, duplicate, archive and ordering; Studio editor with drag-and-drop, block forms, live and full-page previews, undo/redo; shared `PageBlocks` renderer with container-query layouts; published-only public API. Fixed horizontal overflow on phones in the Branding and page editors. |
| 24 Oct 2026 | Africa expansion map (P7-MAP1): Nairobi origin with the FigBud symbol and product logos from the registry and brand profiles; per-product map visibility setting (`sites.show_on_map`, audited); shared tap-to-reveal and call-to-action helpers used by the hero and the map. |
| 24 Oct 2026 | Ziwa LMS (P7-ZW1/ZW2): registered as the fifth website (coming soon) and shown across the corporate site; enquiries, admin filters and email routing accept it; proposed logo concept and teal palette; product registry documented (`docs/PRODUCT_REGISTRY.md`). Count-free headings ("Distinct platforms") so adding products needs no copy change. Smart action buttons (P7-UX1) across the Studio. |
| 24 Oct 2026 | Icons and branded Studio (P7-BR8, P7-BR12): browser tabs, home-screen icons, admin header, sign-in, 404 and Studio website cards now show the official symbols from the published brand profiles; icons were added to the live profiles as version 2 ("Favicon and app icon from the official symbol"). Admin site list and detail return each website's published brand. |
| 23 Oct 2026 | Branded hero (P7-BR10): the homepage ecosystem uses published logos, names, statuses and colours from the Studio; product nodes are keyboard-accessible links with descriptions (hover, focus, first tap on touch). Product links now follow registry status everywhere they are passed it. |
| 23 Oct 2026 | Brand management (P7-BR1–BR6): supplied FigBud, ZiraHR and Jasiri logos preserved and documented (the ZiraHR file is incomplete; see Q18); brand library with validated, sanitised uploads and renditions; brand profiles with draft, approval, history and rollback; Studio Branding page with live preview; websites read published logos; product colours now follow the official logos. Expense Now logo concept proposed for approval. CI builds against the mock API so prerendered pages carry registry data. |
| 23 Oct 2026 | Admin Studio Phase 7 added (from the Enterprise Admin Studio brief). Phase A design (`docs/ADMIN_STUDIO.md`, D16–D20) and Phase B website registry delivered: schema with the four current websites, public and admin APIs, maker-checker lifecycle, Websites admin (list, guided creation, settings, lifecycle, archive), overview tile; the corporate Products page and homepage now follow the registry. |
| 23 Oct 2026 | Product-site template (P4-01) and cross-site links (P4-02): `@figbud/site-kit` shared by all sites; the corporate site now uses it (no behaviour change). ZiraHR website started (`apps/zirahr-web`, P4-Z1): hero, modules, payroll, placeholders with real 404s; e2e in CI. Paint performance: redundant blur filters removed across sites. |
| 22 Oct 2026 | Enquiries inbox (P5-09 complete): filters, search, detail with email delivery states, follow-up statuses with history, owner-only CSV export with formula-injection protection; every action audited. Verified end to end against the production API image. Insights editor live on Railway (43792dc). |
| 22 Oct 2026 | Editorial workflow (P5-07 complete): drafts, review, maker-checker publishing, scheduling, archive/restore, versions with conflict detection, taxonomy, preview; every action audited (P5-10 complete). Insights editor UI (P5-09). Railway: discovered `railway.toml` is no longer applied (and never followed the API root directory); API health check, restart policy and watch path now set on the service. Second deployment live (991f63b). Real end-to-end run found and fixed an editor status race. |
| 22 Oct 2026 | First Railway deployment live and verified (API ready, website serving, CORS/CSP correct, live enquiry stored). Admin authentication (P5-08): passkeys via webauthn-rs, invite-only onboarding with CLI bootstrap, hashed sessions, Origin-checked CSRF, roles, audit log. Admin UI started (P5-09): sign-in, invite acceptance, owner overview. `time` crate updated for RUSTSEC-2026-0009. |
| 22 Oct 2026 | Railway: existing `figbud-web` configured (kept its Railpack commands), `figbud-api` and `Postgres` added, domains generated; first builds queued by a Railway outage. Breadcrumbs with BreadcrumbList (P3-11), Products comparison and future slot (P3-10). CMS schema and public read API in Rust (P5-07 part 1), blog index and article pages on it (P3-05, P3-06) with real 404s, sanitised HTML and BlogPosting data. |
| 22 Oct 2026 | Folder renamed to `FigBud_LP` (P1-01 ✅; workspace links rebuilt). Accessibility and cross-browser testing added (axe on every route; Firefox, WebKit, iPhone, 360 px) and the defects found fixed: Safari failing to load scripts over HTTP (CSP), iPhone overflow in platform tabs, label-in-name, landmark, badge contrast. Content now visible in server HTML before hydration; homepage hydrates in chunks. CI gains Lighthouse budgets, npm/cargo audits, Dependabot and a PR template. Email hold mode (P5-17) so nothing is lost or falsely marked sent before Resend. Railway project ID received; deployment table updated. |
| 22 Oct 2026 | GitHub repository connected and initial push to `main`. CI workflow (first run green), deployment runbook (`docs/DEPLOYMENT.md`) and Railway watch paths added; both Docker images build. `draft_designs/` kept local only (third-party references, public repo). Deployment-readiness tracker and Q17 (Railway project) added. |
| 22 Oct 2026 | Roadmap created. Scope from five briefs consolidated; D1–D13 recorded; Q1–Q16 raised. Phase 1 completed; Phase 2 homepage built and verified; contact and products pages, enquiry API and email outbox delivered. |
