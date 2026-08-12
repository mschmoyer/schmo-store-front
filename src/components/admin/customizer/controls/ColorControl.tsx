'use client';

/**
 * Colour control: a real eyedropper-capable swatch plus a hex field.
 *
 * A colour field whose schema default is the empty string is treated as
 * *optional* — the merchant can hand the choice back to the engine, which is
 * how `brand.colorOnBrand` gets its "Auto" affordance without this component
 * knowing that field exists.
 *
 * Invalid hex is never pushed upstream: the text field keeps whatever is being
 * typed, and only a value the engine can do maths on is committed. That stops a
 * half-typed `#1a` from repainting the preview to black.
 */

import * as React from 'react';

import { Input } from '@/components/ui';
import { isHexColor } from '@/lib/storefront-theme';

import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * Normalise a value into something `<input type="color">` accepts.
 * @param value - The current colour
 * @returns A 6-digit hex
 */
function swatchValue(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
  return '#000000';
}

/**
 * Swatch plus hex entry.
 * @param props - {@link SettingControlProps}
 * @returns A labelled colour control
 */
export function ColorControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const committed = typeof value === 'string' ? value : '';
  const optional = field.default === '';
  const [draft, setDraft] = React.useState(committed);

  // Follow the model when it changes underneath us (undo, preset switch, a
  // one-click contrast fix) but never fight the merchant mid-keystroke.
  React.useEffect(() => {
    setDraft(committed);
  }, [committed]);

  /**
   * Accept typed hex, committing only once it is parseable.
   * @param next - The raw text
   */
  const onType = (next: string): void => {
    const withHash = next.startsWith('#') || next === '' ? next : `#${next}`;
    setDraft(withHash);
    if (isHexColor(withHash)) onChange(withHash);
    // An empty optional colour is *removed* from the patch rather than saved as
    // an empty string: `hexColorSchema` rejects '' and the API would 400.
    else if (withHash === '' && optional) onChange(undefined);
  };

  const empty = committed === '';

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${controlId}-hex`}>
        {field.label}
      </label>
      <div className={styles.colorRow}>
        <span
          className={styles.swatchWrap}
          style={empty ? undefined : { background: committed }}
        >
          <input
            className={styles.swatchInput}
            type="color"
            value={swatchValue(empty ? '#ffffff' : committed)}
            disabled={disabled}
            aria-label={`${field.label} colour picker`}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              onChange(event.currentTarget.value);
            }}
          />
        </span>
        <div className={styles.hexInput}>
          <Input
            id={`${controlId}-hex`}
            value={draft}
            mono
            size="sm"
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
            placeholder={optional ? 'Auto' : '#000000'}
            aria-label={`${field.label} hex value`}
            error={draft !== '' && !isHexColor(draft) ? 'Not a hex colour yet' : undefined}
            onChange={(event) => onType(event.currentTarget.value)}
          />
        </div>
      </div>

      {optional ? (
        // The auto affordance carries this field's explanation, so the generic
        // help line is not repeated underneath it.
        <div className={styles.autoRow}>
          <span className={styles.help}>
            {empty
              ? (field.help ?? 'Chosen automatically so it always stays readable.')
              : 'Pinned by hand. The automatic choice is always readable.'}
          </span>
          {empty ? null : (
            <button type="button" className={styles.linkButton} onClick={() => onChange(undefined)}>
              Back to auto
            </button>
          )}
        </div>
      ) : field.help ? (
        <span className={styles.help}>{field.help}</span>
      ) : null}
      {notice}
    </div>
  );
}
