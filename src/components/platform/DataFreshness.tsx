'use client';

/**
 * How old the numbers on screen are.
 *
 * Every console screen has a Refresh button and, until now, nothing that said how stale the reading
 * it would replace actually is. That combination is worse than neither: a button that re-fetches
 * implies the data might be old, and then leaves the reader to guess by how much. An operator
 * deciding whether four orders are still stuck needs to know whether they are looking at a reading
 * from ten seconds ago or from the tab they left open on Friday.
 *
 * The relative phrase is the fact being used ("3 minutes ago"); the absolute instant is on the
 * `<time>` element's `dateTime` and `title`, so it survives being copied into a ticket. The line
 * re-renders on a timer rather than only on fetch, because the interesting case is precisely the
 * tab nobody has touched — a static "just now" that is forty minutes old is the bug this component
 * exists to prevent.
 *
 * Nothing renders until a fetch has settled. A timestamp computed at first paint would be the time
 * the *page* opened, which is not when the numbers were read.
 */

import React, { useEffect, useState } from 'react';
import { IconClockHour4 } from '@tabler/icons-react';
import styles from './PlatformPanels.module.css';

/** How often the relative phrase is recomputed. A minute is the resolution the phrase has. */
const TICK_MS = 30_000;

export interface DataFreshnessProps {
  /** `Date.now()` at the moment the last successful response settled, or `null` before then. */
  fetchedAt: number | null;
  /** What was read, in the operator's words. e.g. `platform overview`. */
  label: string;
  /** True while a refetch is in flight, so the line can say so instead of ageing silently. */
  refreshing?: boolean;
}

/**
 * Turns an elapsed millisecond count into the phrase an operator reads.
 *
 * @param elapsedMs - Milliseconds since the reading was taken. Negative values (a clock that moved
 *   backwards) are treated as zero rather than rendered as a time in the future.
 * @returns e.g. `just now`, `4 minutes ago`, `2 hours ago`.
 */
export function describeAge(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Renders the "as of" line for a screen or a panel.
 *
 * @param props - {@link DataFreshnessProps}
 * @returns The freshness line, or `null` when no reading has been taken yet.
 */
export function DataFreshness({
  fetchedAt,
  label,
  refreshing = false,
}: DataFreshnessProps): React.ReactElement | null {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (fetchedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [fetchedAt]);

  if (fetchedAt === null) return null;

  const stamp = new Date(fetchedAt);
  const absolute = stamp.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <p className={styles.freshness}>
      <IconClockHour4 size={13} stroke={1.8} aria-hidden="true" />
      <span>
        {label} read{' '}
        <time dateTime={stamp.toISOString()} title={absolute}>
          {describeAge(now - fetchedAt)}
        </time>
        {refreshing ? ' · refreshing' : ''}
      </span>
    </p>
  );
}
