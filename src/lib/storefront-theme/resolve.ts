/**
 * Theme resolution and CSS emission — the heart of the storefront theme engine.
 *
 * `resolveTheme` deep-merges defaults -> preset -> merchant overrides into a
 * complete `ResolvedTheme`. `themeToCss` turns that into exactly the custom
 * properties listed in spec section 3, scoped to a selector the caller supplies.
 *
 * Three invariants this module must never break:
 *
 *  1. **Auto-contrast.** Every derived color is computed from the merchant's
 *     inputs by real color math in `color.ts`. Any brand color — pale yellow,
 *     near-black, neon — produces legible ink at >= 4.5:1. Nothing is hardcoded
 *     to white.
 *  2. **Determinism.** The same theme always produces byte-identical CSS, so the
 *     output can be cached, diffed and compared in tests.
 *  3. **No leakage.** Variables are scoped to the selector passed in, never to
 *     `:root`, and no declaration uses `!important`.
 */

import {
  CONTRAST_TEXT,
  CONTRAST_UI,
  adjustLightness,
  clamp,
  contrastRatio,
  deriveBrandStates,
  deriveShadowTint,
  deriveStrongBorder,
  ensureContrast,
  hexToOklch,
  isHexColor,
  mix,
  oklchToHex,
  pickOnColor,
  rgba,
} from './color';
import {
  BASE_SPACE_RAMP,
  BASE_THEME,
  CONTAINER_WIDTH,
  DENSITY_MULTIPLIER,
  PRODUCT_RATIO,
  RADIUS_PX,
  SCALE_MULTIPLIER,
} from './defaults';
import { fontStack } from './fonts';
import { getPreset } from './presets';
import { sanitizeCustomCss, type SanitizeResult } from './sanitize';
import type { ResolvedTheme, StorefrontTheme, StorefrontThemeInput } from './types';

/* ------------------------------------------------------------------ *
 * Merging
 * ------------------------------------------------------------------ */

/**
 * Test whether a value is a plain object (and therefore mergeable).
 * @param value - Candidate value
 * @returns True for plain objects, false for arrays, null and primitives
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(Object.getPrototypeOf(value)) === null)
  );
}

/** Keys that must never be copied across during a merge. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively merge `patch` over `base`, ignoring `undefined` values.
 *
 * Prototype-polluting keys are dropped: theme patches arrive from the network,
 * and `{"__proto__": {...}}` is a real payload someone will eventually send.
 *
 * @param base - Object to merge into (not mutated)
 * @param patch - Partial overrides
 * @returns A new merged object
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as unknown as T;

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(value) && isPlainObject(current)
      ? deepMerge(current, value)
      : value;
  }
  return out as T;
}

/**
 * Resolve a partial theme into a complete, renderable theme.
 *
 * Merge order is defaults -> preset (chosen by `input.preset`) -> the merchant's
 * own overrides. Derived colors are then filled in: `brand.colorOnBrand` is
 * auto-contrasted unless the merchant explicitly set it.
 *
 * Unknown preset ids are ignored rather than throwing — a theme row written by
 * an older build must never blank a live storefront.
 *
 * @param input - A partial theme, typically straight out of JSONB
 * @returns A fully-populated theme
 */
export function resolveTheme(input?: StorefrontThemeInput | null): ResolvedTheme {
  const patch = (input ?? {}) as Record<string, unknown>;
  const preset = getPreset(typeof patch.preset === 'string' ? patch.preset : undefined);

  let merged = deepMerge<StorefrontTheme>(BASE_THEME, preset?.theme ?? {});
  merged = deepMerge<StorefrontTheme>(merged, patch);

  const announcement = merged.header.announcement ?? { text: '', enabled: false };

  const resolved: ResolvedTheme = {
    ...merged,
    version: 1,
    brand: {
      ...merged.brand,
      colorOnBrand: merged.brand.colorOnBrand ?? '',
    },
    header: {
      ...merged.header,
      announcement: {
        text: announcement.text ?? '',
        enabled: announcement.enabled ?? false,
        ...(announcement.href ? { href: announcement.href } : {}),
      },
    },
    custom: merged.custom ?? {},
  };

  // Auto-contrast: only compute when the merchant has not pinned a value.
  if (!isHexColor(resolved.brand.colorOnBrand)) {
    resolved.brand.colorOnBrand = deriveTokens(resolved).onBrand;
  }

  return resolved;
}

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

export interface DerivedColors {
  brand: string;
  brandHover: string;
  brandActive: string;
  onBrand: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  overlay: string;
  text: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
  shadowCard: string;
  shadowCardHover: string;
  shadowPopover: string;
}

/**
 * Compute every color the renderer needs from the merchant's raw inputs.
 *
 * This is where the auto-contrast contract is enforced:
 *
 *  - `onBrand` is chosen between a dark ink (derived from the theme's own text
 *    color) and a light ink (derived from the raised surface), then pushed along
 *    the OKLCh lightness axis until it clears 4.5:1 against the brand color *and*
 *    both of its interaction states. A pale yellow brand gets dark ink; a
 *    near-black brand gets white ink; nothing is hardcoded.
 *  - `text` and `textMuted` are lifted to 4.5:1 against the surface, so a
 *    merchant cannot accidentally set grey-on-grey.
 *  - `borderStrong` is lifted to 3:1 against the surface, the WCAG floor for
 *    non-text UI.
 *  - `success` / `warning` / `danger` are lifted to 3:1 so status colors never
 *    vanish into the page.
 *  - Shadows are tinted with a near-black that inherits the surface's hue, so a
 *    warm theme stays warm all the way down into its elevation.
 *
 * @param theme - A merged theme (`colorOnBrand` may be empty)
 * @returns Every derived color, as hex or CSS color strings
 */
export function deriveTokens(theme: StorefrontTheme): DerivedColors {
  const isDarkScheme = theme.brand.scheme === 'dark';

  const surface = theme.brand.surface;
  const surfaceRaised = theme.brand.surfaceRaised;
  const brand = theme.brand.color;

  // Ink candidates are pulled from the merchant's own palette so the result
  // still feels like their store, not a generic black-or-white flip.
  const textOklch = hexToOklch(theme.brand.text);
  const darkInk = oklchToHex({
    l: Math.min(textOklch.l, 0.2),
    c: Math.min(textOklch.c, 0.045),
    h: textOklch.h,
  });
  const raisedOklch = hexToOklch(surfaceRaised);
  const lightInk = oklchToHex({
    l: Math.max(raisedOklch.l, 0.975),
    c: Math.min(raisedOklch.c, 0.015),
    h: raisedOklch.h,
  });

  // Order matters. The ink is chosen against the *resting* brand color, which
  // is the state WCAG actually judges and the one sRGB can always satisfy. The
  // hover and active states are then derived under the constraint that they
  // keep that same ink legible, rather than the other way around.
  const onBrand = isHexColor(theme.brand.colorOnBrand ?? '')
    ? (theme.brand.colorOnBrand as string)
    : pickOnColor([brand], darkInk, lightInk, CONTRAST_TEXT);

  const { hover: brandHover, active: brandActive } = deriveBrandStates(
    brand,
    surface,
    onBrand,
    CONTRAST_TEXT,
  );

  const surfaceSunken = isDarkScheme
    ? adjustLightness(surface, -0.025)
    : mix(surface, darkInk, 0.045);

  const text = ensureContrast(theme.brand.text, [surface, surfaceRaised], CONTRAST_TEXT);
  const textMuted = ensureContrast(
    theme.brand.textMuted,
    [surface, surfaceRaised],
    CONTRAST_TEXT,
  );
  const borderStrong = deriveStrongBorder(theme.brand.border, surface, text);

  const success = ensureContrast(theme.brand.success, [surface], CONTRAST_UI);
  const warning = ensureContrast(theme.brand.warning, [surface], CONTRAST_UI);
  const danger = ensureContrast(theme.brand.danger, [surface], CONTRAST_UI);

  const tint = deriveShadowTint(surface);
  const overlay = rgba(tint, isDarkScheme ? 0.72 : 0.55);

  const shadows = deriveShadows(theme.shape.shadow, isDarkScheme, tint);

  return {
    brand,
    brandHover,
    brandActive,
    onBrand,
    surface,
    surfaceRaised,
    surfaceSunken,
    overlay,
    text,
    textMuted,
    border: theme.brand.border,
    borderStrong,
    success,
    warning,
    danger,
    ...shadows,
  };
}

/**
 * Build the three shadow tokens.
 *
 * On dark grounds a drop shadow is invisible, so elevation is expressed as a
 * top-light inset ring instead — the rule from `docs/design-system.md` section 4,
 * applied to merchant themes.
 *
 * `shadow: 'none'` still gives popovers a shadow: a floating menu with no
 * elevation is a usability bug, not a style choice.
 *
 * @param style - The merchant's shadow setting
 * @param isDarkScheme - Whether the theme is dark-ground
 * @param tint - The surface-derived near-black used to tint shadows
 * @returns The three shadow token values
 */
function deriveShadows(
  style: StorefrontTheme['shape']['shadow'],
  isDarkScheme: boolean,
  tint: ReturnType<typeof deriveShadowTint>,
): Pick<DerivedColors, 'shadowCard' | 'shadowCardHover' | 'shadowPopover'> {
  if (isDarkScheme) {
    const ring = 'inset 0 1px 0 rgba(255, 255, 255, 0.06)';
    const ringHover = 'inset 0 1px 0 rgba(255, 255, 255, 0.1)';
    const popover = `0 4px 8px ${rgba(tint, 0.5)}, 0 20px 44px -8px ${rgba(tint, 0.65)}`;
    if (style === 'none') return { shadowCard: 'none', shadowCardHover: 'none', shadowPopover: popover };
    if (style === 'subtle') {
      return { shadowCard: ring, shadowCardHover: ringHover, shadowPopover: popover };
    }
    return {
      shadowCard: `${ring}, 0 2px 8px ${rgba(tint, 0.45)}`,
      shadowCardHover: `${ringHover}, 0 8px 24px -4px ${rgba(tint, 0.6)}`,
      shadowPopover: popover,
    };
  }

  const subtle = `0 1px 2px ${rgba(tint, 0.06)}, 0 2px 6px ${rgba(tint, 0.05)}`;
  const subtleHover = `0 2px 4px ${rgba(tint, 0.05)}, 0 8px 20px -4px ${rgba(tint, 0.1)}`;
  const lifted = `0 2px 4px ${rgba(tint, 0.05)}, 0 8px 20px -4px ${rgba(tint, 0.1)}`;
  const liftedHover = `0 4px 8px ${rgba(tint, 0.04)}, 0 20px 44px -8px ${rgba(tint, 0.14)}`;
  const popover = `0 4px 8px ${rgba(tint, 0.04)}, 0 20px 44px -8px ${rgba(tint, 0.14)}`;

  if (style === 'none') {
    return { shadowCard: 'none', shadowCardHover: 'none', shadowPopover: popover };
  }
  if (style === 'subtle') {
    return { shadowCard: subtle, shadowCardHover: subtleHover, shadowPopover: popover };
  }
  return { shadowCard: lifted, shadowCardHover: liftedHover, shadowPopover: popover };
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/**
 * Format a number for CSS output: at most three decimals, no trailing zeros.
 * Fixed precision is what keeps `themeToCss` byte-stable across platforms.
 * @param value - Number to format
 * @returns Formatted numeric string
 */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Base type ramp in rem, before the scale multiplier. */
const TYPE_RAMP = {
  h1: { min: 2.125, vw: 4.2, max: 3.25 },
  h2: { min: 1.625, vw: 2.8, max: 2.25 },
  h3: { min: 1.3125, vw: 1.8, max: 1.625 },
  h4: { min: 1.1875, vw: 1.2, max: 1.3125 },
  h5: 1.0625,
  h6: 0.9375,
  body: 1,
  small: 0.875,
} as const;

/**
 * Emit a fluid `clamp()` for one heading step, scaled by the type multiplier.
 * @param step - Min/preferred/max definition in rem and vw
 * @param multiplier - Type scale multiplier
 * @returns A CSS `clamp()` expression
 */
function fluid(step: { min: number; vw: number; max: number }, multiplier: number): string {
  return `clamp(${fmt(step.min * multiplier)}rem, ${fmt(step.vw * multiplier)}vw, ${fmt(
    step.max * multiplier,
  )}rem)`;
}

/* ------------------------------------------------------------------ *
 * CSS emission
 * ------------------------------------------------------------------ */

/**
 * Build the storefront scope selector for a store.
 *
 * Variables are scoped to this element and never to `:root`, so a storefront
 * rendered inside the customizer's preview iframe cannot bleed into admin chrome.
 *
 * @param storeId - The store's UUID
 * @returns A CSS selector such as `.storefront[data-store-id="…"]`
 */
export function storefrontScope(storeId: string): string {
  const safe = String(storeId).replace(/[^a-zA-Z0-9-]/g, '');
  return `.storefront[data-store-id="${safe}"]`;
}

/**
 * Turn a resolved theme into its CSS custom property block.
 *
 * Emits exactly the properties listed in spec section 3 — no more, no less —
 * scoped to `scopeSelector`. Output is deterministic and contains no
 * `!important` and no `:root`.
 *
 * Custom merchant CSS is **not** included here; that lives in
 * {@link themeToStyleSheet} so this function stays a pure, cacheable,
 * diffable token block.
 *
 * @param theme - A resolved theme (a partial theme is resolved first)
 * @param scopeSelector - The selector the variables are scoped to
 * @returns A CSS string
 */
export function themeToCss(
  theme: ResolvedTheme | StorefrontThemeInput,
  scopeSelector: string,
): string {
  const resolved = isResolved(theme) ? theme : resolveTheme(theme);
  const scope = scopeSelector.trim() || '.storefront';

  const colors = deriveTokens(resolved);
  const density = DENSITY_MULTIPLIER[resolved.shape.density];
  const typeScale = SCALE_MULTIPLIER[resolved.typography.scale];
  const radius = RADIUS_PX[resolved.shape.radius];

  // A pill card is a lozenge, not a card: cap the card/image radius while
  // letting buttons and inputs go fully round.
  const cardRadius = Math.min(radius, 24);
  const imageRadius = Math.min(radius, 20);

  const lines: string[] = [];
  const push = (name: string, value: string): void => {
    lines.push(`  ${name}: ${value};`);
  };

  push('--st-brand', colors.brand);
  push('--st-brand-hover', colors.brandHover);
  push('--st-brand-active', colors.brandActive);
  push('--st-on-brand', colors.onBrand);

  push('--st-surface', colors.surface);
  push('--st-surface-raised', colors.surfaceRaised);
  push('--st-surface-sunken', colors.surfaceSunken);
  push('--st-overlay', colors.overlay);

  push('--st-text', colors.text);
  push('--st-text-muted', colors.textMuted);
  push('--st-text-on-brand', colors.onBrand);

  push('--st-border', colors.border);
  push('--st-border-strong', colors.borderStrong);

  push('--st-success', colors.success);
  push('--st-warning', colors.warning);
  push('--st-danger', colors.danger);

  push('--st-font-heading', fontStack(resolved.typography.headingFont));
  push('--st-font-body', fontStack(resolved.typography.bodyFont));

  push('--st-h1', fluid(TYPE_RAMP.h1, typeScale));
  push('--st-h2', fluid(TYPE_RAMP.h2, typeScale));
  push('--st-h3', fluid(TYPE_RAMP.h3, typeScale));
  push('--st-h4', fluid(TYPE_RAMP.h4, typeScale));
  push('--st-h5', `${fmt(TYPE_RAMP.h5 * typeScale)}rem`);
  push('--st-h6', `${fmt(TYPE_RAMP.h6 * typeScale)}rem`);
  push('--st-body', `${fmt(TYPE_RAMP.body * typeScale)}rem`);
  push('--st-small', `${fmt(TYPE_RAMP.small * typeScale)}rem`);

  push('--st-heading-weight', String(resolved.typography.headingWeight));
  push('--st-heading-case', resolved.typography.headingCase === 'uppercase' ? 'uppercase' : 'none');
  push('--st-heading-tracking', `${fmt(clamp(resolved.typography.headingTracking, -0.04, 0.04))}em`);

  push('--st-radius-card', `${fmt(cardRadius)}px`);
  push('--st-radius-button', `${fmt(radius)}px`);
  push('--st-radius-input', `${fmt(radius)}px`);
  push('--st-radius-image', `${fmt(imageRadius)}px`);
  push('--st-border-width', `${fmt(resolved.shape.borderWidth)}px`);

  push('--st-shadow-card', colors.shadowCard);
  push('--st-shadow-card-hover', colors.shadowCardHover);
  push('--st-shadow-popover', colors.shadowPopover);

  BASE_SPACE_RAMP.forEach((px, index) => {
    push(`--st-space-${index + 1}`, `${fmt(px * density)}px`);
  });

  push('--st-ratio-product', PRODUCT_RATIO[resolved.productCard.imageRatio]);
  push('--st-container', `${fmt(CONTAINER_WIDTH[resolved.shape.density])}px`);

  return `${scope} {\n${lines.join('\n')}\n}`;
}

/**
 * Emit the full storefront stylesheet: the token block plus the merchant's
 * sanitized custom CSS.
 *
 * This is what the store layout should put inside its `<style>` element. The
 * custom CSS has already been through `sanitizeCustomCss`, which is the only
 * supported way to render it.
 *
 * @param theme - A resolved or partial theme
 * @param scopeSelector - The selector everything is scoped to
 * @returns The stylesheet text and any sanitizer warnings
 */
export function themeToStyleSheet(
  theme: ResolvedTheme | StorefrontThemeInput,
  scopeSelector: string,
): { css: string; custom: SanitizeResult } {
  const resolved = isResolved(theme) ? theme : resolveTheme(theme);
  const scope = scopeSelector.trim() || '.storefront';
  const tokens = themeToCss(resolved, scope);
  const custom = sanitizeCustomCss(resolved.custom?.css, scope);
  return {
    css: custom.css ? `${tokens}\n${custom.css}` : tokens,
    custom,
  };
}

/**
 * Cheap structural check for an already-resolved theme.
 * @param theme - Candidate theme
 * @returns True when the object has the fields `themeToCss` needs
 */
function isResolved(theme: ResolvedTheme | StorefrontThemeInput): theme is ResolvedTheme {
  const candidate = theme as Partial<ResolvedTheme>;
  return (
    !!candidate.brand &&
    typeof candidate.brand.color === 'string' &&
    typeof candidate.brand.colorOnBrand === 'string' &&
    candidate.brand.colorOnBrand !== '' &&
    !!candidate.typography &&
    typeof candidate.typography.headingFont === 'string' &&
    !!candidate.shape &&
    typeof candidate.shape.radius === 'string' &&
    !!candidate.productCard &&
    typeof candidate.productCard.imageRatio === 'string' &&
    !!candidate.header &&
    !!candidate.footer
  );
}

/* ------------------------------------------------------------------ *
 * Auditing
 * ------------------------------------------------------------------ */

export interface ContrastAudit {
  pair: string;
  ratio: number;
  required: number;
  passes: boolean;
}

/**
 * Report the contrast of every pairing the accessibility floor cares about.
 *
 * Used by the customizer to warn a merchant before they publish, and by the
 * engine's own tests to prove auto-contrast holds for arbitrary brand colors.
 *
 * @param theme - A resolved or partial theme
 * @returns One audit row per checked pairing
 */
export function auditContrast(theme: ResolvedTheme | StorefrontThemeInput): ContrastAudit[] {
  const resolved = isResolved(theme) ? theme : resolveTheme(theme);
  const c = deriveTokens(resolved);

  const rows: Array<[string, string, string, number]> = [
    ['text on surface', c.text, c.surface, CONTRAST_TEXT],
    ['text on raised surface', c.text, c.surfaceRaised, CONTRAST_TEXT],
    ['muted text on surface', c.textMuted, c.surface, CONTRAST_TEXT],
    ['on-brand on brand', c.onBrand, c.brand, CONTRAST_TEXT],
    ['on-brand on brand hover', c.onBrand, c.brandHover, CONTRAST_TEXT],
    ['on-brand on brand active', c.onBrand, c.brandActive, CONTRAST_TEXT],
    ['strong border on surface', c.borderStrong, c.surface, CONTRAST_UI],
    ['success on surface', c.success, c.surface, CONTRAST_UI],
    ['warning on surface', c.warning, c.surface, CONTRAST_UI],
    ['danger on surface', c.danger, c.surface, CONTRAST_UI],
  ];

  return rows.map(([pair, fg, bg, required]) => {
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    return { pair, ratio, required, passes: ratio >= required };
  });
}
