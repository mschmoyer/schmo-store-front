'use client';

/**
 * A timestamp shown the way an operator reads it.
 *
 * The visible text is relative ("9 days ago"), because that is the fact being
 * used — a merchant whose ShipStation sync last succeeded nine days ago is a
 * problem, and nobody works that out from "12 Aug 2026" without first
 * remembering today's date. The absolute timestamp is one hover away in the
 * `title` and, more importantly, in `dateTime`, so it is machine-readable and
 * survives being copied into a ticket.
 */

import React from 'react';
import { formatDateTime, formatRelative, NOT_SET, parseDate } from './format';

export interface RelativeDateProps {
  /** ISO 8601 timestamp, or nullish when the event never happened. */
  value: string | null | undefined;
  /** What to render when `value` is absent. @default '—' */
  fallback?: string;
  /** Adds the absolute date as a second line under the relative one. */
  withAbsolute?: boolean;
  /** Class applied to the wrapper. */
  className?: string;
}

/**
 * Renders a timestamp as relative text with the absolute value attached.
 *
 * @param props - {@link RelativeDateProps}
 * @returns A `<time>` element, or the fallback text when there is no date.
 */
export function RelativeDate({
  value,
  fallback = NOT_SET,
  withAbsolute = false,
  className,
}: RelativeDateProps): React.ReactElement {
  const date = parseDate(value);
  if (!date) return <span className={className}>{fallback}</span>;

  const absolute = formatDateTime(value);

  return (
    <time className={className} dateTime={date.toISOString()} title={absolute}>
      {formatRelative(value)}
      {withAbsolute ? ` · ${absolute}` : null}
    </time>
  );
}
