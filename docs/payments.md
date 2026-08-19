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
| `checkout.session.completed` | A + B | Subscription mode → sync the subscription. Payment mode → create the order, items, inventory movement and coupon usage in **one transaction** |
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

# 2. Forward webhooks; this prints the signing secret to export
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

Money convention: Stripe-owned amounts are `INTEGER` cents; storefront amounts keep the existing
`NUMERIC(10,2)` convention used by `orders` / `order_items`. Conversion happens at the boundary in
`src/lib/billing/money.ts`.

Inventory note: inserting `order_items` fires the pre-existing
`update_inventory_on_order_item_insert` trigger, which decrements `products.stock_quantity` and
writes `inventory_logs`. `createPaidOrder()` therefore does **not** touch `products.stock_quantity`
(that would double-decrement) and instead decrements the untriggered `inventory.available` ledger.

---

## 8. What is NOT implemented yet

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
