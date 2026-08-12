/**
 * The one place a `SettingFieldType` becomes a React control.
 *
 * This map is exhaustive over the engine's `SETTING_FIELD_TYPES` — TypeScript
 * enforces that with `Record<SettingFieldType, …>`, and a unit test renders
 * every entry — so a new field type in the engine is a compile error here
 * rather than a blank space in the rail.
 *
 * There is no per-section branch anywhere in the customizer. A section's
 * editing UI is `settingsSchema.map(field => CONTROL[field.type])`, nothing more.
 */

import type { SettingFieldType } from '@/lib/storefront-theme';

import { SelectControl, TextControl, TextareaControl, ToggleControl } from './BasicControls';
import { CollectionControl, ProductListControl } from './CatalogControls';
import { ColorControl } from './ColorControl';
import { ImageControl } from './ImageControl';
import { ListControl } from './ListControl';
import { RangeControl } from './RangeControl';
import { RichTextControl } from './RichTextControl';
import type { SettingControlComponent } from './types';

/** Every control type the customizer can render, keyed by schema field type. */
export const SETTING_CONTROLS: Record<SettingFieldType, SettingControlComponent> = {
  text: TextControl,
  textarea: TextareaControl,
  richtext: RichTextControl,
  image: ImageControl,
  select: SelectControl,
  toggle: ToggleControl,
  range: RangeControl,
  color: ColorControl,
  collection: CollectionControl,
  'product-list': ProductListControl,
};

/**
 * Resolve the control for a field.
 *
 * One refinement on top of the plain map: a `textarea` field whose value (or
 * schema default) is an array is a repeating list, not a paragraph. Several
 * shipped sections declare their items that way, and a JSON blob in a textarea
 * is not an editing experience. The list editor infers its item shape from the
 * data, so this stays schema-driven.
 *
 * @param type - The schema field type
 * @param value - The current value, used to detect list-shaped textareas
 * @param defaultValue - The schema default, used when the value is absent
 * @returns The component to render
 */
export function controlFor(
  type: SettingFieldType,
  value: unknown,
  defaultValue: unknown,
): SettingControlComponent {
  if (type === 'textarea' && (Array.isArray(value) || (value === undefined && Array.isArray(defaultValue)))) {
    return ListControl;
  }
  return SETTING_CONTROLS[type];
}
