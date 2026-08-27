/**
 * Redemption close-out for platform signup coupons (flow **A** — see
 * `docs/plans/platform-coupons.md` §6, phase 6).
 *
 * `attributeCoupon` (phase 4, `billing/coupon-claims.ts`) reserves a claim at signup — before any
 * money has moved. This module is what confirms it once Stripe reports a real subscription carrying
 * the coupon, moving the claim `attributed → redeemed` via `coupon-claims.ts`'s `markRedeemed`, the
 * one function in the codebase allowed to write that transition. Nothing here writes to
 * `platform_coupon_redemptions` directly.
 *
 * **Wired from `checkout.session.completed`'s platform-billing branch**
 * (`syncSubscriptionFromCheckout` in `../route.ts`), not from `customer.subscription.created`, even
 * though Stripe fires both for the same subscription. Two reasons, not one:
 *
 * 1. `syncSubscriptionFromCheckout` already retrieves the subscription with `expand: ['discounts']`
 *    to populate the subscription mirror's intro-discount fields, so reusing that same retrieve for
 *    the coupon coupon costs nothing extra — a second Stripe round trip is not needed.
 * 2. The Checkout Session is where our own `owner_id` metadata is set
 *    (`POST /api/billing/checkout`'s `metadata` and `subscription_data.metadata`, mirrored onto the
 *    subscription itself), and `session.metadata.owner_id` / `client_reference_id` is the exact
 *    owner-resolution `syncSubscriptionFromCheckout` already trusts for the subscription mirror.
 *    Piggybacking on it means the redemption ledger and the subscription mirror can never attribute
 *    the same event to two different owners.
 *
 * `customer.subscription.updated` (a later renewal, a plan change) is deliberately not wired to this
 * module: `markRedeemed` only ever transitions `attributed → redeemed`, so calling it again on an
 * already-redeemed claim is a safe no-op, but there is no reason to pay for the extra call on every
 * renewal when the one call at creation already closes the loop.
 *
 * **Never throws.** Every failure — no owner, no platform coupon on the discount, a Stripe lookup
 * that fails, an error out of `markRedeemed` — is caught and reported as a typed `outcome` rather
 * than propagated. That is `CLAUDE.md`'s "a coupon failure must never fail the webhook or lose the
 * subscription sync" rule made concrete: `syncSubscriptionFromCheckout` writes the subscription
 * mirror *before* calling here, and that write must stand no matter what happens next.
 */

import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { computeDiscountEndsAt } from '@/lib/billing/platform-coupons';
import { markRedeemed, type Queryable } from '@/lib/billing/coupon-claims';

/**
 * `metadata.scope` every Stripe coupon created by `stripe/platform-coupons.ts`'s
 * `describeStripeCouponFor` carries. Matching on this (rather than assuming "any coupon on this
 * subscription is ours") is what keeps the intro coupon — a different Stripe coupon, also
 * `discounts: [{ coupon }]` on the same kind of subscription — from ever being mistaken for a
 * platform signup coupon here.
 */
const PLATFORM_SIGNUP_COUPON_SCOPE = 'platform_signup';

/**
 * Every outcome {@link closeOutPlatformCouponRedemption} can report. Never a thrown error.
 *
 * `'coupon_mismatch'` (finding 14) means a live claim exists for this user, but for a *different*
 * coupon than the one Stripe just attached — `markRedeemed` refused rather than redeeming the wrong
 * row. This should not happen given the schema's one-live-claim-per-user constraint, but it is
 * checked and reported rather than assumed away.
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
 * Mirrors the shape-handling in `billing/subscriptions.ts`'s `readIntroDiscount` — the coupon moved
 * from `discount.coupon` to `discount.source.coupon` across Stripe API versions, and either can
 * arrive as a bare id rather than an object — rather than assuming one fixed shape and breaking the
 * moment Stripe's response shape shifts again.
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
 * `attributed → redeemed` (plan §6), recording the Stripe subscription id, the Stripe coupon id, and
 * when the discount window closes.
 *
 * `discountEndsAt` is derived from the subscription's actual start date (`subscription.start_date`,
 * not "now") and the coupon's `duration_in_months` via `billing/platform-coupons.ts`'s
 * `computeDiscountEndsAt` — `null` for a `forever` coupon, which is a meaningful fact ("this merchant
 * is never billed again for this offer"), not a missing value.
 *
 * **Idempotent** end to end: redelivering the same webhook event calls this again with the same
 * facts, and `markRedeemed` leaves an already-`redeemed` claim untouched (`'already_redeemed'`),
 * never a second write and never an error.
 *
 * Staff-review finding 14: `markRedeemed` is called with `expectedCouponId` read off the Stripe
 * coupon's own `platform_coupon_id` metadata (the same field `describeStripeCouponFor` stamps on
 * every coupon this feature creates) — not matched on `user_id` alone. And when `already_redeemed`
 * comes back for a *different* Stripe subscription than the claim already recorded, that is logged
 * distinctly: a second subscription trying to close out an already-spent redemption is worth seeing
 * in the logs, not a silent no-op indistinguishable from an ordinary webhook redelivery.
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
      // Finding 14: this is not an ordinary webhook redelivery (same subscription id redelivered) -
      // it is a *different* subscription trying to close out a claim that already paid out on an
      // earlier one. `markRedeemed` correctly refuses to redeem it a second time; this log line is
      // what makes that a distinguishable event instead of indistinguishable from a normal retry.
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
