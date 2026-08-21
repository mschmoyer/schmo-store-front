'use client';

/**
 * Everything the platform knows about one merchant.
 *
 * The screen is ordered by what an operator opening it is trying to find out,
 * not by how the data is stored. The checklist comes first because it is the
 * summary that explains every other panel — a merchant with no orders and no
 * catalogue is not a mystery once the checklist shows ShipStation was never
 * connected. Then orders, because that is the money; then catalogue,
 * integrations, theme and traffic.
 *
 * Failures are not one state. An unknown store id, an expired session and an
 * account that is signed in but not a platform admin are three different
 * situations with three different next actions, and they are rendered as three
 * different screens — see `PlatformErrorState`.
 *
 * **No credential is displayed anywhere on this page.** The API sends facts
 * about credentials, never the credentials themselves; if a payload ever
 * carries an API key or a webhook secret, that is a defect in the route handler
 * to be reported and fixed there rather than masked here.
 *
 * The orders panel's status filter lives in the query string (`?orders=`), not
 * in component state. The console's stuck-order alerts link straight into it,
 * and a link that promises a filtered list has to arrive at one; keeping it in
 * the URL also means the Back button undoes the filter and the view can be
 * pasted into a ticket.
 */

import React, { Suspense, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconRefresh } from '@tabler/icons-react';
import { PanelSkeleton, StatGridSkeleton } from '@/components/admin/AdminSkeletons';
import { Button } from '@/components/ui';
import { DataFreshness } from '@/components/platform';
import {
  CatalogPanel,
  ChecklistPanel,
  CustomerDetailHeader,
  CustomizationPanel,
  IntegrationsPanel,
  OrdersPanel,
  PlatformErrorState,
  TrafficPanel,
  usePlatformFetch,
} from '@/components/platform/customers';
import type { PlatformCustomerDetail } from '@/components/platform/customers';
import styles from './customerDetail.module.css';

/** Where the not-found and error states send the operator back to. */
const LIST_HREF = '/platform/customers';

/**
 * The detail screen's skeleton, at the geometry of the real page.
 *
 * @returns Placeholder chrome for the header and the panel stack.
 */
function DetailSkeleton(): React.ReactElement {
  return (
    <div className={styles.page}>
      <StatGridSkeleton count={4} />
      <PanelSkeleton height={180} label="Loading the merchant" />
      <PanelSkeleton height={260} label="Loading orders" />
      <PanelSkeleton height={200} label="Loading the catalogue" />
    </div>
  );
}

/**
 * The merchant detail view.
 *
 * @returns The panels for one merchant, or the state explaining why not.
 */
function CustomerDetailView(): React.ReactElement {
  const params = useParams<{ storeId: string }>();
  const storeId = params?.storeId ?? '';

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orderStatus = searchParams.get('orders');

  const { data, error, loading, refreshing, fetchedAt, reload } =
    usePlatformFetch<PlatformCustomerDetail>(
      storeId ? `/api/platform/customers/${encodeURIComponent(storeId)}` : null
    );

  const setOrderStatus = useCallback(
    (next: string | null) => {
      const query = new URLSearchParams(searchParams.toString());
      if (next === null) query.delete('orders');
      else query.set('orders', next);

      const search = query.toString();
      /* `scroll: false` keeps the operator on the orders panel they are filtering rather than
         throwing them back to the top of a long detail page. */
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  if (error) {
    return (
      <div className={styles.page}>
        <PlatformErrorState
          error={error}
          subject="merchant"
          backHref={LIST_HREF}
          onRetry={reload}
        />
      </div>
    );
  }

  if (loading || !data) return <DetailSkeleton />;

  return (
    <div className={styles.page}>
      <CustomerDetailHeader
        store={data.store}
        owner={data.owner}
        customization={data.customization}
      />

      <div className={styles.toolbar}>
        <DataFreshness fetchedAt={fetchedAt} label="Merchant record" refreshing={refreshing} />
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

      <div className={styles.panels}>
        <ChecklistPanel items={data.checklist} />
        <OrdersPanel
          storeId={data.store.storeId}
          stats={data.orders}
          status={orderStatus}
          onStatusChange={setOrderStatus}
        />
        <CatalogPanel catalog={data.catalog} />
        <div className={styles.pair}>
          <IntegrationsPanel integrations={data.integrations} />
          <CustomizationPanel customization={data.customization} />
        </div>
        <TrafficPanel traffic={data.traffic} />
      </div>
    </div>
  );
}

/**
 * The `/platform/customers/[storeId]` route.
 *
 * @returns The merchant detail route.
 */
export default function PlatformCustomerDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CustomerDetailView />
    </Suspense>
  );
}
