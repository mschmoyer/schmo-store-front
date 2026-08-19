# RebelShops — Marketing Copy Deck

> **Status:** finished copy, ready to implement verbatim.
> **Voice authority:** `docs/design-system.md` §1. That file wins any conflict.
> **Honesty rule:** anything marked `[GATED: …]` must not ship until the named thing is built and
> verified. Delete the block, don't soften it.
> **Proof rule:** we have zero customers. No testimonials, no logos, no counts, no star ratings
> anywhere on this site. See §3.9.

---

## 0. Canonical name — decide once, apply everywhere

**The product is `RebelShops`.** One word. Capital R, capital S. No space. No apostrophe. Never
pluralized further, never abbreviated.

| Context | Correct | Wrong |
|---|---|---|
| Body copy, headings | RebelShops | Rebel Shops, RebelShop, RebelCart, Schmo Store |
| First mention on a page | RebelShops | rebelshops, REBELSHOPS |
| Domain / URLs | rebelshops.com | schmostore.com, rebelcart.com |
| Wordmark / logo | RebelShops | RebelShop |
| Legal / copyright line | © 2026 RebelShops | © 2026 Rebel Shops |
| Schema.org `name`, OG `site_name` | RebelShops | RebelCart |
| Code identifiers | `RebelShopsLogo`, `RebelShopsFooter` | `RebelShopLogo`, `RebelShopFooter` |
| Sentence use | "RebelShops reads your catalog" (singular verb) | "RebelShops read your catalog" |

**Never** write "the RebelShops platform" or "the RebelShops solution." It's a store, or a
storefront, or RebelShops. Nothing else.

**Files that currently carry a wrong name and must be corrected** (rename identifiers, not just
strings): `src/components/ui/RebelShopLogo.tsx`, `src/components/store/RebelShopFooter.tsx`,
`src/components/landing/Footer.tsx` (:79 "Rebel Shops"), `src/components/landing/Features.tsx`
(:71 "RebelCart"), `src/components/landing/Hero.tsx` (:26 "RebelShop"), `src/components/TopNav.tsx`
(:131 "Schmo Store"), `src/components/blog/BlogSEO.tsx` (:15), `src/app/demo-stores/page.tsx`
(:6, :7, :28), `src/app/admin/page.tsx` (:291, :294), and the whole of
`src/components/seo/LandingPageMeta.tsx`.

---

## 1. Positioning statement

RebelShops is a direct-to-consumer storefront for sellers who already run their operation on
ShipStation. It's for the Amazon, eBay and wholesale sellers who ship real volume, keep their
products, SKUs, stock levels and warehouses in ShipStation, and have nowhere of their own to sell
them. Everyone else in this category asks you to migrate: re-key your catalog into a new platform,
learn a new shipping workflow, then pay a monthly plan fee, app fees, and a cut of every sale for
what is mostly a product grid. RebelShops doesn't ask for the migration, because you already did the
hard part. We read your ShipStation catalog over the API, put a real store in front of it, take
payments through your own Stripe account, and hand the order back to the shipping workflow you
already run. $1 for the first three months, then $19.99 a month. We never take a percentage of a
sale.

---

## 2. Message hierarchy

### The one thing a visitor must remember

**Your ShipStation account already has everything a store needs except the store.**

### The three supporting claims

| # | Claim | Objection it kills |
|---|---|---|
| 1 | **You don't migrate. We read your ShipStation catalog and build the store from it.** | "I'm not re-entering 800 SKUs. Last time I tried this I spent two weekends on a CSV and gave up." |
| 2 | **It stays in sync, both directions, over the ShipStation API — not a one-time import.** | "Fine, but three days later my stock levels are wrong and I oversell. Every 'integration' I've used was a nightly CSV that broke." |
| 3 | **$19.99 flat. We never take a percentage.** | "Cheap platform, then they claw it back on transaction fees and paid apps. What's the real number?" |

### Supporting, not headline

Inventory valuation, dead-stock and turnover reports, purchase orders and supplier records ship in
the box. On Shopify Basic those are apps. Lead with the store; land this on the feature page and in
the comparison.

### What we deliberately don't claim

Not "the Shopify killer." Not "everything Shopify does, cheaper." We do one channel well for one
kind of seller. Saying so is more persuasive to this buyer than a feature-parity claim they will
immediately disprove.

---

## 3. Homepage, section by section

### 3.1 Hero

**Purpose:** in one skim, tell a ShipStation seller that the thing they're missing already exists
and costs a dollar to try.

#### Five headline candidates, ranked

| Rank | Headline | Five-word skim reads | Verdict |
|---|---|---|---|
| **1** | **Your ShipStation catalog, now a storefront.** | "Your ShipStation catalog, now a…" | **Pick.** Names the asset in word two. States the transformation. No pun, no adjective, nothing to decode. |
| 2 | The storefront your ShipStation account is missing. | "The storefront your ShipStation account" | Very close second. Frames the gap well, but "is missing" arrives after the skim window, so the skimmer gets a noun phrase and no verb. |
| 3 | Sell direct from your ShipStation catalog. | "Sell direct from your ShipStation" | Clear and short. Sounds like a feature bullet, not a product. Weaker as a page-opener. |
| 4 | You already have the inventory. Get the store. | "You already have the inventory." | Strong reframe, but the first clause could describe any inventory tool. Doesn't say ShipStation until the subhead. Better as the §3.2 headline — that's where it goes. |
| 5 | Ship with ShipStation. Sell with RebelShops. | "Ship with ShipStation. Sell with" | Nice symmetry, and it teaches the name. But it's a slogan, not a claim — it says nothing a reader didn't already assume. |

**Chosen: "Your ShipStation catalog, now a storefront."**

Reasoning: the buyer's problem is not a missing feature, it's a missing surface. This headline
addresses them as someone who already owns the valuable part. "ShipStation" in position two acts as
a qualifier — the wrong visitor bounces in half a second, which is correct. It survives the skim,
survives being read aloud, and contains no adjective we'd have to defend.

| Element | Copy |
|---|---|
| Eyebrow | `FOR SHIPSTATION SELLERS` |
| Headline (H1) | Your ShipStation catalog, now a storefront. |
| Subhead | Connect your ShipStation account and RebelShops builds a real online store from the products, SKUs and stock levels already in it. Payments through your Stripe account. Orders come back to ShipStation. |
| Primary CTA | `Start for $1` |
| Secondary CTA | `See a live store` |
| Microcopy under CTAs | $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime. |

**Visual:** a two-panel composition, not a laptop mockup. Left: a plain ShipStation-style product
row — SKU in mono, name, on-hand qty. Right: the same SKU rendered as a live product card in a
storefront, price in display type, an "In stock" dot. One thin ember connector line between them,
labeled `ShipStation API` in mono at `--text-xs`. Real data from a demo store, never lorem. No stock
photography, no gradient blobs, no floating UI chrome.

---

### 3.2 "You already have this"

**Purpose:** reframe ShipStation from a shipping cost into an underused asset. This is the emotional
turn of the page.

| Element | Copy |
|---|---|
| Eyebrow | `THE PART YOU ALREADY DID` |
| Headline (H2) | You already have the inventory. You just don't have the store. |
| Subhead | ShipStation is holding a complete product database. Most sellers only use it to buy labels. |
| Body | Your SKUs are in there. Your prices, your product images, your on-hand quantities, your warehouses. That's the hard, boring, error-prone part of standing up a store, and you finished it years ago. What you've been quoted for is a shop window — and quoted at a price that assumes you're starting from nothing. You aren't. |
| CTA | `Connect ShipStation` |
| Microcopy | Read-only until you publish. You can disconnect at any time. |

**Visual:** a checklist, rendered flat, no illustration. Four rows with a mint check: `Products`,
`SKUs & prices`, `Stock levels`, `Warehouses` — each labeled `already in ShipStation` in `--ink-500`.
A fifth row with an empty ember-outlined box: `A place to sell them` — labeled `this is the part
we do`. The asymmetry is the whole point; don't balance it.

---

### 3.3 How it works — three steps

**Purpose:** collapse perceived setup cost. Honest time estimates, because an inflated one gets
disproved in step one and poisons everything after it.

| Element | Copy |
|---|---|
| Eyebrow | `SETUP` |
| Headline (H2) | Three steps. One sitting. |
| Subhead | Times below are real, measured on a catalog of a few hundred SKUs. A very large catalog takes longer to sync — you don't have to sit and watch it. |

**Step 1**
- Title: `Paste your ShipStation API key`
- Time: `about 2 minutes`
- Body: Generate a key in ShipStation, paste it in, we test the connection before saving. Nothing syncs until you say go.

**Step 2**
- Title: `We pull in your catalog`
- Time: `2–10 minutes, unattended`
- Body: Products, SKUs, prices, images, stock levels, warehouses. You don't type anything. Big catalogs take longer; you can close the tab and come back.

**Step 3**
- Title: `Name it, style it, publish`
- Time: `about 5 minutes`
- Body: Store name, description, hero copy, a theme. Publish and your store is live at your RebelShops URL.

| Element | Copy |
|---|---|
| Closing line under steps | Realistically: under 20 minutes from API key to a live store you can send someone. |
| CTA | `Start for $1` |

**Visual:** three numbered cards, horizontal on desktop, stacked on mobile. Each card shows a real
screenshot crop from the actual product — the integration form, the sync progress list, the design
page. Crops, not full screens. The time estimate sits in a mono pill at the top-right of each card.
No cartoon icons.

> `[GATED: step 3 currently offers store name, description, hero title, hero description and 11 color
> themes only — see src/app/admin/design/page.tsx and src/lib/themes.ts. Do not write "drag and drop",
> "fonts", "layouts", "sections" or "live preview" until the customizer in docs/storefront-theme-spec.md
> ships.]`

---

### 3.4 Feature — storefront customization

| Element | Copy |
|---|---|
| Eyebrow | `MAKE IT YOURS` |
| Headline (H2) | It should look like your brand, not like our template. |
| Subhead | Store design |
| Body | Set your store name, description and hero copy, pick a color theme, and publish. Your products render in a responsive catalog with search, a cart and a checkout. Every store gets clean URLs and product metadata search engines can read. |
| CTA | `See a live store` |
| Microcopy | Change anything later. Republishing takes a click. |

**Visual:** the same demo store rendered in three different themes, side by side, at real fidelity.
Show a theme that is genuinely different in feel, not three hue rotations — if the current 11
palettes can't produce that, show two and don't pad.

> `[GATED: full customizer — fonts, radius, density, section reordering, live preview — is specified
> in docs/storefront-theme-spec.md but NOT built. src/lib/storefront-theme/ does not exist and
> migration 019 has not been written. Ship this section describing color themes and content fields
> only. When the customizer lands, replace the body with the fuller version and add a "customize live,
> publish when ready" line.]`

---

### 3.5 Feature — ShipStation sync

| Element | Copy |
|---|---|
| Eyebrow | `STAYS CURRENT` |
| Headline (H2) | Sell something here, and ShipStation knows. |
| Subhead | ShipStation API sync |
| Body | This is an API integration, not a nightly CSV. RebelShops pulls products, SKUs, prices, images, stock levels, warehouses and inventory locations on a schedule, and every sync is logged with a record count and a duration you can go read. When something fails, you see which operation failed and why — you don't find out from an oversold customer. |
| CTA | `How the sync works` |
| Microcopy | Sync history is visible in your admin, per operation, with timestamps. |

**Visual:** a real screenshot of the sync log — operation name, records processed, duration in ms,
status. Mono type. Include a failed row. A log with a failure in it is more credible than a clean
one, and this buyer has been burned before.

> `[GATED: the write-back path. Today an order creates a ShipStation v2 / ShipEngine **shipment**
> (src/lib/shipstation/v2Api.ts → createShipment), and falls back to a mock order when ShipStation
> isn't configured (src/app/api/orders/route.ts). Do NOT write "your orders appear in your ShipStation
> order queue" or "bidirectional sync" until orders are genuinely created in the ShipStation order
> list and the mock-order fallback is removed from any production path. Until then the honest line is
> the one above — "sell something here, and ShipStation knows" — plus: "Orders are handed to
> ShipStation for fulfillment." Nothing stronger.]`

---

### 3.6 Feature — inventory and purchase orders

| Element | Copy |
|---|---|
| Eyebrow | `IN THE BOX` |
| Headline (H2) | Know what to reorder before you're out of it. |
| Subhead | Inventory intelligence and purchase orders |
| Body | RebelShops tracks sales velocity across 7, 14, 30, 60, 90, 180 and 365 days, forecasts demand, and calculates a reorder point and reorder quantity per SKU. Three reports come standard: inventory valuation, turnover, and dead stock — with days since last sale, carrying cost and a suggested markdown on the money that's sitting still. When it's time to buy, create a purchase order against a supplier record, export it as a PDF, and receive it back into stock. |
| CTA | `See what's included` |
| Microcopy | Export any inventory view to CSV. |

**Visual:** a crop of the dead-stock report showing real columns — SKU, days since last sale,
carrying cost, suggested markdown, liquidation value. This is the screenshot that makes a
high-volume seller lean in. Do not simplify it into a pretty chart; the density is the argument.

**Sidebar note, one line, `--text-sm`:**
On Shopify Basic, purchase orders, supplier records and dead-stock reporting are apps you add and pay
for separately.

---

### 3.7 Feature — Stripe payments

| Element | Copy |
|---|---|
| Eyebrow | `GETTING PAID` |
| Headline (H2) | The money goes to your Stripe account. Not ours. |
| Subhead | Stripe payments |
| Body | Connect your own Stripe account. Customers pay, Stripe settles to your bank on your normal schedule, and RebelShops never touches the funds. You pay Stripe's published rate — 2.9% + 30¢ for standard US online card payments — and you pay us $19.99 a month. There is no third line. |
| CTA | `Start for $1` |
| Microcopy | Your Stripe account, your payout schedule, your chargeback dashboard. |

**Visual:** a three-node flow, flat, no illustration: `Customer` → `Your Stripe account` → `Your
bank`. RebelShops sits off to the side connected by a dashed line, labeled `$19.99/mo`. The visual
argument is that we are not in the money path.

> `[GATED: Stripe checkout is not built. @stripe/stripe-js, @stripe/react-stripe-js and stripe are in
> package.json, and src/app/api/admin/integrations/test/route.ts can validate a Stripe secret key
> against api.stripe.com/v1/account — but there is no PaymentIntent, no Checkout Session, and no
> Stripe call anywhere in the order path. This entire section must stay unpublished until a real
> Stripe payment completes end to end on a live store. Do not publish a "Stripe" logo, badge, or the
> word "secure checkout" before then.]`
>
> `[VERIFY at publish: Stripe's published US standard rate. Cite it as Stripe's rate, never as ours,
> and link to stripe.com/pricing.]`

---

### 3.8 Feature — analytics

| Element | Copy |
|---|---|
| Eyebrow | `WHAT'S WORKING` |
| Headline (H2) | See what people searched for and didn't find. |
| Subhead | Store analytics |
| Body | Visitors, page views and per-page traffic, plus every search query typed into your store and how many results it returned. Searches that return nothing are a shopping list: they're demand you already have and inventory you don't. |
| CTA | `See what's included` |
| Microcopy | Trends and an executive summary view are in the admin dashboard. |

**Visual:** the zero-result search table — query, count, results returned, last searched. Three rows
showing `0 results`. That table sells itself; don't wrap it in a chart.

---

### 3.9 Proof — with zero customers

**We have no customers. Do not manufacture any.**

Forbidden on this site, in any form, including structured data: testimonials, customer names,
company logos, "trusted by N sellers", star ratings, `aggregateRating`, `review` schema, "join
thousands", press badges, and fake avatars.

> **Remediation required before launch:** `src/components/seo/LandingPageMeta.tsx` currently ships
> `aggregateRating: { ratingValue: "4.8", ratingCount: "150" }` and a fabricated review attributed to
> "Sarah Johnson" into JSON-LD. That is invented proof being fed to search engines. Delete both keys
> entirely. Do not replace them with lower numbers.

**What we show instead** — the honest substitutes, in this order:

| Element | Copy |
|---|---|
| Eyebrow | `NO TESTIMONIALS YET` |
| Headline (H2) | We launched recently. Here's the evidence instead. |
| Subhead | You can't check our references yet, so check the product. |

Four cards:

**1. Live stores you can actually use**
Browse a real RebelShops store, search it, add to cart, and walk the checkout. It's the same code
your store runs on.
CTA: `Open a demo store`

**2. What's built and what isn't**
A plain list of what ships today, what's in progress, and what we haven't written yet. Kept current.
No roadmap theater.
CTA: `Read the build log`
`[GATED: requires a public /changelog or /build-log page. If it doesn't exist at launch, cut this card
— do not link to a stub.]`

**3. Nothing to lose**
Month to month. No contract. Cancel in the admin. ShipStation stays the source of truth for your
catalogue — we read it, never rewrite it. The only thing we send is the orders you sell.
CTA: `See pricing`

**4. Who we're not for**
If you don't ship through ShipStation, or you need multi-currency, subscriptions, or a wholesale
portal, we're the wrong tool. We'd rather you find that out here than in month two.
CTA: `Read the FAQ`

**Visual:** four equal cards, `--paper-raised`, no icons, no illustrations. Card 4 gets `--ink-200`
border like the others — do not gray it out or hide it. Its whole value is that it's sitting in the
proof section.

**Also acceptable as honest proof if true at launch — verify before using:**
- "The RebelShops team runs its own store on RebelShops" `[GATED: only if literally true, and link to it]`
- A live status or sync-health page `[GATED: requires a public status page]`
- Founder name and a real email address on the About page. A named human is proof.

---

### 3.10 Pricing block (homepage)

| Element | Copy |
|---|---|
| Eyebrow | `PRICING` |
| Headline (H2) | $1 for three months. Then $19.99 a month. |
| Subhead | One price. No percentage of your sales, ever. |

**Plan card**

- Plan name: `RebelShops`
- Price display: `$1` · below it, `for your first 3 months`
- Secondary line: `then $19.99/mo`
- Badge: `No transaction fees`

**Included:**
- Your storefront, live on a rebelshops.com address
- ShipStation catalog sync — products, SKUs, prices, images, stock, warehouses
- Scheduled background sync with a readable log
- Inventory tracking, demand forecasting, reorder points
- Inventory valuation, turnover and dead-stock reports
- Purchase orders, supplier records, PDF export
- Coupons — percentage or fixed amount, whole order or specific products and categories
- A blog for your store
- Store analytics, including zero-result search tracking
- CSV export of your inventory
- Stripe payments through your own account `[GATED: see §3.7]`

**Not included — read this part:**
- **Payment processing fees.** Stripe's rate is Stripe's. We don't mark it up and we don't rebate it.
- **Your ShipStation subscription.** You keep paying ShipStation directly. We're a layer on top.
- **A custom domain.** Your store lives on a rebelshops.com address today. `[GATED: remove this line only when custom domains ship — there is currently no custom-domain support anywhere in the codebase.]`
- **Multi-currency, subscriptions, wholesale portals, POS.** Not built. Not on a near-term roadmap.
- **Migration off a non-ShipStation system.** We read ShipStation. That's the whole design.

| Element | Copy |
|---|---|
| CTA | `Start for $1` |
| Microcopy | Cancel anytime in your admin. |

**"What's the catch" block** — keep it as a Q&A, keep it directly under the plan card:

> **What's the catch?**
> There isn't a clever one. Here's the plain version: we launched recently, we have no customers,
> and $1 is what it's worth to us to have you actually try it instead of reading about it. After
> three months it's $19.99 a month, the price shown before you enter a card. We don't take a
> percentage of your sales — not now, and not as a "growth plan" later. If it isn't working for you,
> cancel. Your catalog was never ours; it's in ShipStation, where it started.

**Visual:** one card, centered, max 480px. Price in `--font-display` with tabular numerals. Do NOT
show a struck-through "$19.99" next to the "$1" — that's the discount-theater move this audience
distrusts. State both prices plainly, on separate lines.

---

### 3.11 Cost comparison vs. Shopify Basic

**Purpose:** make the platform-tax argument with numbers a skeptic can verify. Fairness is the
persuasion here. Any strawman we plant, this buyer pulls up.

| Element | Copy |
|---|---|
| Eyebrow | `THE MATH` |
| Headline (H2) | Twelve months, side by side. |
| Subhead | Shopify Basic is a good product. It's also priced for someone who hasn't already solved shipping. |

**Table**

| | RebelShops | Shopify Basic |
|---|---|---|
| Months 1–3 | $1 total | $39/mo = $117 |
| Months 4–12 | $19.99/mo = $179.91 | $39/mo = $351 |
| **12-month platform cost** | **$182.91** | **$468** |
| Billed annually instead | n/a — monthly only | $29/mo = $348/yr |
| Card processing | Stripe's published rate, direct to your account | Shopify Payments' published Basic rate |
| Extra fee for not using their processor | None — Stripe is the processor | Shopify charges an additional fee on Basic for third-party gateways |
| Purchase orders, suppliers | Included | App |
| Dead stock / turnover / valuation reports | Included | App |
| Shipping | Your existing ShipStation workflow | Shopify Shipping, or bolt ShipStation on |

**The line under the table:**
Against monthly billing, that's **$285 less over the first year**. Against Shopify's annual prepay,
**$165 less** — and you don't prepay.

**Fairness block — publish this, it is not optional:**

> **Where Shopify wins.** Shopify Basic gives you a custom domain, a mature theme ecosystem, a large
> app store, POS, multi-currency, abandoned-cart recovery and a support organization. We have none
> of that. If you need any of it, Shopify Basic at $39/mo is a fair price for it.
>
> **What we left out on purpose.** We're not counting app fees against Shopify, because which apps
> you need is your business and their prices aren't ours to quote. We're also not counting card
> processing as a difference, because on Shopify Basic with Shopify Payments the published online
> card rate and Stripe's published US standard rate are effectively the same — 2.9% + 30¢. The
> difference in this table is platform fee, and only platform fee.

> `[VERIFY BEFORE PUBLISH — every number in this table. As written it uses: Shopify Basic at $39/mo
> on monthly billing and $29/mo on annual billing (US, published), Shopify Payments Basic online card
> rate 2.9% + 30¢, Stripe US standard online card rate 2.9% + 30¢, and the existence of an additional
> Shopify fee on Basic for third-party payment gateways (do not state its percentage unless you have
> re-read Shopify's published pricing page that day). Cite the plan by name — "Shopify Basic" — never
> "Shopify". Link to shopify.com/pricing and stripe.com/pricing. If any figure has changed, change
> the table, not the framing. RebelShops totals are arithmetic: $1 + (9 × $19.99) = $182.91.]`

**Visual:** the table itself, `--paper-sunken` header row, tabular numerals, the two 12-month totals
in `--font-display`. Our total in `--mint-500`. The fairness block in a bordered well below it,
`--ink-500` text — visually quieter, but present. Never a bar chart; a chart here reads as spin.

---

### 3.12 Final CTA

| Element | Copy |
|---|---|
| Eyebrow | `` (none — this section carries no eyebrow) |
| Headline (H2) | Your catalog is already sitting there. |
| Subhead | Connect ShipStation, see your products in a real store, and decide in twenty minutes. |
| Primary CTA | `Start for $1` |
| Secondary CTA | `Open a demo store` |
| Microcopy | $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime. |

**Visual:** `--ink-950` ground, ember primary button, nothing else. No image. The page ends on the
offer, not on decoration.

---

### 3.13 FAQ (homepage)

**Headline (H2):** Questions worth asking before you connect an API key.

**1. What happens to my store if you shut down?**
Your catalog isn't here — it's in ShipStation, where it already was, and we only read from it.
Shutting down would cost you a storefront URL and your store's design, not your product data,
inventory or fulfillment. Your Stripe account and your ShipStation account are both yours and
outlive us. We'd give notice and export your orders and customers before going dark.
`[GATED: the export promise requires an orders/customers export. Only inventory CSV export exists
today (src/lib/utils/csv-export.ts). Either build it or cut the final sentence.]`

**2. Do you take a cut of my sales?**
No. Not a percentage, not a per-order fee, not a "growth tier" that introduces one later. $19.99 a
month is the entire amount we charge you. Stripe charges you its own published processing rate,
directly — we don't mark it up, and we don't see the money.

**3. Can I use my own domain?**
Not yet. Your store runs at a rebelshops.com address today. Custom domains are the most requested
thing we don't have, and if that's a dealbreaker, it should be — say so and we'll tell you when it
ships. `[GATED: rewrite this the day custom domains ship. There is zero custom-domain support in the
codebase right now. Do not soften it to "coming soon" with a date we can't hold.]`

**4. Is my ShipStation API key safe?**
`[GATED — DO NOT PUBLISH ANY SECURITY ANSWER YET. Credentials are currently stored base64-encoded,
not encrypted (src/lib/shipstation/auth.ts:12–17, src/lib/shipstation/v2Api.ts:226). Base64 is
encoding, not encryption. Publishing "encrypted at rest" today would be a lie. Fix the storage —
real symmetric encryption with a key outside the database — then publish the answer below.]`

> *Answer to publish once encryption is real:* Your key is stored encrypted at rest, is only ever
> decrypted server-side to call ShipStation, and is never sent to your browser. We use it to read
> your catalog and to hand orders to fulfillment — nothing else. You can rotate it in ShipStation or
> disconnect in your admin at any time, and the connection dies immediately.

**5. What if I don't use ShipStation?**
Then RebelShops is the wrong product for you, and you should stop reading. The entire value here is
that we read a catalog you've already built in ShipStation. Without that, you're doing the data
entry we exist to avoid — and there are better tools for starting from scratch.

**6. Do I have to change how I ship?**
No. That's the point. Keep your carriers, your rates, your presets, your label workflow, your
warehouses. Orders from your RebelShops store are handed to ShipStation for fulfillment and pick up
the process you already run. `[GATED: see §3.5 — do not upgrade this to "appear in your ShipStation
order queue" until orders are genuinely created there.]`

**7. Will this oversell my inventory?**
Stock levels come from ShipStation on a scheduled sync, so there's a window between a change in
ShipStation and a change on your storefront. Every sync is logged with a timestamp and a record
count, so you can see exactly how current your numbers are. If you're selling single-unit or
one-of-a-kind items across multiple channels, run the sync tight and watch the log.

**8. How many products can it handle?**
We haven't published a limit because we haven't stress-tested one honestly, and a made-up number
helps nobody. Catalogs in the hundreds of SKUs sync in minutes. If you're running tens of thousands,
email us before you sign up and we'll tell you the truth about it.

**9. Can I sell on RebelShops and Amazon and eBay at once?**
Yes — that's the normal case. RebelShops is a direct channel next to your marketplaces, reading the
same ShipStation stock levels they draw against. It's not a channel manager and doesn't arbitrate
between them.

**10. What's actually built, and what's marketing?**
Fair question to ask a new product. We keep a public list of what ships today and what doesn't, and
this FAQ names the gaps: no custom domains, no multi-currency, no POS, no app store. If you find
something on this site that the product doesn't do, tell us and we'll take it down.
`[GATED: the "public list" link requires the build log from §3.9. If it doesn't exist, keep the
answer and drop the first sentence's promise of a list.]`

---

## 4. Pricing page

### 4.1 Header

| Element | Copy |
|---|---|
| Eyebrow | `PRICING` |
| Headline (H1) | One plan. $19.99 a month. |
| Subhead | Your first three months cost $1 total. We never take a percentage of a sale. |

### 4.2 Plan card

- Plan name: `RebelShops`
- Eyebrow on card: `EVERYTHING, ONE PRICE`
- Price: `$1`
- Under price: `for your first 3 months`
- Then line: `then $19.99/mo`
- Badge: `0% transaction fees`
- CTA: `Start for $1`
- Microcopy under CTA: Card required. Cancel anytime in your admin.
- Second microcopy line: We email you 7 days before the $19.99 rate starts. `[GATED: requires billing + transactional email. If neither exists, cut the line — do not promise a notification we can't send.]`

> `[GATED: subscription billing. No billing or subscription code exists in the repo. The pricing page
> cannot go live with a working "Start for $1" flow until it does. If the page ships before billing,
> change the CTA to "Join the waitlist" and every "$1" claim to a stated future price — do not take a
> card you can't charge correctly.]`

**Included list** — reuse §3.10 verbatim.

**Not included list** — reuse §3.10 verbatim. Do not shorten it on the pricing page. This is the
page where honesty converts.

### 4.3 Comparison table rows

Header columns: `RebelShops — $19.99/mo` · `Shopify Basic — $39/mo`

| Row label | RebelShops | Shopify Basic |
|---|---|---|
| Monthly platform fee | $19.99 | $39 ($29 billed annually) |
| First 3 months | $1 total | $117 |
| First 12 months, platform fee only | $182.91 | $468 ($348 annual prepay) |
| Transaction fee taken by the platform | None | None with Shopify Payments; additional fee on third-party gateways |
| Card processing | Stripe's published rate, to your own account | Shopify Payments' published Basic rate |
| Catalog source | Reads your existing ShipStation catalog | You import or re-enter it |
| Inventory forecasting & reorder points | Included | App |
| Purchase orders & suppliers | Included | App |
| Dead stock / turnover / valuation reports | Included | App |
| Coupons | Included | Included |
| Blog | Included | Included |
| Store analytics incl. zero-result searches | Included | Included (search analytics varies by plan) |
| Custom domain | Not yet | Included |
| Themes | Color themes, store content fields | Large theme store |
| App ecosystem | None | Large |
| POS / multi-currency / subscriptions | No | Yes / Yes / Via app |
| Shipping workflow | Your existing ShipStation setup | Shopify Shipping, or add ShipStation |
| Contract | Month to month | Month to month or annual |

> `[VERIFY BEFORE PUBLISH: same rule as §3.11. Every Shopify cell must be checkable against
> shopify.com/pricing on the day of publish. Where a Shopify capability varies by plan, say so in the
> cell rather than picking the unflattering reading.]`

### 4.4 Pricing page FAQ

**Is the $1 a trial or a discount?**
A discount. You're on the real product with a real card on file from day one, at $1 for three
months. Nothing is limited, nothing unlocks later.

**What happens after three months?**
You're charged $19.99 a month. Same product, same features, no tiers.

**Do you take a percentage of my sales?**
No. Never. $19.99 is the entire amount we charge.

**What do I still pay for?**
Stripe's processing rate, direct to Stripe. Your ShipStation subscription, direct to ShipStation.
That's it.

**Can I cancel during the $1 period?**
Yes, in your admin, and you won't be charged the $19.99. You'll owe the $1.

**Is there an annual plan?**
No. Monthly only. We'd rather earn it twelve times than lock you in once.

**Will the price go up?**
If it ever does, existing accounts keep the price they signed up at. Writing that here is the point
of writing it here.

**Do you offer refunds?**
`[GATED: requires an actual refund policy decision. Write it, then publish it. Do not ship this page
with the question omitted — buyers read the absence.]`

---

## 5. Microcopy library

Reused across marketing and app. Sentence case for buttons, no terminal punctuation on labels, no
exclamation marks anywhere.

### 5.1 Buttons

| Context | Primary | Secondary |
|---|---|---|
| Hero | `Start for $1` | `See a live store` |
| Final CTA | `Start for $1` | `Open a demo store` |
| Nav bar | `Start for $1` | `Sign in` |
| Pricing page | `Start for $1` | `Read the FAQ` |
| "You already have this" section | `Connect ShipStation` | — |
| Feature — sync | `How the sync works` | — |
| Feature — inventory | `See what's included` | — |
| Demo stores page | `Open this store` | `Back to demo stores` |
| Signup form | `Create account` | `Sign in instead` |
| Wizard, mid-flow | `Continue` | `Back` |
| Wizard, final step | `Publish my store` | `Save as draft` |
| Integration form | `Test connection` | `Cancel` |
| Integration, after test passes | `Save and sync` | `Cancel` |
| Sync panel | `Sync now` | `View sync history` |
| Product list | `Add product` | `Export CSV` |
| Purchase order | `Create purchase order` | `Download PDF` |
| Purchase order receipt | `Receive items` | `Cancel` |
| Coupon | `Create coupon` | `Cancel` |
| Blog | `Publish post` | `Save draft` |
| Design page | `Publish changes` | `Discard changes` |
| Destructive confirm | `Delete permanently` | `Keep it` |
| Disconnect integration | `Disconnect ShipStation` | `Cancel` |
| Account | `Cancel subscription` | `Never mind` |
| Empty-state default | `Get started` | — |
| Error state | `Try again` | `Contact support` |

**Never use:** "Submit", "Click here", "Learn more", "Get Started Now", "Sign Up Free", "Join the
Rebellion", any button with an exclamation mark, or two primary buttons in one view.

### 5.2 Form labels, placeholders, help and validation

| Field | Label | Placeholder | Helper | Error |
|---|---|---|---|---|
| Email | Email | you@company.com | — | Enter a valid email address |
| Email, taken | — | — | — | An account already uses this email. Sign in instead. |
| Password | Password | — | At least 12 characters | Use at least 12 characters |
| Password confirm | Confirm password | — | — | Passwords don't match |
| First name | First name | — | — | Enter your first name |
| Store name | Store name | Northgate Supply | Shown in your store header and page titles | Enter a store name |
| Store URL | Store address | northgate-supply | Your store will live at rebelshops.com/northgate-supply | Use lowercase letters, numbers and hyphens only |
| Store URL, taken | — | — | — | That address is taken. Try another. |
| Store description | Description | What you sell, in a sentence | Used in search results and social shares | — |
| Hero title | Hero headline | Built for the job site | The first line customers read | — |
| Hero description | Hero subhead | — | One or two sentences under the headline | — |
| ShipStation API key | ShipStation API key | — | Find this in ShipStation under Settings → Account → API Settings. We test it before saving. | Enter your ShipStation API key |
| ShipStation API secret | ShipStation API secret | — | Shown once when you generate the key in ShipStation | Enter your ShipStation API secret |
| Stripe secret key | Stripe secret key | sk_live_… | From your Stripe dashboard under Developers → API keys | Enter a valid Stripe secret key |
| Coupon code | Coupon code | SPRING10 | Customers type this at checkout. Uppercase, no spaces. | Use uppercase letters and numbers only |
| Discount amount | Discount | — | Percentage off, or a fixed dollar amount | Enter an amount greater than zero |
| Discount over 100% | — | — | — | A percentage discount can't exceed 100% |
| Reorder point | Reorder point | — | We suggest a value from your sales velocity. Override it if you know better. | Enter a whole number, 0 or higher |
| Unit cost | Unit cost | 0.00 | Used for valuation and dead-stock reports | Enter a valid amount |
| Supplier name | Supplier | — | — | Choose a supplier |
| PO quantity | Quantity | — | — | Enter a quantity of at least 1 |
| Required, generic | — | — | — | This field is required |
| Too long, generic | — | — | — | Keep this under {n} characters |
| Network failure on submit | — | — | — | We couldn't save that. Check your connection and try again. |

### 5.3 Empty states

Every empty state: one line of what goes here, one primary action. Never a bare "No data."

| Screen | Headline | Body | Action |
|---|---|---|---|
| Products, before first sync | No products yet | Connect ShipStation and we'll pull your catalog in. | `Connect ShipStation` |
| Products, after sync, none returned | Your catalog came back empty | The connection worked, but ShipStation returned no products. Check that products exist on the account tied to this API key. | `View sync log` |
| Orders | No orders yet | Orders from your storefront show up here, with their fulfillment status. | `Open my store` |
| Inventory | Nothing to track yet | Stock levels arrive with your first product sync. | `Sync now` |
| Dead stock report | No dead stock | Nothing has been sitting unsold long enough to flag. That's the good outcome. | `View turnover report` |
| Purchase orders | No purchase orders | Create one against a supplier when it's time to restock. | `Create purchase order` |
| Suppliers | No suppliers yet | Add a supplier before you create your first purchase order. | `Add supplier` |
| Coupons | No coupons | Create a code customers can enter at checkout. | `Create coupon` |
| Blog | No posts yet | Posts show up on your store and in search results. | `Write your first post` |
| Analytics, no traffic | No visitors yet | Traffic shows up here within a few minutes of your first visitor. | `Open my store` |
| Search analytics | No searches yet | Once customers search your store, you'll see what they looked for — and what returned nothing. | — |
| Sync history | No syncs yet | Every sync is logged here with its record count and duration. | `Sync now` |
| Search results, storefront | No results for "{query}" | Try a shorter search, or browse the full catalog. | `Browse all products` |
| Cart | Your cart is empty | — | `Continue shopping` |

### 5.4 Error states

| Situation | Message | Action |
|---|---|---|
| ShipStation key rejected | ShipStation rejected that key. Check that it's an active API key and secret from the right account. | `Try again` |
| ShipStation unreachable | We couldn't reach ShipStation. This is usually on their end — your data is untouched. | `Retry` |
| Sync failed, one operation | The {operation} sync failed: {error}. Everything else synced. | `Retry {operation}` |
| Sync failed, all | Sync failed before it started. Your ShipStation connection may have been revoked. | `Check connection` |
| Sync partially complete | {n} of {total} products synced. {failed} failed — see the log for which. | `View sync log` |
| Stripe not connected at checkout | This store can't take payments yet. | `Connect Stripe` |
| Payment declined | The card was declined. Try another card, or contact your bank. | `Try another card` |
| Out of stock during checkout | {product} sold out while you were checking out. It's been removed from your cart. | `Review cart` |
| Session expired | You've been signed out. Sign in to pick up where you left off. | `Sign in` |
| Permission denied | You don't have access to that. | `Back to dashboard` |
| 404 | That page doesn't exist. | `Back to dashboard` |
| 500 | Something broke on our end. We've been notified. | `Try again` |
| Storefront 404 | We couldn't find that product. It may have sold out or been removed. | `Browse all products` |
| Rate limited by ShipStation | ShipStation is rate-limiting us. The sync will resume automatically. | `View sync log` |
| Save conflict | Someone else changed this while you were editing. | `Reload and compare` |

**Error copy rules:** name what failed, name whose fault it is, give one action. Never "Oops!",
never "Something went wrong" without a next step, never an error code as the only content, never an
exclamation mark.

### 5.5 Onboarding wizard

**Wizard title:** Set up your store
**Progress label format:** `Step {n} of 5`

| Step | Title | Helper text | Primary button |
|---|---|---|---|
| 1 | Create your account | Email and a password. Two minutes, and nothing syncs yet. | `Continue` |
| 2 | Name your store | Your store name and address. Both can change later. | `Continue` |
| 3 | Connect ShipStation | Paste your API key and secret. We test the connection before saving anything. | `Test connection` |
| 4 | Pull in your catalog | We'll read your products, SKUs, prices, images and stock levels. A few hundred SKUs takes a few minutes — you can close this tab. | `Start sync` |
| 5 | Style it and publish | Pick a theme and write your hero copy. Publish when it looks right. | `Publish my store` |

**In-step microcopy**

| Where | Copy |
|---|---|
| Step 3, above the key field | Generate a key in ShipStation under Settings → Account → API Settings. |
| Step 3, under the key field | Setup only reads. Products, SKUs, prices, images and stock levels come in, and nothing in ShipStation changes while you set up. Once your store is live, this same key sends each paid order over for fulfilment. `[Gate lifted 2026-08-19: the write-back path is live — paid orders are pushed as `POST /v2/shipments`. Say what we write, not that we never write.]` |
| Step 3, while testing | Testing your connection… |
| Step 3, on success | Connected. We can see your ShipStation account. |
| Step 4, while syncing | Syncing your catalog. {n} products so far. |
| Step 4, on completion | {n} products, {m} SKUs and stock for {w} warehouses are in. |
| Step 4, partial | {n} products synced, {failed} failed. You can publish now and fix those after. |
| Step 5, preview note | This is your real store. Nobody can see it until you publish. |
| Skip link, any step | `Skip for now` |
| Exit link | `Save and finish later` |

### 5.6 Success and confirmation messages

| Event | Message |
|---|---|
| Account created | Account created. Let's connect ShipStation. |
| ShipStation connected | ShipStation connected. |
| Sync complete | Sync complete. {n} products updated in {duration}. |
| Store published | Your store is live at {url}. |
| Store unpublished | Your store is offline. Only you can see it. |
| Design changes published | Changes are live. |
| Product updated | Product saved. |
| Coupon created | Coupon {code} is live. |
| Coupon deactivated | Coupon {code} is off. |
| Purchase order created | Purchase order {number} created. |
| Purchase order received | {n} items received into stock. |
| Blog post published | Post published. |
| CSV exported | Export ready. |
| Subscription started | You're on the $1 plan for three months. We'll email before it moves to $19.99. |
| Subscription cancelled | Cancelled. Your store stays live until {date}. |
| Password changed | Password changed. |
| ShipStation disconnected | ShipStation disconnected. Your catalog stays in ShipStation; your storefront will stop updating. |
| Customer order placed (storefront) | Order {number} confirmed. We've emailed your receipt to {email}. |

---

## 6. SEO

**Global:** site name `RebelShops`. Canonical host `https://rebelshops.com`. Every page has one H1.
Retire `schmostore.com` and `rebelcart.com` from all schema, canonicals and breadcrumbs.

### 6.1 Title tags and meta descriptions

| Page | Title tag (≤60 char target) | Meta description (≤155 char target) |
|---|---|---|
| Home | `ShipStation Storefront — Sell Your Catalog \| RebelShops` | Turn your ShipStation catalog into an online store. Products, SKUs and stock sync automatically. $1 for 3 months, then $19.99/mo. No transaction fees. |
| Pricing | `Pricing — $19.99/mo, No Transaction Fees \| RebelShops` | One plan, $19.99 a month, $1 for your first three months. We never take a cut of your sales. See the 12-month math against Shopify Basic. |
| Features | `Features — Sync, Inventory, Purchase Orders \| RebelShops` | ShipStation catalog sync, demand forecasting, reorder points, dead-stock reports, purchase orders and coupons. Included, not add-ons. |
| How it works | `How It Works — Live Store in Under 20 Minutes \| RebelShops` | Paste your ShipStation API key, let your catalog sync, style it and publish. Honest time estimates for each step. |
| Demo stores | `Demo Stores — See RebelShops Running \| RebelShops` | Browse real RebelShops storefronts. Search them, add to cart, walk the checkout. Same code your store would run on. |

### 6.2 Target keywords

**Primary (buy intent, low competition, exactly our buyer):**
`shipstation storefront` · `shipstation online store` · `sell from shipstation` ·
`shipstation ecommerce integration` · `shipstation website`

**Secondary:**
`shopify alternative for shipstation users` · `ecommerce platform no transaction fees` ·
`direct to consumer channel for amazon sellers` · `cheap shopify alternative $19` ·
`shipstation inventory management storefront`

**Long tail, worth a page each:**
`how to sell products from my shipstation account` ·
`shipstation to online store sync` ·
`ecommerce platform that doesn't charge transaction fees` ·
`shopify basic vs alternatives 2026 cost comparison` ·
`purchase orders and dead stock reports for small sellers`

**Do not target:** `best ecommerce platform`, `shopify alternative` unqualified, `online store
builder`. We lose those and they bring the wrong visitor.

### 6.3 OG / social share copy

| Field | Value |
|---|---|
| `og:site_name` | RebelShops |
| `og:type` | website |
| `og:title` (home) | Your ShipStation catalog, now a storefront |
| `og:description` (home) | Connect ShipStation, get a real online store from the products and stock you already have. $1 for 3 months, then $19.99/mo. No transaction fees. |
| `og:title` (pricing) | $19.99 a month. No cut of your sales. |
| `og:description` (pricing) | $1 for your first three months, then $19.99 flat. The 12-month math against Shopify Basic, with the parts where they win. |
| `og:image` | A real screenshot of a live RebelShops storefront, 1200×630, with the wordmark bottom-left. Not an illustration, not a slogan card, not a stock photo. |
| `og:image:alt` | A RebelShops storefront showing a product grid with live stock levels |
| `twitter:card` | summary_large_image |
| `twitter:title` | Your ShipStation catalog, now a storefront |
| `twitter:description` | You already built the catalog in ShipStation. We give it a store. $1 for 3 months, then $19.99/mo. |

**Schema.org — required deletions and rules:**
- Delete `aggregateRating` from `LandingPageMeta.tsx`. No rating until real ratings exist.
- Delete the `review` array and the "Sarah Johnson" entry. Fabricated.
- `Organization.name` and `SoftwareApplication.name` → `RebelShops`.
- `Offer.price` → `19.99`, `priceCurrency` → `USD`. Remove "Free trial" — there is no free trial;
  it's a $1 promotional rate. `[GATED: only publish Offer schema once billing is live.]`
- `FAQPage` may only contain questions and answers that appear verbatim on the rendered page.
- All URLs → `https://rebelshops.com`.

---

## 7. Tone: do / don't

### The rules

| Do | Don't |
|---|---|
| Name the specific thing: "ShipStation", "$19.99", "2.9% + 30¢" | Name a category: "shipping platforms", "low-cost", "affordable" |
| Say what it does | Say what it "empowers you to" do |
| State a limitation before the buyer finds it | Omit it and hope |
| Use short declaratives. Fragments are fine. | Stack three clauses with "and" |
| Speak to a working seller | Speak to an aspiring entrepreneur |
| Use "rebel" in the name only | Build metaphors on "rebellion", "join the movement", "fight back" |
| Write numbers as numerals: 3 steps, 20 minutes, $19.99 | Write "several", "a few", "lightning fast", "in no time" |
| Use a period | Use an exclamation mark in body copy |
| Say "we haven't built that" | Say "coming soon" without a date we can hold |
| Let a screenshot be the proof | Add an adjective where a screenshot would do |

### Before / after — real strings from the current site

**1.** `src/components/landing/Features.tsx`
> **Before:** "Rebellion starts in 3 simple steps. No technical knowledge required - connect any shipping platform and launch your store in minutes."
> **After:** "Three steps: paste your ShipStation API key, let your catalog sync, publish. Under 20 minutes."
> *Why:* "Rebellion starts" is theme, not information. "Any shipping platform" is false — only ShipStation is integrated. "No technical knowledge required" is a claim the API-key step immediately contradicts; naming the step is more reassuring than denying difficulty.

**2.** `src/components/landing/Features.tsx`
> **Before:** "Rebel Against Big Tech — Built for independence with clean URLs, fast loading, and SEO optimization. Don't pay premium prices for basic features."
> **After:** "Findable by default — Every store gets clean URLs, product metadata search engines can read, and pages that render server-side."
> *Why:* "Rebel Against Big Tech" is a mood, and this buyer sells on Amazon — the posture insults them. The features are real; state them.

**3.** `src/components/landing/Hero.tsx:25`
> **Before:** "Build your shop, power it with your favorite shipping app, and take back your margins"
> **After:** "Your ShipStation catalog, now a storefront."
> *Why:* Three clauses and 13 words, none of them ShipStation. The reader can't tell what this is. "Take back your margins" implies we affect margin, which — with no transaction fees on either side — is a $19–$29/mo platform-fee difference, not a margin story.

**4.** `src/components/landing/Hero.tsx:26`
> **Before:** "RebelShop: The low-cost ecommerce solution that lets you keep your profits. Connect any shipping platform, create stunning stores, and ship efficiently without expensive software fees."
> **After:** "Connect your ShipStation account and RebelShops builds a real online store from the products, SKUs and stock levels already in it. Payments through your Stripe account. Orders come back to ShipStation."
> *Why:* Wrong product name. "Solution", "stunning", "efficiently", "expensive software fees" are all unfalsifiable. And "any shipping platform" is still false.

**5.** `src/components/landing/CTASection.tsx`
> **Before:** "Ready to rebel against high fees? Join the rebellion and take back your margins. Create your low-cost storefront and keep more of what you earn."
> **After:** "Your catalog is already sitting there. Connect ShipStation, see your products in a real store, and decide in twenty minutes."
> *Why:* Four sentences of metaphor with one fact between them. The rewrite makes an argument from something the reader knows is true.

**6.** `src/components/landing/Features.tsx`
> **Before:** "Rebel-Ready Design — Professional themes designed to convert. Stand out from cookie-cutter stores with designs that capture your rebellious spirit."
> **After:** "Make it yours — Set your store name, hero copy and color theme, then publish. Change any of it later in a click."
> *Why:* "Designed to convert" is a claim with no evidence behind it. "Rebellious spirit" is not a design system. The rewrite describes what the design page actually does today.

**7.** `src/components/landing/HowItWorks.tsx`
> **Before:** "Your store is ready to go live! Share your custom URL and start selling with integrated payment processing."
> **After:** "Publish, and your store is live at your RebelShops address."
> *Why:* Exclamation mark. "Custom URL" implies a custom domain we don't support. "Integrated payment processing" implies a working checkout that isn't built yet.

**8.** `src/components/seo/LandingPageMeta.tsx` FAQ schema
> **Before:** "No technical skills required! Our platform is designed to be user-friendly with drag-and-drop customization and automated ShipStation integration."
> **After:** "You'll need an API key from ShipStation, which takes about two minutes to generate. After that, nothing requires code."
> *Why:* Exclamation mark, wrong product name in the question it answers, and "drag-and-drop customization" does not exist. Naming the one genuinely technical step is more credible than claiming there are none.

---

## 8. Implementation checklist for the build agent

Before this site goes live:

1. Rename every occurrence of RebelShop / RebelCart / Schmo Store / Rebel Shops to **RebelShops**, including component filenames and exported identifiers (§0).
2. Delete `aggregateRating` and the `review` array from `src/components/seo/LandingPageMeta.tsx`. Non-negotiable.
3. Remove every "any shipping platform" claim. We integrate with ShipStation.
4. Do not publish §3.7 (Stripe) until a real payment completes end to end.
5. Do not publish FAQ #4 (API key security) until credentials are actually encrypted, not base64-encoded.
6. Do not publish "orders appear in your ShipStation order queue" or "bidirectional" until true (§3.5).
7. Keep the custom-domain "not yet" answer until custom domains ship.
8. Re-verify every Shopify and Stripe figure against their published pricing pages on publish day (§3.11, §4.3).
9. Ship the "Where Shopify wins" block. It is not optional.
10. If the build log page doesn't exist, cut the two cards and answers that link to it rather than linking to a stub.
