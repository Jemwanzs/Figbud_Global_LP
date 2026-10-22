# FigBud Global — Master Development Roadmap

> **The single authoritative plan** for the FigBud Global corporate website and its product websites (ZiraHR, Jasiri LMS, Expense Now and future products).
> It consolidates every scope and standards brief supplied to date, records how overlaps and conflicts were resolved, and tracks delivery task by task.
>
> **Owner:** James Sammy (FigBud Global) · **Repository:** [github.com/Jemwanzs/Figbud_Global_LP](https://github.com/Jemwanzs/Figbud_Global_LP) · **Maintained in:** `docs/ROADMAP.md` (updated as work lands) · **Last updated:** 22 October 2026

**Status legend:** ✅ Completed · 🔄 In progress · ⛔ Blocked (waiting on an input listed in §5) · ⬜ Not started

---

## 1. Executive summary

| Phase | Name                                 | Status         | Progress                                | Waiting on                                   |
| ----- | ------------------------------------ | -------------- | --------------------------------------- | -------------------------------------------- |
| 1     | Project foundation                   | ✅ Completed   | 25 / 25 tasks                           | —                                            |
| 2     | FigBud Global homepage               | 🔄 In progress | 17 / 22 tasks                           | Verified company facts, Lighthouse run       |
| 3     | Corporate pages                      | 🔄 In progress | 3 / 14 tasks                            | Company profile, legal texts                 |
| 4     | Product websites                     | ⬜ Not started | 0 / 20 tasks                            | Product capability sign-off, payroll rules   |
| 5     | Integrations & administration        | 🔄 In progress | 6 / 16 tasks                            | Resend credentials, recipient addresses      |
| 6     | Production deployment                | 🔄 In progress | 7 / 18 tasks                            | Railway project ID, Resend, domains          |

**Where we are:** the monorepo, shared design system, multilingual architecture, Rust enquiry API with PostgreSQL and a retrying email outbox, and the first complete FigBud Global homepage are built and verified locally. Everything runs without any external service. The next steps that need decisions from FigBud are listed in **§5 Open questions**.

**Verified on 22 Oct 2026:** Rust tests 26/26 pass (including real-PostgreSQL integration tests) · clippy and rustfmt clean · TypeScript strict typecheck clean · ESLint clean · Prettier clean · frontend unit tests 15/15 · Playwright end-to-end 19/19 on desktop and mobile · production build succeeds with every page statically prerendered · live form → API → database → simulated email confirmed in a real browser.

### Deployment readiness

| Item                               | Status                                  | Notes                                                                                   |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| GitHub repository                  | ✅ Available                             | `Jemwanzs/Figbud_Global_LP` (public)                                                     |
| GitHub connection & initial push   | ✅ Completed                             | Remote verified empty before pushing; `main` holds the full project                     |
| Continuous integration             | ✅ Completed                             | First run green: website and API (with PostgreSQL) jobs pass on every push to `main`     |
| Railway project ID                 | ⛔ Awaiting details                      | Inspect the existing project before configuring; never create a duplicate (Q17)          |
| Frontend deployment (`figbud-web`) | ⬜ Pending                               | Dockerfile, `railway.toml`, health check and variables ready — see `docs/DEPLOYMENT.md`  |
| Rust backend deployment (`figbud-api`) | ⬜ Pending                           | Dockerfile, `railway.toml`, `/health/ready`, migrations on boot                          |
| PostgreSQL provisioning            | ⬜ Pending                               | Railway PostgreSQL service + automated backups                                           |
| Resend credentials                 | ⛔ Awaiting configuration                | Integration built and tested in log mode; needs key, verified domain, recipients (Q4)    |
| Production domains                 | ⬜ Pending                               | Domain choice outstanding (Q1)                                                           |

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
| FigBud Global  | Black, espresso, cream, warm copper              | `#15120F #39261D #A66538 #F0A65D #F6E9D8 #FFFFFF` |
| ZiraHR         | Warm orange, ivory, brown, charcoal              | `#FF8A3D → #C4541B`          |
| Jasiri LMS     | Deep navy, emerald, teal, graphite               | `#20C997 → #0E7C86`          |
| Expense Now    | Midnight blue, mint, silver, soft white          | `#9FB3FF → #6EE7C5`          |

- **Typography:** Google **Outfit** (display and interface), system monospace for technical figures; IBM Plex Sans Arabic loads only on Arabic pages (Outfit has no Arabic glyphs).
- **Themes:** dark by default, refined light mode, remembered per visitor without a flash.
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

---

## 5. Open questions and inputs needed

Items marked **Blocking** stop the listed tasks; everything else proceeds with the stated default.

| #   | Question / input                                                                                     | Needed for              | Blocking? | Current default                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------- | --------- | ------------------------------------------------------------ |
| Q1  | Production domain: `figbudglobal.com` (proposed) or the existing `figbudglobal.online`?              | P6, SEO, email sender   | Yes (P6)  | All origins are environment variables                        |
| Q2  | Verified company profile: history, founding year, team, offices, registered entity, contact details | About page, footer, schema | Yes (P3) | No company facts published beyond the confirmed positioning |
| Q3  | Verified figures (customers, users, markets) and any customer logos with permission                  | Homepage proof section  | No        | No statistics or logos shown                                 |
| Q4  | Resend API key, verified sending domain, CTO/team recipient addresses, per-product routing           | P5 email go-live        | Yes (P5)  | `EMAIL_MODE=log` simulates delivery                           |
| Q5  | Legal texts: privacy (Kenya Data Protection Act 2019), terms, cookies — reviewed by counsel          | Legal pages, consent    | Yes (P3)  | Pages exist, `noindex`, state "being finalised"               |
| Q6  | Native-speaker reviewers for Swahili, French, Arabic, Chinese                                        | Locale publication      | No        | Draft translations, not indexed                              |
| Q7  | Product accent colours and logos (ZiraHR current logo is cyan in screenshots; spec says warm orange) | P4 brand fidelity       | No        | Accents per §3.6; generic product glyphs                     |
| Q8  | Keep Outfit-only, or add Inter for dense product UI?                                                 | P4 product sites        | No        | Outfit-only                                                  |
| Q9  | Real product screenshots (sanitised) for ZiraHR and Jasiri                                           | P4 mockups              | No        | Original synthetic mockups                                   |
| Q10 | Kenya statutory rules and test cases for the payroll calculator (PAYE bands, reliefs, SHIF, NSSF tiers, Housing Levy, effective dates) and who signs them off | P4 calculator | Yes (P4-Z) | Calculator not built until rules are validated |
| Q11 | Which Jasiri capabilities are live vs planned (asset financing, CRB, scoring, integrations)          | P4 Jasiri copy          | Yes (P4-J) | Asset financing marked planned                               |
| Q12 | Expense Now: which capabilities exist today; licensing and payment-partner status                    | P4 Expense copy         | Yes (P4-E) | Everything shown as planned                                  |
| Q13 | Pricing: publish prices or "Contact sales"?                                                          | ZiraHR Pricing page     | No        | Contact sales                                                |
| Q14 | Analytics tool (privacy-friendly, cookie-less preferred?) and consent requirements                   | P5 analytics            | No        | No analytics or tracking cookies                             |
| Q15 | Spam protection: add Cloudflare Turnstile (privacy-friendly CAPTCHA) on public forms?                | P5 hardening            | No        | Honeypot + fill-time check + rate limiting                   |
| Q16 | Consulting / custom-solutions services alongside products (mentioned as possible)                    | IA, About, Products     | No        | Products only                                                |
| Q17 | Railway project ID, and whether staging and production environments already exist                    | P6 deployment           | Yes (P6)  | Deployment configuration prepared in the repo               |

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
| P2-18  | Lighthouse and Core Web Vitals audit on production build; fix findings                          | ⬜ |
| P2-19  | Automated accessibility scan (axe) in Playwright; manual screen-reader pass                     | ⬜ |
| P2-20  | Cross-browser check (Safari/iOS, Firefox, Samsung Internet)                                     | ⬜ |
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
| P3-04  | About Us: story, mission, approach, team, African market vision                        | ⛔ Q2 |
| P3-05  | Blog index: categories, tags, search, pagination                                       | ⬜ (needs P5-07) |
| P3-06  | Article template: author, reading time, related posts, Article schema, breadcrumbs     | ⬜ |
| P3-07  | Privacy Policy                                                                          | ⛔ Q5 |
| P3-08  | Terms of Use                                                                            | ⛔ Q5 |
| P3-09  | Cookie Policy and cookie-preference controls (only if non-essential cookies are added) | ⛔ Q5, Q14 |
| P3-10  | Products page: product comparison and "future products" slot                          | ⬜ |
| P3-11  | Breadcrumbs (BreadcrumbList schema) on inner pages                                     | ⬜ |
| P3-12  | Site search (pages + articles)                                                         | ⬜ |
| P3-13  | Swahili translation review → publish `sw` locale                                       | ⛔ Q6 |
| P3-14  | French, Arabic, Chinese review → publish                                               | ⛔ Q6 |

### Phase 4 — Product websites ⬜

**Goal:** independently deployable product sites (`apps/zirahr-web`, `apps/jasiri-web`, `apps/expense-web`) sharing packages. **Depends on:** Phase 2 design system; Q7–Q13.
**Acceptance criteria:** each site meets Phase 2 quality bar, has its own nav/SEO/sitemap, Back to FigBud link, and only verified capability claims.

| ID      | Task                                                                                         | Status |
| ------- | -------------------------------------------------------------------------------------------- | ------ |
| P4-01   | App template for product sites (shared layout, product theme, product nav config)             | ⬜ |
| P4-02   | Cross-site links: env-driven origins, new-tab behaviour, Back to FigBud                        | ⬜ |
| **ZiraHR** |  |  |
| P4-Z1   | Homepage — The Connected Workforce                                                             | ⬜ |
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
| **All products** |  |  |
| P4-10   | Per-site metadata, sitemaps, SoftwareApplication schema                                         | ⬜ |
| P4-11   | Product-intent SEO content (HR/payroll; loan management; expense management)                    | ⬜ |
| P4-12   | Product accents and logos confirmed                                                             | ⛔ Q7 |
| P4-13   | Real sanitised screenshots where available                                                      | ⛔ Q9 |
| P4-14   | Per-site e2e + Lighthouse budgets in CI                                                         | ⬜ |

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
| P5-07  | CMS data model and API (articles, categories, tags, authors, scheduling, approvals, versions) | ⬜ |
| P5-08  | Admin authentication (SSO or passkeys), roles, session security, CSRF                        | ⬜ |
| P5-09  | Admin UI: enquiries inbox, statuses, export; CMS editor                                      | ⬜ |
| P5-10  | Audit log for all admin and CMS actions                                                      | ⬜ |
| P5-11  | Go live on Resend (verified domain, real recipients)                                         | ⛔ Q4 |
| P5-12  | Localised acknowledgement emails                                                             | ⬜ |
| P5-13  | Shared rate-limit store when API runs >1 replica                                             | ⬜ |
| P5-14  | Turnstile on public forms                                                                    | ⬜ Q15 |
| P5-15  | Privacy-friendly analytics and conversion tracking                                           | ⬜ Q14 |
| P5-16  | Data-retention policy and purge job for enquiries                                            | ⬜ Q5 |

### Phase 6 — Production deployment ⛔

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
| P6-05b | Branch protection on `main` (require CI), PR template                                      | ⬜ |
| P6-06  | CI: format, lint, typecheck, unit, Rust (with PostgreSQL), build, e2e                       | ✅ |
| P6-06b | Lighthouse performance budgets in CI                                                        | ⬜ |
| P6-07  | Dependency and vulnerability scanning (Dependabot / cargo-audit / npm audit)                | ⬜ |
| P6-08  | Railway: inspect existing project, then configure web, API, PostgreSQL (staging + production) | ⛔ Q17 |
| P6-09  | Domains, DNS, SSL for corporate and product subdomains                                      | ⛔ Q1 |
| P6-10  | CDN caching for static assets and prerendered pages                                         | ⬜ |
| P6-11  | Secrets in Railway variables (Resend, IP salt, DB)                                          | ⛔ Q4 |
| P6-12  | Automated database backups and a tested restore                                             | ⬜ |
| P6-13  | Monitoring: uptime, error tracking, structured logs, RUM Core Web Vitals                    | ⬜ |
| P6-14  | Rollback procedure tested; permanent redirects from any legacy URLs (e.g. `figbudglobal.online`) | ⬜ Q1 |
| P6-15  | Launch checklist and sign-off                                                               | ⬜ |

---

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
| M8 — Integrations live             | Phase 5                                      | Real email, admin, CMS                                | ⬜ |
| M8b — Repository live              | P1-25, P6-05, P6-06                          | Code on GitHub `main`, CI green                       | ✅ 22 Oct 2026 |
| M9 — Production launch             | Phase 6                                      | Launch checklist signed                               | ⬜ |

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
| Dev-tooling audit findings (ESLint's `braces` dependency, 5 high)    | Low    | Build-time only, not shipped; resolve when `eslint-config-next` updates (P6-07) |

---

## 9. Change log

| Date        | Change                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| 22 Oct 2026 | GitHub repository connected and initial push to `main`. CI workflow (first run green), deployment runbook (`docs/DEPLOYMENT.md`) and Railway watch paths added; both Docker images build. `draft_designs/` kept local only (third-party references, public repo). Deployment-readiness tracker and Q17 (Railway project) added. |
| 22 Oct 2026 | Roadmap created. Scope from five briefs consolidated; D1–D13 recorded; Q1–Q16 raised. Phase 1 completed; Phase 2 homepage built and verified; contact and products pages, enquiry API and email outbox delivered. |
