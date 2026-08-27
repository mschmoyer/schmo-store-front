# Plan: platform signup coupons

**Status:** built. **Phases 1-8 landed 2026-08-27.** The schema, the Stripe resolution, the
operator console, the `/join` link, the billing attach, the redemption close-out, the merchant's
alert ladder, the docs and `/pricing` are all in and green: 1377 unit tests, 21 schema invariants, a
keyless production build. The staff review is outstanding.
**Goal:** hand a friend a link, they sign up, they get a year free, and the operator console can
show who used what. Friends skip the card entirely; publicly-issued codes still take one.

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

A third field decides whether signing up costs the merchant a card:

| Field | Meaning |
|---|---|
| `collect_payment_method` | `TRUE` (default) — Stripe takes a card at signup and charges automatically when the window closes. `FALSE` — no card, no friction, and nothing to charge later. |

This is per coupon, not global: a code handed to a friend can skip the card while a code posted
publicly still takes one. §3 covers what it does to the Checkout Session, and §13 covers what it
costs — a `FALSE` coupon **cannot** convert on its own, which is what makes the expiry warning in
§4D part of the feature rather than a nicety.

This is deliberately *not* two independent knobs ("months free" **and** "percent off"). A coupon
that is free for 3 months and then 50% off for another 6 is two discounts on one subscription, which
Stripe does not model as a coupon and which the `subscriptions` mirror has no columns for. If that
offer is actually wanted, it is a follow-up that introduces Stripe subscription schedules. Confirmed
as out of scope — §14.

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
   (§11, invariant 5).

### Collecting a card, or not

`collect_payment_method` maps onto one Checkout Session parameter, not onto a different billing
model:

| Flag | Session | At the end of the window |
|---|---|---|
| `TRUE` | default collection | Stripe charges the stored card. The merchant does nothing. |
| `FALSE` | `payment_method_collection: 'if_required'` | Stripe has nothing to charge. The invoice goes unpaid, the subscription enters dunning, and the merchant must add a card. |

**`FALSE` only does anything at `percent_off = 100`.** `if_required` skips collection when the
amount due *today* is zero, so a 50%-off coupon still charges $9.99 at signup and Stripe takes a
card regardless of the flag. A coupon that promised no card and then asked for one would be a lie
told by a checkbox, so the schema forbids the combination outright
(`CHECK (collect_payment_method OR percent_off = 100)`).

This is deliberately **not** `trial_period_days: 365`. A trial and a 100%-off coupon reach the
merchant identically — free until a date, then billed — but a trial is a second discount mechanism
with its own fields, its own webhook semantics and its own row in the `subscriptions` mirror, for
no gain. One coupon shape, one flag.

`isEntitled()` already counts `past_due` as entitled, so a merchant whose free year lapses keeps
their storefront through Stripe's dunning window rather than being locked out the morning the
coupon ends. That is the right behaviour and it is already built.

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
2. A coupon attributed to this user at signup (§6).
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

## 4. The four surfaces

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

### D. The expiry warning — `/admin`

A merchant on a free year must be told it is ending, on the dashboard they already look at. One
`Alert` on `/admin` and a matching state on `/admin/billing`, rendered from
`platform_coupon_redemptions.discount_ends_at` and whether a payment method is on file. Its action
is **Add a payment method**, which opens the existing Stripe Billing Portal
(`POST /api/billing/portal`) — no new machinery.

**§5 is the specification**: which state shows what, when it escalates, what is dismissible, and how
long grace runs. Thresholds are constants, not literals scattered through JSX.

There is no transactional email in this repo, so this banner is the entire notification system. That
is a thin single point of failure for a no-card coupon and it is called out in §13 rather than
discovered at month twelve.

---

## 5. The merchant's experience

Everything above is mechanism. This is what a merchant actually sees, and it is where a generous
offer turns into either a happy customer or a confused one.

### 5.1 The rule: quiet for eleven months, clear for the last one

A countdown that runs for a year is furniture. People stop seeing it around week three, and it is
still there — unread — on the day it matters. So the dashboard says nothing at all while the free
window is comfortably open, and earns the merchant's attention only when there is something to do.

| Merchant's state | `/admin` dashboard | `/admin/billing` |
|---|---|---|
| Coupon attributed, not yet subscribed | Info alert: the offer and when the reservation lapses | Offer card, CTA showing the real first charge |
| Redeemed, more than 30 days left | **Nothing** | One row: *"Friends & Family — free until 27 Aug 2027"* |
| 30 days left, card on file | Info alert, dismissible | Row plus what happens on the date |
| 30 days left, **no card** | Warning alert, **not** dismissible, action *Add a payment method* | Same, given prominence |
| Window closed, in grace, no card | Escalated alert naming the grace date | Same |
| Window closed, card on file | Nothing — it simply charged | Ordinary subscription row |
| Grace exhausted | Honest state, still not a locked door | Same |

**Two clocks, not one.** The first row of that table runs on the *reservation* clock (§6, 30 days
from attribution) and every other row runs on the *discount window* clock (`discount_ends_at`, which
does not exist until the redemption closes). `discount-notice.ts` owns the second only and returns
"nothing to say" for an unredeemed claim. The reservation banner is a separate, simpler component
reading `attributed_at` — build it in phase 7 beside the ladder, not inside it.

**The card is what sets the weight.** With a card on file, the end of the free window is
*information* — Stripe charges and the merchant does nothing. With no card it is a *task*, and the
banner is the only place in the product that will ever ask for one. Same calendar event, two
different UIs, and conflating them either nags people who owe nothing or under-warns the ones who do.

Dismissibility follows the same split: informational alerts can be dismissed (per browser, via
`localStorage` — a courtesy notice does not deserve a table), actionable ones cannot.

Mantine's `Alert` is already the dashboard's idiom for exactly this — see `src/app/admin/page.tsx`,
which uses it for load failures and inventory warnings. No new component.

### 5.2 Grace: three things expire, and they want different answers

"Does the coupon expire?" is really three questions, and giving them one answer is how a grace
period becomes a bug.

**1. The code itself (`redeem_by`) — no grace, honest failure.**
A hidden fudge factor makes the printed date a lie and leaves nobody able to reason about when a
code actually dies. If a link should last longer, an operator edits `redeem_by` in the console; that
is one click and it is *visible*. What the merchant gets instead of secret grace is a dead end with
a door in it: the wizard says the link has expired and offers signup at standard pricing rather than
silently charging them full price and hoping they don't notice.

**2. The reservation (30 days) — grace is automatic, and nothing should be built for it.**
Releasing a reservation frees the seat; it does not blacklist anybody. A friend who wanders off and
comes back on day 45 re-clicks the same link and is re-attributed, provided the coupon still has
room and has not itself expired. This is worth writing down precisely so nobody later adds a
"reservation grace period" on top of a mechanism that already forgives.

**3. The free window closing (`discount_ends_at`) — yes, grace, and it must be explicit.**

Start from an uncomfortable fact: **today grace is unlimited, by accident.** `stripe/CLAUDE.md`
lists "No entitlement enforcement" as a known gap — nothing in this codebase disables a storefront
whose merchant stopped paying. So the real question is not *should we add grace*, it is *what will
grace mean when enforcement eventually lands, and what do we tell people before then*.

The answer differs by card, which is why it cannot be left to Stripe:

- **With a card**, Stripe's dunning *is* the grace. Failed payments retry on a configurable schedule
  that runs for weeks, and `isEntitled()` already counts `past_due` as entitled. Adding a second,
  product-level grace on top would give the merchant two clocks that disagree. Don't.
- **Without a card**, dunning is theatre. There is no payment method to retry against, so five
  attempts over three weeks accomplish exactly what zero attempts would. Grace here is a product
  decision or it is nothing.

So: define **one** grace window — `PLATFORM_DISCOUNT_GRACE_DAYS`, proposed at 14 — measured from
`discount_ends_at`, applied to both cases so there is one rule to explain and one date to render.
For the card case it runs alongside dunning rather than after it.

And then, deliberately: **use it for messaging only, for now.** Build the ladder in §5.1 on real
dates; do not build enforcement. Enforcement is a platform-wide decision about every unpaid
merchant, not a coupon feature, and making the coupon path the first thing that can switch a
storefront off would be a strange place to introduce it. When enforcement does land, the dates
merchants have been reading are already the right ones.

One rule to carry into that future work: **a friend's storefront never goes dark without a person
deciding it should.** Whatever enforcement eventually does elsewhere, the coupon path degrades to
"storefront keeps serving, admin keeps asking".

### 5.3 The billing page currently uses the wrong words

This is not cosmetic. `src/app/admin/billing/page.tsx` hardcodes the intro offer's vocabulary, so a
coupon merchant reads copy written about a different product:

| Line | Renders today | For a free-year merchant |
|---|---|---|
| ~516 | `Intro pricing · {introMonths} months` | *"Intro pricing · 12 months"* — it is not intro pricing |
| ~527 | `After the intro period` | There is no intro period |
| ~530 | `Intro pricing ends` | Nearly right, wrong noun |
| ~590 | `Subscribe for ${offer?.introPrice ?? '$1.00'}` | A button reading **"Subscribe for $1.00"** on a checkout that charges **$0.00** |

That last row is the **Honest results** rule in `CLAUDE.md` broken in the UI layer, and it ships the
moment a 100%-off coupon reaches this page. The fix is neutral vocabulary — *"Your offer"*, *"Offer
ends"*, *"Then"* — driven by the discount actually on the subscription rather than by a constant.
Phase 5 owns it, alongside the `/api/billing/status` change already planned there.

The merchant should also be able to **see which coupon they are on, by name**. The plan as written
records the redemption for the operator and shows the merchant nothing, which means twelve mystery
$0.00 invoices followed by a surprise charge. One row on the billing page — *"Friends & Family —
free until 27 Aug 2027"* — closes that.

### 5.4 Leaving while free

A friend who decides not to continue must be able to say so without first adding a card. Stripe's
billing portal already handles cancellation, so nothing new is needed — but the UI must describe it
correctly. `cancelAtPeriodEnd` on a fully-discounted subscription means *"free until the window
closes, then gone"*, and the current page would render that as a next charge of nothing, which reads
like everything is fine.

Two smaller truths worth knowing rather than fixing: the merchant receives a $0.00 Stripe invoice
every month for the length of the offer, and a card stored twelve months ago may be dead by the time
it is charged — Stripe's card updater covers a re-issued card, not a closed account. Both are
arguments for the 30-day notice, not problems this feature can solve.

---

## 6. Attributed, then redeemed

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

## 7. Schema — migration `042_platform_coupons.sql`

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
  -- FALSE skips card collection at signup. Only meaningful at 100% off: a partial discount still
  -- charges something today, so Stripe takes a card whatever this says. See section 3.
  collect_payment_method BOOLEAN  NOT NULL DEFAULT TRUE,
  CONSTRAINT platform_coupons_no_card_needs_full_discount
    CHECK (collect_payment_method OR percent_off = 100),
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

## 8. Modules to add

| File | Owns |
|---|---|
| `src/lib/billing/platform-coupons.ts` | Pure model: normalisation, `describePlatformCoupon()` (the offer sentence), validity predicates. No Stripe, no database — unit-testable like `intro-offer.ts`. |
| `src/lib/platform/coupons.ts` | Persistence and the operator's reads: create, deactivate, list, redemption list. Owns the vocabulary (`attributed`, `redeemed`, `released`) the way `platform/customers.ts` owns "received". |
| `src/lib/billing/coupon-claims.ts` | The lifecycle: `attributeCoupon`, `markRedeemed`, `releaseExpired`, `resolveActiveClaim`. Every state transition, one place. |
| `src/lib/stripe/platform-coupons.ts` | `ensureStripeCouponFor(row)` — resolve-or-create. Mirrors `stripe/prices.ts`; **must not** live in `stripe/discounts.ts`, which is flow B. |
| `src/lib/billing/coupon-codes.ts` | Code generation: `crypto.randomBytes`, Crockford-ish alphabet with `0/O/1/I/L` removed. |
| `src/lib/billing/discount-notice.ts` | The §5.1 ladder as one pure function of `(discountEndsAt, hasPaymentMethod, now)` → the state to render. Owns `PLATFORM_DISCOUNT_GRACE_DAYS` and the 30-day threshold, so two screens cannot disagree about what day it is. |

Update: `stripe/CLAUDE.md` (module map, outbound call table, data model, event matrix),
`docs/payments.md`, `docs/platform-admin.md`, `docs/decision-log.md`, `.env.example` if a variable
appears, `README.md`.

---

## 9. API surface

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

## 10. Build order

Each phase leaves the tree green and shippable.

| # | Phase | Contains |
|---|---|---|
| 1 ✅ | **Schema and model** | Migration 042, triggers, `db:verify` invariants, `billing/platform-coupons.ts`, `coupon-codes.ts` + unit tests. No UI, no Stripe. |
| 2 ✅ | **Stripe resolution** | `stripe/platform-coupons.ts`, resolve-or-create, degrades cleanly with no `STRIPE_SECRET_KEY`. |
| 3 ✅ | **Operator console** | `/platform/coupons`, both tabs, create + deactivate + copy-link. Coupons exist and are visible before anything can redeem one. |
| 4 ✅ | **The link** | `/join/[code]`, the cookie, wizard banner (success *and* the honest failure), attribution at account creation, `store_id` backfill. |
| 5 ✅ | **Billing attach** | Preview endpoint, the code box on `/admin/billing`, `couponCode` on checkout, precedence, `collect_payment_method` → `payment_method_collection`, `billing/status` vocabulary, **the `readIntroDiscount` fix**. |
| 6 ✅ | **Redemption close-out** | Webhook `attributed` → `redeemed`, `discount_ends_at`, reservation sweep on cron, redemption tab shows live subscription status. |
| 7 ✅ | **The merchant's experience** | §5 — the alert ladder on `/admin` and `/admin/billing`, `PLATFORM_DISCOUNT_GRACE_DAYS`, the named-offer row, and the vocabulary fix in §5.3. Messaging only; no entitlement enforcement. |
| 8 ✅ | **Docs and polish** | `docs/payments.md` (new §8), `src/lib/stripe/CLAUDE.md` (module map, outbound/inbound tables, data model, event matrix, a new "Platform signup coupons" section), `docs/platform-admin.md` ("The gate" corrected for the console's first write surface), `README.md`, this plan (§10/§14), `docs/decision-log.md`. `/pricing` reads the `/join` cookie server-side, re-validates it, and quotes the coupon's real offer and card requirement — `src/app/pricing/page.tsx`, `CouponPricingPage.tsx`, `CouponPlanCard.tsx`. No new environment variable — checked, none was added. |

Phases 1–3 are shippable on their own and let coupons be issued and tracked by hand before any
customer-facing path exists.

**Phase 7 is not optional for no-card coupons.** A `collect_payment_method = FALSE` coupon has no
way to convert without it, so shipping phase 5 without phase 7 means issuing coupons that are
guaranteed to lapse silently. If the two cannot ship together, default every coupon to `TRUE` until
the banner exists.

---

## 11. Invariants

Things that must hold, listed so a reviewer has something to check against.

1. **`max_redemptions` is enforced in the database**, under a row lock, not by a read-then-write in
   a route.
2. **One live claim per user.** Enforced by partial unique index.
3. **A coupon replaces the intro offer, never stacks with it.** One discount reaches Stripe.
4. **The cookie is a hint.** Every attach re-validates against the database. A forged cookie gets
   the standard price, not a free year.
5. **Economics are immutable, full stop.** `percent_off`, `duration_months` and
   `collect_payment_method` are never editable — not merely "once someone has redeemed", which is
   what this plan said before the code was written. The implementation went stricter deliberately:
   the moment `stripe_coupon_id` is set the Stripe coupon exists and Stripe coupons cannot be
   edited, so any window in which our row could drift from it is a window that ends in a wrong
   price on a real invoice. A pre-redemption typo is fixed by deactivating and re-creating, which
   costs one dead row and one new code. The patch type still *accepts* those fields so an attempt
   can be refused by name (`economics_immutable`) rather than silently ignored.
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
13. **No-card coupons are 100%-off only.** Enforced by CHECK constraint, not by a form validator.
    A coupon cannot promise no card and then ask for one.
14. **A merchant whose free window is closing is told, on `/admin`, before it closes.** For a
    no-card coupon this is the only path to a payment method, so a redemption with a
    `discount_ends_at` and no stored card must always render the banner.
15. **No screen describes a coupon in the intro offer's vocabulary.** Copy is driven by the discount
    on the subscription, never by `PLATFORM_INTRO_*`. A button that names a price must name the
    price that will actually be charged.
16. **This feature never switches a storefront off.** Grace drives messaging only; entitlement
    enforcement is out of scope and stays that way until it is decided platform-wide.

---

## 12. Testing

Unit (`__tests__/` beside the source):

- `platform-coupons.test.ts` — offer sentences, validity windows, normalisation, the boundary cases
  (`percent_off = 100`, `duration_months = NULL`).
- `coupon-codes.test.ts` — alphabet excludes ambiguous characters, entropy, no collisions over a
  large sample.
- `coupon-claims.test.ts` — the state machine, including illegal transitions.
- The alert ladder as a pure function of `(discount_ends_at, hasPaymentMethod, now)`: 31 days out is
  silent, 30 warns, the card and no-card variants differ, grace expiry is the last rung. Date
  arithmetic, no component needed.

Database behaviour (`npm run db:verify`):

- Concurrent attributions against a `max_redemptions = 1` coupon: exactly one succeeds.
- Second live claim for one user: rejected.
- Deleting a coupon with history: rejected.
- `collect_payment_method = FALSE` with `percent_off < 100`: rejected by the CHECK constraint.
- `rebuild_platform_coupon_counts()` reproduces the trigger's numbers.

E2E (`tests/e2e/`, Chromium only in a session container):

- `/join/<valid>` → wizard shows the offer → account created → redemption row is `attributed`.
- `/join/<expired>` → wizard shows the honest failure and signup still works at full price.
- `/platform/coupons` renders for an admin, 403s for a merchant.

The CI story in `CLAUDE.md` is blunt about why this matters: a green unit suite does not mean the
app renders. The wizard banner and the console tabs are exactly the kind of thing that passes 922
unit tests and is blank in a browser.

---

## 13. Known limits of this design

- **`subscriptions.intro_months` still overloads `0`.** It means both "no discount" and "a discount
  that never ends", and the staff review found a comp account quoting `$19.99` because of it. The
  fix that shipped is the narrow one: `intro_amount IS NOT NULL` plus `intro_ends_at IS NULL` is
  read as "forever" wherever the next charge is computed. That is unambiguous today, because
  `intro_amount` is only ever set alongside a real resolved discount — but it is a rule a reader has
  to know rather than a shape the data enforces. The structural fix is an `ALTER TABLE` making
  `intro_months` nullable so `NULL` can mean forever, and it was deliberately left out of the
  review-fix pass rather than smuggled in beside a money bug. The column names are wrong too now
  (`intro_*` describes whatever discount is live, coupon or intro); rename them in the same
  migration when someone does it.


Written down rather than discovered later.

- **A coupon cannot be applied to an already-active subscription.** It attaches at subscribe time.
  Giving a code to someone already paying needs `subscriptions.update` with a discount and a
  proration decision, which is a separate piece of work.
- **`duration_in_months` may have an upper bound in the Stripe API.** Verify 12 works against a real
  test account in phase 2 before building the console around it. If it is capped below 12, the
  fallback is `duration: 'forever'` plus a scheduled removal, which is materially more machinery.
- **A no-card coupon cannot convert by itself.** With `collect_payment_method = FALSE` Stripe has
  nothing to charge when the window closes: the invoice goes unpaid and the subscription enters
  dunning. The merchant must add a card, and the §4D banner is the only thing that asks them to.
  This is an accepted cost of frictionless signup for friends, not an oversight — but it means the
  banner ships with the feature, and it means these coupons should be issued deliberately rather
  than posted publicly.
- **A free year does not currently gate anything.** `stripe/CLAUDE.md` lists "No entitlement
  enforcement" as a known gap: nothing disables a storefront whose merchant stopped paying. So the
  coupon's real effect today is on the invoice and on the merchant's perception, not on access.
- **Grace is messaging, not enforcement.** `PLATFORM_DISCOUNT_GRACE_DAYS` decides what the dashboard
  says, not what the platform allows — nothing here switches a storefront off, because nothing in
  this codebase does that yet. A merchant who ignores every alert keeps serving indefinitely. That
  is the honest current state, not a loophole this feature opens.
- **The banner is the entire notification system.** There is no transactional email in this repo, so
  a merchant who never signs in during the last 30 days is never told. A no-card coupon plus an
  absent merchant lapses silently. Email is the obvious follow-up and is out of scope here.
- **One subscription per owner, one store per merchant** — the existing constraint. A coupon does
  not change it.

---

## 14. Decisions taken

Answered 2026-08-27. Recorded here so the reasoning survives the conversation.

**1. Card at signup is a per-coupon flag, not a global policy.**
> *"Make this an option on the coupon. For friends I don't want to ask for a card. For everyone else
> you're right, need to take the card. We should also add UI to the customers dashboard letting them
> know the coupon is about to expire."*

`collect_payment_method` (§2, §3), defaulting to `TRUE`. Friends get a link that asks for nothing;
a code posted anywhere public still takes a card and converts on its own. The mechanic is one
Checkout Session parameter, so both live on the same coupon shape — and because it only works at
100% off, the schema refuses the dishonest combination.

The expiry warning became §4D and phase 7. It is worth being blunt about why: for a no-card coupon
that banner is not a courtesy, it is the entire conversion path. Nothing else in the product will
ever ask that merchant for a card.

**2. One discount, two knobs.** `percent_off` + `duration_months`. Offers that change over time
(free, *then* half price) would need Stripe subscription schedules and are out of scope.

**3. Reservations release after 30 days.** A clicked-but-abandoned single-use link frees itself, and
the released row stays in the ledger so "clicked 40 times, redeemed twice" is still answerable.

**4. `/pricing` honours the link.** It reads the same cookie and quotes the discounted offer, so the
first page a friend lands on does not contradict the link that sent them. **Built in phase 8**:
`src/app/pricing/page.tsx` reads the httpOnly cookie server-side via `next/headers`' `cookies()`
(there is nothing to `fetch` — the cookie cannot be read client-side by design), re-validates the
code against the database with `isRedeemable` rather than trusting `/join`'s earlier verdict, and
renders `CouponPricingPage`/`CouponPlanCard` instead of the standard page when it is still
redeemable. An invalid, expired, exhausted or deactivated code — or any read/lookup failure —
degrades silently to the standard page, exactly as this decision specifies: `/join` and the
onboarding wizard are where the failure gets said out loud, not here. It also states whether a card
will be required (`requiresPaymentMethod()`), matching the wizard's own `CouponBanner` wording, so
the promise made at the link and the promise made at signup cannot disagree.

### Still open

**What stops one friend claiming a multi-use code five times under different emails?** The plan
enforces one live claim per *user*, which a new email address defeats in seconds. Options: leave it
and watch the redemptions tab; cap by email domain; require an operator to approve a redemption
before the discount attaches. My recommendation is to leave it — these are going to people you know,
and the redemptions tab is the control. Worth revisiting only if a code leaks somewhere public.

## 15. Things worth adding that were not asked for

Ordered by what I think the value is per hour of work.

1. **`notes` and `created_by` on every coupon.** Six months from now "who was `FRIENDS12` for?" is a
   question with no answer unless it was written down at creation. Nearly free, and it is what makes
   the coupons tab useful rather than merely present. Already in the schema above.
2. **Copy-link button in the console.** The deliverable of this feature is a URL you paste into a
   message. Making an operator assemble `https://rebelshops.com/join/` + code by hand is a small
   thing that gets the whole feature used less.
3. **A "campaign" or `source` label.** Even one free-text field turns the redemptions tab from a log
   into an answer to "which of the three places I posted this actually worked".
4. ~~**Show the end date on `/admin/billing`.**~~ — **adopted.** Now §4D and phase 7, and load-bearing
   rather than nice-to-have: a no-card coupon has no other route to a payment method.
5. **A revenue-at-risk figure in the console.** Sum of what the live coupons are discounting per
   month, and when each ends. Cheap to compute from data already in the ledger, and it is the number
   that tells you when generosity stopped being an experiment.
6. **Redemption events on the platform overview.** One number — coupon signups in the window —
   alongside the merchant counts, since the entire point is adoption.
7. **Fix `readIntroDiscount` regardless of this feature.** It is already fragile for any coupon that
   is not the one intro coupon. It is listed in phase 5 because this feature makes it break, but it
   is a latent bug today.

---

## 16. What this costs

Rough, assuming the phases above and no scope added.

| Phase | Size |
|---|---|
| 1 Schema and model | Medium — the triggers and their `db:verify` behaviour are most of it |
| 2 Stripe resolution | Small |
| 3 Operator console | Medium — two tabs, a create form, first write surface in `/platform` |
| 4 The link | Small |
| 5 Billing attach | Medium — precedence, the card flag, the status vocabulary, the `readIntroDiscount` fix |
| 6 Redemption close-out | Small |
| 7 The merchant's experience | Medium — the ladder is small, but it touches two screens and rewrites the billing page's copy |
| 8 Docs and polish | Small |

Phases 1–4 are the minimum that achieves the stated goal — *hand a friend a link, they sign up with
a year free, and you can see that they did*. Phase 5 is what makes a code work for someone who is
already halfway through signing up, and phase 6 is what makes the redemptions tab tell the truth
rather than showing everyone stuck at `attributed`.

Phase 7 is the one phase that cannot be deferred if no-card coupons ship, because those coupons have
no other route to a payment method — and because §5.3 is a wrong price on a button, not a polish
item. Everything before it can go out incrementally.
