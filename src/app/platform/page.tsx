'use client';

import React, { Suspense, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  AttentionPanel,
  ConversionFunnel,
  DataFreshness,
  FulfilmentPanel,
  HealthStrip,
  MetricDelta,
  PlatformChartSkeleton,
  PlatformErrorState,
  PlatformHealthSkeleton,
  PlatformOverviewSkeleton,
  PlatformPanel,
  PlatformTrendCharts,
  ReadinessPanel,
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

/** The windows the console reads. Anything else in the URL is not an operator's request. */
const WINDOWS: readonly PlatformWindowDays[] = [7, 30, 90];

/** The window the console opens on when the URL does not name one. */
const DEFAULT_WINDOW: PlatformWindowDays = 30;

/**
 * Reads the reporting window out of the query string.
 *
 * @param raw - The `days` parameter, or `null` when absent.
 * @returns A supported window. An unsupported value is a request the API would not honour anyway,
 *   so it is snapped to the default rather than passed through — exactly as the customers list
 *   snaps an arbitrary `pageSize`.
 */
function readWindow(raw: string | null): PlatformWindowDays {
  const parsed = Number.parseInt(raw ?? '', 10);
  return (WINDOWS as readonly number[]).includes(parsed)
    ? (parsed as PlatformWindowDays)
    : DEFAULT_WINDOW;
}

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
 * ## The order of the page is the order of an operator's morning
 *
 * What needs a person comes first — the stuck-order exposure and every open alert — then whether
 * merchants can trade at all, then the KPI strip, then the analysis. The previous order put six
 * equal-weight KPI cards and two charts above two CRITICAL alerts sitting 1,600px down a 2,952px
 * page. Nobody scrolls to their alerts.
 *
 * ## Three failure modes, three treatments
 *
 * The three endpoints fail independently and are rendered independently. A dead health endpoint
 * must not blank the revenue panel, and — the rule that matters most — **a failed read is never
 * drawn as a zero**. `PlatformErrorState` names the status and offers a retry, because an operator
 * looking at `0 orders` has no way to tell a quiet Tuesday from a broken API.
 *
 * ## The window is in the URL
 *
 * `?days=` rather than component state. The merchant list already keeps its sort and filter there,
 * and a console where one screen's view is addressable and the next screen's is not teaches an
 * operator that neither can be trusted to a bookmark. It also makes Back undo a window change,
 * which arrow-keying through a segmented control otherwise does not.
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
function PlatformOverviewView(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const days = readWindow(searchParams.get('days'));

  const setDays = useCallback(
    (next: PlatformWindowDays) => {
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_WINDOW) query.delete('days');
      else query.set('days', String(next));

      const search = query.toString();
      /* `push`, not `replace`: choosing a window is a deliberate act and Back should undo it.
         `scroll: false` keeps the reader where they were on a long page. */
      router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const overview = usePlatformData<PlatformOverview>(`/api/platform/overview?days=${days}`);
  const timeseries = usePlatformData<PlatformTimeseries>(`/api/platform/timeseries?days=${days}`);
  const health = usePlatformData<PlatformHealth>('/api/platform/health');

  const periodLabel = `previous ${days} days`;
  const data = overview.data;
  /* `comparison.measured` separates "the previous window was observed and was empty" from "the
     platform did not exist yet". Both produce a zero baseline and they are not the same claim. */
  const baselineMeasured = overview.data?.comparison?.measured;

  const header = (
    <AdminPageHeader
      title="Platform overview"
      description="Every merchant on RebelShops, in one reading. Windows end now and compare against the period immediately before."
      actions={
        <div className={styles.headerActions}>
          <DataFreshness
            fetchedAt={overview.fetchedAt}
            label="Overview"
            refreshing={overview.isLoading}
          />
          <WindowSelector value={days} onChange={setDays} disabled={overview.isLoading} />
        </div>
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

  /*
   * The funnel's first step is storefront views, not every recorded event.
   *
   * `traffic.clicksInWindow` is the count of rows in `storefront_click_events` — every event type
   * added together. Storefront views + product views + add-to-cart + checkout starts + orders sum
   * exactly to it, so using it as the top of the funnel put each numerator inside its own
   * denominator: "product views are 29% of buyer clicks" was arithmetic on a set that contains the
   * product views themselves. It is not a conversion rate, and a funnel is the one chart where that
   * distinction is the whole point. Storefront views is the population every later step is actually
   * drawn from.
   */
  const funnelSteps = data.funnel
    ? data.funnel.stages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        value: stage.count,
      }))
    : [
        { key: 'storefront_view', label: 'Storefront views', value: data.traffic.storefrontViews },
        { key: 'product_view', label: 'Product views', value: data.traffic.productViews },
        { key: 'add_to_cart', label: 'Add to cart', value: data.traffic.addToCart },
        { key: 'checkout_start', label: 'Checkout started', value: data.traffic.checkoutStarts },
        { key: 'order', label: 'Orders placed', value: data.orders.receivedInWindow },
      ];

  const allEvents = data.funnel?.allEventsInWindow ?? data.traffic.clicksInWindow;
  const topOfFunnel = funnelSteps[0]?.value ?? 0;

  const funnelSummary = (
    <>
      {data.traffic.uniqueVisitorsInWindow.toLocaleString('en-US')} unique visitors produced{' '}
      {allEvents.toLocaleString('en-US')} storefront events in this window. The funnel starts from
      the {topOfFunnel.toLocaleString('en-US')} of those that were storefront views — the other
      event types are the later steps, so counting them in the first would put each step inside its
      own denominator.
    </>
  );

  return (
    <div className={styles.overview}>
      {header}

      {/*
        First on the page, deliberately. See the note on this component: everything below is
        context, and this is the only region that asks somebody to do something.
      */}
      <PlatformPanel
        id="attention"
        title="Needs an operator"
        description="Paid orders nobody has shipped, and every store currently reporting a problem. Worst first."
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
          <AttentionPanel health={health.data} />
        ) : null}
      </PlatformPanel>

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
                baselineMeasured={baselineMeasured}
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
            <>
              {data.traffic.uniqueVisitorsInWindow.toLocaleString('en-US')} unique visitors ·{' '}
              <MetricDelta
                current={data.traffic.clicksInWindow}
                previous={data.traffic.clicksPrevWindow}
                baselineMeasured={baselineMeasured}
                periodLabel={periodLabel}
              />
            </>
          }
        />

        <StatCard
          label="Orders received"
          value={data.orders.receivedInWindow}
          icon={<IconShoppingCart {...ICON} />}
          /* Received includes cancellations by definition, so the cancelled count sits with it
             rather than being quietly subtracted somewhere the reader cannot see. */
          meta={
            <>
              {data.orders.cancelledInWindow === undefined
                ? null
                : `${data.orders.cancelledInWindow.toLocaleString('en-US')} cancelled, counted in this total · `}
              <MetricDelta
                current={data.orders.receivedInWindow}
                previous={data.orders.receivedPrevWindow}
                baselineMeasured={baselineMeasured}
                periodLabel={periodLabel}
              />
            </>
          }
        />

        <StatCard
          label="Orders shipped"
          value={data.orders.shippedInWindow}
          icon={<IconTruckDelivery {...ICON} />}
          /*
           * `shippedPrevWindow` is the real baseline. This card used to hard-code `previous={null}`
           * and print "No previous 30 days to compare against" — a sentence that was simply false:
           * the period existed and had shipments in it. When the field is absent (an older
           * deployment) the delta now says the baseline was *not computed*, which is a different
           * claim and a true one.
           */
          meta={
            <MetricDelta
              current={data.orders.shippedInWindow}
              previous={data.orders.shippedPrevWindow ?? null}
              baselineMeasured={baselineMeasured}
              periodLabel={periodLabel}
            />
          }
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
              baselineMeasured={baselineMeasured}
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
          value={formatPct(data.orders.fulfillmentRatePct)}
          format="raw"
          icon={<IconProgressCheck {...ICON} />}
          progress={data.orders.fulfillmentRatePct ?? undefined}
          meta={
            data.orders.fulfillmentRatePct === null
              ? `No orders received in the last ${days} days`
              : `${data.orders.shippedInWindow.toLocaleString('en-US')} of ${data.orders.receivedInWindow.toLocaleString('en-US')} shipped in the last ${days} days`
          }
        />
      </StatGrid>

      <PlatformPanel
        id="readiness"
        title="Merchant readiness"
        description="Whether the merchants on this platform can actually take money and ship goods, and what their catalogues hold."
      >
        <ReadinessPanel
          integrations={data.integrations}
          catalog={data.catalog}
          merchants={data.merchants}
        />
      </PlatformPanel>

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
          <ConversionFunnel steps={funnelSteps} windowDays={days} summary={funnelSummary} />
        </PlatformPanel>

        <PlatformPanel
          title="Revenue"
          description="Gross merchandise value across every tenant, before platform fees."
        >
          <RevenuePanel
            revenue={data.revenue}
            orders={data.orders}
            windowDays={days}
            baselineMeasured={baselineMeasured}
          />
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
          unfulfilled={health.data?.unfulfilled ?? null}
          windowDays={days}
        />
      </PlatformPanel>

      <PlatformPanel
        id="health"
        title="Platform health"
        description="ShipStation sync state per store and the depth of the job queue. Anything that needs acting on is at the top of this page."
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

/**
 * The `/platform` route.
 *
 * The view is behind `Suspense` because it reads the query string, and a page that calls
 * `useSearchParams` without a boundary opts the whole route out of static rendering at build time.
 *
 * @returns The overview route.
 */
export default function PlatformOverviewPage(): React.ReactElement {
  return (
    <Suspense fallback={<PlatformOverviewSkeleton />}>
      <PlatformOverviewView />
    </Suspense>
  );
}
