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
      <MantineProvider theme={rebelMantineTheme} cssVariablesResolver={rebelCssVariablesResolver}>
        <Notifications position="top-right" limit={4} />
        {children}
      </MantineProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
