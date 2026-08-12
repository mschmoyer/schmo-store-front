/**
 * Pure cart arithmetic for storefront checkout (flow B).
 *
 * Nothing in this module touches the network or the database, which is what makes the money model
 * testable. The database-backed re-pricing that feeds it lives in `./cart.ts`.
 *
 * **Client-supplied prices are never an input here.** The only client-supplied value that survives
 * into these functions is quantity, and it is normalized first.
 */

import { clampCents } from './money';
import type {
  AppliedCoupon,
  CartTotals,
  PricedLineItem,
} from './types';

/** A shipping option offered at checkout. Prices are authoritative server-side values. */
export interface ShippingOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly estimatedDays: string;
  /** Order subtotal (in cents) at or above which this option becomes free. */
  readonly freeAboveCents: number | null;
}

/**
 * Shipping rate card.
 *
 * EXTENSION POINT - real rates. Today these are flat placeholder rates that mirror what the
 * storefront has always displayed. When ShipStation/ShipEngine rate shopping lands, replace
 * {@link computeShippingCents} with a call that quotes rates for the destination address and cart
 * weight, and keep this table only as the offline fallback. The server, not the browser, must stay
 * the source of truth for whichever number is charged.
 */
export const SHIPPING_OPTIONS: readonly ShippingOption[] = [
  {
    id: 'standard',
    name: 'Standard Shipping',
    description: 'Free on orders over $50',
    priceCents: 0,
    estimatedDays: '5-7 business days',
    freeAboveCents: 5000,
  },
  {
    id: 'expedited',
    name: 'Expedited Shipping',
    description: 'Faster delivery',
    priceCents: 999,
    estimatedDays: '2-3 business days',
    freeAboveCents: null,
  },
  {
    id: 'overnight',
    name: 'Overnight Shipping',
    description: 'Next business day delivery',
    priceCents: 2499,
    estimatedDays: '1 business day',
    freeAboveCents: null,
  },
];

/** Shipping method used when the client sends nothing or sends something unknown. */
export const DEFAULT_SHIPPING_METHOD = 'standard';

/**
 * Look up a shipping option by id.
 *
 * @param methodId - The requested shipping method id.
 * @returns The matching option, or the default option when the id is unknown.
 */
export function resolveShippingOption(methodId: string | null | undefined): ShippingOption {
  const match = SHIPPING_OPTIONS.find((option) => option.id === methodId);
  return match ?? SHIPPING_OPTIONS[0];
}

/**
 * Normalize a client-supplied quantity into a sane positive integer.
 *
 * @param quantity - Raw value from the request body.
 * @param max - Upper bound per line.
 * @returns An integer in `[0, max]`; `0` signals an invalid request.
 */
export function normalizeQuantity(quantity: unknown, max = 999): number {
  const numeric = typeof quantity === 'number' ? quantity : Number.parseInt(String(quantity), 10);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return 0;
  }
  return Math.min(Math.floor(numeric), max);
}

/**
 * Sum the line totals of a priced cart.
 *
 * @param items - Server-priced line items.
 * @returns Subtotal in cents.
 */
export function computeSubtotalCents(items: readonly PricedLineItem[]): number {
  return items.reduce((sum, item) => sum + item.lineTotalCents, 0);
}

/**
 * Compute the shipping charge for a cart.
 *
 * @param subtotalCents - Cart subtotal before discount.
 * @param methodId - Requested shipping method id.
 * @param requiresShipping - Whether any line in the cart is a physical good.
 * @returns Shipping charge in cents.
 */
export function computeShippingCents(
  subtotalCents: number,
  methodId: string | null | undefined,
  requiresShipping = true
): number {
  if (!requiresShipping) {
    return 0;
  }

  const option = resolveShippingOption(methodId);

  if (option.freeAboveCents !== null && subtotalCents >= option.freeAboveCents) {
    return 0;
  }

  return option.priceCents;
}

/**
 * Compute sales tax for a cart.
 *
 * EXTENSION POINT - tax. RebelShops does not calculate tax yet; this deliberately returns zero so
 * no order is ever silently under- or over-taxed by a guess. When tax lands, the intended
 * implementation is Stripe Tax (`automatic_tax: { enabled: true }` on the Checkout Session, with
 * the merchant's connected account registered for the relevant jurisdictions), in which case this
 * function keeps returning `0` and Stripe adds the tax line itself. If tax is instead computed
 * in-house, replace the body here and keep the signature.
 *
 * @param taxableCents - Amount subject to tax (subtotal less discount).
 * @param destination - Destination state/postal code, once rates are jurisdiction-aware.
 * @returns Tax in cents. Always `0` today.
 */
export function computeTaxCents(
  taxableCents: number,
  destination?: { state?: string; postalCode?: string; country?: string }
): number {
  // The signature is the contract a real tax engine will implement; the inputs are intentionally
  // unused until then.
  void taxableCents;
  void destination;
  return 0;
}

/** Inputs for {@link computeCartTotals}. */
export interface CartTotalsInput {
  readonly items: readonly PricedLineItem[];
  readonly coupon?: AppliedCoupon | null;
  readonly shippingMethod?: string | null;
  readonly destination?: { state?: string; postalCode?: string; country?: string };
}

/**
 * Compute every total for a priced cart.
 *
 * Order of operations, which matters for the numbers to reconcile with Stripe:
 *   subtotal -> discount (capped at subtotal) -> shipping (on pre-discount subtotal) -> tax -> total
 *
 * @param input - Priced items plus the optional coupon, shipping method and destination.
 * @returns The {@link CartTotals}, all non-negative integer cents.
 */
export function computeCartTotals(input: CartTotalsInput): CartTotals {
  const subtotalCents = computeSubtotalCents(input.items);
  const discountCents = clampCents(input.coupon?.discountCents ?? 0, 0, subtotalCents);
  const requiresShipping = input.items.some((item) => item.requiresShipping);
  const shippingCents = computeShippingCents(subtotalCents, input.shippingMethod, requiresShipping);
  const taxCents = computeTaxCents(subtotalCents - discountCents, input.destination);

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents + taxCents);

  return { subtotalCents, discountCents, shippingCents, taxCents, totalCents };
}

/** A Stripe Checkout line item, in the shape the API expects. */
export interface StripeLineItemInput {
  readonly quantity: number;
  readonly price_data: {
    readonly currency: string;
    readonly unit_amount: number;
    readonly product_data: {
      readonly name: string;
      readonly metadata: Record<string, string>;
      readonly images?: string[];
    };
  };
}

/**
 * Translate a priced cart into Stripe Checkout line items.
 *
 * Products are sent as inline `price_data` rather than Stripe Price objects: the merchant's
 * catalogue lives in ShipStation and changes constantly, so mirroring it into Stripe would be a
 * second source of truth to keep in sync. The amounts come straight from the server-priced cart.
 *
 * Shipping and tax are added as their own synthetic line items. A coupon discount is NOT a line
 * item - Stripe rejects negative amounts - it is applied as a one-time Stripe Coupon on the
 * session (`discounts: [{ coupon }]`), so the shopper sees a real discount row in Checkout. The
 * identity that must hold is therefore:
 *
 *     sumStripeLineItems(lineItems) - totals.discountCents === totals.totalCents
 *
 * which {@link assertStripeAmountMatches} enforces before any session is created.
 *
 * @param items - Server-priced line items.
 * @param totals - Totals computed by {@link computeCartTotals}.
 * @param currency - ISO-4217 currency code, lowercased for Stripe.
 * @returns Line items ready to pass to `stripe.checkout.sessions.create`.
 */
export function buildStripeLineItems(
  items: readonly PricedLineItem[],
  totals: CartTotals,
  currency = 'usd'
): StripeLineItemInput[] {
  const currencyCode = currency.toLowerCase();

  const lineItems: StripeLineItemInput[] = items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: currencyCode,
      unit_amount: item.unitPriceCents,
      product_data: {
        name: item.name,
        metadata: { product_id: item.productId, sku: item.sku },
        ...(item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
          ? { images: [item.imageUrl] }
          : {}),
      },
    },
  }));

  if (totals.shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: currencyCode,
        unit_amount: totals.shippingCents,
        product_data: { name: 'Shipping', metadata: { line_type: 'shipping' } },
      },
    });
  }

  if (totals.taxCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: currencyCode,
        unit_amount: totals.taxCents,
        product_data: { name: 'Tax', metadata: { line_type: 'tax' } },
      },
    });
  }

  return lineItems;
}

/**
 * Sum what Stripe will charge for a set of line items.
 *
 * Used as an assertion before creating a session: if this disagrees with
 * {@link CartTotals.totalCents} the request is rejected rather than charging the wrong amount.
 *
 * @param lineItems - Stripe line items.
 * @returns Total in cents.
 */
export function sumStripeLineItems(lineItems: readonly StripeLineItemInput[]): number {
  return lineItems.reduce(
    (sum, item) => sum + item.price_data.unit_amount * item.quantity,
    0
  );
}

/**
 * Assert that what Stripe will charge equals what the server computed.
 *
 * This is the last line of defence against a pricing bug becoming a wrong charge.
 *
 * @param lineItems - The Stripe line items about to be sent.
 * @param totals - The server-computed totals.
 * @throws Error when the two disagree by even one cent.
 * @returns Nothing.
 */
export function assertStripeAmountMatches(
  lineItems: readonly StripeLineItemInput[],
  totals: CartTotals
): void {
  const stripeTotal = sumStripeLineItems(lineItems) - totals.discountCents;

  if (stripeTotal !== totals.totalCents) {
    throw new Error(
      `Checkout amount mismatch: Stripe would charge ${stripeTotal} but the server computed ` +
        `${totals.totalCents}. Refusing to create the session.`
    );
  }
}
