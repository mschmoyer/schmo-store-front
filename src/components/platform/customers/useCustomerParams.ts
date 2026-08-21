'use client';

/**
 * The customers list's view state, kept in the URL.
 *
 * An operator's job on this screen is to answer a question about a subset —
 * "which merchants connected Stripe but have never taken an order", "who has
 * traffic and no sales" — and then to *tell someone else the answer*. If the
 * filter, the sort and the page live in component state, that view cannot be
 * bookmarked, cannot be pasted into a ticket, and evaporates the moment they
 * open a merchant and press Back. The catalogue screen learned this the hard
 * way; this hook is the same fix applied before the mistake is made twice.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CustomerFilterKey, CustomerSortKey, SortDirection } from './types';

/** The filter control's options, in the order they are offered. */
export const CUSTOMER_FILTERS: ReadonlyArray<{
  value: CustomerFilterKey;
  label: string;
  /** Shown on the totals strip so the aggregate always names its own scope. */
  scope: string;
}> = [
  { value: 'all', label: 'All', scope: 'merchants' },
  { value: 'active', label: 'Active', scope: 'active merchants' },
  { value: 'inactive', label: 'Inactive', scope: 'inactive merchants' },
  { value: 'connected', label: 'Connected', scope: 'merchants with an integration connected' },
  { value: 'unconnected', label: 'Unconnected', scope: 'merchants with no integration connected' },
  { value: 'customized', label: 'Customized', scope: 'merchants who customised their theme' },
  { value: 'has_orders', label: 'Has orders', scope: 'merchants with at least one order' },
  { value: 'no_orders', label: 'No orders', scope: 'merchants with no orders' },
];

/** Page sizes offered in the selector. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Sort keys the API accepts, used to reject anything else in the URL. */
const SORT_KEYS: readonly CustomerSortKey[] = [
  'created',
  'name',
  'orders',
  'shipped',
  'gmv',
  'clicks',
  'products',
];

/** Everything the list reads out of the query string. */
export interface CustomerParams {
  page: number;
  pageSize: number;
  q: string;
  sort: CustomerSortKey;
  dir: SortDirection;
  filter: CustomerFilterKey;
}

/** What {@link useCustomerParams} returns. */
export interface CustomerParamsApi {
  params: CustomerParams;
  /** Merge changes into the query string. Anything but `page` resets to page 1. */
  update: (
    changes: Record<string, string | number | null | undefined>,
    options?: { replace?: boolean }
  ) => void;
  /** Sort by a column, flipping direction when it is already the sort column. */
  toggleSort: (column: CustomerSortKey, numeric?: boolean) => void;
  /** The query string to send to `/api/platform/customers`. */
  apiQuery: string;
  /** True when a search or a non-`all` filter is narrowing the list. */
  hasFilters: boolean;
  /** Drop the search and the filter, keeping the sort and the page size. */
  clearFilters: () => void;
}

/**
 * Read the customers list's view state from the URL and write changes back.
 *
 * @returns The current parameters and the setters that update them.
 */
export function useCustomerParams(): CustomerParamsApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo<CustomerParams>(() => {
    const sort = (searchParams.get('sort') ?? 'created') as CustomerSortKey;
    const filter = (searchParams.get('filter') ?? 'all') as CustomerFilterKey;
    const requestedSize = Number.parseInt(searchParams.get('pageSize') ?? '25', 10);

    return {
      page: Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1),
      /* An arbitrary `pageSize` in the URL is a request the operator did not
         make and the API does not have to honour, so it is snapped to an
         offered value rather than passed through. */
      pageSize: (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : 25,
      q: searchParams.get('q') ?? '',
      sort: SORT_KEYS.includes(sort) ? sort : 'created',
      dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
      filter: CUSTOMER_FILTERS.some((option) => option.value === filter) ? filter : 'all',
    };
  }, [searchParams]);

  const update = useCallback<CustomerParamsApi['update']>(
    (changes, options) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }

      /* Narrowing the list while on page 7 of a set that just became 2 pages
         long renders an empty table, which reads as "no merchants" rather than
         "you are past the end". */
      if (!('page' in changes)) next.delete('page');

      const query = next.toString();
      /* `scroll: false` keeps the operator's place in a long table when they
         sort or page; the default jump to the top loses the row they were on. */
      const url = query ? `${pathname}?${query}` : pathname;
      if (options?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const toggleSort = useCallback<CustomerParamsApi['toggleSort']>(
    (column, numeric = false) => {
      if (params.sort === column) {
        update({ sort: column, dir: params.dir === 'asc' ? 'desc' : 'asc' });
      } else {
        /* A first click on a name sorts A→Z; on a count or an amount it sorts
           high→low, because "show me the biggest" is what a number is asked. */
        update({ sort: column, dir: numeric ? 'desc' : 'asc' });
      }
    },
    [params.sort, params.dir, update]
  );

  const apiQuery = useMemo(() => {
    const query = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
      sort: params.sort,
      dir: params.dir,
      filter: params.filter,
    });
    if (params.q) query.set('q', params.q);
    return query.toString();
  }, [params]);

  const hasFilters = params.q !== '' || params.filter !== 'all';

  const clearFilters = useCallback(() => update({ q: null, filter: null }), [update]);

  return { params, update, toggleSort, apiQuery, hasFilters, clearFilters };
}
