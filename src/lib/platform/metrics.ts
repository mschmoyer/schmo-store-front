/**
 * Platform-wide metrics: the operator's answer to "how is the platform doing?".
 *
 * Every other query library in this codebase is deliberately tenant-scoped — `store_id` in the
 * `WHERE` clause is the security boundary. This module is the one place that reads *across* the
 * tenancy, so it does the opposite: it aggregates and never returns a single merchant's row-level
 * data. That inversion is why it lives on its own rather than in `src/lib/services/`, and why
 * every function here is called only from `/api/platform/**`, behind `requirePlatformAdmin`.
 *
 * Four decisions shape the SQL below, and each of them has bitten this codebase before:
 *
 * **1. One aggregate query per subject, run concurrently — never a query per store.** An overview
 * that loops over stores is an N+1 that gets slower with every merchant who signs up, which is
 * precisely backwards for a growth dashboard. {@link getPlatformOverview} issues six aggregate
 * statements in a single `Promise.all`; each is one pass over one table (plus small grouped
 * sub-selects that the planner hash-joins), so the cost tracks the size of the data, not the
 * number of tenants.
 *
 * **2. Postgres hands back `numeric`, `bigint` and `COUNT(*)` as JavaScript *strings*.** Every
 * number that leaves this module goes through {@link toNumber} or {@link toNullableNumber}. A
 * missed coercion does not throw — it produces `"12" + "8" === "128"` in whatever component adds
 * two tiles together, which is the kind of defect that reaches production looking like a data
 * problem.
 *
 * **3. Money is converted to integer cents at the SQL boundary.** `orders.total_amount` and friends
 * are `numeric` *dollars*. `ROUND(SUM(total_amount) * 100)::bigint` does the multiply in Postgres'
 * exact arithmetic; doing it in JavaScript would be float arithmetic on money, which the project's
 * rules forbid outright.
 *
 * **4. Ratios never divide by zero.** A brand-new platform has no clicks and no orders, and a
 * dashboard that renders `NaN%` or `Infinity%` on day one is worse than one that renders `0%`.
 * {@link ratioPct} is the only division in this file and it returns `0` for an empty denominator.
 *
 * ### Time
 *
 * The window is a whole number of **UTC calendar days ending now**: `days = 30` means the start of
 * the UTC day 29 days ago through this instant. That definition is chosen so the overview totals
 * and the timeseries agree exactly — `storefront_click_daily` is bucketed by UTC date, and a window
 * that started at an arbitrary time of day would slice its first bucket in half and make the
 * timeseries sum disagree with the headline number.
 *
 * The older tables in this schema (`orders`, `stores`, `products`) use naive `timestamp` columns
 * holding UTC, while `storefront_click_events.occurred_at` is `timestamptz`. Rather than trust the
 * session timezone to reconcile them, every bound is bound as an ISO instant and cast explicitly:
 * `$1::timestamptz` against the aware column, `($1::timestamptz AT TIME ZONE 'UTC')` against the
 * naive ones. Nothing here depends on the server's `TimeZone` setting.
 */

import { db } from '@/lib/database/connection';
import { CUSTOMIZED_THEME_JOIN, customizedPredicate } from '@/lib/platform/customization';
import { SETTLED_ORDER_PREDICATE, UNSETTLED_ORDER_PREDICATE } from '@/lib/platform/customers';

/** Default reporting window, in days, when the caller does not ask for one. */
export const DEFAULT_WINDOW_DAYS = 30;

/** Narrowest window the API will report on. */
export const MIN_WINDOW_DAYS = 1;

/**
 * Widest window the API will report on. A year of daily buckets is 365 rows — comfortably
 * chartable — and the cap stops `?days=100000` from generating a series Postgres has to
 * materialise.
 */
export const MAX_WINDOW_DAYS = 365;

/** A ShipStation integration that has not synced within this many hours is `stale`. */
export const STALE_SYNC_HOURS = 24;

/** A paid, unshipped order older than this many hours is worth an operator's attention. */
export const UNFULFILLED_ALERT_HOURS = 48;

/**
 * Fewest clicks a click-to-order ratio may be computed from.
 *
 * Not a statistical threshold so much as an editorial one: below about a hundred clicks a single
 * order moves the percentage by more than a point, and a number that jumpy presented as a headline
 * is worse than no number at all.
 */
export const MIN_CLICK_SAMPLE = 100;

/** Fewest add-to-cart events a cart-to-order ratio may be computed from. */
export const MIN_CART_SAMPLE = 30;

/**
 * Upper bound on the alert list. Health is a triage screen: fifty rows of "not connected" is not
 * more actionable than the ten worst, it is just longer.
 */
export const MAX_ALERTS = 25;

/** How many stores of one kind (failing, stale, backlogged) get their own alert row. */
const MAX_ALERTS_PER_KIND = 8;

/** Longest slice of a sync error message that reaches the client. */
const ERROR_MESSAGE_LIMIT = 300;

/**
 * `sync_status` values that mean the last sync attempt failed.
 *
 * Read from the live schema rather than assumed: `recordSyncStatus()` in
 * `src/lib/shipstation/credentials.ts` writes `running` / `completed` / `failed`, the column
 * default is `pending`, and `src/types/database.ts` also declares `syncing`. `error` is included
 * defensively because older rows in some environments carry it.
 */
const FAILING_SYNC_STATUSES = ['failed', 'error'] as const;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** The reporting window a payload was computed over. */
export interface PlatformWindow {
  /** Width of the window in whole UTC days. */
  days: number;
  /** Start of the window, inclusive — midnight UTC, `days - 1` days before today. */
  start: string;
  /** End of the window, exclusive — the instant the request was served. */
  end: string;
}

/** Merchant counts. "Merchant" means a row in `stores`, not a user. */
export interface PlatformMerchantMetrics {
  total: number;
  /**
   * Traded in the window: at least one non-cancelled order.
   *
   * Deliberately **not** `stores.is_active`, which is set true at creation and never set false by
   * any code path — a tile sourced from it can only ever read 100%.
   */
  active: number;
  newInWindow: number;
  /** The equally-sized window immediately before this one, so the UI can show a delta. */
  newPrevWindow: number;
  /** Publicly visible *and* carrying at least one active product — a store a buyer could use. */
  launched: number;
  /** Stores with at least one non-cancelled order, ever. */
  withOrders: number;
}

/** Buyer traffic onto merchant storefronts. */
export interface PlatformTrafficMetrics {
  clicksAllTime: number;
  clicksInWindow: number;
  clicksPrevWindow: number;
  uniqueVisitorsInWindow: number;
  /** Event-type breakdown, all within the window. */
  storefrontViews: number;
  productViews: number;
  addToCart: number;
  checkoutStarts: number;
}

/** Order flow. "Received" excludes cancellations, matching `ORDER_REVENUE_STATUSES`. */
export interface PlatformOrderMetrics {
  receivedAllTime: number;
  receivedInWindow: number;
  receivedPrevWindow: number;
  shippedAllTime: number;
  shippedInWindow: number;
  deliveredAllTime: number;
  /**
   * Throughput: `shippedInWindow / receivedInWindow`, as a percentage.
   *
   * Two different populations — an order received before the window can ship inside it — so this
   * exceeds 100% while a backlog is cleared and understates service during growth. Read
   * {@link cohortFulfillmentRatePct} beside it. `0` when nothing was received.
   */
  fulfillmentRatePct: number;
  /** Of the orders *received* in the window, the percentage that have shipped. Never exceeds 100. */
  cohortFulfillmentRatePct: number;
  /** Of the orders received in the window, the percentage dispatched within 48 hours. */
  shippedWithin48hPct: number;
  /** Mean hours between order creation and dispatch, for orders shipped in the window. */
  avgHoursToShip: number | null;
  /** Median hours to ship. The mean hides a long tail; this does not. */
  medianHoursToShip: number | null;
  /** 90th-percentile hours to ship — the slowest tenth of dispatches. */
  p90HoursToShip: number | null;
  /** Mean settled order value: settled GMV over settled orders, in whole cents. */
  avgOrderValueCents: number;
}

/**
 * Gross merchandise value and refunds, in integer cents.
 *
 * **Every `gmv*` figure here is settled**: cancelled orders and orders whose payment never
 * succeeded are excluded. The money those orders represent is not discarded — it is reported as
 * {@link gmvUnsettledCentsInWindow} and {@link gmvCancelledCentsInWindow}, because an operator who
 * can only see settled revenue cannot tell a slow sales month from a broken checkout.
 *
 * The `gmvSettledCents*` names are the canonical ones. `gmvCents*` are the same numbers under the
 * names the console contract was written with, kept so the UI does not have to change in lockstep;
 * they are equal by construction and cannot drift.
 */
export interface PlatformRevenueMetrics {
  /** Canonical. Settled GMV, all time. */
  gmvSettledCentsAllTime: number;
  /** Canonical. Settled GMV inside the window. */
  gmvSettledCentsInWindow: number;
  /** Canonical. Settled GMV in the equally-sized window immediately before this one. */
  gmvSettledCentsPrevWindow: number;
  /** Booked but not settled inside the window: not cancelled, no successful payment recorded. */
  gmvUnsettledCentsInWindow: number;
  /** Value of orders cancelled inside the window. */
  gmvCancelledCentsInWindow: number;
  /** Alias of {@link gmvSettledCentsAllTime}. */
  gmvCentsAllTime: number;
  /** Alias of {@link gmvSettledCentsInWindow}. */
  gmvCentsInWindow: number;
  /** Alias of {@link gmvSettledCentsPrevWindow}. */
  gmvCentsPrevWindow: number;
  refundedCentsInWindow: number;
  unitsSoldInWindow: number;
}

/** Catalogue size and stock position across every store. */
export interface PlatformCatalogMetrics {
  products: number;
  activeProducts: number;
  inventoryUnits: number;
  /** Valued at cost where a cost is known, otherwise at list price. */
  inventoryValueCents: number;
  outOfStock: number;
}

/** How far merchants have got through setup. */
export interface PlatformIntegrationMetrics {
  shipstationConnected: number;
  stripeConnected: number;
  bothConnected: number;
  themeCustomized: number;
  publishedStores: number;
}

/**
 * Funnel ratios, as percentages rounded to two decimals.
 *
 * **`null` means "not enough traffic to say"**, and it is a deliberate answer rather than a missing
 * one. A percentage computed from twenty-three clicks is arithmetically correct and editorially a
 * lie: `82.61` reads as "82% of visitors buy" whether it came from 19 orders in 23 clicks or 8,261
 * in 10,000. Below {@link MIN_CLICK_SAMPLE} clicks (or {@link MIN_CART_SAMPLE} add-to-carts) the
 * API returns `null` so the console can render an em dash and the raw counts instead of a headline.
 * The sample sizes are returned alongside so the UI can explain itself without a second request.
 */
export interface PlatformConversionMetrics {
  /** Orders per click, as a percentage, or `null` when the sample is too small to report. */
  clickToOrderPct: number | null;
  /** Orders per add-to-cart, as a percentage, or `null` when the sample is too small. */
  cartToOrderPct: number | null;
  /** Clicks the click-to-order ratio was computed from. */
  clickSample: number;
  /** Add-to-cart events the cart-to-order ratio was computed from. */
  cartSample: number;
  /** The floor `clickSample` had to clear. */
  minClickSample: number;
  /** The floor `cartSample` had to clear. */
  minCartSample: number;
}

/** The `/api/platform/overview` payload. */
export interface PlatformOverview {
  window: PlatformWindow;
  merchants: PlatformMerchantMetrics;
  traffic: PlatformTrafficMetrics;
  orders: PlatformOrderMetrics;
  revenue: PlatformRevenueMetrics;
  catalog: PlatformCatalogMetrics;
  integrations: PlatformIntegrationMetrics;
  conversion: PlatformConversionMetrics;
}

/** One UTC day in the timeseries. Every day in the window is present, gaps zero-filled. */
export interface PlatformTimeseriesDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  clicks: number;
  uniqueVisitors: number;
  orders: number;
  shipped: number;
  gmvCents: number;
  /** New stores created that day. */
  signups: number;
}

/** The `/api/platform/timeseries` payload. */
export interface PlatformTimeseries {
  days: PlatformTimeseriesDay[];
}

/** How a store's ShipStation integration is doing. */
export type PlatformStoreState = 'healthy' | 'stale' | 'failing' | 'not_connected';

/** One row of the health table. */
export interface PlatformStoreHealth {
  storeId: string;
  storeName: string;
  syncStatus: string | null;
  /** ISO instant, or `null` when the store has never synced. */
  lastSyncAt: string | null;
  errorMessage: string | null;
  state: PlatformStoreState;
}

/** Severity ordering used to sort {@link PlatformAlert}s. */
export type PlatformAlertSeverity = 'critical' | 'warning' | 'info';

/** Something an operator should do something about. */
export interface PlatformAlert {
  severity: PlatformAlertSeverity;
  title: string;
  detail: string;
  storeId: string | null;
  storeName: string | null;
  /** Where to go to act on it, or `null` for a platform-wide condition with no single subject. */
  href: string | null;
}

/** Counts of stores by {@link PlatformStoreState}. */
export interface PlatformHealthCounts {
  healthy: number;
  stale: number;
  failing: number;
  notConnected: number;
}

/** Background job queue depth. */
export interface PlatformJobCounts {
  /** `pending` and `retrying` together — both are work that has not run yet. */
  pending: number;
  failed: number;
  processing: number;
}

/** One store's stuck-order backlog. */
export interface PlatformUnfulfilledStore {
  storeId: string;
  storeName: string;
  /** Settled orders past the threshold with no dispatch recorded. */
  count: number;
  /** What that backlog is worth, in integer cents. */
  stuckCents: number;
  /** Age of the oldest one, in hours. */
  oldestAgeHours: number;
}

/** The stuck-order backlog, platform-wide and per store. */
export interface PlatformUnfulfilledBacklog {
  total: number;
  totalCents: number;
  /** Age of the oldest stuck order anywhere, in hours, or `null` when there is no backlog. */
  oldestAgeHours: number | null;
  /** Worst first. One row per affected store; stores with no backlog do not appear. */
  stores: PlatformUnfulfilledStore[];
}

/** The `/api/platform/health` payload. */
export interface PlatformHealth {
  counts: PlatformHealthCounts;
  jobs: PlatformJobCounts;
  /** Total stuck orders. Kept as a scalar for the contract; {@link unfulfilled} carries the detail. */
  unfulfilledOver48h: number;
  /** The same backlog with the parts that make it actionable: value, age and which store. */
  unfulfilled: PlatformUnfulfilledBacklog;
  stores: PlatformStoreHealth[];
  alerts: PlatformAlert[];
}

// ---------------------------------------------------------------------------
// Row shapes. Type aliases rather than interfaces: `db.query<T>` constrains
// `T extends Record<string, unknown>`, which an interface does not satisfy
// without an explicit index signature.
// ---------------------------------------------------------------------------

type CountRow = Record<string, string | null>;

type TimeseriesRow = {
  day: string;
  clicks: string;
  unique_visitors: string;
  orders: string;
  shipped: string;
  gmv_cents: string;
  signups: string;
};

type StoreHealthRow = {
  store_id: string;
  store_name: string;
  sync_status: string | null;
  last_sync_at: Date | null;
  sync_error_message: string | null;
  state: PlatformStoreState;
};

type UnfulfilledRow = {
  store_id: string;
  store_name: string;
  unfulfilled: string;
  stuck_cents: string;
  oldest_age_hours: string | null;
};

// ---------------------------------------------------------------------------
// Coercion and arithmetic helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a driver value to a finite number.
 *
 * `COUNT(*)`, `SUM(...)` and every `numeric` column arrive as strings, and an aggregate over zero
 * rows arrives as `null`. Both become `0` here so a caller never has to guard.
 *
 * @param value - Whatever `pg` put in the column.
 * @returns The value as a finite number, or `0` for `null`, `undefined` or unparseable input.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Coerce a driver value to a number, preserving the difference between "zero" and "no data".
 *
 * Used for averages: a window in which nothing shipped has *no* mean time-to-ship, and reporting
 * `0` there would claim every order went out instantly.
 *
 * @param value - Whatever `pg` put in the column.
 * @returns The value as a finite number, or `null` when the column was `null` or unparseable.
 */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A percentage that is safe on an empty platform.
 *
 * @param numerator - The part.
 * @param denominator - The whole.
 * @returns `numerator / denominator * 100` rounded to two decimals, or `0` when the denominator is
 *          zero, negative or not a number — never `NaN` and never `Infinity`.
 */
export function ratioPct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * A percentage that refuses to answer on too small a sample.
 *
 * {@link ratioPct} already refuses to divide by zero. This refuses to *mislead*: a ratio drawn from
 * a handful of clicks is arithmetically fine and editorially worthless, so below the floor it
 * returns `null` and lets the caller render an em dash beside the raw counts.
 *
 * @param numerator - The part.
 * @param denominator - The whole, which is also the sample size.
 * @param minimumSample - Fewest observations the ratio may be computed from.
 * @returns The percentage to two decimals, or `null` when the sample is below the floor.
 */
export function sampledRatioPct(
  numerator: number,
  denominator: number,
  minimumSample: number,
): number | null {
  if (!Number.isFinite(denominator) || denominator < minimumSample || denominator <= 0) return null;
  return ratioPct(numerator, denominator);
}

/**
 * Mean value of a set of orders, in whole cents.
 *
 * @param totalCents - Summed order value, in integer cents.
 * @param orderCount - How many orders that sum covers.
 * @returns The mean rounded to the nearest cent, or `0` when there were no orders.
 */
export function averageCents(totalCents: number, orderCount: number): number {
  if (!Number.isFinite(totalCents) || !Number.isFinite(orderCount) || orderCount <= 0) return 0;
  return Math.round(totalCents / orderCount);
}

/**
 * Clamp a caller-supplied `?days=` value to something this module will report on.
 *
 * A query string is input to validate, never a fact: anything missing, non-numeric or out of range
 * falls back to {@link DEFAULT_WINDOW_DAYS} or the nearest bound rather than reaching SQL.
 *
 * @param raw - The raw query-string value, if any.
 * @returns A whole number of days between {@link MIN_WINDOW_DAYS} and {@link MAX_WINDOW_DAYS}.
 */
export function resolveWindowDays(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_WINDOW_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_WINDOW_DAYS;
  const whole = Math.floor(parsed);
  if (whole < MIN_WINDOW_DAYS) return MIN_WINDOW_DAYS;
  if (whole > MAX_WINDOW_DAYS) return MAX_WINDOW_DAYS;
  return whole;
}

/** The window, resolved into every form the queries need. */
interface WindowBounds {
  days: number;
  /** Midnight UTC, `days - 1` days before today. */
  start: Date;
  /** Now. */
  end: Date;
  /** Midnight UTC, `days` days before {@link start} — the comparison window. */
  prevStart: Date;
  /** `start` as `YYYY-MM-DD`, for the date-keyed daily rollup. */
  startDay: string;
  /** `end` as `YYYY-MM-DD`. */
  endDay: string;
  /** `prevStart` as `YYYY-MM-DD`. */
  prevStartDay: string;
}

/**
 * The UTC calendar date of an instant, as `YYYY-MM-DD`.
 *
 * @param date - Any instant.
 * @returns Its UTC date, formatted the way `storefront_click_daily.day` and the timeseries use.
 */
function utcDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve a day count into concrete window bounds.
 *
 * Exported so a test can assert the boundary arithmetic without a database, and so a caller can
 * report the same `window` it queried over.
 *
 * @param days - Window width in whole UTC days, already clamped by {@link resolveWindowDays}.
 * @param now - The instant the window ends. Injectable so tests are not clock-dependent.
 * @returns Every representation of the window the queries need.
 */
export function resolveWindow(days: number, now: Date = new Date()): WindowBounds {
  const end = new Date(now.getTime());
  const startOfToday = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(startOfToday - (days - 1) * dayMs);
  const prevStart = new Date(start.getTime() - days * dayMs);

  return {
    days,
    start,
    end,
    prevStart,
    startDay: utcDayString(start),
    endDay: utcDayString(end),
    prevStartDay: utcDayString(prevStart),
  };
}

/**
 * The public description of a window.
 *
 * @param bounds - Resolved window bounds.
 * @returns The `{ days, start, end }` object the API contract returns.
 */
function describeWindow(bounds: WindowBounds): PlatformWindow {
  return {
    days: bounds.days,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * What counts as money that actually moved — imported, not restated.
 *
 * {@link SETTLED_ORDER_PREDICATE} and {@link UNSETTLED_ORDER_PREDICATE} live in
 * `src/lib/platform/customers.ts` because the per-store list needs them too, and the two surfaces
 * *must* agree: the customers table sums to the number in the overview tile, and an operator who
 * finds it does not will stop trusting both. This module therefore imports them rather than
 * keeping a second copy — the same mistake, made once already with the customization rule, that
 * produced "0 stores customized" above a table where every row said "Customized".
 *
 * Why the rule is what it is (the full argument is at the definition): getting it wrong is not a
 * rounding error. On the demo data, "every order created in the window" is 343,126 cents while
 * "every order whose payment settled" is 260,347 — roughly a quarter of the headline figure is
 * cancellations and checkouts that never completed. Two payment statuses are named because two
 * writers populate the column: real checkout writes `'paid'`, the demo seed writes `'completed'`.
 * `paid_at` is not used: nothing but real checkout writes it, so keying off it would report zero
 * revenue in development.
 *
 * Both predicates are written against the alias `o`, which every order query below uses. Each is
 * wrapped in parentheses at the call site: `UNSETTLED_ORDER_PREDICATE` contains an `OR`, and an
 * unparenthesised `OR` inside a `FILTER (WHERE ...)` conjunction silently widens the filter.
 */

/** `orders` created inside the current window. `$1` = window start, `$3` = window end. */
const ORDER_IN_WINDOW = `(o.created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
                          AND o.created_at <  ($3::timestamptz AT TIME ZONE 'UTC'))`;

/** `orders` created inside the comparison window. `$2` = its start, `$1` = its end. */
const ORDER_IN_PREV_WINDOW = `(o.created_at >= ($2::timestamptz AT TIME ZONE 'UTC')
                               AND o.created_at <  ($1::timestamptz AT TIME ZONE 'UTC'))`;

/** `orders` dispatched inside the current window. */
const SHIPPED_IN_WINDOW = `(o.shipped_at >= ($1::timestamptz AT TIME ZONE 'UTC')
                            AND o.shipped_at <  ($3::timestamptz AT TIME ZONE 'UTC'))`;

/**
 * Hours between an order being placed and being dispatched.
 *
 * Guarded everywhere it is used by `shipped_at >= created_at`: a dispatch that precedes the order
 * is not a fast fulfilment, it is impossible, and one such row drags a mean negative.
 */
const HOURS_TO_SHIP = `(EXTRACT(EPOCH FROM (o.shipped_at - o.created_at)) / 3600.0)`;

/** The measurable dispatch population: shipped inside the window, with a sane duration. */
const SHIPPED_MEASURABLE = `(${SHIPPED_IN_WINDOW} AND o.shipped_at >= o.created_at)`;


/**
 * Merchant counts.
 *
 * Plan: one scan of `stores` hash-joined to two grouped sub-selects (`products`, `orders`). The
 * sub-selects are aggregated *before* the join, so neither can fan the store rows out — a
 * `LEFT JOIN` straight onto `products` would count each store once per product, which is the exact
 * shape of the inventory-tile defect this codebase already shipped once.
 *
 * **`active` is behavioural, not a flag.** `stores.is_active` is set `TRUE` when a store is created
 * and no code path in this repository ever sets it back — `grep` for it and every hit is a filter,
 * never an update. A tile sourced from it can only ever read 100%, which is not a metric, it is a
 * constant wearing a metric's clothes. So `active` here means *traded in the window*: at least one
 * non-cancelled order. That number can go down, which is the whole point of putting it on a
 * dashboard.
 *
 * Both new-merchant counts are bounded above as well as below. An open-ended `created_at >= start`
 * is the same defect in miniature that the window exists to prevent: it silently means "and
 * everything after", which reports the whole tenancy as new the moment the window is historical.
 *
 * `launched` deliberately means more than `is_public`: a store toggled public with an empty
 * catalogue is not a storefront anyone can buy from, so it needs at least one active product.
 */
const MERCHANTS_SQL = `
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE COALESCE(o.window_order_count, 0) > 0) AS active,
    COUNT(*) FILTER (WHERE s.created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
                       AND s.created_at <  ($3::timestamptz AT TIME ZONE 'UTC')) AS new_in_window,
    COUNT(*) FILTER (WHERE s.created_at >= ($2::timestamptz AT TIME ZONE 'UTC')
                       AND s.created_at <  ($1::timestamptz AT TIME ZONE 'UTC')) AS new_prev_window,
    COUNT(*) FILTER (WHERE s.is_active IS TRUE
                       AND s.is_public IS TRUE
                       AND COALESCE(p.active_products, 0) > 0) AS launched,
    COUNT(*) FILTER (WHERE COALESCE(o.order_count, 0) > 0) AS with_orders
  FROM stores s
  LEFT JOIN (
    SELECT store_id, COUNT(*) FILTER (WHERE is_active IS TRUE) AS active_products
      FROM products GROUP BY store_id
  ) p ON p.store_id = s.id
  LEFT JOIN (
    SELECT store_id,
           COUNT(*) AS order_count,
           COUNT(*) FILTER (WHERE created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
                              AND created_at <  ($3::timestamptz AT TIME ZONE 'UTC')) AS window_order_count
      FROM orders WHERE status <> 'cancelled' GROUP BY store_id
  ) o ON o.store_id = s.id
`;

/**
 * Click counts, from the daily rollup.
 *
 * `storefront_click_daily` exists so "every click ever recorded" is a sum over a few thousand
 * pre-aggregated rows rather than a scan of the event table, and it carries `event_type`, so the
 * funnel breakdown comes from the same single pass. Uniques cannot come from here — a distinct
 * count is not incrementable, which is why the rollup deliberately does not pretend to hold one.
 *
 * `day` is a UTC date, and the window starts at a UTC midnight, so the bucket boundaries line up
 * exactly with the window rather than slicing the first day in half.
 */
const CLICKS_SQL = `
  SELECT
    COALESCE(SUM(clicks), 0) AS clicks_all_time,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $1::date AND day <= $2::date), 0) AS clicks_in_window,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $3::date AND day < $1::date), 0) AS clicks_prev_window,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $1::date AND day <= $2::date
                                   AND event_type = 'storefront_view'), 0) AS storefront_views,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $1::date AND day <= $2::date
                                   AND event_type = 'product_view'), 0) AS product_views,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $1::date AND day <= $2::date
                                   AND event_type = 'add_to_cart'), 0) AS add_to_cart,
    COALESCE(SUM(clicks) FILTER (WHERE day >= $1::date AND day <= $2::date
                                   AND event_type = 'checkout_start'), 0) AS checkout_starts
  FROM storefront_click_daily
`;

/**
 * Unique visitors in the window, from the event table.
 *
 * `visitor_id` is the client-generated identifier; `ip_hash` is the salted fallback for a visitor
 * who arrived before one was issued. Rows with neither cannot be attributed to a person and are
 * excluded rather than collapsed into one phantom visitor by `COALESCE(NULL, NULL)`.
 *
 * Bounded by whole UTC **days**, not by the window's end instant, because the click figure it sits
 * beside comes from a rollup keyed by date and cannot be sliced mid-day. Today's bucket is
 * necessarily partial — it holds what has happened so far — and both numbers have to be partial in
 * the same way, or the console shows clicks with no visitors attached to them.
 *
 * `$1::date AT TIME ZONE 'UTC'` yields the `timestamptz` of that UTC midnight, so the comparison
 * stays sargable against `idx_click_events_time` instead of wrapping the column in a function.
 */
const UNIQUE_VISITORS_SQL = `
  SELECT COUNT(DISTINCT COALESCE(visitor_id, ip_hash)) AS unique_visitors
    FROM storefront_click_events
   WHERE occurred_at >= ($1::date AT TIME ZONE 'UTC')
     AND occurred_at <  (($2::date + 1) AT TIME ZONE 'UTC')
     AND COALESCE(visitor_id, ip_hash) IS NOT NULL
`;

/**
 * Orders, fulfilment and revenue, in one pass over `orders`.
 *
 * **Money.** `total_amount` and `refunded_amount` are `numeric` *dollars*, multiplied and rounded
 * to integer cents inside Postgres. Nothing downstream ever sees a dollar float. GMV uses
 * {@link settledPredicate}; the difference between booked and settled is returned as its own
 * figure rather than quietly dropped, because an operator who can only see settled revenue cannot
 * tell a slow sales month from a broken checkout.
 *
 * **"Received"** is `status <> 'cancelled'` — every order the platform took, paid or not. It is
 * deliberately a wider set than the settled one: order *count* measures demand, order *value*
 * measures revenue, and conflating them is how a dashboard reports a good month during an outage.
 * The merchant admin already shipped the opposite mistake once, filtering revenue to
 * `status = 'completed'` and hiding 61% of booked value.
 *
 * **Two fulfilment rates, because they answer different questions.**
 *   * `shipped_in_window / received_in_window` is throughput — what went out against what came in.
 *     Different populations, so it exceeds 100% while a merchant clears a backlog and collapses
 *     during a growth spurt. Useful, and misleading on its own.
 *   * `cohort_shipped / received_in_window` is service: *of the orders that arrived in this window,
 *     how many have gone out*. It cannot exceed 100% and it is the one to read during growth.
 *
 * **Distribution, not just the mean.** On the demo data the mean time to ship is 36.7 hours, which
 * sounds fine and hides four orders that have sat for more than sixty days. `percentile_cont`
 * returns the median and p90 from the same pass, which is what makes the tail visible.
 */
const ORDERS_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE o.status <> 'cancelled') AS received_all_time,
    COUNT(*) FILTER (WHERE o.status <> 'cancelled' AND ${ORDER_IN_WINDOW}) AS received_in_window,
    COUNT(*) FILTER (WHERE o.status <> 'cancelled' AND ${ORDER_IN_PREV_WINDOW}) AS received_prev_window,
    COUNT(*) FILTER (WHERE o.shipped_at IS NOT NULL) AS shipped_all_time,
    COUNT(*) FILTER (WHERE ${SHIPPED_IN_WINDOW}) AS shipped_in_window,
    COUNT(*) FILTER (WHERE o.delivered_at IS NOT NULL) AS delivered_all_time,

    COUNT(*) FILTER (WHERE o.status <> 'cancelled' AND ${ORDER_IN_WINDOW}
                       AND o.shipped_at IS NOT NULL) AS cohort_shipped,
    COUNT(*) FILTER (WHERE o.status <> 'cancelled' AND ${ORDER_IN_WINDOW}
                       AND o.shipped_at IS NOT NULL
                       AND o.shipped_at <= o.created_at + INTERVAL '48 hours') AS cohort_shipped_within_48h,

    AVG(${HOURS_TO_SHIP}) FILTER (WHERE ${SHIPPED_MEASURABLE}) AS avg_hours_to_ship,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ${HOURS_TO_SHIP})
      FILTER (WHERE ${SHIPPED_MEASURABLE}) AS p50_hours_to_ship,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ${HOURS_TO_SHIP})
      FILTER (WHERE ${SHIPPED_MEASURABLE}) AS p90_hours_to_ship,

    COUNT(*) FILTER (WHERE (${SETTLED_ORDER_PREDICATE}) AND ${ORDER_IN_WINDOW}) AS settled_in_window,

    ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE (${SETTLED_ORDER_PREDICATE})), 0) * 100)
      AS gmv_settled_cents_all_time,
    ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE (${SETTLED_ORDER_PREDICATE}) AND ${ORDER_IN_WINDOW}), 0) * 100)
      AS gmv_settled_cents_in_window,
    ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE (${SETTLED_ORDER_PREDICATE}) AND ${ORDER_IN_PREV_WINDOW}), 0) * 100)
      AS gmv_settled_cents_prev_window,
    ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE (${UNSETTLED_ORDER_PREDICATE}) AND ${ORDER_IN_WINDOW}), 0) * 100)
      AS gmv_unsettled_cents_in_window,
    ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'cancelled' AND ${ORDER_IN_WINDOW}), 0) * 100)
      AS gmv_cancelled_cents_in_window,

    -- Refunds are scoped to the SAME order set GMV is built from, so that GMV minus refunds is a
    -- number an operator may legitimately compute. Summing refunds across every order instead
    -- looks more complete and quietly breaks that: in the demo data every refunded order is also
    -- cancelled, so its value is already excluded from GMV — reporting the refund beside GMV
    -- invites the reader to subtract money that was never added. A refund on a cancelled order
    -- nets to zero on both sides of the tile, which is the honest treatment; what it must not do
    -- is appear on one side only.
    ROUND(COALESCE(SUM(o.refunded_amount) FILTER (
                     WHERE (${SETTLED_ORDER_PREDICATE})
                       AND COALESCE(o.refunded_at, o.created_at) >= ($1::timestamptz AT TIME ZONE 'UTC')
                       AND COALESCE(o.refunded_at, o.created_at) <  ($3::timestamptz AT TIME ZONE 'UTC')), 0) * 100)
      AS refunded_cents_in_window
  FROM orders o
`;

/**
 * Units sold in the window.
 *
 * Joined on both `order_id` *and* `store_id`: `order_items` carries its own tenant column, and
 * including it keeps the tenancy invariant true even in a cross-tenant aggregate — a row whose
 * `store_id` disagrees with its order's is corruption, and this join surfaces it as a missing unit
 * rather than silently attributing it to the wrong merchant.
 *
 * The window is applied to `orders.created_at` and **never** to `order_items.created_at`. That
 * column holds a single distinct value across all 119 rows in the local database and 114 of them
 * disagree with their parent order's date — it records when the row was written, not when the sale
 * happened. Dating anything off it has already shipped as a bug here once
 * (`docs/audits/admin-usefulness-critique.md`).
 */
const UNITS_SOLD_SQL = `
  SELECT COALESCE(SUM(oi.quantity), 0) AS units_sold_in_window
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.store_id = oi.store_id
   WHERE o.status <> 'cancelled'
     AND o.created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
     AND o.created_at <  ($2::timestamptz AT TIME ZONE 'UTC')
`;

/**
 * Catalogue and stock, one pass over `products`.
 *
 * Inventory is valued at `cost_price` where the merchant has recorded one and at `base_price`
 * otherwise, because valuing stock at retail overstates what the platform is actually holding.
 * `GREATEST(..., 0)` keeps a negative stock quantity — which oversells can produce — from
 * subtracting from the platform total.
 *
 * `out_of_stock` counts only active products that actually track inventory: a digital or
 * made-to-order product sitting at zero is not a stockout.
 */
const CATALOG_SQL = `
  SELECT
    COUNT(*) AS products,
    COUNT(*) FILTER (WHERE is_active IS TRUE) AS active_products,
    COALESCE(SUM(GREATEST(COALESCE(stock_quantity, 0), 0)), 0) AS inventory_units,
    ROUND(COALESCE(SUM(GREATEST(COALESCE(stock_quantity, 0), 0)
                       * COALESCE(cost_price, base_price)), 0) * 100) AS inventory_value_cents,
    COUNT(*) FILTER (WHERE is_active IS TRUE
                       AND track_inventory IS TRUE
                       AND COALESCE(stock_quantity, 0) <= 0) AS out_of_stock
  FROM products
`;

/**
 * Setup progress per store.
 *
 * Three `SELECT DISTINCT store_id` sub-selects are joined to `stores`, so each contributing table
 * is scanned once and no join can fan a store row out into several.
 *
 * **What counts as ShipStation connected**: a `store_integrations` row of type `shipstation` that
 * is `is_active` *and* holds an `api_key_encrypted`. The onboarding flow inserts an inactive,
 * key-less placeholder row for every store, so a bare `EXISTS` on the table would report the whole
 * tenancy as connected.
 *
 * **What counts as Stripe connected**: a `payment_accounts` row with `charges_enabled`. An account
 * that exists but cannot take a charge has not finished Connect onboarding.
 *
 * **What counts as theme customization**: not this module's call to make. The rule lives in
 * `src/lib/platform/customization.ts` and is imported by both this file and the customers list,
 * because the two had independently invented rules that disagreed completely — 0 of 3 stores here
 * against 3 of 3 there, which would have rendered "0 stores customized" directly above a table in
 * which every row said "Customized". One definition, one import, no second copy to keep in step.
 */
const INTEGRATIONS_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE ss.store_id IS NOT NULL) AS shipstation_connected,
    COUNT(*) FILTER (WHERE st.store_id IS NOT NULL) AS stripe_connected,
    COUNT(*) FILTER (WHERE ss.store_id IS NOT NULL AND st.store_id IS NOT NULL) AS both_connected,
    COUNT(*) FILTER (WHERE ${customizedPredicate('s', 'th')}) AS theme_customized,
    COUNT(*) FILTER (WHERE s.is_active IS TRUE AND s.is_public IS TRUE) AS published_stores
  FROM stores s
  LEFT JOIN (
    SELECT DISTINCT store_id FROM store_integrations
     WHERE integration_type = 'shipstation' AND is_active IS TRUE AND api_key_encrypted IS NOT NULL
  ) ss ON ss.store_id = s.id
  LEFT JOIN (
    SELECT DISTINCT store_id FROM payment_accounts WHERE charges_enabled IS TRUE
  ) st ON st.store_id = s.id
  LEFT JOIN (${CUSTOMIZED_THEME_JOIN}) th ON th.store_id = s.id
`;

/**
 * The zero-filled daily series.
 *
 * `generate_series` produces the calendar and every metric is `LEFT JOIN`ed onto it, so a day with
 * no activity is a row of zeros rather than a gap the chart library has to guess at. Each metric
 * is grouped once, by UTC date, over exactly the same range the overview uses — which is what makes
 * the series sum to the headline figures instead of merely resembling them.
 *
 * Two ranges, deliberately. Orders, shipments and signups are bounded by the window's *instants*
 * (`[start, now)`), because they are events with an exact time. Clicks and unique visitors are
 * bounded by whole UTC **days**, because `storefront_click_daily` is keyed by date and a partial
 * final bucket is the best it can offer. Mixing the two would put a click count and a visitor count
 * computed over different spans on the same row.
 *
 * `orders` counts every non-cancelled order; `gmv_cents` counts only the settled ones, exactly as
 * the overview does, so the series still sums to the tile above it.
 */
const TIMESERIES_SQL = `
  WITH bounds AS (
    SELECT $1::timestamptz AS win_start,
           $2::timestamptz AS win_end,
           $3::date        AS first_day,
           $4::date        AS last_day
  ),
  calendar AS (
    SELECT generate_series(
             (SELECT win_start FROM bounds) AT TIME ZONE 'UTC',
             (SELECT win_end   FROM bounds) AT TIME ZONE 'UTC',
             INTERVAL '1 day'
           )::date AS day
  ),
  clicks AS (
    SELECT d.day, SUM(d.clicks) AS clicks
      FROM storefront_click_daily d, bounds b
     WHERE d.day >= b.first_day AND d.day <= b.last_day
     GROUP BY d.day
  ),
  uniques AS (
    SELECT (e.occurred_at AT TIME ZONE 'UTC')::date AS day,
           COUNT(DISTINCT COALESCE(e.visitor_id, e.ip_hash)) AS unique_visitors
      FROM storefront_click_events e, bounds b
     WHERE e.occurred_at >= (b.first_day AT TIME ZONE 'UTC')
       AND e.occurred_at <  ((b.last_day + 1) AT TIME ZONE 'UTC')
       AND COALESCE(e.visitor_id, e.ip_hash) IS NOT NULL
     GROUP BY 1
  ),
  ordered AS (
    SELECT o.created_at::date AS day,
           COUNT(*) FILTER (WHERE o.status <> 'cancelled') AS orders,
           ROUND(COALESCE(SUM(o.total_amount) FILTER (WHERE (${SETTLED_ORDER_PREDICATE})), 0) * 100) AS gmv_cents
      FROM orders o, bounds b
     WHERE o.status <> 'cancelled'
       AND o.created_at >= (b.win_start AT TIME ZONE 'UTC')
       AND o.created_at <  (b.win_end   AT TIME ZONE 'UTC')
     GROUP BY 1
  ),
  shipped AS (
    SELECT o.shipped_at::date AS day, COUNT(*) AS shipped
      FROM orders o, bounds b
     WHERE o.shipped_at >= (b.win_start AT TIME ZONE 'UTC')
       AND o.shipped_at <  (b.win_end   AT TIME ZONE 'UTC')
     GROUP BY 1
  ),
  signups AS (
    SELECT st.created_at::date AS day, COUNT(*) AS signups
      FROM stores st, bounds b
     WHERE st.created_at >= (b.win_start AT TIME ZONE 'UTC')
       AND st.created_at <  (b.win_end   AT TIME ZONE 'UTC')
     GROUP BY 1
  )
  SELECT to_char(c.day, 'YYYY-MM-DD') AS day,
         COALESCE(cl.clicks, 0)          AS clicks,
         COALESCE(u.unique_visitors, 0)  AS unique_visitors,
         COALESCE(o.orders, 0)           AS orders,
         COALESCE(sh.shipped, 0)         AS shipped,
         COALESCE(o.gmv_cents, 0)        AS gmv_cents,
         COALESCE(sg.signups, 0)         AS signups
    FROM calendar c
    LEFT JOIN clicks  cl ON cl.day = c.day
    LEFT JOIN uniques u  ON u.day  = c.day
    LEFT JOIN ordered o  ON o.day  = c.day
    LEFT JOIN shipped sh ON sh.day = c.day
    LEFT JOIN signups sg ON sg.day = c.day
   ORDER BY c.day ASC
`;

/**
 * Every store with its ShipStation state.
 *
 * The `LEFT JOIN` predicate carries the whole definition of "connected" — active, of type
 * `shipstation`, and holding a key — so a store with a placeholder integration row lands in
 * `not_connected` rather than in `stale`, which is the honest answer: nothing is failing, nothing
 * has been set up.
 *
 * The `CASE` is ordered worst-first. A store that both failed and is old reads as `failing`,
 * because that is the fact an operator can act on.
 *
 * `last_sync_at` is a naive UTC timestamp, so it is compared against `NOW() AT TIME ZONE 'UTC'`
 * rather than `NOW()` — comparing it directly would silently reinterpret it in the session's
 * timezone and mislabel every store by that offset.
 */
const STORE_HEALTH_SQL = `
  SELECT
    s.id AS store_id,
    s.store_name,
    si.sync_status,
    si.last_sync_at,
    si.sync_error_message,
    CASE
      WHEN si.store_id IS NULL THEN 'not_connected'
      WHEN si.sync_status = ANY($1::text[]) OR si.sync_error_message IS NOT NULL THEN 'failing'
      WHEN si.last_sync_at IS NULL
        OR si.last_sync_at < ((NOW() AT TIME ZONE 'UTC') - ($2::int * INTERVAL '1 hour')) THEN 'stale'
      ELSE 'healthy'
    END AS state
  FROM stores s
  LEFT JOIN store_integrations si
    ON si.store_id = s.id
   AND si.integration_type = 'shipstation'
   AND si.is_active IS TRUE
   AND si.api_key_encrypted IS NOT NULL
  ORDER BY
    CASE
      WHEN si.store_id IS NULL THEN 3
      WHEN si.sync_status = ANY($1::text[]) OR si.sync_error_message IS NOT NULL THEN 0
      WHEN si.last_sync_at IS NULL
        OR si.last_sync_at < ((NOW() AT TIME ZONE 'UTC') - ($2::int * INTERVAL '1 hour')) THEN 1
      ELSE 2
    END,
    s.store_name ASC
`;

/**
 * Job queue depth.
 *
 * `retrying` is counted as `pending` because it is: work that has not succeeded and has not yet
 * been given up on. Splitting it out would let a queue full of retries look empty.
 */
const JOBS_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'retrying')) AS pending,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status = 'processing') AS processing
  FROM job_queue
`;

/**
 * Settled orders that have sat unshipped past the alert threshold, broken down by store.
 *
 * This is the highest-value query in the console, and a single integer throws almost all of it
 * away. "15 orders" is a statistic; "Ironline Fitness has 4 stuck orders worth $925, the oldest 87
 * days" is a phone call someone can make. So the query returns count, value and age per store, and
 * the total is folded from those rows.
 *
 * The payment test is {@link settledPredicate}, not `payment_status = 'completed'`. That literal
 * is the demo seed's success value; real checkout writes `'paid'`, so a query naming only the seed
 * value returns a reassuring zero in production — the exact failure mode this codebase's
 * "honest results" rule exists for.
 *
 * `paid_at` is NULL on every order the seed wrote, so the age falls back to `created_at`, which for
 * a settled order is at worst slightly conservative.
 */
const UNFULFILLED_SQL = `
  SELECT
    o.store_id,
    s.store_name,
    COUNT(*) AS unfulfilled,
    ROUND(COALESCE(SUM(o.total_amount), 0) * 100) AS stuck_cents,
    MAX(EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - COALESCE(o.paid_at, o.created_at))) / 3600.0)
      AS oldest_age_hours
    FROM orders o
    JOIN stores s ON s.id = o.store_id
   WHERE o.shipped_at IS NULL
     AND (${SETTLED_ORDER_PREDICATE})
     AND COALESCE(o.paid_at, o.created_at) < ((NOW() AT TIME ZONE 'UTC') - ($1::int * INTERVAL '1 hour'))
   GROUP BY o.store_id, s.store_name
   ORDER BY COUNT(*) DESC, s.store_name ASC
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Every headline figure on the platform overview.
 *
 * Six aggregate statements are issued concurrently — merchants, clicks, unique visitors, orders,
 * units, catalogue and integrations — so the route waits for the slowest rather than the sum. None
 * of them iterates stores, so adding merchants does not add round trips.
 *
 * An empty database is a normal state, not an error: every aggregate returns zero rows' worth of
 * `COALESCE`d zeros, so a platform on its first day renders zeros rather than a 500.
 *
 * @param days - Window width in whole UTC days. Clamp caller input with {@link resolveWindowDays}
 *               first; values outside the supported range are clamped here as well.
 * @param now - The instant the window ends. Injectable for deterministic tests.
 * @returns The full overview payload, every numeric field a real `number`.
 */
export async function getPlatformOverview(
  days: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): Promise<PlatformOverview> {
  const bounds = resolveWindow(resolveWindowDays(String(days)), now);
  const startIso = bounds.start.toISOString();
  const prevStartIso = bounds.prevStart.toISOString();
  const endIso = bounds.end.toISOString();

  const [merchantsResult, clicksResult, uniquesResult, ordersResult, unitsResult, catalogResult, integrationsResult] =
    await Promise.all([
      db.query<CountRow>(MERCHANTS_SQL, [startIso, prevStartIso, endIso]),
      db.query<CountRow>(CLICKS_SQL, [bounds.startDay, bounds.endDay, bounds.prevStartDay]),
      db.query<CountRow>(UNIQUE_VISITORS_SQL, [bounds.startDay, bounds.endDay]),
      db.query<CountRow>(ORDERS_SQL, [startIso, prevStartIso, endIso]),
      db.query<CountRow>(UNITS_SOLD_SQL, [startIso, endIso]),
      db.query<CountRow>(CATALOG_SQL),
      db.query<CountRow>(INTEGRATIONS_SQL),
    ]);

  const merchantsRow = merchantsResult.rows[0] ?? {};
  const clicksRow = clicksResult.rows[0] ?? {};
  const uniquesRow = uniquesResult.rows[0] ?? {};
  const ordersRow = ordersResult.rows[0] ?? {};
  const unitsRow = unitsResult.rows[0] ?? {};
  const catalogRow = catalogResult.rows[0] ?? {};
  const integrationsRow = integrationsResult.rows[0] ?? {};

  const traffic: PlatformTrafficMetrics = {
    clicksAllTime: toNumber(clicksRow.clicks_all_time),
    clicksInWindow: toNumber(clicksRow.clicks_in_window),
    clicksPrevWindow: toNumber(clicksRow.clicks_prev_window),
    uniqueVisitorsInWindow: toNumber(uniquesRow.unique_visitors),
    storefrontViews: toNumber(clicksRow.storefront_views),
    productViews: toNumber(clicksRow.product_views),
    addToCart: toNumber(clicksRow.add_to_cart),
    checkoutStarts: toNumber(clicksRow.checkout_starts),
  };

  const receivedInWindow = toNumber(ordersRow.received_in_window);
  const shippedInWindow = toNumber(ordersRow.shipped_in_window);
  const cohortShipped = toNumber(ordersRow.cohort_shipped);
  const settledInWindow = toNumber(ordersRow.settled_in_window);
  const gmvSettledCentsInWindow = toNumber(ordersRow.gmv_settled_cents_in_window);

  const orders: PlatformOrderMetrics = {
    receivedAllTime: toNumber(ordersRow.received_all_time),
    receivedInWindow,
    receivedPrevWindow: toNumber(ordersRow.received_prev_window),
    shippedAllTime: toNumber(ordersRow.shipped_all_time),
    shippedInWindow,
    deliveredAllTime: toNumber(ordersRow.delivered_all_time),
    // Throughput. Two different populations, so it can exceed 100% while a merchant works through
    // a backlog. Left uncapped rather than clamped into a prettier lie; the cohort rate beside it
    // is the one that cannot.
    fulfillmentRatePct: ratioPct(shippedInWindow, receivedInWindow),
    cohortFulfillmentRatePct: ratioPct(cohortShipped, receivedInWindow),
    shippedWithin48hPct: ratioPct(toNumber(ordersRow.cohort_shipped_within_48h), receivedInWindow),
    avgHoursToShip: roundHours(toNullableNumber(ordersRow.avg_hours_to_ship)),
    medianHoursToShip: roundHours(toNullableNumber(ordersRow.p50_hours_to_ship)),
    p90HoursToShip: roundHours(toNullableNumber(ordersRow.p90_hours_to_ship)),
    // Settled money over settled orders. Dividing settled GMV by *received* orders would deflate
    // the average by every unpaid basket in the window.
    avgOrderValueCents: averageCents(gmvSettledCentsInWindow, settledInWindow),
  };

  const gmvSettledCentsAllTime = toNumber(ordersRow.gmv_settled_cents_all_time);
  const gmvSettledCentsPrevWindow = toNumber(ordersRow.gmv_settled_cents_prev_window);

  const revenue: PlatformRevenueMetrics = {
    gmvSettledCentsAllTime,
    gmvSettledCentsInWindow,
    gmvSettledCentsPrevWindow,
    gmvUnsettledCentsInWindow: toNumber(ordersRow.gmv_unsettled_cents_in_window),
    gmvCancelledCentsInWindow: toNumber(ordersRow.gmv_cancelled_cents_in_window),
    // Contract-named aliases of the three above. Assigned from the same variables so they cannot
    // drift apart the way two hand-maintained copies of a rule always eventually do.
    gmvCentsAllTime: gmvSettledCentsAllTime,
    gmvCentsInWindow: gmvSettledCentsInWindow,
    gmvCentsPrevWindow: gmvSettledCentsPrevWindow,
    refundedCentsInWindow: toNumber(ordersRow.refunded_cents_in_window),
    unitsSoldInWindow: toNumber(unitsRow.units_sold_in_window),
  };

  return {
    window: describeWindow(bounds),
    merchants: {
      total: toNumber(merchantsRow.total),
      active: toNumber(merchantsRow.active),
      newInWindow: toNumber(merchantsRow.new_in_window),
      newPrevWindow: toNumber(merchantsRow.new_prev_window),
      launched: toNumber(merchantsRow.launched),
      withOrders: toNumber(merchantsRow.with_orders),
    },
    traffic,
    orders,
    revenue,
    catalog: {
      products: toNumber(catalogRow.products),
      activeProducts: toNumber(catalogRow.active_products),
      inventoryUnits: toNumber(catalogRow.inventory_units),
      inventoryValueCents: toNumber(catalogRow.inventory_value_cents),
      outOfStock: toNumber(catalogRow.out_of_stock),
    },
    integrations: {
      shipstationConnected: toNumber(integrationsRow.shipstation_connected),
      stripeConnected: toNumber(integrationsRow.stripe_connected),
      bothConnected: toNumber(integrationsRow.both_connected),
      themeCustomized: toNumber(integrationsRow.theme_customized),
      publishedStores: toNumber(integrationsRow.published_stores),
    },
    conversion: {
      clickToOrderPct: sampledRatioPct(receivedInWindow, traffic.clicksInWindow, MIN_CLICK_SAMPLE),
      cartToOrderPct: sampledRatioPct(receivedInWindow, traffic.addToCart, MIN_CART_SAMPLE),
      clickSample: traffic.clicksInWindow,
      cartSample: traffic.addToCart,
      minClickSample: MIN_CLICK_SAMPLE,
      minCartSample: MIN_CART_SAMPLE,
    },
  };
}

/**
 * Round an hours figure to one decimal, preserving `null`.
 *
 * `AVG()` returns full `numeric` precision — "34.500000000000000 hours" is noise in a tooltip.
 *
 * @param hours - The mean, or `null` when nothing shipped.
 * @returns The mean to one decimal place, or `null`.
 */
function roundHours(hours: number | null): number | null {
  if (hours === null) return null;
  return Math.round(hours * 10) / 10;
}

/**
 * The daily series behind the overview charts.
 *
 * One statement: the calendar is generated in SQL and every metric left-joined onto it, so the
 * result always contains exactly `days` rows in ascending order with gaps zero-filled — the caller
 * never has to reconcile a sparse result against a date axis.
 *
 * @param days - Window width in whole UTC days.
 * @param now - The instant the window ends. Injectable for deterministic tests.
 * @returns `{ days: [...] }`, one entry per UTC day, oldest first.
 */
export async function getPlatformTimeseries(
  days: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): Promise<PlatformTimeseries> {
  const bounds = resolveWindow(resolveWindowDays(String(days)), now);

  const result = await db.query<TimeseriesRow>(TIMESERIES_SQL, [
    bounds.start.toISOString(),
    bounds.end.toISOString(),
    bounds.startDay,
    bounds.endDay,
  ]);

  return {
    days: result.rows.map((row) => ({
      day: row.day,
      clicks: toNumber(row.clicks),
      uniqueVisitors: toNumber(row.unique_visitors),
      orders: toNumber(row.orders),
      shipped: toNumber(row.shipped),
      gmvCents: toNumber(row.gmv_cents),
      signups: toNumber(row.signups),
    })),
  };
}

/**
 * Operational health of every store's ShipStation integration, plus the queue and the backlog.
 *
 * Three statements run concurrently. The per-state counts are folded from the store rows already
 * in memory rather than asked for again — the list is one row per store and summing it in
 * JavaScript costs nothing, while a second `GROUP BY` would be a second round trip that could
 * disagree with the list beside it.
 *
 * @returns Counts, queue depth, the unfulfilled backlog, one row per store, and the alert list.
 */
export async function getPlatformHealth(): Promise<PlatformHealth> {
  const [storesResult, jobsResult, unfulfilledResult] = await Promise.all([
    db.query<StoreHealthRow>(STORE_HEALTH_SQL, [[...FAILING_SYNC_STATUSES], STALE_SYNC_HOURS]),
    db.query<CountRow>(JOBS_SQL),
    db.query<UnfulfilledRow>(UNFULFILLED_SQL, [UNFULFILLED_ALERT_HOURS]),
  ]);

  const stores: PlatformStoreHealth[] = storesResult.rows.map((row) => ({
    storeId: row.store_id,
    storeName: row.store_name,
    syncStatus: row.sync_status,
    lastSyncAt: toIsoOrNull(row.last_sync_at),
    errorMessage: truncate(row.sync_error_message, ERROR_MESSAGE_LIMIT),
    state: row.state,
  }));

  const counts: PlatformHealthCounts = {
    healthy: stores.filter((store) => store.state === 'healthy').length,
    stale: stores.filter((store) => store.state === 'stale').length,
    failing: stores.filter((store) => store.state === 'failing').length,
    notConnected: stores.filter((store) => store.state === 'not_connected').length,
  };

  const jobsRow = jobsResult.rows[0] ?? {};
  const jobs: PlatformJobCounts = {
    pending: toNumber(jobsRow.pending),
    failed: toNumber(jobsRow.failed),
    processing: toNumber(jobsRow.processing),
  };

  const backlogStores: PlatformUnfulfilledStore[] = unfulfilledResult.rows.map((row) => ({
    storeId: row.store_id,
    storeName: row.store_name,
    count: toNumber(row.unfulfilled),
    stuckCents: toNumber(row.stuck_cents),
    oldestAgeHours: roundHours(toNullableNumber(row.oldest_age_hours)) ?? 0,
  }));

  const unfulfilled: PlatformUnfulfilledBacklog = {
    total: backlogStores.reduce((sum, entry) => sum + entry.count, 0),
    totalCents: backlogStores.reduce((sum, entry) => sum + entry.stuckCents, 0),
    oldestAgeHours: backlogStores.length === 0
      ? null
      : backlogStores.reduce((oldest, entry) => Math.max(oldest, entry.oldestAgeHours), 0),
    stores: backlogStores,
  };

  return {
    counts,
    jobs,
    unfulfilledOver48h: unfulfilled.total,
    unfulfilled,
    stores,
    alerts: buildAlerts(stores, jobs, backlogStores),
  };
}

/**
 * Turn the health facts into a triage list.
 *
 * Every alert names what is wrong, which merchant it belongs to, and where to go — a row that says
 * only "sync failing" makes an operator go and find out which of forty stores it means. Alerts are
 * capped per kind and overall so one bad afternoon does not produce a thousand-row page; the
 * counts above the list remain the complete picture.
 *
 * @param stores - Per-store health rows, already ordered worst-first by the query.
 * @param jobs - Queue depth.
 * @param backlog - Per-store settled orders unshipped past the threshold, with value and age.
 * @returns Alerts sorted critical → warning → info, capped at {@link MAX_ALERTS}.
 */
function buildAlerts(
  stores: PlatformStoreHealth[],
  jobs: PlatformJobCounts,
  backlog: PlatformUnfulfilledStore[],
): PlatformAlert[] {
  const alerts: PlatformAlert[] = [];

  for (const store of stores.filter((entry) => entry.state === 'failing').slice(0, MAX_ALERTS_PER_KIND)) {
    alerts.push({
      severity: 'critical',
      title: `ShipStation sync is failing for ${store.storeName}`,
      detail: store.errorMessage
        ? `Last sync reported: ${store.errorMessage}`
        : `Sync status is "${store.syncStatus ?? 'unknown'}". Re-run the sync from the store's admin, then check the credentials.`,
      storeId: store.storeId,
      storeName: store.storeName,
      href: `/platform/customers/${store.storeId}`,
    });
  }

  for (const store of stores.filter((entry) => entry.state === 'stale').slice(0, MAX_ALERTS_PER_KIND)) {
    alerts.push({
      severity: 'warning',
      title: `${store.storeName} has not synced in over ${STALE_SYNC_HOURS} hours`,
      detail: store.lastSyncAt
        ? `Last successful sync was ${store.lastSyncAt}. Catalogue and fulfilment data may be out of date.`
        : 'The integration is connected but has never completed a sync.',
      storeId: store.storeId,
      storeName: store.storeName,
      href: `/platform/customers/${store.storeId}`,
    });
  }

  for (const entry of backlog.slice(0, MAX_ALERTS_PER_KIND)) {
    const oldestDays = Math.floor(entry.oldestAgeHours / 24);
    const age = oldestDays >= 1
      ? `${oldestDays} day${oldestDays === 1 ? '' : 's'}`
      : `${Math.round(entry.oldestAgeHours)} hours`;

    alerts.push({
      severity: entry.count >= 10 || oldestDays >= 7 ? 'critical' : 'warning',
      title: `${entry.storeName} has ${entry.count} paid order${entry.count === 1 ? '' : 's'} unshipped`,
      detail: `${formatCents(entry.stuckCents)} of settled orders with no dispatch recorded, the oldest waiting ${age}. These are the customers about to email.`,
      storeId: entry.storeId,
      storeName: entry.storeName,
      href: `/platform/customers/${entry.storeId}`,
    });
  }

  if (jobs.failed > 0) {
    alerts.push({
      severity: 'critical',
      title: `${jobs.failed} background job${jobs.failed === 1 ? '' : 's'} failed`,
      detail: 'Failed jobs are not retried automatically. Inspect job_queue and requeue or discard them.',
      storeId: null,
      storeName: null,
      href: null,
    });
  }

  const notConnected = stores.filter((entry) => entry.state === 'not_connected');
  for (const store of notConnected.slice(0, MAX_ALERTS_PER_KIND)) {
    alerts.push({
      severity: 'info',
      title: `${store.storeName} has not connected ShipStation`,
      detail: 'No active ShipStation credentials, so this store has no catalogue sync and no fulfilment push.',
      storeId: store.storeId,
      storeName: store.storeName,
      href: `/platform/customers/${store.storeId}`,
    });
  }

  const rank: Record<PlatformAlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, MAX_ALERTS);
}

/**
 * Render integer cents as a currency string for an alert body.
 *
 * Display only — the payload always carries the integer. Formatting here rather than in the console
 * keeps the alert a complete sentence that reads the same wherever it is surfaced.
 *
 * @param cents - Integer cents.
 * @returns A `$1,234.56`-style string.
 */
function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a driver timestamp as an ISO instant.
 *
 * @param value - A `Date` from `pg`, a string, or `null`.
 * @returns The ISO string, or `null` when there was no timestamp or it was unparseable.
 */
function toIsoOrNull(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Shorten a message for display.
 *
 * Sync error text is upstream-controlled and occasionally enormous; it is never a credential (the
 * ShipStation library masks those before it stores a message) but it does not belong in a payload
 * at arbitrary length.
 *
 * @param value - The message, if any.
 * @param limit - Maximum characters to keep.
 * @returns The message, truncated with an ellipsis, or `null`.
 */
function truncate(value: string | null, limit: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}
