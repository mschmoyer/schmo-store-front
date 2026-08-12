/**
 * GET /api/billing/status
 *
 * Current platform-billing state for the signed-in merchant: plan, what they pay now, what they
 * will pay after the intro window, the next charge date, and whether Stripe is configured at all.
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
  upsertSubscriptionFromStripe,
  type SubscriptionRecord,
} from '@/lib/billing/subscriptions';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  describeIntroOffer,
  formatCents,
} from '@/lib/billing/intro-offer';
import { isStripeConfigured, tryGetStripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decide what the merchant is charged on their next renewal.
 *
 * @param subscription - The local subscription mirror.
 * @returns The next charge amount in cents.
 */
function nextChargeCents(subscription: SubscriptionRecord): number {
  const list = subscription.unitAmountCents ?? PLATFORM_LIST_AMOUNT_CENTS;
  const intro = subscription.introAmountCents;

  if (intro === null || subscription.introEndsAt === null) {
    return list;
  }

  const nextChargeDate = subscription.currentPeriodEnd;
  if (!nextChargeDate) {
    return intro;
  }

  return nextChargeDate.getTime() < subscription.introEndsAt.getTime() ? intro : list;
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

  const offer = describeIntroOffer({
    listAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
    introAmountCents: PLATFORM_INTRO_AMOUNT_CENTS,
    introMonths: PLATFORM_INTRO_MONTHS,
  });

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
      return NextResponse.json({
        success: true,
        data: {
          configured,
          subscribed: false,
          entitled: false,
          plan: { key: 'rebelshops_standard', offer },
          subscription: null,
        },
      });
    }

    const nextAmount = nextChargeCents(subscription);

    return NextResponse.json({
      success: true,
      data: {
        configured,
        subscribed: true,
        entitled: isEntitled(subscription.status),
        plan: { key: subscription.planKey, offer },
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
          inIntroPeriod:
            subscription.introEndsAt !== null && subscription.introEndsAt.getTime() > Date.now(),
          introMonths: subscription.introMonths,
          introEndsAt: subscription.introEndsAt?.toISOString() ?? null,
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
