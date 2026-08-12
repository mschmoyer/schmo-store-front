import type { ReactNode } from 'react';

interface StoreThemeProviderProps {
  /** Legacy `stores.theme_name`. Retained for call-site compatibility only. */
  themeId?: string;
  children: ReactNode;
}

/**
 * Deprecated. A pass-through kept only so existing call sites keep compiling.
 *
 * This used to be the storefront's theming mechanism, and it was the source of
 * the flash of unstyled theme: a `'use client'` component that, on mount, wrote
 * two dozen `--theme-*` properties onto `document.documentElement`, forced
 * `background-color` and `color` onto `document.body`, and then **did it all
 * again behind a `setTimeout(applyTheme, 100)`** to win a race against the
 * global theme context. Its cleanup then reset every one of those properties to
 * the default palette on unmount, so navigating between store pages repainted
 * the whole document twice.
 *
 * That is all gone. Storefront theming is now resolved on the server and
 * emitted as a scoped custom-property block that ships with the first byte —
 * see `StorefrontStyle` and `docs/storefront-theme-spec.md` section 4. There is
 * no client-side application step to race with, and nothing is written to
 * `:root` or `<body>`, so a storefront can no longer leak its palette into
 * admin chrome.
 *
 * The component survives as a no-op because the blog, checkout and
 * order-success routes are owned by other tracks and still import it. Once they
 * move to `StorefrontShell`, delete this file and those imports together.
 *
 * @param props.children - The subtree to render
 * @returns The children, unchanged
 * @deprecated Render inside `StorefrontShell` instead.
 */
export function StoreThemeProvider({ children }: StoreThemeProviderProps) {
  return <>{children}</>;
}
