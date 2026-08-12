import type { ResolvedTheme } from '@/lib/storefront-theme';

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
 * `outline` and `soft` both resolve their resting foreground to the brand color
 * and only flip to `--st-on-brand` once the brand fills the button, so the
 * engine's auto-contrast guarantee still holds in every state.
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

  switch (theme.buttons.style) {
    case 'outline':
      return [
        ...shared,
        '--stx-btn-bg: transparent',
        '--stx-btn-fg: var(--st-brand)',
        '--stx-btn-border: var(--st-brand)',
        '--stx-btn-bg-hover: var(--st-brand)',
        '--stx-btn-fg-hover: var(--st-on-brand)',
        '--stx-btn-border-hover: var(--st-brand)',
        '--stx-btn-border-width: 1px',
      ];
    case 'soft':
      return [
        ...shared,
        '--stx-btn-bg: color-mix(in oklab, var(--st-brand) 16%, var(--st-surface))',
        '--stx-btn-fg: var(--st-brand)',
        '--stx-btn-border: transparent',
        '--stx-btn-bg-hover: color-mix(in oklab, var(--st-brand) 28%, var(--st-surface))',
        '--stx-btn-fg-hover: var(--st-brand)',
        '--stx-btn-border-hover: transparent',
        '--stx-btn-border-width: 1px',
      ];
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
