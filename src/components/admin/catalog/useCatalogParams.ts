'use client';

/**
 * The catalogue's view state, kept in the URL.
 *
 * Everything that decides what the grid shows — the view, the filters, the sort, the page — lives
 * in the query string rather than in component state. That single change fixes a cluster of
 * problems that were all really the same problem.
 *
 * A merchant who filtered to "out of stock, worst margin first", opened a product, fixed it and
 * pressed Back landed on page one of the unfiltered catalogue and had to rebuild the view from
 * memory. They could not bookmark a view, could not send "here are our 40 dead SKUs" to a
 * colleague, and could not be linked *into* a filtered view from anywhere else — which is why the
 * stat cards above the grid were inert numbers rather than doors.
 *
 * It also fixes a subtler bug. Filter state in a `useCallback` dependency array meant every
 * keystroke produced a new function identity, which retriggered the effect that called it — in
 * parallel with the 500ms debounce that was supposed to be preventing exactly that. The debounce
 * was completely defeated and the page fired roughly two requests per character typed.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** The saved views offered above the grid. Each is a filter with a name a merchant recognises. */
export const CATALOG_VIEWS = {
  all: { label: 'All', params: {} },
  active: { label: 'Active', params: { is_active: 'true' } },
  draft: { label: 'Drafts', params: { is_active: 'false' } },
  /* The single most valuable view on a freshly imported catalogue: what still needs work. */
  incomplete: { label: 'Needs attention', params: { issue: 'incomplete' } },
  low_stock: { label: 'Low stock', params: { stock_status: 'low_stock' } },
  out_of_stock: { label: 'Out of stock', params: { stock_status: 'out_of_stock' } },
  no_cost: { label: 'No cost', params: { issue: 'missing_cost' } },
  negative_margin: { label: 'Losing money', params: { issue: 'negative_margin' } }
} as const;

export type CatalogViewKey = keyof typeof CATALOG_VIEWS;

/** Everything the grid reads out of the URL. */
export interface CatalogParams {
  view: CatalogViewKey;
  search: string;
  categoryId: string;
  vendor: string;
  stockStatus: string;
  issue: string;
  minPrice: string;
  maxPrice: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

/** Query-string keys that are filters, as opposed to sort or pagination. */
const FILTER_KEYS = [
  'search',
  'category_id',
  'vendor',
  'stock_status',
  'issue',
  'min_price',
  'max_price'
] as const;

/**
 * Read the catalogue's view state from the URL and write changes back to it.
 *
 * @returns The current parameters and the setters that update them.
 */
export function useCatalogParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo<CatalogParams>(() => {
    const view = (searchParams.get('view') ?? 'all') as CatalogViewKey;
    return {
      view: view in CATALOG_VIEWS ? view : 'all',
      search: searchParams.get('search') ?? '',
      categoryId: searchParams.get('category_id') ?? '',
      vendor: searchParams.get('vendor') ?? '',
      stockStatus: searchParams.get('stock_status') ?? '',
      issue: searchParams.get('issue') ?? '',
      minPrice: searchParams.get('min_price') ?? '',
      maxPrice: searchParams.get('max_price') ?? '',
      sortBy: searchParams.get('sort_by') ?? 'updated_at',
      sortOrder: searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc',
      page: Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1),
      limit: Math.min(250, Math.max(10, Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25))
    };
  }, [searchParams]);

  /**
   * Merge changes into the URL.
   *
   * Changing anything other than the page resets to page one, because staying on page 7 of a
   * result set that just became 3 pages long shows an empty table — which reads as "no products"
   * rather than "you are past the end".
   *
   * `replace` rather than `push` for typing, so a search does not put one history entry per
   * keystroke between the merchant and the page they came from.
   */
  const update = useCallback(
    (changes: Record<string, string | number | null | undefined>, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      if (!('page' in changes)) {
        next.delete('page');
      }

      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      /* `scroll: false` keeps the merchant's place in a long grid when they sort or page — the
       * default jump to the top loses the row they were looking at. */
      if (options?.replace) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  /**
   * Switch to a saved view, clearing the filters the previous one set.
   *
   * Without the clear, moving from "Low stock" to "Drafts" would leave the stock filter applied and
   * silently show drafts-that-are-also-low-stock under a tab labelled "Drafts".
   */
  const setView = useCallback(
    (view: CatalogViewKey) => {
      const cleared = Object.fromEntries(FILTER_KEYS.map((key) => [key, null]));
      update({ ...cleared, view: view === 'all' ? null : view, ...CATALOG_VIEWS[view].params });
    },
    [update]
  );

  /**
   * Sort by a column, toggling direction when it is already the sort column.
   *
   * A first click on a text column sorts A→Z and on a numeric one sorts high→low, because that is
   * what each is usually asked for: "list them alphabetically", but "show me the biggest".
   */
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

  /** The query string to send to the API, derived from the same state the URL holds. */
  const apiQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.categoryId) query.set('category_id', params.categoryId);
    if (params.vendor) query.set('vendor', params.vendor);
    if (params.stockStatus) query.set('stock_status', params.stockStatus);
    if (params.issue) query.set('issue', params.issue);
    if (params.minPrice) query.set('min_price', params.minPrice);
    if (params.maxPrice) query.set('max_price', params.maxPrice);

    const viewParams = CATALOG_VIEWS[params.view].params as Record<string, string>;
    for (const [key, value] of Object.entries(viewParams)) {
      if (!query.has(key)) query.set(key, value);
    }

    query.set('sort_by', params.sortBy);
    query.set('sort_order', params.sortOrder);
    query.set('page', String(params.page));
    query.set('limit', String(params.limit));
    return query.toString();
  }, [params]);

  /** Whether anything beyond the saved view is narrowing the list. Drives the "clear" affordance. */
  const hasFilters = useMemo(() => {
    const viewParams = CATALOG_VIEWS[params.view].params as Record<string, string>;
    return FILTER_KEYS.some((key) => {
      const value = searchParams.get(key);
      return Boolean(value) && viewParams[key] !== value;
    });
  }, [params.view, searchParams]);

  /** Clear every filter, keeping the view, the sort and the page size. */
  const clearFilters = useCallback(() => {
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }, [update]);

  return { params, update, setView, toggleSort, apiQuery, hasFilters, clearFilters };
}
