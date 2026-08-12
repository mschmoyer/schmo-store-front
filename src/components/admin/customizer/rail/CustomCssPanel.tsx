'use client';

/**
 * Custom CSS panel.
 *
 * Merchant CSS is hostile input (spec section 7) and the engine's
 * `sanitizeCustomCss` is the boundary that makes it safe. Running it here too —
 * against the same scope selector the storefront will use — means the merchant
 * finds out *while typing* that their `@import` was dropped, instead of
 * wondering later why their font never loaded.
 *
 * This is a preview of the server's decision, not a substitute for it: the
 * authoritative sanitize still happens in `themeToStyleSheet` at render time.
 */

import * as React from 'react';
import { IconAlertTriangle, IconShieldCheck } from '@tabler/icons-react';

import { Textarea } from '@/components/ui';
import {
  MAX_CUSTOM_CSS_LENGTH,
  sanitizeCustomCss,
  storefrontScope,
} from '@/lib/storefront-theme';

import styles from '../Customizer.module.css';
import controlStyles from '../controls/controls.module.css';

export interface CustomCssPanelProps {
  value: string;
  /**
   * Report new CSS.
   * @param css - The raw merchant CSS
   */
  onChange: (css: string) => void;
  /** Scopes the sanitizer preview exactly as the storefront will. */
  storeId: string;
}

/**
 * A code field with a character counter and the sanitizer's findings.
 * @param props - {@link CustomCssPanelProps}
 * @returns The custom CSS panel
 */
export function CustomCssPanel({
  value,
  onChange,
  storeId,
}: CustomCssPanelProps): React.ReactElement {
  const result = React.useMemo(
    () => sanitizeCustomCss(value, storefrontScope(storeId)),
    [value, storeId],
  );

  const length = value.length;
  const over = length > MAX_CUSTOM_CSS_LENGTH;
  const warnings = result.warnings;

  return (
    <div className={styles.railGroup}>
      <p className={styles.railHint}>
        Scoped to your storefront automatically, so you cannot accidentally restyle the admin. Every
        rule is sanitised before it ships: <code>@import</code>, remote <code>url()</code>,{' '}
        <code>expression()</code> and <code>!important</code> are stripped.
      </p>

      <Textarea
        label="CSS"
        value={value}
        rows={16}
        spellCheck={false}
        className={controlStyles.codeArea}
        error={over ? `Over the ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()} character limit` : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />

      <div className={controlStyles.fieldRow}>
        <span className={controlStyles.help}>
          {result.truncated ? 'Truncated to fit the limit.' : 'Applies to your storefront only.'}
        </span>
        <span
          className={`${controlStyles.counter} ${over ? controlStyles.counterOver : ''}`}
          aria-live="polite"
        >
          {length.toLocaleString()} / {MAX_CUSTOM_CSS_LENGTH.toLocaleString()}
        </span>
      </div>

      {warnings.length > 0 ? (
        <div className={`${controlStyles.finding} ${controlStyles.findingAdjusted}`} role="status">
          <IconAlertTriangle size={15} className={controlStyles.findingIcon} aria-hidden="true" />
          <div className={controlStyles.findingBody}>
            <span className={controlStyles.findingTitle}>
              {warnings.length === 1 ? 'One rule was changed' : `${warnings.length} rules were changed`}
            </span>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {warnings.slice(0, 12).map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            {warnings.length > 12 ? <span>…and {warnings.length - 12} more.</span> : null}
          </div>
        </div>
      ) : value.trim() !== '' ? (
        <div className={controlStyles.finding} style={{ borderColor: 'var(--success-border)', background: 'var(--success-subtle)', color: 'var(--success-text)' }} role="status">
          <IconShieldCheck size={15} className={controlStyles.findingIcon} aria-hidden="true" />
          <div className={controlStyles.findingBody}>
            <span className={controlStyles.findingTitle}>Every rule survived sanitising</span>
            <span>Your CSS will ship exactly as written, scoped to your shop.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
