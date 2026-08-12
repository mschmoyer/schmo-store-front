/**
 * POST /api/billing/portal
 *
 * Returns a Stripe Billing Portal URL so a merchant can update their card, download invoices, or
 * cancel. Cancellation is handled entirely by Stripe; the resulting
 * `customer.subscription.updated` / `.deleted` webhook updates our mirror.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import { getBillingCustomerId, getSubscriptionForOwner } from '@/lib/billing/subscriptions';
import { StripeNotConfiguredError, getAppBaseUrl, getStripe, isStripeConfigured } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a Billing Portal session for the authenticated merchant.
 *
 * @param request - The inbound request.
 * @returns JSON containing the portal `url`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Billing is not configured',
        code: 'STRIPE_NOT_CONFIGURED',
      },
      { status: 503 }
    );
  }

  const { merchant } = auth;

  try {
    const subscription = await getSubscriptionForOwner(merchant.userId);
    const customerId =
      subscription?.stripeCustomerId ?? (await getBillingCustomerId(merchant.userId));

    if (!customerId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No billing account yet',
          code: 'NO_BILLING_CUSTOMER',
          message: 'Start a subscription before opening the billing portal.',
        },
        { status: 404 }
      );
    }

    const stripe = getStripe('billing portal');
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppBaseUrl()}/admin/billing`,
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }

    console.error('Billing portal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not open the billing portal',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
