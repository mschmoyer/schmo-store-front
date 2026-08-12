'use client';

/**
 * Image control.
 *
 * There is no media library in the product yet, so this takes a URL or a store
 * path and — importantly — *shows it*, so a typo is visible here rather than
 * discovered on the live shop. When an upload endpoint lands, only this file
 * changes.
 */

import * as React from 'react';
import { IconPhoto, IconX } from '@tabler/icons-react';

import { Input } from '@/components/ui';

import { asText } from './BasicControls';
import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * URL entry with a live thumbnail.
 * @param props - {@link SettingControlProps}
 * @returns A labelled image field
 */
export function ImageControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const url = asText(value);
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => {
    setBroken(false);
  }, [url]);

  return (
    <div className={styles.field}>
      <div className={styles.imagePreview}>
        {url && !broken ? (
          // A merchant-supplied URL on any host: next/image cannot serve it
          // without a config change we do not own, so this stays a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" onError={() => setBroken(true)} />
        ) : (
          <span>
            <IconPhoto size={18} style={{ verticalAlign: '-4px', marginRight: 6 }} aria-hidden="true" />
            {url ? 'That image did not load' : 'No image yet'}
          </span>
        )}
      </div>

      <Input
        id={controlId}
        label={field.label}
        hint={field.help ?? 'Paste an image URL, or a path such as /uploads/hero.jpg'}
        value={url}
        size="sm"
        spellCheck={false}
        disabled={disabled}
        placeholder="https://…"
        rightSection={
          url ? (
            <button
              type="button"
              className={styles.tinyButton}
              aria-label={`Clear ${field.label}`}
              onClick={() => onChange('')}
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          ) : undefined
        }
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {notice}
    </div>
  );
}
