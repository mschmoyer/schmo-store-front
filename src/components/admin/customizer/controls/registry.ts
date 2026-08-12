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

import type { SettingField, SettingFieldType } from '@/lib/storefront-theme';

import { SelectControl, TextControl, TextareaControl, ToggleControl } from './BasicControls';
import { CollectionControl, ProductListControl } from './CatalogControls';
import { ColorControl } from './ColorControl';
import { DateControl } from './DateControl';
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
 * Field ids that hold an instant rather than free text.
 *
 * This list is a **shim, and should be deleted.** `SettingFieldType` has no
 * `'datetime'` member, so the countdown's `endsAt` is declared as `'text'` in
 * `sections.ts` and the schema has no way to say "this is a moment in time".
 * The correct fix is one entry in `SETTING_FIELD_TYPES` and one more line in
 * {@link SETTING_CONTROLS}; until that lands, matching on the id is the only
 * way to give the merchant a date picker instead of asking them to hand-type
 * RFC 3339. It is one line of data and still no per-section branching.
 */
const DATETIME_FIELD_IDS: ReadonlySet<string> = new Set(['endsAt']);

/**
 * Resolve the control for a field.
 *
 * Two refinements on top of the plain map:
 *
 *  - a `textarea` field whose value (or schema default) is an array is a
 *    repeating list, not a paragraph. Several shipped sections declare their
 *    items that way, and a JSON blob in a textarea is not an editing
 *    experience. The list editor infers its item shape from the data, so this
 *    stays schema-driven;
 *  - a `text` field named in {@link DATETIME_FIELD_IDS} is an instant and gets
 *    a real date-and-time picker.
 *
 * @param field - The schema field descriptor
 * @param value - The current value, used to detect list-shaped textareas
 * @returns The component to render
 */
export function controlFor(field: SettingField, value: unknown): SettingControlComponent {
  const { type, default: defaultValue } = field;

  if (
    type === 'textarea' &&
    (Array.isArray(value) || (value === undefined && Array.isArray(defaultValue)))
  ) {
    return ListControl;
  }
  if (type === 'text' && DATETIME_FIELD_IDS.has(field.id)) {
    return DateControl;
  }
  return SETTING_CONTROLS[type];
}
