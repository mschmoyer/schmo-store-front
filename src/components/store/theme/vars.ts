import {
  CONTRAST_TEXT,
  CONTRAST_UI,
  deriveShadowTint,
  deriveTokens,
  ensureContrast,
  mix,
  rgba,
  type ResolvedTheme,
} from '@/lib/storefront-theme';

/**
 * Renderer-level custom properties, derived from the theme.
 *
 * The engine emits exactly the tokens in spec section 3 and no more — that list
 * is a contract and this track does not get to grow it. But a *renderer* still
 * needs a few presentation decisions expressed as variables: what a button
 * looks like for `buttons.style`, how a product card aligns, how imagery fits.
 *
 * Those live here under an `--stx-*` prefix (`x` for "extra") so they are
 * visibly not part of the contract, and they are derived purely from the
 * resolved theme's own `--st-*` values. Nothing here invents a color: every
 * value either references an `--st-*` token or is a keyword.
 *
 * Keeping them as variables rather than component props is what lets the
 * preview iframe repaint a button-style change by swapping one CSS rule instead
 * of re-rendering the page.
 */

/** The sentinel that separates repaintable variables from static base rules. */
export const THEME_BLOCK_SENTINEL = '/*__storefront-base__*/';

/**
 * Build the button treatment for a theme's `buttons.style`.
 *
 * **A brand colour is not automatically a legible foreground.** The engine
 * guarantees `--st-on-brand` reads on a brand *fill*, and it lifts `--st-text`
 * and `--st-text-muted` to 4.5:1 on the page — but `--st-brand` itself carries
 * no such promise, because it is a fill colour first. An `outline` or `soft`
 * button paints its label *in* the brand colour on a near-page ground, so it
 * sits outside every guarantee the engine makes: Bloom's pink on its own
 * off-white measured **2.28:1** with the brand used raw.
 *
 * So the two unfilled treatments run the brand through the same
 * `ensureContrast` the engine uses on body text, against every ground that
 * button can actually sit on — the page, a card, and (for `soft`) its own tint
 * in both states. The result is still the merchant's hue, walked along the
 * OKLCh lightness axis only as far as legibility requires, and it is computed
 * here rather than in CSS because `color-mix()` cannot check its own contrast.
 *
 * @param theme - The resolved theme
 * @returns Declaration lines for the button variables
 */
function buttonVars(theme: ResolvedTheme): string[] {
  const uppercase = theme.buttons.uppercase;
  const shared = [
    `--stx-btn-case: ${uppercase ? 'uppercase' : 'none'}`,
    `--stx-btn-tracking: ${uppercase ? '0.06em' : '0.01em'}`,
    `--stx-btn-weight: ${uppercase ? '650' : '600'}`,
  ];

  // Every ground an unfilled button can land on. The sunken one matters more
  // than it looks: quick-add sits on the product card's image tile, not on the
  // card, which is why an outline label measured differently in the grid than
  // it did in the hero.
  const { brand, surface, surfaceRaised, surfaceSunken } = deriveTokens(theme);
  const grounds = [surface, surfaceRaised, surfaceSunken];

  switch (theme.buttons.style) {
    case 'outline': {
      // An outline button is transparent, so its ground is whatever band or card
      // it lands on. Both are checked.
      const label = ensureContrast(brand, grounds, CONTRAST_TEXT);
      const edge = ensureContrast(brand, grounds, CONTRAST_UI);
      return [
        ...shared,
        '--stx-btn-bg: transparent',
        `--stx-btn-fg: ${label}`,
        `--stx-btn-border: ${edge}`,
        '--stx-btn-bg-hover: var(--st-brand)',
        '--stx-btn-fg-hover: var(--st-on-brand)',
        '--stx-btn-border-hover: var(--st-brand)',
        '--stx-btn-border-width: 1px',
      ];
    }
    case 'soft': {
      // The tints are computed rather than left to `color-mix()` so their
      // contrast can be measured against the label before either ships.
      const rest = mix(surface, brand, 0.16);
      const hover = mix(surface, brand, 0.28);
      const label = ensureContrast(
        brand,
        [rest, hover, ...grounds.map((ground) => mix(ground, brand, 0.16))],
        CONTRAST_TEXT,
      );
      return [
        ...shared,
        `--stx-btn-bg: ${rest}`,
        `--stx-btn-fg: ${label}`,
        '--stx-btn-border: transparent',
        `--stx-btn-bg-hover: ${hover}`,
        `--stx-btn-fg-hover: ${label}`,
        '--stx-btn-border-hover: transparent',
        '--stx-btn-border-width: 1px',
      ];
    }
    case 'solid':
    default:
      return [
        ...shared,
        '--stx-btn-bg: var(--st-brand)',
        '--stx-btn-fg: var(--st-on-brand)',
        '--stx-btn-border: var(--st-brand)',
        '--stx-btn-bg-hover: var(--st-brand-hover)',
        '--stx-btn-fg-hover: var(--st-on-brand)',
        '--stx-btn-border-hover: var(--st-brand-hover)',
        '--stx-btn-border-width: 1px',
      ];
  }
}

/**
 * Emit the renderer's derived custom-property block.
 *
 * @param theme - The resolved theme
 * @param scope - The already-escaped storefront selector
 * @returns A CSS rule scoped to the storefront wrapper
 */
export function rendererVars(theme: ResolvedTheme, scope: string): string {
  const centered = theme.productCard.align === 'center';

  const lines = [
    ...buttonVars(theme),
    // An *opaque* scrim colour for the overlay hero.
    //
    // `--st-overlay` already carries an alpha (0.55 light / 0.72 dark), and the
    // hero also applies the merchant's dimming as `opacity`, so the two
    // multiplied: a scrim asked to be 55% landed at 40% and left white copy at
    // 2.9:1 over a pale product shot. With an opaque tint the merchant's
    // percentage is the only alpha in play and means exactly what it says.
    `--stx-hero-scrim: ${rgba(deriveShadowTint(theme.brand.surface), 1)}`,
    `--stx-card-align: ${centered ? 'center' : 'left'}`,
    `--stx-card-items: ${centered ? 'center' : 'flex-start'}`,
    `--stx-image-fit: ${theme.productCard.imageFit}`,
    // A contain-fit tile needs a ground behind the artwork or it floats.
    `--stx-image-pad: ${theme.productCard.imageFit === 'contain' ? 'var(--st-space-4)' : '0px'}`,
    `--stx-border-visible: ${theme.shape.borderWidth === 0 ? '0px' : 'var(--st-border-width)'}`,
  ];

  return `${scope} {\n${lines.map((line) => `  ${line};`).join('\n')}\n}`;
}

/**
 * Data attributes the storefront wrapper carries for decisions CSS cannot make
 * from a variable — a custom property cannot select a rule, only fill a value.
 *
 * @param theme - The resolved theme
 * @returns Attributes to spread onto the storefront wrapper element
 */
export function themeDataAttributes(theme: ResolvedTheme): Record<string, string> {
  return {
    'data-scheme': theme.brand.scheme,
    'data-hover': theme.productCard.hoverEffect,
    'data-card-align': theme.productCard.align,
    'data-image-fit': theme.productCard.imageFit,
    'data-buttons': theme.buttons.style,
    'data-radius': theme.shape.radius,
    'data-density': theme.shape.density,
    'data-header': theme.header.layout,
  };
}
