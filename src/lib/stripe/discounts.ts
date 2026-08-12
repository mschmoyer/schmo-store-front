/**
 * One-time Stripe Coupons used to represent a merchant's storefront discount inside Checkout.
 *
 * Stripe Checkout will not accept a negative line item, so a coupon the shopper redeemed on the
 * storefront (a row in our `coupons` table) has to become a Stripe Coupon before it can reduce the
 * amount charged. These coupons are ephemeral: one per checkout session, `duration: 'once'`, with
 * `max_redemptions: 1` so a leaked coupon id is worthless.
 */

import type Stripe from 'stripe';
import { getStripe } from './client';

/**
 * Create a single-use Stripe Coupon worth exactly `amountOffCents`.
 *
 * @param amountOffCents - Discount amount in cents. Must be positive.
 * @param currency - ISO-4217 currency code.
 * @param context - Metadata recorded on the coupon for reconciliation.
 * @param stripe - Optional Stripe client.
 * @returns The created coupon.
 * @throws Error when `amountOffCents` is not a positive integer.
 */
export async function createOneTimeDiscountCoupon(
  amountOffCents: number,
  currency: string,
  context: { storeId: string; couponCode: string; couponId: string },
  stripe: Stripe = getStripe('createOneTimeDiscountCoupon')
): Promise<Stripe.Coupon> {
  if (!Number.isInteger(amountOffCents) || amountOffCents <= 0) {
    throw new Error('One-time discount amount must be a positive integer number of cents');
  }

  return await stripe.coupons.create({
    amount_off: amountOffCents,
    currency: currency.toLowerCase(),
    duration: 'once',
    max_redemptions: 1,
    name: context.couponCode,
    metadata: {
      managed_by: 'rebelshops',
      scope: 'storefront_order',
      store_id: context.storeId,
      storefront_coupon_id: context.couponId,
      storefront_coupon_code: context.couponCode,
    },
  });
}
