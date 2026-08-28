/**
 * The pure precedence decision behind `POST /api/billing/checkout` — which discount, if any,
 * attaches to the Checkout Session — split out of `route.ts` so it can be unit tested with no
 * database and no Next.js request machinery.
 *
 * `route.ts` imports `requireMerchant` → `session.ts` → `jose`, an ESM package Jest cannot parse;
 * importing `route.ts` to reach this function would fail at module load, not because anything under
 * test is wrong. Keeping only type-only and injected dependencies here is what makes it testable.
 *
 * Precedence, highest first:
 *
 *   1. A code supplied in this request.
 *   2. A coupon `attributed` to this user at signup, or from an earlier billing-form attempt.
 *   3. The standard intro offer.
 *
 * Only a `status === 'attributed'` claim is honoured — a `redeemed` claim already did its job on an
 * earlier subscription and must count as no claim, or a lapsed free year could be re-triggered
 * indefinitely by clicking Subscribe again. Every claim-driven branch re-checks {@link isRedeemable}
 * immediately before use, so deactivating a coupon (or its `redeem_by` passing) stops an
 * already-attributed claim from still attaching a discount, not just new ones.
 */

import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import { isRedeemable } from '@/lib/billing/platform-coupons';
import {
  CLAIM_STATUS_ATTRIBUTED,
  type AttributeCouponReason,
  type PlatformCouponClaimRecord,
  type PlatformCouponClaimSource,
} from '@/lib/billing/coupon-claims';

/** A reason a requested coupon code could not be applied — rendered, never a raw error string. */
export type CheckoutCouponFailureReason = 'unknown' | 'expired' | 'exhausted' | 'inactive' | 'already_claimed';

/** What discount is going on the Checkout Session, and where it came from. */
export type ChosenDiscount =
  | {
      readonly kind: 'platform_coupon';
      readonly source: 'coupon_request' | 'coupon_claim';
      readonly coupon: PlatformCouponRecord;
    }
  | { readonly kind: 'intro' };

/** The result of {@link resolvePlatformCouponDiscount}. */
export type ResolveCouponDiscountResult =
  | { readonly ok: true; readonly discount: ChosenDiscount }
  | { readonly ok: false; readonly reason: CheckoutCouponFailureReason };

/** Input to {@link attributeCoupon}, restated here so this module never imports the DB-backed default. */
export interface AttributeCouponCall {
  couponId: string;
  userId: string;
  storeId?: string | null;
  source: PlatformCouponClaimSource;
}

/** The injectable boundaries this decision needs. All default to the real thing in `route.ts`. */
export interface ResolvePlatformCouponDiscountDeps {
  /** Resolves the caller's live (`attributed` or `redeemed`) claim, if any. */
  resolveActiveClaim: (userId: string) => Promise<PlatformCouponClaimRecord | null>;
  /** Resolves a code exactly as `getPlatformCouponByCode` does. */
  getPlatformCouponByCode: (code: string) => Promise<PlatformCouponRecord | null>;
  /** Resolves a coupon id exactly as `getPlatformCouponById` does. */
  getPlatformCouponById: (id: string) => Promise<PlatformCouponRecord | null>;
  /** Reserves a coupon exactly as `attributeCoupon` does. */
  attributeCoupon: (input: AttributeCouponCall) => Promise<{ reason: AttributeCouponReason }>;
}

/**
 * Resolve which discount this checkout should carry, per the precedence in the file header.
 *
 * A code supplied in the request is reserved with `attributeCoupon` unless the merchant already
 * holds an `attributed` claim on that exact coupon (reused rather than re-attributed). A request
 * code colliding with a *different* live claim (a `redeemed` one included — still live for
 * `idx_pcr_one_live_per_user`) is refused as `'already_claimed'`.
 *
 * @param couponCode - The code from the request body, if any.
 * @param userId - The signed-in merchant's user id.
 * @param storeId - The merchant's store id, for the attribution row.
 * @param deps - Injectable database-backed lookups. See {@link ResolvePlatformCouponDiscountDeps}.
 * @returns The chosen discount, or a typed failure when a requested code could not be applied.
 */
export async function resolvePlatformCouponDiscount(
  couponCode: string | undefined,
  userId: string,
  storeId: string,
  deps: ResolvePlatformCouponDiscountDeps
): Promise<ResolveCouponDiscountResult> {
  const existingClaim = await deps.resolveActiveClaim(userId);
  // Only a still-`attributed` claim is live; a `redeemed` one is treated as no claim at all.
  const attributedClaim =
    existingClaim && existingClaim.status === CLAIM_STATUS_ATTRIBUTED ? existingClaim : null;

  if (couponCode) {
    const requestedCoupon = await deps.getPlatformCouponByCode(couponCode);
    if (!requestedCoupon) {
      return { ok: false, reason: 'unknown' };
    }

    if (attributedClaim && attributedClaim.couponId === requestedCoupon.id) {
      // Re-check even the claim already held — it may have been deactivated since attribution.
      const redeemability = isRedeemable(requestedCoupon);
      if (redeemability.status !== 'ok') {
        return { ok: false, reason: redeemability.status };
      }
      return {
        ok: true,
        discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: requestedCoupon },
      };
    }

    const redeemability = isRedeemable(requestedCoupon);
    if (redeemability.status !== 'ok') {
      return { ok: false, reason: redeemability.status };
    }

    const attributed = await deps.attributeCoupon({
      couponId: requestedCoupon.id,
      userId,
      storeId,
      source: 'billing_form',
    });
    if (attributed.reason !== 'ok') {
      return { ok: false, reason: attributed.reason };
    }

    return {
      ok: true,
      discount: { kind: 'platform_coupon', source: 'coupon_request', coupon: requestedCoupon },
    };
  }

  if (attributedClaim) {
    const claimedCoupon = await deps.getPlatformCouponById(attributedClaim.couponId);
    // A claim attributed before the coupon was deactivated must not still be honoured; falling
    // through to the intro offer is the honest result, never a silently-applied dead coupon.
    if (claimedCoupon && isRedeemable(claimedCoupon).status === 'ok') {
      return {
        ok: true,
        discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: claimedCoupon },
      };
    }
  }

  return { ok: true, discount: { kind: 'intro' } };
}
