'use client';

/**
 * The four controls that are a thin wrapper over a RebelShops primitive:
 * `text`, `select`, `toggle` and the plain-string case of `textarea`.
 *
 * Everything here is driven entirely by the `SettingField` descriptor. No
 * control knows which section it is editing.
 */

import * as React from 'react';

import { Input, Select, Switch, Textarea } from '@/components/ui';

import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * Coerce an unknown setting value to a string for a text control.
 * @param value - The raw value
 * @param fallback - Used when the value is absent
 * @returns A string safe to put in an input
 */
export function asText(value: unknown, fallback: unknown = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === undefined || value === null) {
    return typeof fallback === 'string' ? fallback : '';
  }
  return '';
}

/**
 * Single-line text field.
 * @param props - {@link SettingControlProps}
 * @returns A labelled text input
 */
export function TextControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  return (
    <div className={styles.field}>
      <Input
        id={controlId}
        label={field.label}
        hint={field.help}
        value={asText(value)}
        disabled={disabled}
        size="sm"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {notice}
    </div>
  );
}

/**
 * Multi-line text field.
 * @param props - {@link SettingControlProps}
 * @returns A labelled textarea
 */
export function TextareaControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  return (
    <div className={styles.field}>
      <Textarea
        id={controlId}
        label={field.label}
        hint={field.help}
        value={asText(value)}
        rows={4}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {notice}
    </div>
  );
}

/**
 * Dropdown backed by the field's `options`.
 * @param props - {@link SettingControlProps}
 * @returns A labelled select
 */
export function SelectControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const options = field.options ?? [];
  return (
    <div className={styles.field}>
      <Select
        id={controlId}
        label={field.label}
        hint={field.help}
        value={asText(value, field.default)}
        options={options}
        size="sm"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {notice}
    </div>
  );
}

/**
 * On/off switch. Applies immediately, which is why it is a Switch and not a
 * Checkbox (design system section 5).
 * @param props - {@link SettingControlProps}
 * @returns A labelled switch row
 */
export function ToggleControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const checked = typeof value === 'boolean' ? value : Boolean(field.default);
  return (
    <div className={styles.field}>
      <Switch
        id={controlId}
        label={field.label}
        hint={field.help}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {notice}
    </div>
  );
}
