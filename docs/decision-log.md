# Decision log

Development history, the reasoning behind decisions that are not obvious from the code, and the
live TODO list. Append as you work.

---

## Platform admin console (`/platform`)

An operator's view across every tenant, parallel to the merchant admin at `/admin` rather than
nested inside it. Merchants see one store; operators see the platform.

### Decisions

**`users.is_admin` is a column, not a `platform_admins` table.** A join table would mean a second
identity: the operator signs in twice, and the merchant shell needs a second lookup before it can
draw the door. One user, one session, one boolean, granted only by `scripts/grant-admin.js`.

**The flag is re-read from the database on every request, never carried in the JWT.** A signed
token is faster and would keep a revoked operator inside for up to seven days. `is_active` is
checked in the same query, so deactivating an account revokes the console with it rather than
leaving a second switch to remember.

**Hiding the sidebar link is not access control**, and the code says so where the link is drawn.
`requirePlatformAdmin` refuses every `/api/platform/*` route: 401 for an anonymous caller, 403 for
a merchant — different facts, honestly reported.

**`JWT_SECRET` now fails closed.** A security reviewer minted a valid seven-day session for the
seeded admin account using only the `'your-secret-key-here'` literal that `session.ts` fell back to.
Re-reading `is_admin` from the database does not contain that: the forger does not claim to be an
admin, they claim to *be* the admin, and the database agrees. `main` fixed the same hole
independently and its version is the one that shipped — it validates lazily rather than at module
load, because eager validation throws inside the client bundle that `preview.ts` reaches and takes
the customizer down with it.

**Clicks needed a third table, not a reuse of the two we had.** `visitors` is
`UNIQUE (store_id, ip_address, visited_date)` and so is structurally a unique-visitor counter that
cannot count clicks; `page_analytics` is written only by the marketing tracker.
`storefront_click_events` keeps every event, stores a salted SHA-256 of the address and never the
address, and **drops bots before the insert** — the daily rollup is trigger-maintained and cannot
see a `WHERE` clause, so a crawler filtered at query time would already have been counted.

**The rollup counts clicks and deliberately holds no unique-visitor column.** A distinct count
cannot be incremented without keeping the set; a trigger adding 1 per insert would produce a number
that looks like a distinct count, is not one, and drifts further from the truth daily.

**GMV is gross over settled orders, with unsettled, cancelled and refunded each reported
separately.** The first draft summed every non-cancelled order and put ~23% unpaid money in a
revenue tile. Settled is `status <> 'cancelled' AND payment_status IN ('paid','completed',
'refunded')` — three values because three writers populate the column, and `paid_at` is unusable
because nothing writes it. Refunds are scoped to *the same order set GMV is built from*, so
`GMV − refunded` is a figure an operator may legitimately compute; summing refunds across every
order looked more complete and invited the reader to subtract money that was never added.

**One definition of "customized", in one module.** The overview and the customers list grew
separate rules that returned 0-of-3 and 3-of-3 for the same stores — "0 customized" would have sat
directly above a table where every row said "Customized". `src/lib/platform/customization.ts` is
the single predicate both import.

**Rates return `null`, not `0%`, below a sample floor.** 23 clicks and 19 orders produced a
headline "82% click-to-order", which is arithmetically correct and reads as a lie.

**One vocabulary for "an order", enforced by a seam rather than by discipline.** Four fulfilment
rates and two received counts were on screen simultaneously: the overview panel said 75% (49 of
65), its own headline card said 66.67% (10 of 15), the customers list said 68% of 72, and a store
detail said 63%. Postgres says 72 orders, 7 cancelled.

This was the *third* time this branch grew two definitions of one word — after two rules for
"customized" and 74% beside 77% — which is the signal that the problem is not carelessness. Three
surfaces each wrote the predicate they needed, correctly, in isolation. So the fix is
`RECEIVED_ORDER_PREDICATE`, `CANCELLED_ORDER_PREDICATE`, `REFUNDED_ORDER_PREDICATE` and the
`fulfillmentRatePct()` / `averageCents()` helpers in one module, with every count and rate on every
surface routed through them, and a test that asserts *identity* across surfaces (SQL count =
overview = list totals = detail) rather than plausibility. A fourth definition now fails a test
instead of shipping.

**Received includes cancellations.** The merchant took the order and it fell through. Excluding
cancelled orders deletes cancellation from the one screen an operator would look for it on, and
flatters fulfilment by removing orders that were never going to ship. Cancellations ship as their
own figure beside every received count.

**The funnel's denominator no longer contains its own numerator.** Top-of-funnel was
`clicksInWindow` — every event row, 4,130 — of which product views, add-to-carts and checkouts are
themselves members, so "29% of buyer clicks" was a share of a total that included it rather than a
conversion rate. It is now `storefrontViews` (2,638).

### Known limitations

- **`users.last_login` is written by nothing**, so the console reports "Not tracked" rather than
  "Never signed in". Fixing the sign-in route to write it is a one-line change nobody has made.
- **The beacon's rate limit is per-instance.** A globally exact limit needs an index on
  `(store_id, ip_hash, occurred_at)` that migration 040 does not create.
- **`platform_admin_audit` has no retention policy.** Nothing prunes it. That is a deliberate
  decision to make later rather than a cleanup job to add quietly.
- **The console is read-only.** `recordAdminAction` is best-effort by design, which is the right
  trade for logging a *view* and the wrong one for logging an *action taken as someone else*. Any
  write action — or impersonation — must make the audit write blocking first.
- **`store_analytics_summary` is seed-only fiction** claiming 2.4× the real order count. Nothing
  in the console reads it. Nothing should.
- **Turbopack in the session container does not reliably pick up edits to `src/lib/platform/**`.**
  Two separate agents arbitrated numbers against the running console and drew wrong conclusions
  from stale compiled code before noticing. Restart the dev server before trusting a live figure
  against a change you just made — or call the exported function directly, which is what finally
  settled it.
- **Full-page Playwright screenshots blank `<canvas>` elements**, because the capture resizes the
  viewport. A chart that looks empty in a full-page shot is very likely fine; check with a
  viewport-sized capture before filing it as a bug. This cost one round trip here.

### TODO

- [ ] Write `users.last_login` on sign-in, then drop the `lastLoginTracked` stopgap.
- [ ] "Merchants needing attention" queue — the churn composite (no orders in 14 days, failing
      sync, published but cannot take money, subscription cancelling, failed fulfilment push).
- [ ] Drill-through from every overview number to the rows behind it.
- [ ] Platform-wide order search (indexes already exist on order number, email, tracking).
- [ ] Merchant activation funnel and time-to-first-order.
- [ ] Platform take-rate revenue: `subscriptions.unit_amount` (already integer cents) and
      `orders.application_fee_amount` (decimal dollars — do not mix the units).
- [ ] Alerts view over `integration_alerts`, which already models an inbox.
- [ ] Monthly merchant cohort retention — write the query now, render the grid once there are
      three cohorts.
