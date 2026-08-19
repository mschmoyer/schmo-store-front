'use client';

/**
 * The draft-status indicator.
 *
 * A merchant must never have to wonder whether their work is safe, so this has
 * a distinct treatment for every state — colour, a dot, and words — and it is
 * an `aria-live` region so the answer reaches a screen reader too.
 */

import * as React from 'react';

import styles from '../Customizer.module.css';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SaveStatusProps {
  state: SaveState;
  /** Epoch milliseconds of the last successful save. */
  lastSavedAt: number | null;
}

/**
 * Format a save time as something a person reads at a glance.
 * @param at - Epoch milliseconds
 * @param now - Current time, injected so this is testable
 * @returns A short relative phrase
 */
export function formatSavedAt(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

const COPY: Record<SaveState, { label: string; className: string; pulse: boolean }> = {
  idle: { label: 'Draft', className: styles.statusSaved, pulse: false },
  dirty: { label: 'Unsaved changes', className: styles.statusDirty, pulse: true },
  saving: { label: 'Saving…', className: styles.statusSaving, pulse: true },
  saved: { label: 'Draft saved', className: styles.statusSaved, pulse: false },
  error: { label: 'Could not save', className: styles.statusError, pulse: true },
};

/**
 * The status pill.
 * @param props - {@link SaveStatusProps}
 * @returns A live-updating status indicator
 */
export function SaveStatus({ state, lastSavedAt }: SaveStatusProps): React.ReactElement {
  /*
   * The clock is held in state rather than read with `Date.now()` while
   * rendering. Reading it during render makes the output depend on *when*
   * React happens to re-render, so an unrelated parent update would silently
   * change the label; the interval below is now the only thing that advances
   * it, which is also the granularity this indicator was always designed for.
   */
  const [now, setNow] = React.useState(() => Date.now());
  const copy = COPY[state];

  // Keep "saved 2m ago" honest without a per-second re-render of the tree.
  React.useEffect(() => {
    if (state !== 'saved' || lastSavedAt === null) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, [state, lastSavedAt]);

  const suffix =
    state === 'saved' && lastSavedAt !== null ? ` · ${formatSavedAt(lastSavedAt, now)}` : '';

  return (
    <span className={`${styles.status} ${copy.className}`} role="status" aria-live="polite">
      <span
        className={`${styles.statusDot} ${copy.pulse ? styles.statusDotPulse : ''}`}
        aria-hidden="true"
      />
      {copy.label}
      {suffix}
    </span>
  );
}
