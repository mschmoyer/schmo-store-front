/**
 * POST /api/connect/onboard
 *
 * Creates (or reuses) the merchant's Stripe Connect Express account and returns a fresh onboarding
 * link. Account Links are single-use and expire quickly, so a new one is minted on every call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import {
  createPaymentAccount,
  getPaymentAccountForStore,
  savePaymentAccountStatus,
} from '@/lib/billing/payment-accounts';
import { StripeNotConfiguredError, getStripe, isStripeConfigured } from '@/lib/stripe/client';
import {
  createConnectedAccount,
  createOnboardingLink,
  refreshAccountStatus,
} from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start or resume Connect onboarding for the authenticated merchant's store.
 *
 * @param request - The inbound request.
 * @returns JSON containing the onboarding `url`.
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
        error: 'Connect is not configured',
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Set STRIPE_SECRET_KEY on the server to enable payouts.',
      },
      { status: 503 }
    );
  }

  const { merchant } = auth;

  try {
    const stripe = getStripe('connect onboard');
    let account = await getPaymentAccountForStore(merchant.storeId);

    if (!account) {
      const created = await createConnectedAccount(
        {
          storeId: merchant.storeId,
          storeName: merchant.storeName,
          storeSlug: merchant.storeSlug,
          ownerEmail: merchant.email,
        },
        stripe
      );
      account = await createPaymentAccount(merchant.storeId, created.id, created.country ?? 'US');
    }

    // Refresh before deciding which link type to mint, so a completed account gets an update link.
    const status = await refreshAccountStatus(account.stripeAccountId, stripe);
    await savePaymentAccountStatus(status);

    const link = await createOnboardingLink(
      account.stripeAccountId,
      status.onboardingStatus === 'complete' ? 'account_update' : 'account_onboarding',
      stripe
    );

    return NextResponse.json({
      success: true,
      data: {
        url: link.url,
        expiresAt: link.expires_at,
        stripeAccountId: account.stripeAccountId,
        onboardingStatus: status.onboardingStatus,
      },
    });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }

    console.error('Connect onboarding error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not start Stripe onboarding',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
