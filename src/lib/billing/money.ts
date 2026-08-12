/**
 * Money helpers.
 *
 * Rule for this codebase: **every arithmetic operation on money happens in integer cents.**
 * Decimal strings from Postgres `NUMERIC(10,2)` are converted at the boundary, and converted back
 * only when writing to the database or rendering.
 */

/**
 * Convert a database/JSON money value to integer cents.
 *
 * @param value - A number, numeric string, or nullish value.
 * @returns The amount in cents, rounded half-up. Nullish and non-finite input yields `0`.
 */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100);
}

/**
 * Convert integer cents to a fixed 2-decimal string suitable for a `NUMERIC(10,2)` column.
 *
 * @param cents - Amount in cents.
 * @returns A string such as `"19.99"`.
 */
export function centsToDecimalString(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/**
 * Convert integer cents to a JavaScript number of major units.
 *
 * @param cents - Amount in cents.
 * @returns The amount as a number, e.g. `19.99`.
 */
export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Format integer cents for display.
 *
 * @param cents - Amount in cents.
 * @param currency - ISO-4217 currency code.
 * @returns A localized currency string.
 */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(centsToNumber(cents));
}

/**
 * Clamp a cent amount into an inclusive range.
 *
 * @param cents - Amount in cents.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped amount.
 */
export function clampCents(cents: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(cents), min), max);
}
