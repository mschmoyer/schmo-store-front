'use client';

/**
 * A table header that sorts.
 *
 * Sorting used to live in a `<Select>` and a lone toggle button at the far right of the filter bar,
 * separated from the columns they sorted. Every merchant clicks the column heading first, because
 * that is what a table does — and nothing happened. There was also no `aria-sort` anywhere, so a
 * screen-reader user had no way to know which column was sorted or in which direction.
 *
 * The whole header is a button rather than a heading with a button inside it: the click target is
 * the label plus its indicator, which at a table's font size is otherwise a very small target.
 */

import React from 'react';
import { Table } from '@mantine/core';
import { IconArrowNarrowDown, IconArrowNarrowUp, IconArrowsSort } from '@tabler/icons-react';
import styles from './SortableTh.module.css';

export interface SortableThProps {
  /** The sort key this column maps to, as the API understands it. */
  column: string;
  /** The visible label. */
  children: React.ReactNode;
  /** The column currently sorted by. */
  activeColumn: string;
  /** The active direction. */
  direction: 'asc' | 'desc';
  /** Called with this column when the header is activated. */
  onSort: (column: string, numeric: boolean) => void;
  /** Right-aligns the header and makes a first click sort high→low. */
  numeric?: boolean;
  /** A short explanation shown as a title, for columns whose meaning is not obvious. */
  hint?: string;
  /** Column width, so the layout does not reflow as values change. */
  width?: number | string;
}

/**
 * A sortable column header with a correct `aria-sort`.
 *
 * @param props - {@link SortableThProps}
 * @returns A `<th>` whose contents are a sort control.
 */
export function SortableTh({
  column,
  children,
  activeColumn,
  direction,
  onSort,
  numeric = false,
  hint,
  width
}: SortableThProps): React.ReactElement {
  const isActive = activeColumn === column;

  return (
    <Table.Th
      /* `aria-sort` belongs on the header cell, not the button, and must be `none` rather than
       * absent on the columns that are sortable but not currently sorted — that is what tells a
       * screen reader the whole row is sortable. */
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={numeric ? styles.numericHead : undefined}
      style={width ? { width } : undefined}
    >
      <button
        type="button"
        className={`${styles.button} ${isActive ? styles.active : ''}`}
        onClick={() => onSort(column, numeric)}
        title={hint}
      >
        <span>{children}</span>
        <span className={styles.indicator} aria-hidden="true">
          {isActive ? (
            direction === 'asc' ? (
              <IconArrowNarrowUp size={14} />
            ) : (
              <IconArrowNarrowDown size={14} />
            )
          ) : (
            /* Shown at low opacity on hover only, so every sortable column advertises itself
             * without the header row becoming a wall of icons. */
            <IconArrowsSort size={14} />
          )}
        </span>
      </button>
    </Table.Th>
  );
}
