/**
 * The contract every schema-generated control implements.
 *
 * A control receives the engine's `SettingField` descriptor and a value, and
 * reports changes back. It knows nothing about which section it belongs to, so
 * the same components serve section settings and theme settings alike.
 */

import type * as React from 'react';

import type { SettingField } from '@/lib/storefront-theme';

export interface SettingControlProps {
  /** The field descriptor straight out of `SECTION_REGISTRY`. */
  field: SettingField;
  /** Current value. May be `undefined` before the merchant has touched it. */
  value: unknown;
  /**
   * Report a new value.
   * @param value - The new value for this field
   */
  onChange: (value: unknown) => void;
  /** Stable DOM id prefix, so labels and controls stay associated. */
  controlId: string;
  /** Rendered under the control — contrast findings, validation notes. */
  notice?: React.ReactNode;
  /** Disables the control while a destructive operation is in flight. */
  disabled?: boolean;
}

/** A control component. */
export type SettingControlComponent = React.ComponentType<SettingControlProps>;
