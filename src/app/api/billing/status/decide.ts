/**
 * Pure/injectable decisions behind `GET /api/billing/status`, split out of `route.ts` for the same
 * `jose`-untestability reason as `src/app/api/billing/checkout/decide.ts`.
 *
 * `nextChargeCents` distinguishes two facts `subscriptions.ts`'s mirror otherwise conflates under
 * `intro_ends_at IS NULL`: "never had a discount" (`introAmountCents` also `null`) vs. "discount
 * with no fixed end date" (a real, possibly-zero `introAmountCents`). Collapsing them once quoted a
 * 100%-off-forever comp account full price on the same screen that said the offer never ends.
 *
 * `describePendingOffer` mirrors `checkout/decide.ts`'s precedence: only a still-`attributed` claim
 * is quoted, re-checked with `isRedeemable` immediately before quoting.
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
 * Checking `introAmountCents` before `introEndsAt` is what tells "no discount" and "forever
 * discount" apart — see the module note.
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
    // A known discount with no end date is a forever coupon, not "no discount" — never reverts.
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
 * right now — a merchant sitting on a signup coupon claim is not quoted the standard intro price.
 * Mirrors the precedence `POST /api/billing/checkout` applies with no code in the request: a
 * still-attributed, still-redeemable coupon, else the standard intro offer. (A code typed into the
 * billing page's own box is evaluated by `POST /api/billing/coupon/preview` instead.)
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
  // A `redeemed` claim already paid out on an earlier subscription; treat it as no claim.
  const attributedClaim = claim && claim.status === CLAIM_STATUS_ATTRIBUTED ? claim : null;
  const candidateCoupon = attributedClaim ? await deps.getPlatformCouponById(attributedClaim.couponId) : null;
  // Re-check redeemability before quoting — a deactivated/expired coupon must stop being promised
  // here too, not just stop attaching at checkout.
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
