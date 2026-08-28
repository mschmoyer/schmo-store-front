# The platform admin console

The operator's view of the whole tenancy, at **`/platform`**, plus one write surface:
**`/platform/coupons`**, where an operator issues the signup coupons described in
`docs/plans/platform-coupons.md` (schema, invariants, the `/join/<code>` link) and
`docs/payments.md` §8 (how a coupon reaches Stripe). Every other screen under `/platform` is
still read-only. It is a different thing from `/admin`, and the distinction is the whole design:

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
  that fails logs and returns rather than taking the console down. That reasoning holds for every
  **read** surface — a lost row loses the record of a *view*, and a view cannot be undone or redone,
  so failing the request over it would make the console less useful for no safety gained.

The "Admin" item in the merchant sidebar is a **convenience, not a control**. It is rendered from
`isAdmin` on the client. A merchant who edits that value in memory, or simply types the URL, gets a
403 from every `/api/platform/*` route.

### Mutations audit differently, on purpose

`POST /api/platform/coupons` and `PATCH /api/platform/coupons/[id]` are the console's first WRITE
surface (`docs/plans/platform-coupons.md` §4C, invariant 11), and `recordAdminAction`'s reasoning
does not carry over to them: a lost audit row for a *view* costs a gap in a log nobody can act on
anyway, but a lost audit row for a coupon an operator just created — one that can discount a
merchant's subscription for a year — is a change with no record it happened. Best-effort is the
wrong trade-off the moment the action being recorded is irreversible and costs money.

So these two routes do not call `recordAdminAction` at all. Each one writes the coupon change and
its `platform_admin_audit` row from the same `db.transaction(...)` client, in that order, with no
`try/catch` around the audit `INSERT`:

```ts
await db.transaction(async (client) => {
  const result = await createPlatformCoupon(input, admin.userId, client);
  if (result.reason === 'ok') {
    // fail-hard: no try/catch. A failed audit write rolls back the coupon it would describe.
    await client.query(
      `INSERT INTO platform_admin_audit (admin_user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.userId, 'create_coupon', 'platform_coupon', result.coupon.id, /* … */]
    );
  }
  return result;
});
```

If the audit `INSERT` fails, the transaction rolls back and the coupon is never created: a change
with no record of who made it is `CLAUDE.md`'s **Honest results** rule ("never return `success: true`
for work that wrote nothing") applied to a write, not just a response — an unaudited mutation is work
nobody can be held to, even with a row sitting in `platform_coupons`.

The rule going forward: **any future write added to `/platform` follows this pattern, not
`recordAdminAction`'s.** `recordAdminAction` stays exactly as it is — best-effort, for reads.

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

## Demo stores are not merchants

`scripts/seed-demo.js` creates three fully-populated storefronts, and every figure on the console
excludes them. They are excellent for development and poison in a platform metric: the console
exists to answer *how is the platform doing*, and the answer is wrong the moment invented merchants
are counted beside real ones — wrong in the flattering direction, because the demo data is
deliberately healthy and drags every rate upward.

The flag is `stores.is_demo`. The seed sets it; nothing a merchant does sets it; and it changes
nothing about how the storefront behaves — the store still renders, still takes orders, still
syncs. It decides one thing: whether `/platform` counts it.

Migration 041 backfills the three stores the seed has always created, by their fixed ids. Anything
else — a demo store built through onboarding, a sales-demo tenant on a real deployment, a staging
clone where some production stores should stop counting — is marked by hand:

```bash
node scripts/mark-demo-store.js <slug-or-uuid>          # stop counting it
node scripts/mark-demo-store.js <slug-or-uuid> --real   # count it again
node scripts/mark-demo-store.js --list                  # what is currently hidden
```

The console reports what it hid rather than hiding it silently — a hidden store is a fact about
the reading, and an operator who cannot see that a figure is filtered cannot trust it. `?includeDemo=1`
puts them back for a single request.

**A local consequence worth expecting:** a development database seeded by `seed-demo.js` contains
*only* demo stores, so the console legitimately reads zero there. That is the feature working, not
a broken page.

## What the numbers mean

The console exists to tell the truth about the platform, including when the truth is small. Each
figure has one definition and it is written down here so nobody has to reverse-engineer it from
SQL:

| Figure | Definition |
|---|---|
| Merchants | Rows in `stores`. **Active** is `is_active`; **launched** is `is_active AND is_public`. |
| Buyer clicks | Rows in `storefront_click_events` — bots excluded at ingestion, not at query time. |
| Unique visitors | `COUNT(DISTINCT COALESCE(visitor_id, ip_hash))` over the window. Never summed across windows: two 30-day counts do not add up to a 60-day count. |
| Orders received | Rows in `orders` created in the window, across all stores — **cancellations included**. One predicate, `RECEIVED_ORDER_PREDICATE` in `src/lib/platform/customers.ts`, and every received count on every screen is written through it. See "What 'received' means" below. |
| Orders cancelled | Its own count, returned beside every received figure (`cancelledInWindow`, `cancelledAllTime`, and `orders.cancelled` on the list and detail). Inside "received", never quietly removed from it. |
| Orders shipped | Orders whose `shipped_at` falls in the window. An order received in one window and shipped in the next counts once in each — they answer different questions. `shippedPrevWindow` carries the equally-sized preceding window so the card can show a delta. |
| Fulfilment rate | Shipped ÷ received over the same window, from the single helper `fulfillmentRatePct()`. **`null` when received is zero** — an unmeasured rate, never `0%` and never `NaN`. Returned rather than derived by the console: `fulfillmentRatePct` (window), `fulfillmentRateAllTimePct` (all time), and `fulfillmentRatePct` on each list row, the list totals and the store detail. Because shipped and received are different populations, cohort fulfilment (of orders *received* in the window, what fraction shipped) and % shipped within 48h are reported alongside it — a growing month makes the simple ratio look like degrading service when it is not. |
| Average order value | Settled GMV ÷ settled orders, from the single helper `averageCents()`. **`null` when no order settled**, never `$0.00`. The settled count is returned beside it (`orders.settledInWindow`, `totals.settledOrders`, `orders.settledOrders`) so a screen can label which orders the money is averaged over. |
| Conversion rates | `null`, not `0%`, below a denominator floor of 100 storefront views / 30 add-to-carts. A rate computed from 23 views is arithmetically correct and reads as a lie; the UI renders "—" with the raw counts instead. The click→order denominator is **storefront views**, not every click event — see "The funnel's denominator". |
| Order backlog | Unshipped **settled** orders older than 48h, reported per store with money and age. An unpaid order is not a fulfilment failure, so it is excluded here and surfaced as unsettled instead. `health.unfulfilled` carries `total`, `totalCents` and `oldestAgeHours` (nullable — an unknown age is not a fresh one) alongside the per-store rows. |
| Avg hours to ship | Mean of `shipped_at - created_at` over orders shipped in the window. `null`, not `0`, when there are none. |
| GMV | `SUM(total_amount)` over **settled** orders, converted to integer cents at the SQL boundary. Settled means `status <> 'cancelled' AND payment_status IN ('paid','completed','refunded')`. Three payment values because three writers populate the column: real checkout writes `'paid'`, the demo seed writes `'completed'`, and `'refunded'` is included because the money did move. `paid_at` is deliberately not used — nothing writes it. |
| Unsettled | Placed, not cancelled, not paid. Its own figure, never folded into GMV. ~23% of what the first draft called GMV was this. An order sitting here is a checkout or payment-capture problem. |
| Cancelled | Its own figure, reported beside received rather than removed from it. A refund on a cancelled order sits here and in `refundedCancelledCents*`, never in GMV and never in the settled refund figure. Cancelled and refunded **overlap** — on the demo data they are the same rows — so the counts are published with their overlap (`refundedCancelledCount`, `refundedCancelledOrdersInWindow`); rendered as two independent columns, three bad orders read as six. |
| Refunded | Three figures, because one cannot answer both questions. `refundedSettledCents*` is `SUM(refunded_amount)` over **the same order set GMV is built from** — the only figure `GMV − refunded` may be computed from, and the one the contract name `refundedCentsInWindow` aliases. `refundedCancelledCents*` is refunds on cancelled orders: real money back to buyers, of value GMV never contained. `refundedTotalCents*` is the two together. On the current data every refunded order is also cancelled, so the settled figure is `0` and the total is not — publishing only one of them would either hide real refunds or invite a subtraction from a total that never held them. `refundedOrdersInWindow` and `refundedCancelledOrdersInWindow` give the counts and their overlap. |
| Units sold | Quantity on **settled** orders created in the window — the same population `gmv*InWindow` sums, so revenue-per-unit is a number that can be computed. |
| Click → order | Orders ÷ storefront clicks over the window. A rate, not a promise; it is a platform-wide average across merchants at very different stages. |

Period-over-period deltas compare against the equally-sized window immediately before the current
one. A metric's *polarity* is per-metric: a fall in refunds is good, a fall in orders is not.

The overview carries a `comparison` block — `{ start, end, measured, platformSince }` — describing
that preceding window. `measured` is the distinction the console kept losing: **a `*PrevWindow`
figure of `0` is a measurement** when the platform existed during that period, and merely an
absence of history when it did not. Only the second is honestly described as "no previous period to
compare against". A card with no baseline field at all is a third thing again, and the fix for that
is to add the field rather than to print a sentence about a period that did exist.

## What "received" means

An order is **received** when the merchant took it: every row in `orders`, cancellations included.
A cancelled order was placed by a buyer, landed in the merchant's queue and then fell through;
removing it from "received" hides cancellation exactly where an operator would look for it, and
flatters the fulfilment rate by deleting orders that were never going to ship. So cancellations
stay in the denominator and are reported as their own figure beside it.

This is written down because it was previously three different things at once. The overview counted
`status <> 'cancelled'` (65 orders, 75% shipped), the customers list counted `COUNT(*)` (72 orders,
68%), and a store detail divided a shipped count by `COUNT(*)` again (63% of 27) — one platform,
one afternoon, three fulfilment rates on adjacent screens, each of them arithmetically correct.
None of the three was the bug. The bug was that no module owned the word.

`src/lib/platform/customers.ts` now does. It exports `RECEIVED_ORDER_PREDICATE`,
`SETTLED_ORDER_PREDICATE`, `UNSETTLED_ORDER_PREDICATE`, `CANCELLED_ORDER_PREDICATE` and
`REFUNDED_ORDER_PREDICATE`, plus the two derived calculations — `fulfillmentRatePct()` and
`averageCents()` — as functions rather than expressions repeated at each call site.
`src/lib/platform/metrics.ts` imports all of them. Every received count and every fulfilment rate
the console shows goes through that one seam, which is what makes "why is this new query not using
`RECEIVED_ORDER_PREDICATE`?" a question a reviewer can ask.

`src/lib/platform/__tests__/orderVocabulary.test.ts` asserts the identity — not that each surface
looks plausible, but that the overview, the customers list, a store detail, the orders tab and raw
SQL return the *same* number, and the same rate, for the same population.

## The funnel's denominator

`traffic.clicksInWindow` is every storefront event row of every type, so it is the **sum** of the
funnel's stages, not their top: `2,638 + 1,181 + 198 + 83 + 30 = 4,130`. Dividing product views by
it puts the numerator inside its own denominator and reports 29% where the honest figure is 45%.

The overview therefore returns a `funnel` block: ordered `stages` (storefront views → product views
→ add to cart → checkout start → orders received), `topOfFunnelKey` naming `stages[0]` as the only
denominator a top-of-funnel rate may use, and `allEventsInWindow` carrying the all-types total
under a name that cannot be mistaken for an arrival count. `conversion.clickSample` is storefront
views and `conversion.clickSampleEvent` says which event type that is, so the console can label the
rate rather than the reader having to guess.

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
  cleanup job to add quietly. Since "Mutations audit differently, on purpose" above, a row here for
  `create_coupon` / `deactivate_coupon` etc. is a guarantee, not a best-effort log: if the row isn't
  there, the mutation didn't happen.
- `platform_coupons` and `platform_coupon_redemptions` (migration `042_platform_coupons.sql`) are
  not scoped by `store_id` any more than `platform_admin_audit` is — they are platform-wide by
  definition, same as everything else this console reads. `/platform/coupons`'s own demo-exclusion
  behaviour matches the rest of the console: `?includeDemo=1` puts demo stores' redemptions back.
