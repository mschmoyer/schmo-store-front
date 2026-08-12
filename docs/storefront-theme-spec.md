# Storefront Theme Contract

> Binding contract between the **theme engine / customizer** (which produces themes) and the
> **storefront renderer** (which consumes them). Neither side may change this file unilaterally.
>
> This is a *different layer* from `docs/design-system.md`. That document governs RebelShops' own
> chrome — the marketing site, the admin, the customizer UI. This document governs what a **merchant**
> controls about **their** shop. Storefront tokens are namespaced `--st-*` and never leak into admin
> chrome; admin tokens never leak into a rendered storefront.

## 1. Why this exists

Today "theming" is 11 hardcoded color palettes in `src/lib/themes.ts`, applied by a client
`useEffect` with a `setTimeout(100)` race and `!important` overrides in an SSR `<style>` tag. A
merchant can pick "ocean" or "sunset" and nothing else. That is not a competitor to Shopify's theme
editor; it is a color swatch.

The target: a merchant can make their shop look genuinely *theirs* — layout, type, color, density,
section order and content — see it change live, and publish it. Server-rendered, zero flash.

## 2. The `StorefrontTheme` object

Canonical TypeScript type lives at `src/lib/storefront-theme/types.ts`. Persisted as JSONB. Every
field is optional on the wire; the engine deep-merges over a preset, which merges over defaults, so a
partial object is always valid.

```ts
interface StorefrontTheme {
  version: 1;
  preset: string;            // id of the preset this was forked from
  brand: {
    color: string;           // merchant's primary/accent hex
    colorOnBrand?: string;   // auto-derived for contrast if omitted
    surface: string;         // page ground
    surfaceRaised: string;   // card ground
    text: string;
    textMuted: string;
    border: string;
    success: string; warning: string; danger: string;
    scheme: 'light' | 'dark';   // drives derived shadows/overlays
  };
  typography: {
    headingFont: FontId;     // from the curated font list, §5
    bodyFont: FontId;
    scale: 'compact' | 'default' | 'spacious';   // multiplies the type ramp
    headingWeight: 500 | 600 | 700 | 800;
    headingCase: 'none' | 'uppercase';
    headingTracking: number; // em, -0.04..0.04
  };
  shape: {
    radius: 'square' | 'soft' | 'rounded' | 'pill';   // 0 / 8 / 16 / 999 on cards+buttons
    borderWidth: 0 | 1 | 2;
    shadow: 'none' | 'subtle' | 'lifted';
    density: 'compact' | 'default' | 'roomy';         // spacing multiplier 0.85 / 1 / 1.2
  };
  buttons: {
    style: 'solid' | 'outline' | 'soft';
    uppercase: boolean;
  };
  productCard: {
    imageRatio: 'square' | 'portrait' | 'landscape';
    imageFit: 'cover' | 'contain';
    align: 'left' | 'center';
    showVendor: boolean;
    showQuickAdd: boolean;
    hoverEffect: 'none' | 'lift' | 'zoom' | 'swap';   // 'swap' = second image on hover
  };
  header: {
    layout: 'logo-left' | 'logo-center' | 'logo-left-nav-below';
    sticky: boolean;
    announcement?: { text: string; href?: string; enabled: boolean };
  };
  footer: { layout: 'columns' | 'minimal'; showNewsletter: boolean; };
  custom?: { css?: string };   // sanitized, see §7
}
```

## 3. Emitted CSS custom properties

The engine's single job at render time is to turn a `StorefrontTheme` into a CSS custom property
block. **The renderer must read only these variables** — never import `themes.ts`, never inline a hex.

```
--st-brand, --st-brand-hover, --st-brand-active, --st-on-brand
--st-surface, --st-surface-raised, --st-surface-sunken, --st-overlay
--st-text, --st-text-muted, --st-text-on-brand
--st-border, --st-border-strong
--st-success, --st-warning, --st-danger
--st-font-heading, --st-font-body
--st-h1 … --st-h6, --st-body, --st-small        (computed from scale)
--st-heading-weight, --st-heading-case, --st-heading-tracking
--st-radius-card, --st-radius-button, --st-radius-input, --st-radius-image
--st-border-width
--st-shadow-card, --st-shadow-card-hover, --st-shadow-popover
--st-space-1 … --st-space-12                    (density-multiplied)
--st-ratio-product                              (aspect-ratio value)
--st-container                                  (max content width)
```

Derived values (`--st-brand-hover`, `--st-on-brand`, shadow tints) are **computed in the engine**
from the merchant's inputs, in `oklch` where practical, so that any brand color the merchant picks
still produces an accessible, good-looking result. A merchant choosing a pale yellow brand color must
still get readable button text — the engine flips `--st-on-brand` to ink automatically. This
auto-contrast rule is the single most important thing the engine does; it is what keeps merchant
stores from looking broken.

## 4. Rendering rules (renderer side)

- Theme resolution happens **server-side** in the store layout. The `<style>` block ships with the
  first byte. No `useEffect`, no `setTimeout`, no `!important`, no flash of unstyled theme.
- Scope the variables to a wrapper element (`.storefront[data-store-id]`), **not** `:root`, so a
  storefront rendered inside the customizer's preview iframe cannot bleed into admin chrome.
- Every storefront component consumes `--st-*` only. A hardcoded color in
  `src/components/store/**` or `src/app/store/**` is a defect.
- `prefers-reduced-motion` and the accessibility floor in `docs/design-system.md` §7 apply here too;
  a merchant cannot opt out of accessibility.

## 5. Curated fonts

Merchants pick from a curated list, not arbitrary font names — arbitrary names mean broken renders and
uncontrolled layout shift. Loaded via `next/font/google`, subset, `display: 'swap'`, declared statically
so Next can optimize them. Ship a list of roughly a dozen covering the real design registers:

`inter` · `space-grotesk` · `general-sans`-equivalent · `dm-sans` · `plus-jakarta` · `outfit`
(geometric/neutral sans) — `playfair-display` · `fraunces` · `instrument-serif` · `lora`
(serif/editorial) — `bricolage-grotesque` · `archivo` (display/impact) — `jetbrains-mono` (mono).

Each entry carries `{ id, label, family, cssVar, category, previewText }` so the customizer can show a
real preview.

## 6. Presets

Presets are complete `StorefrontTheme` objects with a name, description and thumbnail — real,
differentiated *looks*, not hue rotations of one design. Minimum six, each internally coherent:

| Preset | Register |
|---|---|
| **Studio** | Warm minimal, serif headings, generous whitespace, contain-fit imagery. Craft/homeware. |
| **Voltage** | Dark ground, high-contrast, tight geometric sans, square corners. Electronics/streetwear. |
| **Bloom** | Soft, rounded, pastel-capable, portrait imagery, centered cards. Beauty/wellness. |
| **Depot** | Dense, utilitarian, compact rows, landscape imagery, no-nonsense. Parts/industrial/B2B. |
| **Marquee** | Editorial: oversized display type, uppercase tracking, minimal chrome. Apparel. |
| **Fresh** | Bright, friendly, roomy, mint-forward. Food/supplements. |

A preset is a starting point — every field stays editable afterwards.

## 7. Custom CSS safety

`custom.css` is merchant-supplied and therefore hostile input. It must be sanitized server-side before
it is ever emitted: strip `@import`, `url(` with anything but same-origin/`data:image`, `expression(`,
`behavior:`, `javascript:`, and anything containing `</style`. Emit it scoped inside the storefront
wrapper. Cap the length. Never render it with `dangerouslySetInnerHTML` without passing it through the
sanitizer first — this is an XSS boundary and will be reviewed as one.

## 8. Sections (storefront home page composition)

The store home page is an ordered list of **sections**, persisted alongside the theme. This is the
feature that makes the customizer feel like Shopify rather than a settings form.

```ts
type SectionType =
  | 'hero' | 'featured-collection' | 'collection-grid' | 'rich-text'
  | 'image-with-text' | 'value-props' | 'testimonials' | 'faq'
  | 'newsletter' | 'blog-posts' | 'logo-bar' | 'countdown';

interface Section { id: string; type: SectionType; enabled: boolean; settings: Record<string, unknown>; }
```

Each type declares a **settings schema** (field id, label, control type, default, help text) so the
customizer renders its editing UI generically from the schema — adding a new section type must not
require writing new customizer UI. Renderer resolves `type → component` through one registry map.
Unknown/erroring section types render nothing in production and a visible "this section failed" card
in the customizer preview; one bad section must never blank a merchant's storefront.

## 9. Persistence & API

- Migration `019_storefront_themes.sql` (owned by the theme-engine track — no other track may claim 019).
- Table `storefront_themes`: `store_id`, `theme` JSONB, `sections` JSONB, `status` (`draft` | `published`),
  `version`, timestamps. Draft and published rows coexist so a merchant can edit without breaking their
  live shop, then publish.
- `GET/PUT /api/admin/storefront-theme` (draft, authenticated) · `POST .../publish` · `POST .../reset`.
- Public read is server-side only, inside the store layout — never a client fetch, never an
  unauthenticated endpoint that exposes drafts.
- Legacy `stores.theme_name` values (`default`, `ocean`, `sunset`, `purple`, `dark`, `rose`, `teal`,
  `amber`, `slate`, `crimson`) must map onto the new model so existing stores keep working. Migrate them.

## 10. Preview protocol (customizer ↔ iframe)

The customizer renders the real storefront in an iframe at `/store/{slug}?preview=<token>` and pushes
draft changes over `postMessage` for instant repaint — never a full reload per keystroke.

- Parent → iframe: `{ source: 'rebelshops-customizer', type: 'theme:update', payload: StorefrontTheme }`
  and `{ type: 'sections:update', payload: Section[] }`. The iframe applies theme updates by rewriting
  the custom-property block only — a repaint, not a re-render, so it is instant.
- Iframe → parent: `{ type: 'ready' }`, `{ type: 'section:click', id }` (click a section in the preview
  to select it in the panel — this is the interaction that makes the tool feel alive).
- **Validate `event.origin` on both sides.** Preview tokens are short-lived, signed, and scoped to one
  store. Drafts must never be viewable without one.
- Viewport switcher: desktop / tablet / mobile resizes the iframe, it does not fake it with a CSS transform.
