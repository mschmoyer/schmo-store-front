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

/**
 * One stage of the buyer funnel, as the API orders them.
 *
 * The API owns the ordering and the labels so that "top of funnel" is a fact the console reads
 * rather than a decision it makes. {@link PlatformFunnel.topOfFunnelKey} names the only stage a
 * top-of-funnel rate may be divided by.
 */
export interface PlatformFunnelStage {
  key: string;
  label: string;
  count: number;
}

/** The buyer funnel, with its denominator named rather than inferred. */
export interface PlatformFunnel {
  /** Widest to narrowest: storefront views → product views → cart → checkout → orders. */
  stages: PlatformFunnelStage[];
  /** The `key` of `stages[0]`. The only legitimate denominator for a top-of-funnel rate. */
  topOfFunnelKey: string;
  /**
   * Every storefront event of every type in the window.
   *
   * This is the **sum** of the stages, not their top, and it is named so it cannot be mistaken for
   * an arrival count. Using it as top-of-funnel put each numerator inside its own denominator.
   */
  allEventsInWindow: number;
}

/**
 * The window this window is compared against.
 *
 * `measured` is the distinction the console kept losing. A `*PrevWindow` figure of `0` is a
 * **measurement** when the platform existed through that period, and an absence of history when it
 * did not. Only the second is honestly described as "no previous period to compare against".
 */
export interface PlatformComparison {
  start: string;
  end: string;
  measured: boolean;
  /** When the platform's first store was created. */
  platformSince: string;
}

/** `GET /api/platform/overview?days=N` → `data`. */
export interface PlatformOverview {
  window: { days: number; start: string; end: string };
  /** Optional: older deployments do not describe their baseline window. */
  comparison?: PlatformComparison;
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
    /**
     * Orders dispatched in the equally-sized window immediately before this one.
     *
     * Optional at the type level rather than required, because a deployment running an older
     * `/api/platform/overview` simply does not send it. `undefined` and `0` are different facts —
     * "we did not compute a baseline" versus "the baseline was zero" — and {@link MetricDelta}
     * renders them as two different sentences. Defaulting the missing case to `0` here would
     * collapse the two and print a change against a baseline nobody measured.
     */
    shippedPrevWindow?: number;
    deliveredAllTime: number;
    /** Cancelled orders in the window. Inside `receivedInWindow`, never quietly removed from it. */
    cancelledInWindow?: number;
    /** Cancelled orders ever. */
    cancelledAllTime?: number;
    /** Orders in the window that settled — the population `avgOrderValueCents` averages over. */
    settledInWindow?: number;
    /** `null` when nothing was received: an unmeasured rate, never `0%`. */
    fulfillmentRatePct: number | null;
    /** The same rate over all time, so the console does not have to derive a second one. */
    fulfillmentRateAllTimePct?: number | null;
    avgHoursToShip: number | null;
    /** `null` when no order settled in the window — never `$0.00`. */
    avgOrderValueCents: number | null;
  };
  revenue: {
    gmvCentsAllTime: number;
    gmvCentsInWindow: number;
    gmvCentsPrevWindow: number;
    /**
     * Refunds on **settled** orders — the same order set GMV is built from.
     *
     * The only refund figure `GMV − refunded` may legitimately be computed from. Aliased by the
     * contract name `refundedCentsInWindow`.
     */
    refundedSettledCentsInWindow?: number;
    /** The settled refund figure for the preceding window. */
    refundedSettledCentsPrevWindow?: number;
    /**
     * Refunds issued on **cancelled** orders.
     *
     * Real money returned to buyers, of value GMV never contained. Reported separately precisely so
     * that it cannot be subtracted from a total that never held it.
     */
    refundedCancelledCentsInWindow?: number;
    /** The two together: every dollar that went back to a buyer in the window. */
    refundedTotalCentsInWindow?: number;
    /** How many orders were refunded in the window. */
    refundedOrdersInWindow?: number;
    /** How many of those were also cancelled — the overlap, published rather than left to inference. */
    refundedCancelledOrdersInWindow?: number;
    /** Alias of {@link refundedSettledCentsInWindow}. */
    refundedCentsInWindow: number;
    /** Refunds in the equally-sized window before this one. Optional for the reason above. */
    refundedCentsPrevWindow?: number;
    /**
     * Booked inside the window, not cancelled, never paid.
     *
     * Its own figure and never folded into GMV: an order sitting here is a checkout or a
     * payment-capture problem, and it is the number that says so.
     */
    gmvUnsettledCentsInWindow?: number;
    /** Value of the orders cancelled inside the window. Disjoint from GMV by construction. */
    gmvCancelledCentsInWindow?: number;
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
  /** Optional: older deployments derive the funnel from the `traffic` block instead. */
  funnel?: PlatformFunnel;
  conversion: {
    /** Orders per storefront view. `null` below the sample floor, never `0%`. */
    storefrontViewToOrderPct?: number | null;
    clickToOrderPct: number | null;
    cartToOrderPct: number | null;
    /** The denominator the click rate was computed from: storefront views, not every event. */
    clickSample?: number;
    /** Which event type `clickSample` counts, so a screen can label the rate. */
    clickSampleEvent?: string;
    cartSample?: number;
    minClickSample?: number;
    minCartSample?: number;
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

/** One store's stuck-order backlog: settled orders past 48 hours with no dispatch recorded. */
export interface PlatformUnfulfilledStore {
  storeId: string;
  storeName: string;
  /** How many orders are stuck. */
  count: number;
  /** What that backlog is worth, in integer cents. */
  stuckCents: number;
  /** Age of the oldest one, in hours. */
  oldestAgeHours: number;
}

/**
 * The stuck-order backlog, platform-wide and per store.
 *
 * The scalar `unfulfilledOver48h` answers "how many"; this answers the two questions an operator
 * asks straight afterwards — *how much money* and *whose*. Both were computed and neither reached
 * a screen, so the console made someone add up two alert cards by hand to learn the total.
 */
export interface PlatformUnfulfilledBacklog {
  total: number;
  totalCents: number;
  /** Age of the oldest stuck order anywhere, in hours, or `null` when there is no backlog. */
  oldestAgeHours: number | null;
  /** Worst first. Stores with no backlog do not appear. */
  stores: PlatformUnfulfilledStore[];
}

/** `GET /api/platform/health` → `data`. */
export interface PlatformHealth {
  counts: { healthy: number; stale: number; failing: number; notConnected: number };
  jobs: { pending: number; failed: number; processing: number };
  unfulfilledOver48h: number;
  /** The same backlog with the parts that make it actionable. Optional on older deployments. */
  unfulfilled?: PlatformUnfulfilledBacklog;
  stores: PlatformHealthStore[];
  alerts: PlatformHealthAlert[];
}
