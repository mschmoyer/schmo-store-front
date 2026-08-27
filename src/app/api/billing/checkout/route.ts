/**
 * POST /api/billing/checkout
 *
 * Starts platform billing (flow A) for the signed-in merchant: a Stripe Checkout Session in
 * `subscription` mode for the $19.99/month price with exactly one discount attached.
 *
 * Accepts an optional `{ couponCode }`. Precedence, highest first (plan §3):
 *
 *   1. A code supplied in this request.
 *   2. A coupon already attributed to this user (at signup, or from an earlier billing-form
 *      attempt) — {@link resolveActiveClaim}.
 *   3. The standard intro offer.
 *
 * A platform coupon **replaces** the intro offer; it never stacks with it, and never with a
 * request. `allow_promotion_codes` is deliberately never used — see the comment beside
 * `discounts` below, which cost a production incident once already.
 *
 * A code supplied in this request is reserved via `attributeCoupon` (source `'billing_form'`)
 * before the Checkout Session is created, under the same `platform_coupon_redemptions` trigger
 * that guards a code clicked from `/join` — this is what makes `max_redemptions` hold for a code
 * typed here too, rather than only for links (plan §11 invariant 1: enforced in the database, not
 * by a read-then-write in this route).
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { requireMerchant } from '@/lib/billing/auth';
import {
  getBillingCustomerId,
  getSubscriptionForOwner,
  isEntitled,
  saveBillingCustomerId,
} from '@/lib/billing/subscriptions';
import { describeIntroOffer } from '@/lib/billing/intro-offer';
import { attributeCoupon, resolveActiveClaim } from '@/lib/billing/coupon-claims';
import {
  computeDiscountedPriceCents,
  describePlatformCoupon,
  isRedeemable,
} from '@/lib/billing/platform-coupons';
import { getPlatformCouponByCode, getPlatformCouponById, type PlatformCouponRecord } from '@/lib/platform/coupons';
import { ensureStripeCouponFor, deriveSubscriptionParams } from '@/lib/stripe/platform-coupons';
import { StripeNotConfiguredError, getAppBaseUrl, getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { ensurePlatformPlan } from '@/lib/stripe/prices';
import { PLATFORM_PLAN } from '@/lib/stripe/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A reason a requested coupon code could not be applied — rendered, never a raw error string. */
export type CheckoutCouponFailureReason = 'unknown' | 'expired' | 'exhausted' | 'inactive' | 'already_claimed';

/** Human copy for each {@link CheckoutCouponFailureReason}, for the JSON error response. */
const COUPON_FAILURE_MESSAGES: Record<CheckoutCouponFailureReason, string> = {
  unknown: 'That coupon code was not found.',
  expired: 'That coupon code has expired.',
  exhausted: 'That coupon code has reached its redemption limit.',
  inactive: 'That coupon code is no longer active.',
  already_claimed:
    'This account already has a different active coupon. Only one can apply per account.',
};

/**
 * Build the 400 response for a coupon that could not be applied.
 *
 * @param reason - Why it failed.
 * @returns The JSON error response.
 */
function couponFailureResponse(reason: CheckoutCouponFailureReason): NextResponse {
  return NextResponse.json(
    { success: false, error: COUPON_FAILURE_MESSAGES[reason], code: `COUPON_${reason.toUpperCase()}` },
    { status: 400 }
  );
}

/** What discount is going on the Checkout Session, and where it came from. */
type ChosenDiscount =
  | { readonly kind: 'platform_coupon'; readonly source: 'coupon_request' | 'coupon_claim'; readonly coupon: PlatformCouponRecord }
  | { readonly kind: 'intro' };

/**
 * Resolve which discount this checkout should carry, per the precedence in the file header.
 *
 * A code supplied in the request is reserved with {@link attributeCoupon} (source `'billing_form'`)
 * unless the merchant already holds a live claim on that exact coupon, in which case the existing
 * claim is reused rather than attributing a redundant second time. A request code that collides
 * with a *different* live claim is refused as `'already_claimed'` — the schema allows only one live
 * claim per user (plan §11 invariant 2), so switching coupons at checkout is not something this
 * route can do; the merchant is already on the coupon `resolveActiveClaim` will report.
 *
 * @param couponCode - The code from the request body, if any.
 * @param userId - The signed-in merchant's user id.
 * @param storeId - The merchant's store id, for the attribution row.
 * @returns The chosen discount, or a typed failure when a requested code could not be applied.
 */
async function resolvePlatformCouponDiscount(
  couponCode: string | undefined,
  userId: string,
  storeId: string
): Promise<{ ok: true; discount: ChosenDiscount } | { ok: false; reason: CheckoutCouponFailureReason }> {
  const existingClaim = await resolveActiveClaim(userId);

  if (couponCode) {
    const requestedCoupon = await getPlatformCouponByCode(couponCode);
    if (!requestedCoupon) {
      return { ok: false, reason: 'unknown' };
    }

    if (existingClaim && existingClaim.couponId === requestedCoupon.id) {
      return {
        ok: true,
        discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: requestedCoupon },
      };
    }

    const redeemability = isRedeemable(requestedCoupon);
    if (redeemability.status !== 'ok') {
      return { ok: false, reason: redeemability.status };
    }

    const attributed = await attributeCoupon({
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

  if (existingClaim) {
    const claimedCoupon = await getPlatformCouponById(existingClaim.couponId);
    if (claimedCoupon) {
      return {
        ok: true,
        discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: claimedCoupon },
      };
    }
  }

  return { ok: true, discount: { kind: 'intro' } };
}

/**
 * Create a subscription Checkout Session for the authenticated merchant.
 *
 * @param request - The inbound request.
 * @returns JSON containing the Checkout Session `url` to redirect to.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  // `couponCode` is optional and the route must keep working for a bare `POST` with no body, which
  // is what the billing page has always sent for the plain intro-offer path.
  let couponCode: string | undefined;
  try {
    const raw = await request.text();
    if (raw) {
      const parsed = JSON.parse(raw) as { couponCode?: unknown };
      if (typeof parsed.couponCode === 'string' && parsed.couponCode.trim()) {
        couponCode = parsed.couponCode.trim();
      }
    }
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Billing is not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Set STRIPE_SECRET_KEY on the server to enable subscriptions.',
      },
      { status: 503 }
    );
  }

  const { merchant } = auth;

  try {
    const existing = await getSubscriptionForOwner(merchant.userId);
    if (existing && isEntitled(existing.status) && !existing.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          success: false,
          error: 'You already have an active subscription',
          code: 'ALREADY_SUBSCRIBED',
        },
        { status: 409 }
      );
    }

    const discountResolution = await resolvePlatformCouponDiscount(
      couponCode,
      merchant.userId,
      merchant.storeId
    );
    if (!discountResolution.ok) {
      return couponFailureResponse(discountResolution.reason);
    }
    const chosen = discountResolution.discount;

    const stripe = getStripe('billing checkout');
    const plan = await ensurePlatformPlan(stripe);

    // Reuse the merchant's Stripe customer so the billing portal and invoices stay on one account.
    let customerId = existing?.stripeCustomerId ?? (await getBillingCustomerId(merchant.userId));

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: merchant.email,
        name: `${merchant.firstName} ${merchant.lastName}`.trim() || merchant.storeName,
        metadata: {
          owner_id: merchant.userId,
          store_id: merchant.storeId,
          store_slug: merchant.storeSlug,
        },
      });
      customerId = customer.id;
      await saveBillingCustomerId(merchant.userId, customerId, merchant.email);
    }

    const baseUrl = getAppBaseUrl();

    // Exactly one discount reaches Stripe (plan §3: "a platform coupon replaces the intro offer,
    // never stacks with it"). `amountDueTodayCents` / `offer` in the response below are derived
    // from whichever branch below actually ran, never from a constant.
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[];
    let paymentMethodCollection: Stripe.Checkout.SessionCreateParams.PaymentMethodCollection | undefined;
    let amountDueTodayCents: number;
    let offer: unknown;
    let discountMetadata: Record<string, string>;

    if (chosen.kind === 'platform_coupon') {
      const stripeCoupon = await ensureStripeCouponFor(chosen.coupon, stripe);
      // `ensureStripeCouponFor` persists the id but returns only the Stripe object; build the
      // updated record in memory rather than a second round trip to re-read it.
      const resolvedRecord: PlatformCouponRecord = {
        ...chosen.coupon,
        stripeCouponId: stripeCoupon.id,
      };
      const subscriptionParams = deriveSubscriptionParams(resolvedRecord);

      discounts = [...subscriptionParams.discounts];
      paymentMethodCollection = subscriptionParams.paymentMethodCollection;
      amountDueTodayCents = computeDiscountedPriceCents(plan.listAmountCents, chosen.coupon.percentOff);
      offer = {
        kind: 'platform_coupon' as const,
        code: chosen.coupon.code,
        name: chosen.coupon.name,
        description: describePlatformCoupon(chosen.coupon),
      };
      // Recorded so the webhook (phase 6) can identify which redemption this subscription closes.
      discountMetadata = {
        discount_source: chosen.source,
        platform_coupon_id: chosen.coupon.id,
        platform_coupon_code: chosen.coupon.code,
      };
    } else {
      discounts = [{ coupon: plan.introCouponId }];
      paymentMethodCollection = undefined;
      amountDueTodayCents = plan.introAmountCents;
      offer = describeIntroOffer({
        listAmountCents: plan.listAmountCents,
        introAmountCents: plan.introAmountCents,
        introMonths: plan.introMonths,
      });
      discountMetadata = { discount_source: 'intro_offer' };
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      discounts,
      client_reference_id: merchant.userId,
      // `allow_promotion_codes` is deliberately absent. Stripe rejects a session that carries it
      // alongside `discounts` -- "You may only specify one of these parameters:
      // allow_promotion_codes, discounts" -- and it rejects on the parameter being *present*, so
      // passing `false` fails exactly like passing `true`. Since exactly one discount is always
      // applied here (the coupon above, or the intro coupon), promotion codes are already
      // impossible; the field bought us nothing and broke every subscription checkout. Do not
      // reinstate it while `discounts` is set.
      billing_address_collection: 'auto',
      subscription_data: {
        metadata: {
          owner_id: merchant.userId,
          store_id: merchant.storeId,
          store_slug: merchant.storeSlug,
          plan_key: PLATFORM_PLAN.key,
          ...discountMetadata,
        },
      },
      metadata: {
        flow: 'platform_billing',
        owner_id: merchant.userId,
        store_id: merchant.storeId,
        plan_key: PLATFORM_PLAN.key,
        ...discountMetadata,
      },
      success_url: `${baseUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/admin/billing?checkout=cancelled`,
    };

    // `payment_method_collection: 'if_required'` only when a no-card coupon (§3 "Collecting a
    // card, or not") applies; omitted entirely otherwise so Stripe's default collection behaviour
    // is unchanged for the intro offer and every card-collecting coupon.
    if (paymentMethodCollection) {
      sessionParams.payment_method_collection = paymentMethodCollection;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error('Stripe returned a Checkout Session without a redirect URL');
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        amountDueTodayCents,
        offer,
      },
    });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }

    console.error('Billing checkout error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not start checkout',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
