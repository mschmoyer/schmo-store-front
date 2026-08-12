/**
 * The base storefront theme.
 *
 * Every resolved theme starts here. A preset merges over this, and the
 * merchant's overrides merge over the preset. Because the base is complete,
 * a `{}` patch is a valid theme and a brand-new store renders correctly.
 *
 * The base is deliberately quiet: warm paper, warm ink, a single confident
 * accent. It is a good store, not an opinionated one — the presets in
 * `presets.ts` are where the opinions live.
 */

import type { Density, StorefrontTheme, TypeScale } from './types';

/** Id used by `preset` when a theme was not forked from a named preset. */
export const CUSTOM_PRESET_ID = 'custom';

/** The preset a brand-new store is created with. */
export const DEFAULT_PRESET_ID = 'studio';

/** Spacing multiplier per density setting (spec section 2, `shape.density`). */
export const DENSITY_MULTIPLIER: Record<Density, number> = {
  compact: 0.85,
  default: 1,
  roomy: 1.2,
};

/** Type-ramp multiplier per scale setting (spec section 2, `typography.scale`). */
export const SCALE_MULTIPLIER: Record<TypeScale, number> = {
  compact: 0.9,
  default: 1,
  spacious: 1.12,
};

/** The 4px-based space ramp, in px, before the density multiplier is applied. */
export const BASE_SPACE_RAMP: readonly number[] = [
  4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96,
];

/** Content max width per density, in px. */
export const CONTAINER_WIDTH: Record<Density, number> = {
  compact: 1140,
  default: 1200,
  roomy: 1320,
};

/** Card/button corner radius in px per radius style. */
export const RADIUS_PX: Record<StorefrontTheme['shape']['radius'], number> = {
  square: 0,
  soft: 8,
  rounded: 16,
  pill: 999,
};

/** `aspect-ratio` value per product image ratio. */
export const PRODUCT_RATIO: Record<
  StorefrontTheme['productCard']['imageRatio'],
  string
> = {
  square: '1 / 1',
  portrait: '3 / 4',
  landscape: '4 / 3',
};

/**
 * The base theme. Treat as immutable — `resolveTheme` never mutates it.
 */
export const BASE_THEME: StorefrontTheme = {
  version: 1,
  preset: CUSTOM_PRESET_ID,
  brand: {
    color: '#f94e1b',
    surface: '#fbfaf8',
    surfaceRaised: '#ffffff',
    text: '#0e1014',
    textMuted: '#5a626f',
    border: '#dce0e6',
    success: '#0fa871',
    warning: '#b06f00',
    danger: '#c8271b',
    scheme: 'light',
  },
  typography: {
    headingFont: 'space-grotesk',
    bodyFont: 'inter',
    scale: 'default',
    headingWeight: 700,
    headingCase: 'none',
    headingTracking: -0.02,
  },
  shape: {
    radius: 'soft',
    borderWidth: 1,
    shadow: 'subtle',
    density: 'default',
  },
  buttons: {
    style: 'solid',
    uppercase: false,
  },
  productCard: {
    imageRatio: 'square',
    imageFit: 'cover',
    align: 'left',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'lift',
  },
  header: {
    layout: 'logo-left',
    sticky: true,
    announcement: {
      text: '',
      enabled: false,
    },
  },
  footer: {
    layout: 'columns',
    showNewsletter: true,
  },
  custom: {},
};

/**
 * A deep copy of the base theme, safe to mutate.
 * @returns A fresh `StorefrontTheme`
 */
export function baseTheme(): StorefrontTheme {
  return structuredClone(BASE_THEME);
}
