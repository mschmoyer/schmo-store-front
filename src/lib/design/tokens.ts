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

/**
 * Layered elevation from §4. Warm-tinted means R > G > B: `rgba(38,26,20)`.
 * The earlier `rgba(16,18,22)` had B > G > R, i.e. a blue-grey cast — cooler
 * than neutral grey, on a warm paper ground. Every step is layered, including
 * `xs`; a single flat blur is exactly what §4 forbids.
 *
 * Mirrors `--shadow-*` in `globals.css`. Change both together.
 */
export const shadow = {
  xs: '0 1px 2px rgba(38,26,20,.06), 0 1px 3px rgba(38,26,20,.03)',
  sm: '0 1px 2px rgba(38,26,20,.07), 0 2px 6px rgba(38,26,20,.05)',
  md: '0 2px 4px rgba(38,26,20,.05), 0 8px 20px -4px rgba(38,26,20,.11)',
  lg: '0 4px 8px rgba(38,26,20,.05), 0 20px 44px -8px rgba(38,26,20,.15)',
  xl: '0 8px 16px rgba(38,26,20,.06), 0 36px 80px -16px rgba(38,26,20,.20)',
  ember: '0 2px 6px rgba(220,58,12,.24), 0 10px 28px -6px rgba(220,58,12,.32)',
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
 * The hue arc the generated product marks are allowed to occupy, in degrees.
 * 8°–54° runs from just below ember (14°) to just above amber (38°). Nothing
 * outside this arc is permitted: §1's anti-goal is explicit that the product
 * must not look like a generic purple/blue SaaS template, and §2 reserves
 * azure for informational use only.
 */
export const MARK_HUE_ARC = { min: 8, max: 54 } as const;

/** Every 7th seed drops out of the hue arc onto graphite, for visual rhythm. */
export const MARK_INK_RAMP = { from: ink[600], to: ink[900] } as const;

/** Minimum contrast white must keep against the lighter gradient stop. */
export const MARK_MIN_CONTRAST = 4.5;

export type InkShade = keyof typeof ink;
export type EmberShade = keyof typeof ember;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadow;

/** A generated gradient: two stops plus the foreground that stays legible. */
export interface MarkGradient {
  from: string;
  to: string;
  on: string;
}

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
 * Converts HSL to a `#rrggbb` string.
 *
 * @param h - Hue in degrees.
 * @param s - Saturation, 0–100.
 * @param l - Lightness, 0–100.
 * @returns An uppercase hex color.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

/** Relative luminance per WCAG 2.x. */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Contrast ratio between a hex color and white.
 *
 * @param hex - `#rrggbb` color.
 * @returns The WCAG contrast ratio against `#FFFFFF`.
 */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/**
 * Picks the gradient a product should use for its generated fallback mark.
 *
 * Hue is confined to the brand arc (8°–54°); per-SKU distinctiveness comes from
 * saturation and lightness instead, so no tile can drift into the purple/teal
 * territory §1 rules out. The `to` stop is the same hue family, darker — a
 * shade, not a hue shift. Lightness is then walked down until white clears
 * {@link MARK_MIN_CONTRAST} against the lighter stop, which keeps the initials
 * readable on every tile including the yellow end of the arc.
 *
 * Every 7th seed uses the ink ramp instead, which gives the grid a handful of
 * deliberate graphite tiles without inventing a third brand color.
 *
 * @param seed - SKU if available, otherwise the product name.
 * @returns The gradient stops and the foreground color that stays legible on them.
 */
export function gradientForSeed(seed: string): MarkGradient {
  const hash = hashString(seed);

  if (hash % 7 === 0) {
    return { from: MARK_INK_RAMP.from, to: MARK_INK_RAMP.to, on: '#FFFFFF' };
  }

  const span = MARK_HUE_ARC.max - MARK_HUE_ARC.min;
  const hue = MARK_HUE_ARC.min + ((hash % 3600) / 3600) * span;
  const saturation = 54 + ((hash >>> 8) % 40);
  // A wide lightness range is what stops a constrained-hue grid reading as one
  // colour repeated. Going darker is free: white contrast only improves.
  let lightness = 26 + ((hash >>> 14) % 28);

  let from = hslToHex(hue, saturation, lightness);
  // Deterministic: the same seed always walks the same number of steps.
  while (contrastWithWhite(from) < MARK_MIN_CONTRAST && lightness > 18) {
    lightness -= 2;
    from = hslToHex(hue, saturation, lightness);
  }

  const to = hslToHex(
    Math.max(MARK_HUE_ARC.min, hue - 10),
    Math.max(0, saturation - 6),
    Math.max(10, lightness - 20)
  );

  return { from, to, on: '#FFFFFF' };
}
