# Deploying RebelShops to Vercel + Neon

Production runbook for **rebelshops.com**.

This supersedes the Heroku setup entirely. There is no `Procfile`, no dyno, and
no Heroku Scheduler; the equivalents are the Vercel build command and Vercel
Cron. `docs/heroku-scheduler-setup.md` has been deleted.

---

## 1. Architecture at a glance

| Concern            | Where it lives                                                |
| ------------------ | ------------------------------------------------------------- |
| Hosting            | Vercel, Next.js 15 App Router, Node.js runtime                 |
| Region             | `iad1` (US East, Washington D.C.) — pinned in `vercel.json`    |
| Database           | Neon serverless Postgres, region `aws-us-east-1`               |
| DB driver          | `@neondatabase/serverless` in production, `pg` locally         |
| Migrations         | `node database/migrate.js`, run from the Vercel build command  |
| Scheduled jobs     | Vercel Cron → `/api/cron/sync`, `/api/cron/inventory-snapshot` |
| Readiness probe    | `GET /api/health`                                              |

### Why `iad1`

Every page in this app is database-bound: the storefront, admin dashboard and
analytics routes all issue several queries per request. Function-to-database
latency dominates response time, so the function region and the Neon region must
be the same physical area. `iad1` is Vercel's default US East region and pairs
with Neon's `aws-us-east-1`, giving sub-millisecond round trips instead of the
60–80 ms a cross-country pairing would cost.

**If you create the Neon project in a different region, change `regions` in
`vercel.json` to match.** A mismatch here is the single most expensive
configuration mistake available.

---

## 2. Neon setup

### 2.1 Create the project

1. <https://console.neon.tech> → **New Project**
2. Name `rebelshops`, Postgres 16, region **AWS US East (N. Virginia)**
3. Database name `rebelshops`

### 2.2 Pooled vs direct connection strings — this matters

Neon gives you two hostnames for the same database:

```
pooled  postgresql://USER:PASS@ep-cool-name-123456-pooler.us-east-1.aws.neon.tech/rebelshops?sslmode=require
direct  postgresql://USER:PASS@ep-cool-name-123456.us-east-1.aws.neon.tech/rebelshops?sslmode=require
                                                   ^^^^^^^ note: no "-pooler"
```

| Use                       | Endpoint | Why                                                                                                              |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| App runtime (`DATABASE_URL`) | **pooled** | Serverless functions churn connections. PgBouncer absorbs that; the direct endpoint hits Neon's connection cap. |
| Migrations (`MIGRATION_DATABASE_URL`) | **direct** | The runner takes a session advisory lock so two deploys cannot race. PgBouncer's transaction pooling silently breaks session-scoped locks. |

`database/migrate.js` **refuses to run** against a `-pooler` host and tells you
why. Do not work around it with `ALLOW_POOLED_MIGRATIONS=true` unless you have
read the reasoning above and accept the race.

### 2.3 Apply the schema for the first time

From your machine, against the new empty Neon database:

```bash
export MIGRATION_DATABASE_URL='postgresql://USER:PASS@ep-xxxx.us-east-1.aws.neon.tech/rebelshops?sslmode=require'

node database/migrate.js --status     # everything PENDING
node database/migrate.js              # apply
node database/migrate.js --status     # everything applied, 0 pending
```

### 2.4 Migrating data off Heroku (one time)

```bash
# Dump from Heroku
pg_dump --no-owner --no-privileges --format=custom \
  "$(heroku config:get DATABASE_URL -a rebel-shops)" -f rebelshops.dump

# Restore into Neon's DIRECT endpoint
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$MIGRATION_DATABASE_URL" rebelshops.dump

# Reconcile migration history. The restored database carries the OLD
# version-keyed schema_migrations table; the runner baselines it automatically
# on the first run and only executes what is genuinely missing.
node database/migrate.js --dry-run
node database/migrate.js
```

---

## 3. Vercel project setup

### 3.1 Create and link

```bash
npm i -g vercel
vercel login
vercel link          # choose the rebelshops project, or create it
```

Or via the dashboard: **Add New → Project → import the Git repository**.
Framework preset is detected as Next.js; `vercel.json` pins it anyway.

### 3.2 Settings that must be set in the dashboard

| Setting                | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| Node.js Version        | **22.x**                                               |
| Build Command          | from `vercel.json` (`node database/migrate.js && npm run build`) |
| Install Command        | from `vercel.json` (`npm ci`)                          |
| Production Branch      | `main`                                                  |

> **Node 22 is not optional.** The Neon driver needs a global `WebSocket` for
> transactional connections. Node 22 provides one; Node 20 does not, and `ws` is
> not a declared dependency of this project. Single-statement queries would still
> work over HTTP on Node 20, but `db.transaction(...)` would fail at runtime.

### 3.3 What the build does

`vercel.json` sets:

```json
"buildCommand": "node database/migrate.js && npm run build"
```

Migrations run **before** the Next.js build, on every deployment, in Vercel's
build container. This replaces Heroku's `release:` phase.

Properties this relies on:

- **Idempotent.** Applied migrations are tracked by filename; a repeat run is a
  no-op that prints `Up to date`.
- **Concurrency safe.** A Postgres session advisory lock serialises concurrent
  builds. A second build waits (default 120 s, `MIGRATION_LOCK_TIMEOUT_MS`)
  rather than double-applying.
- **Fail fast.** A failed migration fails the build, so a broken schema never
  reaches production.

**Consequence worth knowing:** an instant rollback in Vercel restores the
previous *build output* but does **not** roll back the database. Write
migrations so the previous release can still run against the new schema
(add columns, don't rename or drop in the same deploy as the code change).

---

## 4. Environment variables

Set these under **Project → Settings → Environment Variables**. `.env.example`
is the authoritative, commented list; this table is the deployment view.

### Production

| Variable                             | Value                                            | Notes |
| ------------------------------------ | ------------------------------------------------ | ----- |
| `DATABASE_URL`                       | Neon **pooled** URL                              | required |
| `MIGRATION_DATABASE_URL`             | Neon **direct** URL                              | required at build time |
| `NEXT_PUBLIC_APP_URL`                | `https://rebelshops.com`                         | required |
| `NEXT_PUBLIC_BASE_URL`               | `https://rebelshops.com`                         | required |
| `JWT_SECRET`                         | `openssl rand -base64 48`                        | required |
| `CRON_SECRET`                        | `openssl rand -hex 32`                           | required |
| `SYNC_AUTH_TOKEN`                    | long-lived admin session JWT — see §6.2          | required for sync |
| `STRIPE_SECRET_KEY`                  | live key                                          | |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live key                                          | |
| `STRIPE_WEBHOOK_SECRET`              | from the live webhook endpoint                    | |
| `OPENAI_API_KEY`                     |                                                   | AI routes |
| `SHIPSTATION_API_KEY`                |                                                   | optional fallback |

### Preview

Same set, pointing at test/sandbox credentials and a Neon **branch** (§7):

- `DATABASE_URL` → the preview branch's pooled URL
- `MIGRATION_DATABASE_URL` → the preview branch's direct URL
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL` → leave **unset** so the cron
  helpers fall back to `VERCEL_URL` and each preview talks to itself
- Stripe → test keys
- `CRON_SECRET` → a *different* secret from production

### Development (`vercel env pull`)

```bash
vercel env pull .env.local
```

### Provided by Vercel — never set these

`VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_REGION`,
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_DEPLOYMENT_ID`.
`/api/health` and the cron routes read them for diagnostics.

---

## 5. Domain: rebelshops.com

### 5.1 Attach the domain

**Project → Settings → Domains → Add**, then add both:

- `rebelshops.com` — set as the **primary** domain
- `www.rebelshops.com` — Vercel will offer to redirect it to the apex; accept

### 5.2 DNS records

At the registrar / DNS provider for `rebelshops.com`:

| Type    | Name  | Value                   | Notes |
| ------- | ----- | ----------------------- | ----- |
| `A`     | `@`   | `76.76.21.21`           | Vercel apex |
| `CNAME` | `www` | `cname.vercel-dns.com`  | |

If the provider supports `ALIAS`/`ANAME` at the apex, prefer:

| Type    | Name | Value                  |
| ------- | ---- | ---------------------- |
| `ALIAS` | `@`  | `cname.vercel-dns.com` |

Confirm the values Vercel shows in the Domains tab — they are authoritative and
occasionally change. TLS certificates are issued automatically once DNS
resolves; allow up to an hour.

### 5.3 Canonicalisation

`next.config.ts` redirects any production request whose `Host` is not
`rebelshops.com` to `https://rebelshops.com`, with three carve-outs:

- It is a **no-op unless `VERCEL_ENV === 'production'`**, so preview deployments
  keep their own hostnames.
- `/api`, `/_next` and `/_vercel` are excluded, so server-to-server calls and
  asset fetches are never bounced.
- The target host is overridable with `NEXT_PUBLIC_CANONICAL_HOST`.

The redirect is a permanent (308) one. Browsers cache that aggressively — verify
the domain is correct before the first production deploy.

---

## 6. Scheduled jobs (Vercel Cron)

### 6.1 Schedules

Declared in `vercel.json`:

| Path                            | Schedule (UTC) | Replaces                      |
| ------------------------------- | -------------- | ----------------------------- |
| `/api/cron/sync`                | `0 * * * *` (hourly) | Heroku Scheduler → `npm run sync:background` |
| `/api/cron/inventory-snapshot`  | `10 7 * * *` (daily 07:10 UTC ≈ 03:10 ET) | Heroku Scheduler → `npm run snapshot:inventory` |

> **Plan limits.** Hobby allows 2 cron jobs at daily granularity only. The
> hourly sync requires **Pro**. On Hobby, change the sync schedule to something
> like `0 7 * * *`.

Cron jobs only run on the **production** deployment. They are not triggered on
previews.

### 6.2 Authentication

Vercel sends `Authorization: Bearer ${CRON_SECRET}` with every scheduled
invocation. The routes verify it with a constant-time comparison and:

- return **401** for a missing or wrong bearer,
- return **503** if neither `CRON_SECRET` nor `SYNC_AUTH_TOKEN` is configured —
  they never default open.

`SYNC_AUTH_TOKEN` is a separate concern: the sync job calls back into
`/api/admin/sync/*`, and those routes authenticate with `requireAuth`, meaning
`SYNC_AUTH_TOKEN` must be a **valid signed session JWT for a store admin**, not
an arbitrary random string. Mint one with `createSession()` from
`src/lib/auth/session.ts` using the same `JWT_SECRET` as the environment, and
note that it expires after 7 days unless reissued.

### 6.3 Triggering by hand

```bash
# Against production
CRON_SECRET=... NEXT_PUBLIC_BASE_URL=https://rebelshops.com npm run sync:background
CRON_SECRET=... NEXT_PUBLIC_BASE_URL=https://rebelshops.com npm run snapshot:inventory

# Backfill one date
npm run snapshot:inventory -- 2026-08-01

# Or straight over HTTP
curl -sS -X POST https://rebelshops.com/api/cron/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Both scripts are thin HTTP triggers. The job logic lives in
`src/app/api/cron/_lib/` and has exactly one implementation, shared by the cron
route and the CLI.

### 6.4 Monitoring

- Vercel dashboard → **Cron Jobs** tab: last run, status, duration
- `sync_logs` table: one row per run
- `GET /api/admin/sync/status`

---

## 7. Preview deployments and preview databases

Every pull request gets a Vercel preview. Point previews at a **Neon branch**
rather than production data.

### Option A — Neon's native Vercel integration (recommended)

Neon Console → **Integrations → Vercel**. It creates a Neon branch per preview
deployment and injects `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and
`POSTGRES_URL_NON_POOLING` into the Preview environment automatically. The
migration runner picks up `DATABASE_URL_UNPOOLED` with no extra configuration,
so each preview branch is migrated by its own build.

### Option B — one shared staging branch

```bash
neonctl branches create --name staging --parent main
```

Set the Preview `DATABASE_URL` / `MIGRATION_DATABASE_URL` to that branch's
pooled and direct URLs.

Notes:

- Neon branches are copy-on-write: a branch of a 10 GB database is instant and
  near-free until it diverges.
- Delete stale branches; they count toward the project's storage.
- **Deployment Protection** (Settings → Deployment Protection) puts SSO in front
  of preview URLs. That also blocks the sync job's internal HTTP callbacks on
  previews. If you need previews to sync, use
  `VERCEL_AUTOMATION_BYPASS_SECRET`, or simply accept that syncing is a
  production-only activity.

---

## 8. Running migrations

| Situation                        | Command                                        |
| -------------------------------- | ---------------------------------------------- |
| Normal deploy                    | automatic, in the build command                 |
| Check state                      | `node database/migrate.js --status`             |
| See what would run               | `node database/migrate.js --dry-run`            |
| Apply by hand                    | `node database/migrate.js`                      |
| Load dev seed data               | `node database/migrate.js --seed`               |
| Re-run one file                  | `node database/migrate.js --force 017_x.sql`    |
| Adopt an existing schema         | `node database/migrate.js --baseline`           |
| Wipe and rebuild (local only)    | `node database/migrate.js --reset --seed`       |

### How tracking works

Applied migrations are recorded in **`public.schema_migration_files`**, keyed on
the **full filename**, with a SHA-256 checksum of the file.

This fixes two real defects in the previous runner:

1. **Version collisions.** `012_shipstation_warehouses.sql` and
   `012_suppliers_table.sql` both claim version `012`. The old runner keyed on
   the numeric prefix, so once one recorded `012` the other was skipped forever
   — on a fresh database, `suppliers` simply never got created.
2. **Self-recording SQL.** The old runner never wrote a tracking row; each
   migration file was expected to `INSERT INTO schema_migrations` itself.
   Files 010, 015 and 017 don't, so they re-ran on every deploy — and 017 is not
   idempotent, so `migrate.js` failed outright on any database where it had
   already run. The runner now writes the tracking row itself, in the same
   transaction as the migration.

The legacy `schema_migrations` table is left in place (migration files still
write to it) but is no longer the source of truth.

### First run against a pre-existing database

On its first run against a database the old runner already migrated, the new
runner **baselines** it: files whose version appears in the legacy
`schema_migrations` table are marked applied without being re-executed, and
everything else runs normally. During that first pass only, a migration that
fails with a duplicate-object error (`42P07`, `42701`, `42710`, …) is treated as
already applied and adopted with a warning, since the objects it creates
demonstrably exist. Subsequent runs have no such tolerance.

Verify afterwards with `--status`: `adopted` means "assumed applied",
`applied` means "this runner executed it".

### Writing new migrations

- Append only. Never edit a file that has been applied — the runner warns on
  checksum drift.
- Use the next free numeric prefix.
- Each file runs inside one transaction; do not add `BEGIN`/`COMMIT`.
- Prefer `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.
- Make them backward compatible with the previous release (see §3.3).

---

## 9. Health checks

```bash
curl -s https://rebelshops.com/api/health | jq
```

```json
{
  "status": "ok",
  "uptimeSeconds": 143,
  "build":    { "shortCommit": "a1b2c3d", "branch": "main", "deploymentId": "dpl_..." },
  "runtime":  { "environment": "production", "region": "iad1", "node": "v22.x" },
  "database": { "status": "ok", "latencyMs": 12, "driver": "neon", "host": "ep-...-pooler...", "ssl": true },
  "migrations": { "status": "ok", "applied": 19, "latest": "018_billing_and_payments.sql" }
}
```

| `status`   | HTTP  | Meaning                                                            |
| ---------- | ----- | ------------------------------------------------------------------ |
| `ok`       | 200   | Database reachable, migrations tracked                              |
| `degraded` | 200   | Serving traffic, but DB latency > 1500 ms or migration state unknown |
| `error`    | 503   | Database unreachable — page someone                                 |

The probe never returns a connection string, credentials or an environment dump.

Point uptime monitoring at this URL and alert on non-200 plus on
`.status == "degraded"` persisting.

---

## 10. Deploying

```bash
# Preview
git push origin feature/my-change      # Vercel builds a preview automatically

# Production
git push origin main
# or
vercel --prod
```

Post-deploy check:

```bash
curl -s https://rebelshops.com/api/health | jq '.status, .build.shortCommit, .migrations.applied'
curl -s -o /dev/null -w '%{http_code}\n' https://rebelshops.com/
```

---

## 11. Rollback

### Application code

**Dashboard → Deployments → pick the last good one → Promote to Production.**
This is near-instant; it re-points the alias at an existing build. No rebuild,
so **no migrations run** and none are reverted.

```bash
vercel rollback https://rebelshops-<hash>.vercel.app
```

### Database

There is no automatic down-migration. Two options:

1. **Roll forward** — write a new migration that corrects the problem. Preferred.
2. **Neon point-in-time restore** — Neon retains history (7 days by default):

   ```bash
   neonctl branches create --name rollback-$(date +%s) \
     --parent main --timestamp 2026-08-12T05:00:00Z
   ```

   Inspect the branch, then either promote it or copy data back. **This loses
   every write since that timestamp** — treat it as a last resort and take the
   application offline first.

### If a migration fails mid-deploy

The build fails and the previous deployment keeps serving; each migration is
transactional, so a failed file leaves no partial state. Fix the SQL, push
again. If the advisory lock is stuck from a killed build, it clears when that
session ends — Neon reaps idle sessions automatically.

---

## 12. Troubleshooting

**Build fails: `Refusing to migrate through the pooled endpoint`**
`MIGRATION_DATABASE_URL` is pointing at a `-pooler` host. Use the direct one.

**Build fails: `No database connection string configured for migrations`**
`MIGRATION_DATABASE_URL` is not set for the environment being built. Environment
variables are per-environment; setting it on Production does not set it on
Preview.

**Runtime: `Database is not configured: no connection string found`**
`DATABASE_URL` is missing at runtime. Note that build-time and runtime variable
sets are the same on Vercel, but a variable added after the last deploy needs a
redeploy to take effect.

**Cron returns 401** — `CRON_SECRET` in the deployment differs from the one you
sent. Cron jobs read the value baked into the deployment; redeploy after
changing it.

**Cron returns 503** — neither `CRON_SECRET` nor `SYNC_AUTH_TOKEN` is set.

**Sync completes with 0 operations** — no store has an active ShipStation
integration row, or `SYNC_AUTH_TOKEN` is not a valid admin session JWT.

**`db.transaction(...)` throws about WebSocket** — the function is running on
Node 20. Set the project's Node.js version to 22.x and redeploy.

**Stripe Elements or Mantine styling breaks after enabling `CSP_ENFORCE`** —
unset it. The policy ships as `Content-Security-Policy-Report-Only`; collect
violations from the browser console, widen the policy in `next.config.ts`, then
enforce.
