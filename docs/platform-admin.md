# The platform admin console

The operator's view of the whole tenancy, at **`/platform`**. It is a different thing from
`/admin`, and the distinction is the whole design:

| | `/admin` | `/platform` |
|---|---|---|
| Audience | A merchant | Whoever runs RebelShops |
| Scope | One `store_id` | Every store |
| Question | *How is my store doing?* | *How is the platform doing?* |
| Gate | A valid session with a `storeId` | `users.is_admin`, re-read from the database on every request |

Everything else in this codebase carries `store_id` in the `WHERE` clause, and that is exactly
right. The console is the one deliberate exception, which is why the guard in front of it gets more
attention than the screens behind it.

## Granting access

`users.is_admin` is set by one script and nothing else. No route sets it, onboarding does not set
it, the seed does not set it. A grant is always somebody with a database URL making a decision:

```bash
# Local
export $(grep DATABASE_URL .env.local | head -1)
node scripts/grant-admin.js you@example.com

# Production (Neon)
DATABASE_URL='postgres://…@….neon.tech/…?sslmode=require' \
  node scripts/grant-admin.js you@example.com

node scripts/grant-admin.js --list              # who currently has it
node scripts/grant-admin.js you@example.com --revoke
```

The script prints the host it is about to write to before it writes. Granting on the wrong database
is the mistake it exists to prevent.

Two properties worth knowing:

- **`is_active = false` revokes the console too.** The guard checks both columns, so deactivating a
  person's account does not leave a second switch someone has to remember to flip.
- **Revocation is immediate.** The flag is read from the database on every request rather than
  baked into the session JWT. Putting it in the token would be one less query and would also mean a
  revoked operator kept access until their seven-day session expired.

## The gate

`src/lib/auth/platform-admin.ts`:

- `requirePlatformAdmin(request)` — resolves the session from either transport the app uses (the
  `Bearer` token the merchant shell keeps in `localStorage`, or the `session` cookie) and confirms
  the flag. Throws `PlatformAdminError` carrying the status.
- **401 for an anonymous caller, 403 for a signed-in merchant.** They are different facts and a
  merchant who bookmarks `/platform` deserves the honest one.
- `platformErrorResponse(error, context)` turns that into the response, and turns anything else
  into a generic 500 — a platform route's error text can name tables and store ids, and none of
  that belongs in an HTTP body.
- `recordAdminAction(...)` writes to `platform_admin_audit`. Best-effort by design: an audit write
  that fails logs and returns rather than taking the console down. The console is read-only, so a
  lost row loses the record of a *view*, not of a change.

The "Admin" item in the merchant sidebar is a **convenience, not a control**. It is rendered from
`isAdmin` on the client. A merchant who edits that value in memory, or simply types the URL, gets a
403 from every `/api/platform/*` route.

## Counting clicks honestly

Three tables now touch traffic, and they are not duplicates of each other:

| Table | Grain | What it is for |
|---|---|---|
| `visitors` | `UNIQUE (store_id, ip_address, visited_date)` | Unique visitors per store per day. Structurally cannot count clicks — that is the point of the constraint. |
| `page_analytics` | One row per marketing-site event | The landing-page funnel. Written by `src/lib/analytics.ts`. |
| `storefront_click_events` | One row per buyer hit on a storefront | Platform traffic. Every event, so it can answer both "how many clicks" and "how many people". |

`storefront_click_events` stores a **salted SHA-256 `ip_hash`, never the address**. The console
needs "how many distinct people", not "which people", and a table of shopper addresses spanning
every merchant on the platform is a liability with no matching feature.

`storefront_click_daily` is a rollup maintained by an `AFTER INSERT` trigger, so all-time totals are
a sum over a few thousand rows instead of a scan of every event ever recorded. It holds **clicks
only**. It deliberately does not carry a `unique_visitors` column: you cannot increment a distinct
count without keeping the set, and a trigger that added 1 per insert would produce a number that
looks like a distinct count, is not one, and drifts further from the truth every day. Uniques are
computed from the event table over an explicit window, where they are real.

If you ever suspect the rollup has drifted:

```sql
SELECT rebuild_storefront_click_daily();
```

## What the numbers mean

The console exists to tell the truth about the platform, including when the truth is small. Each
figure has one definition and it is written down here so nobody has to reverse-engineer it from
SQL:

| Figure | Definition |
|---|---|
| Merchants | Rows in `stores`. **Active** is `is_active`; **launched** is `is_active AND is_public`. |
| Buyer clicks | Rows in `storefront_click_events` — bots excluded at ingestion, not at query time. |
| Unique visitors | `COUNT(DISTINCT COALESCE(visitor_id, ip_hash))` over the window. Never summed across windows: two 30-day counts do not add up to a 60-day count. |
| Orders received | Rows in `orders` created in the window, across all stores. |
| Orders shipped | Orders whose `shipped_at` falls in the window. An order received in one window and shipped in the next counts once in each — they answer different questions. |
| Fulfilment rate | Shipped ÷ received over the same window. **Zero when received is zero**, never `NaN`. |
| Avg hours to ship | Mean of `shipped_at - created_at` over orders shipped in the window. `null`, not `0`, when there are none. |
| GMV | `SUM(total_amount)` converted to integer cents at the SQL boundary. Gross: refunds are reported separately rather than netted silently. |
| Click → order | Orders ÷ storefront clicks over the window. A rate, not a promise; it is a platform-wide average across merchants at very different stages. |

Period-over-period deltas compare against the equally-sized window immediately before the current
one. A metric's *polarity* is per-metric: a fall in refunds is good, a fall in orders is not.

Two rules the screens follow, both from `CLAUDE.md`:

- **A failed fetch is never rendered as a zero.** An error state says the number could not be
  loaded. Presenting a fetch failure as "0 orders" is the kind of quiet lie this codebase has
  shipped before.
- **An empty platform renders an honest empty state**, not `NaN%` and not a broken chart. Zero
  merchants with zero clicks is a real state and the first one a new deployment is in.

## Operating notes

- The migration (`040_platform_admin.sql`) is additive and defaults every existing user to
  non-admin, so deploying it grants nobody anything.
- Migrations run from the Vercel build command, so `/platform` reaching production and the tables
  existing there happen in the same deploy.
- The audit trail (`platform_admin_audit`) is append-only by convention. Nothing prunes it yet; if
  it ever grows enough to matter, that is a retention decision to make deliberately rather than a
  cleanup job to add quietly.
