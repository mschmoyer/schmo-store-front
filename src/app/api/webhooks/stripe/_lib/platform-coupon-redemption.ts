/**
 * Redemption close-out for platform signup coupons.
 *
 * `attributeCoupon` (`billing/coupon-claims.ts`) reserves a claim at signup, before any money
 * moves. This module confirms it once Stripe reports a real subscription carrying the coupon,
 * moving the claim `attributed → redeemed` via `markRedeemed` — the only function allowed to write
 * that transition. Nothing here writes to `platform_coupon_redemptions` directly.
 *
 * **Wired from `checkout.session.completed`** (`syncSubscriptionFromCheckout` in `../route.ts`),
 * not `customer.subscription.created`, though Stripe fires both: that sync already retrieves the
 * subscription with `expand: ['discounts']` for the intro-discount fields, so reusing it costs
 * nothing extra, and the Checkout Session is where our `owner_id` metadata lives — the same
 * owner-resolution the subscription mirror already trusts, so the redemption ledger and the mirror
 * can never attribute the same event to two different owners.
 *
 * Not wired to `customer.subscription.updated`: `markRedeemed` only ever transitions
 * `attributed → redeemed`, a safe no-op on an already-redeemed claim, so there's no reason to pay
 * for the extra call on every renewal once the one call at creation has closed the loop.
 *
 * **Never throws.** Every failure — no owner, no platform coupon, a failed Stripe lookup, an error
 * out of `markRedeemed` — is caught and reported as a typed `outcome`, because
 * `syncSubscriptionFromCheckout` writes the subscription mirror *before* calling here, and that
 * write must stand no matter what happens next.
 */

import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { computeDiscountEndsAt } from '@/lib/billing/platform-coupons';
import { markRedeemed, type Queryable } from '@/lib/billing/coupon-claims';

/**
 * `metadata.scope` every Stripe coupon from `describeStripeCouponFor` carries. Matching on this
 * (rather than assuming any coupon on the subscription is ours) keeps the intro coupon from ever
 * being mistaken for a platform signup coupon.
 */
const PLATFORM_SIGNUP_COUPON_SCOPE = 'platform_signup';

/**
 * Every outcome {@link closeOutPlatformCouponRedemption} can report. Never a thrown error.
 *
 * `'coupon_mismatch'` means a live claim exists for this user, but for a *different* coupon than
 * the one Stripe just attached — `markRedeemed` refused rather than redeeming the wrong row.
 */
export type CloseOutOutcome =
  | 'redeemed'
  | 'already_redeemed'
  | 'no_active_claim'
  | 'no_owner'
  | 'no_platform_coupon'
  | 'coupon_mismatch'
  | 'error';

/** The result of {@link closeOutPlatformCouponRedemption}. */
export interface CloseOutResult {
  readonly outcome: CloseOutOutcome;
  /** Present only when `outcome === 'error'`. Logged by the caller, never surfaced to Stripe. */
  readonly errorMessage?: string;
}

/** What the caller already knows and hands in. */
export interface CloseOutPlatformCouponRedemptionInput {
  /** Resolved the same way `syncSubscriptionFromCheckout` resolves it for the subscription mirror. */
  readonly ownerId: string | null;
  /** The subscription Stripe just confirmed, ideally retrieved with `expand: ['discounts']`. */
  readonly subscription: Stripe.Subscription;
}

/** Injectable boundaries, per `CLAUDE.md`'s "Mocks" rule — both default to the real thing. */
export interface CloseOutPlatformCouponRedemptionOptions {
  /** Query surface `markRedeemed` writes through. Defaults to the real database. */
  readonly executor?: Queryable;
  /** Resolves a coupon id to the full object when the discount arrives unexpanded. */
  readonly retrieveCoupon?: (couponId: string) => Promise<Stripe.Coupon>;
}

/**
 * The default coupon lookup: a real Stripe API call.
 *
 * @param couponId - The Stripe coupon id.
 * @returns The retrieved coupon.
 */
function defaultRetrieveCoupon(couponId: string): Promise<Stripe.Coupon> {
  return getStripe('webhook platform coupon lookup').coupons.retrieve(couponId);
}

/** Discount shape Stripe used before `discount.source.coupon` — see `billing/subscriptions.ts`. */
type LegacyDiscount = Stripe.Discount & { coupon?: string | Stripe.Coupon | null };

/**
 * Pull the Stripe Coupon off a subscription's first discount, resolving an unexpanded id when
 * necessary, and returning it only when its metadata marks it as one of our own platform signup
 * coupons.
 *
 * Mirrors the shape-handling in `billing/subscriptions.ts`'s `readIntroDiscount`: the coupon moved
 * from `discount.coupon` to `discount.source.coupon` across Stripe API versions, and either can
 * arrive as a bare id rather than an object.
 *
 * @param subscription - The subscription to inspect.
 * @param retrieveCoupon - How to resolve an unexpanded coupon id.
 * @returns The coupon, or `null` when there is no discount, or its coupon is not one of ours.
 */
async function resolvePlatformCoupon(
  subscription: Stripe.Subscription,
  retrieveCoupon: (couponId: string) => Promise<Stripe.Coupon>
): Promise<Stripe.Coupon | null> {
  const discounts = (subscription.discounts ?? []) as Array<string | Stripe.Discount>;
  const discount = discounts.find((entry): entry is Stripe.Discount => typeof entry !== 'string');
  if (!discount) {
    return null;
  }

  const rawCoupon = discount.source?.coupon ?? (discount as LegacyDiscount).coupon ?? null;
  if (!rawCoupon) {
    return null;
  }

  const coupon = typeof rawCoupon === 'string' ? await retrieveCoupon(rawCoupon) : rawCoupon;
  return coupon.metadata?.scope === PLATFORM_SIGNUP_COUPON_SCOPE ? coupon : null;
}

/**
 * Convert a Stripe unix timestamp to a `Date`.
 *
 * @param seconds - Seconds since the epoch, or nullish.
 * @returns A `Date`, or `null`.
 */
function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/**
 * Close out a redemption once Stripe confirms a subscription carrying a platform signup coupon:
 * `attributed → redeemed`, recording the Stripe subscription id, coupon id, and when the discount
 * window closes.
 *
 * `discountEndsAt` comes from the subscription's actual `start_date` (not "now") and the coupon's
 * `duration_in_months` — `null` for a `forever` coupon, a meaningful fact, not a missing value.
 *
 * **Idempotent** end to end: redelivering the same webhook event calls this again with the same
 * facts, and `markRedeemed` leaves an already-`redeemed` claim untouched, never a second write.
 *
 * `markRedeemed` is called with `expectedCouponId` read off the coupon's own `platform_coupon_id`
 * metadata, not matched on `user_id` alone. When `already_redeemed` comes back for a *different*
 * subscription than the claim recorded, that is logged distinctly — worth seeing, not a silent
 * no-op indistinguishable from an ordinary redelivery.
 *
 * @param input - The subscription's owner and the Stripe subscription Stripe just confirmed.
 * @param options - Injectable boundaries for tests — see {@link CloseOutPlatformCouponRedemptionOptions}.
 * @returns A typed outcome. **Never throws** — every failure is caught, logged, and reported as
 *   `'error'`, so a coupon-side problem can never fail the webhook or undo the subscription sync that
 *   already ran before this was called.
 */
export async function closeOutPlatformCouponRedemption(
  input: CloseOutPlatformCouponRedemptionInput,
  options: CloseOutPlatformCouponRedemptionOptions = {}
): Promise<CloseOutResult> {
  try {
    if (!input.ownerId) {
      return { outcome: 'no_owner' };
    }

    const retrieveCoupon = options.retrieveCoupon ?? defaultRetrieveCoupon;
    const coupon = await resolvePlatformCoupon(input.subscription, retrieveCoupon);
    if (!coupon) {
      return { outcome: 'no_platform_coupon' };
    }

    const startedAt = toDate(input.subscription.start_date) ?? new Date();
    const discountEndsAt = computeDiscountEndsAt(startedAt, coupon.duration_in_months ?? null);
    const expectedCouponId =
      typeof coupon.metadata?.platform_coupon_id === 'string' ? coupon.metadata.platform_coupon_id : null;

    const result = await markRedeemed(
      {
        userId: input.ownerId,
        stripeSubscriptionId: input.subscription.id,
        stripeCouponId: coupon.id,
        discountEndsAt,
        expectedCouponId,
      },
      options.executor
    );

    if (result.reason === 'no_active_claim') {
      console.warn(
        `[stripe webhook] subscription ${input.subscription.id} carries platform coupon ` +
          `${coupon.id} but user ${input.ownerId} has no active claim to close out.`
      );
      return { outcome: 'no_active_claim' };
    }

    if (result.reason === 'coupon_mismatch') {
      console.warn(
        `[stripe webhook] subscription ${input.subscription.id} carries platform coupon ` +
          `${coupon.id} (platform_coupon_id ${expectedCouponId}) but user ${input.ownerId}'s live ` +
          `claim ${result.claim.id} is for a different coupon (${result.claim.couponId}) - refusing ` +
          `to redeem the wrong claim.`
      );
      return { outcome: 'coupon_mismatch' };
    }

    if (
      result.reason === 'already_redeemed' &&
      result.claim.stripeSubscriptionId !== input.subscription.id
    ) {
      // Not an ordinary redelivery (same subscription id) — a *different* subscription trying to
      // close out a claim that already paid out on an earlier one. Worth a distinguishable log line.
      console.warn(
        `[stripe webhook] subscription ${input.subscription.id} carries platform coupon ${coupon.id}, ` +
          `but claim ${result.claim.id} was already redeemed by a different subscription ` +
          `(${result.claim.stripeSubscriptionId}). Not re-redeeming.`
      );
    }

    return { outcome: result.reason === 'ok' ? 'redeemed' : 'already_redeemed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[stripe webhook] platform coupon redemption close-out failed for subscription ` +
        `${input.subscription.id}:`,
      error
    );
    return { outcome: 'error', errorMessage: message };
  }
}
