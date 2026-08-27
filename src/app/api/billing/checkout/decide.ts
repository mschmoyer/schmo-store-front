/**
 * The pure precedence decision behind `POST /api/billing/checkout` — which discount, if any,
 * attaches to the Checkout Session — split out of `route.ts` so it can be unit tested with no
 * database and no Next.js request machinery.
 *
 * `route.ts` imports `requireMerchant` (`billing/auth.ts`), which imports `src/lib/auth/session.ts`,
 * which imports `jose` — an ESM package this repo's Jest transform cannot parse. A test that merely
 * imports `route.ts` to reach this function fails at module load with a `jose` syntax error, not
 * because anything under test is wrong. Keeping the decision here, with only type-only and
 * dependency-injected imports, is what makes it testable at all — mirrors
 * `src/app/api/billing/coupon/preview/decide.ts`.
 *
 * Precedence, highest first (plan §3):
 *
 *   1. A code supplied in this request.
 *   2. A coupon `attributed` to this user at signup, or from an earlier billing-form attempt.
 *   3. The standard intro offer.
 *
 * Two staff-review findings live here:
 *
 * - **Finding 1.** A `redeemed` claim is a spent redemption, not a live reservation. Before this
 *   fix, `resolveActiveClaim`'s `status <> 'released'` predicate matched `redeemed` claims too, so a
 *   merchant whose free year lapsed (cancellation, or unpaid dunning on a no-card coupon) and who
 *   clicked Subscribe again got a **fresh** discount window attached to the new subscription,
 *   indefinitely repeatable and invisible in the redemptions tab. Only `status === 'attributed'`
 *   claims are honoured here now — a `redeemed` claim is treated exactly like having none.
 * - **Finding 2.** Deactivating a coupon, or letting it pass `redeem_by`, must stop *already
 *   attributed* claims from still attaching a discount — not just stop new ones. Both claim-driven
 *   branches below re-check {@link isRedeemable} on the coupon immediately before it would be used,
 *   even when the claim itself is not new.
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
 * A code supplied in the request is reserved with `attributeCoupon` (source `'billing_form'`)
 * unless the merchant already holds an `attributed` claim on that exact coupon, in which case the
 * existing claim is reused rather than attributing a redundant second time. A request code that
 * collides with a *different* live claim (including a `redeemed` one — the schema still counts it
 * as live for `idx_pcr_one_live_per_user`) is refused as `'already_claimed'`.
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
  // Finding 1: only a still-`attributed` claim is a live reservation. A `redeemed` claim already
  // did its job on a subscription that came before this one and must be treated exactly like the
  // merchant holding no claim at all — never like a fresh entitlement to attach again.
  const attributedClaim =
    existingClaim && existingClaim.status === CLAIM_STATUS_ATTRIBUTED ? existingClaim : null;

  if (couponCode) {
    const requestedCoupon = await deps.getPlatformCouponByCode(couponCode);
    if (!requestedCoupon) {
      return { ok: false, reason: 'unknown' };
    }

    if (attributedClaim && attributedClaim.couponId === requestedCoupon.id) {
      // Finding 2: re-check redeemability even on the claim the merchant already holds — it may
      // have been deactivated, or passed `redeem_by`, since it was attributed.
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
    // Finding 2: a claim attributed before the coupon was deactivated (or before it passed
    // `redeem_by`) must not still be honoured just because the reservation row exists. Falling
    // through to the intro offer below is the honest result — never a silently-applied dead coupon.
    if (claimedCoupon && isRedeemable(claimedCoupon).status === 'ok') {
      return {
        ok: true,
        discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: claimedCoupon },
      };
    }
  }

  return { ok: true, discount: { kind: 'intro' } };
}
