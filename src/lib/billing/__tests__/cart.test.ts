// The re-pricing logic under test is real; only the Postgres driver is stubbed, and the rows it
// returns are shaped exactly like the seeded `products` table. (`jest.mock` specifiers must be
// relative; `next/jest` does not map the `@/` alias for them.)
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { db } from '@/lib/database/connection';
import { asQueryMock } from '../test-support/query-mock';
import { repriceCart, resolveUnitPriceCents } from '../cart';

const query = asQueryMock(db.query);

const STORE_ID = '650e8400-e29b-41d4-a716-446655440001';
const LAPTOP_ID = '850e8400-e29b-41d4-a716-446655440002';
const CASE_ID = '850e8400-e29b-41d4-a716-446655440003';

/** A `products` row as the re-pricing query returns it. */
function productRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LAPTOP_ID,
    sku: 'LAPTOP-001',
    name: 'Ultra-Light Laptop',
    override_name: null,
    base_price: '1299.99',
    sale_price: null,
    override_price: null,
    featured_image_url: null,
    category_id: null,
    requires_shipping: true,
    is_active: true,
    track_inventory: true,
    allow_backorder: false,
    stock_quantity: 14,
    shipstation_product_id: null,
    inventory_available: null,
    ...overrides,
  };
}

/**
 * Queue the product lookup result for the next `repriceCart` call.
 *
 * @param rows - Rows the products query should return.
 */
function mockProducts(rows: Array<Record<string, unknown>>): void {
  query.mockResolvedValueOnce({
    rows,
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  } as never);
}

describe('unit price resolution', () => {
  it('prefers override price, then sale price, then base price', () => {
    expect(
      resolveUnitPriceCents({ override_price: '9.99', sale_price: '19.99', base_price: '29.99' })
    ).toBe(999);
    expect(
      resolveUnitPriceCents({ override_price: null, sale_price: '19.99', base_price: '29.99' })
    ).toBe(1999);
    expect(
      resolveUnitPriceCents({ override_price: null, sale_price: null, base_price: '29.99' })
    ).toBe(2999);
  });
});

describe('server-side cart re-pricing', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('ignores any price the client sends and uses the database price', async () => {
    mockProducts([productRow()]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      // A hostile client claiming the laptop costs a dollar.
      items: [{ product_id: LAPTOP_ID, quantity: 1, price: 1 } as never],
      shippingMethod: 'standard',
    });

    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].unitPriceCents).toBe(129999);
    expect(priced.totals.subtotalCents).toBe(129999);
    expect(priced.totals.totalCents).toBe(129999);
  });

  it('uses the sale price when the product is on sale', async () => {
    mockProducts([productRow({ sale_price: '999.99' })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 2 }],
    });

    expect(priced.items[0].unitPriceCents).toBe(99999);
    expect(priced.items[0].lineTotalCents).toBe(199998);
  });

  it('matches a cart entry by SKU as well as by id', async () => {
    mockProducts([productRow()]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: 'LAPTOP-001', quantity: 1 }],
    });

    expect(priced.items[0].productId).toBe(LAPTOP_ID);
  });

  it('collapses duplicate lines for the same product before checking stock', async () => {
    mockProducts([productRow({ stock_quantity: 3 })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [
        { product_id: LAPTOP_ID, quantity: 2 },
        { product_id: 'LAPTOP-001', quantity: 1 },
      ],
    });

    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].quantity).toBe(3);
  });

  it('rejects a line that exceeds available stock', async () => {
    mockProducts([productRow({ stock_quantity: 2 })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 5 }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected).toEqual([
      {
        requestedId: LAPTOP_ID,
        reason: 'insufficient_stock',
        message: 'Only 2 of Ultra-Light Laptop left in stock.',
        available: 2,
      },
    ]);
  });

  it('prefers the synced inventory ledger over products.stock_quantity', async () => {
    mockProducts([productRow({ stock_quantity: 99, inventory_available: '1' })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 2 }],
    });

    expect(priced.rejected[0]).toMatchObject({ reason: 'insufficient_stock', available: 1 });
  });

  it('allows over-selling when the product allows backorders', async () => {
    mockProducts([productRow({ stock_quantity: 0, allow_backorder: true })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 4 }],
    });

    expect(priced.rejected).toHaveLength(0);
    expect(priced.items[0].quantity).toBe(4);
  });

  it('rejects an unknown product, an inactive product and a bad quantity', async () => {
    mockProducts([productRow({ id: CASE_ID, sku: 'CASE-001', name: 'Case', is_active: false })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [
        { product_id: 'does-not-exist', quantity: 1 },
        { product_id: CASE_ID, quantity: 1 },
        { product_id: 'CASE-001', quantity: 0 },
      ],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected.map((rejection) => rejection.reason).sort()).toEqual([
      'inactive',
      'invalid_quantity',
      'not_found',
    ]);
  });

  it('prices a free product at zero rather than rejecting it', async () => {
    mockProducts([productRow({ base_price: '0.00', name: 'Free Sticker', stock_quantity: 5 })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 2 }],
      shippingMethod: 'standard',
    });

    expect(priced.rejected).toHaveLength(0);
    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].unitPriceCents).toBe(0);
    expect(priced.items[0].lineTotalCents).toBe(0);
    // Standard shipping is free, so the whole order costs nothing and needs no payment.
    expect(priced.totals.totalCents).toBe(0);
  });

  it('still rejects a product with a negative price', async () => {
    mockProducts([productRow({ base_price: '-5.00' })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0]).toMatchObject({
      reason: 'inactive',
      message: 'Ultra-Light Laptop is not priced for sale.',
    });
  });

  it('charges shipping on a small order and not on a large one', async () => {
    mockProducts([productRow({ base_price: '10.00', stock_quantity: 50 })]);
    const small = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
      shippingMethod: 'overnight',
    });
    expect(small.totals.shippingCents).toBe(2499);
    expect(small.totals.totalCents).toBe(1000 + 2499);

    mockProducts([productRow({ base_price: '10.00', stock_quantity: 50 })]);
    const large = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 6 }],
      shippingMethod: 'standard',
    });
    expect(large.totals.subtotalCents).toBe(6000);
    expect(large.totals.shippingCents).toBe(0);
  });

  it('applies a coupon that the database says is valid', async () => {
    mockProducts([productRow({ base_price: '100.00', stock_quantity: 10 })]);
    // The coupon lookup issued by validateCouponForCart.
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'coupon-1',
          code: 'SAVE10',
          name: 'Ten percent',
          description: '10% off',
          discount_type: 'percentage',
          discount_value: '10.00',
          minimum_order_amount: null,
          maximum_discount_amount: null,
          applies_to: 'entire_order',
          applicable_product_ids: null,
          applicable_category_ids: null,
          excluded_product_ids: null,
          excluded_category_ids: null,
          valid_from: null,
          valid_until: null,
          usage_limit: null,
          used_count: 0,
          is_active: true,
        },
      ],
    } as never);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
      couponCode: 'save10',
      shippingMethod: 'standard',
    });

    expect(priced.coupon?.code).toBe('SAVE10');
    expect(priced.coupon?.discountCents).toBe(1000);
    expect(priced.totals.discountCents).toBe(1000);
    expect(priced.totals.totalCents).toBe(9000);
  });

  it('quietly drops an invalid coupon rather than failing the cart', async () => {
    mockProducts([productRow({ base_price: '100.00', stock_quantity: 10 })]);
    query.mockResolvedValueOnce({ rows: [] } as never);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
      couponCode: 'NOPE',
    });

    expect(priced.coupon).toBeNull();
    expect(priced.totals.discountCents).toBe(0);
    expect(priced.totals.totalCents).toBe(10000);
  });

  it('does not query the database for an empty cart', async () => {
    const priced = await repriceCart({ storeId: STORE_ID, items: [] });

    expect(query).not.toHaveBeenCalled();
    expect(priced.items).toHaveLength(0);
    expect(priced.totals.totalCents).toBe(0);
  });
});
