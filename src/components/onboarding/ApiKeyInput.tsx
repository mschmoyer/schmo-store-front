'use client';

import * as React from 'react';
import { Input } from '@/components/ui';
import styles from './Onboarding.module.css';

export interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
}

/** Eye / eye-off marks for the reveal toggle. */
function EyeIcon({ off }: { off: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M1.4 8S3.9 3.6 8 3.6 14.6 8 14.6 8 12.1 12.4 8 12.4 1.4 8 1.4 8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      {off ? <path d="M2.6 2.6l10.8 10.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /> : null}
    </svg>
  );
}

/**
 * The ShipStation API key field.
 *
 * Masked by default — a merchant is often pasting this on a shared screen — with
 * an explicit reveal toggle and a Paste button for browsers that grant clipboard
 * read. Pasted values are trimmed and stripped of line breaks, because the value
 * copied out of ShipStation's dashboard frequently arrives with one attached and
 * "invalid key" is a miserable way to discover that.
 *
 * The key is never rendered back from the server: once saved, the merchant sees
 * only the masked tail (audit P0-1 — never show credentials the server does not
 * hold).
 *
 * @param props - {@link ApiKeyInputProps}
 * @returns The API key field
 */
export default function ApiKeyInput({
  value,
  onChange,
  error,
  disabled = false,
  label = 'ShipStation API key',
  hint,
  autoFocus = false,
}: ApiKeyInputProps): React.ReactElement {
  const [revealed, setRevealed] = React.useState(false);
  const [pasteNote, setPasteNote] = React.useState<string | null>(null);

  const clean = (raw: string) => raw.replace(/[\r\n\t]/g, '').trim();

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(clean(text));
        setPasteNote('Pasted from clipboard');
        setTimeout(() => setPasteNote(null), 2500);
      }
    } catch {
      setPasteNote('Your browser blocked clipboard access — paste with ⌘V');
      setTimeout(() => setPasteNote(null), 4000);
    }
  };

  return (
    <Input
      label={label}
      type={revealed ? 'text' : 'password'}
      mono
      required
      autoFocus={autoFocus}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      value={value}
      error={error}
      hint={pasteNote ?? hint}
      onChange={(event) => onChange(clean(event.target.value))}
      onPaste={(event) => {
        event.preventDefault();
        onChange(clean(event.clipboardData.getData('text')));
      }}
      rightSection={
        <span className={styles.keyActions}>
          <button
            type="button"
            className={styles.keyButton}
            onClick={handlePaste}
            disabled={disabled}
          >
            Paste
          </button>
          <button
            type="button"
            className={styles.keyButton}
            onClick={() => setRevealed((current) => !current)}
            disabled={disabled}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide API key' : 'Show API key'}
          >
            <EyeIcon off={revealed} />
          </button>
        </span>
      }
    />
  );
}
