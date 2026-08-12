'use client';

/**
 * The preset gallery.
 *
 * Thumbnails are drawn from each preset's own `thumbnail` block by the shared
 * `PresetThumbnail` component, so the six previews differ structurally — header
 * layout, corner radius, button treatment, card ratio — rather than being one
 * rectangle in six colours.
 *
 * Switching preset discards the merchant's theme overrides, so it always asks
 * first when there is something to lose. Sections and custom CSS survive.
 */

import * as React from 'react';
import { IconCheck } from '@tabler/icons-react';

import PresetThumbnail from '@/components/onboarding/PresetThumbnail';
import { PRESET_LIST } from '@/lib/storefront-theme';

import styles from '../Customizer.module.css';

export interface PresetPanelProps {
  /** The preset the working draft is forked from. */
  currentPreset: string;
  /** True when the merchant has theme overrides a switch would discard. */
  hasOverrides: boolean;
  /**
   * Ask to switch preset.
   * @param presetId - The chosen preset
   */
  onChoose: (presetId: string) => void;
}

/**
 * A gallery of the shipped presets.
 * @param props - {@link PresetPanelProps}
 * @returns The preset picker
 */
export function PresetPanel({
  currentPreset,
  hasOverrides,
  onChoose,
}: PresetPanelProps): React.ReactElement {
  return (
    <div className={styles.railGroup}>
      <p className={styles.railHint}>
        A preset is a complete starting point — type, colour, spacing and layout together. Every
        setting stays editable afterwards.
        {hasOverrides ? ' Switching will replace the changes you have made.' : ''}
      </p>

      <div className={styles.presetGrid}>
        {PRESET_LIST.map((preset) => {
          const active = preset.id === currentPreset;
          return (
            <button
              key={preset.id}
              type="button"
              className={`${styles.presetCard} ${active ? styles.presetCardActive : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onChoose(preset.id)}
            >
              <span className={styles.presetThumb}>
                <PresetThumbnail thumbnail={preset.thumbnail} name={preset.name} />
              </span>
              <span className={styles.presetMeta}>
                <span className={styles.presetName}>
                  {preset.name}
                  {active ? (
                    <IconCheck size={13} aria-label="Current preset" color="var(--accent)" />
                  ) : null}
                </span>
                <span className={styles.presetRegister}>{preset.register}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
