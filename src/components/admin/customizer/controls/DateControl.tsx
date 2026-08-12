'use client';

/**
 * A real date-and-time picker for settings that hold an instant.
 *
 * The countdown section's "Ends at" used to be a bare text input whose help
 * read *"ISO date and time, e.g. 2026-12-24T23:59:00Z"*. Asking a merchant to
 * hand-type an RFC 3339 timestamp — and to do the UTC conversion in their head
 * — is not a control, it is a format error waiting to happen. Worse, the
 * section ships with "hide when the timer runs out" on, so an empty or
 * mistyped deadline makes the whole band vanish with nothing said about why.
 *
 * The stored value stays exactly what the storefront renderer expects: an ISO
 * 8601 string in UTC. Only the editing surface changes — `datetime-local`
 * speaks the merchant's own clock, and the resolved UTC instant is echoed back
 * underneath so there is no ambiguity about which one was meant.
 */

import * as React from 'react';

import { Input } from '@/components/ui';

import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * Turn a stored ISO instant into the `YYYY-MM-DDTHH:mm` a `datetime-local`
 * input wants, expressed in the viewer's own timezone.
 *
 * @param iso - Stored value; anything unparseable yields an empty field
 * @returns A local datetime string, or `''`
 */
export function isoToLocalInput(iso: unknown): string {
  if (typeof iso !== 'string' || iso.trim() === '') return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

/**
 * Turn what the input reports back into a stored UTC instant.
 *
 * @param local - `YYYY-MM-DDTHH:mm` in the viewer's timezone
 * @returns An ISO 8601 UTC string, or `''` when the field was cleared
 */
export function localInputToIso(local: string): string {
  if (!local) return '';
  const parsed = new Date(local);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

/**
 * A date-and-time setting.
 * @param props - {@link SettingControlProps}
 * @returns A labelled datetime input
 */
export function DateControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const local = isoToLocalInput(value);
  const instant = local ? new Date(local) : null;
  const past = instant !== null && instant.getTime() <= Date.now();

  return (
    <div className={styles.field}>
      <Input
        id={controlId}
        type="datetime-local"
        label={field.label}
        hint={field.help}
        value={local}
        disabled={disabled}
        size="sm"
        onChange={(event) => onChange(localInputToIso(event.currentTarget.value))}
      />
      <span className={styles.help} data-testid={`${controlId}-resolved`}>
        {local === ''
          ? 'No deadline set — the countdown will not appear on your storefront until there is one.'
          : past
            ? `That time has already passed (${instant?.toISOString()}). The countdown will hide itself.`
            : `Saved as ${instant?.toISOString()} — your local time, converted to UTC.`}
      </span>
      {notice}
    </div>
  );
}
