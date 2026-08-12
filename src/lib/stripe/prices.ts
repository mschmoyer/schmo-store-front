/**
 * Resolution and idempotent provisioning of the Stripe Price and Coupon that implement the
 * "$1 for 3 months, then $19.99/month" offer.
 *
 * Nothing here hardcodes an object ID that only exists in one account. Every lookup follows the
 * same order:
 *
 *   1. an explicit environment variable (`STRIPE_PLATFORM_PRICE_ID`, `STRIPE_INTRO_COUPON_ID`)
 *   2. discovery by `lookup_key` (prices) or by well-known id (coupons)
 *   3. creation, using the catalogue in `products.ts` as the specification
 *
 * Step 3 is what `ensurePlatformPlan()` is for: run it once against a fresh Stripe account and the
 * plan exists; run it a thousand times and nothing duplicates.
 */

import type Stripe from 'stripe';
import { getStripe } from './client';
import { PLATFORM_PLAN, ensurePlatformProduct } from './products';
import { computeIntroCouponAmountOff } from '../billing/intro-offer';

/** The resolved Stripe object IDs that make the plan work. */
export interface PlatformPlanObjects {
  readonly productId: string;
  readonly priceId: string;
  readonly introCouponId: string;
  /** Undiscounted recurring amount in cents, read back from Stripe when available. */
  readonly listAmountCents: number;
  /** Effective per-invoice amount during the intro window, in cents. */
  readonly introAmountCents: number;
  readonly introMonths: number;
  readonly currency: string;
}

/**
 * Find the recurring platform Price without creating anything.
 *
 * @param stripe - Optional Stripe client.
 * @returns The Price, or `null` when it has not been provisioned yet.
 */
export async function findPlatformPrice(
  stripe: Stripe = getStripe('findPlatformPrice')
): Promise<Stripe.Price | null> {
  const configuredId = process.env.STRIPE_PLATFORM_PRICE_ID?.trim();
  if (configuredId) {
    return await stripe.prices.retrieve(configuredId);
  }

  const byLookupKey = await stripe.prices.list({
    lookup_keys: [PLATFORM_PLAN.priceLookupKey],
    active: true,
    limit: 1,
  });

  return byLookupKey.data[0] ?? null;
}

/**
 * Find or create the recurring $19.99/month Price.
 *
 * @param stripe - Optional Stripe client.
 * @returns The Stripe Price.
 */
export async function ensurePlatformPrice(
  stripe: Stripe = getStripe('ensurePlatformPrice')
): Promise<Stripe.Price> {
  const existing = await findPlatformPrice(stripe);
  if (existing) {
    return existing;
  }

  const product = await ensurePlatformProduct(stripe);

  return await stripe.prices.create({
    product: product.id,
    currency: PLATFORM_PLAN.currency,
    unit_amount: PLATFORM_PLAN.listAmountCents,
    recurring: { interval: 'month' },
    lookup_key: PLATFORM_PLAN.priceLookupKey,
    metadata: {
      plan_key: PLATFORM_PLAN.key,
      managed_by: 'rebelshops',
    },
  });
}

/**
 * Find the intro Coupon without creating anything.
 *
 * @param stripe - Optional Stripe client.
 * @returns The Coupon, or `null` when it does not exist.
 */
export async function findIntroCoupon(
  stripe: Stripe = getStripe('findIntroCoupon')
): Promise<Stripe.Coupon | null> {
  const couponId = process.env.STRIPE_INTRO_COUPON_ID?.trim() || PLATFORM_PLAN.introCouponId;

  try {
    return await stripe.coupons.retrieve(couponId);
  } catch (error) {
    if (isResourceMissing(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Find or create the Coupon that turns $19.99 into $1.00 for the first three invoices.
 *
 * The coupon is `amount_off = listAmount - introAmount` with `duration: 'repeating'` and
 * `duration_in_months: 3`. A coupon's `amount_off` cannot be edited after creation, so if an
 * existing coupon disagrees with the catalogue this throws rather than silently charging the
 * wrong amount.
 *
 * @param stripe - Optional Stripe client.
 * @returns The Stripe Coupon.
 * @throws Error when an existing coupon with the same id has different economics.
 */
export async function ensureIntroCoupon(
  stripe: Stripe = getStripe('ensureIntroCoupon')
): Promise<Stripe.Coupon> {
  const amountOff = computeIntroCouponAmountOff({
    listAmountCents: PLATFORM_PLAN.listAmountCents,
    introAmountCents: PLATFORM_PLAN.introAmountCents,
    introMonths: PLATFORM_PLAN.introMonths,
  });

  const existing = await findIntroCoupon(stripe);
  if (existing) {
    const matches =
      existing.amount_off === amountOff &&
      existing.currency === PLATFORM_PLAN.currency &&
      existing.duration === 'repeating' &&
      existing.duration_in_months === PLATFORM_PLAN.introMonths;

    if (!matches) {
      throw new Error(
        `Stripe coupon ${existing.id} does not match the RebelShops intro offer ` +
          `(expected amount_off=${amountOff} ${PLATFORM_PLAN.currency}, repeating for ` +
          `${PLATFORM_PLAN.introMonths} months). Coupons are immutable - create a new one and set ` +
          'STRIPE_INTRO_COUPON_ID.'
      );
    }

    return existing;
  }

  const couponId = process.env.STRIPE_INTRO_COUPON_ID?.trim() || PLATFORM_PLAN.introCouponId;

  return await stripe.coupons.create({
    id: couponId,
    name: `${PLATFORM_PLAN.introMonths} months intro pricing`,
    amount_off: amountOff,
    currency: PLATFORM_PLAN.currency,
    duration: 'repeating',
    duration_in_months: PLATFORM_PLAN.introMonths,
    metadata: {
      plan_key: PLATFORM_PLAN.key,
      managed_by: 'rebelshops',
      intro_amount_cents: String(PLATFORM_PLAN.introAmountCents),
    },
  });
}

/**
 * Idempotently provision (or simply resolve) every Stripe object the platform plan needs.
 *
 * Safe to call on every checkout: three cheap API reads in the steady state.
 *
 * @param stripe - Optional Stripe client.
 * @returns The resolved {@link PlatformPlanObjects}.
 */
export async function ensurePlatformPlan(
  stripe: Stripe = getStripe('ensurePlatformPlan')
): Promise<PlatformPlanObjects> {
  const price = await ensurePlatformPrice(stripe);
  const coupon = await ensureIntroCoupon(stripe);

  const listAmountCents = price.unit_amount ?? PLATFORM_PLAN.listAmountCents;
  const amountOff = coupon.amount_off ?? 0;

  return {
    productId: typeof price.product === 'string' ? price.product : price.product.id,
    priceId: price.id,
    introCouponId: coupon.id,
    listAmountCents,
    introAmountCents: Math.max(0, listAmountCents - amountOff),
    introMonths: coupon.duration_in_months ?? PLATFORM_PLAN.introMonths,
    currency: price.currency ?? PLATFORM_PLAN.currency,
  };
}

/**
 * Narrow an unknown Stripe error to "the object does not exist".
 *
 * @param error - The thrown value.
 * @returns `true` for Stripe `resource_missing` errors.
 */
function isResourceMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: string; statusCode?: number; type?: string };
  return candidate.code === 'resource_missing' || candidate.statusCode === 404;
}
