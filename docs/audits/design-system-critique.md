# RebelShops Design System — Critique

**Reviewed:** `docs/design-system.md` (the promise) against `src/app/globals.css`,
`src/app/layout.tsx`, `src/lib/theme/rebel-theme.ts`, `src/lib/design/**`, `src/components/ui/**`,
and the live showcase at `/dev/design-system`.

**Method:** static read plus four instrumented Playwright passes (`.scratch/audit.js`,
`.scratch/audit2.js`, `.scratch/audit3.js`) measuring computed styles, rendered pixel colours,
tab order, focus traps, type metrics at 390/1920, reduced-motion behaviour, and all three theme
paths. Every number below is measured, not estimated. Screenshots referenced are in
`/home/user/schmo-store-front/.scratch/shots/`.

---

## Verdict

**Grade: C+.** No, a designer at Linear, Stripe or Vercel would not ship this as-is — but they would
recognise real craft underneath it, which is more than most codebases earn. The type scale is
genuinely excellent: measured at 390px and 1920px it lands on `44/72px` display, `36/52px` h1,
`28/36px` h2 with line-height ratios of exactly 1.02 / 1.08 / 1.15 and tracking of exactly
−0.030 / −0.025 / −0.020em — the spec, to the decimal, with negative tracking correctly present at
display sizes and correctly absent at body. Modal and Drawer trap focus, close on Escape and restore
focus to their trigger. Motion runs on two easings, not eight. That is a real system.

What sinks it is that the colour layer fails its own written rules and the dark theme has clearly
never been looked at. White on `--ember-500` measures **3.42:1** — every primary button in the
product fails WCAG AA for its own label, and §2 of the doc *codifies the failure* by declaring 16px
semibold acceptable. The two-layer focus ring is `ember-500` drawn around an `ember-500` button:
measured **1.00:1** ring-to-fill, so the flagship control has, in practice, no focus indicator. In
dark mode four semantic tokens collapse onto the single value `#171A20`, which makes every card
header divider **1.00:1 — literally invisible** — and leaves ghost buttons with zero hover feedback
inside a card. `ProductImage` ships purple (`#7C3AED`), violet (`#4C1D95`) and teal (`#14B8A6`)
tiles for **25% of all SKUs** against an explicit §1 anti-goal of "do not look like a generic
purple/blue SaaS template." And the 4px spacing scale the doc defines exists nowhere in CSS —
`var(--space` appears **zero** times in the entire repo.

The gap here is not taste. Someone with taste wrote this. The gap is that the light-mode resting
state was designed and everything else — states, dark, contrast maths — was assumed.

---

## Blocking defects

### B1. White-on-ember fails AA on every primary button, and the doc blesses it

**Evidence.** Measured on the live page: `#FFFFFF` on `#F94E1B` = **3.42:1**. Every primary button
fails at every size — `primary/sm` 13px/600 (3.42:1), `primary/md` 15px/600 (3.42:1), `primary/lg`
16px/600 (3.42:1). Same 3.42:1 for the solid ember badge at 12px. Solid mint badge (`--mint-600`,
`Badge.module.css:107-111`) = **4.37:1**. Solid amber (`--amber-600`, `:112-116`) = **3.91:1**.
`docs/design-system.md:81` asserts *"White text on `--ember-500` fill is fine at ≥16px semibold."*
That is not what WCAG says: large text is ≥18.66px **bold** or ≥24px. 16px/600 at 3.42:1 fails 4.5:1
with no exemption.

**Why it matters.** "Create store", "Sync ShipStation", "Add to cart" — the single most important
control in a commercial product — has label text a low-vision or bright-sunlight user cannot reliably
read. This is also the one finding a procurement accessibility review will find in thirty seconds.

**Fix.** Keep `--ember-500` as the resting *fill* only if you darken the label ground: set the
primary button fill to `--ember-600` (`#DC3A0C`, white = **4.51:1**, passes) and move hover to
`--ember-500` (lighter on hover reads as "lifting" and is consistent with the translateY). Solid
badges move to `--mint-700` (6.45:1) and `--amber-700` (5.78:1). Then correct
`docs/design-system.md:81` — the current sentence will cause this defect to be reintroduced by the
next agent that reads it.

### B2. The focus ring on filled buttons is the same colour as the button — 1.00:1

**Evidence.** Pixel probe across the left edge of a focused primary button
(`.scratch/shots/ring-light-primary.png`, `ring-dark-primary.png`):

```
ground(-13) rgb(251,250,248)   ring(-3) rgb(249,78,27)   gap(-1) rgb(251,250,248)   fill(+8) rgb(249,78,27)
ring-vs-fill = 1.00:1   ← the indicator and the control are the identical colour
```

Destructive is the same story: rose ring on rose fill, **1.00:1**. The small buttons in a card
footer (which sit on `--surface-sunken`) get a `--surface`-coloured 2px gap that does not match
their actual ground — measured mismatch on 5 of 6 distinct grounds interactive elements occupy
(`.scratch/audit2.js` section I).

**Why it matters.** The doc's §2 ring is well-designed *for unfilled controls*. On the ember and rose
buttons — the two most consequential actions in the app — a keyboard user sees a 2px paper hairline
and nothing else. WCAG 2.4.11 requires the focus indicator to contrast 3:1 with adjacent colours;
this is 1:1 against the control it is indicating.

**Fix.** Two changes. (a) Make the outer ring colour depend on the fill: on `.primary` and
`.destructive`, use `--text-primary`/`--ink-900` (or `--surface` inverted) as the outer stop instead
of the accent, so the ring is always a different hue from the thing it rings. (b) Replace the
`box-shadow` gap trick with `outline: 2px solid <ring>; outline-offset: 2px`. `outline` composites
over whatever the real ground is, which fixes the 5-of-6 ground mismatch for free and cannot be
clipped by an ancestor's `overflow: hidden` the way a box-shadow can.

### B3. Dark mode collapses four semantic tokens into one value; card dividers become invisible

**Evidence.** Resolved at runtime with `prefers-color-scheme: dark` (`.scratch/audit2.js` section C):

```
rgb(23,26,32)  <-  --surface-raised, --surface-inset, --surface-overlay, --border-subtle  *** COLLISION ***
rgb(34,38,47)  <-  --border, --skeleton-base                                              *** COLLISION ***
```

Consequences, all measured:
- `Card.module.css:117` `.header { border-bottom: 1px solid var(--border-subtle) }` on
  `.root { background: var(--surface-raised) }` → `#171A20` on `#171A20` = **1.00:1**. The divider
  does not exist. Same for `.footer` (`:157`).
- Ghost button hover fills `--surface-inset`. Measured `rest=rgba(0,0,0,0) hover=rgb(23,26,32)` —
  identical to a card's own background, so a ghost button inside a card has **zero hover feedback**
  in dark mode.
- Input border `--border` on `--surface-raised`: pixel-probed at **1.05:1**
  (`.scratch/audit3.js`, dark hairline probe). See `.scratch/shots/dm-media-dark.png` — the entire
  left-hand "FORM CONTROLS" column has no visible field edges.
- Badge `.neutral` (`Badge.module.css:51-55`) fills `--surface-inset` on a card → invisible pill.

**Why it matters.** Roughly half of developer-adjacent users run dark. The admin is where sellers
manage money; a form where you cannot see the field boundaries is not a premium product.

**Fix.** Give dark its own step ladder instead of reusing `ink-800` four times:
`--surface-raised: #171A20`, `--surface-inset: #1E222A`, `--surface-overlay: #1C2027`,
`--border-subtle: #262B34`, `--border: #333944`, `--border-strong: #454C59`. Then re-run the
collision probe; the requirement is that no two of `{surface, surface-raised, surface-sunken,
surface-inset, surface-overlay, border-subtle, border, border-strong}` resolve to the same value in
either theme.

### B4. `ProductImage` ships purple, violet and teal — 25% of the catalogue is off-brand

**Evidence.** `src/lib/design/tokens.ts:180-193`, `fallbackGradients`, contains three entries with no
relationship to the palette:

```ts
183:  { from: azure[500], to: '#4C1D95', on: '#FFFFFF' },   // blue → violet-900
187:  { from: '#14B8A6',  to: azure[700], on: '#FFFFFF' },   // teal-500 → blue
190:  { from: '#7C3AED',  to: ember[600], on: '#FFFFFF' },   // violet-600 → ember
```

`#4C1D95`, `#14B8A6` and `#7C3AED` are Tailwind defaults, not RebelShops tokens. Selection is
`hashString(seed) % 12` (`tokens.ts:225`), so distribution is uniform: over 3000 synthetic SKUs the
three off-palette entries take **25.0%** of tiles. The demo catalogue on the showcase proves it —
`PHONE-001 → #7C3AED` (the purple "LS" tile), `LAPTOP-ULTRA → #14B8A6→azure-700` (the teal "UT"
tile). Visible top-left and top-right of the PRODUCTIMAGE row in `.scratch/shots/crit-ds.png`.
`docs/design-system.md:17` states the anti-goal in as many words: *"Do not look like a generic
purple/blue SaaS template."* §2 states azure is *"Informational only."*

**Why it matters.** A seller's grid is the most-screenshotted surface in the product. One in four
tiles is currently the exact category-default purple the brand was positioned against, and it is
sitting next to the vermilion CTA.

**Fix — how hue selection should actually work.** Stop enumerating gradient pairs. Derive the hue
from the seed inside a constrained brand arc, and vary the *other* dimensions for per-SKU
distinctiveness:

```
h = 8 + (hash % 3600) / 3600 * 46      // 8°..54° — ember (14°) through amber (38°) only
s = 62 + ((hash >>> 8) % 26)           // 62%..88%
l = 34 + ((hash >>> 14) % 18)          // 34%..52%  — keeps white at ≥4.5:1 throughout
from = oklch/hsl(h, s, l)
to   = hsl(h - 10, s - 6, l - 20)      // same-family darker stop, so the ramp is a shade not a hue shift
```

Then reserve one deliberate off-ramp for visual rhythm: every Nth hash (say `hash % 7 === 0`) uses
the ink ramp (`ink-600 → ink-900`) instead of a hue — that gives you the graphite tiles already in
the set, which look intentional and expensive, without inventing a third brand colour. This keeps
every tile recognisably RebelShops while giving ~4600 distinguishable combinations of hue ×
saturation × lightness × the existing angle/glow/weave variation.

### B5. `prefers-reduced-motion: reduce` does not collapse anything to opacity-only

**Evidence.** With `reducedMotion: 'reduce'` emulated, hovering still applies transforms
(`.scratch/audit2.js` section H):

```
primary btn:       rest=none  hover=matrix(1,0,0,1,0,-1)   *** STILL TRANSLATES ***
secondary btn:     rest=none  hover=matrix(1,0,0,1,0,-1)   *** STILL TRANSLATES ***
ghost btn:         rest=none  hover=matrix(1,0,0,1,0,-1)   *** STILL TRANSLATES ***
interactive card:  rest=none  hover=matrix(1,0,0,1,0,-2)   *** STILL TRANSLATES ***
```

`globals.css:710-728` sets `transition-duration: 0.01ms !important` but never removes the
`transform` declarations themselves (`Button.module.css:106,131,151,170`; `Card.module.css:49`).
The switch thumb (`Field.module.css:398`, `ease-spring` 220ms) likewise teleports rather than not
moving. `docs/design-system.md:131`: *"Everything must be wrapped so `prefers-reduced-motion:
reduce` collapses it to opacity-only."*

**Why it matters.** For a vestibular-sensitive user, an instant 1px jump on every hover is worse than
the animation — it is the same displacement delivered with infinite acceleration. The current
implementation converts a smooth motion into a hard snap and calls it compliance.

**Fix.** Add to the reduced-motion block in `globals.css:710`:
`*:hover, *:active, *:focus-visible { transform: none !important; }` — or, better, scope the lift
itself: wrap the four `transform: translateY(...)` rules in
`@media (prefers-reduced-motion: no-preference)` so the resting geometry is the only geometry.

### B6. Nothing in the app ever sets `data-theme`; Mantine's scheme and our tokens desync

**Evidence.** Runtime inspection of `<html>` (`.scratch/audit2.js` section F):

```
data-mantine-color-scheme="light"   ← set by <ColorSchemeScript /> (layout.tsx:73)
data-theme = null                    ← never set by anything
```

`grep -rn "data-theme" src/ --include=*.tsx --include=*.ts` returns only `data-theme-id` (an
unrelated store-theme attribute). The `:root[data-theme="dark"]` block at `globals.css:342-396`
exists but is unreachable in the running product. Forcing Mantine into dark without it:

```
after data-mantine-color-scheme="dark":  --surface = #fbfaf8 (still light), bodyBG = rgb(251,250,248)
```

Mantine's internals go dark, our surfaces and text stay light. Screenshot:
`.scratch/shots/mantine-dark-desync.png`.

**Why it matters.** `docs/design-system.md` promises three working theme paths. Two of them
(`data-theme="dark"`, `data-theme="light"`) are dead code, and the one control a user will actually
reach — a Mantine colour-scheme toggle — produces a half-dark, unreadable page.

**Fix.** In `AppProviders.tsx`, subscribe to Mantine's `useComputedColorScheme()` and mirror it onto
`document.documentElement.dataset.theme` in an effect; add the same mirror to `<ColorSchemeScript />`'s
inline script so it applies before first paint and does not flash. Alternatively invert the
dependency: key the CSS off `[data-mantine-color-scheme="dark"]` instead of `[data-theme="dark"]`
and delete the parallel attribute.

### B7. Input and card boundaries are below the 3:1 non-text floor in both themes

**Evidence.** Pixel-probed on the rendered page (`.scratch/audit3.js`, hairline probe):

| Boundary | Light | Dark |
|---|---|---|
| Input border vs page ground | **1.18:1** | **1.15:1** |
| Input border vs its own fill | **1.23:1** | **1.05:1** |
| Card border vs page | **1.14:1** | **1.05:1** |

Token maths agrees: `--ink-200 #DCE0E6` on `--paper #FBFAF8` = 1.27:1; `--ink-700 #22262F` on
`--ink-800 #171A20` = 1.15:1.

**Why it matters.** WCAG 1.4.11 requires 3:1 for the visual boundary of a control when that boundary
is what identifies it. The inputs carry no fill contrast and no shadow, so the 1px border is the
*only* affordance saying "you may type here." In dark mode at 1.05:1 it is not an affordance at all.

**Fix.** Light: `--border` → `#C9CFD8` (2.0:1) is still not 3:1, so pair a raised fill with a shadow
— give `.control` `background: var(--surface-raised)` on a `--paper` page *plus* `--shadow-xs`, which
is the Stripe approach and reads as premium. Dark: `--border` → `#3A414D` against `#171A20` = 2.6:1,
plus the existing `--ring-top` inset highlight to define the top edge. If you want a single rule that
passes cleanly: give every field a 1px `--border-strong` border rather than `--border`
(`#B4BAC4` on white = 2.0:1) combined with the fill/shadow pair above.

---

## Quality gaps — correct vs. excellent

### Q1. There is no spacing token. At all.

`docs/design-system.md:112` defines a 4px scale (`4 8 12 16 20 24 32 40 48 64 80 96 128`).
`src/lib/design/tokens.ts:104` exports it as a TS array. `grep -rn "var(--space" src/` returns
**0 hits**. All 110 spacing declarations across `src/components/ui/*.module.css` are raw px, and a
histogram of them shows **26 of 76** are off the declared scale: `10px ×6`, `6px ×5`, `14px ×5`,
`2px ×3`, `22px ×2`, plus `3px`, `5px`, `18px`, `56px`.

This is the difference between a design system and a stylesheet. Right now nothing prevents the next
component from using 13px. **Fix:** emit `--space-1` … `--space-13` in the `@theme` block and convert
the modules; where an off-scale value is deliberate (the 6px label gap reads correctly), add it to
the scale rather than leaving it unnamed.

### Q2. Four different motion durations, three of which are not tokens

| Surface | Duration | Easing | Source |
|---|---|---|---|
| Buttons, fields | 120ms | `cubic-bezier(.16,1,.3,1)` | `--duration-micro` ✅ |
| Cards | 220ms | `cubic-bezier(.16,1,.3,1)` | `--duration-standard` ✅ |
| **Drawer** | **220ms** | `cubic-bezier(.16,1,.3,1)` hardcoded string | `Drawer.tsx:61` |
| **Modal** | **180ms** | **`ease`** (browser default) | `Modal.tsx:69` |
| **Tooltip** | **140ms** | `ease` | `Tooltip.tsx:49` |
| Spinner rotation | 720ms | linear | `Spinner.module.css:12` (token says 900ms) |

Measured live: `modal: {dur:"0.18s", ease:"ease"}` vs `drawer: {dur:"0.22s",
ease:"cubic-bezier(0.16, 1, 0.3, 1)"}`. Two panels performing the same gesture — a surface entering
over a scrim — arrive at different speeds on different curves, and the Modal is the only element in
the entire system running on the browser's default easing. That is exactly the tell a Linear designer
picks up on. **Fix:** both use `var(--duration-standard)` and `var(--ease-out)`; Tooltip uses
`--duration-micro`; delete `--animate-spin-slow` or make the Spinner consume it.

### Q3. The elevation shadows are cool, not warm — the doc's central claim about them is false

`docs/design-system.md:119` — *"shadows are warm-tinted and layered."* Every shadow token is built on
`rgba(16, 18, 22, α)` = `#101216`, where **B(22) > G(18) > R(16)**. That is a blue-grey cast; it is
literally cooler than neutral grey. On a `#FBFAF8` warm paper ground this produces the faint
grey-blue halo that separates a competent card from a beautiful one. A warm shadow on this palette
would be around `rgba(38, 26, 20, α)`.

Separately, "never a single flat blur" is contradicted by the doc's own `--shadow-xs`, and the
runtime histogram shows the single-layer `rgba(16,18,22,.06) 0 1px 2px` is the **most-used shadow on
the page, 35 instances** — more than every layered shadow combined. So the most common elevation in
the product is exactly the thing the doc forbids.

**Fix.** Re-tint to `rgba(38,26,20,…)` and give `--shadow-xs` a second, wider, very low-alpha layer
(`0 1px 2px rgba(38,26,20,.06), 0 1px 3px rgba(38,26,20,.03)`) so the smallest step is still a
system, not an exception.

### Q4. Dark mode has five elevation tokens and one visual result

`globals.css:330-334` maps every dark shadow to `--ring-top` plus a black blur. In the ELEVATION AND
RADIUS row of `.scratch/shots/dm-media-dark.png`, `shadow-xs` through `shadow-ember` are visually
indistinguishable flat rectangles. The doc's guidance ("on dark grounds use rings instead of
shadows") is sound in principle but was applied without designing the resulting ladder. Premium dark
UIs build depth from *surface lightness* steps plus a top hairline, not from black blurs that are
invisible against near-black. **Fix:** couple the dark elevation ladder to the surface ladder from
B3 — each elevation step raises `background-color` one rung and strengthens the `inset 0 1px 0
rgba(255,255,255,α)` from .04 to .10.

### Q5. `--text-tertiary` is `--ink-400`, which §2 explicitly bans for readable text

`globals.css:222` sets `--text-tertiary: var(--ink-400)`. `docs/design-system.md:78` — *"Never
`--ink-400` for anything a user must read."* It is currently used for:

- input placeholders (`Field.module.css:123`) — measured **3.35:1**
- the struck-through original price (`Price.module.css:73`) — a shopper reads this to judge the deal
- the "Optional" field marker (`Field.module.css:41`), affix text (`:165`), select chevron (`:200`)

**Fix.** `--text-tertiary: var(--ink-500)` (5.90:1 on paper) and introduce a separate
`--text-quaternary` for genuinely decorative marks only. The compare-at price should move to
`--text-secondary` outright.

### Q6. Disabled states are unreadable rather than merely de-emphasised

Measured: disabled input text **1.80:1** light, **1.50:1** dark (`--ink-600 #333944` on
`--ink-800 #171A20`). WCAG exempts disabled controls, which is a licence often mistaken for a target.
A seller looking at a plan-locked field ("Locked by your plan") cannot read what is locked.
**Fix.** Disabled should read at ~3:1 — `--text-disabled: var(--ink-400)` in light and
`var(--ink-500)` in dark — and lean on the reduced-contrast *fill* plus `cursor: not-allowed` to
signal state, not on making the text vanish.

### Q7. `EmptyState` renders its title as a `<p>`

`src/components/ui/EmptyState.tsx:87` — `<p className={styles.title}>{title}</p>`, styled at
`--text-h3`/Space Grotesk 600. Measured live: `empty title "No products yet": 22px … <P>`. Meanwhile
`Card` gets this right — `CardHeader` takes a `titleAs` prop defaulting to `h3`. A screen-reader user
navigating by headings skips every empty state in the product. **Fix:** mirror `Card`'s `titleAs`
pattern.

### Q8. The base `:focus-visible` rule silently rewrites border-radius

`globals.css:588-592`:

```css
:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-xs); }
```

Forcing `border-radius` inside a focus rule is a latent bug: any focusable element not carrying its
own radius (a bare `<a>`, a future primitive, anything from a third-party) becomes 6px-rounded the
instant it is focused, and pill-shaped or square elements will visibly change geometry on Tab. The
CSS-modules primitives happen to be unlayered and therefore win the cascade today, which is luck, not
design. **Fix:** delete the `border-radius` line; if the intent was "give unstyled things a
reasonable ring shape," do it with `outline-offset` instead, which does not touch layout.

### Q9. Six distinct radii on a single composition

Runtime histogram of the showcase: `{999px:62, 8px:60, 16px:26, 6px:7, 12px:3, 24px:1}`.
`docs/design-system.md:117` — *"Never mix more than two radii in one composition."* Pills + 8px +
16px is a coherent three-tier language and I would defend it; the stray `12px` (ProductImage default)
and single `24px` are noise. **Fix:** make `ProductImage`'s default `rounded` prop `'sm'` so image
tiles agree with buttons, and audit the lone `--radius-xl` use.

### Q10. `rebelTheme` legacy export is a live, off-brand parallel palette

`src/lib/theme/rebel-theme.ts:333-414` is marked `@deprecated` and still exports
`bg-gradient-to-br from-blue-50 to-cyan-50`, `from-green-50 to-emerald-50`,
`!bg-blue-600`, `#D4A574` tan, `#F0F8FF` — a complete second colour system in raw Tailwind classes,
imported by `src/components/landing/**`. Related: `StoreThemeProvider.tsx:42` writes
`--theme-primary: #22c55e` (Tailwind green-500) onto `document.documentElement` — it is present on
`<html>` even on the design-system showcase page, measured in the live DOM. And
`--mantine-color-blue-6` still resolves to stock **`#228BE6`**, so any `color="blue"` anywhere in the
admin renders Mantine's blue rather than `--azure-500`. Three separate colour systems are live at
once. **Fix:** override `blue` in the Mantine `colors` map with the azure ramp; put a lint rule on
`rebelTheme`; move `--theme-primary` off `:root` onto a store-scoped wrapper element.

### Q11. `ProductImage` initials break on common commerce names

Run against realistic catalogue strings:

| Input | Output | Problem |
|---|---|---|
| `3M Command Hooks` | `3C` | leading digit taken as an initial |
| `24kg Cast Iron Kettlebell` | `2C` | same |
| `#1 Best Seller Mug` | `1B` | same |
| `iPhone 15 Pro Max Case` | `I1` | second "word" is a number; `I1` is also ambiguous with `Il` |
| `5-Pack` | `5P` | numeric lead |
| `A` | `A` | single glyph — visually undersized against two-glyph siblings |
| `马克杯` / `セラミック マグ` / `محفظة جلدية` | `马克` / `セマ` / `مج` | **Space Grotesk is loaded `subsets: ['latin']` only** (`layout.tsx:19-23`), so these fall back to a system face mid-grid; Arabic additionally renders in isolated forms with reversed visual order |

`deriveInitials` (`ProductImage.tsx:44-57`) correctly strips emoji and punctuation and falls back to
the SKU — that part is good. **Fix:** (a) prefer letter-initial words: pick the first two words whose
first character matches `\p{L}`, falling back to digits only if none exist; (b) if the resulting
string is a single character, render one glyph at a larger optical size rather than leaving a
two-glyph slot half-full; (c) detect non-Latin via `\p{Script=Latin}` and switch the mark's
`font-family` to `var(--font-sans)` (Inter ships broader coverage) or render the SKU prefix instead —
never let one tile in a grid silently change typeface.

### Q12. Small details that separate competent from memorable

- **The field focus ring fires on mouse click** (`Field.module.css:69` uses `:focus-within`, not
  `:focus-visible`). Measured: clicking an input paints the full 4px ember halo. Stripe and Linear
  both show only the border colour change on pointer focus and reserve the halo for keyboard. As
  built, every click into a form flashes a large orange ring.
- **Three tab-order inversions** on the showcase (`.scratch/audit.js` section 7): the interactive Card
  (`y=2739`) receives focus *after* the buttons at `y=2925`. That is showcase markup order, but the
  interactive Card renders as a bare `<button>` with no `type` (`Card.tsx:46`, `as ?? 'div'` with the
  caller supplying `as="button"`), so inside a form it defaults to `type="submit"` — measured live as
  `BUTTON:submit`. A clickable card that submits the enclosing form is a real bug waiting for its
  first form.
- **`--surface-raised` and `--surface-overlay` are identical in light** (`#FFFFFF`), so a modal has
  no surface distinction from the card behind it — only the scrim separates them.
- **The `.link` button variant is 17px tall** at 390px, below any touch target guidance; §7 promises
  ≥40×40 on touch.
- **`--text-secondary` is measured at 5.90:1 on paper, not the 7.0:1** the doc claims
  (`design-system.md:78`). It passes AA comfortably; the doc is simply wrong and should be corrected
  so nobody budgets against a number that does not exist.

---

## Promise vs. implementation

| § | Claim | Status | Evidence |
|---|---|---|---|
| 1 | No generic purple/blue SaaS look | **Missing** | 25% of product tiles are `#7C3AED` / `#4C1D95` / `#14B8A6` (`tokens.ts:183,187,190`) |
| 1 | No emoji as UI iconography | **Met** | Tabler icons throughout; `deriveInitials` strips emoji |
| 2 | Ink / paper / ember palette present | **Met** | `globals.css:146-198`, exact hex match to doc |
| 2 | Money-green never used for chrome | **Met** | `--mint-*` confined to Price, success badges, savings pill |
| 2 | Body on paper = ink-900 | **Met** | measured 17.8:1 |
| 2 | Secondary = ink-500 at **7.0:1** | **Partial** | correct token, actual ratio **5.90:1** |
| 2 | Never ink-400 for readable text | **Missing** | `--text-tertiary: --ink-400` drives placeholders (3.35:1) and compare-at price |
| 2 | Ember is a fill, not a text colour; ember text ≥ ember-700 | **Met** | `--accent-text: --ember-700`, measured 6.11:1 |
| 2 | White on ember-500 fine ≥16px semibold | **Missing** | **3.42:1** — fails AA at every button size; the claim itself is incorrect |
| 2 | Every interactive element has a visible two-stop focus ring | **Partial** | ring exists and is correctly wired everywhere, but is **1.00:1** against ember/rose fills and mismatches the ground on 5 of 6 surfaces |
| 3 | Space Grotesk / Inter / JetBrains Mono via next/font | **Met** | `layout.tsx:18-39`; confirmed rendering all three |
| 3 | `cv05`,`ss03` feature settings on body | **Met** | `globals.css:531` |
| 3 | Fluid clamp type scale produces spec sizes | **Met** | display 44→72px, h1 36→52px, h2 28→36px, h3 22px — exact at 390 and 1920 |
| 3 | Line heights 1.02/1.08/1.15/1.25 | **Met** | measured 1.020/1.080/1.150/1.250 |
| 3 | Negative tracking at display, none at body | **Met** | measured −0.030/−0.025/−0.020/−0.015em; body `normal` |
| 3 | Prices in display face, tabular-nums | **Met** | `Price.module.css:6-14` |
| 4 | 4px spacing scale | **Missing** | no `--space-*` token exists; 26 of 76 declarations off-scale |
| 4 | Radius tokens 6/8/12/16/24/999 | **Met** | measured; buttons+inputs 8px, cards 16px |
| 4 | Never mix >2 radii per composition | **Partial** | 6 distinct radii on the showcase |
| 4 | Shadows **warm-tinted** | **Missing** | all built on `rgba(16,18,22,α)` — B>G>R, a cool cast |
| 4 | Shadows **layered, never a single flat blur** | **Partial** | sm/md/lg/ember are layered; the single-layer `--shadow-xs` is the most-used shadow on the page (35×) |
| 4 | Dark uses rings instead of shadows | **Met** (mechanically) | `globals.css:330-334` — but yields one visual result from five tokens |
| 4 | Two easings, three durations | **Partial** | tokens correct and used; Modal 180ms/`ease`, Tooltip 140ms/`ease`, Spinner 720ms bypass them |
| 4 | reduced-motion collapses to opacity-only | **Missing** | all four hover transforms still fire, now as instant snaps |
| 5 | Button heights 32/40/48 | **Met** | measured exactly |
| 5 | Primary lifts on hover, settles on active | **Met** | measured `translateY(-1px)` → `translateY(0)` with shadow swap; `.scratch/shots/st-primary-{rest,hover,active}.png` |
| 5 | Button loading keeps width stable | **Met** | measured `before 121.97px → after 121.97px, delta 0` |
| 5 | Cards: raised, 1px border, radius-lg, shadow-sm | **Met** | measured `h=280.8 r=16px border=1px rgb(220,224,230)` |
| 5 | Card hover → shadow-md + border-strong | **Met** | measured both light and dark |
| 5 | No scale transform on cards | **Met** | `translateY` only (`Card.module.css:49`) |
| 5 | Inputs 40px, 1px border, radius-sm | **Met** | measured `h=40 r=8px` |
| 5 | Input labels 13px/600 **`--ink-700`** | **Partial** | 13px/600 correct; colour is `--text-primary` (ink-900), not ink-700 |
| 5 | Empty states: mark + one sentence + one action | **Met** | `EmptyState.tsx`; genuinely well executed |
| 5 | Loading = skeletons matching final geometry | **Met** | `Skeleton.module.css` presets mirror card layout |
| 5 | Product fallback derived from SKU, never a grey camera | **Partial** | deterministic and handsome, but hue set violates §1/§2 |
| 6 | Content 1200 / wide 1440 / gutters 24-16 | **Met** | `Layout.module.css:5-31` |
| 6 | No horizontal overflow | **Met** | `scrollW === clientW` at 390/768/1440/1920 and at 200% zoom (640 CSS px) |
| 7 | Keyboard reachable everything | **Met** | 36 stops, no unreachable controls found |
| 7 | Visible focus | **Partial** | present on all 36 stops; ineffective on filled buttons (B2) |
| 7 | reduced-motion honored | **Missing** | see B5 |
| 7 | Icon-only buttons carry aria-label | **Met** | verified on the icon row |
| 7 | Real `<label for>` | **Met** | `Field.tsx` wires `htmlFor`/`id` |
| 7 | Colour never the sole signal | **Met** | `Badge` dot + text (`Badge.module.css:128`); stock state pairs both |
| 7 | Touch targets ≥40×40 | **Partial** | buttons/fields at 40; `sm` buttons 32px, `.link` 17px, checkbox box 18px |
| — | Three theme paths all work | **Partial** | all three resolve correctly in CSS; `data-theme` is never set by any code, and Mantine's scheme does not drive it |
| — | Modal/Drawer focus trap, Escape, focus restore | **Met** | 14/14 tab stops stayed inside both panels; Escape closed both; focus returned to the exact trigger button |

---

## What is genuinely good

Not padding — these are the things I would defend in a review.

1. **The fluid type scale is exact.** Measured at 390px and 1920px, every size, line-height ratio and
   tracking value matches the spec to three decimals, with negative tracking correctly applied at
   display sizes and correctly `normal` at body. Most teams ship a clamp() they never measured. This
   one was measured.

2. **Button loading width stability is real, and implemented the right way.** Measured
   `121.97px → 121.97px, delta 0`. `Button.module.css:251-278` keeps the label in flow at
   `opacity: 0` and absolutely centres the spinner — no ghost text, no reflow, no `min-width` hack.
   The comment at `:246-250` explains why. This is the correct solution.

3. **Modal and Drawer accessibility is fully correct.** Focus trapped (0 escapes in 14 sampled tab
   stops each), `role="dialog"` + `aria-modal="true"` + `aria-labelledby` wired to a real `<h2>`,
   Escape closes, and focus returns to the exact triggering button. Verified end to end.

4. **`ProductImage` is a genuinely good idea, well built.** Deterministic FNV-1a seeding means a
   catalogue does not reshuffle between server and client render; the mark layers a gradient, an
   off-centre light source, a weave and a vignette with angle/glow/weave derived from *different bit
   ranges* of the hash (`ProductImage.tsx:74-77`) so they do not move in lockstep; the SVG blur
   placeholder is generated from the same stops so the blur-up matches. It uses container queries so
   the mark scales with the tile, not the viewport. Fix the hue set and this is a feature, not a
   fallback.

5. **The token architecture is correct in a way that is easy to get wrong.** Light defined
   unconditionally on bare `:root`, dark redefining *only* the semantic layer, twice, for both the
   media-query and explicit-attribute paths. The comment at `globals.css:41-48` explaining why the
   font variables must live in plain `@theme` rather than `@theme inline`, and the one at
   `layout.tsx:62-66` explaining why they must sit on `<html>` — those are load-bearing insights
   someone had to debug and then wrote down. All three theme paths resolve correctly at the CSS
   level; the only failure is that nothing sets the attribute.

6. **Motion discipline.** The full-page easing histogram contains exactly two curves —
   `cubic-bezier(0.16,1,0.3,1)` and the spring `cubic-bezier(0.34,1.56,0.64,1)`, the latter used only
   on checkbox tick and switch thumb, which is precisely the right place for it. Durations are
   120ms micro / 220ms standard, applied consistently. This is more restraint than most systems
   manage.

7. **The Spinner's reduced-motion handling is thoughtful.** `Spinner.module.css:39-51` keeps a slow
   2.4s rotation and drops the dash animation rather than freezing — the comment ("a spinner that
   cannot spin is not a spinner") is the right call, and it correctly out-specifies the global
   `*` override. Someone thought about it rather than applying the blanket rule.

8. **Copy and voice are on-brand throughout.** "Live in five minutes", "Pull stock levels from
   ShipStation", "Orders land here the moment a customer checks out" — concrete, no exclamation
   marks, no "empowering your journey". §1's voice guidance is being followed by the components
   themselves, which almost never happens.
