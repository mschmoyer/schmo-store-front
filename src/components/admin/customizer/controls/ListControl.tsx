'use client';

/**
 * Repeating-list control.
 *
 * Several section schemas declare a `textarea` field whose default is an array
 * of small objects — value props, testimonials, FAQ entries, logos. Rendering a
 * JSON blob in a textarea would technically satisfy the schema and would be
 * miserable to use, so the dispatcher routes array-valued fields here instead.
 *
 * The item shape is inferred from the schema default (falling back to the
 * current data), which keeps this generic: a new section type shipping a new
 * list of `{ label, url }` gets a working editor with no code here.
 *
 * A JSON escape hatch is always available, because inference cannot cover an
 * empty list of an unknown shape.
 */

import * as React from 'react';
import {
  IconArrowDown,
  IconArrowUp,
  IconCode,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import { Button, Input, Textarea } from '@/components/ui';

import { moveItem } from '../state/reducer';
import type { SettingControlProps } from './types';
import styles from './controls.module.css';

type ListItem = Record<string, unknown>;

/**
 * Read the value as an array of objects.
 * @param value - The raw setting value
 * @returns The array, or an empty one
 */
function asItems(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ListItem => typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

/**
 * Work out which keys an item of this list has.
 * @param items - The current items
 * @param fallback - The schema default
 * @returns Ordered key names, or an empty array when the shape is unknowable
 */
function inferKeys(items: ListItem[], fallback: unknown): string[] {
  const source = items.length > 0 ? items : asItems(fallback);
  const keys: string[] = [];
  for (const item of source) {
    for (const key of Object.keys(item)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Turn a key into a human label: `imageUrl` becomes `Image url`.
 * @param key - The object key
 * @returns A sentence-case label
 */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Build a blank item from the inferred shape.
 * @param keys - The item keys
 * @param template - An existing item to copy value types from
 * @returns A new empty item
 */
function blankItem(keys: string[], template: ListItem | undefined): ListItem {
  const item: ListItem = {};
  for (const key of keys) {
    const sample = template?.[key];
    item[key] = typeof sample === 'number' ? 0 : typeof sample === 'boolean' ? false : '';
  }
  return item;
}

/**
 * Editor for a list of small records.
 * @param props - {@link SettingControlProps}
 * @returns A labelled repeater
 */
export function ListControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const items = asItems(value);
  const keys = inferKeys(items, field.default);
  const [jsonMode, setJsonMode] = React.useState(keys.length === 0);
  const [jsonDraft, setJsonDraft] = React.useState(() => JSON.stringify(value ?? [], null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!jsonMode) setJsonDraft(JSON.stringify(value ?? [], null, 2));
  }, [value, jsonMode]);

  /**
   * Replace one field of one item.
   * @param index - Item position
   * @param key - Field key
   * @param next - New value
   */
  const setItemValue = (index: number, key: string, next: unknown): void => {
    const copy = items.map((item, i) => (i === index ? { ...item, [key]: next } : item));
    onChange(copy);
  };

  /**
   * Parse and commit the JSON escape hatch.
   * @param text - The raw JSON
   */
  const commitJson = (text: string): void => {
    setJsonDraft(text);
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setJsonError('This needs to be a list, so it must start with [ and end with ].');
        return;
      }
      setJsonError(null);
      onChange(parsed);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'That is not valid JSON.');
    }
  };

  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.label} id={`${controlId}-label`}>
          {field.label}
        </span>
        {keys.length > 0 ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setJsonMode((on) => !on)}
          >
            <IconCode size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true" />
            {jsonMode ? 'Use the editor' : 'Edit as JSON'}
          </button>
        ) : null}
      </div>

      {field.help ? <span className={styles.help}>{field.help}</span> : null}

      {jsonMode ? (
        <Textarea
          id={controlId}
          aria-labelledby={`${controlId}-label`}
          value={jsonDraft}
          rows={10}
          disabled={disabled}
          error={jsonError ?? undefined}
          className={styles.codeArea}
          spellCheck={false}
          onChange={(event) => commitJson(event.currentTarget.value)}
        />
      ) : (
        <>
          <ul className={styles.listItems} aria-labelledby={`${controlId}-label`}>
            {items.map((item, index) => (
              <li className={styles.listItem} key={index}>
                <div className={styles.listItemHead}>
                  <span className={styles.listItemTitle}>Item {index + 1}</span>
                  <span className={styles.listItemTools}>
                    <button
                      type="button"
                      className={styles.tinyButton}
                      aria-label={`Move item ${index + 1} up`}
                      disabled={disabled || index === 0}
                      onClick={() => onChange(moveItem(items, index, index - 1))}
                    >
                      <IconArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.tinyButton}
                      aria-label={`Move item ${index + 1} down`}
                      disabled={disabled || index === items.length - 1}
                      onClick={() => onChange(moveItem(items, index, index + 1))}
                    >
                      <IconArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.tinyButton} ${styles.tinyButtonDanger}`}
                      aria-label={`Remove item ${index + 1}`}
                      disabled={disabled}
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                    >
                      <IconTrash size={14} aria-hidden="true" />
                    </button>
                  </span>
                </div>

                {keys.map((key) => {
                  const raw = item[key];
                  const isNumber = typeof raw === 'number';
                  const asString = raw === undefined || raw === null ? '' : String(raw);
                  const long = !isNumber && asString.length > 60;

                  return long ? (
                    <Textarea
                      key={key}
                      label={humanize(key)}
                      value={asString}
                      rows={3}
                      disabled={disabled}
                      onChange={(event) => setItemValue(index, key, event.currentTarget.value)}
                    />
                  ) : (
                    <Input
                      key={key}
                      label={humanize(key)}
                      size="sm"
                      type={isNumber ? 'number' : 'text'}
                      value={asString}
                      disabled={disabled}
                      onChange={(event) =>
                        setItemValue(
                          index,
                          key,
                          isNumber ? Number(event.currentTarget.value) : event.currentTarget.value,
                        )
                      }
                    />
                  );
                })}
              </li>
            ))}
          </ul>

          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || keys.length === 0}
            leftIcon={<IconPlus size={14} aria-hidden="true" />}
            onClick={() => onChange([...items, blankItem(keys, items[0] ?? asItems(field.default)[0])])}
          >
            Add item
          </Button>
        </>
      )}
      {notice}
    </div>
  );
}
