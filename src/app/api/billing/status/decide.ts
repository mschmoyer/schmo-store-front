/**
 * Pure/injectable decisions behind `GET /api/billing/status`, split out of `route.ts` so they can be
 * unit tested with no database and no Next.js request machinery.
 *
 * `route.ts` imports `requireMerchant` (`billing/auth.ts`), which imports `src/lib/auth/session.ts`,
 * which imports `jose` — an ESM package this repo's Jest transform cannot parse. Mirrors
 * `src/app/api/billing/checkout/decide.ts` for the same reason.
 *
 * Two staff-review findings live here:
 *
 * - **Finding 3.** `nextChargeCents` — `subscriptions.ts`'s mirror overloads `intro_ends_at IS NULL`
 *   with two different facts: "there was never a discount" (`introAmountCents` is also `null`) and
 *   "the discount has no fixed end date" (a `duration_months IS NULL` platform coupon —
 *   `introAmountCents` is a real number, possibly `0`). Reading only `introEndsAt === null`
 *   collapsed both into "no discount, charge full price", so a 100%-off-forever comp account was
 *   quoted `$19.99` as its current price on the same screen that said the offer never ends.
 * - **Finding 1 & 2.** `describePendingOffer` — mirrors `checkout/decide.ts`'s
 *   `resolvePlatformCouponDiscount`: only a still-`attributed` claim (never a spent `redeemed` one)
 *   is quoted, and its coupon is re-checked with `isRedeemable` before being quoted, so a
 *   deactivated or expired coupon stops being promised here too, not just stops attaching at
 *   checkout.
 */

import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import { CLAIM_STATUS_ATTRIBUTED, type PlatformCouponClaimRecord } from '@/lib/billing/coupon-claims';
import {
  computeDiscountedPriceCents,
  describePlatformCoupon,
  isRedeemable,
  requiresPaymentMethod,
} from '@/lib/billing/platform-coupons';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  describeIntroOffer,
  formatCents,
} from '@/lib/billing/intro-offer';

/** The handful of `SubscriptionRecord` fields {@link nextChargeCents} actually needs. */
export interface NextChargeInput {
  readonly unitAmountCents: number | null;
  readonly introAmountCents: number | null;
  readonly introEndsAt: Date | null;
  readonly currentPeriodEnd: Date | null;
}

/**
 * Decide what the merchant is charged on their next renewal.
 *
 * `introAmountCents !== null` is only ever set alongside a real, resolved discount (see
 * `readIntroDiscount` in `subscriptions.ts` — every "unknown coupon" branch there leaves it `null`),
 * so checking it first, before `introEndsAt`, is what tells "no discount" and "forever discount"
 * apart correctly.
 *
 * @param subscription - The local subscription mirror (or the fields of it this needs).
 * @returns The next charge amount in cents.
 */
export function nextChargeCents(subscription: NextChargeInput): number {
  const list = subscription.unitAmountCents ?? PLATFORM_LIST_AMOUNT_CENTS;
  const intro = subscription.introAmountCents;

  if (intro === null) {
    return list;
  }

  if (subscription.introEndsAt === null) {
    // A known discount with no end date is a forever coupon, not "no discount" - it never reverts
    // to list price, so the discounted amount is the honest answer here and forever after.
    return intro;
  }

  const nextChargeDate = subscription.currentPeriodEnd;
  if (!nextChargeDate) {
    return intro;
  }

  return nextChargeDate.getTime() < subscription.introEndsAt.getTime() ? intro : list;
}

/**
 * What a merchant who has **not yet subscribed** will actually be charged if they click Subscribe
 * right now — plan §5.3: the button "must name the price that will actually be charged", which for
 * a merchant sitting on a signup coupon claim is not the standard intro price. Mirrors the
 * precedence `POST /api/billing/checkout` applies when no code is typed in that request: a still-
 * `attributed`, still-redeemable coupon already attributed to this user, else the standard intro
 * offer (a code typed into the billing page's own box is evaluated client-side by
 * `POST /api/billing/coupon/preview`, not here).
 */
export interface PendingOfferSummary {
  readonly kind: 'intro' | 'platform_coupon';
  /** `"Intro pricing"`, or the coupon's own name. */
  readonly label: string;
  /** The offer sentence the CTA's supporting copy renders. */
  readonly description: string;
  /** What Checkout will actually charge today if the merchant subscribes right now. */
  readonly amountDueTodayCents: number;
  readonly amountDueTodayFormatted: string;
  /** The eventual list price, once any discount window closes. */
  readonly listAmountFormatted: string;
  /** Whether Checkout will still ask for a card. */
  readonly requiresPaymentMethod: boolean;
  /** The coupon's code, when `kind === 'platform_coupon'`. */
  readonly code: string | null;
}

/** The injectable boundaries {@link describePendingOffer} needs. Both default to the real thing in `route.ts`. */
export interface DescribePendingOfferDeps {
  /** Resolves the caller's live (`attributed` or `redeemed`) claim, if any. */
  resolveActiveClaim: (userId: string) => Promise<PlatformCouponClaimRecord | null>;
  /** Resolves a coupon id exactly as `getPlatformCouponById` does. */
  getPlatformCouponById: (id: string) => Promise<PlatformCouponRecord | null>;
}

/**
 * Describe what a not-yet-subscribed merchant will actually pay today.
 *
 * @param userId - The merchant's user id.
 * @param deps - Injectable database-backed lookups. See {@link DescribePendingOfferDeps}.
 * @returns The offer that is actually pending for this merchant — a claimed, still-redeemable
 *   platform coupon when one exists, otherwise the standard intro offer.
 */
export async function describePendingOffer(
  userId: string,
  deps: DescribePendingOfferDeps
): Promise<PendingOfferSummary> {
  const claim = await deps.resolveActiveClaim(userId);
  // Finding 1: a `redeemed` claim already paid out on an earlier subscription and must never be
  // quoted as the pending offer again - treated exactly like the merchant holding no claim.
  const attributedClaim = claim && claim.status === CLAIM_STATUS_ATTRIBUTED ? claim : null;
  const candidateCoupon = attributedClaim ? await deps.getPlatformCouponById(attributedClaim.couponId) : null;
  // Finding 2: re-check redeemability before quoting it - deactivating a coupon, or letting it pass
  // `redeem_by`, must stop this page from still promising it to a merchant who has not subscribed
  // yet, not just stop new claims from being attributed.
  const coupon = candidateCoupon && isRedeemable(candidateCoupon).status === 'ok' ? candidateCoupon : null;

  if (coupon) {
    const amountDueTodayCents = computeDiscountedPriceCents(PLATFORM_LIST_AMOUNT_CENTS, coupon.percentOff);
    return {
      kind: 'platform_coupon',
      label: coupon.name,
      description: describePlatformCoupon(coupon),
      amountDueTodayCents,
      amountDueTodayFormatted: formatCents(amountDueTodayCents),
      listAmountFormatted: formatCents(PLATFORM_LIST_AMOUNT_CENTS),
      requiresPaymentMethod: requiresPaymentMethod(coupon),
      code: coupon.code,
    };
  }

  return {
    kind: 'intro',
    label: 'Intro pricing',
    description: describeIntroOffer({
      listAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
      introAmountCents: PLATFORM_INTRO_AMOUNT_CENTS,
      introMonths: PLATFORM_INTRO_MONTHS,
    }).headline,
    amountDueTodayCents: PLATFORM_INTRO_AMOUNT_CENTS,
    amountDueTodayFormatted: formatCents(PLATFORM_INTRO_AMOUNT_CENTS),
    listAmountFormatted: formatCents(PLATFORM_LIST_AMOUNT_CENTS),
    requiresPaymentMethod: true,
    code: null,
  };
}
