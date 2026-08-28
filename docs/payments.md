# Payments

RebelShops has **two entirely separate money flows**. Keeping them separate — different Stripe
objects, different tables, different code paths — is the single most important idea in this
document.

| | Flow A — Platform billing | Flow B — Storefront checkout |
|---|---|---|
| Who pays | The merchant | A shopper |
| Who gets paid | RebelShops | **The merchant** |
| Stripe mode | `subscription` | `payment` |
| Stripe account | Platform | Platform, charging **on behalf of** the merchant's connected account |
| Local tables | `billing_customers`, `subscriptions` | `payment_accounts`, `checkout_sessions`, `orders`, `order_items` |
| Entry point | `POST /api/billing/checkout` | `POST /api/checkout/session` |

Both flows share one webhook endpoint (`POST /api/webhooks/stripe`) and one idempotency ledger
(`webhook_events`).

A third thing rides flow A without being a separate flow: **platform signup coupons** (§8) —
`docs/plans/platform-coupons.md`'s "hand a friend a link, they sign up with a year free" feature.
It never touches flow B and adds no new Stripe mode; it is one more discount a flow-A subscription
can carry in place of the intro offer.

> **Working in this code?** `src/lib/stripe/CLAUDE.md` is the operational companion to this
> document: the rules, the module map, and the complete Stripe SDK and route surface. This file is
> the *why*; that one is the *what not to break*.

---

## 1. Flow A — the intro offer

**The offer: $1/month for the first 3 months, then $19.99/month.**

### The Stripe objects

| Object | What it is | How it is resolved |
|---|---|---|
| Product | `RebelShops Storefront` | `STRIPE_PLATFORM_PRODUCT_ID`, else metadata search on `plan_key=rebelshops_standard`, else created |
| Price | `unit_amount: 1999`, `recurring: { interval: 'month' }`, `currency: usd` | `STRIPE_PLATFORM_PRICE_ID`, else `lookup_key=rebelshops_standard_monthly`, else created |
| Coupon | `amount_off: 1899`, `currency: usd`, `duration: 'repeating'`, `duration_in_months: 3` | `STRIPE_INTRO_COUPON_ID`, else the well-known id `rebelshops-intro-3mo`, else created |
| Customer | One per store owner | `billing_customers.stripe_customer_id` |
| Subscription | Created by Checkout with `discounts: [{ coupon }]` | mirrored into `subscriptions` |

`ensurePlatformPlan()` (in `src/lib/stripe/prices.ts`) performs the resolve-or-create for all three
and is safe to call on every checkout: in the steady state it is two cheap reads. **No object ID
is hardcoded to somebody's test account.**

### Why a repeating Coupon and not a subscription schedule

Three representations were considered:

1. **$19.99 price + repeating amount-off Coupon.** ← chosen
2. A `$1` price for 3 iterations then a `$19.99` price, driven by a Subscription Schedule.
3. A percentage-off coupon.

Option 3 is arithmetically impossible: Stripe caps `percent_off` at two decimal places, and no such
percentage of $19.99 lands on exactly $1.00 (94.997…% is required). It was rejected outright — a
money model that cannot express the advertised price is not a candidate.

Option 2 is exact, but Stripe Checkout cannot create a Subscription Schedule directly. It would mean
creating the subscription first and then attaching a schedule, keeping two Price objects in sync,
and owning phase-transition failure modes for the sake of a discount that Stripe already models
natively. More moving parts, more ways for a merchant to end up on the wrong price.

Option 1 is one Price, one Coupon, and a discount that expires by itself after three invoices.
Checkout takes it inline (`discounts: [{ coupon }]`), the merchant sees "$18.99 off" as a real line
in Stripe Checkout and on every invoice, and cancellation/upgrade paths need no special handling.
The one real trade-off — a Coupon's `amount_off` is immutable, so changing the intro price means
creating a new coupon — is acceptable for a price we do not intend to change, and
`ensureIntroCoupon()` throws loudly rather than silently charging the wrong amount if an existing
coupon disagrees with the catalogue.

### The math, in integer cents

```
list price                      1999   ($19.99)
coupon amount_off               1899   ($18.99)   = 1999 - 100
────────────────────────────────────────────────
invoice 1 (charged at checkout) 1999 - 1899 = 100   → $1.00
invoice 2                       1999 - 1899 = 100   → $1.00
invoice 3                       1999 - 1899 = 100   → $1.00
invoice 4 and onward            1999 -    0 = 1999  → $19.99
────────────────────────────────────────────────
total across the intro window   3 × 100 = 300       → $3.00
first 12 months                 300 + 9 × 1999      → $182.91
```

`duration_in_months: 3` on a monthly subscription covers exactly invoices 1, 2 and 3 — the discount
starts when the subscription starts and ends three months later, and there is no trial, so the card
is charged **$1.00 immediately at checkout**.

Every number above is asserted in `src/lib/billing/__tests__/intro-offer.test.ts`, and no floating
point value touches money anywhere in the codebase (`src/lib/billing/money.ts`).

### Where the numbers live

`src/lib/billing/intro-offer.ts` is dependency-free and is the single source of truth. The pricing
page, the admin billing screen, the checkout endpoint and the tests all read from it, so marketing
copy and the actual charge cannot drift apart.

---

## 2. Flow B — storefront checkout

```
shopper's browser                 RebelShops server                    Stripe
─────────────────                 ─────────────────                    ──────
cart (localStorage)
  product ids + quantities  ──▶  POST /api/checkout/quote
                                   re-price from `products`
                                   check stock (`inventory`)
                                   validate coupon (`coupons`)
                            ◀──   server-computed totals

  contact + address         ──▶  POST /api/checkout/session
                                   re-price again (authoritative)
                                   assert Stripe total == server total
                                   snapshot → `checkout_sessions`
                                                              ──▶  create Checkout Session
                            ◀──   { url }                     ◀──   session.url
  redirect to Stripe ─────────────────────────────────────────▶
  pay
                                 POST /api/webhooks/stripe    ◀──   checkout.session.completed
                                   claim in `webhook_events`
                                   ┌ one transaction ──────────────┐
                                   │ insert `orders`               │
                                   │ insert `order_items`          │
                                   │ decrement inventory           │
                                   │ record `coupon_usage`         │
                                   └───────────────────────────────┘
  redirect to order-success ──▶  GET /api/checkout/confirm
                            ◀──   the real order row
```

### Trust rules

* **The browser never supplies a price.** `POST /api/checkout/session` accepts product identity,
  quantity, a coupon *code*, a shipping method id and contact details. Anything resembling a price in
  the request body is ignored — see the "ignores any price the client sends" test in
  `src/lib/billing/__tests__/cart.test.ts`.
* **Amount reconciliation.** `assertStripeAmountMatches()` refuses to create a session if the sum of
  the Stripe line items minus the discount differs from the server total by even one cent.
* **The webhook does not trust Stripe metadata either.** Metadata is capped at 500 characters per
  value, so the priced cart is persisted to `checkout_sessions` when the session is created, and the
  webhook builds the order from that row.

### Pricing rules

| Element | Source |
|---|---|
| Unit price | `products.override_price` → `products.sale_price` → `products.base_price` |
| Stock | `SUM(inventory.available)` for the SKU, falling back to `products.stock_quantity` |
| Discount | `coupons` table, evaluated against server-priced lines |
| Shipping | Flat rate card in `src/lib/billing/cart-pricing.ts` (free standard over $50) |
| Tax | **Always `0` today** — see the extension points below |

Order of operations: `subtotal → discount (capped at subtotal) → shipping (assessed on the
pre-discount subtotal) → tax → total`.

### Extension points, marked in code

* `computeShippingCents()` — flat placeholder rates. Replace with ShipStation/ShipEngine rate
  shopping against the destination address and cart weight; keep the table as the offline fallback.
* `computeTaxCents()` — deliberately returns `0` rather than guessing. The intended implementation is
  Stripe Tax (`automatic_tax: { enabled: true }` with the connected account registered for the
  relevant jurisdictions), in which case this function keeps returning `0` and Stripe adds the line.

### Coupons

Checkout re-implements the storefront's coupon rules in `src/lib/billing/coupons.ts` against the
**current** schema. The existing `POST /api/store/[storeId]/coupons/validate` route still joins a
`discounts` table that migration 013 removed, so it cannot succeed against this database; that route
is owned by another agent and was left untouched. The rules honoured are: `is_active`, `valid_from` /
`valid_until`, `usage_limit` vs `used_count`, `minimum_order_amount`, `applies_to` targeting
(`entire_order` / `specific_products` / `specific_categories`) with product and category exclusions,
percentage vs fixed amounts, and `maximum_discount_amount`.

Because Stripe Checkout will not accept a negative line item, a redeemed storefront coupon is
converted into a **single-use Stripe Coupon** (`duration: 'once'`, `max_redemptions: 1`,
`amount_off` equal to the server-computed discount) and attached to the session, so the shopper sees
a real discount row.

---

## 3. Stripe Connect

Each store gets an **Express** connected account. Storefront charges are created on the platform
with:

```ts
payment_intent_data: {
  on_behalf_of: 'acct_...',                    // the merchant is the merchant of record
  transfer_data: { destination: 'acct_...' },  // funds settle to the merchant
  application_fee_amount: 0,                   // STRIPE_APPLICATION_FEE_BPS, default 0
}
```

When a store has **no** connected account with `charges_enabled` — the normal state in local
development — the charge falls back to **platform-direct** and the response reports
`settlement: "platform_direct"`. Nothing silently changes who gets the money: the state is visible in
the API response and on the admin billing screen.

| Route | Purpose |
|---|---|
| `POST /api/connect/onboard` | Create (or reuse) the account and mint a fresh Account Link |
| `GET /api/connect/status` | Capability snapshot for the signed-in merchant |
| `GET /api/connect/return` | Stripe's `return_url`; re-reads the account and redirects to `/admin/billing` |
| `GET /api/connect/refresh` | Stripe's `refresh_url`; mints a replacement link (Account Links are single-use) |

`return`/`refresh` are browser navigations and cannot carry the admin bearer token, so they are
unauthenticated by design. They act only on an account id that already exists in `payment_accounts`
and perform no privileged action beyond refreshing a status the `account.updated` webhook would tell
us anyway.

---

## 4. Webhooks

**Endpoint:** `POST /api/webhooks/stripe`

Three things this endpoint gets right, in order:

1. **Raw body.** `await request.text()` runs first. Stripe signs the exact bytes it sent; parsing to
   JSON and re-serialising changes key order and whitespace and every signature fails. (In the App
   Router there is no `bodyParser` to disable — that was the Pages Router.)
2. **Signature before payload.** Nothing is read from the event until `constructEvent` succeeds.
3. **Idempotency before side effects.** Every event is claimed in `webhook_events` with a single
   atomic statement:

   ```sql
   INSERT INTO webhook_events (...) VALUES (...)
   ON CONFLICT (event_id) DO UPDATE SET attempts = webhook_events.attempts + 1, status = 'received'
   WHERE webhook_events.status IN ('received', 'failed')
   RETURNING id, attempts, (xmax = 0) AS inserted;
   ```

   A row already `processed` or `ignored` is filtered out by the `WHERE`, no row returns, and the
   delivery is acknowledged and skipped. Handlers are individually idempotent as well (order
   creation keys on `stripe_checkout_session_id`; subscription writes are upserts).

### Event matrix

| Event | Flow | What happens |
|---|---|---|
| `checkout.session.completed` | A + B | Subscription mode → sync the subscription, then close out a platform signup coupon's redemption (`attributed → redeemed`, §8 below) if the subscription carries one. Payment mode → create the order, items, inventory movement and storefront coupon usage in **one transaction** |
| `checkout.session.expired` | B | Mark the `checkout_sessions` row `expired` |
| `customer.subscription.created` | A | Upsert the local mirror |
| `customer.subscription.updated` | A | Upsert (status, period, `cancel_at_period_end`) |
| `customer.subscription.deleted` | A | Upsert, then mark canceled |
| `invoice.paid` | A | Record the payment and re-read the subscription so the period rolls forward |
| `invoice.payment_failed` | A | Record the failure; the merchant keeps access while Stripe retries (`past_due` is still entitled) |
| `account.updated` | Connect | Refresh `payment_accounts` capabilities |
| `charge.refunded` | B | Set `orders.refunded_amount` and `payment_status` (`refunded` / `partially_refunded`) |
| *anything else* | — | **200 with `outcome: "ignored"`** — Stripe retries non-2xx, so unmodelled events must be acknowledged |

Response codes: `200` handled/ignored/duplicate · `400` bad or missing signature · `503` Stripe not
configured · `500` only when a handler threw, so Stripe retries with backoff.

---

## 5. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | to take any payment | Server-side Stripe key. Absent ⇒ every payment surface degrades to a "payments not configured" state |
| `STRIPE_WEBHOOK_SECRET` | to receive webhooks | Signature verification. Absent ⇒ `/api/webhooks/stripe` returns 503 rather than trusting unverifiable payloads |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | for future embedded elements | Not required by the current redirect-based Checkout flow |
| `NEXT_PUBLIC_APP_URL` | yes | Base URL for `success_url` / `cancel_url` / Connect return URLs |
| `STRIPE_PLATFORM_PRODUCT_ID` | no | Pin the plan's Product; otherwise discovered by metadata or created |
| `STRIPE_PLATFORM_PRICE_ID` | no | Pin the $19.99/mo Price; otherwise found by `lookup_key=rebelshops_standard_monthly` or created |
| `STRIPE_INTRO_COUPON_ID` | no | Pin the intro Coupon; defaults to `rebelshops-intro-3mo` |
| `STRIPE_APPLICATION_FEE_BPS` | no | Platform take rate on storefront charges, in basis points. Default `0` (we take nothing) |

No key is required for the app to build, start, or render. Every page and endpoint has a defined
behaviour with an empty environment.

---

## 6. Testing with the Stripe CLI

```bash
# 1. Point the app at a test-mode key
export STRIPE_SECRET_KEY=sk_test_...
export NEXT_PUBLIC_APP_URL=http://localhost:3000

# 2. Forward webhooks. Copy the secret THIS RUNNING PROCESS prints -- see the warning below.
stripe listen --forward-to localhost:3000/api/webhooks/stripe
export STRIPE_WEBHOOK_SECRET=whsec_...   # restart the dev server after setting this

# 3. Platform billing: sign in as a merchant, open /admin/billing, click Subscribe.
#    Card 4242 4242 4242 4242, any future expiry, any CVC.
#    Expect: $1.00 charged today, and the Stripe dashboard showing a $18.99 discount for 3 months.

# 4. Storefront checkout: add products to a cart, go to /store/<slug>/checkout, pay.
#    Expect: an `orders` row, `order_items` rows, decremented inventory, and the
#    order-success page confirming against the server rather than the query string.

# 5. Replay a specific event
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
stripe trigger charge.refunded

# 6. Prove idempotency: resend the same event id twice
stripe events resend evt_...
#    Expect: {"received":true,"duplicate":true} on the second delivery, and exactly one order.
```

Provisioning the plan in a fresh Stripe account requires no script: the first call to
`POST /api/billing/checkout` runs `ensurePlatformPlan()`, which creates the Product, Price and
Coupon if they do not already exist.

Connect onboarding in test mode: click "Set up payouts with Stripe" on `/admin/billing` and use
Stripe's test onboarding values (SSN `000-00-0000`, routing `110000000`, account `000123456789`).

> **`stripe listen --print-secret` is not the secret you want.** It returns a different value from
> the one a running `stripe listen` session mints. Configure the app with the `--print-secret`
> output and every delivery fails signature verification: the CLI logs `[400]` for each event, the
> payment still succeeds on Stripe, and **no `orders` row is ever written**. Nothing in the app
> surfaces this - the shopper sees a successful payment and the merchant sees no order. Always copy
> the `whsec_...` printed by the `stripe listen` process you are actually forwarding through, and
> restart the dev server after changing it.
>
> A fast way to confirm the wiring without paying for anything:
>
> ```bash
> stripe trigger payment_intent.succeeded   # unhandled -> 200 means the signature verified
> ```
>
> `200` proves the secret is right (the event is ignored by `HANDLED_EVENT_TYPES`, which is fine).
> `400` means it is wrong. Do not run a checkout test until you see `200`.

---

## 7. Database

Migration `018_billing_and_payments.sql`.

| Table | Role |
|---|---|
| `billing_customers` | Owner → Stripe Customer, created before any subscription exists so the portal always works |
| `subscriptions` | Local mirror of flow A: status, period, `cancel_at_period_end`, intro tracking, amounts in cents |
| `payment_accounts` | One Connect account per store: capabilities, onboarding state, requirements, application fee |
| `checkout_sessions` | Server-priced snapshot of a pending storefront checkout — the webhook's only input |
| `webhook_events` | Idempotency ledger, unique on `event_id` |
| `orders` (extended) | `stripe_checkout_session_id`, `stripe_charge_id`, `stripe_account_id`, `amount_total`, `currency`, `refunded_amount`, `application_fee_amount`, `paid_at`, `refunded_at` — extending the existing table rather than duplicating it |
| `platform_coupons` | Migration `042_platform_coupons.sql`. The operator's signup offers — see §8. Not a Stripe mirror: `stripe_coupon_id` is the only Stripe fact this table holds, filled in lazily on first use. |
| `platform_coupon_redemptions` | The claim ledger behind §8's lifecycle: `attributed` / `redeemed` / `released`, one live claim per user, `ON DELETE RESTRICT` on the coupon so a coupon with history can never be deleted. |

Money convention: Stripe-owned amounts are `INTEGER` cents; storefront amounts keep the existing
`NUMERIC(10,2)` convention used by `orders` / `order_items`. Conversion happens at the boundary in
`src/lib/billing/money.ts`.

Inventory note: inserting `order_items` fires the pre-existing
`update_inventory_on_order_item_insert` trigger, which decrements `products.stock_quantity` and
writes `inventory_logs`. `createPaidOrder()` therefore does **not** touch `products.stock_quantity`
(that would double-decrement) and instead decrements the untriggered `inventory.available` ledger.

---

## 8. Platform signup coupons

`docs/plans/platform-coupons.md` is the full spec — schema, invariants, the operator console, the
merchant's alert ladder. This section is the narrative summary a reader of *this* document needs:
where a signup coupon actually touches Stripe, and where the shipped code diverged from the plan.

### What it touches, and what it doesn't

A platform coupon is flow **A** money, never flow B: it discounts a *merchant's* subscription to
RebelShops, not a shopper's order. It touches exactly two of the surfaces this document already
describes:

* `POST /api/billing/checkout` — attaches the coupon (or the standard intro offer, never both) to
  the Checkout Session.
* `POST /api/webhooks/stripe`'s `checkout.session.completed` handler — closes the redemption out
  once Stripe confirms the subscription.

Everything else about a coupon — creating one, listing them, the operator console at
`/platform/coupons`, the `/join/<code>` link, the onboarding wizard's banner — is application state
that never calls Stripe. `docs/platform-admin.md` covers the console; this document only covers the
two places money actually moves.

### The Stripe object

| Object | What it is | How it is resolved |
|---|---|---|
| Coupon | `percent_off`, `duration: 'repeating'` or `'forever'`, `duration_in_months` when repeating | `platform_coupons.stripe_coupon_id`, else resolve-or-create by `ensureStripeCouponFor()` (`stripe/platform-coupons.ts`), keyed off our row's UUID |

One Stripe Coupon per `platform_coupons` row, created **lazily the first time that row is actually
used at checkout** — not when an operator creates it in the console (creating a coupon in
`/platform/coupons` never calls Stripe at all). There is no Product or Price of its own: a coupon
rides the same `$19.99/month` platform price every subscription already uses.

Two rules the intro coupon does not need, because a signup coupon can be one of hundreds rather than
one well-known object:

* **No `max_redemptions` on the Stripe object.** Our `platform_coupon_redemptions` ledger is the
  cap; Stripe only prices. Setting it there too would drift the moment a checkout session is
  abandoned after the discount attached.
* **Economics are immutable the instant the Stripe coupon exists** — see "Where the code went
  further than the plan" below.

### A coupon replaces the intro offer — one precedence order

A subscription carries exactly one discount. `POST /api/billing/checkout` resolves it in this
order, highest first:

1. A code supplied in the checkout request itself (the "have a coupon?" box on `/admin/billing`).
2. A coupon already attributed to this user — from `/join/<code>` at signup, or an earlier
   billing-form attempt (`resolveActiveClaim`).
3. The standard intro offer (§1).

Whichever wins is attached as `discounts: [{ coupon }]`, the same parameter shape §1 already uses —
`allow_promotion_codes` stays off-limits for the reason in §1's "one hard constraint" callout, and a
signup coupon does not change that. `GET /api/billing/status` now names *which* discount is live
rather than assuming it is always the intro offer, fixing a real bug: `readIntroDiscount()`
(`billing/subscriptions.ts`) used to write `intro_ends_at = NULL` for any coupon that was not the one
well-known intro coupon, because its unexpanded-coupon branch treated an unrecognised id as "no
discount" instead of looking it up. It now resolves an unexpanded id against `platform_coupons`
before giving up, and `/api/billing/status` expands `discounts` on every subscription read rather
than expanding nothing.

### The card-collection flag

Each coupon carries `collect_payment_method` (default `true`). `requiresPaymentMethod()`
(`billing/platform-coupons.ts`) turns it into the one Checkout Session parameter it actually
changes:

| `collect_payment_method` | Session parameter | What happens when the window closes |
|---|---|---|
| `true` (default) | ordinary card collection | Stripe charges the card on file automatically |
| `false` — **only meaningful at `percent_off = 100`** | `payment_method_collection: 'if_required'` | Stripe has nothing to charge; the invoice goes unpaid and the subscription enters dunning until a card is added |

`if_required` only skips collection when the amount due *today* is `$0`, so a partial discount still
takes a card regardless of the flag. The database refuses to store the dishonest combination
(`platform_coupons_no_card_needs_full_discount`), and `requiresPaymentMethod()` computes the honest
answer even if that constraint were somehow bypassed, rather than trusting the flag verbatim.

`/pricing` states this plainly for a visitor arriving via `/join/<code>`: it reads the httpOnly
cookie server-side, re-validates the code against the database, and quotes the coupon's real numbers
and card requirement in place of the standard offer — see `src/app/pricing/page.tsx`. An invalid or
expired code renders the standard page silently; `/join` and the onboarding wizard already say so.

### The redemption lifecycle — two clocks, not one

`platform_coupon_redemptions.status` moves through three states, all written by
`billing/coupon-claims.ts` and nowhere else:

```
attributed  ──►  redeemed   (terminal — never released)
    │
    └────────►  released    (reservation expired, or an operator released it)
```

* **`attributed`** — written at `POST /api/onboarding/account` (or at billing-form entry) the moment
  a code is claimed. This reserves capacity against `max_redemptions` before any money has moved.
* **`redeemed`** — written by the webhook once Stripe confirms a subscription carrying the coupon.
  `discount_ends_at` is set here, from `computeDiscountEndsAt()`.
* **`released`** — an `attributed` claim nobody converted within the reservation window frees itself
  (swept daily by `GET /api/cron/coupon-sweep`), or an operator releases it by hand. A `redeemed`
  claim can never be released — that would misrepresent money that already changed hands as a
  reservation that quietly expired, so `releaseClaim()` refuses the transition outright.

Two windows govern this, and they are deliberately **not the same constant even though both happen
to equal 30 days today**:

| Constant | Clock it reads | Governs |
|---|---|---|
| `PLATFORM_CLAIM_RESERVATION_DAYS` | `attributed_at` | When an unconverted reservation releases its seat back to the coupon |
| `PLATFORM_DISCOUNT_WARNING_DAYS` | `discount_ends_at` | When `/admin`'s alert ladder starts saying anything at all |
| `PLATFORM_DISCOUNT_GRACE_DAYS` (14) | `discount_ends_at` | No-card coupons only: how long the ladder still reads "in grace" after the window closes, before "grace exhausted" |

Grace is messaging only. `resolveDiscountNotice()` (`billing/discount-notice.ts`) never produces a
grace state when a card is on file — Stripe's own dunning already retries a failed charge for weeks
and `isEntitled()` already counts `past_due` as entitled, so a second, product-level grace clock
would just disagree with the first one. Nothing in this codebase disables a storefront for
non-payment yet (§9 below), coupon-funded or otherwise — grace decides what the dashboard says, not
what the platform allows.

### Why `checkout.session.completed`, not `customer.subscription.created`

Stripe fires both events for a brand-new subscription. The redemption close-out
(`webhooks/stripe/_lib/platform-coupon-redemption.ts`) rides `checkout.session.completed`'s existing
platform-billing branch instead of adding a handler for the other event, for two reasons:

1. That handler already retrieves the subscription with `expand: ['discounts']` to populate the
   subscription mirror's intro-discount fields — reusing it costs no extra Stripe round trip.
2. The Checkout Session is where `owner_id` is set in metadata, and that is the exact
   owner-resolution the subscription-mirror write already trusts. Piggybacking means the redemption
   ledger and the subscription mirror can never attribute the same event to two different owners.

`customer.subscription.updated` (a later renewal, a plan change) is deliberately never wired to
this: `markRedeemed` only transitions `attributed → redeemed`, so a claim already `redeemed` treats a
repeat call as a no-op — there is no reason to pay for it on every renewal once the one call at
creation has closed the loop.

### Where the code went further than the plan

`docs/plans/platform-coupons.md` is the spec, and it is right about almost everything — but a few
places the shipped code went further on purpose, and the plan has been corrected to say so:

* **Economics are immutable outright**, not merely "once someone has redeemed" as the plan first
  specified. The moment `stripe_coupon_id` is set the Stripe object exists and Stripe coupons cannot
  be edited, so any window where our row could drift from it is a window that ends in a wrong price
  on a real invoice. `updatePlatformCoupon()` refuses `percentOff` / `durationMonths` /
  `collectPaymentMethod` in every patch — redeemed or not — naming the refusal
  `economics_immutable` rather than silently dropping the fields. A pre-redemption typo is fixed by
  deactivating the row and creating a new code.
* **`checkout.session.completed` is the event that closes the redemption**, not
  `customer.subscription.created` — see above. The plan's API surface (§9) says the webhook is
  "extended" without naming which event; this is the one that actually does it.
* **The two clocks live in their own dependency-free module**, `billing/coupon-windows.ts`, rather
  than being duplicated with an explanatory comment (which is how an earlier pass on this branch
  briefly left them). Both `coupon-claims.ts` (server-only; imports `pg` at module scope) and a
  client-rendered dashboard banner need the reservation window, and importing the server module from
  the client component would drag the Postgres driver into the browser bundle — the same shape of
  bug as the `JWT_SECRET` module-scope throw that once took the customizer's preview pane down. The
  fix is the same one applied there: put the constant somewhere with no dependencies at all.
* **The `/join` cookie's name and lifetime live in their own dependency-free module**,
  `src/app/api/onboarding/_lib/coupon-cookie.ts`, for the identical reason: `onboarding/_lib/state.ts`
  imports `session.ts`, which imports `jose`, so `/join/[code]` — a route that only needs to know
  what to call a cookie — was transitively pulling in the entire JWT stack merely to name it, and its
  own tests could run in neither Jest environment as a result.

---

## 9. What is NOT implemented yet

Being honest about the edges. Struck-through entries have since been fixed and are kept so the
list reads as a history rather than a moving target.

* **Tax is always zero.** `computeTaxCents()` returns `0`. Nothing computes, collects or remits tax.
  A merchant selling into a jurisdiction where they have nexus is under-collecting.
* **Shipping is a flat placeholder.** Three hardcoded rates, free standard over $50. No live rate
  shopping, no weight or destination sensitivity, no international rates.
* **US-only checkout.** The shipping form is US states + 5-digit ZIP, and Connect accounts default to
  `country: 'US'`.
* **No fulfilment hand-off.** A paid order is written with `status = 'processing'` and
  `fulfillment_status = 'unfulfilled'`. It is **not** pushed to ShipStation. The machinery now
  exists on the other side — `enqueueOrderPush` / `processOrderPushJob` in
  `src/lib/shipstation/orderPush.ts`, and a `shipstation_order_push` case in the job queue — but
  **nothing calls `enqueueOrderPush`**, so no order is ever queued. Wiring it into `createPaidOrder`
  is the missing link. See `src/lib/shipstation/CLAUDE.md`.
* **No refund UI.** `charge.refunded` is recorded when a refund is issued from the Stripe dashboard,
  but there is no in-app way to issue one, and a refund does not restock inventory.
* **No customer-facing receipt email from us.** Stripe's own receipt is the only email sent.
* **No entitlement enforcement.** `subscriptions.status` is recorded and displayed, but nothing yet
  disables a storefront whose merchant stopped paying.
* ~~Free orders are rejected.~~ **Fixed (2026-08-12).** A cart that prices to exactly zero skips
  Stripe entirely: the order is written synchronously in `POST /api/checkout/session` and the
  shopper goes straight to confirmation, regardless of whether the store has connected a payment
  account. A non-zero total below Stripe's $0.50 minimum still returns `AMOUNT_TOO_SMALL`.
* **Asynchronous payment methods are not handled.** Only card-style immediate payment is modelled;
  `checkout.session.async_payment_succeeded` / `_failed` have no handler, so a delayed method would
  complete checkout without producing an order.
* **Stock is checked, not reserved.** Inventory is verified when the session is created and re-checked
  under a row lock inside the order transaction, but it is not held during the Stripe redirect. Two
  shoppers can race for the last unit; the loser's payment succeeds and the order write fails loudly
  (the webhook returns 500, Stripe retries, and the event ends up `failed` in `webhook_events` for an
  operator to refund). There is no automatic refund.
* ~~The storefront coupon validate route joins a dropped `discounts` table.~~ **Fixed.**
  `POST /api/store/[storeId]/coupons/validate` no longer references it.
* **Single subscription per owner.** The model assumes one store per merchant, matching the current
  login flow. Multi-store owners are not modelled.
* **No proration or plan changes.** There is one plan; upgrades, downgrades and seat changes do not
  exist.
* **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unused.** The current flow is redirect-based Stripe
  Checkout; the key is documented for the embedded-Elements path that is not built.
* **A coupon cannot be applied to an already-active subscription.** It attaches at subscribe time
  only. Discounting someone already paying needs `subscriptions.update` with a discount and a
  proration decision — separate work, not built.
* **A no-card coupon's only route to a payment method is the `/admin` banner**, and that banner is
  the entire notification system for a coupon whose free window is closing — there is no
  transactional email in this repo. A merchant who never signs in during the last 30 days of a
  no-card coupon is never told, and the subscription lapses into unpayable dunning silently. See
  §8's redemption-lifecycle section and `docs/plans/platform-coupons.md` §13.
