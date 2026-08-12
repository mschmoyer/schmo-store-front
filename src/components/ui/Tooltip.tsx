'use client';

import * as React from 'react';
import { Tooltip as MantineTooltip, type TooltipProps as MantineTooltipProps } from '@mantine/core';
import { EASE_OUT } from './motion';

export interface TooltipProps extends Omit<MantineTooltipProps, 'label'> {
  /** Tooltip copy. Keep it to a few words — this is not a help panel. */
  label: React.ReactNode;
  /**
   * Hides the tooltip entirely, so callers can keep the wrapper in the tree
   * while a tooltip is contextually unnecessary.
   */
  hidden?: boolean;
}

/**
 * Tooltip over Mantine's, pinned to our geometry and delay.
 *
 * Tooltips are supplementary by definition: never put information here that a
 * user must have, and never attach one to a control that has no other label —
 * an icon-only button still needs its own `aria-label` (§7).
 *
 * @param props - {@link TooltipProps} plus Mantine's tooltip props.
 * @returns The child wrapped in a themed tooltip, or the bare child when `hidden`.
 */
export function Tooltip({
  label,
  hidden = false,
  openDelay = 180,
  closeDelay = 60,
  withArrow = true,
  radius = 'xs',
  position = 'top',
  children,
  ...rest
}: TooltipProps): React.ReactElement {
  if (hidden || !label) {
    return <>{children}</>;
  }

  return (
    <MantineTooltip
      label={label}
      openDelay={openDelay}
      closeDelay={closeDelay}
      withArrow={withArrow}
      radius={radius}
      position={position}
      transitionProps={{ transition: 'pop', duration: 120, timingFunction: EASE_OUT }}
      {...rest}
    >
      {children}
    </MantineTooltip>
  );
}

export default Tooltip;
