/**
 * GET /api/connect/return
 *
 * Stripe redirects the merchant's browser here when they finish (or abandon) Express onboarding.
 * Returning here is not proof that onboarding succeeded - the account's capabilities are the only
 * truth - so this handler re-reads the account from Stripe, stores the snapshot, and sends the
 * merchant back to the billing screen.
 *
 * This is a browser navigation, not an authenticated API call, so it deliberately does not require
 * a session. It performs no privileged action: it only refreshes a status we would otherwise learn
 * from the `account.updated` webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentAccountByStripeId,
  savePaymentAccountStatus,
} from '@/lib/billing/payment-accounts';
import { getAppBaseUrl, tryGetStripe } from '@/lib/stripe/client';
import { refreshAccountStatus } from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Refresh the connected account and redirect back into the admin.
 *
 * @param request - The inbound request, carrying `?account=acct_...`.
 * @returns A redirect to `/admin/billing`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accountId = request.nextUrl.searchParams.get('account')?.trim();
  const baseUrl = getAppBaseUrl();
  let outcome = 'unknown';

  if (accountId) {
    try {
      const known = await getPaymentAccountByStripeId(accountId);
      const stripe = known ? tryGetStripe('connect return') : null;

      if (known && stripe) {
        const status = await refreshAccountStatus(accountId, stripe);
        await savePaymentAccountStatus(status);
        outcome = status.onboardingStatus;
      }
    } catch (error) {
      console.error('Connect return refresh failed:', error);
    }
  }

  return NextResponse.redirect(
    `${baseUrl}/admin/billing?connect=return&status=${encodeURIComponent(outcome)}`
  );
}
