'use client';

/**
 * Renders a whole `SettingField[]` schema as a form.
 *
 * This is the only place section-editing UI is produced. Adding a section type
 * to `SECTION_REGISTRY` gives it a complete, correct settings panel here with
 * no further work — which is the requirement in spec section 8.
 */

import * as React from 'react';

import type { SettingField } from '@/lib/storefront-theme';

import { controlFor } from './registry';
import styles from './controls.module.css';

export interface SettingsFormProps {
  /** The schema to render. */
  schema: SettingField[];
  /** Current values, keyed by field id. */
  values: Record<string, unknown>;
  /**
   * Report a change.
   * @param fieldId - Which field changed
   * @param value - Its new value
   */
  onChange: (fieldId: string, value: unknown) => void;
  /** Prefix for generated DOM ids; must be unique on the page. */
  idPrefix: string;
  /** Extra content rendered under a given field, keyed by field id. */
  notices?: Record<string, React.ReactNode>;
  disabled?: boolean;
}

/**
 * A schema-generated settings form.
 * @param props - {@link SettingsFormProps}
 * @returns One control per schema field
 */
export function SettingsForm({
  schema,
  values,
  onChange,
  idPrefix,
  notices,
  disabled,
}: SettingsFormProps): React.ReactElement {
  return (
    <div className={styles.field} style={{ gap: 16 }}>
      {schema.map((field: SettingField) => {
        const value = values[field.id];
        const Control = controlFor(field.type, value, field.default);
        return (
          <Control
            key={field.id}
            field={field}
            value={value === undefined ? field.default : value}
            controlId={`${idPrefix}-${field.id}`}
            disabled={disabled}
            notice={notices?.[field.id]}
            onChange={(next) => onChange(field.id, next)}
          />
        );
      })}
    </div>
  );
}
