'use client';

/**
 * Numeric range control.
 *
 * A slider alone is imprecise and a number alone is slow, so this is both,
 * wired to the same value. The slider is a native `<input type="range">`, which
 * is keyboard-complete for free (arrows, Home/End, PageUp/PageDown).
 */

import * as React from 'react';

import { clamp } from '@/lib/storefront-theme';

import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * Read a numeric setting, falling back to the field default.
 * @param value - The raw value
 * @param fallback - The field's default
 * @returns A finite number
 */
export function asNumber(value: unknown, fallback: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && value !== '' && value !== null) return parsed;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
}

/**
 * Slider plus number entry.
 * @param props - {@link SettingControlProps}
 * @returns A labelled range control
 */
export function RangeControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const current = clamp(asNumber(value, field.default), min, max);

  /**
   * Clamp and publish a candidate value.
   * @param next - The raw candidate
   */
  const commit = (next: number): void => {
    if (!Number.isFinite(next)) return;
    onChange(clamp(next, min, max));
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {field.label}
      </label>
      <div className={styles.rangeRow}>
        <input
          id={controlId}
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          aria-describedby={field.help ? `${controlId}-help` : undefined}
          onChange={(event) => commit(Number(event.currentTarget.value))}
        />
        <input
          className={styles.rangeValue}
          type="number"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          aria-label={`${field.label} value`}
          onChange={(event) => commit(Number(event.currentTarget.value))}
        />
      </div>
      {field.help ? (
        <span className={styles.help} id={`${controlId}-help`}>
          {field.help}
        </span>
      ) : null}
      {notice}
    </div>
  );
}
