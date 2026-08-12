/**
 * The RebelShops plan catalogue, defined in code.
 *
 * There is exactly one platform product today. Its Stripe object IDs are never hardcoded: they are
 * resolved from the environment first, then discovered by `lookup_key` / metadata, and only created
 * if neither exists. That makes `ensurePlatformProduct` safe to run against any Stripe account
 * (test or live) any number of times.
 */

import type Stripe from 'stripe';
import { getStripe } from './client';
import {
  PLATFORM_CURRENCY,
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
} from '../billing/intro-offer';

/** Stable key stored in Stripe metadata so objects can be rediscovered without env vars. */
export const PLATFORM_PLAN_KEY = 'rebelshops_standard';

/** `lookup_key` on the recurring Price. Lets the price be found by name in any account. */
export const PLATFORM_PRICE_LOOKUP_KEY = 'rebelshops_standard_monthly';

/** Stable coupon id requested when creating the intro coupon. Stripe allows caller-chosen ids. */
export const PLATFORM_INTRO_COUPON_ID = 'rebelshops-intro-3mo';

/** Declarative description of the single platform plan. */
export interface PlatformPlanDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly currency: string;
  readonly listAmountCents: number;
  readonly introAmountCents: number;
  readonly introMonths: number;
  readonly priceLookupKey: string;
  readonly introCouponId: string;
  readonly features: readonly string[];
}

/** The RebelShops plan. This is the single source of truth for what we sell. */
export const PLATFORM_PLAN: PlatformPlanDefinition = {
  key: PLATFORM_PLAN_KEY,
  name: 'RebelShops Storefront',
  description:
    'A storefront on top of your existing ShipStation account: products, inventory, checkout and orders.',
  currency: PLATFORM_CURRENCY,
  listAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
  introAmountCents: PLATFORM_INTRO_AMOUNT_CENTS,
  introMonths: PLATFORM_INTRO_MONTHS,
  priceLookupKey: PLATFORM_PRICE_LOOKUP_KEY,
  introCouponId: PLATFORM_INTRO_COUPON_ID,
  features: [
    'Storefront synced from your ShipStation catalogue',
    'Inventory, orders and fulfilment in one place',
    'Stripe checkout with funds settling to your own account',
    'Coupons, discounts and blog',
    'Unlimited products',
  ],
};

/**
 * Find or create the Stripe Product backing the platform plan.
 *
 * Resolution order: `STRIPE_PLATFORM_PRODUCT_ID` env var, then a metadata search on
 * `plan_key`, then creation.
 *
 * @param stripe - Optional Stripe client; defaults to the shared singleton.
 * @returns The Stripe Product.
 * @throws {import('./client').StripeNotConfiguredError} When Stripe is not configured.
 */
export async function ensurePlatformProduct(stripe: Stripe = getStripe('ensurePlatformProduct')): Promise<Stripe.Product> {
  const configuredId = process.env.STRIPE_PLATFORM_PRODUCT_ID?.trim();
  if (configuredId) {
    return await stripe.products.retrieve(configuredId);
  }

  // Stripe's product search supports metadata equality; use it to make this idempotent.
  const found = await stripe.products.search({
    query: `active:'true' AND metadata['plan_key']:'${PLATFORM_PLAN.key}'`,
    limit: 1,
  });

  if (found.data.length > 0) {
    return found.data[0];
  }

  return await stripe.products.create({
    name: PLATFORM_PLAN.name,
    description: PLATFORM_PLAN.description,
    metadata: {
      plan_key: PLATFORM_PLAN.key,
      managed_by: 'rebelshops',
    },
  });
}
