# RebelShops Design System — Source of Truth

> Every agent working on this codebase MUST read this file before writing UI code.
> Deviating from these tokens is a defect, not a style choice.

## 1. Brand

**Name:** RebelShops · **Domain:** rebelshops.com · **Product:** the storefront layer that sits on
top of a seller's existing ShipStation account. They already have the inventory, the warehouse and
the shipping workflow. We give them the shop — in minutes, for $1.

**Positioning line:** _Your ShipStation inventory. A storefront that sells it. Live in five minutes._

**Voice:** Confident, concrete, allergic to fluff. We talk about margins, fees and shipping labels,
not "empowering your journey." Short sentences. Real numbers. Never exclamation marks in body copy.

**Anti-goals:** Do not look like a generic purple/blue SaaS template. No stock-photo hero. No
"AI-powered" badges. No pastel gradient soup. No emoji as UI iconography.

## 2. Color

**Revised 2026-08-12.** The palette is **near-monochrome plus one signal**: a white ground, a
near-black ink for type and primary action, and a single green reserved for money, stock and
success. The previous warm-ink/paper/vermilion scheme was rejected by the owner ("I hate the
existing color scheme"), and separately it shipped a measured AA failure on every primary button.
Both problems are answered by the same decision: **the accent is the ink**.

### The palette

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | Page ground. Pure white, not an off-white. |
| `--surface-2` | `#F4F4F5` | Subtle fill: wells, table headers, inset areas. A *fill*, never a section band. |
| `--border` | `#E5E5E7` | Hairlines and card borders |
| `--border-strong` | `#D2D3D6` | Emphasised edges, dashed placeholders |
| `--text` | `#111214` | Primary text **and** the primary button fill |
| `--text-muted` | `#6B6F76` | Secondary text |
| `--text-subtle` | `#8A8E96` | Meta and captions only, never body copy |
| `--signal` | `#0F7B4A` | Money, in-stock, savings, success. **Nothing else.** |
| `--signal-soft` | `#E8F5EE` | Signal wash |
| `--signal-on-dark` | `#3FBF83` | The same role on the one inverted section |
| `--warning` | `#B45309` | Low stock |
| `--danger` | `#B42318` | Errors, out of stock |

The neutral ramp (`--ink-950` … `--ink-50`) resolves to those values: `--ink-900` *is* `--text`,
`--ink-500` *is* `--text-muted`, `--ink-100` *is* `--border`, `--ink-50` *is* `--surface-2`.
Components should read the semantic names.

`--azure-*` still exists for informational product states and is desaturated to `#2F5D8C`. It never
appears on the marketing site.

### Buttons

- **Primary:** solid `#111214` fill, white label — **18.74:1**. Hover *lightens* to `#2A2C30`
  (13.99:1), so hover stays far above AAA.
- **Secondary:** white fill, `#E5E5E7` border, `#111214` text.
- **Focus ring:** `0 0 0 2px #FFFFFF, 0 0 0 4px #111214`.

### The signal is the palette's discipline

`--signal` appears on prices, savings, in-stock/quantity states and success rows, and nowhere else.
It is not for headings, icons, eyebrows, decorative flourishes, or for tinting "our" column of a
comparison table — a green column-wash reads as *"our side is the good side"*, which is exactly the
tell that makes a comparison look rigged. **Count the usages before shipping.** The homepage
currently renders 11, all of them money, stock or sync success.

### Ember is decommissioned

The vermilion ramp is gone. `--ember-*` survives *only* as a shim at the bottom of `globals.css`
whose every step resolves to the neutral ramp, so that unmigrated code renders monochrome instead of
orange. It is not part of the palette, it must not be used in new code, and the block should be
deleted once nothing outside it references `--ember-*`. Because the shim makes stale references
render *correctly-ish*, grep alone will no longer tell you what is migrated —
`src/components/marketing/__tests__/palette.test.ts` is the check that will.

### Contrast rules (non-negotiable)

Every pair below is measured, not estimated.

| Pair | Ratio | Verdict |
|---|---|---|
| `--text` on `--bg` | 18.74 | PASS |
| white on the primary button | **18.74** | PASS |
| white on button hover `#2A2C30` | 13.99 | PASS |
| `--text-muted` on `--bg` | 5.05 | PASS |
| `--text-muted` on `--surface-2` | 4.59 | PASS |
| `--text-subtle` on `--bg` | 3.29 | **Large text / non-text UI only** |
| `--signal` on `--bg` | 5.31 | PASS |
| `--signal` on `--surface-2` | 4.83 | PASS |
| white on `--signal` | 5.31 | PASS |
| `--warning` on `--bg` | 5.02 | PASS |
| `--danger` on `--bg` | 6.57 | PASS |
| `--signal-on-dark` on `#111214` | 8.02 | PASS |

- Body text uses `--text`. Secondary prose uses `--text-muted`. **Never `--text-subtle` for anything
  a user must read** — at 3.29:1 it clears AA only for large text (3:1) and non-text UI, so it is
  restricted to meta and captions that repeat information available elsewhere.
- **The lesson that produced this palette, restated for the new colours.** The previous document
  claimed white on an `--ember-500` fill was acceptable at ≥16px semibold. That was wrong, and it
  shipped a real defect: white on `#F94E1B` measures **3.42:1**, failing AA for normal text and
  clearing the large-text bar only at ≥24px or ≥18.66px bold. Primary buttons are 16px semibold, so
  every primary button in the product failed. The fix at the time was to move solid fills to
  `--ember-600` (4.51:1) — one rounding error from failing. **A palette whose primary action needs
  that much care to stay legal is the wrong palette.** An ink fill has 18.74:1 of headroom, so the
  entire class of bug is gone by construction rather than by tuning. Prefer contrast headroom over
  contrast compliance.
- **A focus ring must contrast with the ELEMENT, not only with the page.** An ink ring around an ink
  button measures 1.00:1 and is invisible. Use the two-layer construction
  `0 0 0 2px var(--focus-ring-gap), 0 0 0 4px <ring>`, where `<ring>` is `--text` on neutral
  surfaces and switches to `--focus-ring-on-accent` (white, 18.74:1) on ink-filled controls.
- **A colour cannot be its own contrast plan on a dark ground.** `--signal` measures 1.9:1 on
  `#111214`, so the inverted section switches it to `--signal-on-dark`. Likewise a raised surface on
  ink needs its own token: when the card fill, the body copy and the button were all `#111214`, the
  cards measured 1.05:1 against their ground and were effectively invisible. Dark surfaces use
  `#202327` with a deliberately strong `#383B41` hairline, because there is no shadow on a dark
  ground to help an edge read.
- Control boundaries use `--border-control` (`#8A8E96`, 3.29:1), which clears WCAG 1.4.11.
  Decorative hairlines use `--border` (1.26:1) and must be paired with layout, never left to carry a
  boundary alone.

### One ground

The marketing site is `--bg` from the header to the footer. Sections are separated by **whitespace,
a 1px `--border` rule and type hierarchy — never by alternating background colour.** There is
exactly one permitted exception: the pricing section is a single full-bleed `#111214` block, because
one deliberate inversion at the decision point reads as emphasis. The footer uses the same
`#111214`. Adding a second dark section re-creates the banding this replaced — the rejected build
had four grounds and eleven flips across twelve sections.

## 3. Typography

Loaded via `next/font/google`, exposed as CSS variables on `<html>`.

| Role | Family | Variable | Notes |
|---|---|---|---|
| Display | **Space Grotesk** | `--font-display` | Headings, numerals, logo wordmark. 500/700. |
| UI + body | **Inter** | `--font-sans` | Everything else. Variable weight. `font-feature-settings: "cv05","ss03"`. |
| Mono | **JetBrains Mono** | `--font-mono` | SKUs, order IDs, code, API keys. |

### Type scale (fluid, `clamp()`)

| Token | Size | Line height | Tracking | Use |
|---|---|---|---|---|
| `--text-display` | `clamp(2.75rem, 6vw, 4.5rem)` | 1.02 | `-0.03em` | Hero only |
| `--text-h1` | `clamp(2.25rem, 4vw, 3.25rem)` | 1.08 | `-0.025em` | Page title |
| `--text-h2` | `clamp(1.75rem, 2.6vw, 2.25rem)` | 1.15 | `-0.02em` | Section |
| `--text-h3` | `1.375rem` | 1.25 | `-0.015em` | Subsection / card title |
| `--text-lg` | `1.125rem` | 1.6 | `-0.005em` | Lead paragraph |
| `--text-base` | `1rem` | 1.6 | `0` | Body |
| `--text-sm` | `0.875rem` | 1.5 | `0` | Secondary, table body |
| `--text-xs` | `0.75rem` | 1.4 | `0.01em` | Meta, captions |
| `--text-eyebrow` | `0.75rem` | 1 | `0.14em` | UPPERCASE section labels, 600 weight |

Prices always render in `--font-display` with `font-variant-numeric: tabular-nums`.

## 4. Space, radius, elevation, motion

**Space** — 4px base: `4 8 12 16 20 24 32 40 48 64 80 96 128`. Section vertical rhythm on marketing
is `clamp(5rem, 10vw, 8rem)`. App shell padding is `24px`, `16px` under 768px.

**Radius** — `--radius-xs 6px`, `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`,
`--radius-xl 24px`, `--radius-full 999px`. Buttons and inputs use `--radius-sm`. Cards use
`--radius-lg`. Never mix more than two radii in one composition.

**Elevation** — shadows are warm-tinted and layered, never a single flat blur:
```
--shadow-xs: 0 1px 2px rgba(16,18,22,.06);
--shadow-sm: 0 1px 2px rgba(16,18,22,.06), 0 2px 6px rgba(16,18,22,.05);
--shadow-md: 0 2px 4px rgba(16,18,22,.05), 0 8px 20px -4px rgba(16,18,22,.10);
--shadow-lg: 0 4px 8px rgba(16,18,22,.04), 0 20px 44px -8px rgba(16,18,22,.14);
--shadow-ember: 0 2px 6px rgba(249,78,27,.24), 0 10px 28px -6px rgba(249,78,27,.32);
```
On dark grounds use rings (`inset 0 1px 0 rgba(255,255,255,.06)`) instead of shadows.

**Motion** — `--ease-out: cubic-bezier(.16,1,.3,1)`, `--ease-in-out: cubic-bezier(.65,0,.35,1)`.
Durations: `120ms` micro (hover/press), `220ms` standard (panels, cards), `420ms` entrance.
Everything must be wrapped so `prefers-reduced-motion: reduce` collapses it to opacity-only.

## 5. Component rules

- **Buttons** — heights `32 / 40 / 48`. Primary = ember fill, white text, `--shadow-ember`, translateY(-1px) on hover,
  translateY(0) + reduced shadow on `:active`. Secondary = paper fill + `--ink-200` border. Ghost = transparent.
  Destructive = rose. Never two primary buttons in one view.
- **Cards** — `--paper-raised`, 1px `--ink-200` border, `--radius-lg`, `--shadow-sm`. Hover on interactive
  cards: `--shadow-md` + border → `--ink-300`. No scale transforms on cards larger than 320px.
- **Inputs** — 40px, 1px `--ink-200`, `--radius-sm`, focus ring per §2. Labels above, 13px/600, `--ink-700`.
- **Empty states** — always: an illustrative mark, one sentence of what goes here, one primary action.
  Never a bare "No data".
- **Loading** — skeletons matching final layout geometry. No centered spinners on full pages.
- **Product image fallback** — a deterministic generated mark derived from the SKU (see
  `src/components/ui/ProductImage`), never a grey camera icon.

## 6. Layout

Content max width `1200px`; wide marketing sections may bleed to `1440px`. Gutters `24px` desktop,
`16px` mobile. Product grids: `repeat(auto-fill, minmax(260px, 1fr))`, gap `24px`.

## 7. Accessibility floor

Keyboard reachable everything · visible focus · `prefers-reduced-motion` honored · all icon-only
buttons carry `aria-label` · forms use real `<label for>` · color is never the sole signal (stock
state pairs a dot with text) · target size ≥ 40×40 on touch.
