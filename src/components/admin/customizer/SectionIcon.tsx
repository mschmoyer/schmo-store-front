'use client';

/**
 * Resolves the icon *name* carried by a `SectionDefinition` into a component.
 *
 * `sections.ts` deliberately stores a string so the registry stays free of
 * React imports and usable from Node scripts and API routes. The mapping back
 * to a component therefore has to live on this side of the line, and it has to
 * fail soft: a section type added by another track before this map catches up
 * gets a neutral placeholder, never a crash.
 */

import * as React from 'react';
import {
  IconArticle,
  IconBadges,
  IconBuildingStore,
  IconCategory,
  IconClockHour4,
  IconHelpCircle,
  IconLayoutColumns,
  IconLayoutGrid,
  IconLayoutNavbarExpand,
  IconMail,
  IconQuote,
  IconSquare,
  IconTypography,
  type IconProps,
} from '@tabler/icons-react';

type TablerIcon = React.ComponentType<IconProps>;

const ICONS: Record<string, TablerIcon> = {
  IconArticle,
  IconBadges,
  IconBuildingStore,
  IconCategory,
  IconClockHour4,
  IconHelpCircle,
  IconLayoutColumns,
  IconLayoutGrid,
  IconLayoutNavbarExpand,
  IconMail,
  IconQuote,
  IconTypography,
};

export interface SectionIconProps extends IconProps {
  /** The `icon` field from a `SectionDefinition`. */
  name: string;
}

/**
 * Draw a section's registry icon.
 * @param props - {@link SectionIconProps}
 * @returns The mapped icon, or a neutral placeholder for unknown names
 */
export function SectionIcon({ name, ...rest }: SectionIconProps): React.ReactElement {
  const Icon = ICONS[name] ?? IconSquare;
  return <Icon {...rest} />;
}
