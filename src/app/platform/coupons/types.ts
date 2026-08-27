/**
 * The shapes `/api/platform/coupons*` returns, as consumed by this screen.
 *
 * Kept beside the UI rather than imported from the route handlers — the same reasoning
 * `src/components/platform/customers/types.ts` gives: the console is built against the published
 * response shape, not against whatever the query layer happens to select this week. Every date is
 * an ISO string, since that is what crosses JSON; components format them at render time via
 * `date-fns`, matching the customers lane.
 */

/** The coupon-status vocabulary the console filters and labels by. */
export type PlatformCouponStatus = 'active' | 'inactive' | 'expired' | 'exhausted';

/** Every status, for building the filter tabs. */
export const PLATFORM_COUPON_STATUSES: readonly PlatformCouponStatus[] = [
  'active',
  'inactive',
  'expired',
  'exhausted',
];

/** Filters the coupons list accepts. `'all'` applies none. */
export type PlatformCouponFilter = PlatformCouponStatus | 'all';

/** One coupon row, as the API sends it. */
export interface PlatformCouponApiItem {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  percentOff: number;
  durationMonths: number | null;
  collectPaymentMethod: boolean;
  maxRedemptions: number | null;
  redeemedCount: number;
  redeemBy: string | null;
  isActive: boolean;
  status: PlatformCouponStatus;
  /** The human offer sentence, e.g. "Free for 12 months, then $19.99/month". Pre-rendered by the API. */
  offer: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/platform/coupons` payload. */
export interface PlatformCouponsPayload {
  coupons: PlatformCouponApiItem[];
  counts: Record<PlatformCouponStatus, number>;
}

/** Fields the create form submits. Mirrors `CreatePlatformCouponInput` in `src/lib/platform/coupons.ts`. */
export interface CreatePlatformCouponRequest {
  code?: string;
  name: string;
  notes?: string | null;
  percentOff: number;
  durationMonths?: number | null;
  collectPaymentMethod?: boolean;
  maxRedemptions?: number | null;
  redeemBy?: string | null;
}

/** Fields the edit/deactivate actions may submit. */
export interface PatchPlatformCouponRequest {
  name?: string;
  notes?: string | null;
  redeemBy?: string | null;
  isActive?: boolean;
}

/** The redemption-ledger vocabulary. */
export type PlatformCouponClaimStatus = 'attributed' | 'redeemed' | 'released';
export type PlatformCouponClaimSource = 'link' | 'billing_form' | 'operator';

/** One redemption row, as the API sends it. */
export interface PlatformRedemptionApiItem {
  id: string;
  status: PlatformCouponClaimStatus;
  source: PlatformCouponClaimSource;
  attributedAt: string;
  redeemedAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  discountEndsAt: string | null;
  /**
   * The live Stripe subscription status (`active`, `past_due`, `canceled`, …) for a `redeemed`
   * claim, or `null` when there is none yet — an `attributed` or `released` claim never has a
   * subscription, and neither does a `redeemed` one whose subscription row hasn't synced. Phase 6
   * promised this on the redemptions tab so an operator can tell a running free year from one that
   * lapsed and was cancelled (staff review finding 13).
   */
  subscriptionStatus: string | null;
  coupon: { id: string; code: string; name: string };
  user: { id: string; email: string; name: string };
  store: { id: string; name: string; isDemo: boolean } | null;
}

/** How many demo stores a list left out, and whether it was asked to. */
export interface PlatformCouponScope {
  includeDemo: boolean;
  demoStoresHidden: number;
}

/** The pagination envelope every paginated platform endpoint returns. */
export interface PlatformCouponPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** `GET /api/platform/coupons/redemptions` payload. */
export interface PlatformRedemptionsPayload {
  redemptions: PlatformRedemptionApiItem[];
  pagination: PlatformCouponPagination;
  scope: PlatformCouponScope;
}
