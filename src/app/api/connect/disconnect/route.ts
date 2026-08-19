/**
 * DELETE /api/connect/disconnect
 *
 * Unlink this store from its Stripe Connect account.
 *
 * **This deletes our record of the link, not the Stripe account.** Stripe has no
 * platform-side "delete this connected account" for a live account with a
 * balance, and destroying a merchant's account from our admin screen would be
 * the wrong power to hold anyway. Money already settled stays with them, and the
 * account remains reachable from their own Stripe dashboard.
 *
 * What it does mean: the storefront stops being able to take payments, because
 * checkout charges on behalf of the connected account and there is no longer one
 * to name. Reconnecting starts onboarding again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireMerchant } from '@/lib/billing/auth';
import { db } from '@/lib/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Remove the store's Connect link.
 *
 * @param request - The inbound request.
 * @returns JSON reporting whether a link was removed.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireMerchant(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    // Store-scoped, like every other query touching tenant data.
    const result = await db.query(
      `DELETE FROM payment_accounts WHERE store_id = $1 RETURNING stripe_account_id`,
      [auth.merchant.storeId]
    );

    if (result.rows.length === 0) {
      // Honest about doing nothing rather than reporting a removal that did not
      // happen — a 404 here is more useful than a cheerful success.
      return NextResponse.json(
        { success: false, error: 'This store is not connected to Stripe.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'Stripe disconnected. Your Stripe account still exists — we have only removed the link, so the storefront cannot take payments until you reconnect.',
    });
  } catch (error) {
    console.error('Connect disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not disconnect Stripe.' },
      { status: 500 }
    );
  }
}
