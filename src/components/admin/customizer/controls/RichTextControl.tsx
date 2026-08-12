'use client';

/**
 * Rich text control.
 *
 * A textarea with a formatting toolbar that wraps the current selection. It
 * stays a plain string in the section settings — no editor state, no schema of
 * its own — because that string has to survive a JSONB round trip and be
 * rendered by a server component on the storefront.
 */

import * as React from 'react';

import { Textarea } from '@/components/ui';

import { asText } from './BasicControls';
import type { SettingControlProps } from './types';
import styles from './controls.module.css';

interface Wrapper {
  key: string;
  label: string;
  title: string;
  open: string;
  close: string;
}

const WRAPPERS: Wrapper[] = [
  { key: 'b', label: 'B', title: 'Bold', open: '<strong>', close: '</strong>' },
  { key: 'i', label: 'I', title: 'Italic', open: '<em>', close: '</em>' },
  { key: 'p', label: '¶', title: 'Paragraph', open: '<p>', close: '</p>' },
  { key: 'ul', label: '• List', title: 'List item', open: '<li>', close: '</li>' },
  { key: 'a', label: 'Link', title: 'Link', open: '<a href="/products">', close: '</a>' },
];

/**
 * Formatted body copy.
 * @param props - {@link SettingControlProps}
 * @returns A labelled rich-text editor
 */
export function RichTextControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const text = asText(value);

  /**
   * Wrap the current selection, or insert an empty pair at the caret.
   * @param wrapper - The tag pair to apply
   */
  const applyWrapper = (wrapper: Wrapper): void => {
    const node = ref.current;
    if (!node) return;
    const start = node.selectionStart ?? text.length;
    const end = node.selectionEnd ?? start;
    const selected = text.slice(start, end);
    const next = `${text.slice(0, start)}${wrapper.open}${selected}${wrapper.close}${text.slice(end)}`;
    onChange(next);

    // Put the caret back inside the tags so typing continues where expected.
    requestAnimationFrame(() => {
      node.focus();
      const caret = start + wrapper.open.length + selected.length;
      node.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {field.label}
      </label>
      <div>
        <div className={styles.richToolbar} role="group" aria-label={`${field.label} formatting`}>
          {WRAPPERS.map((wrapper) => (
            <button
              key={wrapper.key}
              type="button"
              className={styles.richButton}
              title={wrapper.title}
              aria-label={wrapper.title}
              disabled={disabled}
              onClick={() => applyWrapper(wrapper)}
            >
              {wrapper.label}
            </button>
          ))}
        </div>
        <Textarea
          ref={ref}
          id={controlId}
          value={text}
          rows={6}
          disabled={disabled}
          className={styles.richArea}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
      <span className={styles.help}>
        {field.help ?? 'Basic HTML is allowed: paragraphs, bold, italics and links.'}
      </span>
      {notice}
    </div>
  );
}
