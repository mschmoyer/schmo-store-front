/**
 * POST /api/billing/checkout
 *
 * Starts platform billing (flow A) for the signed-in merchant: a Stripe Checkout Session in
 * `subscription` mode for the $19.99/month price with the repeating intro coupon attached, so the
 * merchant is charged $1.00 today and $1.00 on each of the next two renewals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import {
  getBillingCustomerId,
  getSubscriptionForOwner,
  isEntitled,
  saveBillingCustomerId,
} from '@/lib/billing/subscriptions';
import { describeIntroOffer } from '@/lib/billing/intro-offer';
import { StripeNotConfiguredError, getAppBaseUrl, getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { ensurePlatformPlan } from '@/lib/stripe/prices';
import { PLATFORM_PLAN } from '@/lib/stripe/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      // The intro offer. amount_off = list - intro, repeating for `intro_months`.
      discounts: [{ coupon: plan.introCouponId }],
      client_reference_id: merchant.userId,
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      subscription_data: {
        metadata: {
          owner_id: merchant.userId,
          store_id: merchant.storeId,
          store_slug: merchant.storeSlug,
          plan_key: PLATFORM_PLAN.key,
        },
      },
      metadata: {
        flow: 'platform_billing',
        owner_id: merchant.userId,
        store_id: merchant.storeId,
        plan_key: PLATFORM_PLAN.key,
      },
      success_url: `${baseUrl}/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/admin/billing?checkout=cancelled`,
    });

    if (!session.url) {
      throw new Error('Stripe returned a Checkout Session without a redirect URL');
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        amountDueTodayCents: plan.introAmountCents,
        offer: describeIntroOffer({
          listAmountCents: plan.listAmountCents,
          introAmountCents: plan.introAmountCents,
          introMonths: plan.introMonths,
        }),
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
