# Architecture

How the FigBud Global ecosystem websites are built, and why. Delivery status lives in [ROADMAP.md](ROADMAP.md).

## System overview

```
                 Browser (any locale, dark/light, LTR/RTL)
                     │                         │
     static HTML/RSC │                         │ POST /v1/enquiries (CORS allow-list)
                     ▼                         ▼
 ┌────────────────────────────┐     ┌──────────────────────────────┐
 │ apps/figbud-web (Next.js)  │     │ services/api (Rust · Axum)    │
 │ figbudglobal.com           │     │ validation · rate limit ·     │
 │ apps/zirahr-web   (Ph. 4)  │     │ idempotency · spam signals    │
 │ apps/jasiri-web   (Ph. 4)  │     │        │ same transaction      │
 │ apps/expense-web  (Ph. 4)  │     │        ▼                       │
 └─────────────┬──────────────┘     │ enquiries ── email_outbox     │
               │ imports            │        │ background worker     │
 ┌─────────────▼──────────────┐     │        ▼                       │
 │ packages/brand  tokens,    │     │ Resend (or log in dev)        │
 │   product registry         │     └───────────────┬──────────────┘
 │ packages/ui     components │                     │ SQLx pool
 │ packages/i18n   locales    │              ┌──────▼──────┐
 └────────────────────────────┘              │ PostgreSQL  │
                                             └─────────────┘
```

Marketing infrastructure is **isolated from operational products**: the API and database hold only website data (enquiries, email, later CMS). No customer or tenant system is reachable from the public sites; every product demonstration renders synthetic data.

## Repository layout

| Path                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `apps/figbud-web`           | Corporate website (Next.js 16, App Router, Cache Components)            |
| `apps/<product>-web`        | Product websites, added in Phase 4 from the same template               |
| `packages/brand`            | Design tokens (`tokens.css`) and the product registry                   |
| `packages/ui`               | Shared React components: logo, buttons, container, badges, theme, motion |
| `packages/i18n`             | Locale registry, path helpers, hreflang, negotiation, dictionary merge   |
| `services/api`              | Rust API: enquiries, email outbox, health; later CMS and admin          |
| `infra`                     | Docker Compose for local PostgreSQL                                     |
| `scripts`                   | Workspace utilities                                                     |
| `docs`                      | Roadmap and architecture                                                |
| `draft_designs`             | Reference images for inspiration only — never imported by code          |

Shared packages ship TypeScript source and are compiled by each app (`transpilePackages`), so there is no package build step and no version drift between sites.

## Frontend

- **Rendering:** every marketing page is prerendered at build time for all locales (`generateStaticParams`). Only the contact form reads request data (`?kind=&product=`) inside a `Suspense` boundary, so the page shell stays static. Partial Prefetching is on.
- **Routing:** sub-path locales (`/en`, `/sw`, `/fr`, `/ar`, `/zh`). `src/proxy.ts` redirects locale-less URLs using the saved choice (`fb-locale` cookie) or `Accept-Language`, but never into an unreviewed locale.
- **Localisation:** English dictionaries are the complete source; other locales overlay partial translations, falling back to English. A locale's `status` (`draft` | `published`) controls `noindex`, sitemap and hreflang. Arabic renders `dir="rtl"` with logical CSS properties throughout, and a dedicated Arabic font loaded only on Arabic pages.
- **Styling:** Tailwind CSS 4 with tokens defined in `@figbud/brand`. Semantic colour variables switch on `html[data-theme]`; product accents switch on `[data-product]`, so one component renders correctly for any product.
- **Theme:** dark by default. A tiny inline script applies a saved light preference before first paint (no flash).
- **Motion:** Motion for React via `LazyMotion` + `domAnimation` (small bundle) and `MotionConfig reducedMotion="user"`. Above-the-fold entrances use CSS so they never wait for JavaScript; the hero headline (LCP element) is never animated. Continuous effects pause off-screen and in background tabs. GSAP is reserved for future cinematic sequences.
- **SEO:** per-page metadata via `pageMetadata()`, canonical URLs, hreflang with `x-default`, Organization JSON-LD, Open Graph image, sitemap and robots that are empty/disallow unless `NEXT_PUBLIC_ALLOW_INDEXING=true`.
- **Security headers:** CSP (first-party only plus the API origin), HSTS, frame denial, nosniff, referrer and permissions policies.

## Enquiry API

| Endpoint             | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `GET /health`        | Liveness (no dependencies)                                              |
| `GET /health/ready`  | Readiness: database reachable; reports email mode                       |
| `POST /v1/enquiries` | Create an enquiry. Requires `Idempotency-Key: <uuid>` header            |

**Request lifecycle** for `POST /v1/enquiries`:

1. Per-IP rate limit (fixed window; `429` + `Retry-After`). `X-Forwarded-For` is trusted only when `TRUST_PROXY=true`.
2. JSON parsed with every field optional, then validated server-side; failures return `422` with per-field codes.
3. Spam signals: honeypot field and minimum form-fill time. Automated submissions get the same success response but are stored with `is_spam = true` and never trigger email.
4. Idempotency: a replay with the same key returns the original reference (`200`) — browser retries can never create duplicate enquiries.
5. One transaction inserts the enquiry and its outbox emails (team notification + visitor acknowledgement). Visitor IPs are stored only as salted SHA-256 hashes.
6. A background worker claims due outbox rows with `FOR UPDATE SKIP LOCKED`, sends them, and retries transient failures with exponential backoff (30 s → 1 h, 6 attempts). The outbox row id is sent to Resend as its idempotency key, so a retry after an ambiguous failure cannot send twice.

**Email modes:** `EMAIL_MODE=log` (development default) renders and logs messages and records them as `skipped`, never `sent`; it is refused in production. `EMAIL_MODE=hold` (default outside development) stores enquiries and their emails without running the delivery worker, so nothing is lost before Resend is configured. `EMAIL_MODE=resend` requires `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_TEAM_RECIPIENTS` (the API refuses to start without them) and marks a message `sent` only when Resend accepts it. Team notifications queued with no recipients are addressed from the routing configured at delivery time.

## Data model

- `enquiries` — reference (`FBG-YYMM-XXXXXX`), idempotency key, kind, product, contact fields, locale, source path, user agent, IP hash, spam flag, workflow status (`new → contacted → qualified → closed`), timestamps.
- `email_outbox` — rendered subject/HTML/text, recipients, status (`pending | sending | retry | sent | failed | skipped`), attempts, next attempt, last error, provider message id.

Migrations live in `services/api/migrations` and run automatically at API start-up.

## Deployment model (prepared, not provisioned)

| Service       | Build                                       | Health check     | Notes                                   |
| ------------- | ------------------------------------------- | ---------------- | --------------------------------------- |
| figbud-web    | `apps/figbud-web/Dockerfile` (repo root context) | `/en`            | `NEXT_PUBLIC_*` are build arguments      |
| figbud-api    | `services/api/Dockerfile`                   | `/health/ready`  | Runs migrations on boot                 |
| PostgreSQL    | Railway managed plugin                      | —                | Automated backups (Phase 6)             |

Each product website becomes its own Railway service with its own domain, so product releases are independent.
