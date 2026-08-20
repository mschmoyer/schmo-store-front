import {
  DEFAULT_SHIPPING_METHOD,
  SHIPPING_OPTIONS,
  assertStripeAmountMatches,
  buildStripeLineItems,
  computeCartTotals,
  computeShippingCents,
  computeSubtotalCents,
  computeTaxCents,
  normalizeQuantity,
  resolveShippingOption,
  sumStripeLineItems,
} from '../cart-pricing';
import { centsToDecimalString, toCents } from '../money';
import type { AppliedCoupon, PricedLineItem } from '../types';

/**
 * Build a server-priced line item for tests.
 *
 * @param overrides - Fields to override on the default item.
 * @returns A {@link PricedLineItem}.
 */
function line(overrides: Partial<PricedLineItem> = {}): PricedLineItem {
  const unitPriceCents = overrides.unitPriceCents ?? 1999;
  const quantity = overrides.quantity ?? 1;

  return {
    productId: overrides.productId ?? '850e8400-e29b-41d4-a716-446655440001',
    sku: overrides.sku ?? 'SKU-1',
    name: overrides.name ?? 'Test product',
    unitPriceCents,
    quantity,
    lineTotalCents: overrides.lineTotalCents ?? unitPriceCents * quantity,
    imageUrl: overrides.imageUrl ?? null,
    categoryId: overrides.categoryId ?? null,
    requiresShipping: overrides.requiresShipping ?? true,
  };
}

describe('money conversion', () => {
  it('converts decimal strings from Postgres into cents', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('0.01')).toBe(1);
    expect(toCents('2999.99')).toBe(299999);
    expect(toCents(null)).toBe(0);
    expect(toCents('not a number')).toBe(0);
  });

  it('round-trips cents back to a NUMERIC(10,2) string', () => {
    expect(centsToDecimalString(1999)).toBe('19.99');
    expect(centsToDecimalString(0)).toBe('0.00');
    expect(centsToDecimalString(299999)).toBe('2999.99');
  });

  it('avoids the classic float error', () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(centsToDecimalString(toCents('0.1') + toCents('0.2'))).toBe('0.30');
  });
});

describe('quantity normalization', () => {
  it('accepts positive integers', () => {
    expect(normalizeQuantity(3)).toBe(3);
    expect(normalizeQuantity('4')).toBe(4);
  });

  it('rejects zero, negatives, fractions below one and junk', () => {
    expect(normalizeQuantity(0)).toBe(0);
    expect(normalizeQuantity(-2)).toBe(0);
    expect(normalizeQuantity(0.4)).toBe(0);
    expect(normalizeQuantity('abc')).toBe(0);
    expect(normalizeQuantity(null)).toBe(0);
  });

  it('floors fractional quantities and caps runaway values', () => {
    expect(normalizeQuantity(2.9)).toBe(2);
    expect(normalizeQuantity(10_000)).toBe(999);
  });
});

describe('cart re-pricing arithmetic', () => {
  it('sums line totals from the server-side unit price', () => {
    const items = [
      line({ unitPriceCents: 79999, quantity: 1, sku: 'LAPTOP-001' }),
      line({ unitPriceCents: 2499, quantity: 3, sku: 'CASE-001' }),
    ];

    expect(computeSubtotalCents(items)).toBe(79999 + 2499 * 3);
    expect(computeCartTotals({ items }).subtotalCents).toBe(87496);
  });

  it('gives free standard shipping above $50 and charges it below', () => {
    expect(computeShippingCents(5000, 'standard')).toBe(0);
    expect(computeShippingCents(4999, 'standard')).toBe(0);
    expect(computeShippingCents(4999, 'expedited')).toBe(999);
    expect(computeShippingCents(100_000, 'expedited')).toBe(999);
    expect(computeShippingCents(1000, 'overnight')).toBe(2499);
  });

  it('charges no shipping when nothing in the cart ships', () => {
    expect(computeShippingCents(1000, 'overnight', false)).toBe(0);
  });

  it('falls back to the default shipping option for an unknown method', () => {
    expect(resolveShippingOption('teleport').id).toBe(DEFAULT_SHIPPING_METHOD);
    expect(resolveShippingOption(null).id).toBe(SHIPPING_OPTIONS[0].id);
  });

  it('returns zero tax today (the extension point is deliberately inert)', () => {
    expect(computeTaxCents(100_000, { state: 'CA', postalCode: '90210' })).toBe(0);
  });

  it('applies subtotal, then discount, then shipping, then tax', () => {
    const items = [line({ unitPriceCents: 2000, quantity: 2 })]; // $40.00 subtotal
    const coupon: AppliedCoupon = {
      couponId: 'coupon-1',
      code: 'SAVE10',
      description: '10% off',
      discountType: 'percentage',
      discountValue: 10,
      discountCents: 400,
    };

    const totals = computeCartTotals({ items, coupon, shippingMethod: 'expedited' });

    expect(totals.subtotalCents).toBe(4000);
    expect(totals.discountCents).toBe(400);
    // Shipping is assessed on the pre-discount subtotal, so a discount cannot buy free shipping.
    expect(totals.shippingCents).toBe(999);
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(4000 - 400 + 999);
  });

  it('never lets a discount push the total below zero', () => {
    const items = [line({ unitPriceCents: 1000, quantity: 1 })];
    const coupon: AppliedCoupon = {
      couponId: 'coupon-2',
      code: 'HUGE',
      description: '$500 off',
      discountType: 'fixed_amount',
      discountValue: 500,
      discountCents: 50_000,
    };

    const totals = computeCartTotals({ items, coupon });

    expect(totals.discountCents).toBe(1000);
    expect(totals.totalCents).toBe(0);
  });
});

describe('Stripe line item construction', () => {
  const items = [
    line({ unitPriceCents: 79999, quantity: 1, sku: 'LAPTOP-001', name: 'Ultra-Light Laptop' }),
    line({ unitPriceCents: 2499, quantity: 2, sku: 'CASE-001', name: 'Premium Phone Case' }),
  ];

  it('sends server prices, never client prices', () => {
    const totals = computeCartTotals({ items, shippingMethod: 'standard' });
    const lineItems = buildStripeLineItems(items, totals);

    expect(lineItems[0].price_data.unit_amount).toBe(79999);
    expect(lineItems[0].quantity).toBe(1);
    expect(lineItems[0].price_data.product_data.metadata.sku).toBe('LAPTOP-001');
    expect(lineItems[1].price_data.unit_amount).toBe(2499);
    expect(lineItems[1].quantity).toBe(2);
  });

  it('adds shipping as its own line when it is charged', () => {
    const totals = computeCartTotals({ items, shippingMethod: 'overnight' });
    const lineItems = buildStripeLineItems(items, totals);

    const shipping = lineItems.find(
      (item) => item.price_data.product_data.metadata.line_type === 'shipping'
    );

    expect(shipping?.price_data.unit_amount).toBe(2499);
    expect(sumStripeLineItems(lineItems)).toBe(totals.totalCents);
  });

  it('omits the shipping line when shipping is free', () => {
    const totals = computeCartTotals({ items, shippingMethod: 'standard' });
    const lineItems = buildStripeLineItems(items, totals);

    expect(
      lineItems.some((item) => item.price_data.product_data.metadata.line_type === 'shipping')
    ).toBe(false);
  });

  it('reconciles the Stripe total with the server total when a coupon applies', () => {
    const coupon: AppliedCoupon = {
      couponId: 'coupon-3',
      code: 'TEN',
      description: '$10 off',
      discountType: 'fixed_amount',
      discountValue: 10,
      discountCents: 1000,
    };

    const totals = computeCartTotals({ items, coupon, shippingMethod: 'expedited' });
    const lineItems = buildStripeLineItems(items, totals);

    expect(sumStripeLineItems(lineItems) - totals.discountCents).toBe(totals.totalCents);
    expect(() => assertStripeAmountMatches(lineItems, totals)).not.toThrow();
  });

  it('refuses to create a session when the amounts disagree', () => {
    const totals = computeCartTotals({ items });
    const lineItems = buildStripeLineItems(items, totals);
    const tampered = { ...totals, totalCents: totals.totalCents - 1 };

    expect(() => assertStripeAmountMatches(lineItems, tampered)).toThrow(/amount mismatch/i);
  });

  it('only forwards absolute image URLs to Stripe', () => {
    const withRelative = [line({ imageUrl: '/images/local.png' })];
    const withAbsolute = [line({ imageUrl: 'https://cdn.example.com/a.png' })];

    const relativeTotals = computeCartTotals({ items: withRelative });
    const absoluteTotals = computeCartTotals({ items: withAbsolute });

    expect(
      buildStripeLineItems(withRelative, relativeTotals)[0].price_data.product_data.images
    ).toBeUndefined();
    expect(
      buildStripeLineItems(withAbsolute, absoluteTotals)[0].price_data.product_data.images
    ).toEqual(['https://cdn.example.com/a.png']);
  });
});
