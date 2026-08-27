/**
 * GET /api/billing/coupon/notice
 *
 * The single read the `/admin` dashboard's platform-coupon banners need — see
 * `docs/plans/platform-coupons.md` §5.1/§5.2 and phase 7 of §10. It reports whichever of the two
 * clocks the merchant's live claim is currently running on:
 *
 *  - `'reservation'` — the claim is `attributed` but not yet subscribed. The clock is
 *    `attributed_at` plus {@link PLATFORM_CLAIM_RESERVATION_DAYS} (§6), which has nothing to do
 *    with a discount window that does not exist yet.
 *  - `'discount'` — the claim is `redeemed`. The clock is `discount_ends_at`, and the UI additionally
 *    needs to know whether a card is on file, which decides everything in §5.1's ladder.
 *  - `'none'` — no live claim (never had one, or it was released).
 *
 * Deliberately does **not** collapse these into one shape: the plan calls this out by name ("Two
 * clocks, not one") specifically to stop a future edit from folding a reservation deadline and a
 * discount deadline into a single "expiresAt" field that means two different things depending on
 * status. `src/lib/billing/discount-notice.ts` already declines to do that for the same reason.
 *
 * This route reads only; it writes nothing to `platform_coupon_redemptions` (that lifecycle is
 * entirely `src/lib/billing/coupon-claims.ts`'s, per that module's own header).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import { resolveActiveClaim, type PlatformCouponClaimRecord } from '@/lib/billing/coupon-claims';
import { getPlatformCouponById } from '@/lib/platform/coupons';
import { getBillingCustomerId } from '@/lib/billing/subscriptions';
import { isStripeConfigured, tryGetStripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** No live claim on this account. */
export interface CouponNoticeNone {
  readonly kind: 'none';
}

/** A claim reserved at signup, not yet subscribed — the reservation clock. */
export interface CouponNoticeReservation {
  readonly kind: 'reservation';
  /** The coupon's display code, e.g. `"FRIENDS12"`. */
  readonly code: string;
  /** The coupon's operator-facing name, kept only in case the code alone is not descriptive. */
  readonly name: string;
  /** ISO-8601. When the claim was attributed — the start of the reservation window. */
  readonly attributedAt: string;
}

/** A redeemed claim — the free-window clock that `discount-notice.ts` renders a ladder for. */
export interface CouponNoticeDiscount {
  readonly kind: 'discount';
  /** ISO-8601, or `null` when the discount never ends ("free forever"). */
  readonly discountEndsAt: string | null;
  /** Whether the merchant has a card on file, which sets the weight of every §5.1 row. */
  readonly hasPaymentMethod: boolean;
}

/** Discriminated union of everything this route can report. */
export type CouponNoticeData = CouponNoticeNone | CouponNoticeReservation | CouponNoticeDiscount;

/**
 * Whether the given Stripe customer has at least one card on file.
 *
 * A best-effort read for display purposes only — never the gate on an actual charge. On any Stripe
 * error this degrades to `false` (the more prominent, "please add a card" reading) rather than
 * failing the whole notice: an inflated "you still need to do this" is a false alarm the merchant
 * can dismiss by checking `/admin/billing`, while a missed "you still need to do this" is the
 * un-convertible no-card coupon the plan calls out as the risk phase 7 exists to close.
 *
 * @param customerId - The Stripe customer id to check.
 * @returns `true` when at least one card payment method is attached.
 */
async function hasCardOnFile(customerId: string): Promise<boolean> {
  const stripe = tryGetStripe('coupon notice: payment method check');
  if (!stripe) {
    return false;
  }

  try {
    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });
    return methods.data.length > 0;
  } catch (error) {
    console.error('[billing/coupon/notice] payment method lookup failed:', error);
    return false;
  }
}

/**
 * Build the `'reservation'` notice for an `attributed` claim.
 *
 * @param claim - The live claim, with `status === 'attributed'`.
 * @returns The reservation notice, or `'none'` when the coupon behind the claim cannot be found
 *   (should not happen — `coupon_id` is `ON DELETE RESTRICT` — but a dangling reference degrades to
 *   silence rather than a 500).
 */
async function buildReservationNotice(
  claim: PlatformCouponClaimRecord
): Promise<CouponNoticeData> {
  const coupon = await getPlatformCouponById(claim.couponId);
  if (!coupon) {
    return { kind: 'none' };
  }

  return {
    kind: 'reservation',
    code: coupon.code,
    name: coupon.name,
    attributedAt: claim.attributedAt.toISOString(),
  };
}

/**
 * Build the `'discount'` notice for a `redeemed` claim.
 *
 * @param claim - The live claim, with `status === 'redeemed'`.
 * @param userId - The owning merchant, to look up their Stripe customer.
 * @returns The discount notice.
 */
async function buildDiscountNotice(
  claim: PlatformCouponClaimRecord,
  userId: string
): Promise<CouponNoticeData> {
  const customerId = isStripeConfigured() ? await getBillingCustomerId(userId) : null;
  const hasPaymentMethod = customerId ? await hasCardOnFile(customerId) : false;

  return {
    kind: 'discount',
    discountEndsAt: claim.discountEndsAt ? claim.discountEndsAt.toISOString() : null,
    hasPaymentMethod,
  };
}

/**
 * Report the platform-coupon notice, if any, for the signed-in merchant.
 *
 * @param request - The inbound request.
 * @returns `{ success: true, data: CouponNoticeData }`, or an auth failure response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const claim = await resolveActiveClaim(auth.merchant.userId);
    if (!claim) {
      return NextResponse.json({ success: true, data: { kind: 'none' } satisfies CouponNoticeData });
    }

    const data =
      claim.status === 'attributed'
        ? await buildReservationNotice(claim)
        : await buildDiscountNotice(claim, auth.merchant.userId);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[billing/coupon/notice] failed to resolve coupon notice:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not load your coupon status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
