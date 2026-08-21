'use client';

/**
 * A sortable column header for the customers table.
 *
 * The admin catalogue already has a `SortableTh`, and this is deliberately not
 * it. Two things differ and both matter here. It emits `scope="col"`, which the
 * catalogue's version omits — without it a screen reader reading a cell in row
 * forty has no association back to the column that names it, and this table has
 * eleven columns of bare numbers where that association is the entire meaning.
 * And it participates in the sticky first column, which needs the header cell
 * to carry the same `position: sticky` treatment as the body cells beneath it.
 *
 * The whole header is one button rather than a heading containing a button: the
 * target is the label plus its indicator, which at table type size is otherwise
 * a very small thing to hit.
 */

import React from 'react';
import { Table } from '@mantine/core';
import { IconArrowNarrowDown, IconArrowNarrowUp, IconArrowsSort } from '@tabler/icons-react';
import type { CustomerSortKey, SortDirection } from './types';
import styles from './customersTable.module.css';

export interface SortableColumnProps {
  /** The sort key this column maps to, as the API understands it. */
  column: CustomerSortKey;
  /** The visible label. */
  children: React.ReactNode;
  /** The column currently sorted by. */
  activeColumn: CustomerSortKey;
  /** The active direction. */
  direction: SortDirection;
  /** Called with this column when the header is activated. */
  onSort: (column: CustomerSortKey, numeric: boolean) => void;
  /** Right-aligns the header and makes a first click sort high→low. */
  numeric?: boolean;
  /** A short explanation for columns whose meaning is not self-evident. */
  hint?: string;
  /** Pins the column to the left edge while the table scrolls horizontally. */
  sticky?: boolean;
}

/**
 * A `<th scope="col">` whose contents are a sort control with a correct `aria-sort`.
 *
 * @param props - {@link SortableColumnProps}
 * @returns The header cell.
 */
export function SortableColumn({
  column,
  children,
  activeColumn,
  direction,
  onSort,
  numeric = false,
  hint,
  sticky = false,
}: SortableColumnProps): React.ReactElement {
  const isActive = activeColumn === column;
  const classNames = [
    numeric ? styles.numericHead : '',
    sticky ? styles.stickyHead : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Table.Th
      scope="col"
      /* `aria-sort` belongs on the header cell, and must be `none` rather than
         absent on sortable-but-unsorted columns: that is the cue that tells a
         screen-reader user the whole header row is interactive. */
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={classNames || undefined}
    >
      <button
        type="button"
        className={`${styles.sortButton} ${isActive ? styles.sortActive : ''}`}
        onClick={() => onSort(column, numeric)}
        title={hint}
      >
        <span>{children}</span>
        <span className={styles.sortIndicator} aria-hidden="true">
          {isActive ? (
            direction === 'asc' ? (
              <IconArrowNarrowUp size={14} />
            ) : (
              <IconArrowNarrowDown size={14} />
            )
          ) : (
            <IconArrowsSort size={14} />
          )}
        </span>
      </button>
    </Table.Th>
  );
}
