/**
 * The shapes the platform customers API returns.
 *
 * These live beside the UI rather than being imported from the route handlers
 * on purpose. The console is built against the published contract in
 * `CONTRACT.md`, not against whatever the query layer happens to select this
 * week: a field the API stops sending should surface as `undefined` at a type
 * boundary we control, not silently change the props of nine components.
 *
 * **Money is integer cents in every field named `*Cents`.** Convert with
 * `centsToNumber` at the render boundary; never do arithmetic on it here.
 * **Nothing in these types is a credential.** The API must not send API keys,
 * webhook secrets or Stripe tokens, and there is deliberately no field for one
 * — see the note on {@link PlatformIntegrations}.
 */

/** Sort keys the customers list endpoint accepts. */
export type CustomerSortKey =
  | 'created'
  | 'name'
  | 'orders'
  | 'shipped'
  | 'gmv'
  | 'clicks'
  | 'products';

/** Sort directions the customers list endpoint accepts. */
export type SortDirection = 'asc' | 'desc';

/** Named subsets of the merchant list. */
export type CustomerFilterKey =
  | 'all'
  | 'active'
  | 'inactive'
  | 'connected'
  | 'unconnected'
  | 'customized'
  | 'has_orders'
  | 'no_orders';

/** The pagination envelope shared by every paginated platform endpoint. */
export interface PlatformPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One merchant row in the list. */
export interface PlatformCustomerRow {
  storeId: string;
  storeName: string;
  storeSlug: string;
  /** Public storefront path, e.g. `/store/acme`. */
  storeUrl: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  isActive: boolean;
  isPublic: boolean;
  orders: { received: number; shipped: number; last30d: number };
  gmvCents: number;
  /**
   * Non-cancelled orders that were never paid. **Not part of `gmvCents`** — the
   * two together account for every order that was not cancelled, so an
   * operator reading GMV alone is reading a smaller number than the merchant
   * booked, and needs to be told where the rest went.
   */
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

/** Aggregates over the whole filtered set — not over the visible page. */
export interface PlatformCustomerTotals {
  customers: number;
  orders: number;
  shipped: number;
  gmvCents: number;
  /** Booked but never paid, across the filtered set. Excluded from `gmvCents`. */
  unsettledCents: number;
  clicks: number;
}

/** `GET /api/platform/customers` payload. */
export interface PlatformCustomersPayload {
  customers: PlatformCustomerRow[];
  pagination: PlatformPagination;
  totals: PlatformCustomerTotals;
}

/** One order row, as both the detail payload and the orders endpoint return it. */
export interface PlatformOrderRow {
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

/** `GET /api/platform/customers/[storeId]/orders` payload. */
export interface PlatformOrdersPayload {
  orders: PlatformOrderRow[];
  pagination: PlatformPagination;
}

/** The store's own record. */
export interface PlatformStoreSummary {
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
}

/** The merchant behind the store. */
export interface PlatformOwnerSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastLogin: string | null;
  /**
   * Whether `lastLogin` means anything.
   *
   * Nothing in this codebase writes `users.last_login`, so the column is `NULL`
   * on every row. Rendering that as "never signed in" would tell an operator
   * that an actively-trading merchant has never logged in, which is false. The
   * flag lets the UI say "not tracked" instead, and flips to `true` on its own
   * once the sign-in route starts writing the column.
   */
  lastLoginTracked: boolean;
}

/** Order counters and money for one store. */
export interface PlatformOrderStats {
  /** Every order this merchant took, **cancellations included**. */
  received: number;
  shipped: number;
  delivered: number;
  /** Cancelled orders. A subset of `received`, not a figure to subtract from it. */
  cancelled: number;
  /** What those cancelled orders were worth. Never part of `gmvCents`. */
  cancelledCents?: number;
  /** Orders carrying a refund. Overlaps `cancelled`; see `refundedCancelledCount`. */
  refundedCount: number;
  /**
   * How many of the refunded orders were also cancelled — the overlap, published rather than left
   * to the reader.
   *
   * Without it, "Cancelled 3" beside "Refunded 3" reads as six bad orders when it is three.
   */
  refundedCancelledCount?: number;
  gmvCents: number;
  /** Non-cancelled, never paid. Excluded from `gmvCents`; shown so it cannot go unnoticed. */
  unsettledCents: number;
  /** How many orders make up `unsettledCents`. */
  unsettledOrders: number;
  /** Orders that settled — the population `aovCents` averages over. */
  settledOrders?: number;
  /** Every dollar returned to a buyer, cancelled orders included. */
  refundedCents: number;
  /** Refunds on settled orders only — the figure `gmvCents − refunds` may be computed from. */
  refundedSettledCents?: number;
  /** Refunds on cancelled orders: real money out, of value `gmvCents` never contained. */
  refundedCancelledCents?: number;
  aovCents: number;
  /** Shipped ÷ received. `null` when nothing was received — an unmeasured rate, never `0%`. */
  fulfillmentRatePct?: number | null;
  /** Mean hours between order creation and dispatch. `null` when nothing shipped. */
  avgHoursToShip: number | null;
  last30d: {
    received: number;
    shipped: number;
    gmvCents: number;
    unsettledCents: number;
    fulfillmentRatePct?: number | null;
  };
  recent: PlatformOrderRow[];
}

/** A product row in the top-sellers table. */
export interface PlatformTopProduct {
  id: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenueCents: number;
  stock: number;
}

/** Catalogue and inventory counters for one store. */
export interface PlatformCatalogStats {
  products: number;
  activeProducts: number;
  outOfStock: number;
  lowStock: number;
  inventoryUnits: number;
  inventoryValueCents: number;
  topProducts: PlatformTopProduct[];
}

/**
 * Integration state for one store.
 *
 * Every field here is a *fact about* a credential — connected, enabled,
 * submitted — and never the credential. If a payload ever arrives carrying an
 * API key, a webhook secret or a fragment of one, that is a defect in the route
 * handler: it must be reported and fixed there, not masked here.
 */
export interface PlatformIntegrations {
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
}

/** How far the merchant has taken the storefront beyond the defaults. */
export interface PlatformCustomization {
  themeCustomized: boolean;
  themeStatus: string | null;
  themeVersion: number | null;
  publishedAt: string | null;
  sectionCount: number;
  hasLogo: boolean;
  hasHero: boolean;
  hasDescription: boolean;
  blogPosts: number;
  /** 0–100. Rendered as the checklist meter. */
  completenessPct: number;
}

/** One day of storefront activity. */
export interface PlatformTrafficDay {
  day: string;
  clicks: number;
  uniqueVisitors: number;
  orders: number;
}

/** Storefront traffic for one store. */
export interface PlatformTraffic {
  clicksAllTime: number;
  clicksLast30d: number;
  uniqueVisitorsLast30d: number;
  daily: PlatformTrafficDay[];
  topPages: Array<{ path: string; clicks: number }>;
  topReferrers: Array<{ domain: string; clicks: number }>;
}

/** One onboarding/health check. */
export interface PlatformChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

/** `GET /api/platform/customers/[storeId]` payload. */
export interface PlatformCustomerDetail {
  store: PlatformStoreSummary;
  owner: PlatformOwnerSummary;
  orders: PlatformOrderStats;
  catalog: PlatformCatalogStats;
  integrations: PlatformIntegrations;
  customization: PlatformCustomization;
  traffic: PlatformTraffic;
  checklist: PlatformChecklistItem[];
}
