/**
 * The curated storefront font registry (spec section 5).
 *
 * This module is **pure data** — no `next/font` import — so it can be consumed
 * from the resolver, from Node scripts and from tests without pulling the Next
 * font compiler macro into scope. The statically-declared `next/font/google`
 * instances that actually load these families live in `./fonts.next.ts`, which
 * the storefront layout imports directly.
 *
 * Merchants pick from this list rather than typing a family name: arbitrary
 * names mean missing fonts, broken renders and uncontrolled layout shift.
 */

import { FONT_IDS, type FontId } from './types';

export type FontCategory = 'sans' | 'serif' | 'display' | 'mono';

export interface FontDefinition {
  id: FontId;
  /** Human label shown in the customizer. */
  label: string;
  /** CSS family name as Google serves it. */
  family: string;
  /** Custom property the `next/font` instance is bound to. */
  cssVar: `--${string}`;
  category: FontCategory;
  /** Sample string the customizer renders in the font's own face. */
  previewText: string;
  /** Fallback stack appended after the loaded family. */
  fallback: string;
  /** Weights requested from Google. */
  weights: string[];
}

const SANS_FALLBACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const SERIF_FALLBACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
const MONO_FALLBACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/**
 * Every font a merchant may select, keyed by id.
 *
 * `manrope` stands in for the "general-sans-equivalent" register named in the
 * spec: General Sans is not on Google Fonts, and Manrope is the closest
 * geometric-humanist match that `next/font/google` can self-host.
 */
export const FONTS: Record<FontId, FontDefinition> = {
  inter: {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    cssVar: '--st-font-inter',
    category: 'sans',
    previewText: 'Neutral, legible, invisible. The safe default.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700'],
  },
  'space-grotesk': {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: 'Space Grotesk',
    cssVar: '--st-font-space-grotesk',
    category: 'sans',
    previewText: 'Technical grotesque with odd, memorable letterforms.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700'],
  },
  manrope: {
    id: 'manrope',
    label: 'Manrope',
    family: 'Manrope',
    cssVar: '--st-font-manrope',
    category: 'sans',
    previewText: 'Geometric humanist. Clean without being cold.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700', '800'],
  },
  'dm-sans': {
    id: 'dm-sans',
    label: 'DM Sans',
    family: 'DM Sans',
    cssVar: '--st-font-dm-sans',
    category: 'sans',
    previewText: 'Low-contrast geometric sans. Friendly at small sizes.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '700'],
  },
  'plus-jakarta': {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    family: 'Plus Jakarta Sans',
    cssVar: '--st-font-plus-jakarta',
    category: 'sans',
    previewText: 'Rounded terminals, wide apertures, warm and modern.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700', '800'],
  },
  outfit: {
    id: 'outfit',
    label: 'Outfit',
    family: 'Outfit',
    cssVar: '--st-font-outfit',
    category: 'sans',
    previewText: 'Perfectly geometric. Circles are circles.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700'],
  },
  'playfair-display': {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: 'Playfair Display',
    cssVar: '--st-font-playfair-display',
    category: 'serif',
    previewText: 'High-contrast Didone. Luxury, editorial, jewellery.',
    fallback: SERIF_FALLBACK,
    weights: ['400', '500', '600', '700', '800'],
  },
  fraunces: {
    id: 'fraunces',
    label: 'Fraunces',
    family: 'Fraunces',
    cssVar: '--st-font-fraunces',
    category: 'serif',
    previewText: 'Soft, wonky old-style serif. Craft and homeware.',
    fallback: SERIF_FALLBACK,
    weights: ['400', '500', '600', '700'],
  },
  'instrument-serif': {
    id: 'instrument-serif',
    label: 'Instrument Serif',
    family: 'Instrument Serif',
    cssVar: '--st-font-instrument-serif',
    category: 'serif',
    previewText: 'Tall, tight, contemporary display serif.',
    fallback: SERIF_FALLBACK,
    weights: ['400'],
  },
  lora: {
    id: 'lora',
    label: 'Lora',
    family: 'Lora',
    cssVar: '--st-font-lora',
    category: 'serif',
    previewText: 'Brushed contemporary serif. Reads beautifully in body copy.',
    fallback: SERIF_FALLBACK,
    weights: ['400', '500', '600', '700'],
  },
  'bricolage-grotesque': {
    id: 'bricolage-grotesque',
    label: 'Bricolage Grotesque',
    family: 'Bricolage Grotesque',
    cssVar: '--st-font-bricolage-grotesque',
    category: 'display',
    previewText: 'Loud, condensable display grotesque. Big headlines only.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700', '800'],
  },
  archivo: {
    id: 'archivo',
    label: 'Archivo',
    family: 'Archivo',
    cssVar: '--st-font-archivo',
    category: 'display',
    previewText: 'Grotesque built for signage. Utilitarian and loud.',
    fallback: SANS_FALLBACK,
    weights: ['400', '500', '600', '700', '800'],
  },
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: 'JetBrains Mono',
    cssVar: '--st-font-jetbrains-mono',
    category: 'mono',
    previewText: 'SKU-9481 · $129.00 · 12 in stock',
    fallback: MONO_FALLBACK,
    weights: ['400', '500', '700'],
  },
};

/** The registry as an array, in customizer display order. */
export const FONT_LIST: FontDefinition[] = FONT_IDS.map((id) => FONTS[id]);

/**
 * Look up a font by id, falling back to Inter for unknown values.
 * @param id - Candidate font id
 * @returns The font definition; never throws
 */
export function getFont(id: string | undefined): FontDefinition {
  if (id && Object.prototype.hasOwnProperty.call(FONTS, id)) {
    return FONTS[id as FontId];
  }
  return FONTS.inter;
}

/**
 * Type guard for font ids coming off the wire.
 * @param id - Candidate value
 * @returns True when the value is a curated font id
 */
export function isFontId(id: unknown): id is FontId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FONTS, id);
}

/**
 * Build the `font-family` value the engine emits for `--st-font-heading` /
 * `--st-font-body`.
 *
 * The custom property set by `next/font` is referenced first, so when the
 * storefront layout has applied the font variable classes the self-hosted face
 * wins; the literal family name and the platform stack are the graceful
 * degradation path (e.g. inside a customizer thumbnail that never loaded them).
 *
 * @param id - Font id
 * @returns A complete CSS font stack
 */
export function fontStack(id: string | undefined): string {
  const font = getFont(id);
  return `var(${font.cssVar}), "${font.family}", ${font.fallback}`;
}

/** Fonts grouped by category, for the customizer's grouped picker. */
export const FONTS_BY_CATEGORY: Record<FontCategory, FontDefinition[]> = {
  sans: FONT_LIST.filter((f) => f.category === 'sans'),
  serif: FONT_LIST.filter((f) => f.category === 'serif'),
  display: FONT_LIST.filter((f) => f.category === 'display'),
  mono: FONT_LIST.filter((f) => f.category === 'mono'),
};
