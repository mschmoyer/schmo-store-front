'use client';

import React from 'react';
import { IconArrowNarrowDown, IconArrowNarrowRight, IconArrowNarrowUp } from '@tabler/icons-react';
import { formatPercentChange, readDelta, type MetricPolarity } from './metricDelta';
import styles from './PlatformPanels.module.css';

export interface MetricDeltaProps {
  /** The figure for the selected window. */
  current: number;
  /** The figure for the window immediately before it, or `null` when the API does not supply one. */
  previous: number | null;
  /** Which direction is an improvement. @default 'up-is-good' */
  polarity?: MetricPolarity;
  /** What the comparison is against — "previous 30 days". Rendered in words. */
  periodLabel: string;
}

const ARROW = { size: 14, stroke: 2 } as const;

/**
 * One period-over-period movement, under a stat.
 *
 * Three carriers of meaning, deliberately: an **arrow** (direction), a **signed number** (size) and
 * a **sentence** (what the comparison is against). Tone tints the arrow and the figure, but removing
 * the colour removes nothing a reader needed — §7's rule that colour is never the sole signal.
 *
 * When there is no baseline the component says so rather than dividing by zero. That is the whole
 * reason it exists: a console that renders `+100%` for "we went from nothing to something" is
 * making a claim the data does not support.
 *
 * @param props - {@link MetricDeltaProps}
 * @returns The delta line, sized for `StatCard`'s `meta` slot.
 */
export function MetricDelta({
  current,
  previous,
  polarity = 'up-is-good',
  periodLabel,
}: MetricDeltaProps): React.ReactElement {
  if (previous === null) {
    return <span className={styles.deltaMuted}>No {periodLabel} to compare against</span>;
  }

  const { pct, direction, tone } = readDelta(current, previous, polarity);

  if (pct === null) {
    return <span className={styles.deltaMuted}>No {periodLabel} to compare against</span>;
  }

  const Arrow =
    direction === 'up' ? IconArrowNarrowUp : direction === 'down' ? IconArrowNarrowDown : IconArrowNarrowRight;

  return (
    <span className={styles.delta} data-tone={tone}>
      <Arrow {...ARROW} aria-hidden="true" />
      <span className={styles.deltaValue}>{formatPercentChange(pct)}</span>
      <span className={styles.deltaLabel}>vs {periodLabel}</span>
    </span>
  );
}
