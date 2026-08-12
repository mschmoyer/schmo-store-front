# Storefront Theme Engine

Implements `docs/storefront-theme-spec.md` — the binding contract between the
theme engine, the storefront renderer and the customizer UI.

This directory is the **engine and data layer**. It contains no React
components. Two other tracks consume it:

- **the renderer** (`src/app/store/**`, `src/components/store/**`) — resolves the
  published theme server-side and emits its CSS custom properties;
- **the customizer** (`src/app/admin/design/**`) — edits the draft through the
  API routes and drives the preview iframe.

Everything below is the API those two tracks code against.

---

## Import paths

```ts
import { … } from '@/lib/storefront-theme';          // types, color, presets, fonts,
                                                     // resolve, sanitize, sections, preview
import { … } from '@/lib/storefront-theme/db';       // server-only: touches Postgres
import { … } from '@/lib/storefront-theme/fonts.next'; // server-only: next/font macro
```

Two modules are **deliberately excluded from the barrel**:

| Module | Why | Who imports it |
|---|---|---|
| `db.ts` | pulls `pg` in; would poison a client bundle | store layout, API routes |
| `fonts.next.ts` | `next/font/google` is a build-time macro | store layout only |

---

## Quick start

### Renderer — store layout

```tsx
import { getPublishedTheme, getDraftTheme } from '@/lib/storefront-theme/db';
import { isPreviewAuthorized } from '@/lib/storefront-theme';
import { themeToStyleSheet, storefrontScope } from '@/lib/storefront-theme';
import { storefrontFontVariables } from '@/lib/storefront-theme/fonts.next';

const preview = await isPreviewAuthorized(store.id, searchParams.preview);
const record = preview
  ? await getDraftTheme(store.id)
  : await getPublishedTheme(store.id);

const scope = storefrontScope(store.id);
const { css } = themeToStyleSheet(record?.theme ?? {}, scope);

return (
  <div className={`storefront ${storefrontFontVariables}`} data-store-id={store.id}>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    {/* sections: record?.sections ?? defaultSections() */}
  </div>
);
```

`themeToStyleSheet` already ran the merchant's custom CSS through the sanitizer.
Never pass `theme.custom.css` to `dangerouslySetInnerHTML` yourself.

### Customizer — repainting the preview iframe

`themeToCss` is pure and safe to call in the browser. On a `theme:update`
message, recompute the token block and swap the text of a single `<style>`
element — a repaint, not a re-render.

```ts
styleEl.textContent = themeToCss(resolveTheme(patch), scope);
```

---

## `types.ts`

```ts
type FontId = 'inter' | 'space-grotesk' | 'manrope' | 'dm-sans' | 'plus-jakarta'
            | 'outfit' | 'playfair-display' | 'fraunces' | 'instrument-serif'
            | 'lora' | 'bricolage-grotesque' | 'archivo' | 'jetbrains-mono';

type SectionType = 'hero' | 'featured-collection' | 'collection-grid' | 'rich-text'
                 | 'image-with-text' | 'value-props' | 'testimonials' | 'faq'
                 | 'newsletter' | 'blog-posts' | 'logo-bar' | 'countdown';

interface StorefrontTheme { version: 1; preset: string; brand; typography; shape;
                            buttons; productCard; header; footer; custom? }
type StorefrontThemeInput = DeepPartial<StorefrontTheme>;   // the wire shape
type ResolvedTheme        = StorefrontTheme                  // + colorOnBrand, announcement,
                                                             //   custom guaranteed present
interface Section { id: string; type: SectionType; enabled: boolean;
                    settings: Record<string, unknown> }
interface SettingField { id; label; type: SettingFieldType; default: unknown;
                         help?; options?; min?; max?; step? }
interface SectionDefinition { type; label; icon; description; defaultSettings;
                              maxPerPage; settingsSchema }
interface PresetDefinition  { id; name; description; register; thumbnail; theme;
                              sections: Section[] }
interface PresetThumbnail   { background; surface; brand; onBrand; text; textMuted;
                              border; radiusPx; headingFont; bodyFont; headingCase;
                              buttonStyle; imageRatio; headerLayout }
```

Value exports:

| Symbol | Type |
|---|---|
| `FONT_IDS` | `readonly FontId[]` |
| `SECTION_TYPES` | `readonly SectionType[]` |
| `SETTING_FIELD_TYPES` | `readonly SettingFieldType[]` |
| `MAX_CUSTOM_CSS_LENGTH` | `20_000` |
| `MAX_SECTIONS_PER_PAGE` | `40` |

Zod schemas (every field optional, unknown keys rejected):

| Symbol | Validates |
|---|---|
| `hexColorSchema` | `#abc` / `#aabbcc` / `#aabbccdd` |
| `fontIdSchema`, `sectionTypeSchema` | enum membership |
| `themeBrandInputSchema`, `themeTypographyInputSchema`, `themeShapeInputSchema`, `themeButtonsInputSchema`, `themeProductCardInputSchema`, `themeHeaderInputSchema`, `themeAnnouncementInputSchema`, `themeFooterInputSchema`, `themeCustomInputSchema` | one theme sub-object each |
| `storefrontThemeInputSchema` | a whole theme patch |
| `sectionSchema`, `sectionsSchema` | one section / an ordered list (unique ids, capped length) |
| `saveDraftBodySchema` | the `PUT` body: `{ theme?, sections? }`, at least one present |

---

## `color.ts`

Pure functions. No I/O, no clock, no randomness.

```ts
interface Rgb   { r: number; g: number; b: number }
interface Oklch { l: number; c: number; h: number }

const CONTRAST_TEXT: 4.5;   // WCAG AA body text
const CONTRAST_UI:   3;     // WCAG AA non-text UI

clamp(value: number, min: number, max: number): number
parseHex(hex: string): Rgb | null
isHexColor(hex: string): boolean
toHex(rgb: Rgb): string
relativeLuminance(rgb: Rgb): number
contrastRatio(a: string, b: string): number
hexToOklch(hex: string, fallback?: Oklch): Oklch
oklchToHex(oklch: Oklch): string                 // gamut-maps by reducing chroma
withOklch(hex: string, transform: (o: Oklch) => Oklch): string
adjustLightness(hex: string, delta: number): string
adjustChroma(hex: string, factor: number): string
mix(a: string, b: string, amount: number): string     // in OKLab
isDark(hex: string): boolean
worstContrast(fg: string, backgrounds: readonly string[]): number
ensureContrast(fg: string, backgrounds: readonly string[], target?: number): string
pickOnColor(backgrounds: readonly string[], darkInk: string, lightInk: string,
            target?: number): string
deriveBrandStates(brand: string, surface: string, ink?: string, target?: number):
  { hover: string; active: string }
deriveStrongBorder(border: string, surface: string, text: string): string
deriveShadowTint(surface: string): Rgb
rgba(rgb: Rgb, alpha: number): string
```

### How auto-contrast works

1. **Ink candidates come from the merchant's own palette,** not from a hardcoded
   black/white pair: a dark candidate derived from `brand.text` (lightness capped
   at 0.20, chroma at 0.045) and a light candidate derived from
   `brand.surfaceRaised` (lightness floored at 0.975). The result still looks like
   their store.
2. **`pickOnColor` chooses against the resting brand color** and returns the
   first candidate clearing 4.5:1. If neither does, it walks the candidate along
   the OKLCh lightness axis (easing chroma out near the extremes so it does not
   become a neon smear), and falls back to pure black or white last.
   sRGB guarantees at least 4.58:1 from one of those two against *any* single
   background, so this always succeeds.
3. **Hover and active are then derived under that ink as a constraint.**
   `deriveBrandStates` picks a direction (darken on light grounds, lighten on
   dark ones, reversing above L 0.82 and below L 0.24 so states do not wash out
   or vanish), then tries decreasing magnitudes and finally the opposite
   direction, taking the first pair where the ink still clears 4.5:1 on both.
   Mid-tone brands — the lightness band where sRGB offers barely 4.58:1 — get a
   subtler hover rather than an illegible one.
4. **`text` and `textMuted` are lifted to 4.5:1** against the surface, so a
   merchant cannot ship grey-on-grey.
5. **`borderStrong` and the status colors are lifted to 3:1**, the WCAG floor for
   non-text UI.
6. **Shadows are tinted with a near-black that inherits the surface hue**
   (`deriveShadowTint`), so warm themes stay warm down into their elevation.

`auditContrast` (below) reports all of this, and the unit tests sweep the full
hue circle at every lightness to prove it holds.

---

## `defaults.ts`

```ts
const CUSTOM_PRESET_ID: 'custom';
const DEFAULT_PRESET_ID: 'studio';                       // what a new store gets
const BASE_THEME: StorefrontTheme;                       // treat as immutable
baseTheme(): StorefrontTheme                             // deep copy, safe to mutate

const DENSITY_MULTIPLIER: Record<Density, number>        // 0.85 / 1 / 1.2
const SCALE_MULTIPLIER:   Record<TypeScale, number>      // 0.9 / 1 / 1.12
const BASE_SPACE_RAMP:    readonly number[]              // 4…96 px, pre-density
const CONTAINER_WIDTH:    Record<Density, number>        // 1140 / 1200 / 1320
const RADIUS_PX:          Record<RadiusStyle, number>    // 0 / 8 / 16 / 999
const PRODUCT_RATIO:      Record<ImageRatio, string>     // '1 / 1' | '3 / 4' | '4 / 3'
```

---

## `presets.ts`

```ts
const PRESETS: Record<string, PresetDefinition>
const PRESET_IDS: readonly string[]        // display order
const PRESET_LIST: PresetDefinition[]
getPreset(id: string | undefined): PresetDefinition | undefined
presetSections(id: string | undefined): Section[]   // deep copy; falls back to
                                                    // defaultSections()

const LEGACY_THEME_MAP: Record<string, { preset: string; brandColor?: string;
                                         scheme?: 'light' | 'dark' }>
themeFromLegacyName(name: string | null | undefined):
  { preset: string; brand: { color?: string; scheme?: 'light' | 'dark' } }
```

| Preset | Heading / body | Scale | Radius | Border | Shadow | Density | Buttons | Product card | Header |
|---|---|---|---|---|---|---|---|---|---|
| **Studio** | Fraunces / Manrope | spacious | soft 8 | 1 | none | roomy | outline | square · contain · left · no hover | logo-left-nav-below |
| **Voltage** | Space Grotesk / Inter | compact | square 0 | 1 | none | compact | solid UPPER | square · cover · left · image swap | logo-left, sticky |
| **Bloom** | Outfit / DM Sans | default | rounded 16 | 0 | subtle | roomy | soft | portrait · cover · centered · lift | logo-center, sticky |
| **Depot** | Archivo / Inter | compact | square 0 | 1 | none | compact | solid UPPER | landscape · contain · left · no hover | logo-left-nav-below, sticky |
| **Marquee** | Bricolage / Archivo | spacious | square 0 | 0 | none | default | outline UPPER | portrait · cover · left · image swap | logo-center |
| **Fresh** | Plus Jakarta ×2 | default | pill 999 | 1 | lifted | roomy | solid | square · cover · centered · zoom | logo-left, sticky |

Voltage is the only dark-ground preset. `presets.test.ts` asserts that every one
of those axes actually varies across the set.

Each preset also carries its own **home page composition** in `sections`, because
a preset is a design and half of a design is what the page is made of. The six
differ in which section types they use, in what order, and in the copy those
sections carry — Depot opens on a category grid, Marquee on a full-bleed hero and
four oversized tiles, Studio on the maker's story. `presets.test.ts` fails if any
two presets ever share a composition, a type sequence, or a hero headline.

Use `presetSections(id)` rather than reading `.sections` directly: it hands back a
deep copy, so a store that persists a preset's page and then edits one section
cannot mutate the shipped preset for every other store in the process.

---

## `fonts.ts` (pure data)

```ts
type FontCategory = 'sans' | 'serif' | 'display' | 'mono';
interface FontDefinition { id: FontId; label: string; family: string;
                           cssVar: `--${string}`; category: FontCategory;
                           previewText: string; fallback: string; weights: string[] }

const FONTS: Record<FontId, FontDefinition>
const FONT_LIST: FontDefinition[]
const FONTS_BY_CATEGORY: Record<FontCategory, FontDefinition[]>
getFont(id: string | undefined): FontDefinition      // falls back to Inter
isFontId(id: unknown): id is FontId
fontStack(id: string | undefined): string            // 'var(--st-font-x), "X", …'
```

`manrope` stands in for the spec's "general-sans-equivalent": General Sans is not
on Google Fonts.

## `fonts.next.ts` (server-only)

```ts
const STOREFRONT_FONT_CLASSNAMES: Record<FontId, string>
const storefrontFontVariables: string      // all thirteen, space-joined
fontClassName(id: string): string
```

All thirteen families are instantiated statically at module scope, which is the
only form `next/font/google` compiles. Apply `storefrontFontVariables` to the
storefront wrapper; the engine's `--st-font-heading` / `--st-font-body` then
`var()` into whichever two the merchant picked, so switching fonts in the
customizer is a repaint, not a font download.

---

## `resolve.ts`

```ts
deepMerge<T>(base: T, patch: unknown): T          // drops __proto__/constructor/prototype
resolveTheme(input?: StorefrontThemeInput | null): ResolvedTheme
deriveTokens(theme: StorefrontTheme): DerivedColors
themeToCss(theme: ResolvedTheme | StorefrontThemeInput, scopeSelector: string): string
themeToStyleSheet(theme: ResolvedTheme | StorefrontThemeInput, scopeSelector: string):
  { css: string; custom: SanitizeResult }
storefrontScope(storeId: string): string          // '.storefront[data-store-id="…"]'
auditContrast(theme: ResolvedTheme | StorefrontThemeInput): ContrastAudit[]
fmt(value: number): string

interface DerivedColors { brand; brandHover; brandActive; onBrand; surface;
                          surfaceRaised; surfaceSunken; overlay; text; textMuted;
                          border; borderStrong; success; warning; danger;
                          shadowCard; shadowCardHover; shadowPopover }
interface ContrastAudit { pair: string; ratio: number; required: number; passes: boolean }
```

Resolution order is **defaults → preset (`input.preset`) → merchant overrides**.
An unknown preset id is ignored rather than thrown, because a theme row written
by an older build must never blank a live storefront.

`themeToCss` emits **exactly** the 51 custom properties in spec §3 — no more, no
less; `resolve.test.ts` asserts the set. It is scoped to the selector you pass,
never `:root`, and contains no `!important`. Output is byte-deterministic, so it
can be cached and diffed.

`themeToCss` does **not** include merchant custom CSS. Use `themeToStyleSheet`
for the full stylesheet.

Structural choices the renderer reads from the theme object rather than a
variable: `buttons.style`, `buttons.uppercase`, `productCard.imageFit`,
`productCard.align`, `productCard.hoverEffect`, `productCard.showVendor`,
`productCard.showQuickAdd`, `header.layout`, `header.sticky`,
`header.announcement`, `footer.layout`, `footer.showNewsletter`.

Two derived values are intentionally not one-to-one with the merchant's input:
a `pill` radius caps `--st-radius-card` at 24px and `--st-radius-image` at 20px
(a fully-round card is a lozenge), and `shadow: 'none'` still gives
`--st-shadow-popover` an elevation, because a floating menu with no shadow is a
usability bug rather than a style.

---

## `sanitize.ts`

```ts
const MAX_CUSTOM_CSS_RULES: 400;
const MAX_SELECTORS_PER_RULE: 20;
interface SanitizeResult { css: string; warnings: string[]; truncated: boolean }

sanitizeCustomCss(css: string | null | undefined, scopeSelectorText: string,
                  maxLength?: number): SanitizeResult
sanitizeCustomCssToString(css: string | null | undefined,
                          scopeSelectorText: string): string
```

This is an XSS boundary. In order: length cap → comment strip → CSS-escape decode
→ remove every `<` → parse with a string/paren-aware parser → drop everything not
allowed → prefix every selector with the scope.

- **At-rules**: only `@media`, `@supports`, `@container`, `@layer` and
  `@keyframes` (plus vendor keyframes) survive. `@import`, `@charset`,
  `@namespace` and `@font-face` are dropped.
- **`url()`**: same-origin paths and `data:image/{png,jpeg,gif,webp,avif}` only.
  Remote, protocol-relative, `data:image/svg+xml` and `data:text/html` are
  rejected, and the whole declaration goes with them.
- **Script vectors**: `expression(`, `behavior`, `-moz-binding`, `javascript:`,
  `vbscript:` and friends, matched after escape-decoding and whitespace
  collapsing so `ex/*x*/pression(` and `\65 xpression(` are caught too.
- **`html` / `body` / `:root`** are *replaced* by the scope; every other selector
  is prefixed with it.
- **`!important` is stripped** from merchant CSS. The scope prefix already
  outranks storefront component styles, so it is unnecessary, and it lets a
  merchant lock themselves out of their own checkout.
- The output **never contains a `<` character**, which is what makes
  `</style><script>` structurally impossible rather than merely unlikely.

`sanitize.test.ts` is written as an attack suite; add to it before changing
anything here.

---

## `sections.ts`

```ts
const SECTION_REGISTRY: Record<SectionType, SectionDefinition>
const SECTION_LIST: SectionDefinition[]              // "add section" menu order
getSectionDefinition(type: string): SectionDefinition | undefined
isSectionType(type: unknown): type is SectionType
createSection(type: SectionType, suffix: string,
              overrides?: Record<string, unknown>): Section
defaultSections(): Section[]
normalizeSections(sections: unknown): { sections: Section[]; problems: string[] }
```

Each definition carries `label`, `icon` (a `@tabler/icons-react` export *name* —
the registry stays React-free), `description`, `defaultSettings`, `maxPerPage`,
and a `settingsSchema` the customizer renders generically. Adding a section type
means adding an entry here plus a component in the renderer's map; it must never
mean writing new customizer UI.

`defaultSections()` is deterministic and pre-filled with real copy, so a store
that has never been customized still looks designed. It is the *generic* starter
page; a store that has chosen a preset should get `presetSections(preset)`
instead, which is what the renderer and `saveDraft` do.

`normalizeSections` fails soft — unknown types and over-limit duplicates are
dropped and reported, never thrown. One bad section must not blank a storefront.

---

## `preview.ts`

```ts
const PREVIEW_TOKEN_TTL_SECONDS: 1800;
const PREVIEW_TOKEN_MAX_TTL_SECONDS: 14400;
interface PreviewTokenClaims { storeId: string; userId?: string; expiresAt: number }

mintPreviewToken(storeId: string,
                 options?: { ttlSeconds?: number; userId?: string }): Promise<string>
verifyPreviewToken(token: string | null | undefined): Promise<PreviewTokenClaims | null>
isPreviewAuthorized(storeId: string, token: string | null | undefined): Promise<boolean>
previewUrl(slug: string, token: string): string
```

HS256 over the app's existing `JWT_SECRET`, with a preview-specific issuer,
audience and `type` claim so a session token cannot be replayed as a preview
token. `isPreviewAuthorized` is the single check the store layout must make
before serving a draft. Uses `jsonwebtoken` (as `src/lib/auth.ts` does) rather
than `jose`; both produce the same JWTs, and `jsonwebtoken` is CommonJS, which
keeps this security boundary directly unit-testable.

The API's `GET /api/admin/storefront-theme` returns a freshly minted token in
`data.previewToken`, so the customizer does not need to call `mintPreviewToken`
itself.

---

## `db.ts` (server-only)

```ts
type ThemeStatus = 'draft' | 'published';
interface StorefrontThemeRecord { storeId; status; theme: StorefrontThemeInput;
                                  sections: Section[]; version; updatedAt; publishedAt }
interface ResolvedThemeRecord extends Omit<StorefrontThemeRecord, 'theme'> {
  theme: ResolvedTheme;          // ready to render
  raw:   StorefrontThemeInput;   // the stored patch, for the customizer to edit
}

getPublishedTheme(storeId: string): Promise<ResolvedThemeRecord | null>
getDraftTheme(storeId: string): Promise<ResolvedThemeRecord | null>
getThemeForRender(storeId: string, wantsDraft: boolean): Promise<ResolvedThemeRecord | null>
saveDraft(storeId: string, theme?: StorefrontThemeInput,
          sections?: Section[]): Promise<ResolvedThemeRecord>
publishDraft(storeId: string): Promise<ResolvedThemeRecord | null>
resetDraft(storeId: string): Promise<ResolvedThemeRecord>
deleteStoreTheme(storeId: string): Promise<void>
invalidateThemeCache(storeId?: string): void
```

Published themes are cached in-process for 60s and invalidated explicitly on
publish and reset. Drafts are never cached. `saveDraft` treats `undefined`
arguments as "leave that column alone", so the customizer can save a colour tweak
without resending the section list. `getDraftTheme` seeds a draft from the
published row (or the shipped defaults) the first time it is called.

---

## API routes

| Route | Method | Body | Success | Failure |
|---|---|---|---|---|
| `/api/admin/storefront-theme` | `GET` | — | `{ storeId, theme, resolvedTheme, sections, version, updatedAt, contrast, previewToken, registries: { presets, fonts, sections } }` | 401 |
| `/api/admin/storefront-theme` | `PUT` | `{ theme?, sections? }` | `{ …, warnings }` | 401 / 400 + `fieldErrors` |
| `/api/admin/storefront-theme/publish` | `POST` | — | `{ …, publishedAt }` | 401 / 400 |
| `/api/admin/storefront-theme/reset` | `POST` | `{ preset? }` | the restored draft | 401 / 400 + `fieldErrors` |

All four authenticate with `requireAuth` from `src/lib/auth/session.ts` — the
app's existing `jose`-signed session, as a `Authorization: Bearer …` header or
the `session` cookie. The store is taken from the session, never from the
request body, so a caller cannot address someone else's shop.

`fieldErrors` is keyed by dotted path (`theme.brand.color`), ready to render
inline next to the offending control. Invalid input is always a 400, never a 500.

---

## Migration

`database/migrations/019_storefront_themes.sql` creates
`public.storefront_themes` (`store_id`, `theme` jsonb, `sections` jsonb,
`status`, `version`, timestamps, unique on `(store_id, status)`) and defines
`public.backfill_storefront_themes()`, which gives every store a draft and a
published row derived from its legacy `stores.theme_name` and carries
`stores.custom_css` into `theme.custom.css`. Both the migration and the function
are idempotent; run the function again after seeding new stores.

---

## Tests

```
npx jest src/lib/storefront-theme
```

`color.test.ts` sweeps the hue circle at every lightness to prove auto-contrast;
`sanitize.test.ts` is an attack suite; `resolve.test.ts` pins the emitted
property set against the spec and checks determinism; `presets.test.ts` proves
the six presets are six designs.
