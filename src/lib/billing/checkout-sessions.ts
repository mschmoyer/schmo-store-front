/**
 * Persistence for the server-priced storefront checkout snapshot.
 *
 * The row written when a Stripe Checkout Session is created is the *only* thing the webhook trusts
 * when it builds the order. Stripe tells us that money moved; this table tells us what was sold and
 * for how much.
 */

import { db } from '@/lib/database/connection';
import { toCents } from './money';
import type {
  CartTotals,
  CheckoutCustomerDetails,
  CheckoutShippingAddress,
  PricedLineItem,
} from './types';

/** A stored checkout snapshot, rehydrated into application types. */
export interface CheckoutSessionSnapshot {
  readonly id: string;
  readonly storeId: string;
  readonly stripeCheckoutSessionId: string;
  readonly stripePaymentIntentId: string | null;
  readonly connectedAccountId: string | null;
  readonly status: string;
  readonly currency: string;
  readonly totals: CartTotals;
  readonly couponId: string | null;
  readonly couponCode: string | null;
  readonly customer: CheckoutCustomerDetails;
  readonly shippingAddress: CheckoutShippingAddress;
  readonly shippingMethod: string | null;
  readonly items: PricedLineItem[];
  readonly orderId: string | null;
}

/** Raw `checkout_sessions` row shape. */
interface CheckoutSessionRow extends Record<string, unknown> {
  id: string;
  store_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  connected_account_id: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  tax_amount: string;
  total_amount: string;
  coupon_id: string | null;
  coupon_code: string | null;
  customer: CheckoutCustomerDetails | null;
  shipping_address: CheckoutShippingAddress | null;
  shipping_method: string | null;
  line_items: PricedLineItem[] | null;
  order_id: string | null;
}

/**
 * Load the snapshot for a Stripe Checkout Session.
 *
 * @param stripeCheckoutSessionId - The Stripe Checkout Session id.
 * @returns The snapshot, or `null` when the session was not created by this application.
 */
export async function getCheckoutSnapshot(
  stripeCheckoutSessionId: string
): Promise<CheckoutSessionSnapshot | null> {
  const result = await db.query<CheckoutSessionRow>(
    `SELECT id, store_id, stripe_checkout_session_id, stripe_payment_intent_id,
            connected_account_id, status, currency, subtotal, discount_amount, shipping_amount,
            tax_amount, total_amount, coupon_id, coupon_code, customer, shipping_address,
            shipping_method, line_items, order_id
       FROM checkout_sessions
      WHERE stripe_checkout_session_id = $1
      LIMIT 1`,
    [stripeCheckoutSessionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const totals: CartTotals = {
    subtotalCents: toCents(row.subtotal),
    discountCents: toCents(row.discount_amount),
    shippingCents: toCents(row.shipping_amount),
    taxCents: toCents(row.tax_amount),
    totalCents: toCents(row.total_amount),
  };

  return {
    id: row.id,
    storeId: row.store_id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    connectedAccountId: row.connected_account_id,
    status: row.status,
    currency: row.currency,
    totals,
    couponId: row.coupon_id,
    couponCode: row.coupon_code,
    customer: row.customer ?? { firstName: '', lastName: '', email: '', phone: '' },
    shippingAddress:
      row.shipping_address ?? {
        addressLine1: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      },
    shippingMethod: row.shipping_method,
    items: row.line_items ?? [],
    orderId: row.order_id,
  };
}

/**
 * Mark a checkout snapshot with a terminal status.
 *
 * @param stripeCheckoutSessionId - The Stripe Checkout Session id.
 * @param status - The new status.
 * @returns Nothing.
 */
export async function markCheckoutSessionStatus(
  stripeCheckoutSessionId: string,
  status: 'expired' | 'failed' | 'completed'
): Promise<void> {
  await db.query(
    `UPDATE checkout_sessions
        SET status = $2, updated_at = NOW()
      WHERE stripe_checkout_session_id = $1`,
    [stripeCheckoutSessionId, status]
  );
}
