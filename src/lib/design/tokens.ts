/**
 * RebelShops design tokens, mirrored as typed TypeScript constants.
 *
 * CSS is the source of truth for anything that renders in the DOM — components
 * must read `var(--surface)` etc. from `src/app/globals.css`. This module exists
 * only for the places where a *value* is genuinely required in JavaScript:
 * chart palettes, `<canvas>`, generated OG images, SVG gradients, Mantine's
 * `createTheme`, and the deterministic ProductImage fallback.
 *
 * If you change a hex here, change it in `globals.css` too. Both files are
 * derived from `/docs/design-system.md` §2.
 */

/** Warm-cooled charcoal neutral ramp. Keys are the design-doc token suffixes. */
export const ink = {
  950: '#08090B',
  900: '#0E1014',
  800: '#171A20',
  700: '#22262F',
  600: '#333944',
  500: '#5A626F',
  400: '#858D9A',
  300: '#B4BAC4',
  200: '#DCE0E6',
  100: '#ECEEF2',
  50: '#F5F6F8',
} as const;

/** Warm off-white grounds. Never pure white for a page background. */
export const paper = {
  base: '#FBFAF8',
  raised: '#FFFFFF',
  sunken: '#F2F1ED',
} as const;

/** Vermilion brand signal. 500 is the primary fill. */
export const ember = {
  50: '#FFF3EE',
  100: '#FFE1D5',
  200: '#FFC0A8',
  300: '#FF9871',
  400: '#FF6F3D',
  500: '#F94E1B',
  600: '#DC3A0C',
  700: '#B32D09',
  800: '#8A230A',
  900: '#5E1907',
} as const;

/** Money, in-stock, success, savings. Never used for chrome. */
export const mint = {
  50: '#E8F8F1',
  100: '#C9EDDD',
  200: '#96DCC0',
  300: '#5FCAA1',
  400: '#33B986',
  500: '#0FA871',
  600: '#0C8A5D',
  700: '#0A6C49',
  800: '#085037',
  900: '#053526',
} as const;

/** Warning, low stock. */
export const amber = {
  50: '#FEF6E6',
  100: '#FBE9C2',
  200: '#F6D28A',
  300: '#F0BA52',
  400: '#E8A226',
  500: '#D98A00',
  600: '#B57200',
  700: '#8F5A00',
  800: '#6B4300',
  900: '#472D00',
} as const;

/** Destructive, out of stock, error. */
export const rose = {
  50: '#FEECEB',
  100: '#FCD6D3',
  200: '#F8AEA8',
  300: '#F2867D',
  400: '#E85B50',
  500: '#D92D20',
  600: '#B91C13',
  700: '#93150E',
  800: '#6E100A',
  900: '#4A0A07',
} as const;

/** Informational only. Never a call to action. */
export const azure = {
  50: '#EEF4FF',
  500: '#2563EB',
  600: '#1D4ED8',
  700: '#1E40AF',
} as const;

/** Every palette ramp, keyed by family name. */
export const palette = { ink, paper, ember, mint, amber, rose, azure } as const;

/** 4px-based spacing scale from §4, in pixels. */
export const space = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128] as const;

/** Corner radii from §4. Buttons/inputs use `sm`, cards use `lg`. */
export const radius = {
  xs: '6px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  full: '999px',
} as const;

/** Layered, warm-tinted elevation from §4. Never a single flat blur. */
export const shadow = {
  xs: '0 1px 2px rgba(16,18,22,.06)',
  sm: '0 1px 2px rgba(16,18,22,.06), 0 2px 6px rgba(16,18,22,.05)',
  md: '0 2px 4px rgba(16,18,22,.05), 0 8px 20px -4px rgba(16,18,22,.10)',
  lg: '0 4px 8px rgba(16,18,22,.04), 0 20px 44px -8px rgba(16,18,22,.14)',
  xl: '0 8px 16px rgba(16,18,22,.05), 0 36px 80px -16px rgba(16,18,22,.20)',
  ember: '0 2px 6px rgba(249,78,27,.24), 0 10px 28px -6px rgba(249,78,27,.32)',
} as const;

/** Easing curves and durations from §4. */
export const motion = {
  easeOut: 'cubic-bezier(.16,1,.3,1)',
  easeInOut: 'cubic-bezier(.65,0,.35,1)',
  /** Hover / press feedback. */
  micro: 120,
  /** Panels, cards, disclosure. */
  standard: 220,
  /** First paint of a section. */
  entrance: 420,
} as const;

/** Type scale from §3. Sizes are fluid `clamp()` strings where the doc says so. */
export const typeScale = {
  display: { size: 'clamp(2.75rem, 6vw, 4.5rem)', leading: 1.02, tracking: '-0.03em' },
  h1: { size: 'clamp(2.25rem, 4vw, 3.25rem)', leading: 1.08, tracking: '-0.025em' },
  h2: { size: 'clamp(1.75rem, 2.6vw, 2.25rem)', leading: 1.15, tracking: '-0.02em' },
  h3: { size: '1.375rem', leading: 1.25, tracking: '-0.015em' },
  lg: { size: '1.125rem', leading: 1.6, tracking: '-0.005em' },
  base: { size: '1rem', leading: 1.6, tracking: '0' },
  sm: { size: '0.875rem', leading: 1.5, tracking: '0' },
  xs: { size: '0.75rem', leading: 1.4, tracking: '0.01em' },
  eyebrow: { size: '0.75rem', leading: 1, tracking: '0.14em' },
} as const;

/** Content widths from §6. */
export const layout = {
  content: 1200,
  wide: 1440,
  gutter: 24,
  gutterMobile: 16,
  productMinColumn: 260,
  gridGap: 24,
} as const;

/**
 * Ordered categorical series for charts. Ember leads because it is the brand
 * signal; the rest are chosen for hue separation, not for prettiness.
 */
export const chartSeries = [
  ember[500],
  azure[500],
  mint[500],
  amber[500],
  ink[500],
  ember[700],
  mint[700],
  rose[500],
] as const;

/**
 * Hue pairs used by the deterministic ProductImage fallback. Each entry is a
 * [from, to] gradient stop plus the ink color that stays legible on top of it.
 */
export const fallbackGradients = [
  { from: ember[400], to: ember[700], on: '#FFFFFF' },
  { from: mint[400], to: mint[700], on: '#FFFFFF' },
  { from: azure[500], to: '#4C1D95', on: '#FFFFFF' },
  { from: amber[400], to: ember[600], on: '#FFFFFF' },
  { from: ink[600], to: ink[900], on: '#FFFFFF' },
  { from: rose[400], to: rose[700], on: '#FFFFFF' },
  { from: '#14B8A6', to: azure[700], on: '#FFFFFF' },
  { from: ember[300], to: rose[600], on: '#FFFFFF' },
  { from: mint[500], to: ink[800], on: '#FFFFFF' },
  { from: '#7C3AED', to: ember[600], on: '#FFFFFF' },
  { from: amber[500], to: ink[800], on: '#FFFFFF' },
  { from: ink[400], to: ink[700], on: '#FFFFFF' },
] as const;

export type InkShade = keyof typeof ink;
export type EmberShade = keyof typeof ember;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadow;
export type FallbackGradient = (typeof fallbackGradients)[number];

/**
 * A stable 32-bit FNV-1a hash. Used wherever a visual needs to be derived
 * deterministically from a string (SKU, product name) so the same product
 * always renders the same mark on the server and the client.
 *
 * @param value - Arbitrary seed string.
 * @returns An unsigned 32-bit integer.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Picks the gradient a given product should use for its generated fallback mark.
 *
 * @param seed - SKU if available, otherwise the product name.
 * @returns The gradient stops and the foreground color that stays legible on it.
 */
export function gradientForSeed(seed: string): FallbackGradient {
  return fallbackGradients[hashString(seed) % fallbackGradients.length];
}
