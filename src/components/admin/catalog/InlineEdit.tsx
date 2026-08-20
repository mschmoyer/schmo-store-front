'use client';

/**
 * Click a cell, type, press Enter.
 *
 * Changing one price used to be: click the row, wait for a detail fetch, find the Details tab,
 * scroll to the Pricing card, click the field, type, scroll to the bottom, save, navigate back —
 * and lose your filter and your scroll position on the way. Eight-plus interactions and two page
 * loads, per SKU. For a merchant repricing forty products before a sale that is most of an
 * afternoon.
 *
 * The interaction contract is the one every spreadsheet has trained people to expect, because
 * fighting that expectation is how a grid feels wrong without anyone being able to say why:
 *
 *   Enter    commit and move to the same column one row down
 *   Tab      commit and move to the next editable cell
 *   Escape   revert and stop editing
 *   blur     commit
 *
 * The write is optimistic. A merchant editing a column of prices should never wait on a round trip
 * between one cell and the next; the cell shows the new value immediately, and reverts with an
 * explanation if the server disagrees. That reversion is the part that makes optimism honest.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './InlineEdit.module.css';

export interface InlineEditProps {
  /** The stored value. `null` renders as the placeholder rather than as zero. */
  value: number | string | null;
  /** How the value is displayed when not being edited. */
  render: (value: number | string | null) => React.ReactNode;
  /**
   * Commit a new value. Throwing (or rejecting) reverts the cell and surfaces the message.
   *
   * @param next - The parsed value, or null when the field was cleared.
   */
  onCommit: (next: number | string | null) => Promise<void>;
  /** `number` parses and validates; `text` passes through. @default 'number' */
  type?: 'number' | 'text';
  /** Shown when the value is null. */
  placeholder?: string;
  /** Accessible name, since the cell has no visible label. */
  label: string;
  /** Prevents editing, with a reason shown on hover. */
  disabled?: boolean;
  disabledReason?: string;
  /** Smallest accepted value for a number. @default 0 */
  min?: number;
  /** Move focus to the same column in the next row. Wired by the table. */
  onMoveDown?: () => void;
  /** Right-aligns, for numeric columns. */
  numeric?: boolean;
  /**
   * Rendered as `data-cell` on the cell button, so the grid can move focus down a column.
   *
   * The catalogue page was passing `data-cell="price"` as a prop this component did not accept, so
   * it landed nowhere — and `focusCell` then had nothing to query, which is why Enter left focus on
   * `<body>` instead of the next row.
   */
  cellKey?: string;
  /** Marks the cell as carrying a merchant override the sync will not touch. */
  locked?: boolean;
}

/**
 * An editable table cell.
 *
 * @param props - {@link InlineEditProps}
 * @returns The cell, in display or edit mode.
 */
export function InlineEdit({
  value,
  render,
  onCommit,
  type = 'number',
  placeholder = '—',
  label,
  disabled = false,
  disabledReason,
  min = 0,
  onMoveDown,
  numeric = true,
  locked = false,
  cellKey
}: InlineEditProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  /* So Escape can put focus back where it was. Without it the input unmounts and focus lands on
   * `<body>`, which for a keyboard user means starting again from the top of the page. */
  const buttonRef = useRef<HTMLButtonElement>(null);
  /* Set when the cell should return focus to itself after leaving edit mode. */
  const restoreFocus = useRef(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The value shown while a save is in flight, so the cell reflects the merchant's intent
   * immediately and only falls back to `value` if the save fails. */
  const [optimistic, setOptimistic] = useState<number | string | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  /* Set when Escape ran, so the blur that follows does not then commit the reverted draft. */
  const cancelled = useRef(false);

  const shown = optimistic !== undefined ? optimistic : value;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const begin = useCallback(() => {
    if (disabled) return;
    cancelled.current = false;
    setError(null);
    setDraft(shown === null || shown === undefined ? '' : String(shown));
    setEditing(true);
  }, [disabled, shown]);

  const commit = useCallback(
    async (thenMoveDown = false) => {
      if (cancelled.current) {
        cancelled.current = false;
        return;
      }

      const trimmed = draft.trim();
      let next: number | string | null;

      if (trimmed === '') {
        next = null;
      } else if (type === 'number') {
        const parsed = Number(trimmed.replace(/[^0-9.\-]/g, ''));
        if (!Number.isFinite(parsed) || parsed < min) {
          setError(`Enter a number of ${min} or more`);
          return;
        }
        next = parsed;
      } else {
        next = trimmed;
      }

      setEditing(false);

      /*
       * Nothing changed: do not spend a request, and do not flash a saving state — but still leave
       * edit mode and still move down.
       *
       * Returning outright meant pressing Enter on a cell you had looked at and not altered left
       * the editor open and focus stranded, so tabbing down a column of prices broke the moment one
       * of them was already right.
       */
      if (next === shown || (next === null && shown === null)) {
        setEditing(false);
        if (thenMoveDown) {
          requestAnimationFrame(() => onMoveDown?.());
        } else {
          restoreFocus.current = true;
        }
        return;
      }

      setOptimistic(next);
      setSaving(true);
      try {
        await onCommit(next);
        setError(null);
      } catch (caught) {
        /* The revert is what keeps the optimism honest: the cell goes back to what the server
         * still holds, and says why. */
        setOptimistic(undefined);
        setError(caught instanceof Error ? caught.message : 'Could not save');
      } finally {
        setSaving(false);
        /*
         * After the browser has painted, so the next row's cell button exists to receive focus.
         * Calling it synchronously here focused nothing — React had not yet re-rendered the row
         * being left, let alone the one being moved to — and the keyboard user landed on `<body>`.
         */
        if (thenMoveDown) requestAnimationFrame(() => onMoveDown?.());
      }
    },
    [draft, min, onCommit, onMoveDown, shown, type]
  );

  /* Once the server confirms, the stored value and the optimistic one agree and the override is
   * dropped, so later external updates (a sync, another tab) are reflected again. */
  useEffect(() => {
    if (optimistic !== undefined && optimistic === value) setOptimistic(undefined);
  }, [optimistic, value]);

  /*
   * Put focus back on the cell after Escape.
   *
   * Run after the button has rendered, not inside the key handler, because at that moment the
   * input is still mounted and the button does not exist to receive focus.
   */
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className={[
          styles.cell,
          numeric ? styles.numeric : '',
          disabled ? styles.disabled : '',
          saving ? styles.saving : '',
          error ? styles.errored : ''
        ]
          .filter(Boolean)
          .join(' ')}
        ref={buttonRef}
        data-cell={cellKey}
        onClick={begin}
        /*
         * Deliberately no `onFocus` handler.
         *
         * There was one, opening the editor as soon as the cell took focus, so that a keyboard user
         * "moved down a column the way a mouse user clicks down it". The effect was the opposite:
         * tabbing across the grid swapped every price and cost cell into an input, which is a
         * change of context on focus (WCAG 3.2.1, Level A) and made it impossible to traverse the
         * grid without entering edit mode on each numeric column. This is a `<button>`, so Enter and
         * Space already open it — the keyboard path exists without hijacking focus.
         */
        disabled={disabled && !disabledReason}
        /* `aria-disabled` rather than `disabled` when there is a reason to convey: a genuinely
         * disabled button is removed from the tab order, so the reason could never be read. */
        aria-disabled={disabled || undefined}
        aria-label={
          disabled && disabledReason
            ? `${label}. ${disabledReason}`
            : error
              ? `${label}: ${error}. Select to try again.`
              : `${label}. Select to edit.`
        }
        title={disabled ? disabledReason : undefined}
      >
        <span className={styles.value}>
          {shown === null || shown === undefined ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            render(shown)
          )}
        </span>
        {locked && (
          <span className={styles.lock} title="You have edited this — ShipStation will not overwrite it">
            <span aria-hidden="true">✓</span>
            {/* The tick's meaning was in a `title` attribute, which is hover-only: a keyboard or
                screen-reader user got a bare checkmark with no explanation of what it marked. */}
            <span className={styles.srOnly}>Edited by you. ShipStation will not overwrite it.</span>
          </span>
        )}
        {/* The error is text, not a colour: a red cell alone says something is wrong but not
            what, and says nothing at all to a screen reader or to anyone who cannot see red.
            `role="status"` is what makes it *announced* — the optimistic value reverts silently
            otherwise, so a screen-reader user is left believing a save succeeded. */}
        {error && (
          <span className={styles.errorText} role="status" aria-live="polite">
            {error}
          </span>
        )}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className={`${styles.input} ${numeric ? styles.numeric : ''}`}
      value={draft}
      aria-label={label}
      inputMode={type === 'number' ? 'decimal' : undefined}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => void commit(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void commit(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelled.current = true;
          restoreFocus.current = true;
          setEditing(false);
          setError(null);
        } else if (event.key === 'Tab') {
          /* Let the browser move focus; the blur handler commits. Preventing default here would
           * trap focus in the cell, which is the classic inline-edit accessibility failure. */
          void commit(false);
        }
      }}
    />
  );
}
