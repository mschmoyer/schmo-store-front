/**
 * Transactional creation of a paid storefront order (flow B).
 *
 * Called from the Stripe webhook on `checkout.session.completed`, and directly from
 * `POST /api/checkout/session` when the server-priced total is zero and there is no payment to
 * wait for. Everything - order header, order items, inventory movement, coupon usage, and the
 * checkout-session bookkeeping - happens inside a single transaction so a partial write is
 * impossible.
 *
 * Inventory note: inserting into `order_items` fires the pre-existing
 * `update_inventory_on_order_item_insert` trigger, which decrements `products.stock_quantity` and
 * writes an `inventory_logs` row. This module therefore does **not** touch `products.stock_quantity`
 * itself (that would double-decrement); it decrements the ShipStation-synced `inventory.available`
 * ledger, which has no trigger.
 */

import type { PoolClient } from 'pg';
import { db } from '@/lib/database/connection';
import { assertStockAvailable } from './cart';
import { centsToDecimalString } from './money';
import type {
  CartTotals,
  CheckoutCustomerDetails,
  CheckoutShippingAddress,
  PricedLineItem,
} from './types';

/** Everything needed to write a paid order. */
export interface CreatePaidOrderInput {
  readonly storeId: string;
  readonly items: readonly PricedLineItem[];
  readonly totals: CartTotals;
  readonly currency: string;
  readonly customer: CheckoutCustomerDetails;
  readonly shippingAddress: CheckoutShippingAddress;
  readonly shippingMethod: string | null;
  readonly couponId: string | null;
  readonly stripeCheckoutSessionId: string;
  readonly stripePaymentIntentId: string | null;
  readonly stripeAccountId: string | null;
  /** Amount Stripe actually captured, in cents. Authoritative for reconciliation. */
  readonly amountCapturedCents: number;
  readonly applicationFeeCents: number | null;
  /** How the order was settled. Defaults to a Stripe card charge. */
  readonly paymentMethod?: string;
  /** Payment provider recorded on the order. `'none'` for a zero-total order. */
  readonly paymentProvider?: string;
}

/** The order that was created (or that already existed). */
export interface CreatedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** True when a prior webhook delivery had already created this order. */
  readonly alreadyExisted: boolean;
}

/**
 * Find an order previously created for a Stripe Checkout Session.
 *
 * @param sessionId - The Stripe Checkout Session id.
 * @returns The existing order, or `null`.
 */
export async function findOrderByCheckoutSession(
  sessionId: string
): Promise<{ orderId: string; orderNumber: string } | null> {
  const result = await db.query<{ id: string; order_number: string }>(
    `SELECT id, order_number FROM orders WHERE stripe_checkout_session_id = $1 LIMIT 1`,
    [sessionId]
  );

  const row = result.rows[0];
  return row ? { orderId: row.id, orderNumber: row.order_number } : null;
}

/**
 * Create a paid order, its line items, inventory movements and coupon usage in one transaction.
 *
 * Idempotent on `stripe_checkout_session_id`: a duplicate webhook delivery returns the existing
 * order instead of creating a second one.
 *
 * @param input - The server-priced order to write.
 * @returns The created (or pre-existing) order.
 * @throws Error when stock ran out between session creation and payment.
 */
export async function createPaidOrder(input: CreatePaidOrderInput): Promise<CreatedOrder> {
  return await db.transaction(async (client: PoolClient) => {
    // Idempotency: another delivery of the same event may already have written this order.
    const existing = await client.query<{ id: string; order_number: string }>(
      `SELECT id, order_number FROM orders WHERE stripe_checkout_session_id = $1 FOR UPDATE`,
      [input.stripeCheckoutSessionId]
    );

    if (existing.rows.length > 0) {
      return {
        orderId: existing.rows[0].id,
        orderNumber: existing.rows[0].order_number,
        alreadyExisted: true,
      };
    }

    // Lock the product rows and re-check stock. The shopper has already paid at this point, so a
    // failure here must be loud: the webhook records it and the merchant refunds or restocks.
    const rejections = await assertStockAvailable(client, input.storeId, input.items);
    if (rejections.length > 0) {
      throw new Error(
        `Cannot fulfil paid checkout session ${input.stripeCheckoutSessionId}: ` +
          rejections.map((rejection) => rejection.message).join(' ')
      );
    }

    const orderNumberResult = await client.query<{ order_number: string }>(
      `SELECT generate_order_number($1::uuid) AS order_number`,
      [input.storeId]
    );
    const orderNumber = orderNumberResult.rows[0].order_number;

    const orderResult = await client.query<{ id: string }>(
      `INSERT INTO orders (
          store_id, order_number,
          customer_email, customer_first_name, customer_last_name, customer_phone,
          shipping_first_name, shipping_last_name,
          shipping_address_line1, shipping_address_line2,
          shipping_city, shipping_state, shipping_postal_code, shipping_country,
          subtotal, tax_amount, shipping_amount, discount_amount, total_amount,
          payment_method, payment_status, payment_provider, payment_transaction_id,
          stripe_checkout_session_id, stripe_payment_intent_id, stripe_account_id,
          amount_total, currency, application_fee_amount, paid_at,
          shipping_method, status, fulfillment_status
       ) VALUES (
          $1, $2,
          $3, $4, $5, $6,
          $7, $8,
          $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $27, 'paid', $28, $20,
          $21, $20, $22,
          $23, $24, $25, CURRENT_TIMESTAMP,
          $26, 'processing', 'unfulfilled'
       )
       RETURNING id`,
      [
        input.storeId,
        orderNumber,
        input.customer.email,
        input.customer.firstName,
        input.customer.lastName,
        input.customer.phone || null,
        input.customer.firstName,
        input.customer.lastName,
        input.shippingAddress.addressLine1,
        input.shippingAddress.addressLine2 || null,
        input.shippingAddress.city,
        input.shippingAddress.state,
        input.shippingAddress.postalCode,
        (input.shippingAddress.country || 'US').slice(0, 2).toUpperCase(),
        centsToDecimalString(input.totals.subtotalCents),
        centsToDecimalString(input.totals.taxCents),
        centsToDecimalString(input.totals.shippingCents),
        centsToDecimalString(input.totals.discountCents),
        centsToDecimalString(input.totals.totalCents),
        input.stripePaymentIntentId,
        input.stripeCheckoutSessionId,
        input.stripeAccountId,
        centsToDecimalString(input.amountCapturedCents),
        input.currency.slice(0, 3).toUpperCase(),
        input.applicationFeeCents === null
          ? null
          : centsToDecimalString(input.applicationFeeCents),
        input.shippingMethod,
        input.paymentMethod ?? 'card',
        input.paymentProvider ?? 'stripe',
      ]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of input.items) {
      // This insert fires update_inventory_on_order_item_insert, which decrements
      // products.stock_quantity and writes the inventory_logs entry.
      await client.query(
        `INSERT INTO order_items (
            store_id, order_id, product_id, product_sku, product_name, product_image_url,
            unit_price, quantity, total_price
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.storeId,
          orderId,
          item.productId,
          item.sku,
          item.name,
          item.imageUrl,
          centsToDecimalString(item.unitPriceCents),
          item.quantity,
          centsToDecimalString(item.lineTotalCents),
        ]
      );

      // Decrement the ShipStation-synced availability ledger (no trigger on this table).
      await client.query(
        `UPDATE inventory
            SET available = GREATEST(available - $3, 0),
                allocated = allocated + $3,
                updated_at = CURRENT_TIMESTAMP
          WHERE store_id = $1 AND sku = $2`,
        [input.storeId, item.sku, item.quantity]
      );
    }

    if (input.couponId && input.totals.discountCents > 0) {
      // The update_coupon_usage_count trigger increments coupons.used_count from this row.
      await client.query(
        `INSERT INTO coupon_usage (store_id, coupon_id, order_id, customer_email, discount_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (coupon_id, order_id) DO NOTHING`,
        [
          input.storeId,
          input.couponId,
          orderId,
          input.customer.email,
          centsToDecimalString(input.totals.discountCents),
        ]
      );
    }

    await client.query(
      `UPDATE checkout_sessions
          SET status = 'completed',
              order_id = $2,
              stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
              completed_at = NOW(),
              updated_at = NOW()
        WHERE stripe_checkout_session_id = $1`,
      [input.stripeCheckoutSessionId, orderId, input.stripePaymentIntentId]
    );

    return { orderId, orderNumber, alreadyExisted: false };
  });
}

/**
 * Record a refund against an order.
 *
 * @param chargeId - The Stripe charge that was refunded.
 * @param paymentIntentId - The related payment intent, used as a fallback lookup key.
 * @param amountRefundedCents - Cumulative refunded amount reported by Stripe.
 * @param fullyRefunded - Whether Stripe marked the charge fully refunded.
 * @returns The affected order id, or `null` when no order matches.
 */
export async function recordRefund(
  chargeId: string | null,
  paymentIntentId: string | null,
  amountRefundedCents: number,
  fullyRefunded: boolean
): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `UPDATE orders
        SET refunded_amount = $3,
            stripe_charge_id = COALESCE(stripe_charge_id, $1),
            payment_status = CASE WHEN $4 THEN 'refunded' ELSE 'partially_refunded' END,
            status = CASE WHEN $4 THEN 'cancelled' ELSE status END,
            refunded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE ($1::varchar IS NOT NULL AND stripe_charge_id = $1)
         OR ($2::varchar IS NOT NULL AND stripe_payment_intent_id = $2)
      RETURNING id`,
    [chargeId, paymentIntentId, centsToDecimalString(amountRefundedCents), fullyRefunded]
  );

  return result.rows[0]?.id ?? null;
}
