/**
 * One definition of "how long did that take", shared by the whole operator console.
 *
 * The console shipped two. The overview rendered `avgHoursToShip` as `33.6 hours`; the merchant
 * detail screen rendered the same measurement through its own helper as `1.2 days`. Both were
 * arithmetically right and, side by side, they read as two different metrics — which is exactly the
 * failure mode a console is supposed to prevent. A reader should never have to work out that two
 * screens are quoting the same number in two units under two labels.
 *
 * The unit switch itself is deliberate and is the rule the customers lane had already settled on:
 * under a day, hours, because a fulfilment SLA is written in hours; over a day, days, because `76h`
 * makes the reader do arithmetic to learn that a merchant is three days behind.
 */

/** What a duration renders as when it was never measured. Matches the console's em dash. */
export const NO_DURATION = '—';

/**
 * Formats a duration given in hours, in the unit an operator reads it in.
 *
 * @param hours - The duration in hours, or `null`/`undefined` when nothing was measured. A metric
 *   with no observations must arrive here as `null`, never as `0`: `0.0h` is a claim of
 *   instantaneous fulfilment, and this console has shipped that kind of quiet lie before.
 * @returns e.g. `18.4h`, `1.4 days`, or an em dash when there is nothing to show.
 */
export function formatDurationHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return NO_DURATION;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Formats an age in hours as the coarse phrase an alert headline wants.
 *
 * Distinct from {@link formatDurationHours} because a backlog's age is read as "how long have these
 * customers been waiting", where a decimal point is noise: `88 days` is the sentence, `88.4 days`
 * is a measurement.
 *
 * @param hours - Age in hours, or `null` when there is no backlog to age.
 * @returns e.g. `19 hours`, `88 days`, or an em dash.
 */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return NO_DURATION;
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const whole = Math.round(hours);
  return `${whole} hour${whole === 1 ? '' : 's'}`;
}
