# Running the whole stack inside a Claude session

Everything in this repo — Next.js, Postgres, migrations, demo data, the full
Playwright suite — runs inside one Claude Code on the web container with no
Docker and no hosted database. This document is the runbook, and the reasoning
behind it, so a session does not have to rediscover it.

## TL;DR

```bash
npm run setup:local     # Postgres + schema + demo data + .env.local  (idempotent)
npm run dev             # http://localhost:3000
npm run test:e2e -- --project=chromium
```

`scripts/setup-local-stack.sh` runs automatically at session start via
`.claude/hooks/session-start.sh`, so in a fresh session those first two lines
are usually already done.

Sign in as `demo@schmostore.com` / `rebeldev` — every seeded user shares that
password.

## Why there is no Docker here

The container image already carries the `postgresql-16` **server** package with
a cluster created and stopped at `/var/lib/postgresql/16/main`. Starting it is
one command and about two seconds:

```bash
pg_ctlcluster 16 main start     # or: pg_isready -h 127.0.0.1 to check
```

That is the whole trick. A compose file, a Postgres image pull, or a hosted
Neon branch would each be slower and none of them buy anything the local
cluster does not already provide. Docker is also not available in the sandbox.

Measured on a warm container:

| Step | Time |
|---|---|
| `pg_ctlcluster 16 main start` | ~2s |
| 24 migrations + demo seed (`dev-local --setup`) | ~1.5s |
| `next dev` ready | <1s (first page compile ~7s) |
| Full Chromium e2e suite, 134 tests | ~6min |
| `npm ci` on a cold container | 1–2min, and only once per container |

## What the setup script does

`scripts/setup-local-stack.sh`, in order, skipping whatever is already true:

1. `npm ci` when `node_modules` is absent.
2. Starts the Postgres cluster, creating one with `pg_createcluster` if the
   image has none.
3. Gives the `postgres` role a password and creates the `rebelshops` database —
   the app connects over TCP, which needs a password; `su postgres` does not.
4. Hands off to `node scripts/dev-local.js --setup`, which writes any missing
   `.env.local` values, applies migrations and seeds demo data.
5. Appends `DATABASE_URL` and the `PG*` variables to `$CLAUDE_ENV_FILE`, so
   `node database/migrate.js` and `psql` work in later shells without a prefix.
   Next.js reads `.env.local` on its own; plain node scripts do not.

Re-running it is a no-op that costs a few seconds. It is safe on every session
start, which is exactly what the hook does.

## Running the e2e suite

`playwright.config.js` now starts the dev server itself
(`webServer.reuseExistingServer`), so a suite run no longer fails with
`ERR_CONNECTION_REFUSED` when nobody remembered to run `npm run dev` first. An
already-running dev server is reused, cache and all.

```bash
npm run test:e2e -- --project=chromium              # note the `--`
npm run test:e2e -- --project=chromium tests/e2e/storefront.spec.js
npm run test:e2e -- --project=chromium -g "hero CTA"
```

The `--` matters: `npm run test:e2e --project=chromium` silently swallows the
flag and runs all three browsers, of which only Chromium is installed here.

Firefox and WebKit are **not** available in the sandbox — the image ships one
Chromium at `/opt/pw-browsers/chromium` and `playwright install` is forbidden.
The config already points at that binary when it exists.

Two suite-level facts worth knowing:

- Tests run against `next dev`. The dev error overlay renders server error
  messages a second time, which turns an unscoped `getByText` into a
  strict-mode violation — scope such assertions to the element under test.
- Turbopack compiles routes on demand, so the first assertion after the first
  visit to a route can need far more than the 5s default `expect` timeout while
  several workers warm different routes at once. Both `marketing.spec.js` and
  `storefront.spec.js` carry a 60s `COLD_COMPILE` budget for exactly those
  assertions; reach for it rather than assuming a flake.
- The demo catalogue deliberately contains a sold-out product, and all products
  are seeded in one statement, so they share a `created_at` and Postgres orders
  the ties differently per seed. A spec that takes the first product card must
  filter out the sold-out one or it fails on some seeds and not others.
- The database is shared with the dev server. Specs that write (products,
  coupons, orders) leave rows behind; `npm run setup:local -- --fresh`
  re-seeds from scratch when that starts to matter.

## Where ShipStation credentials go

### The API key the app syncs with

The app never reads a merchant's key from the environment. Every sync, order
push and webhook path calls `getIntegration(storeId)`, which reads an encrypted
key out of `store_integrations`. So a key in `.env.local` connects nothing by
itself — a row has to exist.

1. Put the key where it is gitignored (`.env*` is ignored, `.env.example` is
   the one exception):

   ```bash
   echo 'SHIPSTATION_API_KEY=<the V2 key>' >> .env.local
   ```

   For a value that should survive container rebuilds, set it as an
   environment variable on the Claude Code environment instead
   (<https://code.claude.com/docs/en/claude-code-on-the-web>) — it is then
   injected into every session and never touches the repository.

2. Attach it to a seeded store:

   ```bash
   npm run shipstation:connect                          # first seeded store
   npm run shipstation:connect -- --store artisan-craft
   npm run shipstation:connect -- --no-verify           # if egress is blocked
   ```

   The key is verified against `GET /v2/warehouses` before anything is written,
   encrypted with AES-256-GCM under `SHIPSTATION_ENCRYPTION_KEY`, and never
   printed in full. This is the headless equivalent of onboarding step 3.

3. `SHIPSTATION_ENCRYPTION_KEY` must be set or every credential read and write
   throws `ShipStationKeyError` — the design fails closed on purpose.
   `dev-local.js` writes a random local one into `.env.local` automatically.

`SHIPSTATION_API_KEY` in the environment is still read by two things, and only
two: `scripts/shipstation-probe.mjs`, and the fallback in
`/api/products/[productId]`.

### Credentials for signing in to ShipStation itself

Same place — `.env.local` (gitignored) for a session, or the environment's
variables for something durable. Name them for what they are, e.g.
`SHIPSTATION_UI_EMAIL` / `SHIPSTATION_UI_PASSWORD`. Nothing in the app reads
them; they exist only for a browser-driving session.

Prefer the environment-variable route over pasting a password into the chat: a
value typed into the conversation is in the transcript, while an environment
variable is only ever in the container.

### Egress has to allow ShipStation first

**In this environment it currently does not.** The proxy answers `403` to
`CONNECT api.shipstation.com:443`, and the same for `ship.shipstation.com` and
`www.shipstation.com`, so no credential of any kind will reach ShipStation
until the environment's network policy allows those hosts. Check it with:

```bash
curl -sv https://api.shipstation.com/v2/warehouses --max-time 20 2>&1 | grep 'HTTP/1.1'
curl -sS "$HTTPS_PROXY/__agentproxy/status"        # recentRelayFailures lists denials
```

The policy is chosen when the environment is created; see
<https://code.claude.com/docs/en/claude-code-on-the-web>. Until it is widened,
use `--no-verify` to store a key, and expect live syncs to fail at the network
layer rather than at authentication.

### The other direction: ShipStation signing in to us

`store_integrations` also carries `shipstation_username` and
`custom_store_password_encrypted` — the Basic auth pair ShipStation's Custom
Store integration presents when it calls **into** this app. We generate those;
they are not a ShipStation credential and have nothing to do with the API key
above. `src/lib/shipstation/CLAUDE.md` is the reference for that channel.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | cluster stopped (a fresh container starts it down) | `npm run setup:local` |
| `No database connection string configured` | plain `node` scripts do not read `.env.local` | `export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rebelshops` |
| `ShipStationKeyError` | `SHIPSTATION_ENCRYPTION_KEY` missing | `npm run dev-local -- --setup` writes one |
| Every e2e test fails at `goto` | no dev server, on an older config | now handled by `webServer`; otherwise `npm run dev` |
| `browserType.launch: Executable doesn't exist` | Firefox/WebKit project | `--project=chromium` |
| Login fails in a spec | demo data not seeded | `npm run setup:local -- --fresh` |
