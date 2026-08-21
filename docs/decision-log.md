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
