# Plan: platform signup coupons

**Status:** proposed, not built. Nothing in this document exists in the codebase yet.
**Goal:** hand a friend a link, they sign up, they get a year free, and the operator console can
show who used what.

---

## 1. What this is, and what it is not

RebelShops already has a table called `coupons`. It is not this feature and must not be extended
into it.

| | `coupons` (exists) | `platform_coupons` (this plan) |
|---|---|---|
| Money flow | **B** — storefront checkout | **A** — platform billing |
| Who is discounted | A shopper buying from a merchant | A **merchant** subscribing to RebelShops |
| Who loses the money | The merchant | RebelShops |
| Scoped by | `store_id` | Nothing — it is platform-wide by definition |
| Stripe shape | One-time coupon, `duration: 'once'`, `max_redemptions: 1`, created per checkout session (`stripe/discounts.ts`) | Long-lived coupon, `duration: 'repeating'` or `'forever'`, created once per code (`stripe/prices.ts` pattern) |
| Admin surface | `/admin/coupons` — a merchant editing their own discount codes | `/platform/coupons` — the operator issuing signup offers |

The same word means two unrelated things, so every new identifier in this feature carries the
`platform` prefix. `/admin/coupons` is not touched. `src/lib/billing/coupons.ts` is not touched.

**The console surface belongs at `/platform`, not `/admin`.** The request said "our admin portal",
but `/admin` is the *merchant's* portal — one `store_id`, gated by an ordinary session. Issuing a
coupon that costs RebelShops money is an operator action, and the operator's console is `/platform`,
gated by `users.is_admin` re-read on every request. See `docs/platform-admin.md`.

---

## 2. The coupon model

One table, two behaviours, no `kind` enum. What the request calls "one-time" and "multi-use" is a
single nullable integer:

| `max_redemptions` | Behaviour |
|---|---|
| `1` | One-time coupon. Burns on first redemption. |
| `N` | Multi-use, capped at N. |
| `NULL` | Multi-use, uncapped. |

The benefit is two fields, and they compose into everything asked for:

| Field | Meaning |
|---|---|
| `percent_off` | 1–100. `100` is "free". |
| `duration_months` | How many monthly invoices the discount covers. `NULL` = forever. |

- **"One year free"** → `percent_off = 100`, `duration_months = 12`.
- **"Half price for six months"** → `percent_off = 50`, `duration_months = 6`.
- **"Free forever" (comp account)** → `percent_off = 100`, `duration_months = NULL`.

This is deliberately *not* two independent knobs ("months free" **and** "percent off"). A coupon
that is free for 3 months and then 50% off for another 6 is two discounts on one subscription, which
Stripe does not model as a coupon and which the `subscriptions` mirror has no columns for. If that
offer is actually wanted, it is a follow-up that introduces Stripe subscription schedules — see
§13, question 2.

Percentage rather than amount-off, on purpose. The list price is a single `$19.99` constant
(`PLATFORM_LIST_AMOUNT_CENTS`); a percentage survives a price change, a fixed `amount_off` silently
becomes a different offer the day the price moves. The existing intro coupon uses `amount_off` and
`stripe/prices.ts` has to throw when the stored coupon disagrees with the catalogue — that guard
exists because `amount_off` is brittle. Do not repeat it here.

---

## 3. How this lands in Stripe

Our database is the truth for **eligibility and counting**. Stripe is the truth for **money**.
Neither is asked to do the other's job.

Each `platform_coupons` row resolves, lazily and idempotently, to exactly one Stripe Coupon:

```
percent_off: <percent_off>
duration:    duration_months IS NULL ? 'forever' : 'repeating'
duration_in_months: <duration_months>          -- omitted when forever
name:        <coupon name>
metadata:    { managed_by: 'rebelshops', scope: 'platform_signup',
               platform_coupon_id: <uuid>, code: <code> }
```

Three rules, each of which prevents a specific way this goes wrong:

1. **No `max_redemptions` on the Stripe coupon.** Setting it would create a second counter that
   drifts from our ledger the first time a checkout session is abandoned after the discount was
   attached. Our redemption ledger gates; Stripe only prices.
2. **Never delete a Stripe coupon.** Deleting one *ends the discount on every subscription still
   using it*. Deactivating a code in our table stops new redemptions and touches nobody already on
   it. There is no "delete" in the console, only "deactivate".
3. **Resolve-or-create, keyed on our UUID.** Same pattern as `ensureIntroCoupon`, with one
   difference: this coupon must never be *reused* if its economics changed, because unlike the
   single platform plan there can be hundreds of these. Store `stripe_coupon_id` on the row once
   created, and make `percent_off` / `duration_months` immutable after the first redemption
   (§10, invariant 5).

### The one hard constraint, already discovered the hard way

`src/app/api/billing/checkout/route.ts` carries this comment:

> `allow_promotion_codes` is deliberately absent. Stripe rejects a session that carries it alongside
> `discounts` […] it rejects on the parameter being *present*, so passing `false` fails exactly like
> passing `true`.

So the "enter a coupon code at billing" box **cannot** be Stripe Checkout's own promotion-code
field. It has to be our input, on our page, validated by our API, resolved to a coupon id, and
passed in `discounts: [{ coupon }]`.

This is the better design anyway — it is the only way the code entered at billing and the code that
arrived via a link go through one validator — but it is not a choice, so do not "simplify" it back
to `allow_promotion_codes` later. That path is closed.

### A platform coupon replaces the intro offer

A subscription gets one discount. `$1 × 3 months` and `100% off × 12 months` cannot both apply, and
economically nobody would want them to. Precedence at checkout, highest first:

1. A code typed into the billing page in this request.
2. A coupon attributed to this user at signup (§5).
3. The standard intro offer.

`GET /api/billing/status` must say **which** one is live and stop describing every discount as "the
intro offer". Today it hardcodes that vocabulary.

### A bug this feature walks into

`readIntroDiscount()` in `src/lib/billing/subscriptions.ts` has a branch for a coupon that arrives
as an unexpanded string id:

```ts
const isKnownIntroCoupon = rawCoupon === resolveIntroCouponId();
return { …, months: isKnownIntroCoupon ? PLATFORM_INTRO_MONTHS : 0, amountOff: … };
```

Any coupon that is not *the* intro coupon records `months: 0` and `amountOff: null`. The upsert then
writes `intro_ends_at = NULL`, and `/admin/billing` shows a merchant on a free year no end date and
a wrong "next charge". The webhook does pass `expand: ['discounts']`, which usually means the coupon
arrives as an object — but the string branch exists because it happens, and
`GET /api/billing/status` calls `subscriptions.list` with no expansion at all.

**Fix as part of this work, not after:** in the string branch, look the id up in
`platform_coupons.stripe_coupon_id` before falling through, and add `expand` to the status route's
list call. This is in the plan because it is the difference between the feature working and the
feature looking like it works.

---

## 4. The three surfaces

### A. The link — `/join/<CODE>`

A Route Handler, not a page. It validates, sets a cookie, and redirects into the wizard:

```
GET /join/FRIENDS12
  ├─ valid   → Set-Cookie: rs_platform_coupon=FRIENDS12 (httpOnly, lax, 30d)
  │            302 → /create-store?coupon=FRIENDS12
  └─ invalid → 302 → /create-store?coupon_error=expired|unknown|exhausted|inactive
```

Why a cookie and not just the query string: onboarding is a multi-step wizard with a server-side
state row, the merchant may close the tab and come back, and the marketing site may bounce them
through `/pricing` on the way. A query parameter survives none of that. The cookie is `httpOnly`
so a stray script cannot read which offer someone is on, and it is a **hint, never an entitlement** —
every attach re-validates the code server-side. It carries the code, not a claim.

Why the failure redirects instead of 404ing: a friend clicking a dead link should still be able to
sign up, and should be *told* the link is dead rather than quietly charged the normal price. The
wizard renders the reason. Silently dropping the discount is the exact class of bug `CLAUDE.md`
calls out under **Honest results**.

The pricing page should read the same cookie and quote the discounted price. A merchant who is
promised a free year by a link and then shown `$1 for 3 months, then $19.99` on `/pricing` has
already been told two different things before they reach a form.

### B. The code box at billing — `/admin/billing`

A "Have a coupon code?" field, collapsed by default.

- `POST /api/billing/coupon/preview` — validates and describes. **Writes nothing.** Returns the
  human sentence ("Free for 12 months, then $19.99/month") so the merchant sees the offer before
  committing.
- `POST /api/billing/checkout { couponCode }` — attaches it to the Checkout Session.

Two endpoints because a preview that silently consumed a single-use coupon would burn it on a
typo-and-retry.

### C. The operator console — `/platform/coupons`

Two tabs, exactly as requested:

**Coupons** — list, filterable by active/expired/exhausted. Each row: code, name, offer sentence,
redeemed / limit, expiry, who created it. Actions: create, copy link, deactivate. Detail view lists
that coupon's redemptions.

**Redemptions** — every redemption across every coupon, newest first: who, which store, which
coupon, attributed vs redeemed, when the discount ends, subscription status. This is the tab that
answers "did my friends actually sign up", which is the point of the whole feature.

Both figures exclude `is_demo` stores by default, with `?includeDemo=1`, like every other number in
that console.

**This is the first write surface in `/platform`.** The console has been read-only, which is why
`recordAdminAction` is documented as best-effort — "a lost row loses the record of a *view*, not of
a change". That reasoning stops holding the moment an operator can issue a coupon. For mutating
routes the audit write goes **inside the same transaction** as the change, and a failed audit write
fails the request.

---

## 5. Attributed, then redeemed

The request says "record in the database what coupon was used when a user signs up". Signup and
subscription are different moments, and collapsing them breaks single-use coupons: a friend who
starts signing up, gets distracted, and never subscribes would permanently consume a one-time code.

So a redemption has three states:

```
              signup with a code            subscription created with the coupon
  (none) ───────────────────────► attributed ──────────────────────────────► redeemed
                                      │
                                      │ never subscribed within N days,
                                      │ or the merchant subscribed without it,
                                      │ or an operator releases it
                                      ▼
                                   released
```

| State | Written when | Counts against `max_redemptions`? |
|---|---|---|
| `attributed` | `POST /api/onboarding/account` succeeds with a valid code in the cookie | **Yes** — it is a reservation |
| `redeemed` | Stripe confirms a subscription carrying that coupon (webhook) | Yes |
| `released` | Reservation expires, or an operator releases it | No |

A reservation holds capacity so two people cannot both be told they have the last seat on a
single-use code. Expiry (default 30 days, a constant, not a literal) is swept by the existing cron
route alongside the other jobs — `vercel.json` already declares `crons`.

`released` rather than deleting the row: "this code was clicked 40 times and redeemed twice" is the
number that tells you whether the campaign worked. Deleting the misses destroys it.

---

## 6. Schema — migration `042_platform_coupons.sql`

Next free number is 042 (040 is used twice already, 041 is the demo flag).

```sql
CREATE TABLE platform_coupons (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               VARCHAR(48)  NOT NULL,          -- as issued, for display
  code_normalized    VARCHAR(48)  NOT NULL,          -- upper(trim(code)); the lookup key
  name               VARCHAR(120) NOT NULL,          -- "Launch friends, 1 year"
  notes              TEXT,                           -- "given to Dave at the meetup"
  percent_off        SMALLINT     NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  duration_months    SMALLINT     CHECK (duration_months IS NULL OR duration_months > 0),
  max_redemptions    INTEGER      CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count     INTEGER      NOT NULL DEFAULT 0,   -- rollup, trigger-maintained
  redeem_by          TIMESTAMPTZ,                       -- link stops working
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  stripe_coupon_id   VARCHAR(255),                      -- resolved lazily, then fixed
  created_by         UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_platform_coupons_code ON platform_coupons (code_normalized);
CREATE INDEX idx_platform_coupons_active ON platform_coupons (is_active) WHERE is_active;

CREATE TABLE platform_coupon_redemptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id              UUID NOT NULL REFERENCES platform_coupons (id) ON DELETE RESTRICT,
  user_id                UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store_id               UUID REFERENCES stores (id) ON DELETE SET NULL,
  status                 VARCHAR(16) NOT NULL
                           CHECK (status IN ('attributed', 'redeemed', 'released')),
  source                 VARCHAR(16) NOT NULL
                           CHECK (source IN ('link', 'billing_form', 'operator')),
  attributed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at            TIMESTAMPTZ,
  released_at            TIMESTAMPTZ,
  release_reason         VARCHAR(64),
  stripe_subscription_id VARCHAR(255),
  stripe_coupon_id       VARCHAR(255),
  discount_ends_at       TIMESTAMPTZ,       -- when the free window closes; NULL = forever
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live claim per user per coupon, and one live claim per user overall.
CREATE UNIQUE INDEX idx_pcr_one_per_user_per_coupon
  ON platform_coupon_redemptions (coupon_id, user_id) WHERE status <> 'released';
CREATE UNIQUE INDEX idx_pcr_one_live_per_user
  ON platform_coupon_redemptions (user_id) WHERE status <> 'released';
CREATE INDEX idx_pcr_coupon_time ON platform_coupon_redemptions (coupon_id, attributed_at DESC);
CREATE INDEX idx_pcr_time ON platform_coupon_redemptions (attributed_at DESC);
```

`ON DELETE RESTRICT` on `coupon_id` is the schema saying what §3 rule 2 says in prose: a coupon with
history cannot be deleted, only deactivated.

**The limit is enforced by trigger, not by call sites.** A `BEFORE INSERT` on the redemption table
takes `SELECT … FOR UPDATE` on the coupon row, counts live claims, and raises when the insert would
exceed `max_redemptions`. Two friends clicking the same one-time link in the same second is exactly
the race a read-then-write check loses. This repo already treats concurrency invariants as the
database's job — migrations 029 (`single_stock_writer`) and 030 (`stock_invariants`) — and
`npm run db:verify` runs them as behaviour. Add these there.

`redeemed_count` is a rollup maintained by an `AFTER INSERT OR UPDATE` trigger, with a
`rebuild_platform_coupon_counts()` function for when it is suspected of drifting — the same shape as
`rebuild_storefront_click_daily()`.

No change to `subscriptions`. Its `intro_coupon_id` / `intro_months` / `intro_ends_at` columns
already describe "whatever discount is live"; the redemption ledger owns the link back to our
coupon. The column names become slightly wrong — a naming debt to write down, not a rename to
attempt in the middle of this.

---

## 7. Modules to add

| File | Owns |
|---|---|
| `src/lib/billing/platform-coupons.ts` | Pure model: normalisation, `describePlatformCoupon()` (the offer sentence), validity predicates. No Stripe, no database — unit-testable like `intro-offer.ts`. |
| `src/lib/platform/coupons.ts` | Persistence and the operator's reads: create, deactivate, list, redemption list. Owns the vocabulary (`attributed`, `redeemed`, `released`) the way `platform/customers.ts` owns "received". |
| `src/lib/billing/coupon-claims.ts` | The lifecycle: `attributeCoupon`, `markRedeemed`, `releaseExpired`, `resolveActiveClaim`. Every state transition, one place. |
| `src/lib/stripe/platform-coupons.ts` | `ensureStripeCouponFor(row)` — resolve-or-create. Mirrors `stripe/prices.ts`; **must not** live in `stripe/discounts.ts`, which is flow B. |
| `src/lib/billing/coupon-codes.ts` | Code generation: `crypto.randomBytes`, Crockford-ish alphabet with `0/O/1/I/L` removed. |

Update: `stripe/CLAUDE.md` (module map, outbound call table, data model, event matrix),
`docs/payments.md`, `docs/platform-admin.md`, `docs/decision-log.md`, `.env.example` if a variable
appears, `README.md`.

---

## 8. API surface

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/join/[code]` | public | Validate, set cookie, redirect into the wizard. |
| POST | `/api/billing/coupon/preview` | `requireMerchant` | Describe a code. Writes nothing. |
| POST | `/api/billing/checkout` | `requireMerchant` | **Extended** with optional `couponCode`. |
| GET | `/api/billing/status` | `requireMerchant` | **Extended**: which discount is live, and its end date. |
| GET | `/api/platform/coupons` | `requirePlatformAdmin` | List, with counts. |
| POST | `/api/platform/coupons` | `requirePlatformAdmin` | Create. Audited in-transaction. |
| PATCH | `/api/platform/coupons/[id]` | `requirePlatformAdmin` | Deactivate, rename, edit notes. Never the economics. |
| GET | `/api/platform/coupons/redemptions` | `requirePlatformAdmin` | The redemptions tab. |
| POST | `/api/onboarding/account` | public | **Extended**: attribute the cookie's code after the user row is written. |
| POST | `/api/onboarding/store` | public | **Extended**: backfill `store_id` on the claim. |
| POST | `/api/webhooks/stripe` | signature | **Extended**: `attributed` → `redeemed`. |
| GET | `/api/cron/*` | cron secret | **Extended**: release expired reservations. |

`/join/[code]` and `/api/billing/coupon/preview` are the two places an attacker can guess codes.
Both need rate limiting by IP, and generated codes need enough entropy that guessing is worse than
pointless. A code worth twelve months of product is not a public identifier.

---

## 9. Build order

Each phase leaves the tree green and shippable.

| # | Phase | Contains |
|---|---|---|
| 1 | **Schema and model** | Migration 042, triggers, `db:verify` invariants, `billing/platform-coupons.ts`, `coupon-codes.ts` + unit tests. No UI, no Stripe. |
| 2 | **Stripe resolution** | `stripe/platform-coupons.ts`, resolve-or-create, degrades cleanly with no `STRIPE_SECRET_KEY`. |
| 3 | **Operator console** | `/platform/coupons`, both tabs, create + deactivate + copy-link. Coupons exist and are visible before anything can redeem one. |
| 4 | **The link** | `/join/[code]`, the cookie, wizard banner (success *and* the honest failure), attribution at account creation, `store_id` backfill. |
| 5 | **Billing attach** | Preview endpoint, the code box on `/admin/billing`, `couponCode` on checkout, precedence, `billing/status` vocabulary, **the `readIntroDiscount` fix**. |
| 6 | **Redemption close-out** | Webhook `attributed` → `redeemed`, `discount_ends_at`, reservation sweep on cron, redemption tab shows live subscription status. |
| 7 | **Docs and polish** | Every doc in §7, pricing-page quoting, `/admin/billing` showing when the free window ends. |

Phases 1–3 are shippable on their own and let coupons be issued and tracked by hand before any
customer-facing path exists.

---

## 10. Invariants

Things that must hold, listed so a reviewer has something to check against.

1. **`max_redemptions` is enforced in the database**, under a row lock, not by a read-then-write in
   a route.
2. **One live claim per user.** Enforced by partial unique index.
3. **A coupon replaces the intro offer, never stacks with it.** One discount reaches Stripe.
4. **The cookie is a hint.** Every attach re-validates against the database. A forged cookie gets
   the standard price, not a free year.
5. **Economics are immutable after first redemption.** `percent_off` and `duration_months` cannot be
   edited once anyone has redeemed — the Stripe coupon behind them cannot be edited either, and a
   row that disagrees with its Stripe object is a wrong price on a real invoice.
6. **Deactivation never claws back an active discount.** It stops new redemptions. The Stripe coupon
   is never deleted.
7. **A failed coupon never becomes a silent full-price signup.** The wizard and the billing page say
   what happened.
8. **Money stays integer cents.** Percentages are integers; any derived amount goes through
   `billing/money.ts`.
9. **Nothing here throws with Stripe unconfigured.** Coupons can be created and listed with no
   `STRIPE_SECRET_KEY`; only redemption needs Stripe, and it degrades with a labelled state.
10. **The operator console excludes demo stores** unless `?includeDemo=1`.
11. **Mutating platform routes audit inside the transaction.**
12. **A code is never logged in full** on a public-facing error path.

---

## 11. Testing

Unit (`__tests__/` beside the source):

- `platform-coupons.test.ts` — offer sentences, validity windows, normalisation, the boundary cases
  (`percent_off = 100`, `duration_months = NULL`).
- `coupon-codes.test.ts` — alphabet excludes ambiguous characters, entropy, no collisions over a
  large sample.
- `coupon-claims.test.ts` — the state machine, including illegal transitions.

Database behaviour (`npm run db:verify`):

- Concurrent attributions against a `max_redemptions = 1` coupon: exactly one succeeds.
- Second live claim for one user: rejected.
- Deleting a coupon with history: rejected.
- `rebuild_platform_coupon_counts()` reproduces the trigger's numbers.

E2E (`tests/e2e/`, Chromium only in a session container):

- `/join/<valid>` → wizard shows the offer → account created → redemption row is `attributed`.
- `/join/<expired>` → wizard shows the honest failure and signup still works at full price.
- `/platform/coupons` renders for an admin, 403s for a merchant.

The CI story in `CLAUDE.md` is blunt about why this matters: a green unit suite does not mean the
app renders. The wizard banner and the console tabs are exactly the kind of thing that passes 922
unit tests and is blank in a browser.

---

## 12. Known limits of this design

Written down rather than discovered later.

- **A coupon cannot be applied to an already-active subscription.** It attaches at subscribe time.
  Giving a code to someone already paying needs `subscriptions.update` with a discount and a
  proration decision, which is a separate piece of work.
- **`duration_in_months` may have an upper bound in the Stripe API.** Verify 12 works against a real
  test account in phase 2 before building the console around it. If it is capped below 12, the
  fallback is `duration: 'forever'` plus a scheduled removal, which is materially more machinery.
- **A free year does not currently gate anything.** `stripe/CLAUDE.md` lists "No entitlement
  enforcement" as a known gap: nothing disables a storefront whose merchant stopped paying. So the
  coupon's real effect today is on the invoice and on the merchant's perception, not on access.
- **No email tells anyone the free year is ending.** There is no transactional email system in this
  repo. Phase 7 surfaces the end date on `/admin/billing`, which is the most that can be done
  without one.
- **One subscription per owner, one store per merchant** — the existing constraint. A coupon does
  not change it.

---

## 13. Questions before building

**1. Is a card required at signup for a free year?**
This is the most consequential question in the document, and it decides the shape of phase 5.

- *Card collected up front* (recommended): Stripe Checkout in `subscription` mode with a 100%-off
  coupon still collects a payment method. Twelve $0 invoices, then it charges automatically. The
  risk is that a card stored today is often expired in twelve months — Stripe's card updater
  handles a re-issued card but not a closed account.
- *No card* (`trial_period_days: 365`, `payment_method_collection: 'if_required'`): a genuinely
  frictionless signup, and near-total churn at month twelve because there is nothing to charge and
  no email system to warn anyone.

My recommendation is to collect the card, and to make the offer sentence unambiguous about it:
*"Free for 12 months. We take your card now and charge nothing until <date>."*

**2. Do you want offers that change over time** — three months free, *then* 50% off for six? That
is the reading of "months free **and** percentage" that this plan does not support. It needs Stripe
subscription schedules, and it roughly doubles phase 2 and 5. My guess is you meant one discount
configured two ways, which is what §2 builds. Confirm.

**3. What stops one friend claiming a multi-use code five times?** The plan enforces one live claim
per **user**, but signing up again with a different email is trivial. Options: leave it (these go to
people you know); cap per email domain; require the operator to mark a redemption as valid before
the discount attaches. I would leave it and watch the redemptions tab — that tab is the control.

**4. Should the reservation expire, and after how long?** The plan says 30 days. If you would rather
a single-use link stay claimed forever once clicked, that is a one-constant change, but it means a
friend who abandons signup silently burns their code.

**5. Should `/pricing` and the marketing site honour the cookie?** I think yes, and it is cheap once
the cookie exists — otherwise the link promises a free year and the first page they land on quotes
`$1 for 3 months, then $19.99`.

---

## 14. Things worth adding that were not asked for

Ordered by what I think the value is per hour of work.

1. **`notes` and `created_by` on every coupon.** Six months from now "who was `FRIENDS12` for?" is a
   question with no answer unless it was written down at creation. Nearly free, and it is what makes
   the coupons tab useful rather than merely present. Already in the schema above.
2. **Copy-link button in the console.** The deliverable of this feature is a URL you paste into a
   message. Making an operator assemble `https://rebelshops.com/join/` + code by hand is a small
   thing that gets the whole feature used less.
3. **A "campaign" or `source` label.** Even one free-text field turns the redemptions tab from a log
   into an answer to "which of the three places I posted this actually worked".
4. **Show the end date on `/admin/billing`.** A merchant on a free year should see *"Free until
   27 August 2027, then $19.99/month"* on their own billing page. It is the honest version of the
   offer and it is the only churn mitigation available without email.
5. **A revenue-at-risk figure in the console.** Sum of what the live coupons are discounting per
   month, and when each ends. Cheap to compute from data already in the ledger, and it is the number
   that tells you when generosity stopped being an experiment.
6. **Redemption events on the platform overview.** One number — coupon signups in the window —
   alongside the merchant counts, since the entire point is adoption.
7. **Fix `readIntroDiscount` regardless of this feature.** It is already fragile for any coupon that
   is not the one intro coupon. It is listed in phase 5 because this feature makes it break, but it
   is a latent bug today.

---

## 15. What this costs

Rough, assuming the phases above and no scope added.

| Phase | Size |
|---|---|
| 1 Schema and model | Medium — the triggers and their `db:verify` behaviour are most of it |
| 2 Stripe resolution | Small |
| 3 Operator console | Medium — two tabs, a create form, first write surface in `/platform` |
| 4 The link | Small |
| 5 Billing attach | Medium — precedence, the status vocabulary, the `readIntroDiscount` fix |
| 6 Redemption close-out | Small |
| 7 Docs and polish | Small |

Phases 1–4 are the minimum that achieves the stated goal — *hand a friend a link, they sign up with
a year free, and you can see that they did*. Phase 5 is what makes a code work for someone who is
already halfway through signing up, and phase 6 is what makes the redemptions tab tell the truth
rather than showing everyone stuck at `attributed`.
