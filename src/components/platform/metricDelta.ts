/**
 * Period-over-period arithmetic for the operator console.
 *
 * Pure, and separate from the component that draws it, because the two mistakes this file exists to
 * prevent are arithmetic mistakes rather than rendering ones:
 *
 * - **A zero baseline is not a 100% rise.** `(5 - 0) / 0` is `Infinity`, and a console that prints
 *   `+Infinity%` or quietly substitutes `+100%` has invented a fact. A window with no prior period
 *   to compare against reports `null`, and the UI says so in words.
 * - **Direction is not sentiment.** A fall in orders is bad and a fall in refunds is good. Polarity
 *   is therefore a property the caller declares per metric, never inferred from the sign.
 *
 * Money arrives here as integer cents and is compared as integer cents; the ratio is dimensionless,
 * so no conversion to dollars happens anywhere in the delta path.
 */

/** Which direction counts as an improvement for this metric. */
export type MetricPolarity = 'up-is-good' | 'down-is-good';

/** Which way the figure moved. */
export type MetricDirection = 'up' | 'down' | 'flat';

/** Whether the movement is good news, bad news, or neither. */
export type MetricTone = 'good' | 'bad' | 'neutral';

/** A movement, ready to render. */
export interface MetricDeltaReading {
  /** Signed percentage change, or `null` when there is no baseline to divide by. */
  pct: number | null;
  direction: MetricDirection;
  tone: MetricTone;
}

/**
 * Compares a window against the one before it.
 *
 * @param current - The figure for the current window.
 * @param previous - The figure for the immediately preceding window of equal length.
 * @param polarity - Which direction is an improvement for this metric. @default 'up-is-good'
 * @returns A {@link MetricDeltaReading}; `pct` is `null` when `previous` is zero or either input is
 *   not a finite number, which is the honest answer rather than an infinity.
 */
export function readDelta(
  current: number,
  previous: number,
  polarity: MetricPolarity = 'up-is-good'
): MetricDeltaReading {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { pct: null, direction: 'flat', tone: 'neutral' };
  }

  const difference = current - previous;
  const direction: MetricDirection = difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat';

  const tone: MetricTone =
    direction === 'flat'
      ? 'neutral'
      : (direction === 'up') === (polarity === 'up-is-good')
        ? 'good'
        : 'bad';

  if (previous === 0) {
    return { pct: null, direction, tone: 'neutral' };
  }

  return { pct: (difference / previous) * 100, direction, tone };
}

/**
 * Formats a percentage change with a typographic minus rather than a hyphen.
 *
 * @param pct - The signed percentage.
 * @returns A string such as `+12.4%` or `−3.0%`.
 */
export function formatPercentChange(pct: number): string {
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Formats a ratio of one step to the one before it.
 *
 * @param numerator - The later step.
 * @param denominator - The earlier step.
 * @returns The conversion as a percentage, or `null` when the earlier step is zero — an empty
 *   funnel must read as "no traffic yet", never as `NaN%`.
 */
export function conversionPct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

/**
 * Formats a percentage for display, with sensible precision at small magnitudes.
 *
 * @param pct - A percentage, or `null` when it could not be computed.
 * @returns A string such as `4.2%`, or an em dash when there is nothing to show.
 */
export function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
