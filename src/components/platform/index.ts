/**
 * The platform operator console's shared kit.
 *
 * Import from here rather than from the individual modules:
 *   import { usePlatformData, PlatformPanel } from '@/components/platform';
 *
 * `usePlatformData` in particular is the console's single door to `/api/platform/*` — it sends the
 * session cookie, aborts superseded requests and turns a failure into a typed error rather than a
 * zero. Any screen added to this console should read through it, not through a bare `fetch`.
 *
 * The customer-facing screens under `./customers` keep their own barrel; nothing here re-exports
 * them, so the two lanes can move independently.
 */

/* -- Data ---------------------------------------------------------------- */
export {
  usePlatformData,
  type PlatformDataState,
  type PlatformErrorKind,
  type PlatformFetchError,
} from './usePlatformData';
export { usePlatformAccess, type PlatformAccess, type PlatformAccessStatus } from './usePlatformAccess';

/* -- Wire types ---------------------------------------------------------- */
export type {
  PlatformHealth,
  PlatformHealthAlert,
  PlatformHealthState,
  PlatformHealthStore,
  PlatformOverview,
  PlatformResponse,
  PlatformTimeseries,
  PlatformTimeseriesDay,
  PlatformUnfulfilledBacklog,
  PlatformUnfulfilledStore,
  PlatformWindowDays,
} from './types';

/* -- Numbers ------------------------------------------------------------- */
export { formatAgeHours, formatDurationHours, NO_DURATION } from './formatDuration';
export {
  conversionPct,
  formatPct,
  formatPercentChange,
  readDelta,
  type MetricDeltaReading,
  type MetricDirection,
  type MetricPolarity,
  type MetricTone,
} from './metricDelta';

/* -- Chrome -------------------------------------------------------------- */
export { PlatformHeader, type PlatformHeaderProps } from './PlatformHeader';
export { PlatformNav, type PlatformNavProps } from './PlatformNav';
export {
  PlatformAttentionSkeleton,
  PlatformChartSkeleton,
  PlatformHealthCardsSkeleton,
  PlatformOverviewSkeleton,
  PlatformShellSkeleton,
} from './PlatformSkeletons';

/* -- Panels -------------------------------------------------------------- */
export { PlatformPanel, type PlatformPanelProps } from './PlatformPanel';
export { PlatformErrorState, type PlatformErrorStateProps } from './PlatformErrorState';
export { MetricDelta, type MetricDeltaProps } from './MetricDelta';
export { WindowSelector, PLATFORM_WINDOWS, type WindowSelectorProps } from './WindowSelector';
export { PlatformTrendCharts, type PlatformTrendChartsProps } from './PlatformTrendCharts';
export { ConversionFunnel, type ConversionFunnelProps, type FunnelStep } from './ConversionFunnel';
export { RevenuePanel, type RevenuePanelProps } from './RevenuePanel';
export { FulfilmentPanel, type FulfilmentPanelProps } from './FulfilmentPanel';
export { HealthCards, type HealthCardsProps } from './HealthCards';
export { AttentionPanel, type AttentionPanelProps } from './AttentionPanel';
export { ReadinessPanel, type ReadinessPanelProps } from './ReadinessPanel';
export { DataFreshness, describeAge, type DataFreshnessProps } from './DataFreshness';

/* -- Drill-through ------------------------------------------------------- */
export { customersFilterHref, storeOrdersHref, UNSHIPPED_ORDER_STATUS } from './drillThrough';
