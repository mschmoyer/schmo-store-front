'use client';

/**
 * Font picker with real previews.
 *
 * Each row is set in the family it offers, using the engine's `fontStack(id)`
 * and each font's own `previewText`. Picking a font is then a decision about
 * what it looks like rather than about a name in a dropdown.
 *
 * The `--st-font-*` custom properties those stacks resolve through belong to the
 * merchant's storefront, so they are confined to the preview elements
 * themselves: `fontScopeClassName` is applied to the sample text and nowhere
 * else. The customizer's own chrome never inherits a merchant token.
 */

import * as React from 'react';

import { FONTS_BY_CATEGORY, fontStack, type FontCategory, type FontId } from '@/lib/storefront-theme';

import styles from '../controls/controls.module.css';

const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  mono: 'Monospace',
};

const CATEGORY_ORDER: FontCategory[] = ['sans', 'serif', 'display', 'mono'];

export interface FontPickerProps {
  label: string;
  value: FontId;
  /**
   * Report the chosen font.
   * @param id - The chosen font id
   */
  onChange: (id: FontId) => void;
  /**
   * Class that brings the storefront `--st-font-*` variables into scope.
   * Applied only to the sample text.
   */
  fontScopeClassName?: string;
  /** Overrides the per-font sample copy — used to preview the merchant's own headline. */
  sampleText?: string;
}

/**
 * A grouped, previewing font picker.
 * @param props - {@link FontPickerProps}
 * @returns A labelled list of font choices
 */
export function FontPicker({
  label,
  value,
  onChange,
  fontScopeClassName,
  sampleText,
}: FontPickerProps): React.ReactElement {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.fontList}>
        {CATEGORY_ORDER.map((category) => (
          <React.Fragment key={category}>
            <span className={styles.fontCardCategory} style={{ marginTop: 4 }}>
              {CATEGORY_LABELS[category]}
            </span>
            {FONTS_BY_CATEGORY[category].map((font) => (
              <button
                key={font.id}
                type="button"
                className={`${styles.fontCard} ${font.id === value ? styles.fontCardActive : ''}`}
                aria-pressed={font.id === value}
                onClick={() => onChange(font.id)}
              >
                <span className={styles.fontCardTop}>
                  <span className={styles.fontCardName}>{font.label}</span>
                </span>
                <span
                  className={`${styles.fontSample} ${fontScopeClassName ?? ''}`}
                  style={{ fontFamily: fontStack(font.id) }}
                >
                  {sampleText?.trim() || font.previewText}
                </span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
