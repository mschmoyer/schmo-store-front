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
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';

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
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setBroken(false);
  }, [url]);

  /**
   * Upload a chosen file through the media library and set its stored URL.
   *
   * On a store with no image storage configured the endpoint returns 503; this
   * shows an honest inline message and leaves the URL box usable, rather than
   * pretending an upload happened.
   *
   * @param event - The file input change
   */
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const token = localStorage.getItem('admin_token');
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/admin/media', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const result = await response.json().catch(() => null);
      if (response.status === 503) {
        setUploadError('Uploads are not set up for this store yet — paste an image URL below instead.');
        return;
      }
      if (!response.ok || !result?.success) {
        setUploadError(result?.error ?? 'That image could not be uploaded.');
        return;
      }
      onChange(result.data.url);
    } catch {
      setUploadError('That image could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

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

      <div className={styles.imageUploadRow}>
        <button
          type="button"
          className={styles.uploadButton}
          onClick={() => fileInput.current?.click()}
          disabled={disabled || uploading}
        >
          <IconUpload size={14} aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
          aria-label={`Upload ${field.label}`}
        />
      </div>
      {uploadError ? (
        <p className={styles.uploadHint} role="status">
          {uploadError}
        </p>
      ) : null}

      <Input
        id={controlId}
        label={field.label}
        hint={field.help ?? 'Upload an image above, or paste an image URL (https).'}
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
