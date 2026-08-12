/**
 * GET /api/connect/status
 *
 * Connect payout status for the signed-in merchant's store. Reads the local mirror and, when
 * Stripe is configured, refreshes it from the API so the merchant sees the truth after finishing
 * onboarding in another tab.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import {
  getPaymentAccountForStore,
  savePaymentAccountStatus,
} from '@/lib/billing/payment-accounts';
import { isStripeConfigured, tryGetStripe } from '@/lib/stripe/client';
import { refreshAccountStatus } from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Report Connect onboarding and payout capability for the merchant's store.
 *
 * @param request - The inbound request.
 * @returns JSON describing the connected account, or `connected: false`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  const configured = isStripeConfigured();

  try {
    let account = await getPaymentAccountForStore(auth.merchant.storeId);

    if (account && configured) {
      const stripe = tryGetStripe('connect status');
      if (stripe) {
        try {
          const fresh = await refreshAccountStatus(account.stripeAccountId, stripe);
          account = (await savePaymentAccountStatus(fresh)) ?? account;
        } catch (stripeError) {
          console.warn('Could not refresh Connect account from Stripe:', stripeError);
        }
      }
    }

    if (!account) {
      return NextResponse.json({
        success: true,
        data: { configured, connected: false, account: null },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        configured,
        connected: true,
        account: {
          stripeAccountId: account.stripeAccountId,
          onboardingStatus: account.onboardingStatus,
          chargesEnabled: account.chargesEnabled,
          payoutsEnabled: account.payoutsEnabled,
          detailsSubmitted: account.detailsSubmitted,
          requirementsCurrentlyDue: account.requirementsCurrentlyDue,
          disabledReason: account.disabledReason,
          country: account.country,
          defaultCurrency: account.defaultCurrency,
          applicationFeeBps: account.applicationFeeBps,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Connect status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not load payout status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
