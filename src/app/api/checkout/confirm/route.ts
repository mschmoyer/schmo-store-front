/**
 * GET /api/checkout/confirm?session_id=cs_...
 *
 * Server-side confirmation for the order-success page. The page must not believe a query string:
 * it passes only the Stripe Checkout Session id, and this endpoint resolves it against our own
 * `checkout_sessions` / `orders` tables (consulting Stripe only to distinguish "paid, webhook not
 * landed yet" from "never paid").
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { tryGetStripe } from '@/lib/stripe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Confirmation states the success page renders. */
type ConfirmationStatus = 'paid' | 'processing' | 'open' | 'expired' | 'not_found';

/** Row shape for the session/order join. */
interface ConfirmRow extends Record<string, unknown> {
  session_status: string;
  store_slug: string;
  currency: string;
  total_amount: string;
  order_id: string | null;
  order_number: string | null;
  order_payment_status: string | null;
  order_created_at: Date | null;
  customer_email: string | null;
}

/**
 * Confirm a checkout session against the server's own records.
 *
 * @param request - The inbound request carrying `session_id`.
 * @returns JSON describing the confirmation status and, when available, the order.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: 'session_id is required' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query<ConfirmRow>(
      `SELECT cs.status        AS session_status,
              s.store_slug     AS store_slug,
              cs.currency      AS currency,
              cs.total_amount  AS total_amount,
              cs.customer_email,
              o.id             AS order_id,
              o.order_number   AS order_number,
              o.payment_status AS order_payment_status,
              o.created_at     AS order_created_at
         FROM checkout_sessions cs
         JOIN stores s ON s.id = cs.store_id
         LEFT JOIN orders o ON o.id = cs.order_id
        WHERE cs.stripe_checkout_session_id = $1
        LIMIT 1`,
      [sessionId]
    );

    const row = result.rows[0];

    if (!row) {
      return NextResponse.json({
        success: true,
        data: { status: 'not_found' satisfies ConfirmationStatus, order: null },
      });
    }

    if (row.order_id && row.order_number) {
      const items = await db.query<{
        product_name: string;
        product_sku: string;
        quantity: number;
        unit_price: string;
        total_price: string;
        product_image_url: string | null;
      }>(
        `SELECT product_name, product_sku, quantity, unit_price, total_price, product_image_url
           FROM order_items
          WHERE order_id = $1
          ORDER BY created_at`,
        [row.order_id]
      );

      return NextResponse.json({
        success: true,
        data: {
          status: 'paid' satisfies ConfirmationStatus,
          order: {
            orderNumber: row.order_number,
            paymentStatus: row.order_payment_status,
            total: row.total_amount,
            currency: row.currency,
            email: row.customer_email,
            placedAt: row.order_created_at?.toISOString() ?? null,
            storeSlug: row.store_slug,
            items: items.rows.map((item) => ({
              name: item.product_name,
              sku: item.product_sku,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              totalPrice: item.total_price,
              imageUrl: item.product_image_url,
            })),
          },
        },
      });
    }

    if (row.session_status === 'expired') {
      return NextResponse.json({
        success: true,
        data: { status: 'expired' satisfies ConfirmationStatus, order: null },
      });
    }

    // No order yet. Ask Stripe whether the money actually moved, so the page can say
    // "paid, finishing up" rather than "something went wrong".
    const stripe = tryGetStripe('checkout confirm');
    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          return NextResponse.json({
            success: true,
            data: {
              status: 'processing' satisfies ConfirmationStatus,
              order: null,
              storeSlug: row.store_slug,
            },
          });
        }
      } catch (stripeError) {
        console.warn('Could not retrieve Stripe session during confirm:', stripeError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        status: 'open' satisfies ConfirmationStatus,
        order: null,
        storeSlug: row.store_slug,
      },
    });
  } catch (error) {
    console.error('Checkout confirm error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not confirm this order',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
