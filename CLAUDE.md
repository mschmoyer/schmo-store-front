# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project overview

**RebelShops** (`rebel-shops`, production domain **rebelshops.com**) is a multi-tenant e-commerce
platform: merchants create a storefront, connect their own ShipStation account for catalogue and
fulfilment, and take payments through Stripe Connect. Next.js 16 App Router, TypeScript, PostgreSQL,
Mantine v8, TailwindCSS v4. Deployed on Vercel.

**Multi-tenant is the load-bearing fact.** Almost every table has a `store_id` and almost every
query needs it in the `WHERE` clause. Merchant credentials live in the database per store, never in
environment variables. A missing `store_id` predicate is a cross-tenant data leak, not a style nit.

## Where things are

| Path | What |
|---|---|
| `src/app/` | App Router pages and `src/app/api/**/route.ts` handlers |
| `src/components/` | React components, grouped by area with `index.ts` exports |
| `src/lib/` | Domain logic: `shipstation/`, `stripe/`, `billing/`, `catalog/`, `services/`, `auth/`, `database/` |
| `database/migrations/` | Numbered SQL migrations, applied by `database/migrate.js` |
| `scripts/` | `dev-local.js`, `seed-demo.js`, `shipstation-probe.mjs`, background sync |
| `tests/e2e/` | Playwright specs; unit tests live in `__tests__/` beside their source |
| `docs/` | Reference documentation (see index below) |

## Integration documentation

Two integrations carry most of the platform's risk and have their own instruction files. **Read the
relevant one before touching that surface** — both encode defects that already reached production.

- **`src/lib/shipstation/CLAUDE.md`** — ShipStation V2 API, credentials and encryption, webhooks,
  paged sync, order push, the full endpoint map, known gaps.
  Applies to `src/lib/shipstation/**`, `src/app/api/shipstation/**`, `src/app/api/admin/sync/**`,
  `src/app/api/cron/sync`, `src/app/api/jobs/process`, `src/app/api/onboarding/shipstation`.
- **`src/lib/stripe/CLAUDE.md`** — the two money flows, Connect, webhooks and idempotency, the
  intro offer, the full SDK and route map, known gaps.
  Applies to `src/lib/stripe/**`, `src/lib/billing/**`, `src/app/api/checkout/**`,
  `src/app/api/billing/**`, `src/app/api/connect/**`, `src/app/api/webhooks/stripe`.

Other reference docs:

| Doc | Covers |
|---|---|
| `docs/decision-log.md` | Development history, decisions, and the live TODO list. Update it as you work. |
| `docs/payments.md` | Narrative companion to the Stripe instructions: offer design, cent arithmetic, Stripe CLI walkthrough |
| `docs/deployment-vercel.md` | Vercel runbook |
| `docs/design-system.md` | UI primitives and tokens |
| `docs/storefront-theme-spec.md` | Theme engine and presets |
| `docs/brand.md`, `docs/marketing-copy.md` | Voice and approved copy |
| `docs/demo-data.md` | What `seed-demo.js` creates |
| `docs/audits/` | Point-in-time critiques; the ShipStation audit is referenced by ID throughout that library |
| `docs/shipstation-api-openapi.yaml` | The upstream V2 contract |

## Commands

```bash
npm run dev-local          # probe Postgres, write .env.local, migrate, seed, start. Idempotent.
npm run dev-local -- --fresh   # also re-seed demo data
npm run dev                # dev server (Turbopack)
npm run dev:log            # dev server, tee'd to dev.log
npm run build              # production build
npm run lint               # ESLint
npx tsc --noEmit           # typecheck — `next build` does NOT enforce types (see below)

npm run test               # Jest unit tests
npm run test:watch
npm run test:ci            # with coverage, as CI runs it
npm run test:e2e           # Playwright; starts (or reuses) a dev server on :3000 itself
npm run test:e2e -- --project=chromium   # note the `--`

npm run db:migrate         # apply migrations
npm run db:status          # what is pending
npm run db:seed-demo       # demo stores and users (idempotent)
npm run db:verify          # run the trigger-backed schema invariants as behaviour

npm run shipstation:probe  # SHIPSTATION_API_KEY=<key> — live endpoint + response-shape check
npm run sync:background    # ShipStation sync CLI entry point
npm run snapshot:inventory # inventory snapshot CLI entry point
```

**`next.config.ts` sets `typescript.ignoreBuildErrors`**, so `npm run build` will happily ship type
errors. `npx tsc --noEmit` is the only thing that enforces them, and CI runs it as a separate job.
Do not treat a green build as a green typecheck.

Sign-in for seeded data: `demo@schmostore.com` / `rebeldev`. Every seeded user shares that password.

Playwright starts the dev server itself (`webServer` in `playwright.config.js`) and reuses one that
is already running, so `npm run test:e2e` no longer depends on remembering to start it. The
database does have to exist first.

## Running the site in a Claude session

The whole stack — Postgres included — runs inside the session container. No Docker, no hosted
database.

```bash
npm run setup:local     # Postgres + migrations + demo data + .env.local (idempotent, ~5s warm)
npm run dev             # http://localhost:3000
npm run test:e2e -- --project=chromium
```

`.claude/hooks/session-start.sh` runs `setup:local` at session start, so this is usually already
done. Only Chromium exists in a session container — Firefox and WebKit projects cannot run.

If Postgres is not listening, the cluster is simply stopped: `pg_ctlcluster 16 main start`, or just
re-run `npm run setup:local`. Node scripts outside Next.js (`database/migrate.js`, `psql`) do not
read `.env.local`; export `DATABASE_URL` for those.

Where ShipStation credentials go, the egress policy that currently blocks reaching ShipStation from
a session, and the troubleshooting table are in `/docs/claude-session-setup.md`. Read it before
wiring up ShipStation work.

## Environment

The app reads **`.env.local`**, not `.env`. `.env.example` documents every variable with a
`[required]` / `[optional]` tag — keep it in sync when you add one.

`DATABASE_URL` is the only variable with no working fallback. Everything else degrades: each
integration that is unconfigured must render a labelled "not configured" state rather than crash,
and CI's build job runs with no Stripe or ShipStation keys precisely to keep that true.

Two variables fail closed rather than degrading:

- **`SHIPSTATION_ENCRYPTION_KEY`**. Without it every ShipStation credential read throws. If an
  environment's ShipStation integration is silently doing nothing, check this first.
- **`JWT_SECRET`**. Missing, shorter than 32 characters, or set to a placeholder that appears in
  this repository, and `src/lib/auth/jwt-secret.ts` throws. It used to fall back to a literal that
  is published here, which let anyone forge a session for any store. Degrading is not an option for
  the thing that tells users apart.

  The check is **lazy on purpose** — validated on first use, never at module load. A module-scope
  throw fires wherever the module is merely imported, including client bundles that have no
  environment, and that took the customizer's preview pane down once already.

## Working rules

- **Store scope.** Every query touching tenant data carries `store_id`. No exceptions.
- **Starter copy.** Presets, default sections and page templates may not state anything a customer
  could hold a merchant to — delivery times, returns windows, warranties, discount rates, payment
  terms. Those are visible bracketed prompts. Brand voice is fine. Enforced by
  `storefront-theme/__tests__/no-promises-on-their-behalf.test.ts`.
- **Money.** Integer cents everywhere in application code; convert at the boundary with
  `src/lib/billing/money.ts`. Never float arithmetic on money. (ShipStation V2 is the exception —
  its money fields are decimal dollars, and that conversion belongs in the ShipStation library.)
- **Secrets.** Never log an API key, webhook secret, or a fragment of one — not a prefix, not the
  last four characters. Mask for display.
- **Server truth.** Prices, totals and entitlements are computed server-side from the database. A
  value a client sent is input to validate, never a fact.
- **Honest results.** Never return `success: true` for work that wrote nothing, and never claim a
  connection test passed without a live call. Both have shipped here before.
- **Graceful degradation.** A route whose integration is unconfigured returns a labelled state; it
  does not throw at import time or 500.
- **TypeScript.** Strict. No `any`.
- **Components.** Small and single-responsibility. Props as interfaces, destructured with defaults.
  Extract reusable logic into hooks. `React.memo` / `useMemo` / `useCallback` for genuinely
  expensive work, not reflexively.
- **Styling.** Tailwind classes or a dedicated `.module.css`. Not inline style objects.
- **Icons.** `@tabler/icons-react`. Use `IconBuildingStore`, not `IconStore`.
- **Documentation.** JSDoc on every exported function and component, with `@param` and `@returns`.
  This codebase's file-header comments explain *why* a design is the way it is; match that.
- **Accessibility.** Semantic HTML and ARIA labels.
- **Mocks.** Avoid unless asked. Prefer real data. Where a network boundary is injectable
  (`fetchImpl`, `sleepImpl`, …), inject it and test the real logic rather than mocking the module.

## Development server monitoring

`npm run dev:log` tees output to `dev.log`. Read it after a task to confirm the server is running
clean; `tail -f dev.log` for live monitoring.

## Deployment

Vercel, region `iad1`. Migrations run from the build command in `vercel.json`
(`node database/migrate.js && npm run build`), so a broken migration is a failed deploy rather than
a broken production. Cron schedules are declared in `vercel.json` under `crons`; per-route
`maxDuration` and memory live in the same file. `docs/deployment-vercel.md` is the full runbook.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a migrations job that proves
re-running is a no-op and the seed is idempotent, a production build with no integration keys, and
an **end-to-end job** (Chromium; `storefront.spec.js` and `customizer.spec.js`).

The e2e job exists because a real regression walked through every other job untouched: making
`JWT_SECRET` fail closed as a module-level `const` broke the customizer's preview pane, because a
client component transitively imports that module and a browser bundle has no environment. Lint,
typecheck, 922 unit tests and the build were all green; six Playwright tests were red. **A green
unit suite does not mean the app renders.**

## Completing a task

- `npm run lint`
- `npx tsc --noEmit`
- `npm run test`
- `npm run test:e2e -- --project=chromium` for specs related to what you changed
- Check `dev.log` for errors
- Update `docs/decision-log.md`: add TODO items, tick off what you finished
- Update `README.md` if anything user-facing changed
- Update `.env.example` if you added or changed a variable
- Bump `version` in `package.json` (semver) when the change affects application behaviour — patch
  for a fix, minor for a feature. Never major unless asked.
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
