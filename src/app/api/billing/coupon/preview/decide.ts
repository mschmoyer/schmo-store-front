/**
 * The pure decision behind `POST /api/billing/coupon/preview`, split out of `route.ts` for the same
 * `jose`-untestability reason as `coupon-cookie.ts` and `billing/checkout/decide.ts`: `route.ts`
 * imports `requireMerchant` → `session.ts` → `jose`, which Jest cannot parse.
 */

import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import {
  computeDiscountedPriceCents,
  describePlatformCoupon,
  isRedeemable,
  requiresPaymentMethod,
} from '@/lib/billing/platform-coupons';
import { PLATFORM_LIST_AMOUNT_CENTS, formatCents } from '@/lib/billing/intro-offer';

/** The reasons this route can report back. Mirrors `OnboardingCouponErrorReason`'s vocabulary
 * (`src/components/onboarding/lib/types.ts`) rather than inventing a second one. */
export type CouponPreviewReason = 'unknown' | 'expired' | 'exhausted' | 'inactive';

/** A coupon that can be redeemed right now. */
export interface CouponPreviewOk {
  readonly redeemable: true;
  /** As issued, for display. */
  readonly code: string;
  readonly name: string;
  /** The offer sentence from `describePlatformCoupon`, e.g. "Free for 12 months, then $19.99/month". */
  readonly offer: string;
  /** Whether Checkout will still ask for a card if this coupon is applied. */
  readonly requiresPaymentMethod: boolean;
  /** What Checkout would actually charge today, so the "Subscribe for X" button can name the real price immediately. */
  readonly amountDueTodayCents: number;
  readonly amountDueTodayFormatted: string;
}

/** A coupon that cannot be redeemed right now, with a typed reason — never a raw error string. */
export interface CouponPreviewFail {
  readonly redeemable: false;
  readonly reason: CouponPreviewReason;
}

/** The result of {@link previewPlatformCouponCode}. */
export type CouponPreviewResult = CouponPreviewOk | CouponPreviewFail;

/** Resolves a code to a coupon record, or `null`. Injectable so the decision is unit-testable. */
export type PlatformCouponLookup = (code: string) => Promise<PlatformCouponRecord | null>;

/**
 * Decide what a coupon code means, without writing anything. Pure aside from the injected
 * `lookup`, mirroring `decideJoin` in `src/app/join/[code]/route.ts`.
 *
 * @param rawCode - The code exactly as the merchant typed it.
 * @param lookup - Resolves a code to a coupon. In production this is `getPlatformCouponByCode`.
 * @param now - Current time, for the `redeemBy` check. Injectable for tests.
 * @returns The typed preview result.
 */
export async function previewPlatformCouponCode(
  rawCode: string,
  lookup: PlatformCouponLookup,
  now: Date = new Date()
): Promise<CouponPreviewResult> {
  const code = rawCode.trim();
  if (!code) {
    return { redeemable: false, reason: 'unknown' };
  }

  const coupon = await lookup(code);
  if (!coupon) {
    return { redeemable: false, reason: 'unknown' };
  }

  const redeemability = isRedeemable(coupon, now);
  if (redeemability.status !== 'ok') {
    return { redeemable: false, reason: redeemability.status };
  }

  const amountDueTodayCents = computeDiscountedPriceCents(PLATFORM_LIST_AMOUNT_CENTS, coupon.percentOff);

  return {
    redeemable: true,
    code: coupon.code,
    name: coupon.name,
    offer: describePlatformCoupon(coupon),
    requiresPaymentMethod: requiresPaymentMethod(coupon),
    amountDueTodayCents,
    amountDueTodayFormatted: formatCents(amountDueTodayCents),
  };
}
