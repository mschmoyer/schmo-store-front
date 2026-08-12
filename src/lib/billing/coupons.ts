/**
 * Storefront coupon validation for checkout (flow B).
 *
 * The rules implemented here are the same rules the storefront's coupon endpoint
 * (`POST /api/store/[storeId]/coupons/validate`) presents to shoppers: active flag, validity
 * window, usage limits, minimum order amount, product/category targeting, percentage vs fixed
 * discounts, and a maximum discount cap.
 *
 * Two deliberate differences from that route:
 *
 *  1. **Schema.** That route still joins a `discounts` table that migration 013 removed - the join
 *    means it cannot succeed against the current database. The rules were therefore re-implemented
 *    against the live `coupons` schema (`discount_type`, `discount_value`, `valid_from`,
 *    `valid_until`, `usage_limit`, `used_count`, `applies_to`, ...). Fixing that route is out of
 *    this agent's file ownership; see the gaps section of `docs/payments.md`.
 *  2. **Trust.** That route accepts client-supplied cart prices. Checkout re-prices from the
 *    database first and applies the coupon to those server-side amounts only.
 */

import { db } from '@/lib/database/connection';
import { clampCents } from './money';
import type { AppliedCoupon, CouponValidation, PricedLineItem } from './types';

/** The coupon fields checkout needs, normalized out of the `coupons` row. */
export interface CouponRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly discountType: 'percentage' | 'fixed_amount';
  /** Percent (0-100) or a major-unit amount, matching `discount_type`. */
  readonly discountValue: number;
  readonly minimumOrderAmountCents: number | null;
  readonly maximumDiscountAmountCents: number | null;
  readonly appliesTo: 'entire_order' | 'specific_products' | 'specific_categories';
  readonly applicableProductIds: string[];
  readonly applicableCategoryIds: string[];
  readonly excludedProductIds: string[];
  readonly excludedCategoryIds: string[];
  readonly validFrom: Date | null;
  readonly validUntil: Date | null;
  readonly usageLimit: number | null;
  readonly usedCount: number;
  readonly isActive: boolean;
}

/**
 * Determine the portion of the cart a coupon applies to.
 *
 * @param items - Server-priced line items.
 * @param coupon - The coupon being applied.
 * @returns Eligible amount in cents.
 */
export function computeEligibleCents(
  items: readonly PricedLineItem[],
  coupon: CouponRecord
): number {
  const isExcluded = (item: PricedLineItem): boolean =>
    coupon.excludedProductIds.includes(item.productId) ||
    (item.categoryId !== null && coupon.excludedCategoryIds.includes(item.categoryId));

  const eligible = items.filter((item) => {
    if (isExcluded(item)) {
      return false;
    }
    if (coupon.appliesTo === 'specific_products') {
      return coupon.applicableProductIds.includes(item.productId);
    }
    if (coupon.appliesTo === 'specific_categories') {
      return item.categoryId !== null && coupon.applicableCategoryIds.includes(item.categoryId);
    }
    return true;
  });

  return eligible.reduce((sum, item) => sum + item.lineTotalCents, 0);
}

/**
 * Compute the discount a coupon produces, in cents.
 *
 * Percentage discounts round half-up to the nearest cent and are capped by
 * `maximum_discount_amount`. Fixed discounts can never exceed the eligible amount.
 *
 * @param eligibleCents - Amount the coupon applies to.
 * @param coupon - The coupon.
 * @returns Discount in cents, never negative and never above `eligibleCents`.
 */
export function computeCouponDiscountCents(
  eligibleCents: number,
  coupon: CouponRecord
): number {
  if (eligibleCents <= 0) {
    return 0;
  }

  let discount: number;

  if (coupon.discountType === 'percentage') {
    discount = Math.round((eligibleCents * coupon.discountValue) / 100);
    if (coupon.maximumDiscountAmountCents !== null) {
      discount = Math.min(discount, coupon.maximumDiscountAmountCents);
    }
  } else {
    discount = Math.round(coupon.discountValue * 100);
  }

  return clampCents(discount, 0, eligibleCents);
}

/**
 * Apply all coupon rules to a priced cart.
 *
 * @param coupon - The coupon record loaded from the database.
 * @param items - Server-priced line items.
 * @param subtotalCents - Cart subtotal in cents.
 * @param now - Current time; injectable for tests.
 * @returns A {@link CouponValidation}.
 */
export function validateCoupon(
  coupon: CouponRecord,
  items: readonly PricedLineItem[],
  subtotalCents: number,
  now: Date = new Date()
): CouponValidation {
  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }

  if (coupon.validFrom && coupon.validFrom.getTime() > now.getTime()) {
    return { valid: false, error: 'This coupon is not yet active' };
  }

  if (coupon.validUntil && coupon.validUntil.getTime() < now.getTime()) {
    return { valid: false, error: 'This coupon has expired' };
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }

  if (
    coupon.minimumOrderAmountCents !== null &&
    subtotalCents < coupon.minimumOrderAmountCents
  ) {
    const minimum = (coupon.minimumOrderAmountCents / 100).toFixed(2);
    return { valid: false, error: `Minimum order amount is $${minimum}` };
  }

  if (coupon.appliesTo === 'specific_products' && coupon.applicableProductIds.length === 0) {
    return { valid: false, error: 'This coupon is not configured for any products' };
  }

  if (coupon.appliesTo === 'specific_categories' && coupon.applicableCategoryIds.length === 0) {
    return { valid: false, error: 'This coupon is not configured for any categories' };
  }

  const eligibleCents = computeEligibleCents(items, coupon);
  if (eligibleCents <= 0) {
    return { valid: false, error: 'This coupon does not apply to any items in your cart' };
  }

  const discountCents = computeCouponDiscountCents(eligibleCents, coupon);
  if (discountCents <= 0) {
    return { valid: false, error: 'This coupon produces no discount on your cart' };
  }

  const applied: AppliedCoupon = {
    couponId: coupon.id,
    code: coupon.code,
    description: coupon.description ?? coupon.name,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountCents,
  };

  return { valid: true, coupon: applied };
}

/** Raw shape of a `coupons` row as returned by `pg`. */
interface CouponRow extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: string | number;
  minimum_order_amount: string | number | null;
  maximum_discount_amount: string | number | null;
  applies_to: string | null;
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  excluded_product_ids: string[] | null;
  excluded_category_ids: string[] | null;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  usage_limit: number | null;
  used_count: number | null;
  is_active: boolean | null;
}

/**
 * Normalize a raw `coupons` row into a {@link CouponRecord}.
 *
 * @param row - The database row.
 * @returns The normalized record.
 */
export function toCouponRecord(row: CouponRow): CouponRecord {
  const toDate = (value: Date | string | null): Date | null => {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  };

  const toMoneyCents = (value: string | number | null): number | null => {
    if (value === null || value === undefined) return null;
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
  };

  const discountType = row.discount_type === 'percentage' ? 'percentage' : 'fixed_amount';
  const appliesTo =
    row.applies_to === 'specific_products' || row.applies_to === 'specific_categories'
      ? row.applies_to
      : 'entire_order';

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType,
    discountValue:
      typeof row.discount_value === 'number'
        ? row.discount_value
        : Number.parseFloat(row.discount_value ?? '0') || 0,
    minimumOrderAmountCents: toMoneyCents(row.minimum_order_amount),
    maximumDiscountAmountCents: toMoneyCents(row.maximum_discount_amount),
    appliesTo,
    applicableProductIds: row.applicable_product_ids ?? [],
    applicableCategoryIds: row.applicable_category_ids ?? [],
    excludedProductIds: row.excluded_product_ids ?? [],
    excludedCategoryIds: row.excluded_category_ids ?? [],
    validFrom: toDate(row.valid_from),
    validUntil: toDate(row.valid_until),
    usageLimit: row.usage_limit,
    usedCount: row.used_count ?? 0,
    isActive: row.is_active !== false,
  };
}

/**
 * Load a coupon by code for a store.
 *
 * @param storeId - The store the coupon belongs to.
 * @param code - The coupon code, matched case-insensitively.
 * @returns The coupon, or `null` when no such code exists for the store.
 */
export async function loadCoupon(storeId: string, code: string): Promise<CouponRecord | null> {
  const result = await db.query<CouponRow>(
    `SELECT id, code, name, description, discount_type, discount_value,
            minimum_order_amount, maximum_discount_amount, applies_to,
            applicable_product_ids, applicable_category_ids,
            excluded_product_ids, excluded_category_ids,
            valid_from, valid_until, usage_limit, used_count, is_active
       FROM coupons
      WHERE store_id = $1 AND UPPER(code) = UPPER($2)
      LIMIT 1`,
    [storeId, code]
  );

  const row = result.rows[0];
  return row ? toCouponRecord(row) : null;
}

/**
 * Load and validate a coupon against a server-priced cart.
 *
 * @param storeId - The store the cart belongs to.
 * @param code - The coupon code supplied by the shopper.
 * @param items - Server-priced line items.
 * @param subtotalCents - Cart subtotal in cents.
 * @returns A {@link CouponValidation}.
 */
export async function validateCouponForCart(
  storeId: string,
  code: string,
  items: readonly PricedLineItem[],
  subtotalCents: number
): Promise<CouponValidation> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter a coupon code' };
  }

  const coupon = await loadCoupon(storeId, trimmed);
  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  return validateCoupon(coupon, items, subtotalCents);
}
