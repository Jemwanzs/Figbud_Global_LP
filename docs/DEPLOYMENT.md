# Deployment Runbook — Railway

Step-by-step procedure for deploying the FigBud Global website and API to Railway. Status of each step is tracked in [ROADMAP.md](ROADMAP.md), Phase 6.

> **Never commit secrets.** Every credential below is entered in Railway's **Variables** tab (or a local, git-ignored `.env`). Only `NEXT_PUBLIC_*` values reach the browser, and none of them is secret.

## Services

Railway project **FigBud_LP** (`5c4df4db-fd17-4371-9424-df0dde7d32e4`), environment `production`. Do not create a second project or duplicate services; inspect the existing project first.

| Service      | Source                    | Build                                                                                      | Health check    | Domain (temporary, not indexed)                  |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `figbud-web` | GitHub `main`, repo root  | Railpack (set in the dashboard): `npm run build --workspace=figbud-web`, start `npm run start --workspace=figbud-web` | `/en` (120 s)   | `https://figbud-web-production.up.railway.app`   |
| `figbud-api` | GitHub `main`, root `services/api` | Dockerfile via `services/api/railway.toml`                                        | `/health/ready` | `https://figbud-api-production.up.railway.app`   |
| `Postgres`   | Railway PostgreSQL        | managed                                                                                    | managed         | none (private network only)                      |

- **figbud-web** builds from the repository root because it imports the shared `packages/*`. It uses the build and start commands configured in the Railway dashboard (kept as found); watch paths are `/apps/figbud-web/**`, `/packages/**`, `/package.json`, `/package-lock.json`. `apps/figbud-web/railway.toml` (Dockerfile build) is an alternative: setting the service's *Config file path* to it would replace the dashboard commands.
- **figbud-api** sets *Root directory* to `services/api`; Railway builds its `Dockerfile` automatically. Health check `/health/ready` (60 s), restart on failure and watch path `/services/api/**` are set on the service itself.
- **Settings live on the services, not in files.** Railway no longer applies `railway.toml` config files (deprecated in favour of `.railway/railway.ts` infrastructure as code), and a config file never followed a service's root directory. The two `railway.toml` files in the repo document the intended settings only; a later migration to infrastructure as code is tracked in the roadmap.
- The browser calls the API on its public domain (`NEXT_PUBLIC_API_URL`); the API reaches PostgreSQL over Railway's private network (`${{Postgres.DATABASE_URL}}`).

## Database migrations

Migrations live in `services/api/migrations` and are embedded in the API binary. They run automatically every time the API starts, before it accepts traffic, inside a PostgreSQL advisory lock — safe with several replicas and safe to re-run. A failed migration stops the API from starting, so Railway keeps the previous healthy deployment serving.

Guidelines:

- Migrations are forward-only and additive. To change a column, add the new one, backfill, deploy, then remove the old one in a later release.
- Never edit a migration that has run in any shared environment; add a new file.
- Take a manual Railway backup before a release that contains a destructive migration.

**Brand seeding.** After migrations, the API gives every website without a brand profile its first profile from the files in `services/api/seed/brand/` (embedded in the binary). The official logos are published and proposed variants go into the draft. Websites that already have a profile are never touched, so changes made in Admin → Branding are never overwritten. A seeding failure is logged and never stops the API. Brand files are stored in PostgreSQL (`brand_assets`) and so are covered by the database backups. See [BRAND_ASSETS.md](BRAND_ASSETS.md).

**Product-site renderer (`apps/sites-web`, not deployed).** The renderer serves every product website from the Studio (decision D16). It isn't on Railway yet: a new service needs your approval, because it costs money. When approved, create one service `figbud-sites`:
- **Source:** GitHub `main`, repo root.
- **Build:** `npm run build --workspace=sites-web`.
- **Start:** `npm run start --workspace=sites-web`.
- **Health check:** any listed website, e.g. `/ziwa`.
- **Watch paths:** `/apps/sites-web/**`, `/packages/**`, `/package.json`, `/package-lock.json`.
- **Variables:** `API_INTERNAL_URL` (the API over Railway's private network), `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` (its Railway URL), `NEXT_PUBLIC_FIGBUD_URL` (the corporate site), and `NEXT_PUBLIC_ALLOW_INDEXING` (only once real domains are live).

Websites are served under `/{site}` on the shared domain. When a website's *Domain* is set in Admin → Websites and the domain is attached to this service, it is served from that domain's root.

**Website builds and registry data.** The websites prerender pages with the published registry and brand data they can reach at build time (`API_INTERNAL_URL`, else `NEXT_PUBLIC_API_URL`), and refresh it every few minutes at run time.

## Variables

### `figbud-api`

| Variable                         | Value                                                              | Secret |
| -------------------------------- | ------------------------------------------------------------------ | ------ |
| `APP_ENV`                        | `production` (or `staging`)                                         | no     |
| `DATABASE_URL`                   | `${{Postgres.DATABASE_URL}}` (reference variable, private network) | **yes** |
| `IP_HASH_SALT`                   | random 32+ characters (`openssl rand -hex 32`)                     | **yes** |
| `TRUST_PROXY`                    | `true`                                                             | no     |
| `CORS_ALLOWED_ORIGINS`           | the web origin (now `https://figbud-web-production.up.railway.app`; later `https://figbudglobal.com` plus product origins) | no     |
| `EMAIL_MODE`                     | `hold` (default outside development) until Resend is verified, then `resend` | no     |
| `RESEND_API_KEY`                 | from Resend → API Keys (sending access only)                       | **yes** |
| `EMAIL_FROM`                     | `FigBud Global <hello@your-verified-domain>`                       | no     |
| `EMAIL_REPLY_TO`                 | optional public reply address                                      | no     |
| `EMAIL_TEAM_RECIPIENTS`          | CTO / team addresses, comma-separated                              | treat as private |
| `EMAIL_RECIPIENTS_ZIRAHR` / `_JASIRI` / `_EXPENSE_NOW` / `_ZIWA` / `_PARTNERSHIPS` | optional extra routing         | treat as private |
| `RUST_LOG`                       | `figbud_api=info,tower_http=info,sqlx=warn`                        | no     |
| `ADMIN_ORIGIN`                   | the web origin serving `/admin` (now `https://figbud-web-production.up.railway.app`; later `https://figbudglobal.com`). Unset = admin disabled | no |
| `ADMIN_SESSION_HOURS`            | optional, default `12`                                             | no     |

`PORT` is injected by Railway; the API binds to it.

### `figbud-web`

`NEXT_PUBLIC_*` values are compiled into the site, so they are read at **build** time (the Dockerfile declares them as build arguments; Railway passes service variables to the build automatically). Changing one requires a redeploy.

| Variable                       | Value                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`         | now `https://figbud-web-production.up.railway.app`; later `https://figbudglobal.com` |
| `NEXT_PUBLIC_API_URL`          | now `https://figbud-api-production.up.railway.app`; later `https://api.figbudglobal.com` |
| `NEXT_PUBLIC_ALLOW_INDEXING`   | `false` until the production domain is attached; then `true` in production only |
| `NEXT_PUBLIC_ZIRAHR_URL` etc.  | set when each product website goes live (Phase 4)                     |
| `API_INTERNAL_URL` (optional, server-only) | private-network API origin for server-side blog fetches, e.g. `http://figbud-api.railway.internal:8080`; falls back to `NEXT_PUBLIC_API_URL` |

## First deployment checklist

1. Confirm the Railway project ID and inspect existing services and environments; reuse what exists.
2. Add the PostgreSQL service (if not present) and enable automated backups.
3. Create `figbud-api` from GitHub, root `services/api`; add variables with `EMAIL_MODE=hold`.
4. Deploy; confirm `GET /health/ready` returns `{"status":"ready","database":"ok"}` and the logs show "database migrations applied".
5. Generate a domain for the API (or attach `api.<domain>`).
6. Create `figbud-web` from GitHub with config file path `apps/figbud-web/railway.toml`; set `NEXT_PUBLIC_API_URL` to the API domain.
7. Add the web origin to the API's `CORS_ALLOWED_ORIGINS`; redeploy the API.
8. Submit a test enquiry on `/en/contact`; confirm the reference, and that its emails are stored in `email_outbox` as `pending` (held, not sent).
9. Resend go-live (below): switching to `EMAIL_MODE=resend` delivers every held message, then repeat step 8.
10. Attach custom domains, confirm SSL, then set `NEXT_PUBLIC_ALLOW_INDEXING=true` on production only and redeploy the web service.

## Email delivery modes

| `EMAIL_MODE` | Where                         | Behaviour                                                                                         |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `log`        | development (default there)   | Renders and logs each email; recorded as `skipped`. Refused when `APP_ENV=production`.             |
| `hold`       | staging/production (default)  | Enquiries and their emails are stored; nothing is sent and the worker does not run.               |
| `resend`     | production after go-live      | Delivers through Resend. A message is `sent` only after Resend accepts it and returns a message id. |

`GET /health/ready` reports the active mode (`email_mode`). Forms work identically in every mode: the visitor always receives a reference, and the website never claims an email was delivered.

## Resend go-live

1. In Resend, add and verify the sending domain (SPF, DKIM and the recommended DMARC record at the DNS provider).
2. Create an API key with **sending access** restricted to that domain.
3. Set `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEAM_RECIPIENTS` (and any routing variables) on `figbud-api`, then `EMAIL_MODE=resend`.
4. The API refuses to start in `resend` mode if any of those three are missing, so a misconfiguration fails the deploy instead of silently dropping enquiries.
5. On start-up the worker delivers everything held so far. Team notifications queued before recipients existed are addressed to the routing configured **at delivery time**. Visitor acknowledgements for old enquiries are also sent, so if the hold lasted weeks, consider marking stale acknowledgements `skipped` first:
   `UPDATE email_outbox SET status = 'skipped' WHERE template = 'visitor_acknowledgement' AND status = 'pending' AND created_at < now() - interval '7 days';`
6. Submit one enquiry of each type and confirm delivery in the Resend dashboard.

What each enquiry sends:

| Form type (`kind`)  | Team notification                         | Visitor acknowledgement            |
| ------------------- | ----------------------------------------- | ---------------------------------- |
| `demo_request`      | team + product routing                    | "Your {product} demo request"      |
| `contact`, `sales`  | team + product routing                    | "We've received your enquiry"      |
| `early_access`      | team + product routing                    | "Your {product} early-access request" (sign-up requests) |
| `waitlist`          | team + product routing                    | "You're on the {product} waitlist" |
| `partnership`       | team + partnership routing                | "Your partnership enquiry"         |

Undelivered emails retry automatically (30 s doubling to 1 h, six attempts) and never send twice. Submissions flagged as automated are stored but never emailed.

## Admin access (passkeys)

Admins sign in with passkeys; there are no passwords. The first owner is invited from the command line, once:

```bash
railway ssh --service figbud-api -- figbud-api admin invite --email you@example.com --role owner
```

The command prints a single-use link (valid 7 days) to `ADMIN_ORIGIN/admin/invite`. Opening it registers a passkey on that device and signs in. Owners invite everyone else from the admin UI; a new invite for an existing admin adds a passkey (new device or recovery).

Passkeys are bound to `ADMIN_ORIGIN`: when the production domain replaces the Railway domain, admins register a passkey on the new origin through a fresh invite.

## Backups

Railway volume backups protect the `Postgres` service (enabled 22 Oct 2026):

| Schedule  | Frequency       | Kept for  |
| --------- | --------------- | --------- |
| Daily     | every 24 hours  | 6 days    |
| Weekly    | every 7 days    | 1 month   |
| Monthly   | every 30 days   | 3 months  |

A manual baseline backup was taken on 22 Oct 2026 and has no expiry. Commands:

```bash
railway postgres pitr schedule list --service Postgres     # schedules
railway postgres pitr backup list --service Postgres       # backups
railway postgres pitr backup create --service Postgres     # on-demand (before risky releases)
railway postgres pitr backup restore <backup-id> --service Postgres
```

**Restoring replaces the service's data in place.** Take an on-demand backup first, announce a short maintenance window, and verify `/health/ready` afterwards. The restore drill (P6-12) should run in a staging environment, never against production data. For restoring to an exact moment, Railway's point-in-time recovery (`railway postgres pitr enable`) adds continuous WAL archiving to a storage bucket at extra cost.

## Monitoring

- **Uptime:** `.github/workflows/uptime.yml` checks production every 15 minutes: API readiness (database reachable), the main pages and admin sign-in, and that the temporary domain stays `noindex`. A failure fails the run and GitHub emails the repository owner. Run it on demand from the Actions tab.
- **Logs:** the API logs structured JSON in production (`railway logs --service figbud-api`); every request has an `x-request-id`.
- **Health checks:** Railway restarts a service whose health check fails (`/health/ready` for the API, `/en` for the website).
- **Not yet:** error tracking and real-user Core Web Vitals need a provider choice (Q14).

## Rollback

- **Code:** redeploy the previous successful deployment from the service's *Deployments* tab.
- **Database:** restore from a Railway backup. Because migrations are additive, rolling back code does not normally require a database restore.
