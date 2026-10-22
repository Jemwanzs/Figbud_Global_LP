# FigBud Global — Websites & Product Ecosystem

Monorepo for the FigBud Global corporate website and its product websites — **ZiraHR** (HR & payroll), **Jasiri LMS** (loan management) and **Expense Now** (expenses & payments, coming soon).

- **Plan and progress:** [docs/ROADMAP.md](docs/ROADMAP.md) — the single authoritative roadmap
- **How it works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **How to deploy:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Repository:** https://github.com/Jemwanzs/Figbud_Global_LP

| Layer     | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Frontend  | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Motion · Lucide · Outfit |
| Backend   | Rust · Axum · Tokio · SQLx                                                 |
| Data      | PostgreSQL                                                                 |
| Email     | Resend (simulated locally)                                                 |
| Hosting   | Railway (prepared, not yet provisioned)                                    |
| Testing   | Vitest · Playwright · Rust unit and integration tests                     |

## Prerequisites

- Node.js 22+ and npm
- Rust 1.88+ (`rustup`) and OpenSSL development files (`libssl-dev` on Debian/Ubuntu)
- Docker Desktop (for local PostgreSQL)

On Windows without OpenSSL, run any API command in the bundled Rust container instead,
for example `npm run api:docker -- cargo test` (database tests included).

## Run it locally

```bash
npm install                         # install all workspaces
npm run db:up                       # start PostgreSQL on localhost:5433

cp services/api/.env.example services/api/.env
cp apps/figbud-web/.env.example apps/figbud-web/.env.local

npm run api:dev                     # API on http://localhost:8080 (applies migrations)
npm run dev                         # website on http://localhost:3000
```

The website also runs without the API — only the contact form needs it. Emails are **logged, not sent** (`EMAIL_MODE=log`), so you can submit the form and read the simulated messages in the API's output.

## Scripts

| Command               | What it does                                                              |
| --------------------- | ------------------------------------------------------------------------- |
| `npm run dev`         | Website dev server                                                        |
| `npm run build`       | Production build of the website                                           |
| `npm run start`       | Serve the production build                                                |
| `npm run lint`        | ESLint                                                                    |
| `npm run typecheck`   | TypeScript (all workspaces)                                               |
| `npm test`            | Unit tests (Vitest)                                                       |
| `npm run test:e2e`    | Playwright, desktop + mobile (run `npm run build` first)                  |
| `npm run format`      | Prettier (with Tailwind class ordering)                                   |
| `npm run api:dev`     | Run the Rust API                                                          |
| `npm run api:test`    | Rust tests (set `TEST_DATABASE_URL` to include database tests, below)     |
| `npm run api:lint`    | rustfmt check + clippy (warnings are errors)                              |
| `npm run db:up` / `db:down` | Start / stop local PostgreSQL                                       |
| `npm run verify`      | Everything above that CI will enforce                                     |
| `npm run roadmap:page` | Render `docs/ROADMAP.md` to a shareable page (`.artifacts/roadmap.html`) |
| `npm run api:docker -- <cmd>` | Run an API command (e.g. `cargo test`) in the Rust dev container   |

Database-backed API tests use the separate `figbud_test` database created by Docker Compose:

```bash
TEST_DATABASE_URL=postgres://figbud:figbud_local_dev@localhost:5433/figbud_test npm run api:test
```

## Configuration

All deployment-specific values are environment variables; nothing production-specific is committed.

- Website: [apps/figbud-web/.env.example](apps/figbud-web/.env.example) — site/API origins, indexing switch, product-site origins
- API: [services/api/.env.example](services/api/.env.example) — database, CORS, rate limits, Resend, recipient routing

Pending inputs (Resend credentials, verified sender domain, CTO/team recipients, production domains) are listed in the roadmap's **Open questions**.

## Deployment (Phase 6)

Nothing is deployed yet. The full procedure — services, variables, migrations, Resend go-live and rollback — is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

1. CI runs on every push to `main` (`.github/workflows/ci.yml`).
2. Create a Railway project with a PostgreSQL plugin and two services:
   - **figbud-api** — root directory `services/api`, uses `services/api/railway.toml`. Set `APP_ENV=production`, `DATABASE_URL` (from the plugin), `IP_HASH_SALT`, `TRUST_PROXY=true`, `CORS_ALLOWED_ORIGINS`, and the Resend variables.
   - **figbud-web** — repository root, uses `apps/figbud-web/railway.toml`. Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_ALLOW_INDEXING=true` **only** in production.
3. Attach custom domains and confirm SSL; point `CORS_ALLOWED_ORIGINS` at them.
4. Verify `/health/ready`, submit a test enquiry, and confirm delivery in Resend.

## Content rules

- `draft_designs/` holds reference images for inspiration only. Nothing from it is used in the product.
- Public demonstrations use synthetic data only.
- No unverified figures, customer names, or regulatory/licensing claims.
- Non-English locales stay `noindex` until reviewed by a native speaker.
