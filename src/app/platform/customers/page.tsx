'use client';

/**
 * Every merchant on the platform, in one table.
 *
 * The console's job on this screen is comparison. An operator arrives with a
 * question about a *subset* — who signed up this month and never connected
 * ShipStation, who has traffic and no orders, who is turning over real money —
 * and the screen has to answer it in one view rather than by opening thirty
 * merchants in turn. Three decisions follow from that.
 *
 * **The URL is the view.** Page, search, sort, direction and filter all live in
 * the query string, so an answer can be bookmarked, pasted into a ticket and
 * reached with the Back button. A view held in component state is an answer
 * that cannot be shared, which on an operations screen means the work gets done
 * twice.
 *
 * **The totals describe the filter, not the page.** The API aggregates over
 * every matching merchant, and the strip says so in words. A total that
 * silently means "these twenty-five rows" is worse than no total.
 *
 * **An empty result is two different facts.** "No merchants have signed up" and
 * "no merchant matches Unconnected + 'acme'" need different sentences and
 * different actions, and a single "No data" state hides the second behind the
 * first — which is exactly how an operator concludes the platform is empty when
 * they have simply over-filtered.
 */

import React, { Suspense, useCallback, useMemo } from 'react';
import { IconRefresh, IconUsers } from '@tabler/icons-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatGridSkeleton, TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Button, EmptyState } from '@/components/ui';
import { DataFreshness } from '@/components/platform';
import {
  CUSTOMER_FILTERS,
  CustomerToolbar,
  CustomerTotals,
  CustomersTable,
  PaginationBar,
  PlatformErrorState,
  useCustomerParams,
  usePlatformFetch,
} from '@/components/platform/customers';
import type {
  CustomerFilterKey,
  CustomerSortKey,
  PlatformCustomersPayload,
} from '@/components/platform/customers';
import styles from './customers.module.css';

/** Skeleton geometry for the whole screen, used by Suspense and by first paint. */
function CustomersSkeleton(): React.ReactElement {
  return (
    <div className={styles.page}>
      <StatGridSkeleton count={5} />
      <TableSkeleton rows={8} columns={7} label="Loading merchants" />
    </div>
  );
}

/**
 * The merchant list, with its view state read from the URL.
 *
 * @returns The list screen.
 */
function CustomersView(): React.ReactElement {
  const { params, update, toggleSort, apiQuery, hasFilters, clearFilters } = useCustomerParams();
  const { data, error, loading, refreshing, fetchedAt, reload } =
    usePlatformFetch<PlatformCustomersPayload>(`/api/platform/customers?${apiQuery}`);

  const activeFilter = useMemo(
    () => CUSTOMER_FILTERS.find((option) => option.value === params.filter),
    [params.filter]
  );
  const scopeLabel = activeFilter?.scope ?? 'merchants';

  /*
   * "No merchants match" is three different sentences depending on what is
   * narrowing the list, and the difference decides which control the operator
   * reaches for. A search that found nothing wants a shorter term; a filter
   * that matched nobody wants clearing; both together want to be told which of
   * the two is the problem.
   */
  const emptyDescription = useMemo(() => {
    const filtered = params.filter !== 'all';
    if (params.q && filtered) {
      return `No ${scopeLabel} match "${params.q}". Widen the search, or clear both and start from every merchant.`;
    }
    if (params.q) {
      return `Nothing matches "${params.q}". Try a shorter term — the search covers store name, slug, owner name and owner email.`;
    }
    return `No merchant is currently in the "${activeFilter?.label ?? 'selected'}" set. Clear the filter to see everyone.`;
  }, [params.q, params.filter, scopeLabel, activeFilter]);

  const onQueryChange = useCallback(
    (value: string) => update({ q: value || null }, { replace: true }),
    [update]
  );
  const onFilterChange = useCallback(
    (value: CustomerFilterKey) => update({ filter: value === 'all' ? null : value }),
    [update]
  );
  const onPageSizeChange = useCallback(
    (value: number) => update({ pageSize: value === 25 ? null : value }),
    [update]
  );
  const onSort = useCallback(
    (column: CustomerSortKey, numeric: boolean) => toggleSort(column, numeric),
    [toggleSort]
  );
  const onPageChange = useCallback((page: number) => update({ page }), [update]);

  const header = (
    <AdminPageHeader
      title="Customers"
      description="Every merchant on the platform, what they have connected, and what it has produced."
      actions={
        <div className={styles.headerActions}>
          {/* A Refresh button implies the reading might be stale; without this line it declines to
              say by how much. */}
          <DataFreshness fetchedAt={fetchedAt} label="Merchant list" refreshing={refreshing} />
          <Button
            variant="secondary"
            size="sm"
            onClick={reload}
            loading={refreshing}
            leftIcon={<IconRefresh size={16} />}
          >
            Refresh
          </Button>
        </div>
      }
    />
  );

  if (error) {
    return (
      <div className={styles.page}>
        {header}
        <PlatformErrorState error={error} subject="page" onRetry={reload} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}

      {loading || !data ? (
        <StatGridSkeleton count={5} />
      ) : (
        <CustomerTotals totals={data.totals} scopeLabel={scopeLabel} query={params.q || undefined} />
      )}

      <CustomerToolbar
        query={params.q}
        filter={params.filter}
        pageSize={params.pageSize}
        onQueryChange={onQueryChange}
        onFilterChange={onFilterChange}
        onPageSizeChange={onPageSizeChange}
      />

      {loading || !data ? (
        <TableSkeleton rows={8} columns={7} label="Loading merchants" />
      ) : data.customers.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No merchants match this view"
            description={emptyDescription}
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState
            illustration={<IconUsers size={34} aria-hidden="true" />}
            title="No merchants yet"
            description="Nobody has created a store on this platform. The first merchant to sign up and connect ShipStation will appear here with their catalogue and orders."
          />
        )
      ) : (
        <>
          <CustomersTable
            rows={data.customers}
            sort={params.sort}
            dir={params.dir}
            onSort={onSort}
            refreshing={refreshing}
          />
          <PaginationBar
            pagination={data.pagination}
            onPageChange={onPageChange}
            noun="merchants"
          />
        </>
      )}
    </div>
  );
}

/**
 * The `/platform/customers` route.
 *
 * The view is behind `Suspense` because it reads the query string, and a page
 * that calls `useSearchParams` without a boundary opts the whole route out of
 * static rendering at build time.
 *
 * @returns The customers route.
 */
export default function PlatformCustomersPage(): React.ReactElement {
  return (
    <Suspense fallback={<CustomersSkeleton />}>
      <CustomersView />
    </Suspense>
  );
}
