'use client';

/**
 * Renders a list of {@link ThemeFieldDescriptor}s.
 *
 * Structurally identical to the section settings form: look up a control by
 * field type, hand it a value and a change handler. The only additions are the
 * dotted path each field writes to, the numeric coercion a `<select>` needs,
 * and the contrast findings that attach to a specific path.
 */

import * as React from 'react';

import { SETTING_CONTROLS } from '../controls/registry';
import { SegmentedControl } from '../controls/SegmentedControl';
import { ContrastNoticeList } from '../controls/ContrastNotice';
import type { ContrastFinding } from '../contrast/findings';
import { findingsForPath } from '../contrast/findings';
import { getIn } from '../state/reducer';
import type { ThemeFieldDescriptor } from './themeSchema';
import controlStyles from '../controls/controls.module.css';

export interface ThemeFieldsPanelProps {
  fields: ThemeFieldDescriptor[];
  /** The working theme patch. */
  theme: Record<string, unknown>;
  /** The resolved theme, used so a control shows the effective value. */
  resolved: Record<string, unknown>;
  /**
   * Write a value to a dotted theme path.
   * @param path - Dotted path
   * @param value - New value
   */
  onChange: (path: string, value: unknown) => void;
  findings: ContrastFinding[];
  /**
   * Apply a suggested contrast fix.
   * @param fix - The path and value to write
   */
  onApplyFix: (fix: { path: string; value: string | null }) => void;
  disabled?: boolean;
}

/**
 * A generated theme settings panel.
 * @param props - {@link ThemeFieldsPanelProps}
 * @returns One control per descriptor
 */
export function ThemeFieldsPanel({
  fields,
  theme,
  resolved,
  onChange,
  findings,
  onApplyFix,
  disabled,
}: ThemeFieldsPanelProps): React.ReactElement {
  return (
    <div className={controlStyles.field} style={{ gap: 16 }}>
      {fields.map((descriptor) => {
        const Control =
          descriptor.segmented && descriptor.field.type === 'select'
            ? SegmentedControl
            : SETTING_CONTROLS[descriptor.field.type];

        // Show the merchant the value their shop actually uses: the resolved
        // theme, which already has the preset merged in. `colorOnBrand` is the
        // exception — it is optional, so an empty patch value must stay empty
        // or the control could never show "Auto".
        const patched = getIn(theme, descriptor.path);
        const optional = descriptor.field.default === '';
        const effective = optional ? patched : (patched ?? getIn(resolved, descriptor.path));

        const attached = findingsForPath(findings, descriptor.path);

        return (
          <Control
            key={descriptor.path}
            field={descriptor.field}
            value={effective ?? descriptor.field.default}
            controlId={`theme-${descriptor.path.replace(/\./g, '-')}`}
            disabled={disabled}
            notice={
              attached.length > 0 ? (
                <ContrastNoticeList findings={attached} onApplyFix={onApplyFix} />
              ) : undefined
            }
            onChange={(value) =>
              onChange(descriptor.path, descriptor.coerce ? descriptor.coerce(value) : value)
            }
          />
        );
      })}
    </div>
  );
}
