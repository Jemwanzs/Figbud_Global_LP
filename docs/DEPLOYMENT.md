# Deployment Runbook — Railway

Step-by-step procedure for deploying the FigBud Global website and API to Railway. Status of each step is tracked in [ROADMAP.md](ROADMAP.md), Phase 6.

> **Never commit secrets.** Every credential below is entered in Railway's **Variables** tab (or a local, git-ignored `.env`). Only `NEXT_PUBLIC_*` values reach the browser, and none of them is secret.

## Services

One Railway project, one environment per stage (`staging`, `production`), three services. Do not create a second project or duplicate services; inspect the existing project first.

| Service       | Source                              | Railway config file              | Root / build context | Health check     | Public domain (proposed)        |
| ------------- | ----------------------------------- | -------------------------------- | -------------------- | ---------------- | ------------------------------- |
| `figbud-web`  | GitHub `main`                       | `apps/figbud-web/railway.toml`   | repository root      | `/en`            | `figbudglobal.com`              |
| `figbud-api`  | GitHub `main`                       | `services/api/railway.toml`      | `services/api`       | `/health/ready`  | `api.figbudglobal.com`          |
| `Postgres`    | Railway PostgreSQL template          | —                                | —                    | managed          | none (private network only)     |

- **figbud-web** must build from the repository root because it imports the shared `packages/*`. In the service settings set *Config file path* to `apps/figbud-web/railway.toml` and leave *Root directory* empty.
- **figbud-api** sets *Root directory* to `services/api`; its `railway.toml` is picked up automatically.
- Watch paths in each `railway.toml` keep a frontend change from redeploying the API and vice versa.

## Database migrations

Migrations live in `services/api/migrations` and are embedded in the API binary. They run automatically every time the API starts, before it accepts traffic, inside a PostgreSQL advisory lock — safe with several replicas and safe to re-run. A failed migration stops the API from starting, so Railway keeps the previous healthy deployment serving.

Guidelines:

- Migrations are forward-only and additive. To change a column, add the new one, backfill, deploy, then remove the old one in a later release.
- Never edit a migration that has run in any shared environment; add a new file.
- Take a manual Railway backup before a release that contains a destructive migration.

## Variables

### `figbud-api`

| Variable                         | Value                                                              | Secret |
| -------------------------------- | ------------------------------------------------------------------ | ------ |
| `APP_ENV`                        | `production` (or `staging`)                                         | no     |
| `DATABASE_URL`                   | `${{Postgres.DATABASE_URL}}` (reference variable, private network) | **yes** |
| `IP_HASH_SALT`                   | random 32+ characters (`openssl rand -hex 32`)                     | **yes** |
| `TRUST_PROXY`                    | `true`                                                             | no     |
| `CORS_ALLOWED_ORIGINS`           | `https://figbudglobal.com` plus product origins when live          | no     |
| `EMAIL_MODE`                     | `log` until Resend is verified, then `resend`                      | no     |
| `RESEND_API_KEY`                 | from Resend → API Keys (sending access only)                       | **yes** |
| `EMAIL_FROM`                     | `FigBud Global <hello@your-verified-domain>`                       | no     |
| `EMAIL_REPLY_TO`                 | optional public reply address                                      | no     |
| `EMAIL_TEAM_RECIPIENTS`          | CTO / team addresses, comma-separated                              | treat as private |
| `EMAIL_RECIPIENTS_ZIRAHR` / `_JASIRI` / `_EXPENSE_NOW` / `_PARTNERSHIPS` | optional extra routing         | treat as private |
| `RUST_LOG`                       | `figbud_api=info,tower_http=info,sqlx=warn`                        | no     |

`PORT` is injected by Railway; the API binds to it.

### `figbud-web`

`NEXT_PUBLIC_*` values are compiled into the site, so they are read at **build** time (the Dockerfile declares them as build arguments; Railway passes service variables to the build automatically). Changing one requires a redeploy.

| Variable                       | Value                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`         | `https://figbudglobal.com`                                             |
| `NEXT_PUBLIC_API_URL`          | `https://api.figbudglobal.com` (or the API's Railway domain)           |
| `NEXT_PUBLIC_ALLOW_INDEXING`   | `true` in production only; leave unset in staging                      |
| `NEXT_PUBLIC_ZIRAHR_URL` etc.  | set when each product website goes live (Phase 4)                     |

## First deployment checklist

1. Confirm the Railway project ID and inspect existing services and environments; reuse what exists.
2. Add the PostgreSQL service (if not present) and enable automated backups.
3. Create `figbud-api` from GitHub, root `services/api`; add variables with `EMAIL_MODE=log`.
4. Deploy; confirm `GET /health/ready` returns `{"status":"ready","database":"ok"}` and the logs show "database migrations applied".
5. Generate a domain for the API (or attach `api.<domain>`).
6. Create `figbud-web` from GitHub with config file path `apps/figbud-web/railway.toml`; set `NEXT_PUBLIC_API_URL` to the API domain.
7. Add the web origin to the API's `CORS_ALLOWED_ORIGINS`; redeploy the API.
8. Submit a test enquiry on `/en/contact`; confirm the reference and the simulated emails in the API logs.
9. Resend go-live (below), then switch `EMAIL_MODE=resend` and repeat step 8.
10. Attach custom domains, confirm SSL, then set `NEXT_PUBLIC_ALLOW_INDEXING=true` on production only and redeploy the web service.

## Resend go-live

1. In Resend, add and verify the sending domain (SPF, DKIM and the recommended DMARC record at the DNS provider).
2. Create an API key with **sending access** restricted to that domain.
3. Set `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEAM_RECIPIENTS` (and any routing variables) on `figbud-api`, then `EMAIL_MODE=resend`.
4. The API refuses to start in `resend` mode if any of those three are missing, so a misconfiguration fails the deploy instead of silently dropping enquiries.
5. Submit one enquiry of each type and confirm delivery in the Resend dashboard.

What each enquiry sends:

| Form type (`kind`)  | Team notification                         | Visitor acknowledgement            |
| ------------------- | ----------------------------------------- | ---------------------------------- |
| `demo_request`      | team + product routing                    | "Your {product} demo request"      |
| `contact`, `sales`  | team + product routing                    | "We've received your enquiry"      |
| `early_access`      | team + product routing                    | "Your {product} early-access request" |
| `waitlist`          | team + product routing                    | "You're on the {product} waitlist" |
| `partnership`       | team + partnership routing                | "Your partnership enquiry"         |

Undelivered emails retry automatically (30 s doubling to 1 h, six attempts) and never send twice. Submissions flagged as automated are stored but never emailed.

## Rollback

- **Code:** redeploy the previous successful deployment from the service's *Deployments* tab.
- **Database:** restore from a Railway backup. Because migrations are additive, rolling back code does not normally require a database restore.
