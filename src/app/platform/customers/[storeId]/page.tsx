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
 */

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { IconRefresh } from '@tabler/icons-react';
import { PanelSkeleton, StatGridSkeleton } from '@/components/admin/AdminSkeletons';
import { Button } from '@/components/ui';
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

  const { data, error, loading, refreshing, reload } = usePlatformFetch<PlatformCustomerDetail>(
    storeId ? `/api/platform/customers/${encodeURIComponent(storeId)}` : null
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
        <ChecklistPanel
          items={data.checklist}
          completenessPct={data.customization.completenessPct}
        />
        <OrdersPanel storeId={data.store.storeId} stats={data.orders} />
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
