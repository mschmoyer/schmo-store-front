/**
 * GET /api/connect/refresh
 *
 * Stripe redirects here when an Account Link expires or is reused. Account Links are single-use, so
 * the fix is to mint a new one and send the merchant straight back into onboarding.
 *
 * Like `/api/connect/return`, this is a browser navigation and cannot rely on the bearer token the
 * admin UI holds in localStorage. It only acts on an account id that already exists in
 * `payment_accounts`; anything else falls through to the billing screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPaymentAccountByStripeId } from '@/lib/billing/payment-accounts';
import { getAppBaseUrl, tryGetStripe } from '@/lib/stripe/client';
import { createOnboardingLink, resolveConnectReturnPath } from '@/lib/stripe/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mint a replacement onboarding link and redirect to it.
 *
 * @param request - The inbound request, carrying `?account=acct_...`.
 * @returns A redirect to Stripe, or back to `/admin/billing` when the account is unknown.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accountId = request.nextUrl.searchParams.get('account')?.trim();
  const destination = resolveConnectReturnPath(request.nextUrl.searchParams.get('next'));
  const baseUrl = getAppBaseUrl();

  if (accountId) {
    try {
      const known = await getPaymentAccountByStripeId(accountId);
      const stripe = known ? tryGetStripe('connect refresh') : null;

      if (known && stripe) {
        const link = await createOnboardingLink(
          accountId,
          'account_onboarding',
          stripe,
          destination
        );
        return NextResponse.redirect(link.url);
      }
    } catch (error) {
      console.error('Connect refresh link failed:', error);
    }
  }

  return NextResponse.redirect(`${baseUrl}${destination}?connect=refresh_failed`);
}
