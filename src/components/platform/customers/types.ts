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
}

/** Order counters and money for one store. */
export interface PlatformOrderStats {
  received: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  refundedCount: number;
  gmvCents: number;
  refundedCents: number;
  aovCents: number;
  /** Mean hours between order creation and dispatch. `null` when nothing shipped. */
  avgHoursToShip: number | null;
  last30d: { received: number; shipped: number; gmvCents: number };
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
