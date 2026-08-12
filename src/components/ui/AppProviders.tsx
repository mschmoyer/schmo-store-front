'use client';

import * as React from 'react';
import { MantineProvider, useComputedColorScheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { rebelCssVariablesResolver, rebelMantineTheme } from '@/lib/theme/rebel-theme';

export interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * Mirrors Mantine's computed colour scheme onto `data-theme`.
 *
 * Without this, `:root[data-theme="dark"]` in `globals.css` is unreachable —
 * nothing in the app ever set the attribute — so a user flipping Mantine's
 * colour scheme got Mantine's internals in dark and our surfaces and text
 * still in light. One attribute, one source of truth, both systems agree.
 *
 * @returns Nothing; this component renders no markup.
 */
function ThemeAttributeSync(): null {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  React.useEffect(() => {
    document.documentElement.dataset.theme = scheme;
  }, [scheme]);

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
        defaultColorScheme="auto"
      >
        <ThemeAttributeSync />
        <Notifications position="top-right" limit={4} />
        {children}
      </MantineProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
