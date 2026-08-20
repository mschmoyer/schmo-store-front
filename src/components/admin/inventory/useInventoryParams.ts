'use client';

/**
 * The inventory grid's view state, kept in the URL.
 *
 * Same reasoning as the catalogue's: a merchant who filters to "needs reordering, soonest stockout
 * first", opens a product to check it and comes back should find the list they left, and should be
 * able to send that list to whoever does the buying.
 *
 * It matters more here, because the views *are* the workflows. "What do I need to order this week"
 * is a filter, and a filter that cannot be linked to is a question you have to re-ask every time.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The saved views on the inventory grid.
 *
 * Each is a question a merchant actually asks, in the order they ask them. "Needs reordering" is
 * first among the exception views because it is the one that costs money to get wrong, and it is
 * deliberately net of what is already on order — telling someone to buy a pallet they ordered on
 * Monday is how a cash-constrained business ends up with two.
 */
export const INVENTORY_VIEWS = {
  all: { label: 'All stock', state: '' },
  needs_reorder: { label: 'Needs reordering', state: 'needs_reorder' },
  low_stock: { label: 'Low', state: 'low_stock' },
  out_of_stock: { label: 'Out', state: 'out_of_stock' },
  /* Only visible because the ledger stopped clamping negative balances. Before, an oversell left
   * no trace anywhere. */
  oversold: { label: 'Oversold', state: 'oversold' },
  incoming: { label: 'On order', state: 'incoming' },
  dead_stock: { label: 'Not selling', state: 'dead_stock' },
  uncosted: { label: 'No cost', state: 'uncosted' }
} as const;

export type InventoryViewKey = keyof typeof INVENTORY_VIEWS;

/** Everything the inventory grid reads out of the URL. */
export interface InventoryParams {
  view: InventoryViewKey;
  search: string;
  categoryId: string;
  supplierId: string;
  locationId: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

const FILTER_KEYS = ['search', 'category_id', 'supplier_id'] as const;

/**
 * Read the inventory grid's state from the URL and write changes back to it.
 *
 * @returns The current parameters and the setters that update them.
 */
export function useInventoryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo<InventoryParams>(() => {
    const view = (searchParams.get('view') ?? 'all') as InventoryViewKey;
    return {
      view: view in INVENTORY_VIEWS ? view : 'all',
      search: searchParams.get('search') ?? '',
      categoryId: searchParams.get('category_id') ?? '',
      supplierId: searchParams.get('supplier_id') ?? '',
      /* Location is not cleared when the view changes: it is a lens on the whole page, not a
       * filter within a view. A merchant working out of one warehouse stays in it. */
      locationId: searchParams.get('location_id') ?? '',
      sortBy: searchParams.get('sort_by') ?? 'days_of_cover',
      sortOrder: searchParams.get('sort_order') === 'desc' ? 'desc' : 'asc',
      page: Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1),
      limit: Math.min(250, Math.max(10, Number.parseInt(searchParams.get('limit') ?? '50', 10) || 50))
    };
  }, [searchParams]);

  const update = useCallback(
    (changes: Record<string, string | number | null | undefined>, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      /* Any change but paging returns to page one — page 7 of a three-page result renders empty,
       * which reads as "nothing here" rather than "you are past the end". */
      if (!('page' in changes)) next.delete('page');

      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setView = useCallback(
    (view: InventoryViewKey) => {
      update({ view: view === 'all' ? null : view, state: INVENTORY_VIEWS[view].state || null });
    },
    [update]
  );

  const toggleSort = useCallback(
    (column: string, numeric = false) => {
      if (params.sortBy === column) {
        update({ sort_by: column, sort_order: params.sortOrder === 'asc' ? 'desc' : 'asc' });
      } else {
        update({ sort_by: column, sort_order: numeric ? 'desc' : 'asc' });
      }
    },
    [params.sortBy, params.sortOrder, update]
  );

  const apiQuery = useMemo(() => {
    const query = new URLSearchParams();
    const state = INVENTORY_VIEWS[params.view].state;
    if (state) query.set('state', state);
    if (params.search) query.set('search', params.search);
    if (params.categoryId) query.set('category_id', params.categoryId);
    if (params.supplierId) query.set('supplier_id', params.supplierId);
    if (params.locationId) query.set('location_id', params.locationId);
    query.set('sort_by', params.sortBy);
    query.set('sort_order', params.sortOrder);
    query.set('page', String(params.page));
    query.set('limit', String(params.limit));
    return query.toString();
  }, [params]);

  const hasFilters = FILTER_KEYS.some((key) => Boolean(searchParams.get(key)));

  const clearFilters = useCallback(() => {
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }, [update]);

  return { params, update, setView, toggleSort, apiQuery, hasFilters, clearFilters };
}
