/**
 * POST /api/checkout/quote
 *
 * Server-authoritative pricing preview for the storefront checkout page.
 *
 * The checkout UI must never show a total it computed itself, otherwise the shopper can see one
 * number and be charged another. This endpoint runs exactly the same re-pricing, stock check and
 * coupon logic as `POST /api/checkout/session`, but creates nothing in Stripe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { repriceCart } from '@/lib/billing/cart';
import { SHIPPING_OPTIONS } from '@/lib/billing/cart-pricing';
import { formatMoney } from '@/lib/billing/money';
import { getPaymentAccountForStore } from '@/lib/billing/payment-accounts';
import type { ClientCartItem } from '@/lib/billing/types';
import { isStripeConfigured } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Request body for a quote. Money values are not accepted. */
interface QuoteRequest {
  storeSlug?: string;
  storeId?: string;
  items?: ClientCartItem[];
  couponCode?: string | null;
  shippingMethod?: string | null;
  destination?: { state?: string; postalCode?: string; country?: string };
}

/**
 * Price a cart without creating a Stripe session.
 *
 * @param request - The inbound request.
 * @returns JSON with server-computed totals, coupon result, shipping options and payment state.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: QuoteRequest;

  try {
    body = (await request.json()) as QuoteRequest;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const identifier = body.storeId ?? body.storeSlug;
  if (!identifier) {
    return NextResponse.json(
      { success: false, error: 'storeSlug or storeId is required' },
      { status: 400 }
    );
  }

  try {
    const storeResult = await db.query<{ id: string; currency: string }>(
      `SELECT id, COALESCE(currency, 'USD') AS currency
         FROM stores
        WHERE (id::text = $1 OR store_slug = $1) AND is_active = true
        LIMIT 1`,
      [identifier]
    );

    const store = storeResult.rows[0];
    if (!store) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    const priced = await repriceCart({
      storeId: store.id,
      items,
      couponCode: body.couponCode ?? null,
      shippingMethod: body.shippingMethod ?? null,
      destination: body.destination,
      currency: store.currency,
    });

    const paymentAccount = await getPaymentAccountForStore(store.id);
    const stripeConfigured = isStripeConfigured();

    return NextResponse.json({
      success: true,
      data: {
        currency: priced.currency,
        items: priced.items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          unitPrice: formatMoney(item.unitPriceCents, priced.currency),
          lineTotalCents: item.lineTotalCents,
          lineTotal: formatMoney(item.lineTotalCents, priced.currency),
          imageUrl: item.imageUrl,
        })),
        rejected: priced.rejected,
        totals: {
          ...priced.totals,
          subtotal: formatMoney(priced.totals.subtotalCents, priced.currency),
          discount: formatMoney(priced.totals.discountCents, priced.currency),
          shipping: formatMoney(priced.totals.shippingCents, priced.currency),
          tax: formatMoney(priced.totals.taxCents, priced.currency),
          total: formatMoney(priced.totals.totalCents, priced.currency),
        },
        coupon: priced.coupon
          ? {
              code: priced.coupon.code,
              description: priced.coupon.description,
              discountCents: priced.coupon.discountCents,
              discount: formatMoney(priced.coupon.discountCents, priced.currency),
            }
          : null,
        couponRejected: Boolean(body.couponCode?.trim()) && priced.coupon === null,
        shippingMethod: priced.shippingMethod,
        shippingOptions: SHIPPING_OPTIONS.map((option) => ({
          id: option.id,
          name: option.name,
          description: option.description,
          estimatedDays: option.estimatedDays,
          priceCents: option.priceCents,
          price: formatMoney(option.priceCents, priced.currency),
        })),
        payments: {
          enabled: stripeConfigured,
          // A zero total needs no card, so the storefront must not gate the order on a payment
          // account the store has not connected. `POST /api/checkout/session` applies the same
          // rule server-side; this only stops the button from being disabled for no reason.
          required: priced.totals.totalCents > 0,
          settlement: paymentAccount?.chargesEnabled ? 'connected_account' : 'platform_direct',
          connected: Boolean(paymentAccount?.chargesEnabled),
        },
      },
    });
  } catch (error) {
    console.error('Checkout quote error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not price your cart',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
