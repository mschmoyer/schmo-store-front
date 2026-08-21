'use client';

import React from 'react';
import { SegmentedControl } from '@mantine/core';
import type { PlatformWindowDays } from './types';
import styles from './PlatformPanels.module.css';

/** The windows the console reads. Kept as a tuple so the type and the control cannot disagree. */
export const PLATFORM_WINDOWS: readonly PlatformWindowDays[] = [7, 30, 90] as const;

export interface WindowSelectorProps {
  /** The window currently on screen. */
  value: PlatformWindowDays;
  /** Called with the newly chosen window. The caller re-fetches. */
  onChange: (days: PlatformWindowDays) => void;
  /** Disables the control while a request is in flight. */
  disabled?: boolean;
}

/**
 * The reporting-window control.
 *
 * A segmented control rather than a dropdown: there are exactly three choices, they are ordered,
 * and an operator switches between them constantly — hiding three options behind a click to save
 * 90px of header is the wrong trade. Mantine renders it as a radio group, so arrow keys move
 * between windows and the current one is announced as checked.
 *
 * Every window is a whole number of days ending now; the API decides the boundaries and echoes them
 * back in `window.start`/`window.end`, so the console never computes a date range of its own.
 *
 * @param props - {@link WindowSelectorProps}
 * @returns The window picker.
 */
export function WindowSelector({
  value,
  onChange,
  disabled = false,
}: WindowSelectorProps): React.ReactElement {
  return (
    <div className={styles.windowSelector}>
      <span className={styles.windowLabel} id="platform-window-label">
        Window
      </span>
      <SegmentedControl
        size="xs"
        value={String(value)}
        onChange={(next) => onChange(Number(next) as PlatformWindowDays)}
        disabled={disabled}
        aria-labelledby="platform-window-label"
        data={PLATFORM_WINDOWS.map((days) => ({
          value: String(days),
          label: `${days} days`,
        }))}
      />
    </div>
  );
}
