'use client';

/**
 * One section's settings, generated entirely from its registry schema.
 *
 * There is no per-type branch here and there is no per-type file anywhere.
 * `SECTION_REGISTRY[section.type].settingsSchema` goes in, a working form comes
 * out — which is the whole point of spec section 8.
 */

import * as React from 'react';
import { IconCopy, IconEye, IconEyeOff, IconTrash } from '@tabler/icons-react';

import { Button } from '@/components/ui';
import { getSectionDefinition, type Section } from '@/lib/storefront-theme';

import { SettingsForm } from '../controls/SettingsForm';
import styles from '../Customizer.module.css';

export interface SectionSettingsPanelProps {
  section: Section;
  /**
   * Change one setting.
   * @param fieldId - The schema field id
   * @param value - Its new value
   */
  onChange: (fieldId: string, value: unknown) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canDuplicate: boolean;
}

/**
 * The settings panel for one section.
 * @param props - {@link SectionSettingsPanelProps}
 * @returns A generated settings form plus the section's own actions
 */
export function SectionSettingsPanel({
  section,
  onChange,
  onToggle,
  onDuplicate,
  onRemove,
  canDuplicate,
}: SectionSettingsPanelProps): React.ReactElement {
  const definition = getSectionDefinition(section.type);

  if (!definition) {
    return (
      <div className={styles.railGroup}>
        <p className={styles.railHint}>
          This section has type <code>{section.type}</code>, which this version of the customizer
          does not recognise. It will not be rendered on your storefront. Remove it, or update and
          reload.
        </p>
        <Button variant="destructive" size="sm" onClick={onRemove}>
          Remove this section
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.railGroup}>
        <p className={styles.railHint}>{definition.description}</p>
        {!section.enabled ? (
          <p className={styles.railHint} style={{ color: 'var(--warning-text)' }}>
            This section is hidden, so it will not appear on your live storefront.
          </p>
        ) : null}
      </div>

      <div className={styles.railGroup}>
        <SettingsForm
          schema={definition.settingsSchema}
          values={section.settings}
          idPrefix={`section-${section.id}`}
          onChange={onChange}
        />
      </div>

      <div className={styles.railGroup}>
        <span className={styles.railLabel}>This section</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              section.enabled ? (
                <IconEyeOff size={14} aria-hidden="true" />
              ) : (
                <IconEye size={14} aria-hidden="true" />
              )
            }
            onClick={onToggle}
          >
            {section.enabled ? 'Hide' : 'Show'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canDuplicate}
            leftIcon={<IconCopy size={14} aria-hidden="true" />}
            onClick={onDuplicate}
          >
            Duplicate
          </Button>
          <Button
            variant="destructive"
            size="sm"
            leftIcon={<IconTrash size={14} aria-hidden="true" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
    </>
  );
}
