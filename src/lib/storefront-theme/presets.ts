/**
 * The six shipped storefront presets (spec section 6).
 *
 * A preset is a complete `StorefrontTheme`, not a hue rotation. Each one varies
 * *every* structural axis the contract exposes — font pairing, type scale,
 * corner radius, border weight, elevation, density, button treatment, product
 * card geometry, header layout and footer layout — so the six read as six
 * different shops rather than one shop painted six colors.
 *
 * Axis matrix (kept honest by `presets.test.ts`):
 *
 * |          | heading / body            | scale    | radius | border | shadow | density | buttons          | card                    | header               |
 * |----------|---------------------------|----------|--------|--------|--------|---------|------------------|-------------------------|----------------------|
 * | Studio   | Fraunces / Manrope        | spacious | soft   | 1      | none   | roomy   | outline          | square · contain · left | logo-left-nav-below  |
 * | Voltage  | Space Grotesk / Inter     | compact  | square | 1      | none   | compact | solid UPPER      | square · cover · left   | logo-left (sticky)   |
 * | Bloom    | Outfit / DM Sans          | default  | rounded| 0      | subtle | roomy   | soft             | portrait · cover · ctr  | logo-center          |
 * | Depot    | Archivo / Inter           | compact  | square | 1      | none   | compact | solid UPPER      | landscape · contain     | logo-left-nav-below  |
 * | Marquee  | Bricolage / Archivo       | spacious | square | 0      | none   | default | outline UPPER    | portrait · cover · left | logo-center          |
 * | Fresh    | Plus Jakarta / Plus Jak.  | default  | pill   | 1      | lifted | roomy   | solid            | square · cover · center | logo-left (sticky)   |
 */

import { RADIUS_PX } from './defaults';
import type { PresetDefinition, StorefrontTheme } from './types';

/* ------------------------------------------------------------------ *
 * Studio — warm minimal, craft & homeware
 * ------------------------------------------------------------------ */

const studio: StorefrontTheme = {
  version: 1,
  preset: 'studio',
  brand: {
    color: '#8a6a4f',
    surface: '#faf7f2',
    surfaceRaised: '#ffffff',
    text: '#1c1917',
    textMuted: '#6b625a',
    border: '#e7e0d5',
    success: '#3f7d52',
    warning: '#a3742a',
    danger: '#b03f31',
    scheme: 'light',
  },
  typography: {
    headingFont: 'fraunces',
    bodyFont: 'manrope',
    scale: 'spacious',
    headingWeight: 500,
    headingCase: 'none',
    headingTracking: -0.012,
  },
  shape: {
    radius: 'soft',
    borderWidth: 1,
    shadow: 'none',
    density: 'roomy',
  },
  buttons: { style: 'outline', uppercase: false },
  productCard: {
    imageRatio: 'square',
    imageFit: 'contain',
    align: 'left',
    showVendor: true,
    showQuickAdd: false,
    hoverEffect: 'none',
  },
  header: {
    layout: 'logo-left-nav-below',
    sticky: false,
    announcement: { text: 'Made in small batches. Free shipping over $95.', enabled: true },
  },
  footer: { layout: 'columns', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Voltage — dark, high contrast, electronics & streetwear
 * ------------------------------------------------------------------ */

const voltage: StorefrontTheme = {
  version: 1,
  preset: 'voltage',
  brand: {
    // Acid lime on near-black: the auto-contrast rule must flip button ink to
    // dark here. If a future change breaks that, this preset shows it first.
    color: '#c6f135',
    surface: '#08090b',
    surfaceRaised: '#14161b',
    text: '#f2f4f7',
    textMuted: '#98a0ae',
    border: '#272c35',
    success: '#3ddc97',
    warning: '#ffb020',
    danger: '#ff5c5c',
    scheme: 'dark',
  },
  typography: {
    headingFont: 'space-grotesk',
    bodyFont: 'inter',
    scale: 'compact',
    headingWeight: 700,
    headingCase: 'uppercase',
    headingTracking: -0.005,
  },
  shape: {
    radius: 'square',
    borderWidth: 1,
    shadow: 'none',
    density: 'compact',
  },
  buttons: { style: 'solid', uppercase: true },
  productCard: {
    imageRatio: 'square',
    imageFit: 'cover',
    align: 'left',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'swap',
  },
  header: {
    layout: 'logo-left',
    sticky: true,
    announcement: { text: 'Next-day dispatch on every order placed before 3pm.', enabled: true },
  },
  footer: { layout: 'minimal', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Bloom — soft, rounded, beauty & wellness
 * ------------------------------------------------------------------ */

const bloom: StorefrontTheme = {
  version: 1,
  preset: 'bloom',
  brand: {
    color: '#e0819f',
    surface: '#fffbfc',
    surfaceRaised: '#ffffff',
    text: '#3a2b33',
    textMuted: '#7d6a72',
    border: '#f3e3e9',
    success: '#3f9c78',
    warning: '#bb7f2c',
    danger: '#cc4f5c',
    scheme: 'light',
  },
  typography: {
    headingFont: 'outfit',
    bodyFont: 'dm-sans',
    scale: 'default',
    headingWeight: 600,
    headingCase: 'none',
    headingTracking: -0.01,
  },
  shape: {
    radius: 'rounded',
    borderWidth: 0,
    shadow: 'subtle',
    density: 'roomy',
  },
  buttons: { style: 'soft', uppercase: false },
  productCard: {
    imageRatio: 'portrait',
    imageFit: 'cover',
    align: 'center',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'lift',
  },
  header: {
    layout: 'logo-center',
    sticky: true,
    announcement: { text: 'Free samples with every order.', enabled: true },
  },
  footer: { layout: 'minimal', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Depot — dense, utilitarian, parts & B2B
 * ------------------------------------------------------------------ */

const depot: StorefrontTheme = {
  version: 1,
  preset: 'depot',
  brand: {
    color: '#1b4fa0',
    surface: '#f3f4f6',
    surfaceRaised: '#ffffff',
    text: '#14181d',
    textMuted: '#576270',
    border: '#cfd5dd',
    success: '#1a7f4b',
    warning: '#9a6600',
    danger: '#b42318',
    scheme: 'light',
  },
  typography: {
    headingFont: 'archivo',
    bodyFont: 'inter',
    scale: 'compact',
    headingWeight: 700,
    headingCase: 'none',
    headingTracking: -0.004,
  },
  shape: {
    radius: 'square',
    borderWidth: 1,
    shadow: 'none',
    density: 'compact',
  },
  buttons: { style: 'solid', uppercase: true },
  productCard: {
    imageRatio: 'landscape',
    imageFit: 'contain',
    align: 'left',
    showVendor: true,
    showQuickAdd: true,
    hoverEffect: 'none',
  },
  header: {
    layout: 'logo-left-nav-below',
    sticky: true,
    announcement: {
      text: 'Trade accounts: net-30 terms and volume pricing available.',
      enabled: true,
    },
  },
  footer: { layout: 'columns', showNewsletter: false },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Marquee — editorial, oversized display type, apparel
 * ------------------------------------------------------------------ */

const marquee: StorefrontTheme = {
  version: 1,
  preset: 'marquee',
  brand: {
    // Near-black brand: the auto-contrast rule must flip button ink to white.
    color: '#111111',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    text: '#0a0a0a',
    textMuted: '#6b6b6b',
    border: '#e4e4e4',
    success: '#2f7a4f',
    warning: '#8a6a00',
    danger: '#a52a1a',
    scheme: 'light',
  },
  typography: {
    headingFont: 'bricolage-grotesque',
    bodyFont: 'archivo',
    scale: 'spacious',
    headingWeight: 800,
    headingCase: 'uppercase',
    headingTracking: -0.03,
  },
  shape: {
    radius: 'square',
    borderWidth: 0,
    shadow: 'none',
    density: 'default',
  },
  buttons: { style: 'outline', uppercase: true },
  productCard: {
    imageRatio: 'portrait',
    imageFit: 'cover',
    align: 'left',
    showVendor: true,
    showQuickAdd: false,
    hoverEffect: 'swap',
  },
  header: {
    layout: 'logo-center',
    sticky: false,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'minimal', showNewsletter: false },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Fresh — bright, friendly, food & supplements
 * ------------------------------------------------------------------ */

const fresh: StorefrontTheme = {
  version: 1,
  preset: 'fresh',
  brand: {
    color: '#12b76a',
    surface: '#f5fbf7',
    surfaceRaised: '#ffffff',
    text: '#0f231a',
    textMuted: '#4f665b',
    border: '#d5e7dc',
    success: '#0e9f5f',
    warning: '#b4791c',
    danger: '#cc4437',
    scheme: 'light',
  },
  typography: {
    headingFont: 'plus-jakarta',
    bodyFont: 'plus-jakarta',
    scale: 'default',
    headingWeight: 800,
    headingCase: 'none',
    headingTracking: -0.022,
  },
  shape: {
    radius: 'pill',
    borderWidth: 1,
    shadow: 'lifted',
    density: 'roomy',
  },
  buttons: { style: 'solid', uppercase: false },
  productCard: {
    imageRatio: 'square',
    imageFit: 'cover',
    align: 'center',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'zoom',
  },
  header: {
    layout: 'logo-left',
    sticky: true,
    announcement: { text: 'Subscribe and save 15% on every delivery.', enabled: true },
  },
  footer: { layout: 'columns', showNewsletter: true },
  custom: {},
};

/**
 * Build the thumbnail payload for a preset.
 *
 * `onBrand` is resolved lazily by the customizer through `resolveTheme`; here we
 * hand over the raw inputs plus the structural cues a thumbnail needs to draw a
 * miniature of the real layout.
 *
 * @param theme - The preset's theme
 * @param onBrand - Pre-computed ink for the brand swatch
 * @returns Thumbnail data
 */
function thumbnailFor(theme: StorefrontTheme, onBrand: string): PresetDefinition['thumbnail'] {
  return {
    background: theme.brand.surface,
    surface: theme.brand.surfaceRaised,
    brand: theme.brand.color,
    onBrand,
    text: theme.brand.text,
    textMuted: theme.brand.textMuted,
    border: theme.brand.border,
    radiusPx: Math.min(RADIUS_PX[theme.shape.radius], 24),
    headingFont: theme.typography.headingFont,
    bodyFont: theme.typography.bodyFont,
    headingCase: theme.typography.headingCase,
    buttonStyle: theme.buttons.style,
    imageRatio: theme.productCard.imageRatio,
    headerLayout: theme.header.layout,
  };
}

/** The shipped presets, keyed by id. */
export const PRESETS: Record<string, PresetDefinition> = {
  studio: {
    id: 'studio',
    name: 'Studio',
    description:
      'Warm paper, an old-style serif and a lot of air. Contain-fit imagery so nothing gets cropped.',
    register: 'Craft, homeware, ceramics',
    thumbnail: thumbnailFor(studio, '#ffffff'),
    theme: studio,
  },
  voltage: {
    id: 'voltage',
    name: 'Voltage',
    description:
      'Near-black ground, acid accent, square corners and tight uppercase headings. Loud on purpose.',
    register: 'Electronics, streetwear, gear',
    thumbnail: thumbnailFor(voltage, '#0d1102'),
    theme: voltage,
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    description:
      'Borderless rounded cards, centered product info, portrait imagery and soft-fill buttons.',
    register: 'Beauty, wellness, self-care',
    thumbnail: thumbnailFor(bloom, '#33141f'),
    theme: bloom,
  },
  depot: {
    id: 'depot',
    name: 'Depot',
    description:
      'Compact rows, hard edges, landscape spec shots and vendor names on every card. Built for scanning.',
    register: 'Parts, industrial, B2B',
    thumbnail: thumbnailFor(depot, '#ffffff'),
    theme: depot,
  },
  marquee: {
    id: 'marquee',
    name: 'Marquee',
    description:
      'Oversized display type, uppercase headings, no borders and no shadows. The product is the page.',
    register: 'Apparel, footwear, editorial',
    thumbnail: thumbnailFor(marquee, '#ffffff'),
    theme: marquee,
  },
  fresh: {
    id: 'fresh',
    name: 'Fresh',
    description:
      'Pill buttons, lifted cards, mint accent and roomy spacing. Friendly without being childish.',
    register: 'Food, supplements, subscriptions',
    thumbnail: thumbnailFor(fresh, '#03210f'),
    theme: fresh,
  },
};

/** Preset ids in customizer display order. */
export const PRESET_IDS: readonly string[] = [
  'studio',
  'voltage',
  'bloom',
  'depot',
  'marquee',
  'fresh',
];

/** The presets as an array, in display order. */
export const PRESET_LIST: PresetDefinition[] = PRESET_IDS.map((id) => PRESETS[id]);

/**
 * Look up a preset by id.
 * @param id - Candidate preset id
 * @returns The preset definition, or undefined when the id is unknown
 */
export function getPreset(id: string | undefined): PresetDefinition | undefined {
  if (!id) return undefined;
  return Object.prototype.hasOwnProperty.call(PRESETS, id) ? PRESETS[id] : undefined;
}

/**
 * Map a legacy `stores.theme_name` value onto a modern preset plus the brand
 * color that made the old palette recognisable (spec section 9).
 *
 * The old system was eleven color swatches; the new one is six designs. Each
 * legacy name lands on the preset whose *register* is closest, then keeps its
 * original accent so a merchant's shop does not change color overnight.
 */
export const LEGACY_THEME_MAP: Record<
  string,
  { preset: string; brandColor?: string; scheme?: 'light' | 'dark' }
> = {
  default: { preset: 'fresh', brandColor: '#1aa35c' },
  ocean: { preset: 'depot', brandColor: '#2563eb' },
  sunset: { preset: 'fresh', brandColor: '#e2620f' },
  purple: { preset: 'bloom', brandColor: '#7c3aed' },
  dark: { preset: 'voltage', brandColor: '#22c55e', scheme: 'dark' },
  rose: { preset: 'bloom', brandColor: '#e11d48' },
  teal: { preset: 'fresh', brandColor: '#0d9488' },
  amber: { preset: 'studio', brandColor: '#c07908' },
  slate: { preset: 'depot', brandColor: '#475569' },
  crimson: { preset: 'marquee', brandColor: '#c62222' },
};

/**
 * Convert a legacy theme name into a theme patch for the migration path.
 * @param legacyName - Value from `stores.theme_name`
 * @returns A partial theme to merge over the mapped preset
 */
export function themeFromLegacyName(legacyName: string | null | undefined): {
  preset: string;
  brand: { color?: string; scheme?: 'light' | 'dark' };
} {
  const mapping =
    (legacyName && LEGACY_THEME_MAP[legacyName]) || LEGACY_THEME_MAP.default;
  return {
    preset: mapping.preset,
    brand: {
      ...(mapping.brandColor ? { color: mapping.brandColor } : {}),
      ...(mapping.scheme ? { scheme: mapping.scheme } : {}),
    },
  };
}
