/**
 * Wire types for the platform operator console.
 *
 * These mirror the `/api/platform/*` contract exactly and nothing else. They live in the component
 * layer rather than in `src/lib/types/` on purpose: they describe **what the console reads over
 * HTTP**, not what the database holds, and the two are allowed to drift. When the API adds a field
 * the console does not render, this file does not have to change.
 *
 * Every money figure crossing this boundary is **integer cents**, matching the codebase rule. The
 * API converts at the SQL boundary (`ROUND(SUM(total_amount) * 100)::bigint`); the console converts
 * back only when rendering, through `src/lib/billing/money.ts`. No component does float arithmetic
 * on a `*Cents` field.
 */

/** The windows the overview offers. Anything else is not a supported reading period. */
export type PlatformWindowDays = 7 | 30 | 90;

/** The envelope every `/api/platform/*` route returns. */
export interface PlatformResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** `GET /api/platform/overview?days=N` → `data`. */
export interface PlatformOverview {
  window: { days: number; start: string; end: string };
  merchants: {
    total: number;
    active: number;
    newInWindow: number;
    newPrevWindow: number;
    launched: number;
    withOrders: number;
  };
  traffic: {
    clicksAllTime: number;
    clicksInWindow: number;
    clicksPrevWindow: number;
    uniqueVisitorsInWindow: number;
    storefrontViews: number;
    productViews: number;
    addToCart: number;
    checkoutStarts: number;
  };
  orders: {
    receivedAllTime: number;
    receivedInWindow: number;
    receivedPrevWindow: number;
    shippedAllTime: number;
    shippedInWindow: number;
    deliveredAllTime: number;
    fulfillmentRatePct: number;
    avgHoursToShip: number | null;
    avgOrderValueCents: number;
  };
  revenue: {
    gmvCentsAllTime: number;
    gmvCentsInWindow: number;
    gmvCentsPrevWindow: number;
    refundedCentsInWindow: number;
    unitsSoldInWindow: number;
  };
  catalog: {
    products: number;
    activeProducts: number;
    inventoryUnits: number;
    inventoryValueCents: number;
    outOfStock: number;
  };
  integrations: {
    shipstationConnected: number;
    stripeConnected: number;
    bothConnected: number;
    themeCustomized: number;
    publishedStores: number;
  };
  conversion: {
    clickToOrderPct: number;
    cartToOrderPct: number;
  };
}

/** One zero-filled day of the platform time series. */
export interface PlatformTimeseriesDay {
  day: string;
  clicks: number;
  uniqueVisitors: number;
  orders: number;
  shipped: number;
  gmvCents: number;
  signups: number;
}

/** `GET /api/platform/timeseries?days=N` → `data`. */
export interface PlatformTimeseries {
  days: PlatformTimeseriesDay[];
}

/** How a store's ShipStation connection is currently reading. */
export type PlatformHealthState = 'healthy' | 'stale' | 'failing' | 'not_connected';

/** One row of the per-store health table. */
export interface PlatformHealthStore {
  storeId: string;
  storeName: string;
  syncStatus: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  state: PlatformHealthState;
}

/** One operator-facing alert. `href` is a console route when the API supplies one. */
export interface PlatformHealthAlert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  storeId: string | null;
  storeName: string | null;
  href: string | null;
}

/** `GET /api/platform/health` → `data`. */
export interface PlatformHealth {
  counts: { healthy: number; stale: number; failing: number; notConnected: number };
  jobs: { pending: number; failed: number; processing: number };
  unfulfilledOver48h: number;
  stores: PlatformHealthStore[];
  alerts: PlatformHealthAlert[];
}
