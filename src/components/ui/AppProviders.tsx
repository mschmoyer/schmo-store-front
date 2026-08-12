'use client';

import * as React from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { rebelCssVariablesResolver, rebelMantineTheme } from '@/lib/theme/rebel-theme';

export interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * Keeps Mantine's colour scheme pinned to the product's single palette.
 *
 * This used to mirror Mantine's *computed* scheme onto `data-theme`, which
 * meant `useComputedColorScheme` resolving "auto" against the OS could write
 * `dark` back onto the root element and undo the pinned palette from a client
 * effect, one frame after paint.
 *
 * RebelShops ships one look. Nothing in the product offers a dark-mode toggle,
 * so the previous behaviour was not a feature anyone chose — it just handed
 * half the audience an unreviewed variant. Merchant storefronts are unaffected:
 * they render from their own `--st-*` layer, so a merchant who picks the dark
 * Voltage preset still gets a dark shop.
 *
 * @returns Nothing; this component renders no markup.
 */
function ThemeAttributeSync(): null {
  React.useEffect(() => {
    document.documentElement.dataset.theme = 'light';
  }, []);

  return null;
}

/**
 * Client-side provider stack for the app shell.
 *
 * This exists as a `'use client'` boundary specifically so the Mantine theme
 * can carry `styles` callbacks. `createTheme()` output is not serializable, so
 * a Server Component (`app/layout.tsx`) cannot pass it to `MantineProvider`
 * as a prop — the theme has to be imported on the client side of the boundary.
 *
 * The nesting and the `<Notifications />` mount match what `layout.tsx` did
 * before the design system landed; only the theme is new.
 *
 * @param props - {@link AppProvidersProps}
 * @returns The children wrapped in the store theme and Mantine providers.
 */
export function AppProviders({ children }: AppProvidersProps): React.ReactElement {
  return (
    <ThemeProvider>
      <MantineProvider
        theme={rebelMantineTheme}
        cssVariablesResolver={rebelCssVariablesResolver}
        // "auto" so Mantine follows the OS preference, which is what
        // globals.css's `prefers-color-scheme` block already does. Leaving
        // Mantine pinned to "light" was the desync: the CSS went dark and
        // Mantine did not.
        forceColorScheme="light"
      >
        <ThemeAttributeSync />
        <Notifications position="top-right" limit={4} />
        {children}
      </MantineProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
