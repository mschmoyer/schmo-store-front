/**
 * Display formatting for the customers console.
 *
 * Two rules are encoded here rather than left to each component.
 *
 * **Money never becomes a float in a component.** Every amount crossing this
 * boundary is integer cents; `centsToNumber` is the single conversion, and it
 * happens once, on the way into `Price`.
 *
 * **A date is shown the way the reader actually uses it.** An operator triaging
 * merchants cares that a sync failed *nine days ago*, not that it failed on 12
 * August — but they need the exact timestamp the moment they file a ticket
 * about it. So relative is the visible text and absolute is the `title`, which
 * is what {@link RelativeDate} renders.
 */

import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { centsToNumber, formatMoney } from '@/lib/billing/money';
import { formatDurationHours } from '../formatDuration';

/** An em dash, used for "this value does not exist" everywhere on these screens. */
export const NOT_SET = '—';

/**
 * Parses an ISO timestamp, tolerating the nulls the API is allowed to send.
 *
 * @param iso - An ISO 8601 timestamp, or nullish.
 * @returns A `Date`, or `null` when the input is absent or unparseable.
 */
export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The absolute date, as a person writes it.
 *
 * @param iso - An ISO 8601 timestamp, or nullish.
 * @returns e.g. `12 Aug 2026`, or an em dash.
 */
export function formatDate(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? format(date, 'd MMM yyyy') : NOT_SET;
}

/**
 * The absolute date down to the minute, for `title` attributes and audit-ish rows.
 *
 * @param iso - An ISO 8601 timestamp, or nullish.
 * @returns e.g. `12 Aug 2026, 14:07`, or an em dash.
 */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? format(date, "d MMM yyyy, HH:mm") : NOT_SET;
}

/**
 * How long ago something happened.
 *
 * @param iso - An ISO 8601 timestamp, or nullish.
 * @returns e.g. `9 days ago`, or an em dash.
 */
export function formatRelative(iso: string | null | undefined): string {
  const date = parseDate(iso);
  return date ? `${formatDistanceToNowStrict(date)} ago` : NOT_SET;
}

/**
 * A whole number with thousands separators.
 *
 * @param value - Any finite number; nullish and non-finite render as an em dash.
 * @returns e.g. `12,480`.
 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_SET;
  return value.toLocaleString('en-US');
}

/**
 * Integer cents as a number of major units, for handing to `Price`.
 *
 * @param cents - Amount in integer cents.
 * @returns The same amount in dollars.
 */
export function centsToPrice(cents: number | null | undefined): number {
  return centsToNumber(typeof cents === 'number' && Number.isFinite(cents) ? cents : 0);
}

/**
 * Integer cents as a compact currency string, for the qualifying lines that sit
 * under a `Price` and must not compete with it typographically.
 *
 * @param cents - Amount in integer cents.
 * @param currency - ISO-4217 code. @default 'USD'
 * @returns e.g. `$1,827.38`.
 */
export function formatCents(cents: number | null | undefined, currency = 'USD'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return NOT_SET;
  return formatMoney(cents, currency);
}

/**
 * A percentage, rounded to whole points.
 *
 * @param value - A percentage already expressed 0–100.
 * @returns e.g. `72%`, or an em dash.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_SET;
  return `${Math.round(value)}%`;
}

/**
 * A duration in hours, shown in the unit an operator reads it in.
 *
 * Under a day it is hours, because "18h" is the number a fulfilment SLA is
 * written in. Over a day it is days, because "76h" makes the reader do
 * arithmetic to learn that a merchant is three days behind.
 *
 * Delegates to the console-wide {@link formatDurationHours}. The rule used to
 * live here alone, and the overview screen — which cannot import from this
 * lane's barrel — grew its own `toFixed(1) + ' hours'`, so the same metric read
 * "33.6 hours" on one screen and "1.2 days" on the next. One definition, two
 * callers.
 *
 * @param hours - Mean hours, or `null` when nothing has shipped.
 * @returns e.g. `18.4h`, `3.2 days`, or an em dash.
 */
export function formatHours(hours: number | null | undefined): string {
  return formatDurationHours(hours);
}

/**
 * Turns an API enum (`in_progress`, `PENDING`) into a readable label.
 *
 * @param value - A snake_case or upper-case status, or nullish.
 * @param fallback - What to show when there is no status. @default '—'
 * @returns e.g. `In progress`.
 */
export function humanizeStatus(
  value: string | null | undefined,
  fallback: string = NOT_SET
): string {
  if (!value) return fallback;
  const spaced = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
