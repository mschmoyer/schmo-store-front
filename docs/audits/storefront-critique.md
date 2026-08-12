# Storefront Critique — the shopper-facing surface

> Reviewed 2026-08-12 against the dev server on `:3000`, Chromium 1194 at 1440 / 390 / 320.
> Scope: `src/app/store/**`, `src/components/store/**`, `src/components/product/**`.
> Every claim below is a measurement, a sampled colour, a `file:line`, or a screenshot in
> `.scratch/shots/crit/`. Review only — no production code was changed.
>
> **Environment caveat.** Two things happened *during* the audit, caused by other sessions sharing
> this database and working tree, not by the storefront:
> (1) at 14:02 a process overwrote `storefront_themes` for `demo-electronics` with
> `brand.color = "#123456"` (published) and `"#7733aa"` (draft), replacing the seeded Voltage green;
> (2) near the end, a concurrent edit to `src/components/admin/AdminHeader.tsx` broke the dev build.
> All colour measurements below were taken **before** 14:02 against the real seeded presets, and the
> structural findings were re-verified afterwards in a colour-independent way. Where that matters I
> say so.

---

## 1. Verdict — **D+**

The storefront is two products stapled together. The half built on the new theme engine — home,
listing, product detail, cart — is competent-to-good work: a disciplined token kit with genuinely
zero hardcoded colours, a product grid that reflows cleanly from 320 to 1440 with no horizontal
scroll anywhere, an ARIA-correct gallery, real `<label for>` on every input, `aria-label` on every
icon-only control, and a themed generated fallback mark instead of a grey camera. The Fernwood
product page (`.scratch/shots/crit/pdp-craft.png`) is a page a merchant would be pleased to show
someone. Then the shopper clicks Checkout and lands on a pure-white RebelShops admin form
(`elec-1440-6checkout.png`) — different font, different chrome, different everything, with all 40 of
its theme variables resolving to the empty string — and the illusion that this is *their* shop ends
at the exact moment a card number is required. That is not a polish problem; it is the difference
between a storefront and a demo. On top of it sit two failures that would embarrass the company if a
merchant found them first: the storefront's entire body is delivered inside a `hidden` div and
un-hidden by an inline script, so **with JavaScript off a merchant's shop is an empty page between a
header and a footer** (28,814 characters of product content, invisible); and every solid `<a>`
button silently bypasses the engine's auto-contrast guarantee, which shipped the Voltage store's
primary hero CTA at **2.07:1**. Would a merchant paying $19.99/mo be proud of this? Of the home page
and the PDP, yes. Of the checkout, no — they would not send a customer to it. Would a shopper trust
it with a card? They would trust the shop; they would hesitate at the checkout, because it stops
looking like the shop they were in ten seconds ago.

---

## 2. Do the presets actually differ?

**No — not as *designs*. They differ as skins.** This is the core product claim and it is half true.

### What genuinely varies (verified, per store, from the emitted `--st-*` block)

| Token | Basecamp (Voltage) | Fernwood (Studio) | Ironline (Fresh) |
|---|---|---|---|
| `--st-brand` | `#22c55e` | `#c07908` | `#0d9488` |
| `--st-surface` | `#08090b` | `#faf7f2` | `#f5fbf7` |
| `--st-font-heading` | Space Grotesk | **Fraunces (serif)** | Plus Jakarta Sans |
| `--st-heading-case` / weight | `uppercase` / 700 | `none` / 500 | `none` / 800 |
| `--st-radius-card` / button | `0px` / `0px` | `8px` / `8px` | `24px` / `999px` |
| `--st-shadow-card` | `none` | `none` | `0 2px 4px…, 0 8px 20px -4px…` |
| `--st-space-8` (density) | `34px` (0.85) | `48px` (1.2) | `48px` (1.2) |
| `--st-container` | `1140px` | `1320px` | `1320px` |
| buttons / card align | solid, left | **outline**, left | solid, **centre** |
| `showVendor` / `showQuickAdd` | false / true | **true / false** | false / true |
| header / footer | logo-left / minimal | **logo-left-nav-below** / columns | logo-left / columns |

That is real, and it is correctly wired end to end — Fernwood really does drop the quick-add button,
really does show a category eyebrow on every card, really does put its nav on a second row. Compare
`home-elec-1440.png`, `home-craft-1440.png`, `home-fit-1440.png`: three distinct *palettes and
typographic registers*.

### What does not vary — and it is the part that makes a design a design

Put the three full-page screenshots side by side and the composition is byte-identical:

```
hero → value-props → featured-collection → image-with-text → collection-grid → testimonials → newsletter
```

Seven sections, same order, on all three, measured off the DOM (`data-section-type`). Same copy,
too: all three heroes read *"Everything in stock. Shipped today."*, all three carry
*"Run by people who pack the boxes"*, all three say *"Best sellers / What people are actually buying
this month."* A merchant demoing "three different storefronts" to a prospect shows them the same
words three times.

**Root cause, and it is structural, not cosmetic:** `PresetDefinition`
(`src/lib/storefront-theme/types.ts:268-277`) carries `theme: StorefrontTheme` and **no `sections`
field**. `grep -n "sections" src/lib/storefront-theme/presets.ts` returns nothing. Every one of the
six presets therefore falls through to the single hardcoded list in
`src/lib/storefront-theme/sections.ts:518` (`defaultSections()`). Spec §6 requires presets to be
*"real, differentiated looks, not hue rotations of one design"*; spec §8 calls sections *"the feature
that makes the customizer feel like Shopify rather than a settings form."* The engine honours §6 at
the token layer and cannot honour it at the composition layer, because the type will not let it.

Two knock-on effects visible in the demo:

- `--st-ratio-product` is `1 / 1` on all three stores. The six presets *do* vary `imageRatio`
  (`presets.ts:60/113/164/215/270/321` — square / square / portrait / landscape / portrait / square),
  but the three demo stores were assigned the three square presets, so the knob is invisible in the
  one place a prospect will look.
- Fernwood and Ironline are *identical* in density (`--st-space-8: 48px`), container (`1320px`),
  ratio and border width. "Warm editorial" and "bright and roomy" resolve to the same box model.

**Fix:** add `sections?: Section[]` to `PresetDefinition` and give at least Studio, Voltage and
Marquee their own composition and copy — Voltage should not open on the same centred rich-text block
as a craft shop. Until then, "six presets" is six colourways.

---

## 3. Blocking defects, ranked

### B1 — Checkout and order-confirmation are not the merchant's shop at all
`src/app/store/[storeSlug]/checkout/layout.tsx:1-16` · `src/app/store/[storeSlug]/order-success/page.tsx`
Screenshots: `elec-1440-6checkout.png`, `elec-390-6checkout.png`, `elec-1440-7success.png`

Four storefront pages render `StorefrontShell` (home, `/products`, `/product/[id]`, `/cart`).
Checkout, order-success and account do not. Measured on `/store/demo-electronics/checkout`:

```
document.querySelector('[data-store-id]')   →  false   (no storefront wrapper)
--st-brand, --st-surface, --st-text, --st-font-heading  →  "" (all empty)
--theme-primary, --theme-background, --theme-text …     →  "" (all empty)
body background-color                        →  rgb(255, 255, 255)
body font-family                             →  Inter  (RebelShops chrome)
```

`checkout/page.tsx` contains **40** `var(--theme-*)` references and `order-success/page.tsx` **20**;
every one resolves to the empty string. `cart/layout.tsx` even documents the fix — *"This used to
render `TopNav`, which put RebelShops branding above a merchant's cart"* — and `checkout/layout.tsx`
still does exactly that, on line 10.

Consequences a shopper sees, in order: the black Basecamp Audio shop becomes a white page; the
merchant's header, announcement bar, search, nav and footer all disappear, replaced by a
RebelShops nav reading "Shop / Journal"; the "Apply" coupon button renders as inert grey rather than
the brand; and on mobile the entire order summary sits below **2,320px** of form, so the total is
never on screen while the shopper types. `order-success` is worse: no header, no footer, no store
name, a floating white card, and — on the error branch — **no link out of the page at all**.

**Fix:** delete `checkout/layout.tsx`, wrap both pages in `StorefrontShell` the way `cart/page.tsx`
does, and migrate their `--theme-*` references to `--st-*`. This is the single highest-value change
in the report.

---

### B2 — With JavaScript off, a merchant's shop is empty
`src/app/store/[storeSlug]/page.tsx:62-74`
Screenshots: `nojs-home.png`, `nojs-products.png`

Measured with `javaScriptEnabled: false`, after a 4-second settle:

| Page | rendered height | visible text | content parked in `div[hidden]` |
|---|---|---|---|
| `/store/demo-electronics` | 900px | **347 chars** (header + footer only) | **28,814 chars** in `#S:0` |
| `/store/demo-electronics/products` | 941px | **0 chars** | **33,468 chars** in `#S:2` |

The whole storefront body is inside a Suspense boundary. React streams the real markup into
`<div hidden id="S:0">` and un-hides it with an inline `$RC()` script. No script, no shop. Any
blocked/failed bundle, any text-mode client, any non-JS crawler gets a header, a footer and a void
where the products should be. `nojs-home.png` is that void.

`/products` is worse than "empty" — it is *wrong*: `products/loading.tsx:16-24` renders
`ProductGridSkeleton` **outside** `StorefrontShell`, so there is no `<style>` block, no `--st-*`, no
header and no footer. The result (`nojs-products.png`) is twelve pale-grey tiles on a pure-white
page — a full-screen white flash in the middle of a black storefront, which is also what a real
shopper on a slow connection sees for the duration of the load.

**Fix:** (a) render the sections without a Suspense boundary, or give the boundary a server-rendered
non-hidden fallback; (b) wrap `products/loading.tsx` in the themed shell so the skeleton is at least
the merchant's colour.

---

### B3 — Every `<a>` button ignores `--st-on-brand`; measured 2.07:1 on a primary CTA
`src/components/store/theme/StorefrontStyle.tsx:104`
Screenshots: `home-elec-1440.png` (hero), `edge-emptycart.png` ("Start shopping"), `elec-1440-5cart.png` ("Checkout")

`baseRules()` emits `${scope} a { color: inherit; }` at specificity **(0,2,1)**
(`.storefront` + `[data-store-id="…"]` + `a`). `.btn { color: var(--_fg) }` in
`StoreUI.module.css:110` is **(0,1,0)**. The scoped rule wins, so every link-shaped button inherits
`--st-text` instead of the `--stx-btn-fg` it was given.

Proved colour-independently — same class, same variable, different tag:

| store | `--stx-btn-fg` | `<button>` computed | `<a>` computed |
|---|---|---|---|
| demo-electronics | `#f4f7fe` | `rgb(244,247,254)` ✅ | `rgb(242,244,247)` = `--st-text` ❌ |
| fitness-pro | `#071a12` | `rgb(7,26,18)` ✅ | `rgb(15,35,26)` = `--st-text` ❌ |

Contrast measured on the seeded Voltage green (`#22c55e`), before the DB was overwritten:

| control | tag | contrast | verdict |
|---|---|---|---|
| Hero "Shop all products" | `<a>` | **2.07:1** | fails AA (needs 4.5) |
| Empty-cart "Start shopping" | `<a>` | **2.07:1** | fails AA |
| Card "Quick add" | `<button>` | 7.95:1 | passes |
| Footer "Subscribe" | `<button>` | 7.95:1 | passes |
| Ironline hero "Shop all products" | `<a>` | **4.40:1** | fails AA |
| Ironline "Quick add" | `<button>` | 4.81:1 | passes (barely) |

Look at `elec-1440-5cart.png`: the green "CHECKOUT" button and the green "SUBSCRIBE" button are 400px
apart, both `.btn`, and their labels are different colours. Spec §3 calls auto-contrast *"the single
most important thing the engine does; it is what keeps merchant stores from looking broken."* The
engine computed the right answer; the renderer throws it away for half the buttons, and there is no
guard — a merchant who picks a pale brand colour gets an unreadable hero CTA and no warning.

**Fix:** scope the reset to `${scope} a:not([class*="btn"])`, or raise `.btn`'s specificity, or set
`color` on `.btn` via the same scope prefix. Add a test asserting `<a class=btn>` and
`<button class=btn>` compute the same `color`.

---

### B4 — Disabled "Out of stock" CTA is illegible: 1.71:1 and 1.75:1
`src/components/store/ui/StoreUI.module.css:131-135`
Screenshots: `edge-oos.png`, `oos-btn.png`, `pdp-craft.png`

`.btn:disabled { opacity: 0.5 }` is applied to a fully brand-filled button, so the label and the fill
fade together and the ratio between them collapses.

| store | composited fill | composited label | contrast |
|---|---|---|---|
| Basecamp (solid) | `rgb(21,103,53)` | `rgb(21,63,39)` | **1.71:1** |
| Fernwood (outline) | `rgb(250,247,242)` | `rgb(221,184,125)` | **1.75:1** |

`oos-btn.png` shows the result: a 315×52px slab of dark green with the words "OUT OF STOCK" barely
discernible in it. It is simultaneously the largest, most saturated element in the buy box and the
least readable. On Fernwood the disabled outline button sits beside "View cart" at identical visual
weight (`pdp-craft.png`) — nothing tells a shopper which of the two is dead.

Two more things missing on the one seeded out-of-stock product (Pulse Smartwatch):
`document.body.textContent.match(/notify|back in stock|email me/i)` → **null**. There is no
back-in-stock capture, even though the store's own home page runs a "Get restock alerts" newsletter
section and the product copy says *"currently our most backordered item; new stock ships from the
factory every three weeks."* The highest-intent shopper on the site is given nothing to do.

**Fix:** give `:disabled` its own token treatment (a sunken fill + `--st-text-muted` label at full
opacity) rather than a blanket `opacity: 0.5`, and add a notify-me form to the out-of-stock buy box.

---

### B5 — CLS 0.3077 on the storefront home
`src/app/store/[storeSlug]/page.tsx:63-71`

Measured at 390×844 with 1.6 Mbps / 150 ms latency:

| page | CLS | FCP |
|---|---|---|
| `/` | **0.3077** | 2,692 ms |
| `/products` | 0.0007 | 2,124 ms |
| `/product/[id]` | 0.0000 | 1,236 ms |

Google's "poor" threshold is 0.25. The Suspense fallback is `HeroSkeleton` + an 8-card
`ProductGridSkeleton`; the content that replaces it is *seven sections* of entirely different
geometry, so the whole page jumps. `/products` scores 0.0007 precisely because its skeleton is 12
cards and its content is 12 cards. Design system §5: *"skeletons matching final layout geometry."*
The listing obeys it; the home does not.

**Fix:** make the home fallback mirror the real section list (or reserve its height), which the
section registry already knows enough to do.

---

### B6 — Every hero degrades to text-only, leaving 43–49% of the first screen empty
`src/components/store/sections/Hero.tsx:49-51` · `scripts/seed-demo.js:648`
Screenshots: all three `home-*-1440.png`, `m-hero.png`, `m-card.png`

Measured hero geometry at 1440:

| store | hero band | copy column | empty right | dead space under the CTA, inside the band |
|---|---|---|---|---|
| Basecamp | 1106 × 440 | 563px | **543px (49%)** | 85px |
| Fernwood | 1272 × 539 | 677px | **595px (47%)** | 96px |
| Ironline | 1272 × 514 | 726px | **546px (43%)** | 96px |

All three sections request `layout: 'split'` (`sections.ts:526`). `Hero.tsx:51` reads
`const layout = image ? requested : 'text-only'` — and `Hero.tsx:49` only ever looks at
`settings.image`. Meanwhile `scripts/seed-demo.js:648` seeds `hero_image_url` into store settings and
`public/demo/hero/{demo-electronics,artisan-craft,fitness-pro}.svg` exist on disk. `grep -n
"heroImage\|hero_image" src/app/store/_lib/*.ts src/components/store/sections/Hero.tsx` returns
**nothing**: the renderer never reads it. Three hero images were authored, shipped and are silently
ignored, and the first thing every visitor to every demo store sees is a half-empty gradient box.
A merchant who sets a hero image in store settings will get the same nothing.

**Fix:** fall back to `store.heroImageUrl` in `Hero.tsx:49`, the same way lines 38-40 already fall
back to `store.heroTitle`. Separately, `.heroPlainStart` should not leave a 543px column open — a
text-only hero with left alignment needs a narrower band or a compositional counterweight.

---

### B7 — Search input renders its icon on top of the first character
`src/components/store/product/CatalogueControls.module.css:63-65` vs `src/components/store/ui/StoreUI.module.css:297`
Screenshots: `zz-search.png`, `edge-noresults.png`, `list-craft.png`

`.searchInput { padding-inline-start: 38px }` is meant to clear the 17px magnifier positioned at
`inset-inline-start: 12px`. The input also carries `storeUi.input`, whose `padding` **shorthand**
(`StoreUI.module.css:297`) wins the cascade and resets it. Measured `paddingLeft`:

| store | declared | actual | icon occupies |
|---|---|---|---|
| demo-electronics | 38px | **13.6px** | 12–29px |
| artisan-craft | 38px | **19.2px** | 12–29px |
| fitness-pro | 38px | **19.2px** | 12–29px |

`zz-search.png` shows the query "zzzzqqq" rendering as a magnifier glyph superimposed on the leading
`z`. It affects the placeholder too, on every listing page of every store — visible in `list-craft.png`
as "⌕Search products".

**Fix:** replace the `padding` shorthand in `.input` with longhands, or use
`composes: input from '…'` so the ordering is deterministic.

---

### B8 — Touch targets below the 40px floor, in the tap path
`src/components/store/ui/StoreUI.module.css:164-168`

Design system §7: *"target size ≥ 40×40 on touch."* Measured at 390px:

| control | size | where |
|---|---|---|
| "Quick add" (`.btnSmall`) | 327 × **36** | every product card — the primary mobile add action |
| Category filter chips | 68–157 × **36** | `/products`, 5 of them |
| "Apply" (sort) | 74 × **36** | `/products` |
| "View all" | 95 × **36** | home |
| Breadcrumb links | 53–112 × **20** | PDP |
| Footer links | 25–48 × **20** | every page |

`.btnSmall { min-height: 36px }` is the source of the first four. Note this is a coarse-pointer
context: `@media (hover: none)` promotes quick-add to a static full-width control
(`ProductCard.module.css:268-275`), which is good thinking — it is just 4px too short.

**Fix:** `min-height: 40px` on `.btnSmall`, and a `@media (pointer: coarse)` bump for the
breadcrumb/footer link hit areas.

---

### B9 — Voltage cards are 1.10:1 against their own page
Preset: `src/lib/storefront-theme/presets.ts` (voltage, ~line 106-109)

Voltage sets `shadow: 'none'` and `radius: 'square'`. Sampled from the emitted block:

| pair | ratio |
|---|---|
| `--st-surface-raised` `#14161b` on `--st-surface` `#08090b` | **1.10:1** |
| `--st-border` `#272c35` on `--st-surface-raised` | **1.29:1** |

So a product card is separated from the page by a 1.10:1 fill difference and a 1.29:1 hairline, with
no shadow to help. WCAG 1.4.11 wants 3:1 for a UI boundary. This is the exact failure the house
design system already wrote down: *"when the card fill, the body copy and the button were all
`#111214`, the cards measured 1.05:1 and were effectively invisible. Dark surfaces use `#202327` with
a deliberately strong `#383B41` hairline, because there is no shadow on a dark ground to help an edge
read"* (`docs/design-system.md` §2). The Voltage preset does not follow it.

**Fix:** in the Voltage preset raise `surfaceRaised` and `border` to roughly the `#202327` / `#383B41`
relationship, or give dark-scheme themes a ring instead of a shadow.

---

### B10 — Product names truncate mid-word at 35 characters
`src/components/store/product/ProductCard.module.css:203-207`

Measured by un-clamping each `.name` and comparing heights: **3 of 12** names truncate on Voltage at
1440 — "Keystroke Mechanical Keyboard", "Aviator Headphones — Onyx", "Voltpack 20,000mAh Power Bank"
(visible in `home-elec-1440.png` as "KEYSTROKE MECHANICAL…"). Fernwood and Ironline: 0 of 12.

The cause is Voltage's `headingCase: uppercase` + Space Grotesk 700 in a 229px column
(compact density → narrower container → narrower cards) under a 2-line clamp. The catalogue's
**longest product name is 35 characters** (`max(length(name)) = 35` across all 36 seeded products).
Real ShipStation product names routinely run 60–90. Truncation is the default state for this preset,
not the exception, and the demo understates it.

**Fix:** allow 3 lines when `--st-heading-case: uppercase`, or reserve a fixed 3-line name box so
truncation at least does not vary card-to-card.

---

### B11 — `/store` is a public page that leaks internal state and off-brand copy
`src/app/store/page.tsx` · Screenshot: `storeindex.png`

This is indexable and shopper-facing. It renders:

- *"Discover Our Stores"* / *"Browse through our collection of amazing stores and find the perfect
  products for you."* — Title Case and exactly the register `docs/design-system.md` §1 bans
  ("Confident, concrete, allergic to fluff", anti-goal "generic SaaS template").
- Merchant admin metadata exposed to the public: an "Active" pill and a blue "Public Store" pill on
  every card. The blue is not in the palette.
- A test fixture published to the world: **"Basecamp Audio — Test catalogue for a hostile review."**
- Two cards both titled "Basecamp Audio" with nothing to tell them apart.
- ~150px of blank space at the top of every card where a logo or hero should be; no header, no
  footer, no navigation; 4 cards in a 3-column grid leaving an orphan.

Hardcoded colours here: `page.tsx:134`, `:139` (`rgba(0,0,0,0.15)` / `rgba(0,0,0,0.1)`) and `:189`
(`rgba(34,197,94,0.3)`), plus 13 dead `var(--theme-*)` references.

---

### B12 — ~2,000 lines of dead duplicate product components, carrying most of the hardcoded colour
`src/components/product/**`

Only `ProductSchema.tsx` is imported by anything (`product/[productId]/page.tsx:6`). The other eight
files import only each other:

| file | external importers |
|---|---|
| `ProductDetail.tsx`, `ShareModal.tsx` | 0 |
| `ProductGallery.tsx`, `ProductInfo.tsx`, `ProductRecommendations.tsx`, `ProductReviews.tsx`, `ProductSharing.tsx`, `ProductBreadcrumbs.tsx` | 0 outside `src/components/product/` |

2,190 lines total, of which ~2,000 are unreachable — and they hold **11 of the 14** hardcoded colours
in the whole audited scope. They are superseded by `src/components/store/product/**`.

**Fix:** delete the directory except `ProductSchema.tsx`. That closes most of §5 below in one commit.

---

## 4. The purchase journey, step by step

Walked three times (Basecamp / Fernwood / Ironline) at 1440 and 390. Screenshots
`elec-{1440,390}-{1home,2list,3pdp,4added,5cart,6checkout,7success}.png`.

| Step | What happens | Verdict |
|---|---|---|
| **Home** | Themed, server-rendered, no flash. Half the first screen is an empty hero (B6). Section alignment is inconsistent — "Best sellers" and "Shop by category" are left-aligned, the rich-text block and testimonials are centred, in the same scroll. Category grid puts 4 tiles in a 3-column layout, orphaning the fourth. Mobile home is **7,406px** — 8.8 phone screens. | Works. Looks unfinished. |
| **→ Listing** | Flashes an unthemed white 12-tile skeleton with no header or footer (B2). Then a good page: real GET-form search that works without JS, category chips with counts, sort, server-side pagination at 12/page (`queries.ts:309`). Search icon overlaps the text (B7). After a zero-result search the category chips still advertise their unfiltered counts ("Audio 3"), which is misleading. | Good page, bad entrance. |
| **→ Product detail** | See §5. Solid buy box; 37–39% of the description band is dead column. | Adequate. |
| **→ Add to cart** | **Genuinely good, and I initially got this wrong.** Sampled at 80/200/500/1000/2000ms: the label becomes "Added" with a tick for 1.8s, the button is disabled while in flight, and a real `role="status" aria-live="polite"` region announces *"Keystroke Mechanical Keyboard added to your cart."* (`AddToCartButton.tsx:24-90`). No mini-cart drawer, which is a missed upsell, but the confirmation is real. | Keep. |
| **→ Cart** | Themed correctly, uses the shell. Line-item name is not a link back to the product. "Remove" is a 46×16px underlined text link sharing a row with the qty stepper. ~300px of dead space between "Continue shopping" and the bottom of the summary card at 1440. "Checkout" CTA at 2.07:1 (B3). | Functional, unpolished. |
| **→ Checkout** | **Breaks.** White RebelShops admin form, no merchant chrome, all 40 theme vars empty (B1). Shows "Shipping $0.00 / Tax $0.00 / Total $159.00" before an address is entered, contradicting the cart's honest "Calculated at checkout". Zero visible focus ring on any of its links. On mobile the order summary is below 2,320px of form. | **Blocking.** |
| **→ Payment** | **Dead end.** All three demo stores render *"Payments are not set up for this store yet… orders cannot be placed right now."* No demo store can complete a purchase. | **Blocking for the demo.** |
| **→ Order success** | Unreachable via the demo. Forced directly, it renders an orphaned white card, no header, no footer, no store name, and on the error branch no link out (`elec-1440-7success.png`). | **Blocking.** |

---

## 5. Product detail page, specifically

Measured on `/store/demo-electronics/product/keystroke-mechanical-keyboard` and
`/store/artisan-craft/product/harvest-woven-tote`.

**Good.** Breadcrumbs are present and correct (store → Products → category → product). The buy box
has a clean hierarchy: category eyebrow, `h1`, SKU in the right register, price, stock, one-line
summary, then quantity + primary action. Stock state pairs a coloured dot **with a word and a
distinct dot shape per state** (`StoreUI.module.css:234-261` — filled / filled-square /
hollow-ring), so it survives greyscale and satisfies design-system §7. Compare-at pricing is right:
`$74.00 $89.00 Save 17%`, strike-through on the old price, saving in `--st-success`, all tabular. The
shipping-weight/boxed-size/delivery card is a genuinely useful ShipStation-native differentiator, and
the "shipping is calculated at checkout because a guess would be wrong" note is exactly the brand
voice. The gallery (`ProductGallery.tsx`) is an ARIA tablist with roving tabindex, arrow/Home/End
keys, one tab stop for the whole strip, and a live region — better than most commercial storefronts.
`ProductMark.tsx` is a properly themed, deterministic, SKU-seeded fallback with `role="img"`.

**Problems.**

1. **The description band wastes 37–39% of the page.** `.description { max-width: 76ch }`
   (`ProductDetail.module.css:206`) sits in a full-width band with nothing beside it:

   | store | description | container | dead column | dead area |
   |---|---|---|---|---|
   | Basecamp | 690px | 1140px | **450px (39%)** | 75,699 px² |
   | Fernwood | 830px | 1320px | **490px (37%)** | 105,293 px² |

   76ch is the right *measure*; the layout around it is wrong. Reviews, specs or a sticky buy summary
   belong in that rail.
2. **No variant selector exists.** `document.querySelectorAll('[class*="variant"], fieldset,
   [role="radiogroup"]')` → **0** on every PDP. Size/colour is table stakes for apparel — one of the
   six presets is explicitly aimed at it (Marquee).
3. **No reviews.** `/review/i.test(document.body.innerText)` → false. `ProductReviews.tsx` exists and
   is dead code (B12). Zero social proof on the page where the decision is made.
4. **Tags are decoration.** "keyboard / mechanical / desk" render as `<span class=pill>`, not links
   (`isLink: false` for all). They look interactive and are not.
5. **"View cart" is permanently rendered** below "Add to cart" (`BuyBox.tsx:104-106`), even with an
   empty cart — two stacked CTAs on every product, one of them meaningless most of the time.
6. **No zoom or lightbox** on the main image, and no sticky buy bar on mobile: the add-to-cart button
   scrolls out of view and never comes back.
7. **The fallback mark is never exercised.** Zero of 36 seeded products lack an image
   (`count(*) filter (where featured_image_url is null) = 0`), so the demo never shows what a shop
   looks like straight out of a ShipStation import — which is the most common merchant starting
   state, and the state the mark was built for. Seed two imageless SKUs.

---

## 6. Empty and edge states

| State | Result |
|---|---|
| **Empty cart** (`edge-emptycart.png`) | Correct per design-system §5: illustrative mark, one sentence, one primary action. The CTA is a 2.07:1 `<a>` (B3), and the icon tile (`--st-surface-raised` on `--st-surface`) is 1.10:1 on Voltage — nearly invisible. |
| **No search results** (`edge-noresults.png`) | Good: mark, the query echoed back, a suggestion, a "Clear filters" action. Two nits — the heading uppercases the shopper's own query (`RESULTS FOR "ZZZZQQQ"` above body text reading `"zzzzqqq"`), and the category chips still show unfiltered counts. |
| **Out of stock** (`edge-oos.png`) | See B4. Card treatment on the grid is good — image at `opacity .55 / saturate .65` with a "Sold out" badge and a hollow-ring dot. The PDP treatment is not. |
| **Low stock** (`edge-lowstock.png`) | Correct: "Only 3 left" / "Only 4 left" with an amber dot **and** the number in words. Not colour-alone. |
| **Long product name** | Truncates at 35 characters on Voltage (B10). No name in the seed data is long enough to properly test this. |
| **No product image** | Not reachable in the demo — see §5.7. |
| **One-product store** | Not reachable; every seeded store has 12 products. Untested. |
| **Empty catalogue** | Handled — `page.tsx:51-56` swaps in `EmptyCatalogue` before the section list. |

---

## 7. Theme contract compliance

### Hardcoded colours in scope — 14 total, all of them in dead or legacy code

| file:line | value |
|---|---|
| `src/app/store/page.tsx:134` | `rgba(0,0,0,0.15)` |
| `src/app/store/page.tsx:139` | `rgba(0,0,0,0.1)` |
| `src/app/store/page.tsx:189` | `rgba(34, 197, 94, 0.3)` |
| `src/app/store/[storeSlug]/order-success/page.tsx:262` | `color: '#fff'` |
| `src/components/product/ShareModal.tsx:33` | `#000000` |
| `src/components/product/ShareModal.tsx:39` | `#1877f2` |
| `src/components/product/ShareModal.tsx:45` | `#e60023` |
| `src/components/product/ShareModal.tsx:51` | `#25d366` |
| `src/components/product/ShareModal.tsx:57` | `#6b7280` |
| `src/components/product/ProductGallery.tsx:101` | `rgba(255,255,255,0.9)` |
| `src/components/product/ProductGallery.tsx:119` | `rgba(255,255,255,0.9)` |
| `src/components/product/ProductGallery.tsx:137` | `rgba(0,0,0,0.7)` |
| `src/components/product/ProductGallery.tsx:158` | `rgba(0,0,0,0.7)` |
| `src/components/product/ProductRecommendations.tsx:190` | `rgba(0,0,0,0.15)` |
| `src/components/product/ProductSharing.tsx:121` | `rgba(0,0,0,0.1)` |

**Eleven of these are in dead code (B12) and vanish when the directory is deleted.** The four
remaining live ones are on `/store` and `order-success`, both of which are already on the legacy
system.

**`src/components/store/**` is clean.** `StoreUI.module.css`, `ProductCard.module.css`,
`ProductDetail.module.css`, `Chrome.module.css`, `Sections.module.css`, `Cart.module.css`,
`CatalogueControls.module.css`, `StorefrontShell.module.css` contain **zero** hex, rgb, hsl or oklch
literals. That is the contract being honoured, and it deserves saying.

### Legacy `--theme-*` usage (all resolve to empty string)

| file | count |
|---|---|
| `src/app/store/[storeSlug]/checkout/page.tsx` | **40** |
| `src/app/store/[storeSlug]/order-success/page.tsx` | **20** |
| `src/components/product/ShareModal.tsx` (dead) | 13 |
| `src/app/store/page.tsx` | 13 |
| `src/app/store/[storeSlug]/account/page.tsx` | 2 |

### RebelShops chrome tokens used where `--st-*` belongs

- `src/components/store/states/States.module.css:15, 33, 34, 35, 40, 155, 168` — `var(--surface)`,
  `var(--surface-sunken)`, `var(--surface-raised)`, `var(--border)`, `var(--radius-xl)`,
  `var(--font-display)`. These are *bridged* inside the wrapper by
  `StorefrontStyle.tsx:52-81`, so they render correctly today — but `--radius-xl` and `--font-display`
  are **not** in the bridge list, so they fall through to RebelShops' 24px radius and Space Grotesk
  regardless of what the merchant chose. Fernwood's empty states get the wrong corner radius and the
  wrong typeface.
- `src/app/store/[storeSlug]/account/page.tsx:76, 82, 110, 116, 121, 122, 137, 143, 148, 149, 164,
  170, 175, 176, 194, 245` — raw `--border`, `--shadow-sm`, `--shadow-lg`, `--surface-accent`,
  `--shadow-primary` on a shopper-facing page with no wrapper to bridge them.

### The bigger leak: the root layout

`src/app/layout.tsx:3-6` imports `globals.css`, `@mantine/core/styles.css`,
`@mantine/notifications/styles.css` and `mantine-overrides.css` at the root, and `AppProviders`
wraps everything in `MantineProvider`. Consequence measured on a storefront home:
`getComputedStyle('.storefront')` exposes **624** custom properties, including the entire
`--mantine-color-*` scale, `--ink-*`, `--ember-*`, `--azure-*` and `--signal-*`. Every shopper on
every merchant's shop downloads and parses RebelShops' whole admin design system plus Mantine. The
`StorefrontStyle` bridge is good defensive work, but it is defending against a leak that should not
reach the storefront in the first place.

**What the engine gets right:** every token in spec §3 is emitted, scoped to
`.storefront[data-store-id="…"]` and never `:root`, server-rendered in the first byte with no
`useEffect`, no `setTimeout`, no `!important` — exactly as §4 requires. And the storefront correctly
resists OS dark mode: with `colorScheme: 'dark'`, Fernwood's wrapper still paints
`rgb(250,247,242)` and Ironline's `rgb(245,251,247)`. That is a real trap avoided.

---

## 8. Mobile (390px, and 320px for good measure)

**No horizontal scroll on any page at 320 or 390.** `document.scrollWidth` never exceeded the
viewport across home, listing, PDP, cart, checkout and order-success at either width. The grid
formula in `ProductCard.module.css:31-37` earns its comment. This is the single best thing in the
audit.

Problems:

- **The mobile home is 7,406px** — 8.8 screens of scroll, of which the first 478 is a half-empty
  hero. Eight product cards at one-per-row with a square image and a full-width green "Quick add"
  bar each (`m-card.png`) is most of it. Two columns below 640px would halve the page.
- **No search on mobile.** The header collapses to logo + account + cart + hamburger
  (`m-hero.png`); the search field is desktop-only. On a catalogue of any size, search *is* the
  navigation.
- **36px tap targets** in the mobile add path (B8).
- **No sticky add-to-cart** on the PDP and no sticky cart affordance anywhere; the buy button scrolls
  away at ~640px and the only way back to the cart is the header icon after scrolling up.
- **Checkout order summary is below 2,320px of form** — the shopper cannot see what they are paying
  while entering their address (B1).
- Value props wrap to two lines with a single centred orphan ("Two-year warranty") at 390
  (`m-card.png`).

Credit: `@media (hover: none)` promotes the hover-revealed quick-add to a static, always-visible
control (`ProductCard.module.css:268-275`) — the right instinct, correctly implemented.

---

## 9. Performance and correctness signals

- **`sizes` is correct in source.** `ProductCard.tsx:78,94` uses
  `"(max-width: 640px) 90vw, (max-width: 1100px) 45vw, 300px"`; `ProductGallery.tsx:72` uses
  `"(max-width: 940px) 100vw, 55vw"`; thumbnails use `"74px"`; `Hero.tsx:132` uses
  `"(max-width: 860px) 100vw, 50vw"`. The DOM reports no `sizes`/`srcset` because **every demo asset
  is an SVG**, which Next passes through unoptimized. So the responsive-image pipeline is *unproven,
  not broken* — it has literally never run. Seed at least one raster product image.
- **Priority hints are right:** first four cards eager, the rest `loading="lazy"`, PDP hero image
  `priority`.
- **CLS 0.3077** on the home (B5); 0.0007 and 0.0000 elsewhere.
- **Grid reflow 320→1440 is sane:** 1 column at 320/390, 4 at 1440, no overflow, no orphan rows other
  than the category grid's 4-in-3.
- **`opacity: 0` without JS:** four instances, all `.quickAdd` (`ProductCard.module.css:256`). Unlike
  the marketing-site defect, this one is *CSS*-driven — `:hover`, `:focus-within` and
  `@media (hover: none)` all reveal it without JavaScript, so a mouse or keyboard user is fine. The
  gap is a no-hover, non-touch pointer, which is rare. Low severity; noting it because it was asked
  for.
- **Console is clean** across the whole journey: the only message is a benign CSP report-only
  notice about `upgrade-insecure-requests`.
- **Payload:** the storefront home pulls Mantine core + components and a 277 KB CSS bundle it never
  uses (§7). Dev-server byte counts are not production numbers, but the *dependency* is real and
  should not be on a shopper page.

---

## 10. Accessibility floor (design-system §7)

| Requirement | Result |
|---|---|
| Keyboard reachable | **Pass** on home / listing / PDP / cart. Tab order is logical: skip link → logo → nav → search → account → cart → content. |
| Visible focus | **Pass** on the storefront (`2px solid var(--st-brand)`, offset 2px, verified resolving to `rgb(13,148,136)` on Ironline). **Fail on checkout** — 3 of 20 tab stops report `outline: 0px none`, on the payment page. |
| `prefers-reduced-motion` | Handled globally in `globals.css`; `StorefrontStyle.tsx:34-36` documents deliberately not duplicating it. |
| Icon-only buttons carry `aria-label` | **Pass** — zero unlabelled `<a>`/`<button>` across all six pages at three widths. |
| Real `<label for>` | **Pass** — zero unlabelled inputs anywhere, including the visually-hidden `<label for="catalogue-search">` (`CatalogueControls.tsx:57-58`). |
| Colour never the sole signal | **Pass, and done well** — stock states pair a dot with a word *and* vary the dot shape (`StoreUI.module.css:234-261`). |
| Target size ≥ 40×40 on touch | **Fail** — see B8. |
| Contrast | **Fail** on three controls: hero/cart `<a>` CTAs (2.07 / 4.40), disabled out-of-stock (1.71 / 1.75), Voltage card boundaries (1.10 / 1.29). Everything else measured passes: announcement bar 7.95 / 5.17 / 4.81, `--st-text-muted` on `--st-surface` 7.55 (Voltage), price on card 19.06. |

Minor: `NewsletterForm.tsx:74-75` puts `role="status"` on the static "Unsubscribe any time." helper
text, creating a permanent live region around content that never changes.

---

## 11. What is genuinely good — keep this

1. **The token discipline in `src/components/store/**` is real.** Zero colour literals across eight
   CSS modules. The `--stx-*` prefix for renderer-derived values (`theme/vars.ts`) is exactly the
   right way to extend a contract without breaking it, and the file says so in its own header. This
   is the best-engineered part of the product I have looked at.
2. **The grid.** `ProductCard.module.css:31-37` — `auto-fill` over a floor raised by the merchant's
   column count, with a documented reason for choosing 240px over 260px. No horizontal scroll at
   320px on any page. Do not touch it.
3. **The gallery.** Real ARIA tablist, roving tabindex, arrow/Home/End, one tab stop, live region
   (`ProductGallery.tsx`). Better than most paid themes.
4. **Add-to-cart feedback.** Label change + tick + disabled-in-flight + a polite live announcement
   (`AddToCartButton.tsx`). I tried three times to prove it was broken and it was correct each time.
5. **Stock states.** Dot shape *and* colour *and* word, plus a real number at low stock. Textbook.
6. **`ProductMark`.** Deterministic, SKU-seeded, built from the merchant's own two colours, labelled
   `role="img"`, and explicitly *not* the shared primitive because that one would stamp RebelShops
   colours into a merchant's grid (`ProductMark.tsx:14-26`). Right call, well argued.
7. **Server-rendered theming with no flash**, scoped to a wrapper rather than `:root`, exactly per
   spec §4 — and it survives OS dark mode.
8. **The Fernwood storefront** (`home-craft-1440.png`, `pdp-craft.png`, `list-craft.png`) is a
   handsome shop. Fraunces headings on `#faf7f2`, the category eyebrow on every card, the columned
   footer, the outline buttons. Whatever gets fixed, keep this look.
9. **Honest commerce copy.** "Shipping is calculated at checkout from your delivery address — we do
   not estimate it here, because a guess would be wrong as often as it was right." That is the brand
   voice working.
10. **The architectural comments are load-bearing and correct** — the `[storeSlug]/layout.tsx`
    soft-404 note, the `products/loading.tsx` Suspense-scope note, the `cart/layout.tsx` note about
    removing `TopNav`. Someone was thinking. The checkout is what happens where nobody did.

---

## 12. Suggested order of work

1. **B1** — put checkout and order-success inside `StorefrontShell`, migrate `--theme-*` → `--st-*`,
   delete `checkout/layout.tsx`. Nothing else matters as much.
2. **B3** — one-line specificity fix in `StorefrontStyle.tsx:104`, plus a regression test.
3. **B2** — stop hiding the shop behind a JS swap; theme the listing skeleton.
4. **B4** — real disabled treatment, and a notify-me on out-of-stock.
5. **B6** — read `store.heroImageUrl`; three hero images are already on disk.
6. **B12** — delete `src/components/product/**` except `ProductSchema.tsx`; 11 of 14 colour
   violations go with it.
7. **B7, B8, B5, B9, B10** — cheap, contained fixes.
8. **The preset question** — add `sections` to `PresetDefinition` and give the six presets six
   compositions. Until that happens, the product's headline claim is not true.
