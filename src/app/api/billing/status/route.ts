/**
 * GET /api/billing/status
 *
 * Current platform-billing state for the signed-in merchant: plan, what they pay now, what they
 * will pay once any discount window closes, the next charge date, and whether Stripe is configured.
 *
 * Not yet subscribed: `pendingOffer` names what Checkout would actually charge today, using the
 * identical precedence as `POST /api/billing/checkout` so the two never disagree. Subscribed:
 * `subscription.discount` says which discount is actually live and when it ends, rather than
 * assuming every discount is the intro offer.
 *
 * Never throws on a missing Stripe key — answers `configured: false` instead.
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

/** What discount is currently on a subscription, named honestly — never a coupon in the intro offer's vocabulary. */
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
 * Describe the discount actually on a subscription, if any.
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
    // Some other Stripe coupon we couldn't resolve — say nothing rather than guess at a name.
    return null;
  }

  // A `durationMonths === null` coupon runs forever: "active" until the subscription ends, not a date.
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

    if (!subscription && configured) {
      const customerId = await getBillingCustomerId(merchant.userId);
      const stripe = customerId ? tryGetStripe('billing status') : null;

      if (customerId && stripe) {
        const remote = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 1,
          // Without this, Stripe hands back an unexpanded coupon id and readIntroDiscount's string
          // branch has to look it up separately — see the fix note in billing/subscriptions.ts.
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
