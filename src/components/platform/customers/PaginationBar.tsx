'use client';

/**
 * "Showing 26–50 of 312", with the pager beside it.
 *
 * The range is not decoration. Without it a pager tells an operator which page
 * they are on but not how much of the set they have seen, and the two most
 * common questions on a list screen — "is this everything?" and "how far in am
 * I?" — both need the range rather than the page number. It is rendered as a
 * live region so a screen-reader user hears the new range when they page,
 * rather than silently landing on twenty-five unannounced rows.
 */

import React from 'react';
import { Group, Pagination } from '@mantine/core';
import type { PlatformPagination } from './types';
import styles from './paginationBar.module.css';

export interface PaginationBarProps {
  /** The pagination envelope from the API. */
  pagination: PlatformPagination;
  /** Called with the requested page. */
  onPageChange: (page: number) => void;
  /** What is being counted, plural. @default 'results' */
  noun?: string;
}

/**
 * Renders the result range and the pager.
 *
 * @param props - {@link PaginationBarProps}
 * @returns The pagination footer, or just the range when there is one page.
 */
export function PaginationBar({
  pagination,
  onPageChange,
  noun = 'results',
}: PaginationBarProps): React.ReactElement | null {
  const { page, pageSize, total, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm" className={styles.root}>
      <p className={styles.range} role="status" aria-live="polite">
        Showing <strong>{first.toLocaleString('en-US')}</strong>–
        <strong>{last.toLocaleString('en-US')}</strong> of{' '}
        <strong>{total.toLocaleString('en-US')}</strong> {noun}
      </p>

      {totalPages > 1 ? (
        <Pagination
          value={page}
          total={totalPages}
          onChange={onPageChange}
          size="sm"
          withEdges
          aria-label={`${noun} pagination`}
        />
      ) : null}
    </Group>
  );
}
