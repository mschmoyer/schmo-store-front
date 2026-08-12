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

The palette is warm ink + paper + a vermilion signal. It is deliberately *not* the blue/violet
default of the category. Money-green is reserved for value and success, never for chrome.

### Neutrals — "Ink" (warm-cooled charcoal, slight blue undertone)

| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#08090B` | Marketing page ground, deepest surface |
| `--ink-900` | `#0E1014` | Dark section ground |
| `--ink-800` | `#171A20` | Dark card surface |
| `--ink-700` | `#22262F` | Dark border / raised surface |
| `--ink-600` | `#333944` | Dark hairline, disabled dark |
| `--ink-500` | `#5A626F` | Muted text on light |
| `--ink-400` | `#858D9A` | Placeholder, tertiary text |
| `--ink-300` | `#B4BAC4` | Disabled text on light |
| `--ink-200` | `#DCE0E6` | Border on light |
| `--ink-100` | `#ECEEF2` | Subtle fill on light |
| `--ink-50`  | `#F5F6F8` | App background wash |

### Paper — warm off-white, the light-mode ground

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FBFAF8` | Light page ground (warm, never pure white) |
| `--paper-raised` | `#FFFFFF` | Cards, popovers, inputs |
| `--paper-sunken` | `#F2F1ED` | Wells, table headers, inset areas |

### Ember — primary action / brand signal (vermilion)

| Token | Hex |
|---|---|
| `--ember-50` | `#FFF3EE` |
| `--ember-100` | `#FFE1D5` |
| `--ember-200` | `#FFC0A8` |
| `--ember-300` | `#FF9871` |
| `--ember-400` | `#FF6F3D` |
| `--ember-500` | `#F94E1B` | ← primary |
| `--ember-600` | `#DC3A0C` |
| `--ember-700` | `#B32D09` |
| `--ember-800` | `#8A230A` |
| `--ember-900` | `#5E1907` |

### Support

| Token | Hex | Use |
|---|---|---|
| `--mint-500` | `#0FA871` | Money, in-stock, success, savings |
| `--mint-50` | `#E8F8F1` | Success wash |
| `--amber-500` | `#D98A00` | Warning, low stock |
| `--amber-50` | `#FEF6E6` | Warning wash |
| `--rose-500` | `#D92D20` | Destructive, out of stock, error |
| `--rose-50` | `#FEECEB` | Error wash |
| `--azure-500` | `#2563EB` | Informational only. Never a CTA. |

### Contrast rules (non-negotiable)

- Body text on `--paper` uses `--ink-900`. Secondary text uses `--ink-500` (7.0:1). Never `--ink-400`
  for anything a user must read.
- **Corrected 2026-08-12.** An earlier version of this document claimed white text on an
  `--ember-500` fill was acceptable at ≥16px semibold. That was wrong and it shipped a real defect:
  white on `#F94E1B` measures **3.42:1**, which fails AA for normal text (4.5:1) and only clears the
  large-text bar (3:1) at ≥24px, or ≥18.66px bold. Primary buttons are 16px semibold, so every
  primary button in the product failed. Measured ratios of white on each shade:
  `400` 2.77 · `500` 3.42 · `600` **4.51** · `700` 6.37 · `800` 9.03.
- **Therefore:** `--ember-600` (`#DC3A0C`) is the *solid-fill* token wherever white text sits on it —
  primary buttons, filled badges, any ember surface carrying a label. Hover goes to `--ember-700`
  (6.37:1), which also makes hover a contrast *increase* rather than a decrease. `--ember-500`
  remains the brand identity color for logo, illustration, focus rings, borders, thin rules and
  large display type ≥24px, where it is legal and looks better.
- Ember *text* on a light background must be `--ember-700` or darker.
- Every interactive element has a visible `:focus-visible` ring. The ring must contrast against the
  element it surrounds, not just against the page: an ember ring around an ember button measures
  1.00:1 and is invisible. Use the two-layer construction `0 0 0 2px var(--surface), 0 0 0 4px <ring>`
  where `<ring>` is `--ember-500` on neutral surfaces and `--ink-900` on ember-filled controls.

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
