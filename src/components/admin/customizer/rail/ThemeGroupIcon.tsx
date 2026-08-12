'use client';

/**
 * Icon lookup for the theme groups, mirroring {@link SectionIcon} for sections.
 * Kept as a name-to-component map so `themeSchema.ts` can stay a plain data
 * module with no React import.
 */

import * as React from 'react';
import {
  IconBorderRadius,
  IconClick,
  IconCode,
  IconLayoutBoard,
  IconLayoutBottombar,
  IconLayoutNavbar,
  IconLetterCase,
  IconPalette,
  IconSettings,
  IconTemplate,
  type IconProps,
} from '@tabler/icons-react';

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  IconBorderRadius,
  IconClick,
  IconCode,
  IconLayoutBoard,
  IconLayoutBottombar,
  IconLayoutNavbar,
  IconLetterCase,
  IconPalette,
  IconTemplate,
};

export interface ThemeGroupIconProps extends IconProps {
  /** The `icon` field from a {@link ThemeGroup}. */
  name: string;
}

/**
 * Draw a theme group's icon.
 * @param props - {@link ThemeGroupIconProps}
 * @returns The mapped icon, or a neutral fallback
 */
export function ThemeGroupIcon({ name, ...rest }: ThemeGroupIconProps): React.ReactElement {
  const Icon = ICONS[name] ?? IconSettings;
  return <Icon {...rest} />;
}
