/**
 * The merchant (customer) read model for the platform operator console.
 *
 * Every other query layer in this codebase answers *"what does this store own?"* and proves it with
 * a `store_id` in the `WHERE` clause. This module is the one deliberate exception: the list reads
 * across the whole tenancy because a cross-tenant view **is** the feature. The guard that makes
 * that safe lives one layer up (`requirePlatformAdmin`), so the rule here is narrower but no less
 * strict: **anything keyed to a single merchant — the detail, the order list, every sub-query
 * inside them — carries `store_id`.** A detail query that forgot it would silently show one
 * merchant another merchant's orders, which is worse than an error.
 *
 * Four things about the shape of the SQL below are deliberate, and each one is a defect this
 * codebase has already shipped once:
 *
 * **1. The list is not N+1.** The obvious implementation — page the stores, then loop and count
 * orders/products/clicks per store — issues 4×pageSize queries and gets slower as the platform
 * grows. Instead the per-store metrics are pre-aggregated in three grouped CTEs (one scan each
 * over `orders`, `products`, `storefront_click_daily`) and joined to `stores`. Those columns have
 * to exist for the *whole filtered set* anyway, because the list can sort by them and because
 * `totals` is defined over the whole filtered set. Everything that is display-only and cannot be
 * sorted, filtered or totalled — sync status, theme status, subscription — is fetched with
 * `LEFT JOIN LATERAL` against the *page* CTE, so those lookups cost pageSize rows and not the
 * tenancy.
 *
 * **2. `totals` and the rows come from the same CTE text.** The base CTE ({@link buildBaseCte}) is built
 * once and interpolated into both the count/total query and the page query, so a reviewer who sums
 * every page necessarily arrives at `totals`. Two hand-maintained copies of a `WHERE` clause drift.
 *
 * **3. Nothing a caller sends is ever concatenated into SQL.** `sort`, `dir` and `filter` are
 * mapped through allowlists ({@link SORT_COLUMNS}, {@link FILTER_PREDICATES}) to fixed literal
 * fragments; an unrecognised value falls back to the default rather than erroring, because a stale
 * bookmark should show the default view, not a 400. The free-text `q` is a bound parameter matched
 * with `ILIKE`.
 *
 * **4. Every number is coerced explicitly.** `pg` hands back `bigint`, `numeric` and `count()` as
 * **strings**. `"27" + "12"` is `"2712"`, and a JSON response carrying `"gmvCents": "558811"` has
 * already broken a chart in this repo. {@link toNumber} is applied to every numeric column, with no
 * exceptions and no implicit coercion.
 *
 * Money crosses the boundary in SQL. `orders.total_amount` is `NUMERIC(10,2)` in **dollars**; the
 * application's rule is integer cents, so the conversion is `ROUND(SUM(...) * 100)::bigint` inside
 * the query. Summing dollars in JavaScript floats and multiplying afterwards is how a total ends
 * up a cent short. What counts as money at all is {@link SETTLED_ORDER_PREDICATE} — not cancelled
 * *and* actually paid — with the booked-but-unpaid remainder reported beside it as
 * `unsettledCents` rather than silently dropped.
 *
 * **This module owns the console's order vocabulary.** {@link RECEIVED_ORDER_PREDICATE},
 * {@link SETTLED_ORDER_PREDICATE}, {@link UNSETTLED_ORDER_PREDICATE},
 * {@link CANCELLED_ORDER_PREDICATE} and {@link REFUNDED_ORDER_PREDICATE} are defined here and
 * imported by `src/lib/platform/metrics.ts`, and the two rates derived from them —
 * {@link fulfillmentRatePct} and {@link averageCents} — are functions rather than expressions
 * repeated at each call site. That is not tidiness. Three screens had independently decided what
 * "received" meant and the console reported the platform's fulfilment rate as 75%, 68% and 63% on
 * adjacent pages; before that, two definitions of "customized" put "0 stores customized" above a
 * table in which every row said "Customized". Both defects have the same cause — no module owned
 * the word — so the fix is a module that does.
 *
 * "Customized" is not defined here either. It comes from `src/lib/platform/customization.ts`,
 * which is shared with the overview, because three screens quietly holding three definitions of
 * the same word is how a dashboard tells a reader two contradictory things at once.
 *
 * Secrets never leave this module. `store_integrations.api_key_encrypted`,
 * `webhook_secret_encrypted`, `shipstation_password_hash` and `users.password_hash` are read only
 * inside `EXISTS (...)` predicates. What the console gets is a boolean and a timestamp — never a
 * ciphertext, never a prefix of one.
 */

import { db, validateUUID } from '@/lib/database/connection';
import { CUSTOMIZED_THEME_JOIN, customizedPredicate } from '@/lib/platform/customization';

/**
 * What counts as GMV: money that actually moved.
 *
 * `status <> 'cancelled'` alone is not enough, and shipping it that way put ~23% of the platform's
 * last-30-day figure into a revenue tile that no one had paid. A pending order is a promise; GMV is
 * a receipt. Two payment states mean paid, because two writers populate the column: real checkout
 * writes `'paid'` (`src/lib/billing/orders.ts`), the demo seed writes `'completed'`. `paid_at` is
 * deliberately *not* used — nothing in the codebase writes it, so keying off it would render every
 * demo store's GMV as zero, which is the same class of lie in the other direction.
 *
 * `'refunded'` is included, and that is deliberate: the money *did* move, and it is reported gross
 * with `refundedCents` as the separate offset — which is what `docs/platform-admin.md` promises and
 * what GMV means everywhere else in commerce. Excluding it produced an asymmetry that would have
 * been very hard to spot later: a *partially* refunded order keeps `payment_status = 'paid'` and so
 * stayed in GMV in full, while a *fully* refunded one flipped to `'refunded'` and vanished
 * entirely. Two orders for the same amount, refunded by different amounts, moved GMV by wildly
 * different amounts in a direction nobody could predict from the tile.
 *
 * Written against the alias `o`, which every order query in this module uses.
 */
export const SETTLED_ORDER_PREDICATE =
  "o.status <> 'cancelled' AND o.payment_status IN ('paid', 'completed', 'refunded')";

/**
 * What counts as an order the platform **received**: every row in `orders`, cancellations included.
 *
 * This constant exists because the word had three meanings on three adjacent screens. The overview
 * counted `status <> 'cancelled'` (65 orders), the customers list counted `COUNT(*)` (72) and the
 * store detail counted `COUNT(*)` again but divided a shipped count by it — so one platform, one
 * afternoon, reported fulfilment as 75%, 68% and 63%. None of those numbers was arithmetically
 * wrong. What was wrong is that no module owned the word, so every query author re-decided it.
 *
 * **The definition is "the merchant took the order".** A cancelled order was still received: a
 * buyer placed it, the merchant saw it, and it then fell through. Excluding it makes cancellation
 * invisible in exactly the place an operator would look for it, and it flatters the fulfilment
 * rate by removing orders that were never going to ship. Cancellations are reported as their own
 * figure beside every received count ({@link CANCELLED_ORDER_PREDICATE}), which is the honest
 * treatment: visible in the denominator, and separately countable.
 *
 * The predicate is literally `TRUE`, and that is the point. It is not decoration — it is the seam.
 * Every received count and every fulfilment rate on the console is written through this constant
 * and {@link fulfillmentRatePct}, so if "received" ever has to narrow (a spam/test-order flag, say)
 * it narrows in one place and every screen follows. A fourth definition cannot appear by someone
 * typing `COUNT(*)` in a new query, because the reviewer's question — "why is this not using
 * RECEIVED_ORDER_PREDICATE?" — now has somewhere to point.
 *
 * Written against the alias `o`, like its neighbours.
 */
export const RECEIVED_ORDER_PREDICATE = 'TRUE';

/**
 * Orders the merchant or the buyer cancelled.
 *
 * Reported beside every received count rather than subtracted from it. Cancelled orders are inside
 * {@link RECEIVED_ORDER_PREDICATE} and outside {@link SETTLED_ORDER_PREDICATE}, which is why a
 * fulfilment rate has a ceiling below 100% on a platform with cancellations — a real fact about
 * the platform, not an artefact.
 */
export const CANCELLED_ORDER_PREDICATE = "o.status = 'cancelled'";

/**
 * Orders where money went back to the buyer.
 *
 * `refunded_amount > 0` rather than `payment_status = 'refunded'`: a partial refund leaves the
 * payment status at `'paid'`, and a rule that reads the status alone would report the partially
 * refunded order as un-refunded while reporting a fully refunded one as refunded in full.
 *
 * This set **overlaps** the cancelled set — in the demo data it is exactly the cancelled set — so
 * the two are never rendered as independent columns without the overlap beside them. "Cancelled 3"
 * next to "Refunded 3" reads as six bad orders; it is three.
 */
export const REFUNDED_ORDER_PREDICATE = 'o.refunded_amount > 0';

/**
 * The one fulfilment-rate calculation on the operator console.
 *
 * Shipped ÷ received, where "received" is {@link RECEIVED_ORDER_PREDICATE} on both sides of the
 * screen. Every rate the console shows — overview headline, all-time panel, list totals, per-store
 * row, store detail — calls this, so two of them cannot disagree by a few points and leave a
 * reader to guess which is real.
 *
 * **`null`, not `0`, when nothing was received.** Zero received orders means the rate is unknown,
 * and `0%` claims we measured a total failure to ship. That is the same class of lie as an average
 * order value of `$0.00` on a window with no orders, and `CLAUDE.md` forbids both.
 *
 * @param shipped - Orders dispatched over the period being described.
 * @param received - Orders received over that same period, cancellations included.
 * @returns The percentage to two decimals, or `null` when `received` is zero, negative or not a
 *          number. Not clamped: shipped and received can be different populations (an order
 *          received last month can ship this one), so a throughput rate above 100% is reported as
 *          measured rather than massaged.
 */
export function fulfillmentRatePct(shipped: number, received: number): number | null {
  if (!Number.isFinite(shipped) || !Number.isFinite(received) || received <= 0) return null;
  return Math.round((shipped / received) * 10000) / 100;
}

/**
 * The one average-order-value calculation on the operator console.
 *
 * Deliberately takes the *settled* order count rather than the received one: the numerator is
 * settled GMV, so dividing by every received order would quietly average money that was never
 * taken into a figure labelled "average order value".
 *
 * **`null`, not `0`, when there are no orders to average.** An empty window has no average; a
 * console that prints `$0.00` there is stating a measurement it does not have. This is the exact
 * defect that shipped on the revenue panel at `?days=7`.
 *
 * @param totalCents - Summed order value in integer cents, over the same set `orderCount` counts.
 * @param orderCount - How many orders that sum covers.
 * @returns The mean rounded to the nearest whole cent, or `null` when there is nothing to average.
 */
export function averageCents(totalCents: number, orderCount: number): number | null {
  if (!Number.isFinite(totalCents) || !Number.isFinite(orderCount) || orderCount <= 0) return null;
  return Math.round(totalCents / orderCount);
}

/**
 * The complement: booked but not settled.
 *
 * Surfaced as its own figure rather than quietly dropped. An order that was placed, not cancelled,
 * and still not paid is a checkout or payment-capture problem, and the operator console is exactly
 * where someone should notice it. `unsettledCents` and `gmvCents` together account for every
 * non-cancelled order, so nothing goes missing between them.
 */
export const UNSETTLED_ORDER_PREDICATE =
  "o.status <> 'cancelled' AND (o.payment_status IS NULL " +
  "OR o.payment_status NOT IN ('paid', 'completed'))";

/** Rows the list may be sorted by. Anything else falls back to {@link DEFAULT_SORT}. */
export const CUSTOMER_SORT_KEYS = [
  'created',
  'name',
  'orders',
  'shipped',
  'gmv',
  'clicks',
  'products',
] as const;

/** A validated `sort` value. */
export type CustomerSortKey = (typeof CUSTOMER_SORT_KEYS)[number];

/** Sort applied when the caller sends nothing, or sends something unrecognised. */
export const DEFAULT_SORT: CustomerSortKey = 'created';

/** Sort directions. */
export const CUSTOMER_SORT_DIRECTIONS = ['asc', 'desc'] as const;

/** A validated `dir` value. */
export type CustomerSortDirection = (typeof CUSTOMER_SORT_DIRECTIONS)[number];

/** Cohorts the list may be narrowed to. Anything else falls back to {@link DEFAULT_FILTER}. */
export const CUSTOMER_FILTER_KEYS = [
  'all',
  'active',
  'inactive',
  'connected',
  'unconnected',
  'customized',
  'has_orders',
  'no_orders',
] as const;

/** A validated `filter` value. */
export type CustomerFilterKey = (typeof CUSTOMER_FILTER_KEYS)[number];

/** Filter applied when the caller sends nothing, or sends something unrecognised. */
export const DEFAULT_FILTER: CustomerFilterKey = 'all';

/** Page size used when the caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Hard ceiling on page size.
 *
 * The cap is not politeness: `pageSize` is interpolated as a bound `LIMIT`, and an operator who
 * types `pageSize=100000` would pull every merchant's aggregate row into one JSON payload.
 */
export const MAX_PAGE_SIZE = 100;

/** How many days the "last 30 days" columns and the detail's daily series cover. */
export const RECENT_WINDOW_DAYS = 30;

/** How many orders the detail returns inline before the operator has to open the orders tab. */
export const DETAIL_RECENT_ORDERS = 10;

/** How many rows the detail's "top" lists carry. */
export const DETAIL_TOP_LIST_SIZE = 5;

/**
 * `sort` → the column in the base CTE it orders by.
 *
 * These are literal fragments chosen by key, never caller text. That is the whole point of the
 * map: a `sort` parameter that reached an `ORDER BY` by string concatenation is a SQL injection,
 * and "it's only a column name" is exactly how one ships.
 */
const SORT_COLUMNS: Readonly<Record<CustomerSortKey, string>> = {
  created: 'created_at',
  name: 'store_name',
  orders: 'orders_received',
  shipped: 'orders_shipped',
  gmv: 'gmv_cents',
  clicks: 'clicks_all_time',
  products: 'product_count',
};

/**
 * `filter` → the predicate applied to the matched set.
 *
 * `active`/`inactive` read `stores.is_active` — the merchant's own on/off switch — rather than
 * "traded recently", because `has_orders`/`no_orders` already cover trading. `connected` means
 * ShipStation specifically: it is the integration whose absence stops a catalogue existing, and it
 * uses the same predicate as `getActiveShipStationStores()` so the console and the sync scheduler
 * cannot disagree about who is connected.
 */
const FILTER_PREDICATES: Readonly<Record<CustomerFilterKey, string>> = {
  all: 'TRUE',
  active: 'is_active = TRUE',
  inactive: 'is_active IS DISTINCT FROM TRUE',
  connected: 'shipstation_connected',
  unconnected: 'NOT shipstation_connected',
  customized: 'customized',
  has_orders: 'orders_received > 0',
  no_orders: 'orders_received = 0',
};

/** A normalised, safe-to-use set of list parameters. */
export interface CustomerListParams {
  /** 1-based, clamped to at least 1. */
  page: number;
  /** Clamped to `1..`{@link MAX_PAGE_SIZE}. */
  pageSize: number;
  /** Free-text search, already trimmed. `null` when the caller sent nothing usable. */
  q: string | null;
  sort: CustomerSortKey;
  dir: CustomerSortDirection;
  filter: CustomerFilterKey;
}

/** A normalised set of per-store order-list parameters. */
export interface CustomerOrdersParams {
  page: number;
  pageSize: number;
  /** An `orders.status` value to narrow to, or `null` for every status. */
  status: string | null;
}

/** The pagination envelope shared by both list endpoints. */
export interface PaginationEnvelope {
  page: number;
  pageSize: number;
  /** Rows in the whole filtered set, ignoring pagination. */
  total: number;
  /** `ceil(total / pageSize)`, and `0` when there is nothing to page. */
  totalPages: number;
}

/** One merchant row in the list. */
export interface CustomerListItem {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeUrl: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  isActive: boolean;
  isPublic: boolean;
  /**
   * Order counts for this merchant, every one of them over
   * {@link RECEIVED_ORDER_PREDICATE}'s population.
   *
   * `settled` and `cancelled` are here so the UI can label `gmvCents` with the order count it was
   * actually divided by. "72 orders received" beside "$9,017.31 GMV" invited a reader to compute
   * an average order value of $125.24 while the console printed $236.68, because the money is
   * settled-only and the count was not.
   */
  orders: {
    received: number;
    shipped: number;
    last30d: number;
    /** Orders backing `gmvCents`: not cancelled and actually paid. */
    settled: number;
    /** Cancelled orders. Inside `received`, outside `settled`. */
    cancelled: number;
  };
  /** Shipped ÷ received, all time, from {@link fulfillmentRatePct}. `null` when nothing was received. */
  fulfillmentRatePct: number | null;
  gmvCents: number;
  /** `gmvCents / orders.settled`, or `null` when no order settled. Never `0` for "unknown". */
  aovCents: number | null;
  /** Non-cancelled orders that were never paid. Not part of `gmvCents`; reported so it is visible. */
  unsettledCents: number;
  clicks: { allTime: number; last30d: number };
  products: number;
  inventoryUnits: number;
  integrations: {
    shipstation: boolean;
    stripe: boolean;
    syncStatus: string | null;
    lastSyncAt: string | null;
  };
  customized: boolean;
  themeStatus: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  lastOrderAt: string | null;
}

/** Aggregates over the whole filtered set — deliberately not the page. */
export interface CustomerListTotals {
  customers: number;
  /** Orders received: {@link RECEIVED_ORDER_PREDICATE}, the same population every screen uses. */
  orders: number;
  shipped: number;
  /** Of `orders`, the ones that settled — the count `gmvCents` is the sum over. */
  settledOrders: number;
  /** Of `orders`, the ones cancelled. Inside `orders`, never subtracted from it silently. */
  cancelled: number;
  /** `shipped / orders`, from {@link fulfillmentRatePct}. `null` when nothing was received. */
  fulfillmentRatePct: number | null;
  gmvCents: number;
  /** `gmvCents / settledOrders`, or `null`. The pair the UI must label together. */
  aovCents: number | null;
  unsettledCents: number;
  clicks: number;
}

/** What {@link listCustomers} returns. */
export interface CustomerListResult {
  customers: CustomerListItem[];
  pagination: PaginationEnvelope;
  totals: CustomerListTotals;
}

/** One order as both the detail's `recent` list and the orders endpoint render it. */
export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  totalCents: number;
  status: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  createdAt: string;
  shippedAt: string | null;
}

/** What {@link listCustomerOrders} returns. */
export interface CustomerOrdersResult {
  orders: CustomerOrderSummary[];
  pagination: PaginationEnvelope;
}

/** One entry in the operator's onboarding-health checklist. */
export interface CustomerChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** A short, literal fact — "14 products", "no sync in 9 days". Never a recommendation. */
  detail: string;
}

/** The full merchant detail payload. */
export interface CustomerDetail {
  store: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeUrl: string;
    domain: string | null;
    description: string | null;
    currency: string;
    timezone: string | null;
    logoUrl: string | null;
    isActive: boolean;
    isPublic: boolean;
    createdAt: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    /**
     * The last sign-in, when one is recorded. See {@link CustomerDetail.owner.lastLoginTracked} —
     * `null` here currently means "not recorded", not "never signed in".
     */
    lastLogin: string | null;
    /**
     * Whether `lastLogin` means anything.
     *
     * `users.last_login` exists in the schema and **nothing in this codebase writes it** — the
     * sign-in route does not touch the column — so it is `NULL` on every row. Rendering that as
     * "never signed in" would tell an operator that an actively-trading merchant has never logged
     * in, which is false. The flag lets the UI say "not tracked" instead, and it flips to `true`
     * on its own the moment the sign-in route starts writing the column.
     */
    lastLoginTracked: boolean;
  };
  orders: {
    /** {@link RECEIVED_ORDER_PREDICATE}: every order this merchant took, cancellations included. */
    received: number;
    shipped: number;
    delivered: number;
    /** Cancelled orders. A subset of `received`, disjoint from `settledOrders`. */
    cancelled: number;
    /** Value of those cancelled orders, in integer cents. Never part of `gmvCents`. */
    cancelledCents: number;
    /** Orders with any money refunded — {@link REFUNDED_ORDER_PREDICATE}. */
    refundedCount: number;
    /**
     * Orders that are **both** cancelled and refunded.
     *
     * The overlap, returned explicitly, because `cancelled` and `refundedCount` are not disjoint —
     * in the demo data they are the same three rows. Rendered as two independent stat columns they
     * read as six bad orders out of twenty-seven; with this field the UI can say "3 cancelled, all
     * of them refunded".
     */
    refundedCancelledCount: number;
    gmvCents: number;
    /** Non-cancelled, never paid. Excluded from `gmvCents`; shown so it cannot go unnoticed. */
    unsettledCents: number;
    /** How many orders make up `unsettledCents`. */
    unsettledOrders: number;
    /** Orders backing `gmvCents`, i.e. the denominator of `aovCents`. */
    settledOrders: number;
    /** Every cent refunded to a buyer, whatever the order's state. The total money-back figure. */
    refundedCents: number;
    /**
     * The part of `refundedCents` that came out of an order inside `gmvCents`.
     *
     * This is the only refund figure that may be subtracted from GMV. The rest sits in
     * `refundedCancelledCents`, on money GMV never contained.
     */
    refundedSettledCents: number;
    /** The part of `refundedCents` on cancelled orders — refunds of money never counted as GMV. */
    refundedCancelledCents: number;
    /** `gmvCents / settledOrders`, or `null` when nothing settled. Never `0` for "unknown". */
    aovCents: number | null;
    /** Shipped ÷ received, from {@link fulfillmentRatePct}. `null` when nothing was received. */
    fulfillmentRatePct: number | null;
    avgHoursToShip: number | null;
    last30d: {
      received: number;
      shipped: number;
      gmvCents: number;
      unsettledCents: number;
      /** The same rate over the last 30 days only. `null` when nothing was received in them. */
      fulfillmentRatePct: number | null;
    };
    recent: CustomerOrderSummary[];
  };
  catalog: {
    products: number;
    activeProducts: number;
    outOfStock: number;
    lowStock: number;
    inventoryUnits: number;
    inventoryValueCents: number;
    topProducts: Array<{
      id: string;
      name: string;
      sku: string;
      unitsSold: number;
      revenueCents: number;
      stock: number;
    }>;
  };
  integrations: {
    shipstation: {
      connected: boolean;
      lastSyncAt: string | null;
      syncStatus: string | null;
      errorMessage: string | null;
      webhookRegistered: boolean;
      autoSyncEnabled: boolean;
    };
    stripe: {
      connected: boolean;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      onboardingStatus: string | null;
      detailsSubmitted: boolean;
    };
    subscription: {
      plan: string | null;
      status: string | null;
      currentPeriodEnd: string | null;
      unitAmountCents: number | null;
    };
  };
  customization: {
    themeCustomized: boolean;
    themeStatus: string | null;
    themeVersion: number | null;
    publishedAt: string | null;
    sectionCount: number;
    hasLogo: boolean;
    hasHero: boolean;
    hasDescription: boolean;
    blogPosts: number;
    /** Share of {@link COMPLETENESS_SIGNALS} that are true, 0-100. */
    completenessPct: number;
  };
  traffic: {
    clicksAllTime: number;
    clicksLast30d: number;
    uniqueVisitorsLast30d: number;
    daily: Array<{ day: string; clicks: number; uniqueVisitors: number; orders: number }>;
    topPages: Array<{ path: string; clicks: number }>;
    topReferrers: Array<{ domain: string; clicks: number }>;
  };
  checklist: CustomerChecklistItem[];
}

/**
 * The signals `completenessPct` is a fraction of.
 *
 * Named explicitly rather than computed from "whatever we happened to fetch", because a
 * completeness percentage whose denominator moves is a number that flatters. These eight are the
 * things that have to be true before a merchant's storefront can take an order from a stranger:
 * it has to be findable (public), look like a shop (logo, description, hero, a saved theme), have
 * something to sell (products), be able to fulfil (ShipStation), and be able to charge (Stripe).
 * Nothing here is weighted; each signal is one eighth.
 *
 * `themeEdited` rather than `themeCustomized` on purpose. The shared `customizedPredicate` is the
 * *union* of theme editing and branding, so counting it here alongside `hasLogo`, `hasDescription`
 * and `hasHero` would score the same logo twice and inflate every merchant who has one. This set
 * takes only the theme-editing half, leaving the three branding signals to speak for themselves.
 */
export const COMPLETENESS_SIGNALS = [
  'hasLogo',
  'hasDescription',
  'hasHero',
  'themeEdited',
  'isPublic',
  'hasProducts',
  'shipstationConnected',
  'stripeConnected',
] as const;

/**
 * Coerce a Postgres scalar to a real JavaScript number.
 *
 * `pg` returns `bigint`, `numeric` and every `count()` as a string to avoid silent precision loss.
 * Passing those through untouched puts `"27"` in a JSON response and turns `a + b` into
 * concatenation.
 *
 * @param value - Whatever the driver produced for the column.
 * @returns The numeric value, or `0` for null, empty and unparseable input.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Coerce a Postgres scalar to a number, preserving "there is no value".
 *
 * Distinct from {@link toNumber} because `avgHoursToShip: null` ("nothing has shipped") and
 * `avgHoursToShip: 0` ("everything ships instantly") are different claims.
 *
 * @param value - Whatever the driver produced for the column.
 * @returns The numeric value, or `null` when the column was null or unparseable.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Render a timestamp column as an ISO-8601 string.
 *
 * @param value - A `Date` from the driver, an already-formatted string, or null.
 * @returns The ISO string, or `null` when there is no timestamp.
 */
function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/**
 * Render a timestamp column that the contract declares non-null.
 *
 * @param value - A `Date` from the driver, or a formatted string.
 * @returns The ISO string, falling back to the epoch rather than emitting `null` into a field the
 *          client's types say is always present.
 */
function toIsoRequired(value: unknown): string {
  return toIso(value) ?? new Date(0).toISOString();
}

/**
 * Render a `date` column as `YYYY-MM-DD`.
 *
 * The daily series is keyed by calendar day, not by instant, so it must not pick up a timezone
 * shift on the way out.
 *
 * @param value - A `Date` or a date string from the driver.
 * @returns The day in `YYYY-MM-DD` form, or an empty string when there is none.
 */
function toDayString(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

/**
 * Clamp a caller-supplied integer into a range.
 *
 * @param value - The raw value, typically a query-string string.
 * @param fallback - Used when the value is absent or not a finite integer.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns An integer inside `[min, max]`.
 */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Read one parameter from either transport the routes use.
 *
 * @param source - The route's `URLSearchParams`, or a plain record in tests.
 * @param key - The parameter name.
 * @returns The raw string, or `null` when absent.
 */
function readParam(
  source: URLSearchParams | Record<string, string | null | undefined>,
  key: string
): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Escape the `LIKE` metacharacters in a search term.
 *
 * A merchant genuinely named `100% Cotton` must be findable, and `%` in the middle of a pattern
 * would otherwise match everything.
 *
 * @param term - The raw search text.
 * @returns The term with `\`, `%` and `_` escaped.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Normalise raw query-string input into safe list parameters.
 *
 * Unrecognised `sort`, `dir` and `filter` values fall back to their defaults rather than raising:
 * a stale bookmark or a hand-edited URL should render the default view. `page` and `pageSize` are
 * clamped, so `page=-4` reads as page 1 and `pageSize=100000` as {@link MAX_PAGE_SIZE}.
 *
 * @param source - The request's search params, or an equivalent record.
 * @returns Parameters that are safe to hand to {@link listCustomers}.
 */
export function normalizeCustomerListParams(
  source: URLSearchParams | Record<string, string | null | undefined>
): CustomerListParams {
  const rawSort = readParam(source, 'sort');
  const rawDir = readParam(source, 'dir');
  const rawFilter = readParam(source, 'filter');
  const rawQuery = readParam(source, 'q');

  const sort = CUSTOMER_SORT_KEYS.find((key) => key === rawSort) ?? DEFAULT_SORT;
  const dir = CUSTOMER_SORT_DIRECTIONS.find((key) => key === rawDir) ?? 'desc';
  const filter = CUSTOMER_FILTER_KEYS.find((key) => key === rawFilter) ?? DEFAULT_FILTER;
  const trimmed = (rawQuery ?? '').trim();

  return {
    page: clampInt(readParam(source, 'page'), 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: clampInt(readParam(source, 'pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    q: trimmed === '' ? null : trimmed,
    sort,
    dir,
    filter,
  };
}

/**
 * Normalise raw query-string input for one merchant's order list.
 *
 * @param source - The request's search params, or an equivalent record.
 * @returns Parameters that are safe to hand to {@link listCustomerOrders}.
 */
export function normalizeCustomerOrdersParams(
  source: URLSearchParams | Record<string, string | null | undefined>
): CustomerOrdersParams {
  const status = (readParam(source, 'status') ?? '').trim();
  return {
    page: clampInt(readParam(source, 'page'), 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: clampInt(readParam(source, 'pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    status: status === '' ? null : status,
  };
}

/**
 * Build the pagination envelope from an authoritative total.
 *
 * `page` is echoed back as asked (clamped to at least 1) rather than pulled back to the last real
 * page. An operator who asks for page 40 of a 3-page list is told the truth — page 40, 3 pages,
 * no rows — instead of being silently shown page 3 and wondering why the URL lied.
 *
 * @param page - The requested page.
 * @param pageSize - The requested page size.
 * @param total - Rows in the whole filtered set.
 * @returns The envelope every paged platform response carries.
 */
export function buildPagination(page: number, pageSize: number, total: number): PaginationEnvelope {
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  return {
    page: Math.max(1, Math.trunc(page)),
    pageSize: safePageSize,
    total,
    totalPages: total <= 0 ? 0 : Math.ceil(total / safePageSize),
  };
}

/**
 * The shared body of the customers list query.
 *
 * Both the totals query and the page query interpolate this, so the two cannot disagree about who
 * is in the filtered set. `$1` is the `ILIKE` pattern (or `NULL` for "no search"); the filter
 * arrives as a literal fragment chosen from {@link FILTER_PREDICATES}, never as caller text.
 *
 * The three grouped CTEs are the anti-N+1 measure: one scan of `orders`, one of `products`, one of
 * `storefront_click_daily`, rather than three queries per row on the page. They compute exactly the
 * columns the list can sort, filter or total by — those have to exist for the whole matched set
 * before paging can happen at all.
 *
 * @param filterPredicate - A fragment from {@link FILTER_PREDICATES}.
 * @returns SQL defining the `matched` CTE, ready to be followed by a `SELECT`.
 */
function buildBaseCte(filterPredicate: string): string {
  return `
    WITH order_agg AS (
      SELECT o.store_id,
             -- "Received" is RECEIVED_ORDER_PREDICATE, not COUNT(*) spelled out again. The literal
             -- is the same today; the seam is what stops it drifting the next time somebody adds a
             -- count here.
             COUNT(*) FILTER (WHERE ${RECEIVED_ORDER_PREDICATE})::bigint AS orders_received,
             COUNT(*) FILTER (WHERE o.shipped_at IS NOT NULL)::bigint AS orders_shipped,
             COUNT(*) FILTER (WHERE ${SETTLED_ORDER_PREDICATE})::bigint AS orders_settled,
             COUNT(*) FILTER (WHERE ${CANCELLED_ORDER_PREDICATE})::bigint AS orders_cancelled,
             COUNT(*) FILTER (
               WHERE ${RECEIVED_ORDER_PREDICATE}
                 AND o.created_at >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
             )::bigint AS orders_last_30d,
             -- Dollars -> cents at the boundary. See SETTLED_ORDER_PREDICATE: not cancelled AND
             -- actually paid. The unsettled remainder is reported beside it, not discarded.
             COALESCE(
               ROUND(SUM(o.total_amount) FILTER (WHERE ${SETTLED_ORDER_PREDICATE}) * 100), 0
             )::bigint AS gmv_cents,
             COALESCE(
               ROUND(SUM(o.total_amount) FILTER (WHERE ${UNSETTLED_ORDER_PREDICATE}) * 100), 0
             )::bigint AS unsettled_cents,
             MAX(o.created_at) AS last_order_at
        FROM orders o
       GROUP BY o.store_id
    ),
    product_agg AS (
      SELECT p.store_id,
             COUNT(*)::bigint AS product_count,
             COALESCE(SUM(GREATEST(COALESCE(p.stock_quantity, 0), 0)), 0)::bigint AS inventory_units
        FROM products p
       GROUP BY p.store_id
    ),
    click_agg AS (
      -- storefront_click_daily is the rollup the click trigger maintains; it is the source of
      -- truth for click *counts*. It deliberately holds no unique-visitor column, so uniques are
      -- only ever read from storefront_click_events (see the detail query).
      SELECT d.store_id,
             COALESCE(SUM(d.clicks), 0)::bigint AS clicks_all_time,
             COALESCE(
               SUM(d.clicks) FILTER (WHERE d.day >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}), 0
             )::bigint AS clicks_last_30d
        FROM storefront_click_daily d
       GROUP BY d.store_id
    ),
    scored AS (
      SELECT s.id AS store_id,
             s.store_name,
             s.store_slug,
             s.is_active,
             s.is_public,
             s.created_at,
             u.id AS owner_id,
             u.first_name,
             u.last_name,
             u.email AS owner_email,
             COALESCE(oa.orders_received, 0)::bigint AS orders_received,
             COALESCE(oa.orders_shipped, 0)::bigint AS orders_shipped,
             COALESCE(oa.orders_settled, 0)::bigint AS orders_settled,
             COALESCE(oa.orders_cancelled, 0)::bigint AS orders_cancelled,
             COALESCE(oa.orders_last_30d, 0)::bigint AS orders_last_30d,
             COALESCE(oa.gmv_cents, 0)::bigint AS gmv_cents,
             COALESCE(oa.unsettled_cents, 0)::bigint AS unsettled_cents,
             oa.last_order_at,
             COALESCE(pa.product_count, 0)::bigint AS product_count,
             COALESCE(pa.inventory_units, 0)::bigint AS inventory_units,
             COALESCE(ca.clicks_all_time, 0)::bigint AS clicks_all_time,
             COALESCE(ca.clicks_last_30d, 0)::bigint AS clicks_last_30d,
             -- Same predicate as getActiveShipStationStores(): a stored, non-empty credential on
             -- an active integration row. Only its existence is read - never its contents.
             EXISTS (
               SELECT 1 FROM store_integrations i
                WHERE i.store_id = s.id
                  AND i.integration_type = 'shipstation'
                  AND i.is_active = TRUE
                  AND i.api_key_encrypted IS NOT NULL
                  AND i.api_key_encrypted <> ''
             ) AS shipstation_connected,
             EXISTS (
               SELECT 1 FROM payment_accounts pay
                WHERE pay.store_id = s.id AND pay.provider = 'stripe'
             ) AS stripe_connected,
             -- One definition of "customized", shared with the overview and the detail. See
             -- src/lib/platform/customization.ts for why it is the union of theme-editing and
             -- branding rather than either alone.
             ${customizedPredicate('s', 'cz')} AS customized
        FROM stores s
        JOIN users u ON u.id = s.owner_id
        LEFT JOIN order_agg oa ON oa.store_id = s.id
        LEFT JOIN product_agg pa ON pa.store_id = s.id
        LEFT JOIN click_agg ca ON ca.store_id = s.id
        LEFT JOIN (${CUSTOMIZED_THEME_JOIN}) cz ON cz.store_id = s.id
       WHERE (
         $1::text IS NULL
         OR s.store_name ILIKE $1
         OR s.store_slug ILIKE $1
         OR u.email ILIKE $1
         OR (u.first_name || ' ' || u.last_name) ILIKE $1
       )
    ),
    matched AS (
      SELECT * FROM scored WHERE ${filterPredicate}
    )`;
}

/** Row shape of the totals query. */
interface TotalsRow extends Record<string, unknown> {
  customers: string;
  orders: string;
  shipped: string;
  settled_orders: string;
  cancelled: string;
  gmv_cents: string;
  unsettled_cents: string;
  clicks: string;
}

/** Row shape of the paged list query. */
interface CustomerListRow extends Record<string, unknown> {
  store_id: string;
  store_name: string;
  store_slug: string;
  is_active: boolean | null;
  is_public: boolean | null;
  created_at: Date | string;
  owner_id: string;
  first_name: string;
  last_name: string;
  owner_email: string;
  orders_received: string;
  orders_shipped: string;
  orders_settled: string;
  orders_cancelled: string;
  orders_last_30d: string;
  gmv_cents: string;
  unsettled_cents: string;
  last_order_at: Date | string | null;
  product_count: string;
  inventory_units: string;
  clicks_all_time: string;
  clicks_last_30d: string;
  shipstation_connected: boolean;
  stripe_connected: boolean;
  customized: boolean;
  sync_status: string | null;
  last_sync_at: Date | string | null;
  theme_status: string | null;
  plan_key: string | null;
  subscription_status: string | null;
}

/**
 * The cross-tenant merchant list.
 *
 * Deliberately not store-scoped — reading every tenant is the feature. The caller is proven to be
 * a platform operator by `requirePlatformAdmin` before this runs.
 *
 * Two round trips, regardless of page size: one for `total` + `totals` over the whole filtered
 * set, one for the page itself. Both are generated from {@link buildBaseCte}, so summing every
 * page reproduces `totals` exactly. An out-of-range page is not an error — it returns an empty
 * array beside honest pagination numbers.
 *
 * @param params - Normalised parameters, typically from {@link normalizeCustomerListParams}.
 * @returns The page of merchants, its pagination envelope, and totals over the whole filtered set.
 */
export async function listCustomers(params: CustomerListParams): Promise<CustomerListResult> {
  const filterPredicate = FILTER_PREDICATES[params.filter] ?? FILTER_PREDICATES[DEFAULT_FILTER];
  const sortColumn = SORT_COLUMNS[params.sort] ?? SORT_COLUMNS[DEFAULT_SORT];
  const direction = params.dir === 'asc' ? 'ASC' : 'DESC';
  const baseCte = buildBaseCte(filterPredicate);
  const pattern = params.q === null ? null : `%${escapeLike(params.q)}%`;

  const totalsResult = await db.query<TotalsRow>(
    `${baseCte}
     SELECT COUNT(*)::bigint                            AS customers,
            COALESCE(SUM(orders_received), 0)::bigint   AS orders,
            COALESCE(SUM(orders_shipped), 0)::bigint    AS shipped,
            COALESCE(SUM(orders_settled), 0)::bigint    AS settled_orders,
            COALESCE(SUM(orders_cancelled), 0)::bigint  AS cancelled,
            COALESCE(SUM(gmv_cents), 0)::bigint         AS gmv_cents,
            COALESCE(SUM(unsettled_cents), 0)::bigint   AS unsettled_cents,
            COALESCE(SUM(clicks_all_time), 0)::bigint   AS clicks
       FROM matched`,
    [pattern]
  );

  const totalsRow = totalsResult.rows[0];
  const totalReceived = toNumber(totalsRow?.orders);
  const totalShipped = toNumber(totalsRow?.shipped);
  const totalSettled = toNumber(totalsRow?.settled_orders);
  const totalGmvCents = toNumber(totalsRow?.gmv_cents);

  const totals: CustomerListTotals = {
    customers: toNumber(totalsRow?.customers),
    orders: totalReceived,
    shipped: totalShipped,
    settledOrders: totalSettled,
    cancelled: toNumber(totalsRow?.cancelled),
    // The same helper the overview and the detail call, so the three cannot print three rates.
    fulfillmentRatePct: fulfillmentRatePct(totalShipped, totalReceived),
    gmvCents: totalGmvCents,
    aovCents: averageCents(totalGmvCents, totalSettled),
    unsettledCents: toNumber(totalsRow?.unsettled_cents),
    clicks: toNumber(totalsRow?.clicks),
  };

  const pagination = buildPagination(params.page, params.pageSize, totals.customers);
  const offset = (pagination.page - 1) * pagination.pageSize;

  // The LATERALs below hang off `page`, not `matched`: sync status, theme status and subscription
  // are display-only, so they are looked up for the ~25 rows being rendered rather than for the
  // whole tenancy. `store_id` is the tiebreaker so paging is stable when a sort column ties.
  const pageResult = await db.query<CustomerListRow>(
    `${baseCte},
     page AS (
       SELECT * FROM matched
        ORDER BY ${sortColumn} ${direction} NULLS LAST, store_id ASC
        LIMIT $2 OFFSET $3
     )
     SELECT p.*,
            ss.sync_status,
            ss.last_sync_at,
            th.status AS theme_status,
            sub.plan_key,
            sub.status AS subscription_status
       FROM page p
       LEFT JOIN LATERAL (
         SELECT i.sync_status, i.last_sync_at
           FROM store_integrations i
          WHERE i.store_id = p.store_id AND i.integration_type = 'shipstation'
          LIMIT 1
       ) ss ON TRUE
       LEFT JOIN LATERAL (
         SELECT t.status
           FROM storefront_themes t
          WHERE t.store_id = p.store_id
          ORDER BY (t.status = 'published') DESC, t.updated_at DESC
          LIMIT 1
       ) th ON TRUE
       LEFT JOIN LATERAL (
         SELECT sb.plan_key, sb.status
           FROM subscriptions sb
          WHERE sb.store_id = p.store_id
          ORDER BY sb.created_at DESC
          LIMIT 1
       ) sub ON TRUE
      ORDER BY p.${sortColumn} ${direction} NULLS LAST, p.store_id ASC`,
    [pattern, pagination.pageSize, offset]
  );

  const customers = pageResult.rows.map((row): CustomerListItem => {
    const received = toNumber(row.orders_received);
    const shipped = toNumber(row.orders_shipped);
    const settled = toNumber(row.orders_settled);
    const gmvCents = toNumber(row.gmv_cents);

    return {
    storeId: row.store_id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    storeUrl: `/store/${row.store_slug}`,
    ownerId: row.owner_id,
    ownerName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    ownerEmail: row.owner_email,
    createdAt: toIsoRequired(row.created_at),
    isActive: row.is_active === true,
    isPublic: row.is_public === true,
    orders: {
      received,
      shipped,
      last30d: toNumber(row.orders_last_30d),
      settled,
      cancelled: toNumber(row.orders_cancelled),
    },
    fulfillmentRatePct: fulfillmentRatePct(shipped, received),
    gmvCents,
    aovCents: averageCents(gmvCents, settled),
    unsettledCents: toNumber(row.unsettled_cents),
    clicks: {
      allTime: toNumber(row.clicks_all_time),
      last30d: toNumber(row.clicks_last_30d),
    },
    products: toNumber(row.product_count),
    inventoryUnits: toNumber(row.inventory_units),
    integrations: {
      shipstation: row.shipstation_connected === true,
      stripe: row.stripe_connected === true,
      syncStatus: row.sync_status,
      lastSyncAt: toIso(row.last_sync_at),
    },
    customized: row.customized === true,
    themeStatus: row.theme_status,
    plan: row.plan_key,
    subscriptionStatus: row.subscription_status,
    lastOrderAt: toIso(row.last_order_at),
    };
  });

  return { customers, pagination, totals };
}

/** The projection both the detail's `recent` list and the orders endpoint select. */
const ORDER_SUMMARY_SELECT = `
  o.id,
  o.order_number,
  BTRIM(COALESCE(o.customer_first_name, '') || ' ' || COALESCE(o.customer_last_name, '')) AS customer_name,
  ROUND(o.total_amount * 100)::bigint AS total_cents,
  o.status,
  o.fulfillment_status,
  o.tracking_number,
  o.carrier,
  o.created_at,
  o.shipped_at`;

/** Row shape of {@link ORDER_SUMMARY_SELECT}. */
interface OrderSummaryRow extends Record<string, unknown> {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_cents: string;
  status: string | null;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: Date | string;
  shipped_at: Date | string | null;
}

/**
 * Map one order row to the contract's order object.
 *
 * @param row - A row selected with {@link ORDER_SUMMARY_SELECT}.
 * @returns The order as the console renders it, with money in integer cents.
 */
function mapOrderSummary(row: OrderSummaryRow): CustomerOrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: (row.customer_name ?? '').trim(),
    totalCents: toNumber(row.total_cents),
    status: row.status ?? '',
    fulfillmentStatus: row.fulfillment_status ?? '',
    trackingNumber: row.tracking_number,
    carrier: row.carrier,
    createdAt: toIsoRequired(row.created_at),
    shippedAt: toIso(row.shipped_at),
  };
}

/** Row shape of the store + owner + integration header query. */
interface StoreHeaderRow extends Record<string, unknown> {
  store_id: string;
  store_name: string;
  store_slug: string;
  domain: string | null;
  store_description: string | null;
  hero_title: string | null;
  currency: string | null;
  timezone: string | null;
  logo_url: string | null;
  theme_name: string | null;
  is_active: boolean | null;
  is_public: boolean | null;
  created_at: Date | string;
  owner_id: string;
  first_name: string;
  last_name: string;
  owner_email: string;
  owner_created_at: Date | string;
  owner_last_login: Date | string | null;
  shipstation_connected: boolean;
  shipstation_sync_status: string | null;
  shipstation_last_sync_at: Date | string | null;
  shipstation_error_message: string | null;
  shipstation_webhook_registered: boolean;
  shipstation_auto_sync: boolean;
  stripe_connected: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_onboarding_status: string | null;
  stripe_details_submitted: boolean;
  customized: boolean;
  theme_edited: boolean;
  theme_status: string | null;
  theme_version: string | null;
  theme_published_at: Date | string | null;
  theme_section_count: string | null;
  blog_posts: string;
}

/** Row shape of the per-store order aggregate. */
interface OrderStatsRow extends Record<string, unknown> {
  received: string;
  shipped: string;
  delivered: string;
  cancelled: string;
  cancelled_cents: string;
  refunded_count: string;
  refunded_cancelled_count: string;
  gmv_cents: string;
  unsettled_cents: string;
  unsettled_orders: string;
  refunded_cents: string;
  refunded_settled_cents: string;
  refunded_cancelled_cents: string;
  revenue_orders: string;
  avg_hours_to_ship: string | null;
  received_30d: string;
  shipped_30d: string;
  gmv_cents_30d: string;
  unsettled_cents_30d: string;
}

/** Row shape of the per-store catalogue aggregate. */
interface CatalogStatsRow extends Record<string, unknown> {
  products: string;
  active_products: string;
  out_of_stock: string;
  low_stock: string;
  inventory_units: string;
  inventory_value_cents: string;
}

/** Row shape of one entry in the detail's `topProducts`. */
interface TopProductRow extends Record<string, unknown> {
  id: string;
  name: string;
  sku: string;
  units_sold: string;
  revenue_cents: string;
  stock: string | null;
}

/** Row shape of one day in the detail's traffic series. */
interface DailyRow extends Record<string, unknown> {
  day: Date | string;
  clicks: string;
  unique_visitors: string;
  orders: string;
}

/** Row shape of the traffic totals. */
interface TrafficTotalsRow extends Record<string, unknown> {
  clicks_all_time: string;
  clicks_last_30d: string;
  unique_visitors_last_30d: string;
}

/** Row shape of the `topPages` / `topReferrers` lists. */
interface TopClickRow extends Record<string, unknown> {
  label: string;
  clicks: string;
}

/** Row shape of the subscription lookup. */
interface SubscriptionRow extends Record<string, unknown> {
  plan_key: string | null;
  status: string | null;
  current_period_end: Date | string | null;
  unit_amount: number | string | null;
}

/**
 * Describe how long ago something happened, in the plainest possible words.
 *
 * Used only for checklist `detail` strings, which are meant to be facts an operator can read at a
 * glance rather than prose.
 *
 * @param iso - An ISO timestamp, or `null`.
 * @param now - The reference instant; injectable so the string is testable.
 * @returns Something like `"today"`, `"3 days ago"`, or `null` when there is no timestamp.
 */
function describeAge(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * Pluralise a count against its noun.
 *
 * @param count - How many.
 * @param singular - The singular noun.
 * @param plural - The plural noun; defaults to `singular + 's'`.
 * @returns e.g. `"14 products"`, `"1 product"`.
 */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * One merchant's full operator view.
 *
 * Every query below carries `store_id`. The `[storeId]` route validates the UUID before calling,
 * and this function validates it again — a helper that is safe only when its caller remembers to
 * check is not safe.
 *
 * @param storeId - The merchant's store id.
 * @returns The detail payload, or `null` when no such store exists — so the route can answer 404
 *          rather than a 500 or an empty 200 that reads as "this merchant has nothing".
 */
export async function getCustomerDetail(storeId: string): Promise<CustomerDetail | null> {
  if (!validateUUID(storeId)) return null;

  // Store, owner, both integrations and the theme in one round trip. Every credential column is
  // read inside EXISTS or as a boolean/timestamp - no ciphertext is selected.
  const headerResult = await db.query<StoreHeaderRow>(
    `SELECT s.id AS store_id,
            s.store_name,
            s.store_slug,
            s.domain,
            s.store_description,
            s.hero_title,
            s.currency,
            s.timezone,
            s.logo_url,
            s.theme_name,
            s.is_active,
            s.is_public,
            s.created_at,
            u.id AS owner_id,
            u.first_name,
            u.last_name,
            u.email AS owner_email,
            u.created_at AS owner_created_at,
            u.last_login AS owner_last_login,
            COALESCE(ss.connected, FALSE)          AS shipstation_connected,
            ss.sync_status                         AS shipstation_sync_status,
            ss.last_sync_at                        AS shipstation_last_sync_at,
            ss.sync_error_message                  AS shipstation_error_message,
            COALESCE(ss.webhook_registered, FALSE) AS shipstation_webhook_registered,
            COALESCE(ss.auto_sync_enabled, FALSE)  AS shipstation_auto_sync,
            (pay.store_id IS NOT NULL)             AS stripe_connected,
            COALESCE(pay.charges_enabled, FALSE)   AS stripe_charges_enabled,
            COALESCE(pay.payouts_enabled, FALSE)   AS stripe_payouts_enabled,
            pay.onboarding_status                  AS stripe_onboarding_status,
            COALESCE(pay.details_submitted, FALSE) AS stripe_details_submitted,
            ${customizedPredicate('s', 'cz')}      AS customized,
            (cz.store_id IS NOT NULL)              AS theme_edited,
            th.status                              AS theme_status,
            th.version                             AS theme_version,
            th.published_at                        AS theme_published_at,
            th.section_count                       AS theme_section_count,
            (SELECT COUNT(*)::bigint FROM blog_posts b WHERE b.store_id = s.id) AS blog_posts
       FROM stores s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN LATERAL (
         SELECT (i.is_active = TRUE
                 AND i.api_key_encrypted IS NOT NULL
                 AND i.api_key_encrypted <> '')       AS connected,
                i.sync_status,
                i.last_sync_at,
                i.sync_error_message,
                (i.webhook_registered_at IS NOT NULL) AS webhook_registered,
                i.auto_sync_enabled
           FROM store_integrations i
          WHERE i.store_id = s.id AND i.integration_type = 'shipstation'
          LIMIT 1
       ) ss ON TRUE
       LEFT JOIN payment_accounts pay ON pay.store_id = s.id AND pay.provider = 'stripe'
       LEFT JOIN (${CUSTOMIZED_THEME_JOIN}) cz ON cz.store_id = s.id
       LEFT JOIN LATERAL (
         SELECT t.status, t.version, t.published_at,
                jsonb_array_length(t.sections) AS section_count
           FROM storefront_themes t
          WHERE t.store_id = s.id
          ORDER BY (t.status = 'published') DESC, t.updated_at DESC
          LIMIT 1
       ) th ON TRUE
      WHERE s.id = $1`,
    [storeId]
  );

  const header = headerResult.rows[0];
  if (!header) return null;

  const [orderStats, catalogStats, recentOrders, topProducts, daily, trafficTotals, topPages, topReferrers, subscription] =
    await Promise.all([
      db.query<OrderStatsRow>(
        // "Received" is the shared predicate, and every count below states which population it
        // is over. `cancelled` and `refunded_count` overlap, so the overlap is selected too:
        // rendering the two as independent columns is what made three bad orders read as six.
        `SELECT COUNT(*) FILTER (WHERE ${RECEIVED_ORDER_PREDICATE})::bigint AS received,
                COUNT(*) FILTER (WHERE o.shipped_at IS NOT NULL)::bigint AS shipped,
                COUNT(*) FILTER (WHERE o.delivered_at IS NOT NULL)::bigint AS delivered,
                COUNT(*) FILTER (WHERE ${CANCELLED_ORDER_PREDICATE})::bigint AS cancelled,
                COALESCE(ROUND(SUM(o.total_amount) FILTER (
                  WHERE ${CANCELLED_ORDER_PREDICATE}
                ) * 100), 0)::bigint AS cancelled_cents,
                COUNT(*) FILTER (WHERE ${REFUNDED_ORDER_PREDICATE})::bigint AS refunded_count,
                COUNT(*) FILTER (
                  WHERE ${REFUNDED_ORDER_PREDICATE} AND ${CANCELLED_ORDER_PREDICATE}
                )::bigint AS refunded_cancelled_count,
                COALESCE(
                  ROUND(SUM(o.total_amount) FILTER (WHERE ${SETTLED_ORDER_PREDICATE}) * 100), 0
                )::bigint AS gmv_cents,
                COALESCE(
                  ROUND(SUM(o.total_amount) FILTER (WHERE ${UNSETTLED_ORDER_PREDICATE}) * 100), 0
                )::bigint AS unsettled_cents,
                COUNT(*) FILTER (WHERE ${UNSETTLED_ORDER_PREDICATE})::bigint AS unsettled_orders,
                -- Three refund figures, because one number cannot answer both questions an
                -- operator has. refunded_cents is every cent that went back to a buyer.
                -- refunded_settled_cents is the part that came out of an order inside GMV - the
                -- only part it is legitimate to subtract from GMV. refunded_cancelled_cents is
                -- the rest: money GMV never contained, so subtracting it would double-count.
                COALESCE(ROUND(SUM(o.refunded_amount) * 100), 0)::bigint AS refunded_cents,
                COALESCE(ROUND(SUM(o.refunded_amount) FILTER (
                  WHERE ${SETTLED_ORDER_PREDICATE}
                ) * 100), 0)::bigint AS refunded_settled_cents,
                COALESCE(ROUND(SUM(o.refunded_amount) FILTER (
                  WHERE ${CANCELLED_ORDER_PREDICATE}
                ) * 100), 0)::bigint AS refunded_cancelled_cents,
                -- AOV divides by the orders that make up GMV, so aov x revenue_orders = gmv.
                COUNT(*) FILTER (WHERE ${SETTLED_ORDER_PREDICATE})::bigint AS revenue_orders,
                AVG(EXTRACT(EPOCH FROM (o.shipped_at - o.created_at)) / 3600.0)
                  FILTER (WHERE o.shipped_at IS NOT NULL AND o.shipped_at >= o.created_at)
                  AS avg_hours_to_ship,
                COUNT(*) FILTER (
                  WHERE ${RECEIVED_ORDER_PREDICATE}
                    AND o.created_at >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
                )::bigint AS received_30d,
                COUNT(*) FILTER (
                  WHERE o.shipped_at >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
                )::bigint AS shipped_30d,
                COALESCE(ROUND(SUM(o.total_amount) FILTER (
                  WHERE ${SETTLED_ORDER_PREDICATE}
                    AND o.created_at >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
                ) * 100), 0)::bigint AS gmv_cents_30d,
                COALESCE(ROUND(SUM(o.total_amount) FILTER (
                  WHERE ${UNSETTLED_ORDER_PREDICATE}
                    AND o.created_at >= NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
                ) * 100), 0)::bigint AS unsettled_cents_30d
           FROM orders o
          WHERE o.store_id = $1`,
        [storeId]
      ),
      db.query<CatalogStatsRow>(
        `SELECT COUNT(*)::bigint AS products,
                COUNT(*) FILTER (WHERE p.is_active = TRUE)::bigint AS active_products,
                COUNT(*) FILTER (
                  WHERE p.track_inventory = TRUE AND COALESCE(p.stock_quantity, 0) <= 0
                )::bigint AS out_of_stock,
                COUNT(*) FILTER (
                  WHERE p.track_inventory = TRUE
                    AND COALESCE(p.stock_quantity, 0) > 0
                    AND COALESCE(p.stock_quantity, 0) <= COALESCE(p.low_stock_threshold, 0)
                )::bigint AS low_stock,
                COALESCE(SUM(GREATEST(COALESCE(p.stock_quantity, 0), 0)), 0)::bigint
                  AS inventory_units,
                -- Valued at cost where a cost is known, otherwise at list. Inventory value is a
                -- what-we-paid figure; falling back to price is stated rather than hidden.
                COALESCE(ROUND(SUM(
                  GREATEST(COALESCE(p.stock_quantity, 0), 0)
                  * COALESCE(p.cost_price, p.base_price, 0)
                ) * 100), 0)::bigint AS inventory_value_cents
           FROM products p
          WHERE p.store_id = $1`,
        [storeId]
      ),
      db.query<OrderSummaryRow>(
        `SELECT ${ORDER_SUMMARY_SELECT}
           FROM orders o
          WHERE o.store_id = $1
          ORDER BY o.created_at DESC
          LIMIT ${DETAIL_RECENT_ORDERS}`,
        [storeId]
      ),
      db.query<TopProductRow>(
        // Ranked by units actually sold. Both sides carry store_id: order_items has its own
        // denormalised copy, and joining products without it would let a shared product id reach
        // across tenants.
        `SELECT p.id,
                COALESCE(p.override_name, p.name) AS name,
                p.sku,
                SUM(oi.quantity)::bigint AS units_sold,
                COALESCE(ROUND(SUM(oi.total_price) * 100), 0)::bigint AS revenue_cents,
                MAX(COALESCE(p.stock_quantity, 0))::bigint AS stock
           FROM order_items oi
           JOIN orders o   ON o.id = oi.order_id AND o.store_id = $1
           JOIN products p ON p.id = oi.product_id AND p.store_id = $1
          WHERE oi.store_id = $1
            AND ${SETTLED_ORDER_PREDICATE}
          GROUP BY p.id, COALESCE(p.override_name, p.name), p.sku
          ORDER BY units_sold DESC, revenue_cents DESC
          LIMIT ${DETAIL_TOP_LIST_SIZE}`,
        [storeId]
      ),
      db.query<DailyRow>(
        // Every day in the window is present, gaps zero-filled. Clicks come from the rollup
        // (its purpose); unique visitors can only come from the event table, which is the one
        // place a visitor id is recorded.
        `WITH days AS (
           SELECT generate_series(
                    CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}, CURRENT_DATE, INTERVAL '1 day'
                  )::date AS day
         ),
         clicks AS (
           SELECT d.day, SUM(d.clicks)::bigint AS clicks
             FROM storefront_click_daily d
            WHERE d.store_id = $1 AND d.day >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}
            GROUP BY d.day
         ),
         uniques AS (
           SELECT e.occurred_at::date AS day,
                  COUNT(DISTINCT COALESCE(e.visitor_id, e.session_id, e.id::text))::bigint AS uniques
             FROM storefront_click_events e
            WHERE e.store_id = $1
              AND e.occurred_at >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}
            GROUP BY 1
         ),
         placed AS (
           SELECT o.created_at::date AS day, COUNT(*)::bigint AS orders
             FROM orders o
            WHERE o.store_id = $1
              AND o.created_at >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}
            GROUP BY 1
         )
         SELECT days.day,
                COALESCE(clicks.clicks, 0)::bigint  AS clicks,
                COALESCE(uniques.uniques, 0)::bigint AS unique_visitors,
                COALESCE(placed.orders, 0)::bigint   AS orders
           FROM days
           LEFT JOIN clicks  ON clicks.day  = days.day
           LEFT JOIN uniques ON uniques.day = days.day
           LEFT JOIN placed  ON placed.day  = days.day
          ORDER BY days.day ASC`,
        [storeId]
      ),
      db.query<TrafficTotalsRow>(
        `SELECT (
                  SELECT COALESCE(SUM(d.clicks), 0)::bigint
                    FROM storefront_click_daily d WHERE d.store_id = $1
                ) AS clicks_all_time,
                (
                  SELECT COALESCE(SUM(d.clicks), 0)::bigint
                    FROM storefront_click_daily d
                   WHERE d.store_id = $1 AND d.day >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}
                ) AS clicks_last_30d,
                (
                  SELECT COUNT(DISTINCT COALESCE(e.visitor_id, e.session_id, e.id::text))::bigint
                    FROM storefront_click_events e
                   WHERE e.store_id = $1
                     AND e.occurred_at >= CURRENT_DATE - ${RECENT_WINDOW_DAYS - 1}
                ) AS unique_visitors_last_30d`,
        [storeId]
      ),
      db.query<TopClickRow>(
        `SELECT e.path AS label, COUNT(*)::bigint AS clicks
           FROM storefront_click_events e
          WHERE e.store_id = $1 AND NULLIF(BTRIM(e.path), '') IS NOT NULL
          GROUP BY e.path
          ORDER BY clicks DESC, label ASC
          LIMIT ${DETAIL_TOP_LIST_SIZE}`,
        [storeId]
      ),
      db.query<TopClickRow>(
        `SELECT e.referrer_domain AS label, COUNT(*)::bigint AS clicks
           FROM storefront_click_events e
          WHERE e.store_id = $1 AND NULLIF(BTRIM(e.referrer_domain), '') IS NOT NULL
          GROUP BY e.referrer_domain
          ORDER BY clicks DESC, label ASC
          LIMIT ${DETAIL_TOP_LIST_SIZE}`,
        [storeId]
      ),
      db.query<SubscriptionRow>(
        `SELECT sb.plan_key, sb.status, sb.current_period_end, sb.unit_amount
           FROM subscriptions sb
          WHERE sb.store_id = $1
          ORDER BY sb.created_at DESC
          LIMIT 1`,
        [storeId]
      ),
    ]);

  const orderRow = orderStats.rows[0];
  const catalogRow = catalogStats.rows[0];
  const trafficRow = trafficTotals.rows[0];
  const subscriptionRow = subscription.rows[0];

  const gmvCents = toNumber(orderRow?.gmv_cents);
  const revenueOrders = toNumber(orderRow?.revenue_orders);
  const ordersReceived = toNumber(orderRow?.received);
  const ordersShipped = toNumber(orderRow?.shipped);
  const received30d = toNumber(orderRow?.received_30d);
  const shipped30d = toNumber(orderRow?.shipped_30d);
  const productCount = toNumber(catalogRow?.products);
  const sectionCount = toNumber(header.theme_section_count);
  const lastSyncIso = toIso(header.shipstation_last_sync_at);
  const lastOrderIso = recentOrders.rows[0] ? toIsoRequired(recentOrders.rows[0].created_at) : null;

  const hasLogo = typeof header.logo_url === 'string' && header.logo_url.trim() !== '';
  const hasDescription =
    typeof header.store_description === 'string' && header.store_description.trim() !== '';
  const hasHero = typeof header.hero_title === 'string' && header.hero_title.trim() !== '';
  // The shared rule, so the list, the detail and the overview cannot disagree about one merchant.
  const themeCustomized = header.customized === true;
  // The theme-editing half on its own - what completenessPct counts, so a logo is not scored twice.
  const themeEdited = header.theme_edited === true;
  const isPublic = header.is_public === true;
  const shipstationConnected = header.shipstation_connected === true;
  const stripeConnected = header.stripe_connected === true;

  // completenessPct is the share of COMPLETENESS_SIGNALS that hold. The set is fixed and named up
  // top so the denominator cannot quietly shrink to make a merchant look further along.
  const signalsMet = [
    hasLogo,
    hasDescription,
    hasHero,
    themeEdited,
    isPublic,
    productCount > 0,
    shipstationConnected,
    stripeConnected,
  ].filter(Boolean).length;

  const checklist: CustomerChecklistItem[] = [
    {
      key: 'shipstation',
      label: 'ShipStation connected',
      done: shipstationConnected,
      detail: shipstationConnected
        ? lastSyncIso
          ? `last sync ${describeAge(lastSyncIso)}`
          : 'connected, never synced'
        : 'no credentials stored',
    },
    {
      key: 'stripe',
      label: 'Stripe payouts enabled',
      done: header.stripe_payouts_enabled === true,
      detail: !stripeConnected
        ? 'no Connect account'
        : header.stripe_payouts_enabled === true
          ? 'payouts enabled'
          : `onboarding ${header.stripe_onboarding_status ?? 'incomplete'}`,
    },
    {
      key: 'products',
      label: 'Products synced',
      done: productCount > 0,
      detail:
        productCount > 0
          ? `${pluralize(productCount, 'product')}, ${toNumber(catalogRow?.active_products)} active`
          : 'no products',
    },
    {
      key: 'theme',
      label: 'Storefront customized',
      done: themeCustomized,
      // Says which signal actually fired. "Customized" is the union of theme editing and
      // branding, and an operator who reads "customized" deserves to know which one it was.
      detail: !themeCustomized
        ? 'default theme, no branding set'
        : themeEdited
          ? `${pluralize(sectionCount, 'section')}, theme ${header.theme_status ?? 'draft'}`
          : 'branding set, customizer not opened',
    },
    {
      key: 'published',
      label: 'Store published',
      done: isPublic,
      detail: isPublic ? `public at /store/${header.store_slug}` : 'not public yet',
    },
    {
      key: 'first_order',
      label: 'First order received',
      done: ordersReceived > 0,
      detail:
        ordersReceived > 0
          ? `${pluralize(ordersReceived, 'order')}, last ${describeAge(lastOrderIso) ?? 'unknown'}`
          : 'no orders yet',
    },
  ];

  return {
    store: {
      storeId: header.store_id,
      storeName: header.store_name,
      storeSlug: header.store_slug,
      storeUrl: `/store/${header.store_slug}`,
      domain: header.domain,
      description: header.store_description,
      currency: header.currency ?? 'USD',
      timezone: header.timezone,
      logoUrl: header.logo_url,
      isActive: header.is_active === true,
      isPublic,
      createdAt: toIsoRequired(header.created_at),
    },
    owner: {
      id: header.owner_id,
      name: `${header.first_name ?? ''} ${header.last_name ?? ''}`.trim(),
      email: header.owner_email,
      createdAt: toIsoRequired(header.owner_created_at),
      lastLogin: toIso(header.owner_last_login),
      lastLoginTracked: toIso(header.owner_last_login) !== null,
    },
    orders: {
      received: ordersReceived,
      shipped: ordersShipped,
      delivered: toNumber(orderRow?.delivered),
      cancelled: toNumber(orderRow?.cancelled),
      cancelledCents: toNumber(orderRow?.cancelled_cents),
      refundedCount: toNumber(orderRow?.refunded_count),
      refundedCancelledCount: toNumber(orderRow?.refunded_cancelled_count),
      gmvCents,
      unsettledCents: toNumber(orderRow?.unsettled_cents),
      unsettledOrders: toNumber(orderRow?.unsettled_orders),
      settledOrders: revenueOrders,
      refundedCents: toNumber(orderRow?.refunded_cents),
      refundedSettledCents: toNumber(orderRow?.refunded_settled_cents),
      refundedCancelledCents: toNumber(orderRow?.refunded_cancelled_cents),
      // Averaged over the orders that make up GMV, so AOV x settled orders = GMV. Dividing by
      // every order, cancellations included, would understate it. `null`, never `0`, when the
      // merchant has no settled order to average.
      aovCents: averageCents(gmvCents, revenueOrders),
      // The shared helper, over the shared received population: this store's rate is computed the
      // same way as the platform's, so 17 of 27 here and the list's column agree by construction.
      fulfillmentRatePct: fulfillmentRatePct(ordersShipped, ordersReceived),
      avgHoursToShip: toNumberOrNull(orderRow?.avg_hours_to_ship),
      last30d: {
        received: received30d,
        shipped: shipped30d,
        gmvCents: toNumber(orderRow?.gmv_cents_30d),
        unsettledCents: toNumber(orderRow?.unsettled_cents_30d),
        fulfillmentRatePct: fulfillmentRatePct(shipped30d, received30d),
      },
      recent: recentOrders.rows.map(mapOrderSummary),
    },
    catalog: {
      products: productCount,
      activeProducts: toNumber(catalogRow?.active_products),
      outOfStock: toNumber(catalogRow?.out_of_stock),
      lowStock: toNumber(catalogRow?.low_stock),
      inventoryUnits: toNumber(catalogRow?.inventory_units),
      inventoryValueCents: toNumber(catalogRow?.inventory_value_cents),
      topProducts: topProducts.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        unitsSold: toNumber(row.units_sold),
        revenueCents: toNumber(row.revenue_cents),
        stock: toNumber(row.stock),
      })),
    },
    integrations: {
      shipstation: {
        connected: shipstationConnected,
        lastSyncAt: lastSyncIso,
        syncStatus: header.shipstation_sync_status,
        errorMessage: header.shipstation_error_message,
        webhookRegistered: header.shipstation_webhook_registered === true,
        autoSyncEnabled: header.shipstation_auto_sync === true,
      },
      stripe: {
        connected: stripeConnected,
        chargesEnabled: header.stripe_charges_enabled === true,
        payoutsEnabled: header.stripe_payouts_enabled === true,
        onboardingStatus: header.stripe_onboarding_status,
        detailsSubmitted: header.stripe_details_submitted === true,
      },
      subscription: {
        plan: subscriptionRow?.plan_key ?? null,
        status: subscriptionRow?.status ?? null,
        currentPeriodEnd: toIso(subscriptionRow?.current_period_end),
        // subscriptions.unit_amount is already integer cents - Stripe's own unit, stored as-is.
        unitAmountCents: toNumberOrNull(subscriptionRow?.unit_amount),
      },
    },
    customization: {
      themeCustomized,
      themeStatus: header.theme_status,
      themeVersion: toNumberOrNull(header.theme_version),
      publishedAt: toIso(header.theme_published_at),
      sectionCount,
      hasLogo,
      hasHero,
      hasDescription,
      blogPosts: toNumber(header.blog_posts),
      completenessPct: Math.round((signalsMet / COMPLETENESS_SIGNALS.length) * 100),
    },
    traffic: {
      clicksAllTime: toNumber(trafficRow?.clicks_all_time),
      clicksLast30d: toNumber(trafficRow?.clicks_last_30d),
      uniqueVisitorsLast30d: toNumber(trafficRow?.unique_visitors_last_30d),
      daily: daily.rows.map((row) => ({
        day: toDayString(row.day),
        clicks: toNumber(row.clicks),
        uniqueVisitors: toNumber(row.unique_visitors),
        orders: toNumber(row.orders),
      })),
      topPages: topPages.rows.map((row) => ({ path: row.label, clicks: toNumber(row.clicks) })),
      topReferrers: topReferrers.rows.map((row) => ({
        domain: row.label,
        clicks: toNumber(row.clicks),
      })),
    },
    checklist,
  };
}

/**
 * Whether a store exists at all.
 *
 * The orders endpoint needs this to tell "this merchant has no orders" (an empty 200) apart from
 * "there is no such merchant" (a 404). Returning an empty page for a store id that does not exist
 * is the kind of confident lie this codebase has a rule against.
 *
 * @param storeId - The store id to check.
 * @returns `true` when a store row with that id exists.
 */
export async function storeExists(storeId: string): Promise<boolean> {
  if (!validateUUID(storeId)) return false;
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM stores WHERE id = $1) AS exists',
    [storeId]
  );
  return result.rows[0]?.exists === true;
}

/**
 * One merchant's orders, paged.
 *
 * Store-scoped on both the count and the page, and the `status` filter is a bound parameter rather
 * than an interpolated literal. Ordered newest first; `id` breaks ties so paging is stable when
 * two orders share a timestamp.
 *
 * @param storeId - The merchant's store id.
 * @param params - Normalised parameters, typically from {@link normalizeCustomerOrdersParams}.
 * @returns The page of orders and its pagination envelope. An out-of-range page is an empty array
 *          with honest numbers, not an error.
 */
export async function listCustomerOrders(
  storeId: string,
  params: CustomerOrdersParams
): Promise<CustomerOrdersResult> {
  const countResult = await db.query<{ total: string }>(
    // Unfiltered, this is the same population as `received` on the detail — the tab's pagination
    // total and the header's order count are the same fact and must not disagree.
    `SELECT COUNT(*) FILTER (WHERE ${RECEIVED_ORDER_PREDICATE})::bigint AS total
       FROM orders o
      WHERE o.store_id = $1
        AND ($2::text IS NULL OR o.status = $2)`,
    [storeId, params.status]
  );

  const total = toNumber(countResult.rows[0]?.total);
  const pagination = buildPagination(params.page, params.pageSize, total);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const pageResult = await db.query<OrderSummaryRow>(
    `SELECT ${ORDER_SUMMARY_SELECT}
       FROM orders o
      WHERE o.store_id = $1
        AND ($2::text IS NULL OR o.status = $2)
      ORDER BY o.created_at DESC, o.id ASC
      LIMIT $3 OFFSET $4`,
    [storeId, params.status, pagination.pageSize, offset]
  );

  return { orders: pageResult.rows.map(mapOrderSummary), pagination };
}
