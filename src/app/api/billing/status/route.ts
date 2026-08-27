/**
 * GET /api/billing/status
 *
 * Current platform-billing state for the signed-in merchant: plan, what they pay now, what they
 * will pay once any discount window closes, the next charge date, and whether Stripe is configured
 * at all.
 *
 * Phase 5 (plan §3, §5.3) extended this beyond "the intro offer" being the only discount that
 * exists:
 *
 * - **Not yet subscribed** — `pendingOffer` names what Checkout will actually charge *today* if the
 *   merchant subscribes right now: a platform coupon already attributed to them (`resolveActiveClaim`),
 *   or the standard intro offer. `POST /api/billing/checkout` applies the identical precedence, so
 *   the price this route quotes and the price Checkout charges never disagree.
 * - **Subscribed** — `subscription.discount` says *which* discount is actually live (the intro offer,
 *   or a named platform coupon) and when it ends, rather than assuming every discount is the intro
 *   offer (the bug `readIntroDiscount` used to have — see `billing/subscriptions.ts`).
 *
 * This endpoint never throws because of a missing Stripe key - it answers `configured: false` and
 * lets the UI render the "payments not configured" state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import {
  getBillingCustomerId,
  getSubscriptionForOwner,
  isEntitled,
  lookupPlatformCouponByStripeCouponId,
  upsertSubscriptionFromStripe,
  type SubscriptionRecord,
} from '@/lib/billing/subscriptions';
import { resolveActiveClaim } from '@/lib/billing/coupon-claims';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  describeIntroOffer,
  formatCents,
  resolveIntroCouponId,
} from '@/lib/billing/intro-offer';
import { describePlatformCoupon } from '@/lib/billing/platform-coupons';
import { getPlatformCouponById } from '@/lib/platform/coupons';
import { isStripeConfigured, tryGetStripe } from '@/lib/stripe/client';
import { nextChargeCents, describePendingOffer } from './decide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type { PendingOfferSummary } from './decide';

/**
 * What discount is currently on a subscription, named honestly — plan §5.3: no screen may describe
 * a coupon in the intro offer's vocabulary, and every discount must say which one it actually is.
 */
export interface BillingDiscountSummary {
  /** Which mechanism this is. Drives whether the UI says "Intro pricing" or the coupon's own name. */
  readonly kind: 'intro' | 'platform_coupon';
  /** What to call it: `"Intro pricing"`, or the coupon's own name (e.g. `"Friends & Family"`). */
  readonly label: string;
  /** The offer sentence, e.g. `"Free for 12 months, then $19.99/month"`. */
  readonly description: string;
  /** Whether the discount window is still open (or the coupon runs forever). */
  readonly active: boolean;
  /** When the discount stops applying. `null` when it runs forever, or is not yet known. */
  readonly endsAt: string | null;
}

/**
 * Describe the discount actually on a subscription, if any — the single source both
 * `/api/billing/status` and (via this response) `/admin/billing` read from, so the two can never
 * independently decide "intro" when the subscription is really on a platform coupon.
 *
 * @param subscription - The local subscription mirror.
 * @returns The discount summary, or `null` when the subscription has never carried one (full price
 *   from the start).
 */
async function describeActiveDiscount(
  subscription: SubscriptionRecord
): Promise<BillingDiscountSummary | null> {
  const couponId = subscription.introCouponId;
  if (!couponId) {
    return null;
  }

  const endsAt = subscription.introEndsAt;
  const stillOpen = endsAt !== null && endsAt.getTime() > Date.now();

  if (couponId === resolveIntroCouponId()) {
    return {
      kind: 'intro',
      label: 'Intro pricing',
      description: describeIntroOffer({
        listAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
        introAmountCents: PLATFORM_INTRO_AMOUNT_CENTS,
        introMonths: PLATFORM_INTRO_MONTHS,
      }).headline,
      active: stillOpen,
      endsAt: endsAt?.toISOString() ?? null,
    };
  }

  const platformCoupon = await lookupPlatformCouponByStripeCouponId(couponId);
  if (!platformCoupon) {
    // Some other Stripe coupon (outside this feature, or one whose row we could not find). Say
    // nothing definite rather than guessing at a name — `currentAmountCents` still reflects the
    // real price either way.
    return null;
  }

  // A `durationMonths === null` coupon runs forever, so it has no `endsAt` to compare against —
  // it is "active" until the subscription itself ends, not until some date.
  const isForever = platformCoupon.durationMonths === null;

  return {
    kind: 'platform_coupon',
    label: platformCoupon.name,
    description: describePlatformCoupon(platformCoupon),
    active: isForever || stillOpen,
    endsAt: endsAt?.toISOString() ?? null,
  };
}

/**
 * Report subscription status for the authenticated merchant.
 *
 * @param request - The inbound request.
 * @returns JSON describing the plan and the merchant's subscription.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { merchant } = auth;
  const configured = isStripeConfigured();

  try {
    let subscription = await getSubscriptionForOwner(merchant.userId);

    // If we have a customer but no mirrored subscription, ask Stripe once and adopt what it says.
    if (!subscription && configured) {
      const customerId = await getBillingCustomerId(merchant.userId);
      const stripe = customerId ? tryGetStripe('billing status') : null;

      if (customerId && stripe) {
        const remote = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 1,
          // Without this, Stripe hands back an unexpanded coupon id and `readIntroDiscount`'s
          // string branch has to look it up separately — see the fix note in
          // `billing/subscriptions.ts`. This was the route the plan called out by name as the one
          // that "calls `subscriptions.list` with no expansion at all".
          expand: ['data.discounts'],
        });
        const latest = remote.data[0];
        if (latest) {
          subscription = await upsertSubscriptionFromStripe(latest, {
            ownerId: merchant.userId,
            storeId: merchant.storeId,
          });
        }
      }
    }

    if (!subscription) {
      const pendingOffer = await describePendingOffer(merchant.userId, {
        resolveActiveClaim,
        getPlatformCouponById,
      });
      return NextResponse.json({
        success: true,
        data: {
          configured,
          subscribed: false,
          entitled: false,
          plan: { key: 'rebelshops_standard' },
          pendingOffer,
          subscription: null,
        },
      });
    }

    const nextAmount = nextChargeCents(subscription);
    const discount = await describeActiveDiscount(subscription);

    return NextResponse.json({
      success: true,
      data: {
        configured,
        subscribed: true,
        entitled: isEntitled(subscription.status),
        plan: { key: subscription.planKey },
        pendingOffer: null,
        subscription: {
          id: subscription.stripeSubscriptionId,
          status: subscription.status,
          currency: subscription.currency,
          listAmountCents: subscription.unitAmountCents ?? PLATFORM_LIST_AMOUNT_CENTS,
          listAmountFormatted: formatCents(
            subscription.unitAmountCents ?? PLATFORM_LIST_AMOUNT_CENTS,
            subscription.currency
          ),
          currentAmountCents: nextAmount,
          currentAmountFormatted: formatCents(nextAmount, subscription.currency),
          discount,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          nextChargeAt: subscription.cancelAtPeriodEnd
            ? null
            : (subscription.currentPeriodEnd?.toISOString() ?? null),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt?.toISOString() ?? null,
          lastPaymentStatus: subscription.lastPaymentStatus,
        },
      },
    });
  } catch (error) {
    console.error('Billing status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not load billing status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
