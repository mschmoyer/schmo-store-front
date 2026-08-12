# Customizer & Onboarding — Hostile Review

Scope: `/admin/design` (`src/components/admin/customizer/**`, `src/lib/storefront-theme/**`,
`src/components/store/theme/**`) and `/create-store` (`src/components/onboarding/**`,
`src/components/wizard/**`, `src/app/api/onboarding/**`).

Method: both surfaces were **driven with Playwright** against the live dev server on `:3000`, signed
in as `demo@schmostore.com`, with a real Postgres behind it. Every screenshot cited was taken during
this review and lives in `/home/user/schmo-store-front/.scratch/crit/shots/`. Driver scripts are in
`/home/user/schmo-store-front/.scratch/crit/`. Contract read first: `docs/storefront-theme-spec.md`
§8/§10, `docs/design-system.md`, `docs/marketing-copy.md` §5.5, `docs/audits/shipstation-audit.md`.

Two environmental caveats, stated up front so nothing below is mistaken for a product defect:
`api.shipstation.com` is blocked by network policy here, so the **success** path of the ShipStation
step could not be exercised — only its failure paths, which is noted where it matters. And for
roughly ten minutes mid-review another process in this workspace deleted
`src/components/admin/AdminChrome.module.css`, 500-ing the whole app; it was restored, and no finding
below rests on measurements taken during that window.

---

## Verdict 1 — The customizer

**Grade: D.** Not because it is badly built — the engine, the schema-driven control registry, the
contrast derivation, the CSS sanitiser and the publish diff are the best code in this repository —
but because **the product's single defining feature does not work at all, in production, by
configuration.** `next.config.ts:168-170` sets `X-Frame-Options: DENY` on `/(.*)`, which includes
`/store/*`. The customizer's preview iframe points at `/store/{slug}?preview=…`. The browser refuses
the frame, the handshake never fires, and the merchant gets a spinner that says "Loading your
storefront…" forever, joined after eight seconds by a notice promising the preview "will catch up
once the renderer is available" — it never will (`a1-design-initial.png`, `a2-preview-timeout.png`).
This is not environment-specific: `headers()` is not gated on `VERCEL_ENV` or `NODE_ENV`, so
rebelshops.com ships it too. I stripped the header at the network layer to review the rest, and
everything behind it is genuinely good — 120 ms colour repaint, 75 ms font repaint, zero iframe
reloads, click-a-section-in-the-preview-to-select-it, a real diff on publish (`a3-preview-live.png`,
`b6-publish-diff.png`). All of that is currently dead code in front of a merchant. Ship the one-line
header fix and this jumps to a B+ the same afternoon; until then a merchant editing their shop is
using a settings form with a permanent loading spinner bolted to the right of it.

## Verdict 2 — Onboarding

**Grade: C+.** The mechanics are excellent and the copy is disciplined: five steps, real server-side
slug availability with three suggestions, a live password meter, verbatim copy-deck error strings,
resume-on-refresh backed by `onboarding_sessions`, and — the standout — a ShipStation check that
performs a *real* `GET /v2/warehouses` and classifies eight distinct failure modes, correctly telling
me "Something between us and ShipStation blocked the request (HTTP 403). That's a network or
firewall problem, not your key" when the proxy blocked it (`c4-network-fail.png`). That single screen
retires the worst finding in `docs/audits/shipstation-audit.md`. But the flow **lies about its own
outcome three times in the last two screens**: it marks skipped steps "Done", it declares "All five
steps done", it says "Anyone with this address can shop it right now" — and the store it just made
live is a black page reading "NO PRODUCTS YET · This shop has not published anything for sale. If it
is yours, here is how to fill it: Open your dashboard…", i.e. internal admin instructions and a
"Manage products" button, published to the public web (`c8-launch-final.png`, `c7-launched-store.png`).
It also silently publishes preset announcement copy the merchant never wrote and cannot honour
("Next-day dispatch on every order placed before 3pm"), and it never once mentions the $1 the
marketing site is selling. It is a beautifully engineered wizard that ends by handing the merchant
something they cannot show anyone.

---

## Is the customizer a credible Shopify competitor, or a settings form with a preview?

**As shipped today: it is a settings form with a broken preview.** As built (header removed): it is a
credible small-catalogue competitor to Shopify's theme editor, with three real gaps.

Evidence for "credible":

| Capability | Measured |
|---|---|
| Theme repaint on colour change | **120 ms**, `0` iframe navigations (`a6.js`) |
| Theme repaint on font change | **75 ms**, `--st-font-heading` `Space Grotesk → Playfair Display` (`d5.js`) |
| Section reorder — pointer drag | works (`a7-dragging.png`) |
| Section reorder — keyboard (dnd-kit lift/move/drop) | works: `Hero \| Value props …` → `Value props \| Hero …` |
| Click a section in the preview → selects it in the rail | works (`a7-preview-click.png`) |
| Add / duplicate / hide / remove / undo | all work, with per-type quotas ("1 of 2 used") |
| Panels generated from the section schema | **yes** — `controls/registry.ts` is `Record<SettingFieldType, Component>`, and `Rail.tsx` has zero per-section branches. I added a `countdown` section that had never been rendered and got a complete, correct panel. |
| Contrast auto-derivation (spec §3's "single most important thing") | correct on every colour I tried: `#0000FF`→white 8.59:1, `#7A00FF`→white 6.42:1, `#B00020`→white 7.33:1, `#00B37E`→ink 6.71:1 (`d7-blue.js`) |
| Custom CSS sanitiser | strips and **reports**: "2 rules were changed. Removed unsupported at-rule `@import`. Removed `background` declaration containing `javascript:`." (`d3-customcss.png`) |
| Admin chrome does not inherit the merchant theme | confirmed: after picking Voltage (dark), `body` background is still `rgb(255,255,255)` and no `--st-*` resolves on `:root` (`b4-voltage.png`). Zero `--st-*` and zero hardcoded hex in `Customizer.module.css` / `controls.module.css`. |

Evidence for "not yet":

1. **The preview is never a desktop preview.** At a 1440×900 window the iframe is **738 px** wide; at
   1024×768 it is **412 px**. The real storefront at 1440 renders a full nav bar
   ("BASECAMP AUDIO · Shop all · Audio · Desk & Workspace · Power & Storage · Wearables"); at 738 it
   collapses to logo + hamburger (`b8-real-store-1440.png` vs `a3-preview-live.png`). A merchant
   designing in "Desktop" mode has **never seen their own navigation**. Shopify solves this by taking
   the full window and scaling; here 232 px of permanent admin sidebar plus a 360 px rail eat the
   canvas.
2. **"Tablet" is not tablet.** `VIEWPORTS.tablet.width = 834` but `frameShell` carries
   `maxWidth: '100%'`, so at 1440 the tablet frame measures the same **738 px** as desktop — the
   two buttons produce an identical render. Mobile does work correctly (388 px, `matchMedia('(max-width:640px)')` → true, `transform: none`) — so the switcher is honest CSS, just clamped.
3. **Keyboard reorder is half-broken and the UI advertises the broken half** (see BD-2).

---

## Is "SIMPLE setup" true?

**Yes for the ceremony, no for the outcome.**

Measured, clean end-to-end run at machine speed (`c8-timed.js`, ShipStation skipped):

| | |
|---|---|
| Steps | 5 + a terminal launch screen |
| Required fields typed | **5** (first name, last name, email, password, store name) — slug and description auto-fill/optional |
| Clicks | **6** |
| Characters typed | 82 |
| Wall clock, page load → "is live" | **6.9 s** |

That is a genuinely short funnel — shorter than the wizard's own "about 5 min left" estimate. The
copy deck's "Two minutes" for step 1 is conservative in the right direction.

Where a real merchant stalls:

- **Getting the ShipStation key.** Nothing in the product can help; the marketing site's "about 2
  minutes" is a guess about someone else's UI.
- **The import, if they have a real catalogue.** `MAX_PAGES_PER_SLICE = 3`, `PAGE_SIZE = 100`,
  `SLICE_BUDGET_MS = 8_000`, and the loop is **driven by the browser** (`ImportStep.tsx:40-56`). 5,000
  products = 50 pages ≈ **17 sequential POSTs**, each up to 8 s, with the tab open the whole time. The
  step's own note ("You can close this tab") and the homepage's "2–10 minutes, **unattended**" are
  both wrong: closing the tab stops the import dead — it only *resumes* when you come back, and the
  background sync that would finish it is confirmed dead in `docs/audits/shipstation-audit.md` P0-4.
- **The end.** They stall hardest after "launch", because what they get is not shippable (BD-4).

The marketing site's **"under 20 minutes from API key to a live store"**
(`src/components/marketing/home/HowItWorksSteps.tsx:105`) is defensible for a few-hundred-SKU
catalogue and indefensible for a large one — but the honest failure is not the clock, it is that at
minute 20 the merchant has a store with no payments and, for a skipped/failed sync, no products and a
public page addressed to themselves.

---

## Blocking defects, ranked

### BD-1 · The live preview cannot load. The customizer has no preview.
- **Severity:** P0. This is the feature.
- **Evidence:** `.scratch/crit/shots/a1-design-initial.png`, `a2-preview-timeout.png`. Console:
  `Refused to display 'http://localhost:3000/…' in a frame because it set 'X-Frame-Options' to 'deny'`.
  `curl -D- /store/demo-electronics` → `X-Frame-Options: DENY`. The iframe's `contentDocument` is
  `null` and the frame URL is `chrome-error://chromewebdata/` after 14 s.
- **Where:** `next.config.ts:167-170` — `{ source: "/(.*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] }`.
  A second, latent kill sits at `next.config.ts:47` (`frame-ancestors 'none'`), currently
  Report-Only, which will re-break this the moment someone sets `CSP_ENFORCE=true` as the file's own
  comment advises.
- **Proof the rest works:** with those two headers stripped at the network layer
  (`.scratch/crit/lib2.js`), the handshake completes and everything in the table above is real
  (`a3-preview-live.png`).
- **Fix:** split the header rule. Keep `X-Frame-Options: DENY` / `frame-ancestors 'none'` on
  `/admin/:path*` and `/api/:path*`; on `/store/:path*` drop XFO entirely and use
  `frame-ancestors 'self'`. XFO has no per-path allowlist worth relying on, so removal plus a CSP
  ancestor rule is the correct construction. Then add a Playwright test that asserts the preview
  handshake fires — this defect is invisible to every unit test in the repo.

### BD-2 · Alt+Arrow section reorder is documented in the UI and does not work
- **Severity:** P1 (accessibility + the rail tells the merchant to do something that fails silently).
- **Evidence:** focused the first grip (`aria-label` = *"Reorder Hero. Position 1 of 7. Press space to
  lift, or hold alt and press the up and down arrows."*), pressed `Alt+ArrowDown`; order unchanged:
  `Hero | Value props | Featured products | …` before and after (`a7-sections.js`,
  `a7-after-altarrow.png`). The dnd-kit Space-lift path *does* work, which proves dnd-kit's key
  handler is the one bound.
- **Where:** `src/components/admin/customizer/rail/SectionList.tsx:151-158`. `onKeyDown={onHandleKeyDown}`
  is declared on line 155, then `{...attributes}` and `{...listeners}` are spread on lines 156-157.
  dnd-kit's `listeners` contains its own `onKeyDown`, and the later spread wins — the hand-written
  Alt+Arrow handler at lines 119-130 is dead code.
- **Fix:** merge instead of shadowing — `onKeyDown={(e) => { onHandleKeyDown(e); if (!e.defaultPrevented) listeners?.onKeyDown?.(e); }}` with `{...listeners}` spread *before* it. Same file, add a test that presses Alt+ArrowDown and asserts `onMove`.
- **Related, smaller:** dnd-kit's default live-region announcement reads *"Draggable item **hero-1**
  was moved over droppable area **hero-1**"* — raw ids, not "Hero". Pass an `announcements` object
  that resolves ids to section labels.

### BD-3 · The contrast guardrail never audits the brand colour against the page
- **Severity:** P1. It is the exact scenario the brief names, and it is the one the guardrail misses.
- **Evidence:** set brand to `#FFFDE7` with `colorOnBrand` on auto. The engine correctly flipped
  `--st-on-brand` to `#0e1014`, so the *label* is legible — and then rendered a
  `rgb(255,253,231)` button fill with a `rgb(255,253,231)` border on a `#ffffff` card
  (≈ 1.02:1 against `--st-surface: #fbfaf8`). "Quick add" buttons and "Sale" badges are invisible
  (`b2-pale-auto-top.png`, `b3-hero-crop.png`). **The rail raised zero findings.**
- **Where:** `src/components/admin/customizer/contrast/findings.ts:55-115` — `PAIR_ADVICE` covers
  `text on surface`, `on-brand on brand`, `strong border on surface`, `success/warning/danger on
  surface`. There is no `brand on surface` pair, so `auditContrast` is never asked the question.
- **Fix:** add a `brand on surface` pair at a 3:1 floor (WCAG 1.4.11, non-text UI) with advice
  "Your brand colour is {r}:1 against the page — buttons in it will have no visible edge", and either
  offer a darkened swatch or auto-emit a `--st-brand-edge` border token.
- **Sub-defect, same file, lines 167-175:** when the merchant *does* pin an illegible
  `colorOnBrand`, the finding renders its swatch pair as **`#FFFFFF → #FFFFFF`** with the button
  "Use an accessible colour" (`b1-hard-fail-rail.png`). `to: derived.onBrand` is computed from a
  resolved theme that still contains the pin, so the fix preview shows no change. The fix itself
  (clear the pin) works; the preview of it is a lie. Compute `derived` from the theme with
  `brand.colorOnBrand` removed.
- **Sub-defect:** one pinned colour produces three near-identical findings (normal / hover / pressed)
  and the publish dialog then says *"One thing needs fixing before this can go live"* directly above
  *"3 readability problems would ship"* (`b1-publish-blocked.png`). Collapse the three into one.

### BD-4 · Onboarding publishes a public store that shows internal admin instructions
- **Severity:** P0 for the "SIMPLE setup" claim — this is the last thing the flow produces.
- **Evidence:** completed the wizard skipping ShipStation (which the wizard explicitly encourages:
  *"Your store still gets created, styled and published"*). The resulting public URL renders one
  block: **"NO PRODUCTS YET — This shop has not published anything for sale. If it is yours, here is
  how to fill it: 1. Open your dashboard and go to Products. 2. Add a product by hand… 3. Make sure
  each product is marked active"** plus a **"Manage products"** button linking to `/admin/products`
  (`c7-launched-store.png`). The store *does* have 7 sections in `storefront_themes` — a hero, value
  props, an image-with-text, none of which need products — and every one of them is suppressed.
- **Where:** `src/app/store/[storeSlug]/page.tsx:51-56` — `productCount === 0` short-circuits the
  entire `SectionList`. Copy at `src/components/store/states/EmptyStates.tsx:69-86`, whose own doc
  comment says "The audience here is the *merchant*, not the shopper" — a reasonable call for a
  logged-in owner previewing, a wrong one for an anonymous visitor on a URL the wizard just told the
  merchant to "send to someone".
- **Fix:** render the non-catalogue sections normally; replace only the product-bearing sections with
  a quiet shopper-facing line ("Nothing here yet — check back soon"), and show the merchant-facing
  troubleshooting block **only** when the request is authenticated as the store owner or carries a
  preview token (`isPreview` is already in scope at line 40).

### BD-5 · The wizard marks skipped steps "Done" and claims the store is shoppable
- **Severity:** P1 (honesty).
- **Evidence:** `c8-launch-final.png` — sidebar reads `Account Done / Store Done / ShipStation Done /
  Catalog Done / Style Done`, headline `5 OF 5 DONE`, subhead **"Anyone with this address can shop it
  right now."** ShipStation and Catalog were *skipped*, and the very next bullet on the same screen
  says "Connect Stripe before you share the link. Until then the store can show products but not take
  payments." Two contradictory statements 60 px apart.
- **Where:** `src/components/wizard/StepIndicator.tsx:94,137` (`'Done'` for any completed step, with
  no `skipped` state — the server does record `status: 'skipped'` in `import_state`);
  `src/components/onboarding/steps/LaunchStep.tsx:111`.
- **Fix:** add a `skipped` status to the indicator ("Skipped", muted, with a "do it now" link), and
  gate the launch subhead on `connected && imported > 0 && stripeConnected`; otherwise say what is
  actually true ("Your store is live, but it has nothing to sell yet and can't take payments.").

### BD-6 · Catalog import only ever reads the first page of inventory
- **Severity:** P1 — silently wrong data on the product's central claim ("Live inventory straight
  from our warehouse").
- **Evidence (code, since ShipStation is unreachable here):**
  `src/app/api/onboarding/_lib/import.ts:246` — `const inventory = await getPage(INVENTORY_URL, apiKey, fetchImpl, 1);`
  Page **1**, hardcoded, `PAGE_SIZE = 100`, no pagination loop, while products page through all 50
  pages of a 5,000-SKU catalogue. Every product whose SKU is not in the first 100 inventory rows is
  written with `stock = 0`. The step then reports "…and stock for {w} warehouses are in."
  The same call also re-runs on **every** slice (it sits outside the `progress.page === 1` guard used
  for warehouses on line 236), so a 5,000-product import makes ~17 redundant inventory requests.
- **Fix:** page the inventory endpoint to exhaustion on the first slice and persist the SKU→stock map
  in `import_state` (or look stock up per page); move the call inside the `page === 1` guard.

### BD-7 · The import progress bar reads ~100% for the entire import
- **Severity:** P2, but it is the one number the merchant watches.
- **Evidence:** `src/components/onboarding/steps/ImportStep.tsx:131-132` —
  `percent = Math.round((progress.imported / progress.found) * 100)`, where `found` is incremented
  only by pages already fetched (`import.ts:283`). After page 1: `found = 100`, `imported = 100` →
  **100%**, with 4,900 products still to go. The bar then sits pinned at 100 for seventeen slices.
- **Fix:** ShipStation's list envelopes carry a total; read it into `progress.total` and use it as the
  denominator. Absent a total, show the indeterminate bar (the component already supports
  `data-indeterminate`) rather than a false 100%.

### BD-8 · Presets publish business promises the merchant never wrote
- **Severity:** P1 (commercial/legal, not cosmetic).
- **Evidence:** `src/lib/storefront-theme/presets.ts:70,123,174,225,331` ship
  `announcement: { …, enabled: true }` with the text **"Made in small batches. Free shipping over
  $95."**, **"Next-day dispatch on every order placed before 3pm."**, **"Free samples with every
  order."**, **"Subscribe and save 15% on every delivery."** Step 5 of onboarding is a six-tile
  picker with **no preview** (`c5-step5.png`); I picked Voltage and the resulting live storefront
  carried "Next-day dispatch on every order placed before 3pm" across the top
  (`c7-launched-store.png`). The merchant never saw that string before it was public.
- **Fix:** ship presets with `announcement.enabled: false` and the text as a *placeholder* in the
  customizer's Header panel. Same argument applies to preset hero copy ("Everything in stock. Shipped
  today.") and value props ("Same-day dispatch · 30-day returns · Two-year warranty") — a storefront
  that asserts a returns policy on the merchant's behalf is a liability, not a starting point.

### BD-9 · There is no payment step, anywhere
- **Severity:** P1 (product/commercial).
- **Evidence:** grepped `src/components/onboarding/**` and `src/app/api/onboarding/**` for
  stripe/billing/subscription/payment: the only hits are the launch screen's *advice* to connect
  Stripe (`LaunchStep.tsx:161`) and unrelated ShipStation plan-limit wording. I completed the flow
  three times and was never asked for a card, yet the site's every CTA is **"Start for $1"** and the
  pricing model is "$1 for 3 months, then $19.99/mo". Stores are created public and free.
- **Fix:** decide and then be consistent. Either insert a payment step (and change the progress label
  to "Step n of 6"), or move billing to a post-launch gate and change the marketing CTA to match what
  the funnel actually does.

### BD-10 · Browser Back exits the wizard instead of going back a step
- **Severity:** P2.
- **Evidence:** on step 3, `page.goBack()` left `/create-store` entirely (landed on `about:blank`
  in a fresh context; for a real merchant it lands on whatever preceded the wizard). The in-wizard
  "Back" button works correctly and preserves every field
  (`Basecamp Audio | walk-msq5z8c4 | Test catalogue…`), and refresh correctly restores `STEP 3 OF 5`
  from `onboarding_sessions` (`c5-rest.js`).
- **Fix:** give each step a URL (`/create-store/store`, `/create-store/shipstation`, …) or push
  history state per step. Back is the second most-used control in any browser.

### BD-11 · Custom CSS never appears in the live preview
- **Severity:** P2.
- **Evidence:** typed `h1{letter-spacing:0.5em}` into the Custom CSS panel, waited 3 s; the preview's
  `#storefront-theme` block does not contain `0.5em` (`d5.js`). Merchant CSS is appended *after*
  `THEME_BLOCK_SENTINEL` server-side, and `PreviewBridge.repaint()` only rewrites the block *up to*
  the sentinel (`src/components/store/theme/PreviewBridge.tsx:73-91`). Nothing in the panel says so.
- **Fix:** include sanitised custom CSS in the pushed payload and rewrite past the sentinel, or (much
  cheaper) show "Reload the preview to see custom CSS" with a button wired to `reloadToken`.

### BD-12 · Date settings are hand-typed ISO strings
- **Severity:** P2.
- **Evidence:** added a Countdown section; its "Ends at" control is an empty text input whose help
  reads *"ISO date and time, e.g. 2026-12-24T23:59:00Z"* (`a8-countdown-panel.png`). It ships with
  "Hide when the timer runs out" ON and an empty deadline, so the section is invisible from the
  moment it is added, with no explanation.
- **Where:** `src/lib/storefront-theme/sections.ts:325-329` uses `type: 'text'` because
  `SettingFieldType` has no `date`. This is the schema-driven design working exactly as intended and
  exposing a missing primitive.
- **Fix:** add `'date'`/`'datetime'` to `SETTING_FIELD_TYPES` and a `DateControl` in
  `controls/registry.ts`; default `endsAt` to +7 days.

### BD-13 · The customizer is unusable below ~1100 px and broken at phone width
- **Severity:** P2.
- **Evidence:** at 1024×768 the preview canvas is **412 px** — a phone-width render labelled
  "Desktop", with 232 px of admin sidebar the customizer does not need (`b7-1024.png`). At 390 px the
  top bar overlaps itself: the store switcher sits on top of the breadcrumb and the store slug, and
  two floating action buttons stack on each other (`b7-390.png`).
- **Fix:** the customizer should take over the window (hide the admin sidebar on `/admin/design`, as
  Shopify's editor does) and, below ~900 px, either collapse to a rail-only editor with a "Preview"
  toggle or say plainly that the editor needs a wider screen.

---

## What is genuinely good

Be clear: several parts of this are the strongest work in the codebase, and the report above should
not be read as "rip it up".

- **The theme engine honours its own contract.** `--st-*` never touches `:root`; the block is scoped
  to `.storefront[data-store-id]`; picking the dark Voltage preset leaves the admin at
  `rgb(255,255,255)` (`b4-voltage.png`). `Customizer.module.css` and `controls.module.css` contain
  **zero** `--st-*` references and **zero** hardcoded hex values — measured, not asserted.
- **Auto-contrast actually works,** and it is the thing spec §3 calls the most important. Four brand
  colours across the wheel all produced a correct ink/white flip at 6.4–8.6:1.
- **The settings panels really are schema-generated.** `controls/registry.ts` is an exhaustive
  `Record<SettingFieldType, Component>`; `Rail.tsx` has no per-section branch. Adding a section type
  is a data change. The one clever refinement — a `textarea` whose value is an array becomes a
  repeating list editor — is the right call and stays schema-driven.
- **The Custom CSS panel is best-in-class.** It sanitises, and then it *tells you what it removed,
  by name*. Most products silently drop your input.
- **Draft/publish is correct and verifiable.** Autosave debounces at 900 ms and coalesces in-flight
  saves; a `beforeunload` guard fires on navigate-away; work survived a mid-edit navigation
  (`#abcdef` still there on return). In Postgres, editing produced `draft v15 color=#123456` with no
  published row, and publishing produced `draft …#123456` + `published …#123456 pub=2026-08-12
  14:02:22` — diverged while editing, converged on publish, exactly as spec §9 requires. Publish
  itself round-tripped in **111 ms** and the dialog names each change (`Brand colour #123456 →
  #7733aa`).
- **The presets are real, differentiated looks** with real thumbnails, not hue rotations
  (`b4-presets.png`), and Voltage in particular is a storefront I would believe an electronics brand
  shipped.
- **The 13 curated fonts** match spec §5 and render as live specimens with per-family sample text
  ("SKU-9481 · $129.00 · 12 in stock" under JetBrains Mono).
- **The ShipStation step is the fix the shipstation audit asked for.** Real network call, a
  pre-flight that "can reject, never accept", and eight distinguishable failure classes — including
  the genuinely hard one, telling a corporate-proxy 403 apart from a bad key. It got that right on
  the first try in this environment. *(Unverified here: the success path and the valid-key/empty-catalogue
  path — `api.shipstation.com` is blocked by network policy and I did not fake it.)*
- **Slug availability** is the small thing that signals care: live check, the copy deck's exact
  string ("That address is taken. Try another."), three concrete suggestions, and Continue disabled
  (`c3-slug-taken2.png`).
- **Wizard accessibility is mostly right:** one `<h1>`, correct `aria-invalid` +
  `aria-describedby` on failed fields, `role="alert"`/`aria-live` on danger banners, a `role="meter"`
  password strength gauge, and the design-system's two-layer focus ring rendering correctly on
  keyboard focus (`d6-focus-ring.png` — I checked this because I initially suspected it was missing;
  the ring lives on the field wrapper, not the input, and it is there).

---

## Copy audit against `docs/marketing-copy.md` §5.5

| Where | Deck | Built | Call |
|---|---|---|---|
| Wizard title, progress label | "Set up your store", "Step {n} of 5" | identical | ✅ |
| Steps 1, 2, 4 titles + helpers | — | verbatim | ✅ |
| Step 3 helper | "Paste your API key **and secret**." | "Paste your API key." | ⚠️ The build is right (V2 takes one key); **update the deck**, and drop the "ShipStation API secret" row from §5.2. |
| Step 5 helper | "Pick a theme **and write your hero copy**." | "Pick a theme." | ⚠️ The build is honest — there is no hero-copy field on step 5. Either add one or amend the deck; do not leave the deck promising it. |
| Step 5 preview note | "This is your real store. Nobody can see it until you publish." | rendered verbatim (`c5-step5.png`) | ❌ **The sentence has no referent.** Step 5 shows six preset tiles and no preview of the merchant's store. Either embed the preview (the machinery exists) or change the line. |
| Step 3 "we don't change anything" | gated pending order write-back | "…we don't change anything in ShipStation **during setup**" | ✅ Correctly hedged. |
| Skip link / exit link | "Skip for now" / "Save and finish later" | both present | ✅ |
| Email taken | "An account already uses this email. Sign in instead." | verbatim (`c9-dupe-email.png`) | ✅ |
| Password helper/error | "At least 12 characters" | verbatim, plus a live meter and "7 more characters to go" | ✅ better than spec |
| Design page buttons (§5.1) | "Publish changes" / "Discard changes" | "Publish" / "Discard changes" | ⚠️ trivial |

One thing worth flagging that is *not* a copy bug: the marketing site is still holding the §3.3/§3.4
gate — `src/components/marketing/home/HowItWorksSteps.tsx:37` and `MakeItYours.tsx:24` both
deliberately avoid "fonts", "sections", "live preview", and
`src/components/marketing/__tests__/honesty.test.tsx:92-95` enforces it. The customizer has shipped
all of those. So the product currently **under-claims** its best feature — and, given BD-1, that is
the correct state of affairs: the honesty test is the only thing stopping the site from advertising a
live preview that no merchant can see. Fix BD-1 first, then lift the gate.

---

## Suggested order of work

1. **BD-1** (one header rule) — turns a D into a working product. Add a preview-handshake e2e test.
2. **BD-4 + BD-5 + BD-8** — the last screen of onboarding, which is what a merchant judges you on.
3. **BD-6 + BD-7** — the import tells the truth about stock and progress.
4. **BD-2 + BD-3** — the two places the customizer's own UI makes a promise it doesn't keep.
5. **BD-9** — decide what "Start for $1" means.
6. The rest.
