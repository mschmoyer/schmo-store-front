/**
 * The platform console's customers lane.
 *
 * One import surface for the two customer screens, so a page imports from
 * `@/components/platform/customers` rather than reaching into seven files. The
 * types are re-exported alongside the components because the pages hold the API
 * payloads in state and need the shapes as much as the views.
 */

/* -- Data --------------------------------------------------------------- */
export {
  usePlatformFetch,
  type PlatformFetchError,
  type PlatformFetchErrorKind,
  type PlatformFetchState,
} from './usePlatformFetch';
export {
  useCustomerParams,
  CUSTOMER_FILTERS,
  PAGE_SIZES,
  type CustomerParams,
  type CustomerParamsApi,
} from './useCustomerParams';

/* -- Formatting --------------------------------------------------------- */
export {
  NOT_SET,
  centsToPrice,
  formatCents,
  formatCount,
  formatDate,
  formatDateTime,
  formatHours,
  formatPercent,
  formatRelative,
  humanizeStatus,
  parseDate,
} from './format';
export { RelativeDate, type RelativeDateProps } from './RelativeDate';

/* -- List screen -------------------------------------------------------- */
export { CustomersTable, type CustomersTableProps } from './CustomersTable';
export { CustomerToolbar, type CustomerToolbarProps } from './CustomerToolbar';
export { CustomerTotals, type CustomerTotalsProps } from './CustomerTotals';
export { PaginationBar, type PaginationBarProps } from './PaginationBar';
export { SortableColumn, type SortableColumnProps } from './SortableColumn';

/* -- Detail screen ------------------------------------------------------ */
export { CustomerDetailHeader, type CustomerDetailHeaderProps } from './CustomerDetailHeader';
export { ChecklistPanel, type ChecklistPanelProps } from './ChecklistPanel';
export { OrdersPanel, type OrdersPanelProps } from './OrdersPanel';
export { CatalogPanel, type CatalogPanelProps } from './CatalogPanel';
export { IntegrationsPanel, type IntegrationsPanelProps } from './IntegrationsPanel';
export { CustomizationPanel, type CustomizationPanelProps } from './CustomizationPanel';
export { TrafficPanel, type TrafficPanelProps } from './TrafficPanel';

/* -- Shared chrome ------------------------------------------------------ */
export {
  DataList,
  Metrics,
  Panel,
  type DataListItem,
  type DataListProps,
  type MetricItem,
  type MetricsProps,
  type PanelProps,
} from './Panel';
export { PlatformErrorState, type PlatformErrorStateProps } from './PlatformErrorState';
export {
  CustomizationBadge,
  IntegrationBadge,
  StoreStateBadge,
  type CustomizationBadgeProps,
  type IntegrationBadgeProps,
  type StoreStateBadgeProps,
} from './StoreBadges';

/* -- Contract types ----------------------------------------------------- */
export type {
  CustomerFilterKey,
  CustomerSortKey,
  PlatformCatalogStats,
  PlatformChecklistItem,
  PlatformCustomerDetail,
  PlatformCustomerRow,
  PlatformCustomerTotals,
  PlatformCustomersPayload,
  PlatformCustomization,
  PlatformIntegrations,
  PlatformOrderRow,
  PlatformOrderStats,
  PlatformOrdersPayload,
  PlatformOwnerSummary,
  PlatformPagination,
  PlatformStoreSummary,
  PlatformTopProduct,
  PlatformTraffic,
  PlatformTrafficDay,
  SortDirection,
} from './types';
