import {
  sanitizeCustomCss,
  storefrontScope,
  themeToCss,
  type ResolvedTheme,
} from '@/lib/storefront-theme';

import { THEME_BLOCK_SENTINEL, rendererVars } from './vars';

interface StorefrontStyleProps {
  storeId: string;
  theme: ResolvedTheme;
}

/**
 * Build the base rules every storefront needs, scoped to the storefront wrapper.
 *
 * Three jobs, all of which must be scoped rather than global:
 *
 *  1. **Ground the page.** The wrapper paints `--st-surface` and sets the body
 *     font, so a merchant's dark theme is dark to the edges without touching
 *     `body` and without an `!important` fight against admin chrome.
 *  2. **Bridge the primitive kit.** `ProductImage`, `Skeleton`, `EmptyState` and
 *     friends read RebelShops' own semantic tokens. Re-binding those tokens to
 *     the merchant's `--st-*` values *inside the wrapper* means the shared
 *     primitives inherit the merchant's palette instead of stamping RebelShops
 *     ink onto a shopper's page. Custom properties inherit, so this is a
 *     re-parenting of the token graph, not an override war — no `!important`,
 *     and nothing escapes the wrapper.
 *  3. **Apply the typographic contract.** Heading weight, case and tracking come
 *     from the theme, so `headingCase: 'uppercase'` actually changes headings
 *     rather than being a variable nothing reads.
 *
 * **Why the resets are wrapped in `:where()`.** The heading block has the same
 * problem the link reset had, with the same cause: written as `${scope} h2` it
 * scores (0,2,1) and outranks any component class that colours or sizes a
 * heading. `.bandBrand :is(h1…h6) { color: var(--st-on-brand) }` is (0,1,1), so
 * a heading sitting on a brand-filled newsletter band was painted in the page's
 * ink instead of the ink computed for that fill — white on green rather than
 * near-black on green. A reset is a floor, not an opinion, so both blocks are
 * wrapped and every class that means something wins over them.
 *
 * **The link reset specifically.** Links must inherit their
 * colour instead of going UA blue, but that reset has no business outranking a
 * component. Written as `${scope} a` it scored (0,2,1) and beat every class
 * that legitimately colours a link: `.btn` resolves its foreground from
 * `--stx-btn-fg` at (0,1,0), so an `<a class="btn">` silently threw away the
 * `--st-on-brand` ink the engine had computed for it and inherited `--st-text`
 * instead. Same class, same variable, different tag, different colour — which
 * shipped a primary hero CTA at 2.07:1 and defeated the engine's auto-contrast
 * guarantee for every link-shaped button in the shop. `:where()` contributes
 * nothing to specificity, so the rule lands at (0,0,1): still ahead of the UA
 * stylesheet, now behind every class that means what it says.
 *
 * Reduced motion is deliberately *not* handled here: `globals.css` already
 * carries a universal `prefers-reduced-motion` rule that covers the storefront
 * subtree, and a merchant cannot opt out of it.
 *
 * @param scope - The already-escaped storefront selector
 * @returns CSS text
 */
function baseRules(scope: string): string {
  return `
${scope} {
  background-color: var(--st-surface);
  color: var(--st-text);
  font-family: var(--st-font-body);
  font-size: var(--st-body);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;

  /* Bridge: RebelShops primitives resolve their tokens to the merchant's palette. */
  --surface: var(--st-surface);
  --surface-raised: var(--st-surface-raised);
  --surface-sunken: var(--st-surface-sunken);
  --surface-inset: var(--st-surface-sunken);
  --surface-overlay: var(--st-surface-raised);
  --text-primary: var(--st-text);
  --text-secondary: var(--st-text-muted);
  --text-tertiary: var(--st-text-muted);
  --text-on-accent: var(--st-on-brand);
  --border: var(--st-border);
  --border-subtle: var(--st-border);
  --border-strong: var(--st-border-strong);
  --accent: var(--st-brand);
  --accent-hover: var(--st-brand-hover);
  --accent-active: var(--st-brand-active);
  --accent-text: var(--st-brand);
  --accent-fg: var(--st-on-brand);
  --success: var(--st-success);
  --success-text: var(--st-success);
  --warning: var(--st-warning);
  --warning-text: var(--st-warning);
  --danger: var(--st-danger);
  --danger-text: var(--st-danger);
  --skeleton-base: var(--st-surface-sunken);
  --radius-sm: var(--st-radius-input);
  --radius-md: var(--st-radius-image);
  --radius-lg: var(--st-radius-card);
  --shadow-sm: var(--st-shadow-card);
  --shadow-md: var(--st-shadow-card);
  --shadow-lg: var(--st-shadow-popover);
}

/* Zero-specificity for the same reason the link reset is -- see baseRules. */
:where(${scope}) :is(h1, h2, h3, h4, h5, h6) {
  font-family: var(--st-font-heading);
  font-weight: var(--st-heading-weight);
  text-transform: var(--st-heading-case);
  letter-spacing: var(--st-heading-tracking);
  line-height: 1.12;
  margin: 0;
  color: var(--st-text);
  text-wrap: balance;
}

:where(${scope}) h1 { font-size: var(--st-h1); }
:where(${scope}) h2 { font-size: var(--st-h2); }
:where(${scope}) h3 { font-size: var(--st-h3); }
:where(${scope}) h4 { font-size: var(--st-h4); }
:where(${scope}) h5 { font-size: var(--st-h5); }
:where(${scope}) h6 { font-size: var(--st-h6); }

:where(${scope}) p { margin: 0; }

/* Zero-specificity on purpose -- see the note on baseRules. */
:where(${scope}) a { color: inherit; }

${scope} :focus-visible {
  outline: 2px solid var(--st-brand);
  outline-offset: 2px;
  border-radius: 2px;
}`.trim();
}

/**
 * Server-rendered theme block for one storefront.
 *
 * This is the whole anti-flash mechanism: the merchant's resolved custom
 * properties are computed on the server and emitted inline, so they are present
 * in the very first byte of HTML. There is no `useEffect`, no `setTimeout`, and
 * nothing to repaint after hydration.
 *
 * The block is scoped to `.storefront[data-store-id="…"]` and never to `:root`,
 * so a storefront rendered inside the customizer's preview iframe cannot bleed
 * into admin chrome (spec section 4).
 *
 * `dangerouslySetInnerHTML` is correct here and is not an injection hole: the
 * token block is generated entirely from validated enum/hex values by the
 * engine, the selector is escaped by `storefrontScope`, and the only
 * merchant-authored text in the output — `custom.css` — has already been
 * through the engine's `sanitizeCustomCss` inside `themeToStyleSheet`
 * (spec section 7).
 *
 * @param props.storeId - The store whose scope the variables attach to
 * @param props.theme - The resolved theme to emit
 * @returns A `<style>` element carrying the storefront's tokens
 */
export function StorefrontStyle({ storeId, theme }: StorefrontStyleProps) {
  const scope = storefrontScope(storeId);

  // Order matters. Everything before the sentinel is theme-derived and is what
  // the preview bridge swaps on `theme:update`; everything after is static.
  // The merchant's own CSS goes last so it can override the base rules — that
  // is the point of the escape hatch — but it has been through the engine's
  // sanitizer first (spec section 7).
  const custom = sanitizeCustomCss(theme.custom?.css, scope);
  const css = [
    themeToCss(theme, scope),
    rendererVars(theme, scope),
    THEME_BLOCK_SENTINEL,
    baseRules(scope),
    custom.css,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <style
      id="storefront-theme"
      data-store-id={storeId}
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
