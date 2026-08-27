# Stripe / Payments Integration

Scope: `src/lib/stripe/**`, `src/lib/billing/**`, `src/app/api/checkout/**`,
`src/app/api/billing/**`, `src/app/api/connect/**`, `src/app/api/webhooks/stripe`.

Read this before changing anything in that surface. `docs/payments.md` is the longer narrative
companion — the *why* behind the offer design, the integer-cent arithmetic, and the Stripe CLI
walkthrough. This file is the working contract: rules, the full API map, and what not to touch.

## The one idea that matters

There are **two entirely separate money flows**. They share exactly two things: one webhook endpoint
and one idempotency ledger. Everything else — Stripe mode, Stripe account, tables, entry points — is
deliberately kept apart. Do not merge a code path across them.

| | **Flow A — platform billing** | **Flow B — storefront checkout** |
|---|---|---|
| Who pays | The merchant | A shopper |
| Who gets paid | RebelShops | **The merchant** |
| Stripe mode | `subscription` | `payment` |
| Stripe account | Platform | Platform, charging **on behalf of** the merchant's connected account |
| Entry point | `POST /api/billing/checkout` | `POST /api/checkout/session` |
| Tables | `billing_customers`, `subscriptions` | `payment_accounts`, `checkout_sessions`, `orders`, `order_items` |
| Shared | `POST /api/webhooks/stripe`, `webhook_events` | ditto |

## Rules

1. **Money is computed on the server, always.** A `price` in a request body is ignored. Every total
   is derived from the `products` table by `repriceCart`, and `assertStripeAmountMatches` asserts
   the amount Stripe will charge equals the server total before the session is created. If you add
   a field a client can send that influences a total, you have introduced a pricing exploit.
2. **All money is integer cents in this codebase.** Convert at the boundary with
   `billing/money.ts`. Never do float arithmetic on money. (Note the asymmetry: ShipStation V2 money
   fields are decimal *dollars* — that conversion belongs in `src/lib/shipstation/`, not here.)
3. **Read the raw body before anything else in the webhook.** `await request.text()` first, because
   Stripe signs the exact bytes it sent. Never parse, log or middleware the body ahead of
   `constructStripeEvent`.
4. **Claim before you act.** Every event goes through `claimWebhookEvent` before any side effect. A
   repeat delivery must be a no-op.
5. **Unknown events return 200.** Stripe retries non-2xx. Acknowledge and ignore anything not in
   `HANDLED_EVENT_TYPES`.
6. **Never import the Stripe SDK at module scope for its side effects.** The app must build and
   render with no Stripe env vars set at all. Get a client from `getStripe()` (throws a typed
   `StripeNotConfiguredError`) or `tryGetStripe()` (returns `null`, so the UI can degrade to
   "payments not configured"). Every route in this surface must survive a missing key.
7. **Never hardcode a Stripe object id.** Product, price and coupon are resolved-or-created by
   `ensurePlatformPlan()` — env var, then lookup key / metadata search, then create. No id belongs
   to somebody's test account.
8. **Never let `STRIPE_API_VERSION` float.** It is pinned to match the `stripe@22.x` typings so the
   shapes the types describe are the shapes the API returns. Bumping it is a reviewed change.
9. **`server-only.ts` guards the boundary.** `assertServerOnly` exists because a secret key reaching
   a client bundle is unrecoverable. Do not route around it.
10. **Keep `HANDLED_EVENT_TYPES` and the event matrix in `docs/payments.md` in sync.** They drift
    silently otherwise.

## How the pieces fit

```
Flow A — platform billing ───────────────────────────────────────────────────
  /admin/billing → POST /api/billing/checkout
      → ensurePlatformPlan()            product + price + repeating intro coupon
      → stripe.checkout.sessions.create (mode: 'subscription', discounts: [{coupon}])
      → merchant pays on Stripe
      → webhook: customer.subscription.* / invoice.*  → subscriptions (mirror)
  POST /api/billing/portal → stripe.billingPortal.sessions.create  (card, invoices, cancel)
  GET  /api/billing/status → plan, price now, price later, next charge, configured?

Flow B — storefront checkout ────────────────────────────────────────────────
  /store/<slug>/checkout
      → POST /api/checkout/quote     server-authoritative preview, creates nothing
      → POST /api/checkout/session   repriceCart → stock check → coupon → totals
            total > 0  → stripe.checkout.sessions.create (mode: 'payment')
                         + on_behalf_of / transfer_data.destination when Connect is live
                         + application_fee_amount
                         → checkout_sessions row (server-priced snapshot)
            total == 0 → no Stripe at all; order written here, synchronously
      → shopper pays
      → webhook: checkout.session.completed → createPaidOrder()
            orders + order_items + inventory movement, one transaction
      → /store/<slug>/order-success → GET /api/checkout/confirm?session_id=...
            resolves against our tables, never the query string

Connect (payouts to merchants) ──────────────────────────────────────────────
  POST /api/connect/onboard  → accounts.create (Express) + accountLinks.create
  GET  /api/connect/return   ← Stripe redirect; refreshes and redirects into admin
  GET  /api/connect/refresh  ← Stripe redirect when a link expired; mints a new one
  GET  /api/connect/status   → local mirror, refreshed from Stripe when configured
  webhook: account.updated   → payment_accounts (capabilities are the only truth)
```

## Module map

| File | Owns | Do not |
|---|---|---|
| `stripe/client.ts` | Lazy SDK singleton, pinned API version, `isStripeConfigured`, typed not-configured error. | Construct `new Stripe(...)` anywhere else. Let the version float. |
| `stripe/server-only.ts` | The client-bundle guard. | Route around it. |
| `stripe/products.ts` | `PLATFORM_PLAN` definition, `ensurePlatformProduct`. | Hardcode ids. |
| `stripe/prices.ts` | Resolve-or-create for price and intro coupon; `ensurePlatformPlan`. | Assume the objects exist. |
| `stripe/discounts.ts` | One-time `duration: 'once'`, `max_redemptions: 1` coupons for storefront discounts. | Reuse a coupon across sessions. |
| `stripe/platform-coupons.ts` | Resolve-or-create for one platform signup coupon (flow A, `docs/plans/platform-coupons.md`): `ensureStripeCouponFor`, `describeStripeCouponFor`, `deriveSubscriptionParams`. | Set `max_redemptions` on the Stripe object — the redemption ledger enforces the cap. Reuse a coupon whose economics disagree with its row — throw instead. |
| `stripe/connect.ts` | Express account create, account/dashboard links, capability summary. | Treat "returned from onboarding" as "onboarded" — read capabilities. |
| `stripe/webhooks.ts` | Raw-body read, signature construction, handler dispatch, `HANDLED_EVENT_TYPES`. | Read the payload before the signature verifies. |
| `billing/auth.ts` | `requireMerchant` — the session gate for every billing/connect **API** route. The two browser-redirect routes (`/api/connect/return`, `/api/connect/refresh`) cannot use it and deliberately trust nothing. | Skip it on an API route. Trust a redirect as proof of anything. |
| `billing/money.ts` | Cents conversion and formatting. | Do money math outside it. |
| `billing/cart.ts` | `repriceCart`, `assertStockAvailable`. The server's pricing truth. | Trust a client price. |
| `billing/cart-pricing.ts` | Subtotal/shipping/tax, Stripe line items, `assertStripeAmountMatches`. | Let a total reach Stripe unasserted. |
| `billing/coupons.ts` | Storefront coupon validation and discount arithmetic. | |
| `billing/intro-offer.ts` | The $1 × 3 months → $19.99 offer, in integer cents. | Re-derive the numbers inline. |
| `billing/checkout-sessions.ts` | The server-priced snapshot the webhook consumes. | Recompute prices in the webhook. |
| `billing/orders.ts` | `createPaidOrder` — order + items + inventory, one transaction. `recordRefund`. | Split it across transactions. |
| `billing/payment-accounts.ts` | Connect mirror, `computeApplicationFeeCents`. | |
| `billing/subscriptions.ts` | Subscription mirror, `isEntitled`, invoice outcomes. | |
| `billing/webhook-events.ts` | The idempotency ledger: claim / handled / failed. | Act before claiming. |

## Outbound API surface (Stripe SDK)

Every call in the codebase, and where it lives:

| Call | Module | Flow |
|---|---|---|
| `products.search` / `products.retrieve` / `products.create` | `stripe/products.ts` | A |
| `prices.list` / `prices.retrieve` / `prices.create` | `stripe/prices.ts` | A |
| `coupons.retrieve` / `coupons.create` | `stripe/prices.ts` (intro, repeating) | A |
| `coupons.create` | `stripe/discounts.ts` (one-time, storefront) | B |
| `coupons.retrieve` / `coupons.create` | `stripe/platform-coupons.ts` (signup coupon, repeating/forever) | A |
| `customers.create` | `api/billing/checkout/route.ts` | A |
| `checkout.sessions.create` | `api/billing/checkout/route.ts` (mode `subscription`) | A |
| `checkout.sessions.create` | `api/checkout/session/route.ts` (mode `payment`) | B |
| `checkout.sessions.retrieve` | `api/checkout/confirm/route.ts` | B |
| `subscriptions.retrieve` | `api/webhooks/stripe/route.ts` (two handlers) | A |
| `subscriptions.list` | `api/billing/status/route.ts` | A |
| `billingPortal.sessions.create` | `api/billing/portal/route.ts` | A |
| `accounts.create` / `accounts.retrieve` / `accounts.createLoginLink` | `stripe/connect.ts` | Connect |
| `accountLinks.create` | `stripe/connect.ts` | Connect |
| `webhooks.constructEvent` | `stripe/webhooks.ts` | both |

That is the complete list. Every other module in this surface reaches Stripe through one of these,
or not at all — `billing/checkout-sessions.ts`, for instance, only reads and updates our own
snapshot rows, and never calls Stripe.

## Inbound API surface (ours)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/webhooks/stripe` | Stripe signature | The only webhook endpoint, for both flows. |
| POST | `/api/billing/checkout` | `requireMerchant` | Subscription Checkout Session with the intro coupon. |
| POST | `/api/billing/portal` | `requireMerchant` | Billing Portal URL. Cancellation happens entirely in Stripe. |
| GET | `/api/billing/status` | `requireMerchant` | Plan, price now, price later, next charge, `configured`. Never throws on a missing key. |
| POST | `/api/checkout/quote` | public | Server-authoritative pricing preview. Same logic as `session`, creates nothing. |
| POST | `/api/checkout/session` | public | The storefront charge. Free carts complete here without Stripe. |
| GET | `/api/checkout/confirm?session_id=` | public | Resolves the session against our tables; consults Stripe only to tell "paid, webhook pending" from "never paid". |
| POST | `/api/connect/onboard` | `requireMerchant` | Create/reuse the Express account, mint a fresh Account Link. |
| GET | `/api/connect/status` | `requireMerchant` | Payout capability, refreshed from Stripe when configured. |
| GET | `/api/connect/return` | browser redirect (no bearer) | Post-onboarding landing. Refreshes, then redirects into admin. |
| GET | `/api/connect/refresh` | browser redirect (no bearer) | Account Links are single-use; mints a replacement. |

`/api/connect/return` and `/api/connect/refresh` are browser navigations, so they cannot require the
bearer token the API routes use. That is intentional; neither one trusts its own invocation as proof
of anything.

## Webhook events

Handled (`HANDLED_EVENT_TYPES` in `stripe/webhooks.ts`). Everything else → 200, ignored.

| Event | Flow | Effect |
|---|---|---|
| `checkout.session.completed` | both | Branches first: `metadata.flow === 'platform_billing'` or `mode === 'subscription'` → sync the subscription and return. Otherwise flow B — requires `payment_status === 'paid'`, then `createPaidOrder` writes order, items and the inventory movement in one transaction. |
| `checkout.session.expired` | B | Marks the `checkout_sessions` row expired. |
| `customer.subscription.created` / `.updated` | A | `upsertSubscriptionFromStripe`. |
| `customer.subscription.deleted` | A | `markSubscriptionCanceled`. |
| `invoice.paid` / `invoice.payment_failed` | A | `recordInvoiceOutcome`. |
| `account.updated` | Connect | `savePaymentAccountStatus`. |
| `charge.refunded` | B | `recordRefund`. Does **not** restock inventory. |

## The intro offer

$1/month for 3 months, then $19.99/month. Represented as a **repeating Coupon**
(`amount_off: 1899`, `duration: 'repeating'`, `duration_in_months: 3`) on a `unit_amount: 1999`
monthly price — not a subscription schedule. `docs/payments.md` §1 explains why; do not "simplify"
it into a schedule without reading that.

Constants live in `billing/intro-offer.ts` (`PLATFORM_LIST_AMOUNT_CENTS`,
`PLATFORM_INTRO_AMOUNT_CENTS`, `PLATFORM_INTRO_MONTHS`). Derive from those in code; never inline a
literal. The figures above are documentation, and will go stale before the constants do.

## Connect and fees

Storefront charges settle to the merchant via `on_behalf_of` + `transfer_data.destination`. The
platform take is `application_fee_amount`, computed by `computeApplicationFeeCents` from the store's
`payment_accounts.application_fee_bps` (default from `STRIPE_APPLICATION_FEE_BPS`), clamped so the
fee can never exceed the charge.

When a store has no connected account with charges enabled — the normal state in local development —
the charge falls back to platform-direct and **the response says so**. Do not make this silent.

## Free ($0) orders

A cart that prices to zero — a free product, or a coupon covering the cart plus free shipping —
never touches Stripe. The order is written synchronously in `POST /api/checkout/session` and the
shopper goes straight to confirmation. This path deliberately ignores whether the store has
connected a payment account: refusing a giveaway because nobody wired up card processing is a bug,
not a safeguard.

A non-zero total below Stripe's $0.50 minimum is a different case and still returns
`AMOUNT_TOO_SMALL`.

## Data model

| Table | Flow | Role |
|---|---|---|
| `billing_customers` | A | Store owner → Stripe Customer. |
| `subscriptions` | A | Mirror of the platform subscription. `status` drives `isEntitled`. |
| `payment_accounts` | Connect | Per-store connected account, capabilities, `application_fee_bps`. |
| `checkout_sessions` | B | Server-priced snapshot the webhook consumes instead of recomputing. |
| `orders` / `order_items` | B | Written by `createPaidOrder`, one transaction with the inventory movement. |
| `webhook_events` | both | Idempotency ledger. `event_id` unique; duplicate delivery is a no-op. |
| `coupons` | B | Storefront discount codes, converted to one-time Stripe Coupons at checkout. |

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | For any payment | Absent → every route degrades to "not configured", nothing throws. |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | Per-endpoint, per-environment. Use the value Stripe shows for that endpoint. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Not functionally required today | The flow is redirect-based Checkout, so nothing publishable-key-dependent runs in the browser. Only `isStripePubliclyConfigured()` reads it, and that helper is exported but currently uncalled. Reserved for an embedded-Elements path that is not built. |
| `STRIPE_PLATFORM_PRODUCT_ID` | Optional | Pins the product instead of resolving it. |
| `STRIPE_PLATFORM_PRICE_ID` | Optional | Pins the price. |
| `STRIPE_INTRO_COUPON_ID` | Optional | Pins the intro coupon; defaults to `rebelshops-intro-3mo`. |
| `STRIPE_APPLICATION_FEE_BPS` | Optional | Default platform take rate in basis points. |
| `NEXT_PUBLIC_APP_URL` | Yes | Success/cancel/return URLs. |

## Testing

- `src/lib/stripe/__tests__/webhooks.test.ts` — signature, dispatch, unknown-event handling.
- `src/lib/stripe/__tests__/connect.test.ts` — `business_profile.url` omitted for non-resolvable
  origins, `deriveOnboardingStatus` lifecycle ordering, and the `next=` return-path allowlist. All
  three cover bugs that reached production and were only found by running a real onboarding.
- `src/lib/billing/__tests__/` — `cart`, `cart-pricing`, `coupons`, `intro-offer`, `webhook-events`.
- Local end-to-end with the Stripe CLI: `docs/payments.md` §6 has the full script, including the
  idempotency proof (resend one event id twice; expect `{"received":true,"duplicate":true}` and
  exactly one order).
- Test card `4242 4242 4242 4242`, any future expiry, any CVC.

## Known gaps

Re-verified against the code, and kept in step with `docs/payments.md` §8. Struck-through entries
have since been fixed and are kept so the list reads as history.

- **Tax is always zero.** `computeTaxCents()` returns `0`. Nothing computes, collects or remits tax.
- **Shipping is a flat placeholder.** Three hardcoded rates, free standard over $50. No live rates,
  no weight or destination sensitivity.
- **US-only checkout.** US states + 5-digit ZIP; Connect accounts default to `country: 'US'`.
- **No fulfilment hand-off.** `orderPush.enqueueOrderPush` exists in the ShipStation library and
  `jobQueueService` can run `shipstation_order_push` jobs — but **nothing calls `enqueueOrderPush`**,
  so a paid order is never pushed. Wiring it into `createPaidOrder` is the missing link.
- **No refund UI.** `charge.refunded` is recorded when a refund is issued from the Stripe dashboard;
  there is no in-app way to issue one, and a refund does not restock.
- **No entitlement enforcement.** `subscriptions.status` is recorded and displayed; nothing disables
  a storefront whose merchant stopped paying.
- **Async payment methods unmodelled.** No handler for
  `checkout.session.async_payment_succeeded` / `_failed`, so a delayed method would complete
  checkout without producing an order.
- **Stock is checked, not reserved.** Verified at session creation and re-checked under a row lock
  in the order transaction, but not held during the Stripe redirect. Two shoppers can race for the
  last unit; the loser's payment succeeds, the order write fails loudly, the event lands `failed`
  in `webhook_events` for an operator. There is no automatic refund.
- **Single subscription per owner; no proration or plan changes.** One plan, one store per merchant.
- ~~Free orders are rejected~~ — **fixed.** See [Free ($0) orders](#free-0-orders).
- ~~The storefront coupon validate route joins a dropped `discounts` table~~ — **fixed.**
  `POST /api/store/[storeId]/coupons/validate` no longer references it.
