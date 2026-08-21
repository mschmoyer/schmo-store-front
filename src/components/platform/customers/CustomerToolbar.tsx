'use client';

/**
 * Search, filter and page size for the merchant list.
 *
 * The search box holds its own draft state and pushes to the URL on a debounce.
 * Driving the input directly from the query string makes every keystroke a
 * navigation and a request; the catalogue screen shipped that bug and fired
 * roughly two requests per character typed. The debounce writes with `replace`
 * so a search does not leave one history entry per letter between the operator
 * and the page they came from.
 */

import React, { useEffect, useState } from 'react';
import { Group, Select, TextInput } from '@mantine/core';
import { IconFilter, IconSearch } from '@tabler/icons-react';
import { CUSTOMER_FILTERS, PAGE_SIZES } from './useCustomerParams';
import type { CustomerFilterKey } from './types';
import styles from './customerToolbar.module.css';

export interface CustomerToolbarProps {
  /** The search term currently in the URL. */
  query: string;
  /** The filter currently in the URL. */
  filter: CustomerFilterKey;
  /** The page size currently in the URL. */
  pageSize: number;
  /** Write a debounced search term to the URL. */
  onQueryChange: (value: string) => void;
  /** Write a filter to the URL. */
  onFilterChange: (value: CustomerFilterKey) => void;
  /** Write a page size to the URL. */
  onPageSizeChange: (value: number) => void;
  /** Debounce for the search box, in ms. @default 300 */
  debounceMs?: number;
}

/**
 * The list's control bar.
 *
 * @param props - {@link CustomerToolbarProps}
 * @returns The search, filter and page-size controls.
 */
export function CustomerToolbar({
  query,
  filter,
  pageSize,
  onQueryChange,
  onFilterChange,
  onPageSizeChange,
  debounceMs = 300,
}: CustomerToolbarProps): React.ReactElement {
  const [draft, setDraft] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);

  /* Re-sync when the URL changes underneath the box — the Back button and the
     "clear filters" action both do that, and an input that keeps showing a
     search term the list is no longer applying is worse than no box at all.
     This is React's "adjust state during render" pattern rather than an
     effect: an effect would paint the stale term for one frame first, and the
     lint rule that forbids it is right about the cascading render. */
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setDraft(query);
  }

  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => onQueryChange(draft.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, query, onQueryChange, debounceMs]);

  return (
    <div className={styles.root}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <TextInput
          className={styles.search}
          label="Search"
          placeholder="Store name, slug, owner name or email"
          leftSection={<IconSearch size={16} />}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          size="sm"
        />

        <Group gap="sm" wrap="wrap" align="flex-end">
          <Select
            className={styles.filter}
            label="Show"
            leftSection={<IconFilter size={16} />}
            data={CUSTOMER_FILTERS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={filter}
            onChange={(value) => onFilterChange((value ?? 'all') as CustomerFilterKey)}
            allowDeselect={false}
            size="sm"
          />

          <Select
            className={styles.pageSize}
            label="Per page"
            data={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value) || 25)}
            allowDeselect={false}
            size="sm"
          />
        </Group>
      </Group>
    </div>
  );
}
