# Marketing site critique — rebelshops.com homepage

**Reviewer:** design / UX / conversion audit
**Date:** 2026-08-12
**Target:** `http://localhost:3000/` at 1440×900 and 390×844
**Method:** Chromium 1194, full-page and viewport-pane capture, computed-style sampling, JS-disabled
render, WCAG contrast maths. Every number below was measured, not estimated.

> **Measurement note — the page moved under me.** Mid-audit, `b6d5cc1 wip: monochrome token layer in
> progress` and uncommitted edits to `src/app/globals.css` recompiled through Turbopack HMR. I
> therefore have three measured states, and I cite which one each number comes from:
>
> | State | When | Doc height | Primary button |
> |---|---|---|---|
> | **A — as rejected** | ember palette, `--section-y: 128px` | **13,197px** | `#DC3A0C` orange |
> | **B — current** | partial monochrome, `--section-y: 88px` | **12,381px** | `#111214` ink |
> | Owner's own reading | — | 12,755px | — |
>
> All three agree within 7%. Structure is identical across all three; only hue and section padding
> changed. **Screenshots `d00`–`d12` are state A. Screenshots `s00`–`s11` and `mm*` are state B.**
> Mobile figures are state A (see §6). By the end of the session another agent had `page.tsx`
> importing a non-existent `WhatYouGet` and the route was returning 500, so state B is the last
> renderable build I could measure.

Screenshots referenced live in `/home/user/schmo-store-front/.scratch/shots/crit/`.

---

## 1. Verdict

**Grade: D.** The writing on this page is the best asset the company has — honest, specific,
numerate, and free of the fabricated proof that nearly shipped. It is buried inside a 12,381px
scroll (13,197px before this week's padding change) made of twelve full-bleed sections that flip
between four different page grounds eleven times, laid out on five different container widths with
four different left margins, and punctuated by seventeen call-to-action buttons in three heights,
three type sizes and eleven different horizontal origins. The owner's phrase "disjointed" is not a
mood; it is the literal, measurable state of the layout, and I can give you the pixel values for it.
Would a ShipStation seller running a real business enter a card here? A few would — the hero and the
pricing card are genuinely good and the "Not included" list buys real trust. But 48% of this page is
byte-identical to `/features` and `/how-it-works`, the nav's "Pricing" link is an anchor that scrolls
8.4 screens down instead of leaving the page, `/pricing` tells the visitor "Card required" when the
signup wizard takes no card, and with JavaScript disabled the entire 11,261px document renders as
empty coloured stripes with not one word visible. This is not a page that needs a repaint. It needs
two-thirds of it deleted.

---

## 2. Why it reads as disjointed

The owner said "some dark on top of light… it looks disjointed… I hate the existing color scheme."
Those are three separate defects and only one of them is about colour. Diagnosed structurally:

### 2.1 Eleven ground changes in twelve sections, on no schedule

Sampled `background-color` on each direct child of `#main`, state B:

| # | Section | Ground | Hex |
|---|---|---|---|
| 0 | Hero | `rgb(255,255,255)` | `#FFFFFF` |
| 1 | AlreadyHaveIt | `rgb(244,244,245)` | `#F4F4F5` |
| 2 | HowItWorksSteps | `rgb(255,255,255)` | `#FFFFFF` |
| 3 | MakeItYours | `rgb(244,244,245)` | `#F4F4F5` |
| 4 | SyncSection | `rgb(10,11,12)` | **`#0A0B0C`** |
| 5 | InventorySection | `rgb(255,255,255)` | `#FFFFFF` |
| 6 | AnalyticsSection | `rgb(244,244,245)` | `#F4F4F5` |
| 7 | ProofSection | `rgb(10,11,12)` | **`#0A0B0C`** |
| 8 | PricingSection | `rgb(255,255,255)` | `#FFFFFF` |
| 9 | CostComparison | `rgb(244,244,245)` | `#F4F4F5` |
| 10 | FaqSection | `rgb(255,255,255)` | `#FFFFFF` |
| 11 | FinalCta | `rgb(10,11,12)` | **`#0A0B0C`** |
| — | Footer | `rgb(10,11,12)` | `#0A0B0C` |

Four distinct page grounds. Eleven flips. The light pair alternates on a strict A-B-A-B metronome
that carries no meaning — `AlreadyHaveIt` and `MakeItYours` are grey for no reason other than that
their neighbours are white. Then three dark slabs land at positions 4, 7 and 11 with no shared
category: one is a feature (sync), one is social proof, one is the closing CTA. A reader cannot
learn the rule because there isn't one. That is the whole of "dark on top of light."

**The one place it works:** section 11 (`#0A0B0C`, 554px) sits directly on the footer (`#0A0B0C`,
435px), producing 989px of continuous near-black that reads as a single closing slab. Keep that.

### 2.2 Five container widths and four left margins

Measured `getBoundingClientRect()` on each section's inner wrapper, state B:

| Section | Inner left | Inner width | Source |
|---|---|---|---|
| 0,1,2,3,4,5,10 | **120** | **1200** | `--container-content` |
| 6 AnalyticsSection | **250** | **940** | hard-coded `max-width: 940px` |
| 7 ProofSection (grid) | **24** | **1392** | `--container-wide`, full bleed |
| 8 PricingSection | **360** | **720** | hard-coded `max-width: 720px` |
| 9 CostComparison | **240** | **960** | hard-coded `max-width: 960px` |
| 11 FinalCta | **360** | **720** | hard-coded `max-width: 720px` |

Scrolling this page, the left edge of the content moves **120 → 250 → 24 → 360 → 240 → 120 → 360**.
There is exactly one container token in `globals.css` (`--container-content: 1200px`,
`--container-wide: 1440px`, `--container-prose: 68ch`); 940px, 960px and 720px are magic numbers
typed into three separate `.module.css` files. **940 vs 960 is a 20px difference between two
adjacent sections** — nobody chose that; it reads as a misalignment, not as variety.

On top of that, headings and body copy are capped at **ten different `ch` measures** across the
marketing components: 15, 16, 18, 20, 48, 52, 56, 58, 62 and 68ch. That is why every headline wraps
at a different place and no two sections share a rag.

Section 7 breaks alignment **inside itself**: heading at x=144, the 12-tile product grid at x=24,
the three cards below back at x=144. A 120px jog within one section (`s07.png`).

### 2.3 Seventeen CTAs, eleven x-origins, six primaries

Every `<a>`/`<button>` with a fill or a border, state B, excluding product tiles:

| Section | Label | x-origin | Size | Fill |
|---|---|---|---|---|
| header | Start for $1 | **1202** | 94×32, 13px | `#111214` |
| 0 Hero | Start for $1 | **792** | 125×48, 16px | `#111214` |
| 0 Hero | See a live store | **929** | 157×48, 16px | white |
| 1 | Connect ShipStation | **144** | 198×48, 16px | `#111214` |
| 2 | Start for $1 | **1171** | 125×48, 16px | `#111214` |
| 3 | See a live store | **144** | 157×48, 16px | white |
| 4 | How the sync works | **144** | 196×48, 16px | white |
| 5 | See what's included | **670** | 177×40, 15px | white |
| 6 | See what's included | **274** | 177×40, 15px | white |
| 7 | Open a demo store | **169** | 169×40, 15px | white |
| 7 | See pricing | **560** | 115×40, 15px | white |
| 7 | Read the FAQ | **950** | 130×40, 15px | white |
| 8 | Start for $1 | **513** | **414**×48, 16px | `#111214` |
| 11 | Start for $1 | **559** | 125×48, 16px | `#111214` |
| 11 | Open a demo store | **696** | 186×48, 16px | white |

- **11 distinct x-origins.** 144, 169, 274, 513, 559, 560, 670, 696, 792, 929, 950, 1171, 1202.
- **3 button heights** (32 / 40 / 48) and **3 font sizes** (13 / 15 / 16px) for the same job.
- **The identical label "Start for $1" ships at 5 widths: 94, 125, 125, 414, 125.** A 4.4×
  variance.
- **6 solid-fill primary buttons.** `docs/design-system.md` §5: *"Never two primary buttons in one
  view."* The first viewport alone contains two (header + hero).
- **The same label appears at wildly different anchors:** "See a live store" at x=929 (section 0)
  and x=144 (section 3), 785px apart. "See what's included" — the *same component* — at x=670
  (section 5) and x=274 (section 6), 396px apart.

**This is the mechanical cause of "disjointed."** Alternating bands are the symptom the owner could
name; three uncoordinated grid systems and an unowned button system are the disease.

---

## 3. Does the near-monochrome decision fix it?

**It fixes the third complaint and roughly one-third of the first. It does not touch the second.**

### What the decision does fix — credit where due

Measured against the approved tokens in state B:

| Token | Approved | Rendered | ✓ |
|---|---|---|---|
| bg | `#FFFFFF` | `rgb(255,255,255)` | ✓ |
| text | `#111214` | `rgb(17,18,20)` | ✓ |
| muted | `#6B6F76` | `rgb(107,111,118)` | ✓ |
| border | `#E5E5E7` | `rgb(229,229,231)` | ✓ |
| primary btn | `#111214` / white | `rgb(17,18,20)` / `rgb(255,255,255)` | ✓ |
| signal green | `#0F7B4A` | `rgb(15,123,74)` | ✓ |

**Every contrast pair on the page now passes AA**, which the old palette did not:

| Pair | Ratio | AA body |
|---|---|---|
| `#111214` on `#FFFFFF` | 18.74 | PASS |
| white on `#111214` button | **18.74** | PASS |
| `#6B6F76` on `#FFFFFF` | 5.05 | PASS |
| `#6B6F76` on `#F4F4F5` | 4.59 | PASS |
| `#0F7B4A` on `#FFFFFF` | 5.31 | PASS |
| `#0F7B4A` on `#F4F4F5` | 4.83 | PASS |
| `#B0B3B9` on `#0A0B0C` | 9.38 | PASS |

That is a real win. The old primary was white on `#DC3A0C` at 4.51 — one rounding error from failing
— and `#F94E1B` at 3.42 was an outright AA failure that the design system already documents as a
shipped defect. The monochrome primary retires that class of bug permanently.

**Accent discipline is also better than expected.** Only **9 saturated elements** exist on the entire
12,381px page. That is genuinely restrained.

### What it will NOT fix — flag these now

1. **The bands survive the repaint.** The decision says "a single page ground with no alternating
   bands." That half has not been implemented. State B still ships **four grounds and eleven flips**
   (§2.1). Two of those grounds — **`#F4F4F5`** (26 elements ≥8000px²) and **`#0A0B0C`** (5
   elements) — **are not in the approved palette at all.** The migration added the right colours
   without removing the wrong structure. If it ships like this, the owner will look at it and say
   "it's still dark on top of light," and he will be right.

2. **Repainting cannot fix five container widths.** Nothing in §2.2 or §2.3 is a colour problem.
   Grey→white on section 6 still leaves its content starting 130px right of section 5's.

3. **`#111214` is doing three jobs.** It is the text colour, the primary-button fill, *and* the card
   surface on the dark bands (15 elements). When the same value is body copy, the one thing you must
   click, and a background, the button stops reading as a button. On the dark sections the product
   cards are `#111214` on a `#0A0B0C` ground — a 1.05:1 surface separation, effectively invisible
   (`s07.png`).

4. **Green is used 14 times and 10 are out of contract.** The rule is "money / in-stock / savings
   only." Legitimate: `$…/.00` in the hero card, the "No transaction fees" badge, `$180.91`.
   Out of contract: **ten `rgba(15,123,74,0.05–0.10)` cell washes** across the whole RebelShops
   column of the comparison table, tinting *"Included"*, *"n/a — monthly only"*, *"Stripe's published
   rate, direct to your account"*, *"None — Stripe is the processor"* and *"Your existing ShipStation
   works now"*. None of those are money. A green column-wash reads as "our side is the good side,"
   which is exactly the tell that makes a comparison table look rigged — and this table is otherwise
   the most trustworthy thing on the page. Strip the wash; keep green on `$180.91` alone.

5. **The decommissioned brand hue is still painted on the page.** The step-3 theme-picker mock at
   y≈2,624 renders swatch dots in `#F94E1B` (ember), `#D98A00` (amber), `#0FA871` (mint) and
   `#2563EB` (azure). Four saturated chips sitting in the middle of a monochrome page — and one of
   them is the exact hue being retired.

6. **The `--ember-*` shim is a liability, not a migration.** `globals.css` now aliases
   `--ember-500: var(--ink-900)`, `--ember-300: var(--ink-400)`, and so on, so every stale reference
   silently paints ink. That is a sensible bridge, but it means **grep can no longer tell you what is
   migrated.** `HeroTransform.module.css:126` still reads
   `linear-gradient(to bottom, var(--ember-200), var(--ember-500))` and nobody will ever notice,
   because it renders correctly-ish. Put a deletion date on the shim block or it becomes permanent.

**Bottom line:** the palette decision is correct and worth shipping. It answers "I hate the colour
scheme" completely. It answers "dark on top of light" only if the single-ground half is actually
built. It answers "disjointed" not at all.

---

## 4. Section-by-section teardown

Heights are state B. Density = characters of rendered `innerText` per pixel of section height (state
A pairs, the only run where both were captured together); FAQ density is understated because answers
sit inside collapsed `<details>`.

| # | Section | Height | Ground | Container | Density | Job it does | Verdict |
|---|---|---|---|---|---|---|---|
| 0 | Hero | 896 | `#FFF` | 1200 | 0.41 | Names the buyer, the transformation, the price, the action | **KEEP** — tighten to 780 |
| 1 | AlreadyHaveIt | 657 | `#F4F4F5` | 1200 | 1.03 | Reframes ShipStation as an asset. Densest section on the page | **MERGE** into hero as a 4-item strip |
| 2 | HowItWorksSteps | 1,253 | `#FFF` | 1200 | 0.75 | Three steps + timings | **CUT to 380** — full version already at `/how-it-works` |
| 3 | MakeItYours | 916 | `#F4F4F5` | 1200 | **0.37** | Theming. Lowest density on the page | **DELETE** — verbatim on `/features` |
| 4 | SyncSection | 647 | `#0A0B0C` | 1200 | **1.19** | The sync log with a *failed* row. This is supporting claim #2 | **KEEP** — 420 |
| 5 | InventorySection | 828 | `#FFF` | 1200 | 1.25 | Dead-stock report | **DELETE** — verbatim on `/features` |
| 6 | AnalyticsSection | 868 | `#F4F4F5` | 940 | **0.39** | Zero-result searches | **DELETE** — verbatim on `/features` |
| 7 | ProofSection | 1,391 | `#0A0B0C` | 1392 | 0.47 | 12 product tiles + 3 honest cards | **CUT to 340** — keep the 3 cards, delete the tile wall |
| 8 | PricingSection | 1,721 | `#FFF` | 720 | 0.93 | Price + Included + Not-included | **KEEP** — 900 |
| 9 | CostComparison | 1,371 | `#F4F4F5` | 960 | 1.18 | 12-month maths vs Shopify Basic | **CUT to 320** — 3-row strip; full table to `/pricing` |
| 10 | FaqSection | 768 | `#FFF` | 1200 | 0.45 | 5 collapsed questions | **CUT to 480** — 4 items, single column |
| 11 | FinalCta | 554 | `#0A0B0C` | 720 | 0.41 | Closes on the offer | **KEEP** — 340 |

### Delete outright, and the evidence for it

**`/features` imports `MakeItYours`, `SyncSection`, `InventorySection` and `AnalyticsSection`.
`/how-it-works` imports `AlreadyHaveIt`, `HowItWorksSteps`, `SyncSection` and `FaqSection`.** Not
similar components — the *same modules*, from `src/app/features/page.tsx` and
`src/app/how-it-works/page.tsx`.

Union of homepage sections that exist byte-identically on a page the nav already links to:
sections 1, 2, 3, 4, 5, 6, 10 = 657 + 1,253 + 916 + 647 + 828 + 868 + 768 = **5,937px = 48% of the
homepage.** `SyncSection` renders on all three pages.

The homepage is not composed. It is a concatenation of every subpage, which is exactly why it reads
as a stack of unrelated slabs rather than an argument.

### Named for deletion

1. **Section 3 MakeItYours (916px, density 0.37 — worst on the page).** A section arguing "it should
   look like *your* brand, not like our template" that proves it with three cards which are visibly
   the *same template* with three different image tints (`s03.png`). The claim and the evidence
   contradict each other. Duplicated on `/features`.
2. **Section 6 AnalyticsSection (868px, density 0.39, and the only 940px container on the page).**
   Zero-result search tracking is a month-three feature. It is not an acquisition argument, it costs
   868px and one unique grid width, and it is duplicated on `/features`.
3. **Section 5 InventorySection (828px).** Genuinely good content, wrong page. The deck itself says
   so — §2, *"Supporting, not headline… land this on the feature page and in the comparison."* The
   build put it on the homepage anyway.
4. **The 12-tile product grid inside section 7 (≈690px of the section's 1,391px).** Two rows of six
   `220×329` tiles showing fictional products from three seeded demo stores, on a page section
   headed "Here's the evidence instead." Twelve pictures of a yoga mat and a kettlebell are not
   evidence that the software works. The three text cards beneath them are. Delete the wall, keep
   the cards. Bonus: it also removes the section's internal 120px alignment jog.

### The dead space the owner named

- **Hero connector (`s00.png`).** The gutter between the two hero panels is a **250 × 408px** column
  containing two `34×1px` hairlines and one `134×27px` pill. Total ink **3,686px² inside 102,000px²
  — a 3.6% fill rate.** The deck (§3.1) specifies "one thin connector line between them." What
  renders is 96% empty air with a label floating in it, so the before/after reads as two unrelated
  panels instead of a transformation. This is the single most important image on the site.
- **Section 2 intro block (`s02.png`).** Heading and lead occupy x=144–723, y=120–300. The region
  x=723–1320 × y=120–350 is **597 × 230px of nothing** — 137,310px².
- **Section 10 FAQ (`d11.png`).** Two-column grid: a `max-width: 16ch` heading in the left column
  and *nothing else*, for the full 768px height. Roughly **480 × 510px of empty left column**, plus
  ~180px of white below the last FAQ row.
- **Mobile MakeItYours (`m05.png`).** Microcopy ends, then **~240px of empty grey**, then the dark
  band. Immediately after, the "STAYS CURRENT" eyebrow sits alone above **~250px of empty black.**
  This is the closest match to the owner's "one line of text followed by ~200px of nothing," and it
  is worse on mobile than on desktop.
- **Structural padding.** In state A every section carried `padding-block: 128px`: 12 × 257px =
  **3,084px, 23% of the page, spent on gaps.** State B's move to `--section-y: clamp(3.5rem, 6vw,
  5.5rem)` = 88px already recovers ~960px. Correct change; keep going.

---

## 5. Five-second test

First viewport only, 1440×900 (`d00.png`, `s00.png`). A ShipStation seller gets:

| Question | Answer on screen | Pass |
|---|---|---|
| What is this? | H1: "Your ShipStation catalog, now a storefront." | **YES** |
| Is it for me? | Eyebrow: "FOR SHIPSTATION SELLERS" — qualifies in word three | **YES** |
| What does it cost? | "$1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime." | **YES** |
| What do I do? | "Start for $1" / "See a live store" | **YES** |

**The hero passes the content test outright, and it is the strongest thing on the site.** The deck's
headline reasoning (§3.1) was correct and the build executed it faithfully.

It fails the *composition* test. The CTA pair sits at y=318 in the right column, x=792–1086, with no
horizontal or baseline relationship to anything on the left — the H1's last baseline is at y≈330,
12px off, which reads as an accident rather than an alignment. The primary button is **648px right
of the page's own left margin**, while five of the other six primaries on the page sit at x=144 or
x=513. And the reader sees **two solid ink primaries simultaneously** (header at x=1202, hero at
x=792), violating the design system's own rule.

**Fix:** move the CTA pair under the H1 at x=144, drop the header's "Start for $1" to a ghost link
while the hero CTA is in view, and give the microcopy the same left edge. Zero content change.

---

## 6. Mobile at 390 — where it collapses

Measured state A at 390×844 (`m00`–`m18`). State B is ~10% shorter but structurally identical.

- **Document height 15,605px = 18.5 viewport heights.** Settled with images the figure is higher
  (desktop grew 10% on image settle, so ≈17,000px, i.e. ~20 screens).
- **72 elements overflow the 390px viewport.** Worst offender: the sync-log table renders
  **534px wide inside a 390px screen** — a 144px overflow forced into a horizontal scroller
  (`SyncSection-module__table`, columns at x=328–432 and x=432–534).
- **The comparison table's caption cell collapses to a 165px column and sets one word per line**
  — "only, / first / twelve / months, / US / pricing." (`m13.png`). The stacked responsive table then
  repeats the "REBELSHOPS / SHOPIFY BASIC" label pair **9 times** down the page.
- **The sticky header ghosts content.** `position: sticky`, 76px, `background: color-mix(in srgb,
  var(--paper) 88%, transparent)` + `backdrop-filter: blur(12px)`, `z-index: 50`. Because it is 88%
  opaque, text is visibly legible *through* it at every scroll position (`d01`, `d04`, `d11`, `m04`,
  `m13`). In `m04.png` it clips the step-3 number badge in half. Make it opaque on scroll, or give
  the sticky state a solid fill.
- The hero's two-panel visual — the page's central argument — is pushed entirely below the fold at
  390 and never recovers its side-by-side reading.

---

## 7. Scroll-reveal: what it actually breaks

`src/components/marketing/parts/Reveal.tsx` uses Framer Motion with
`initial={{ opacity: 0, y: 16 }}` and `whileInView`. Measured consequences:

| Question | Answer |
|---|---|
| Does it ship `opacity:0` in the server HTML? | **Yes — 65 elements** carry `style="opacity:0;transform:translateY(16px)"` in the raw response from `curl`. |
| Is the text in the DOM for crawlers? | **Yes.** `#main` contains 9,597 characters of `innerText`. Raw-HTML scrapers and JS-rendering crawlers both get the copy. **This is not an SEO emergency.** |
| Does it cause layout shift? | **No. CLS = 0.0015** over the full scroll, across 5 shift entries, largest 0.0005. Opacity and transform only. **This part is well built.** |
| What breaks with JS disabled? | **Everything.** 65 text-bearing elements stay at `opacity: 0` permanently. The full 11,261px document renders as **empty coloured stripes with the header and footer and not one word of body copy** — see `nojs-full.png`. |
| Is it visible to real users? | **Yes.** Mid-scroll captures show headings and buttons rendering in half-tone grey while the reader is looking at them: `d04.png` ("Know what to reorder…" and its entire paragraph in mid-grey), `d05.png` ("See what people searched for…"), `d07.png` (the pricing card's primary button rendered as washed salmon), `d08.png` (the "What's the catch?" card at roughly 15% opacity). |

**Severity: high, but not for the reason assumed.** Crawling is fine and CLS is fine. The real
defects are (a) a total blank page on any JS failure — a 12,000px document with zero content is the
worst possible failure mode for a page asking for a card — and (b) a visible half-tone flash on every
section during normal scrolling, which by itself makes the page feel cheap and unfinished.

**Fix:** render at `opacity: 1` by default and let the animation *remove* a class rather than add
one, or wrap the initial state in `@media (scripting: enabled)`. Either way, no-JS must show the
page. Also raise `viewport.amount` from `0.18` or reduce `duration` from `0.42s` — the current
combination is what produces the visible grey flash on tall sections.

---

## 8. Conversion

- **Distance from fold to the pricing section: 7,533px = 8.4 viewport heights** at 900px.
  Mitigated — the hero microcopy states "$1 for 3 months, then $19.99/mo" at y≈397, so the price is
  above the fold even if the pricing *block* is not. Credit for that.
- **The nav's "Pricing" link does not go to `/pricing`.** `routes.ts:21` sets
  `pricing: '/#pricing'` with the comment *"Swap to `/pricing` the day that route mounts."*
  **`src/app/pricing/page.tsx` exists and is 336 lines long.** So the header link scrolls the visitor
  7,533px down the homepage instead of loading a purpose-built page. `faq: '/#faq'` and
  `comparison: '/#comparison'` are the same — the footer's "Product" column advertises five links,
  three of which are anchors on the page you are already on. **This is the structural reason the
  homepage has to carry a 1,721px pricing block and a 1,371px comparison table:** the nav never
  leaves it. Fix the three routes and 3,092px of homepage becomes deletable in one commit.
- **17 CTAs competing, 6 of them solid-fill primaries, 5 of them the same "Start for $1."** With six
  equally-weighted primaries there is no primary. Target: one primary per viewport, one repeated
  label, and every secondary demoted to a link.
- **The page never says what happens after you click "Start for $1."** Not once, in five instances.
  The homepage pricing card's only microcopy is *"Cancel anytime in your admin."*
  (`PlanCard.tsx:93`). No "no card required," no "you'll connect ShipStation next," no step count.
  For a buyer whose stated objection is *"what's the real number?"*, the moment before the click is
  exactly where you answer it.
- **The copy deck required that line and the build dropped it.** §3.10 specifies microcopy
  *"Card required. Cancel anytime in your admin."* — the build ships only the second sentence.
  Which turns out to be lucky, because the first sentence is false (§9.2).
- Deck §3.10 also specifies the card eyebrow `EVERYTHING, ONE PRICE` and badge `0% transaction fees`.
  The build renders no eyebrow and `No transaction fees`. Minor, but the deck is marked "implement
  verbatim."

---

## 9. Honesty

### 9.1 Fabricated proof — PASS, and this is a real achievement

The deck (§3.9) flagged that `LandingPageMeta.tsx` was shipping
`aggregateRating: { ratingValue: "4.8", ratingCount: "150" }` plus a review attributed to a
"Sarah Johnson" into JSON-LD. **Verified removed.** Grepping the served HTML for `aggregateRating`
and `Sarah Johnson` returns nothing; `LandingPageMeta.tsx:16` now carries a comment forbidding them.

No testimonials, no customer logos, no star ratings, no "trusted by N sellers", no press badges
anywhere in the rendered page. The proof section's eyebrow literally reads **"NO TESTIMONIALS YET"**
and its subhead is *"You can't check our references yet, so check the product."* Card 3 is titled
*"Who we're not for."* That is a company telling the truth at cost to itself, and it is the most
persuasive thing on the page. **Do not let the redesign sand this off.**

Deck §3.9 specified four cards; card 2 ("What's built and what isn't") was correctly **cut** per its
own `[GATED: requires a public /changelog]` instruction rather than linked to a stub. Correct call.

### 9.2 One real defect — `/pricing` states something untrue

`src/components/marketing/pricing/PricingPage.tsx:77` renders:

> **Card required.** Cancel anytime in your admin.

The docblock **twelve lines above it in the same file** (`:43`) says: *"does not take a card. No card
is collected anywhere on this page."* And `routes.ts:26` documents the destination:
*"Account creation + store setup wizard. **No card is taken today.**"*

So the pricing page tells a visitor they must hand over a card, and then doesn't ask for one. It is
the *safe* direction of error, but on a page whose entire competitive position is "we tell you the
truth about money," a false statement about payment is the worst possible line to get wrong. Delete
it, or replace with **"No card required to start."** — which is both true and a materially better
offer than the one currently advertised.

### 9.3 Gated claims — clear, but re-verify at publish

Two gates that would have blocked launch have since been satisfied by shipped code:

- **§3.7 Stripe** (*"This entire section must stay unpublished"*) — now satisfied:
  `src/app/api/checkout/session/route.ts` creates real PaymentIntents and Checkout Sessions,
  `src/app/api/webhooks/stripe/route.ts` handles them, `src/lib/stripe/connect.ts` exists. The hero's
  "Payments through your Stripe account" is therefore legitimate.
- **§3.10 billing** (*"change the CTA to 'Join the waitlist'"*) — now satisfied:
  `src/app/api/billing/checkout/route.ts` and `src/lib/billing/subscriptions.ts` exist.

Two to watch:

- **§3.5 order write-back is still gated.** The permitted lines are exactly *"Sell something here,
  and ShipStation knows"* and *"Orders are handed to ShipStation for fulfillment."* The hero subhead
  ships **"Orders come back to ShipStation"** — arguably stronger than the permitted phrasing and
  closer to the forbidden "orders appear in your ShipStation order queue." Confirm the write-back
  path creates real ShipStation *orders* (not v2 shipments with a mock fallback) or reword to the
  approved sentence.
- **Footer heading "LIVE STORES"** lists the three seeded demo stores with no "demo" qualifier, while
  the deck and every on-page CTA call them demo stores. Low severity; add the word.

### 9.4 The deck's own structure is part of the problem

§3 specifies **thirteen homepage sections**, of which **§3.4–§3.8 are five consecutive full-bleed
feature sections**, each with its own eyebrow, H2, body, CTA and visual. The build implemented that
faithfully (minus §3.7, gated) and got 12,381px. **The implementation is not misreading the deck —
the deck specifies a features page and calls it a homepage.** Any fix that only touches CSS will
regress the moment someone re-reads §3. Amend the deck: §3.4, §3.6 and §3.8 move to `/features`
outright, and the homepage §3 becomes eight sections.

---

## 10. The page I would ship instead

Eight sections. One ground: `#FFFFFF`, everywhere, top to bottom. Separation comes from a **1px
`#E5E5E7` rule and whitespace, never from a fill.** One exception: the final CTA and the footer form a
single continuous `#111214` slab at the bottom, because ending on a dark block is a full stop and
that is the one place the dark currently earns its keep.

**One container, `1120px`, left edge `x=160` at 1440, for every section without exception.**
Delete `940px`, `960px` and `720px` from the component CSS; if a section wants narrower text, cap the
*measure* at `68ch`, never the container. Collapse the ten `ch` caps to three: `20ch` display, `34ch`
headline, `68ch` body.

**One CTA rule:** exactly one solid `#111214` primary per viewport, always at the container's left
edge, always 48px tall at 16px. Everything else is a text link with an arrow. No bordered
secondaries.

| # | Section | Target height | What it does |
|---|---|---|---|
| 1 | **Hero** — H1, subhead, one primary + one text link, price microcopy, and the before/after visual with a *real* connector | **780** | The whole pitch. CTA cluster at x=160 directly under the H1. Connector gutter cut from 250px to 96px with a visible rule and arrowhead. |
| 2 | **"You already have it"** — 4-item checklist strip, no headline block | **300** | Absorbs section 1. Highest-density content on the current page, at 40% of its current height. |
| 3 | **Three steps** — horizontal, 3 columns, timings only | **380** | Compresses 1,253px. Deep version stays on `/how-it-works`. |
| 4 | **The sync, with a failed row** | **420** | Supporting claim #2, the objection that actually loses this sale. Keep the failure in the log — it is the most credible pixel on the site. |
| 5 | **Proof strip** — the 3 honest cards only | **340** | Delete the 12-tile product wall. Keep "NO TESTIMONIALS YET" and "Who we're not for" verbatim. |
| 6 | **Pricing** — card, Included, Not-included | **900** | Keep essentially as-is; it is the second-best thing on the page. Add "No card required to start." |
| 7 | **The maths** — 3-row strip: 12-month cost, transaction fees, what Shopify does better | **320** | Full table moves to `/pricing`. Strip the green cell wash; green appears once, on `$180.91`. |
| 8 | **Final CTA** — dark, merging into the footer | **340** | Unchanged. |

**Page budget: 3,780px of sections + 72px header + 400px footer = 4,252px. Call it 4,400px.**

That is **a 65% reduction from 12,381px** (66% from the 13,197px the owner rejected), and it removes
**zero** approved claims — every deleted section already exists verbatim on `/features` or
`/how-it-works`.

Mobile target: **≤ 7,000px**, down from 15,605px.

### Do these first, in this order

1. **Point `ROUTES.pricing` at `/pricing`, `faq` at `/pricing#faq`, `comparison` at `/pricing`.**
   One file. Immediately makes 3,092px of homepage deletable and gives the nav a reason to exist.
2. **Delete sections 3, 5 and 6 from `page.tsx`.** Three import lines. −2,612px. Nothing is lost;
   they render on `/features`.
3. **Make `Reveal` default to `opacity: 1`.** One file. Fixes the blank no-JS page and the grey
   scroll flash.
4. **Collapse to one ground and one container.** The owner's actual complaint.
5. **One primary CTA per viewport, all at the container's left edge.**
6. **Delete "Card required." from `PricingPage.tsx:77`.** One line, and it is currently false.

---

## 11. What is genuinely good — keep all of this

Being harsh about the layout should not obscure how much of the *thinking* here is right.

- **The copy.** "Your ShipStation catalog, now a storefront." qualifies the reader in three words and
  states a transformation with no adjective to defend. "You already have the inventory. You just
  don't have the store." is the best sentence on the site. The deck's headline-ranking exercise
  (§3.1) reached the correct answer for the correct reason.
- **The honesty posture, which is the actual product differentiator.** "NO TESTIMONIALS YET." "Who
  we're not for." The "Not included — read this part" block naming custom domains, multi-currency,
  POS and migration as things you do not get. "Where Shopify wins," which credits the competitor's
  custom domains, app store, POS and support org by name. Nobody does this. It is worth more than
  any redesign.
- **The sync log with a failed row in it**, and the rate-limit message underneath: *"ShipStation
  returned 429 — rate limited. Retrying on the next run."* A clean log is marketing; a log with a
  handled failure is evidence. Whoever specified that (deck §3.5, "this buyer has been burned
  before") understood the buyer.
- **The comparison table's methodology note.** "What we left out on purpose," explaining that app
  fees and card processing are excluded and why, with links to `shopify.com/pricing` and
  `stripe.com/pricing`. That is how you make a competitor table believable.
- **The `aggregateRating` / fake-review removal actually happened.** Verified absent from the served
  HTML. That was invented proof going to search engines and it is gone.
- **The pricing card.** Tabular price, "for your first 3 months / then $19.99/mo", a clean Included
  list, and the Not-included list directly beneath. Structurally correct; it just needs to stop
  being 1,721px tall and start saying what the click does.
- **Reveal causes no layout shift.** CLS 0.0015 across the whole page. Whatever else is wrong with
  the animation, it was implemented with the right primitives and it honours
  `prefers-reduced-motion`.
- **The monochrome decision itself.** Every contrast pair now passes AA, including the primary button
  that measurably failed at 3.42:1 under `--ember-500`. Only 9 saturated elements survive on
  12,381px. The instinct is right. Finish it — including the single-ground half.
- **Real data, not lorem.** The hero, the showcase and the zero-result table are built from live rows
  in the seeded demo stores (`page.tsx:47–58`). That is more work than mocking it and it shows.

---

## Appendix — evidence index

All paths relative to `/home/user/schmo-store-front/.scratch/`.

| Artifact | Contents |
|---|---|
| `shots/crit/d00`–`d12.png` | State A, 1440×900 viewport panes, whole page |
| `shots/crit/s00`–`s11.png` | State B, per-section full captures, images settled |
| `shots/crit/m00`–`m18.png` | State A, 390×844 viewport panes, whole page |
| `shots/crit/full-1440.png`, `full-revealed.png` | Full-page composites |
| `shots/crit/nojs-full.png` | **JS disabled — 11,261px of empty bands** |
| `shots/crit/mobile-debug.png` | The 500 that ended the session |
| `crit-1440.json` | State A sections, CTAs, 45 `opacity:0` elements at load |
| `crit-settle.json` | State A settled heights, CLS trace, console errors |
| `crit-now.json` | **State B — grounds, containers, CTAs, 9 saturated elements** |
| `crit-390.json`, `crit-voids.json`, `crit-color.json` | Mobile overflow, void scan, colour sampling |
| `critique-measure.js`, `crit-now.js`, `crit-nojs.js`, `crit-sections.js`, `crit-settle.js`, `crit-mobile.js` | Reproduction scripts |
