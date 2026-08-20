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
 * Queue one result on the mocked `db.query`.
 *
 * @param rows - Rows the query should return.
 */
function mockRows(rows: Array<Record<string, unknown>>): void {
  query.mockResolvedValueOnce({
    rows,
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  } as never);
}

/**
 * Queue the product lookup result for the next `repriceCart` call.
 *
 * `repriceCart` follows the product query with a variant query, so this queues
 * an empty variant result behind the products. Tests that exercise variants
 * queue their own rows with {@link mockVariants} instead.
 *
 * @param rows - Rows the products query should return.
 */
function mockProducts(rows: Array<Record<string, unknown>>): void {
  mockRows(rows);
  mockRows([]);
}

/**
 * Queue a product lookup followed by a variant lookup.
 *
 * @param products - Rows the products query should return.
 * @param variants - Rows the variant query should return, each carrying `product_id`.
 */
function mockProductsWithVariants(
  products: Array<Record<string, unknown>>,
  variants: Array<Record<string, unknown>>,
): void {
  mockRows(products);
  mockRows(variants);
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

describe('variant-aware re-pricing', () => {
  const VARIANT_ID = '950e8400-e29b-41d4-a716-446655440001';
  const OTHER_VARIANT_ID = '950e8400-e29b-41d4-a716-446655440002';

  /**
   * Build a variant row as `getVariantsForProducts` selects it.
   * @param overrides - Fields to override
   * @returns A raw variant row
   */
  function variantRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: VARIANT_ID,
      product_id: LAPTOP_ID,
      sku: 'LAP-GRN-M',
      option1: 'Alpine Green',
      option2: 'Medium',
      option3: null,
      price: null,
      sale_price: null,
      stock_quantity: 5,
      track_inventory: null,
      allow_backorder: null,
      image_url: null,
      position: 1,
      is_active: true,
      ...overrides,
    };
  }

  it('charges the variant price when the variant overrides it', async () => {
    mockProductsWithVariants(
      [productRow({ base_price: '100.00' })],
      [variantRow({ price: '140.00' })],
    );

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID }],
    });

    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].unitPriceCents).toBe(14000);
    expect(priced.items[0].variantId).toBe(VARIANT_ID);
    expect(priced.items[0].variantTitle).toBe('Alpine Green / Medium');
    // The warehouse picks by the variant's SKU.
    expect(priced.items[0].sku).toBe('LAP-GRN-M');
  });

  it('inherits the product price when the variant sets none', async () => {
    mockProductsWithVariants([productRow({ base_price: '100.00' })], [variantRow()]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID }],
    });

    expect(priced.items[0].unitPriceCents).toBe(10000);
  });

  it('rejects a variant id that belongs to a different product', async () => {
    // Pairing a cheap variant id with an expensive product must not price the
    // line at the variant. The variant row here belongs to CASE_ID.
    mockProductsWithVariants(
      [productRow({ base_price: '100.00' })],
      [variantRow({ product_id: CASE_ID, price: '1.00' })],
    );

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0].reason).toBe('not_found');
  });

  it('rejects a variant id this store does not have at all', async () => {
    // A variant from another merchant is simply absent from the store-scoped
    // query, so it can never price a line here.
    mockProductsWithVariants([productRow()], []);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0].reason).toBe('not_found');
  });

  it('refuses to guess when a product has options and none was chosen', async () => {
    // Picking a variant on the shopper's behalf charges for something they did
    // not select.
    mockProductsWithVariants([productRow()], [variantRow()]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0].message).toContain('Choose an option');
  });

  it('rejects an inactive variant', async () => {
    mockProductsWithVariants([productRow()], [variantRow({ is_active: false })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0].reason).toBe('inactive');
  });

  it('checks stock against the variant rather than the product', async () => {
    // The product has plenty; this size has two.
    mockProductsWithVariants(
      [productRow({ stock_quantity: 99 })],
      [variantRow({ stock_quantity: 2 })],
    );

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 3, variant_id: VARIANT_ID }],
    });

    expect(priced.items).toHaveLength(0);
    expect(priced.rejected[0].reason).toBe('insufficient_stock');
    expect(priced.rejected[0].available).toBe(2);
  });

  it('keeps two sizes of one product as two lines', async () => {
    // Collapsing them onto the product would check one size's stock against
    // the other's quantity.
    mockProductsWithVariants(
      [productRow({ base_price: '100.00', stock_quantity: 99 })],
      [
        variantRow({ stock_quantity: 5 }),
        variantRow({ id: OTHER_VARIANT_ID, sku: 'LAP-GRN-L', option2: 'Large', stock_quantity: 5 }),
      ],
    );

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [
        { product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID },
        { product_id: LAPTOP_ID, quantity: 2, variant_id: OTHER_VARIANT_ID },
      ],
    });

    expect(priced.items).toHaveLength(2);
    expect(priced.items.map((item) => item.variantTitle).sort()).toEqual([
      'Alpine Green / Large',
      'Alpine Green / Medium',
    ]);
    expect(priced.totals.subtotalCents).toBe(30000);
  });

  it('still collapses duplicate lines for the same variant', async () => {
    mockProductsWithVariants(
      [productRow({ base_price: '100.00', stock_quantity: 99 })],
      [variantRow({ stock_quantity: 5 })],
    );

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [
        { product_id: LAPTOP_ID, quantity: 1, variant_id: VARIANT_ID },
        { product_id: LAPTOP_ID, quantity: 2, variant_id: VARIANT_ID },
      ],
    });

    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].quantity).toBe(3);
  });

  it('leaves a product with no variants completely unchanged', async () => {
    mockProducts([productRow({ base_price: '100.00' })]);

    const priced = await repriceCart({
      storeId: STORE_ID,
      items: [{ product_id: LAPTOP_ID, quantity: 1 }],
    });

    expect(priced.items).toHaveLength(1);
    expect(priced.items[0].variantId).toBeNull();
    expect(priced.items[0].variantTitle).toBeNull();
    expect(priced.items[0].unitPriceCents).toBe(10000);
  });
});
