'use client';

import React from 'react';
import { IconArrowNarrowDown, IconArrowNarrowRight, IconArrowNarrowUp } from '@tabler/icons-react';
import { formatPercentChange, readDelta, type MetricPolarity } from './metricDelta';
import styles from './PlatformPanels.module.css';

export interface MetricDeltaProps {
  /** The figure for the selected window. */
  current: number;
  /**
   * The figure for the window immediately before it.
   *
   * `null` or `undefined` means **the baseline was never computed** — the API does not send one
   * for this metric, or this deployment predates the field. `0` means **the baseline was computed
   * and it was zero**. Those are different facts and they get different sentences; see the
   * component note.
   */
  previous: number | null | undefined;
  /** Which direction is an improvement. @default 'up-is-good' */
  polarity?: MetricPolarity;
  /**
   * Whether the preceding window was actually observed.
   *
   * The overview's `comparison.measured` flag. A zero baseline means two different things and the
   * difference is not recoverable from the number: the platform traded through that period and
   * recorded nothing, or the platform did not exist yet. `undefined` means the API did not say, and
   * the component then declines to claim either.
   */
  baselineMeasured?: boolean;
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
 * ## Two silences, two sentences
 *
 * This component used to print one line — "No previous 30 days to compare against" — for two
 * unrelated situations, and one of them was false. A metric whose baseline the API never computed
 * and a metric whose baseline was genuinely zero both landed on a sentence claiming the previous
 * period did not exist. It did exist; on the overview's shipped-orders card it had shipments in it.
 * On a console whose entire proposition is that its numbers are honest, that is not a wording nit:
 *
 * - **Not computed** — `previous` is nullish. The console has no baseline, and says exactly that.
 * - **Zero baseline, measured** — `previous` is `0` and `baselineMeasured` is true. The period is
 *   real, it was observed, and it was empty, so a percentage would be a division by zero rather
 *   than a missing fact.
 * - **No history** — `previous` is `0` and `baselineMeasured` is false. The platform did not exist
 *   for that period, which is the *only* situation the old sentence actually described.
 *
 * @param props - {@link MetricDeltaProps}
 * @returns The delta line, sized for `StatCard`'s `meta` slot.
 */
export function MetricDelta({
  current,
  previous,
  polarity = 'up-is-good',
  baselineMeasured,
  periodLabel,
}: MetricDeltaProps): React.ReactElement {
  if (previous === null || previous === undefined) {
    return (
      <span className={styles.deltaMuted}>Not compared — no {periodLabel} baseline computed</span>
    );
  }

  const { pct, direction, tone } = readDelta(current, previous, polarity);

  if (pct === null) {
    return (
      <span className={styles.deltaMuted}>
        {baselineMeasured === false
          ? `No ${periodLabel} — the platform did not exist yet`
          : `The ${periodLabel} measured zero, so there is no percentage`}
      </span>
    );
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
