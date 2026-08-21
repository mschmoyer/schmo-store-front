'use client';

import React, { useState } from 'react';
import {
  IconBuildingStore,
  IconCurrencyDollar,
  IconPointer,
  IconProgressCheck,
  IconShoppingCart,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { centsToNumber } from '@/lib/billing/money';
import {
  ConversionFunnel,
  FulfilmentPanel,
  HealthStrip,
  MetricDelta,
  PlatformChartSkeleton,
  PlatformErrorState,
  PlatformHealthSkeleton,
  PlatformOverviewSkeleton,
  PlatformPanel,
  PlatformTrendCharts,
  RevenuePanel,
  WindowSelector,
  formatPct,
  usePlatformData,
  type PlatformHealth,
  type PlatformOverview,
  type PlatformTimeseries,
  type PlatformWindowDays,
} from '@/components/platform';
import styles from './platform.module.css';

const ICON = { size: 18, stroke: 1.6 } as const;

/**
 * The platform operator's overview.
 *
 * ## Where these numbers come from, and why that matters
 *
 * Three endpoints — `/api/platform/overview`, `/api/platform/timeseries` and
 * `/api/platform/health` — each of which enforces operator access server-side with
 * `requirePlatformAdmin`. Nothing on this screen is derived from anything the browser knows about
 * the viewer. The console's client-side access check (see `layout.tsx`) decides whether to draw the
 * chrome; it never decides what the numbers are.
 *
 * ## Three failure modes, three treatments
 *
 * The three endpoints fail independently and are rendered independently. A dead health endpoint
 * must not blank the revenue panel, and — the rule that matters most — **a failed read is never
 * drawn as a zero**. `PlatformErrorState` names the status and offers a retry, because an operator
 * looking at `0 orders` has no way to tell a quiet Tuesday from a broken API.
 *
 * ## The empty platform
 *
 * A brand-new deployment has no merchants, no clicks and no orders, and that is the first state
 * anyone reviewing this console will see. Every division here goes through `conversionPct` /
 * `readDelta`, both of which return `null` rather than `NaN` or `Infinity` when the denominator is
 * zero, and every panel has a written empty state. Nothing on this page can render `NaN%`.
 *
 * @returns The overview screen.
 */
export default function PlatformOverviewPage(): React.ReactElement {
  const [days, setDays] = useState<PlatformWindowDays>(30);

  const overview = usePlatformData<PlatformOverview>(`/api/platform/overview?days=${days}`);
  const timeseries = usePlatformData<PlatformTimeseries>(`/api/platform/timeseries?days=${days}`);
  const health = usePlatformData<PlatformHealth>('/api/platform/health');

  const periodLabel = `previous ${days} days`;
  const data = overview.data;

  const header = (
    <AdminPageHeader
      title="Platform overview"
      description="Every merchant on RebelShops, in one reading. Windows end now and compare against the period immediately before."
      actions={
        <WindowSelector value={days} onChange={setDays} disabled={overview.isLoading} />
      }
    />
  );

  if (overview.isLoading && !data) {
    return (
      <div className={styles.overview}>
        {header}
        <PlatformOverviewSkeleton />
      </div>
    );
  }

  if (overview.error || !data) {
    return (
      <div className={styles.overview}>
        {header}
        <PlatformErrorState
          error={
            overview.error ?? {
              kind: 'server',
              status: 0,
              message: 'The platform overview returned no data.',
            }
          }
          what="the platform overview"
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const funnelSteps = [
    { key: 'outbound_click', label: 'Buyer clicks', value: data.traffic.clicksInWindow },
    { key: 'product_view', label: 'Product views', value: data.traffic.productViews },
    { key: 'add_to_cart', label: 'Add to cart', value: data.traffic.addToCart },
    { key: 'checkout_start', label: 'Checkout started', value: data.traffic.checkoutStarts },
    { key: 'order', label: 'Orders placed', value: data.orders.receivedInWindow },
  ];

  return (
    <div className={styles.overview}>
      {header}

      {/*
        Six cards, and the grid's minimum is set so they land 3 x 2 on a laptop and 2 x 3 on a
        tablet rather than 4 + 2 with a hole in the row. A ragged last row on a KPI strip reads as
        "something failed to load".
      */}
      <StatGrid min={300}>
        <StatCard
          label="Merchants"
          value={data.merchants.total}
          icon={<IconBuildingStore {...ICON} />}
          meta={
            <>
              {data.merchants.newInWindow.toLocaleString('en-US')} new ·{' '}
              <MetricDelta
                current={data.merchants.newInWindow}
                previous={data.merchants.newPrevWindow}
                periodLabel={periodLabel}
              />
            </>
          }
        />

        <StatCard
          label="Buyer clicks"
          value={data.traffic.clicksInWindow}
          icon={<IconPointer {...ICON} />}
          meta={
            <MetricDelta
              current={data.traffic.clicksInWindow}
              previous={data.traffic.clicksPrevWindow}
              periodLabel={periodLabel}
            />
          }
        />

        <StatCard
          label="Orders received"
          value={data.orders.receivedInWindow}
          icon={<IconShoppingCart {...ICON} />}
          meta={
            <MetricDelta
              current={data.orders.receivedInWindow}
              previous={data.orders.receivedPrevWindow}
              periodLabel={periodLabel}
            />
          }
        />

        <StatCard
          label="Orders shipped"
          value={data.orders.shippedInWindow}
          icon={<IconTruckDelivery {...ICON} />}
          /*
           * The contract has no `shippedPrevWindow`, so this card has nothing to compare against
           * and says so. Deriving a comparison from the fields that do exist would be inventing a
           * number, and inventing a number on an operator console is worse than omitting one.
           */
          meta={<MetricDelta current={data.orders.shippedInWindow} previous={null} periodLabel={periodLabel} />}
        />

        <StatCard
          label="Gross merchandise value"
          value={centsToNumber(data.revenue.gmvCentsInWindow)}
          format="currency"
          tone="signal"
          icon={<IconCurrencyDollar {...ICON} />}
          meta={
            <MetricDelta
              current={data.revenue.gmvCentsInWindow}
              previous={data.revenue.gmvCentsPrevWindow}
              periodLabel={periodLabel}
            />
          }
        />

        {/*
          `fulfillmentRatePct` is the WINDOW's rate — `shippedInWindow / receivedInWindow` in
          `src/lib/platform/metrics.ts` — so its sub-line names the window's two counts. The panel
          further down shows the all-time rate from the all-time counts. Two rates that differ by a
          few points are fine as long as each says which period it measures; the same figure
          labelled two ways would not be.
        */}
        <StatCard
          label="Fulfilment rate"
          value={formatPct(data.orders.receivedInWindow === 0 ? null : data.orders.fulfillmentRatePct)}
          format="raw"
          icon={<IconProgressCheck {...ICON} />}
          progress={data.orders.receivedInWindow === 0 ? undefined : data.orders.fulfillmentRatePct}
          meta={
            data.orders.receivedInWindow === 0
              ? `No orders received in the last ${days} days`
              : `${data.orders.shippedInWindow.toLocaleString('en-US')} of ${data.orders.receivedInWindow.toLocaleString('en-US')} shipped in the last ${days} days`
          }
        />
      </StatGrid>

      <PlatformPanel
        id="traffic"
        title="Traffic and orders over time"
        description={`Daily buyer clicks and orders across every store, last ${days} days.`}
      >
        {timeseries.isLoading && !timeseries.data ? (
          <PlatformChartSkeleton />
        ) : timeseries.error ? (
          <PlatformErrorState
            error={timeseries.error}
            what="the platform time series"
            onRetry={timeseries.reload}
            compact
          />
        ) : (
          <PlatformTrendCharts days={timeseries.data?.days ?? []} windowDays={days} />
        )}
      </PlatformPanel>

      <div className={styles.split}>
        <PlatformPanel
          title="Buyer funnel"
          description={`Where shoppers dropped out, last ${days} days. Percentages are step over step.`}
        >
          <ConversionFunnel steps={funnelSteps} windowDays={days} />
        </PlatformPanel>

        <PlatformPanel
          title="Revenue"
          description="Gross merchandise value across every tenant, before platform fees."
        >
          <RevenuePanel revenue={data.revenue} orders={data.orders} windowDays={days} />
        </PlatformPanel>
      </div>

      <PlatformPanel
        id="fulfilment"
        title="Fulfilment"
        description="How much of what merchants sold actually left a warehouse."
      >
        <FulfilmentPanel
          orders={data.orders}
          unfulfilledOver48h={health.data?.unfulfilledOver48h ?? null}
          windowDays={days}
        />
      </PlatformPanel>

      <PlatformPanel
        id="health"
        title="Platform health"
        description="ShipStation sync state per store, the job queue, and anything that needs an operator."
      >
        {health.isLoading && !health.data ? (
          <PlatformHealthSkeleton />
        ) : health.error ? (
          <PlatformErrorState
            error={health.error}
            what="platform health"
            onRetry={health.reload}
            compact
          />
        ) : health.data ? (
          <HealthStrip health={health.data} />
        ) : null}
      </PlatformPanel>
    </div>
  );
}
