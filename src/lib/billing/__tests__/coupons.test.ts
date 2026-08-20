// `coupons.ts` also exposes database-backed loaders, which pull in `pg`. The Node driver needs Web
// Crypto globals that jsdom does not provide, so the connection module is stubbed. The pure coupon
// logic under test is untouched. (The path must be relative: `next/jest` does not map the `@/`
// alias for `jest.mock` specifiers, only for imports.)
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import {
  computeCouponDiscountCents,
  computeEligibleCents,
  toCouponRecord,
  validateCoupon,
  type CouponRecord,
} from '../coupons';
import { computeCartTotals } from '../cart-pricing';
import type { PricedLineItem } from '../types';

const CATEGORY_A = 'c0000000-0000-4000-8000-00000000000a';
const CATEGORY_B = 'c0000000-0000-4000-8000-00000000000b';
const PRODUCT_1 = '850e8400-e29b-41d4-a716-446655440001';
const PRODUCT_2 = '850e8400-e29b-41d4-a716-446655440002';

/**
 * Build a server-priced line item.
 *
 * @param overrides - Fields to override.
 * @returns A {@link PricedLineItem}.
 */
function line(overrides: Partial<PricedLineItem> = {}): PricedLineItem {
  const unitPriceCents = overrides.unitPriceCents ?? 1000;
  const quantity = overrides.quantity ?? 1;

  return {
    productId: overrides.productId ?? PRODUCT_1,
    variantId: overrides.variantId ?? null,
    variantTitle: overrides.variantTitle ?? null,
    sku: overrides.sku ?? 'SKU-1',
    name: overrides.name ?? 'Item',
    unitPriceCents,
    quantity,
    lineTotalCents: unitPriceCents * quantity,
    imageUrl: null,
    categoryId: overrides.categoryId ?? null,
    requiresShipping: true,
  };
}

/**
 * Build a coupon record.
 *
 * @param overrides - Fields to override.
 * @returns A {@link CouponRecord}.
 */
function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'coupon-1',
    code: 'SAVE',
    name: 'Save',
    description: 'A discount',
    discountType: 'percentage',
    discountValue: 10,
    minimumOrderAmountCents: null,
    maximumDiscountAmountCents: null,
    appliesTo: 'entire_order',
    applicableProductIds: [],
    applicableCategoryIds: [],
    excludedProductIds: [],
    excludedCategoryIds: [],
    validFrom: null,
    validUntil: null,
    usageLimit: null,
    usedCount: 0,
    isActive: true,
    ...overrides,
  };
}

describe('coupon discount arithmetic', () => {
  const cart = [
    line({ productId: PRODUCT_1, unitPriceCents: 7999, quantity: 1, categoryId: CATEGORY_A }),
    line({ productId: PRODUCT_2, unitPriceCents: 2499, quantity: 2, categoryId: CATEGORY_B }),
  ];
  const subtotal = 7999 + 2499 * 2; // 12997

  it('applies a percentage against the whole order', () => {
    const applied = validateCoupon(coupon({ discountValue: 10 }), cart, subtotal);

    expect(applied.valid).toBe(true);
    if (!applied.valid) return;
    // 10% of $129.97 = $12.997 -> rounds to $13.00
    expect(applied.coupon.discountCents).toBe(1300);
  });

  it('caps a percentage discount at maximum_discount_amount', () => {
    const applied = validateCoupon(
      coupon({ discountValue: 50, maximumDiscountAmountCents: 2000 }),
      cart,
      subtotal
    );

    expect(applied.valid).toBe(true);
    if (!applied.valid) return;
    expect(applied.coupon.discountCents).toBe(2000);
  });

  it('applies a fixed amount in whole cents', () => {
    const applied = validateCoupon(
      coupon({ discountType: 'fixed_amount', discountValue: 15 }),
      cart,
      subtotal
    );

    expect(applied.valid).toBe(true);
    if (!applied.valid) return;
    expect(applied.coupon.discountCents).toBe(1500);
  });

  it('never discounts more than the eligible amount', () => {
    const small = [line({ unitPriceCents: 500, quantity: 1 })];
    const discount = computeCouponDiscountCents(
      500,
      coupon({ discountType: 'fixed_amount', discountValue: 100 })
    );

    expect(discount).toBe(500);
    expect(computeCartTotals({ items: small }).subtotalCents).toBe(500);
  });

  it('targets only the listed products', () => {
    const targeted = coupon({
      appliesTo: 'specific_products',
      applicableProductIds: [PRODUCT_2],
      discountType: 'fixed_amount',
      discountValue: 10,
    });

    expect(computeEligibleCents(cart, targeted)).toBe(2499 * 2);

    const applied = validateCoupon(targeted, cart, subtotal);
    expect(applied.valid).toBe(true);
    if (!applied.valid) return;
    expect(applied.coupon.discountCents).toBe(1000);
  });

  it('targets only the listed categories', () => {
    const targeted = coupon({
      appliesTo: 'specific_categories',
      applicableCategoryIds: [CATEGORY_A],
      discountValue: 50,
    });

    expect(computeEligibleCents(cart, targeted)).toBe(7999);

    const applied = validateCoupon(targeted, cart, subtotal);
    expect(applied.valid).toBe(true);
    if (!applied.valid) return;
    expect(applied.coupon.discountCents).toBe(4000); // 50% of 7999 = 3999.5 -> 4000
  });

  it('honours product exclusions', () => {
    const excluded = coupon({ excludedProductIds: [PRODUCT_1], discountValue: 10 });
    expect(computeEligibleCents(cart, excluded)).toBe(2499 * 2);
  });
});

describe('coupon validation rules', () => {
  const cart = [line({ unitPriceCents: 5000, quantity: 1 })];
  const subtotal = 5000;
  const now = new Date('2026-06-15T00:00:00Z');

  it('rejects an inactive coupon', () => {
    const result = validateCoupon(coupon({ isActive: false }), cart, subtotal, now);
    expect(result).toEqual({ valid: false, error: 'This coupon is no longer active' });
  });

  it('rejects a coupon that has not started', () => {
    const result = validateCoupon(
      coupon({ validFrom: new Date('2026-07-01T00:00:00Z') }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({ valid: false, error: 'This coupon is not yet active' });
  });

  it('rejects an expired coupon', () => {
    const result = validateCoupon(
      coupon({ validUntil: new Date('2026-01-01T00:00:00Z') }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({ valid: false, error: 'This coupon has expired' });
  });

  it('rejects a coupon that hit its usage limit', () => {
    const result = validateCoupon(
      coupon({ usageLimit: 5, usedCount: 5 }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({ valid: false, error: 'This coupon has reached its usage limit' });
  });

  it('enforces the minimum order amount against the server subtotal', () => {
    const result = validateCoupon(
      coupon({ minimumOrderAmountCents: 10_000 }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({ valid: false, error: 'Minimum order amount is $100.00' });
  });

  it('rejects a product-targeted coupon that matches nothing in the cart', () => {
    const result = validateCoupon(
      coupon({ appliesTo: 'specific_products', applicableProductIds: [PRODUCT_2] }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({
      valid: false,
      error: 'This coupon does not apply to any items in your cart',
    });
  });

  it('rejects a product-targeted coupon with no configured products', () => {
    const result = validateCoupon(
      coupon({ appliesTo: 'specific_products', applicableProductIds: [] }),
      cart,
      subtotal,
      now
    );
    expect(result).toEqual({
      valid: false,
      error: 'This coupon is not configured for any products',
    });
  });

  it('accepts a valid coupon inside its window', () => {
    const result = validateCoupon(
      coupon({
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2026-12-31T00:00:00Z'),
        usageLimit: 10,
        usedCount: 3,
      }),
      cart,
      subtotal,
      now
    );

    expect(result.valid).toBe(true);
  });
});

describe('coupon row normalization', () => {
  it('converts the live coupons schema into the record checkout uses', () => {
    const record = toCouponRecord({
      id: 'row-1',
      code: 'welcome10',
      name: 'Welcome',
      description: '10% off your first order',
      discount_type: 'percentage',
      discount_value: '10.00',
      minimum_order_amount: '25.00',
      maximum_discount_amount: null,
      applies_to: 'entire_order',
      applicable_product_ids: null,
      applicable_category_ids: null,
      excluded_product_ids: null,
      excluded_category_ids: null,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: null,
      usage_limit: 100,
      used_count: 2,
      is_active: true,
    });

    expect(record.discountValue).toBe(10);
    expect(record.minimumOrderAmountCents).toBe(2500);
    expect(record.maximumDiscountAmountCents).toBeNull();
    expect(record.appliesTo).toBe('entire_order');
    expect(record.validFrom).toBeInstanceOf(Date);
    expect(record.applicableProductIds).toEqual([]);
  });

  it('defaults an unknown applies_to to the whole order', () => {
    const record = toCouponRecord({
      id: 'row-2',
      code: 'X',
      name: 'X',
      description: null,
      discount_type: 'fixed_amount',
      discount_value: 5,
      minimum_order_amount: null,
      maximum_discount_amount: null,
      applies_to: null,
      applicable_product_ids: null,
      applicable_category_ids: null,
      excluded_product_ids: null,
      excluded_category_ids: null,
      valid_from: null,
      valid_until: null,
      usage_limit: null,
      used_count: null,
      is_active: null,
    });

    expect(record.appliesTo).toBe('entire_order');
    expect(record.discountType).toBe('fixed_amount');
    expect(record.usedCount).toBe(0);
    expect(record.isActive).toBe(true);
  });
});
