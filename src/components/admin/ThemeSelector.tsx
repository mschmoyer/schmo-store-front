'use client';

import React from 'react';
import LiveThemeSelector from '@/components/ui/ThemeSelector';

export interface ThemeSelectorProps {
  /** Currently applied storefront theme id. */
  selectedTheme: string;
  /** Called with the newly chosen theme id. */
  onThemeSelect: (themeId: string) => void;
  /** Kept for call-site compatibility; the live picker has no busy state. */
  loading?: boolean;
}

/**
 * @deprecated Import `@/components/ui/ThemeSelector` directly.
 *
 * This file used to be a second, hand-maintained copy of the storefront theme
 * catalog: eight presets with their palettes typed in as forty hex literals
 * (`#8b5cf6`, `#f43f5e`, `#14b8a6`, …) that had already drifted from
 * `src/lib/themes`. It rendered a `color="gold"` badge — not a Mantine colour
 * and not one of ours, so Mantine fell through to the CSS keyword and painted
 * literal gold.
 *
 * Nothing imports it, which is the only reason the drift went unnoticed. The
 * duplicated catalog is gone; what remains is a name-compatible adapter over
 * the one real picker, so a stale import keeps working while the hexes it used
 * to carry cannot come back.
 *
 * @param props - {@link ThemeSelectorProps}
 * @returns The live storefront theme picker.
 */
export function ThemeSelector({
  selectedTheme,
  onThemeSelect,
}: ThemeSelectorProps): React.ReactElement {
  return <LiveThemeSelector value={selectedTheme} onChange={onThemeSelect} />;
}

export default ThemeSelector;
