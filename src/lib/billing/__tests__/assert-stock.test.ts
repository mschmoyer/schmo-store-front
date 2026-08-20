/**
 * `assertStockAvailable` — the FOR UPDATE re-check the webhook runs immediately
 * before writing an order, so two shoppers racing for the last unit cannot both
 * succeed.
 *
 * The variant path is the one that mattered: it used to lock and read
 * `products` for every line, so a variant line was re-checked against the
 * product's stock — usually 0 for an optioned product — and the count it
 * inspected never moved on sale, so both racers passed. These tests pin that it
 * now locks and reads the variant row.
 */

// The connection module instantiates a pg Pool at import; stub it so the unit
// under test loads without a database. (jest.mock specifiers must be relative.)
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import type { PoolClient } from 'pg';

import { assertStockAvailable } from '../cart';
import type { PricedLineItem } from '../types';

const STORE = '650e8400-e29b-41d4-a716-446655440001';
const PRODUCT = '850e8400-e29b-41d4-a716-446655440002';
const VARIANT = '950e8400-e29b-41d4-a716-446655440009';

/** Build a priced line item. */
function line(overrides: Partial<PricedLineItem> = {}): PricedLineItem {
  return {
    productId: PRODUCT,
    variantId: null,
    variantTitle: null,
    sku: 'TEE-001',
    name: 'Test Tee',
    unitPriceCents: 2000,
    quantity: 1,
    lineTotalCents: 2000,
    imageUrl: null,
    categoryId: null,
    requiresShipping: true,
    ...overrides,
  };
}

/**
 * A fake transaction client returning queued rows.
 * @param rows - One result per query call, in order.
 * @returns A client plus the recorded SQL.
 */
function fakeClient(rows: Array<{ rows: Record<string, unknown>[] }>): {
  client: PoolClient;
  sql: string[];
} {
  const sql: string[] = [];
  let call = 0;
  const client = {
    query: (text: string) => {
      sql.push(text);
      return Promise.resolve(rows[call++] ?? { rows: [] });
    },
  } as unknown as PoolClient;
  return { client, sql };
}

describe('assertStockAvailable — variant lines', () => {
  it('checks the variant row, not the product, and accepts when stocked', async () => {
    const { client, sql } = fakeClient([
      { rows: [{ stock_quantity: 5, track_inventory: true, allow_backorder: false }] },
    ]);

    const rejections = await assertStockAvailable(client, STORE, [
      line({ variantId: VARIANT, variantTitle: 'Black / XL', quantity: 3 }),
    ]);

    expect(rejections).toEqual([]);
    expect(sql[0]).toMatch(/FROM product_variants/);
    expect(sql[0]).toMatch(/FOR UPDATE OF v/);
  });

  it('rejects when the variant does not have enough stock', async () => {
    const { client } = fakeClient([
      { rows: [{ stock_quantity: 1, track_inventory: true, allow_backorder: false }] },
    ]);

    const rejections = await assertStockAvailable(client, STORE, [
      line({ variantId: VARIANT, variantTitle: 'Black / XL', quantity: 2 }),
    ]);

    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toMatchObject({
      requestedId: VARIANT,
      reason: 'insufficient_stock',
      available: 1,
    });
    expect(rejections[0].message).toMatch(/Black \/ XL/);
  });

  it('rejects a variant that has been deleted or deactivated', async () => {
    const { client } = fakeClient([{ rows: [] }]);

    const rejections = await assertStockAvailable(client, STORE, [
      line({ variantId: VARIANT, variantTitle: 'Sand / S', quantity: 1 }),
    ]);

    expect(rejections[0]).toMatchObject({ requestedId: VARIANT, reason: 'not_found' });
  });

  it('lets a backordering variant through without a stock check', async () => {
    const { client } = fakeClient([
      { rows: [{ stock_quantity: 0, track_inventory: true, allow_backorder: true }] },
    ]);

    const rejections = await assertStockAvailable(client, STORE, [
      line({ variantId: VARIANT, quantity: 9 }),
    ]);

    expect(rejections).toEqual([]);
  });

  it('still checks the product for a line with no variant', async () => {
    const { client, sql } = fakeClient([
      {
        rows: [
          {
            name: 'Test Tee',
            stock_quantity: 10,
            track_inventory: true,
            allow_backorder: false,
            inventory_available: null,
          },
        ],
      },
    ]);

    const rejections = await assertStockAvailable(client, STORE, [line({ quantity: 2 })]);

    expect(rejections).toEqual([]);
    expect(sql[0]).toMatch(/FROM products/);
    expect(sql[0]).not.toMatch(/product_variants/);
  });
});
