'use client';

/**
 * Segmented choice: a select rendered as a row of buttons.
 *
 * Used for the short theme enums — corners, density, button style — where
 * seeing all the options at once is the point. It implements the same
 * {@link SettingControlProps} contract as every other control, so the theme
 * panels can swap between it and a dropdown without a special case.
 *
 * Each option is a real `<button>` with `aria-pressed`, so it is reachable and
 * operable by keyboard with no extra wiring.
 */

import * as React from 'react';

import { asText } from './BasicControls';
import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * A row of mutually exclusive choices.
 * @param props - {@link SettingControlProps}
 * @returns A labelled segmented control
 */
export function SegmentedControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const options = field.options ?? [];
  const current = asText(value, field.default);
  // Four short options fit one row; anything longer wraps rather than squashes.
  const wraps = options.length > 4 || options.some((option) => option.label.length > 12);

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${controlId}-label`}>
        {field.label}
      </span>
      <div
        className={wraps ? styles.segmentedWrap : styles.segmented}
        role="group"
        aria-labelledby={`${controlId}-label`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.segment}
            aria-pressed={option.value === current}
            disabled={disabled}
            style={wraps ? { flex: '0 0 auto' } : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {field.help ? <span className={styles.help}>{field.help}</span> : null}
      {notice}
    </div>
  );
}
