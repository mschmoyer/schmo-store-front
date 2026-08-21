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
 *
 * ## Two lines, one string
 *
 * Where both readings are shown — the merchant list's Joined column, the detail
 * header — the two used to be separate elements stacked by CSS. That renders
 * correctly and reads as `3 months ago17 May 2026`: a line break is a layout
 * fact, not a text one, so anything consuming the element's text got the two
 * values run together with no separator. The pair is now one `<time>` carrying
 * an explicit accessible name ("17 May 2026, 3 months ago"), with the two
 * visible lines marked decorative. One element, one announced string, and no
 * way for the visual and the spoken forms to disagree.
 */

import React from 'react';
import { formatDate, formatDateTime, formatRelative, NOT_SET, parseDate } from './format';
import styles from './relativeDate.module.css';

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

  const exact = formatDateTime(value);
  const relative = formatRelative(value);
  /* The visible second line is the calendar date only. The minute is still one hover away in
     `title` and machine-readable in `dateTime`; spending 45px of a fifteen-column table on "02:12"
     buys nothing an operator reads, and it was part of what pushed the last column off-screen. */
  const absolute = formatDate(value);

  if (!withAbsolute) {
    return (
      <time className={className} dateTime={date.toISOString()} title={exact}>
        {relative}
      </time>
    );
  }

  return (
    <time
      className={className ? `${styles.stack} ${className}` : styles.stack}
      dateTime={date.toISOString()}
      title={exact}
      aria-label={`${absolute}, ${relative}`}
    >
      <span aria-hidden="true">{relative}</span>
      <span className={styles.absolute} aria-hidden="true">
        {absolute}
      </span>
    </time>
  );
}
