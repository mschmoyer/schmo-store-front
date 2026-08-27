/**
 * The pure decision behind `POST /api/billing/coupon/preview`, split out of `route.ts` so it can be
 * unit tested with no database and no Next.js request machinery.
 *
 * This mirrors why `PLATFORM_COUPON_COOKIE` lives in its own `coupon-cookie.ts` rather than
 * `onboarding/_lib/state.ts`: `route.ts` imports `requireMerchant` (`billing/auth.ts`), which
 * imports `src/lib/auth/session.ts`, which imports `jose` — an ESM package this repo's Jest
 * transform cannot parse. A test that merely imports `route.ts` to reach a pure function fails at
 * module load with `SyntaxError: Unexpected token 'export'` in `jose`'s bundle, not because
 * anything under test is wrong. Keeping the decision here, with only type-only and
 * dependency-free imports, is what makes it testable at all.
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
  /**
   * What Checkout would actually charge today if this coupon is applied — so a caller (the
   * "Subscribe for X" button on `/admin/billing`) can name the real price the moment a code is
   * applied, rather than only after a round trip to `GET /api/billing/status`. Plan §5.3: a button
   * that names a price must name the price that will actually be charged.
   */
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
 * Decide what a coupon code means, without writing anything.
 *
 * Pure aside from the injected `lookup` — mirrors the shape of `decideJoin` in
 * `src/app/join/[code]/route.ts` so both surfaces that describe a coupon before it is redeemed
 * follow the same pattern. The reason vocabulary distinguishes `'unknown'` (resolves to nothing)
 * from `'inactive'` / `'expired'` / `'exhausted'` (resolves, but cannot be redeemed right now) —
 * the same line `/join/[code]`'s `JoinFailureReason` draws, rather than hiding which codes exist.
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
