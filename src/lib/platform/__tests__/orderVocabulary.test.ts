/**
 * @jest-environment node
 */

/**
 * One definition of "an order the platform received", proven across every entry point.
 *
 * This suite exists because of a specific afternoon. The overview said the platform had received
 * 65 orders and had shipped 75% of them; the customers list, one click away, said 72 orders and
 * 68%; a store detail, one click further, said 63% of 27. Every one of those numbers was
 * arithmetically correct and computed from the same three tables. The defect was that three
 * queries had each decided for themselves what "received" meant — `status <> 'cancelled'` here,
 * `COUNT(*)` there — and nothing in the codebase owned the word.
 *
 * It was the third instance of that shape on this branch: two disagreeing definitions of
 * "customized" (`0 of 3` above a table where every row said "Customized"), then two rates that
 * differed by three points, then this. So the fix was a seam rather than three corrections —
 * `RECEIVED_ORDER_PREDICATE` and {@link fulfillmentRatePct} in `customers.ts`, imported by
 * `metrics.ts` — and this file is the guard on the seam. It asserts *identity* between surfaces,
 * not plausibility of each: a future query that counts orders its own way fails here even if its
 * own number is perfectly reasonable.
 *
 * The assertions run against the real local Postgres for the same reason the sibling suites do: a
 * mocked driver would happily agree with two contradictory hand-written fixtures, which is exactly
 * the failure being guarded against.
 */

jest.unmock('@/lib/database/connection');

import { randomUUID } from 'crypto';
import { db } from '@/lib/database/connection';
import {
  fulfillmentRatePct,
  getCustomerDetail,
  listCustomerOrders,
  listCustomers,
  normalizeCustomerListParams,
  normalizeCustomerOrdersParams,
} from '../customers';
import { getPlatformOverview } from '../metrics';

/** Ids of the throwaway tenant, so `afterAll` removes exactly what `beforeAll` created. */
const ownerId = randomUUID();
const storeId = randomUUID();
const storeSlug = `zz-vocab-${randomUUID().slice(0, 8)}`;

/**
 * The fixture's orders: five received, of which two shipped, two settled and two cancelled.
 *
 * The mix is chosen so that every plausible-but-wrong definition of "received" produces a
 * *different* number — 5 with cancellations, 3 without — and so the fulfilment rate differs
 * between them too (2/5 = 40%, 2/3 = 66.67%). A fixture where the definitions happen to agree
 * would pass whatever the code did.
 */
const ORDERS: Array<{
  total: string;
  status: string;
  paymentStatus: string;
  shipped: boolean;
  refunded: string;
}> = [
  { total: '40.00', status: 'completed', paymentStatus: 'completed', shipped: true, refunded: '0' },
  { total: '60.00', status: 'shipped', paymentStatus: 'paid', shipped: true, refunded: '0' },
  { total: '15.00', status: 'pending', paymentStatus: 'pending', shipped: false, refunded: '0' },
  { total: '25.00', status: 'cancelled', paymentStatus: 'refunded', shipped: false, refunded: '25.00' },
  { total: '35.00', status: 'cancelled', paymentStatus: 'refunded', shipped: false, refunded: '35.00' },
];

/** How many of {@link ORDERS} the platform received under the one definition: all of them. */
const RECEIVED = ORDERS.length;

/** How many shipped. */
const SHIPPED = ORDERS.filter((order) => order.shipped).length;

/** How many were cancelled — inside `RECEIVED`, never subtracted from it silently. */
const CANCELLED = ORDERS.filter((order) => order.status === 'cancelled').length;

beforeAll(async () => {
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, is_active)
     VALUES ($1, $2, 'not-a-real-hash', 'Vocab', 'Fixture', TRUE)`,
    [ownerId, `platform-vocab-${ownerId}@example.test`],
  );

  await db.query(
    `INSERT INTO stores (id, owner_id, store_name, store_slug, is_active, is_public, created_at)
     VALUES ($1, $2, $3, $4, TRUE, TRUE, NOW())`,
    [storeId, ownerId, `ZZ Vocab ${storeSlug}`, storeSlug],
  );

  for (const [index, order] of ORDERS.entries()) {
    await db.query(
      `INSERT INTO orders (store_id, order_number, customer_email, customer_first_name,
                           customer_last_name, shipping_first_name, shipping_last_name,
                           shipping_address_line1, shipping_city, shipping_state,
                           shipping_postal_code, subtotal, total_amount, status, payment_status,
                           created_at, shipped_at, refunded_amount)
       VALUES ($1, $2, 'buyer@example.test', 'Buyer', 'One', 'Buyer', 'One',
               '1 Test Way', 'Testville', 'TS', '00000', $3, $3, $4, $5,
               NOW() - INTERVAL '2 days',
               CASE WHEN $6::boolean THEN NOW() - INTERVAL '1 day' ELSE NULL END,
               $7::numeric)`,
      [
        storeId,
        `ZZV-${index}-${randomUUID().slice(0, 8)}`,
        order.total,
        order.status,
        order.paymentStatus,
        order.shipped,
        order.refunded,
      ],
    );
  }
}, 30000);

afterAll(async () => {
  // `stores` cascades to its orders; the owner is a parent row and goes separately.
  await db.query('DELETE FROM stores WHERE id = $1', [storeId]);
  await db.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await db.close();
}, 30000);

/** The three platform-wide figures whose agreement is the point of this file. */
interface Agreement {
  /** `COUNT(*)` straight from `orders`, the arbiter. */
  sqlReceived: number;
  /** Orders dispatched, straight from `orders`. */
  sqlShipped: number;
  /** `orders.receivedAllTime` from `/api/platform/overview`. */
  overviewReceived: number;
  /** `totals.orders` from `/api/platform/customers`. */
  listReceived: number;
  /** The same two rates, from the two surfaces. */
  overviewRatePct: number | null;
  listRatePct: number | null;
}

/**
 * Read the same fact from Postgres, the overview and the customers list, at once.
 *
 * Retried rather than asserted once, because the sibling suites run in parallel workers and insert
 * their own fixtures: a write landing between two of these reads would break the equality without
 * anything being wrong with the code. A genuine disagreement never settles, so the retry cannot
 * hide one — it only absorbs the race.
 *
 * @param attempts - How many times to re-read before giving up and letting the caller assert.
 * @returns The last reading taken; the first one in which every source agreed, when one did.
 */
async function readAgreement(attempts = 5): Promise<Agreement> {
  let latest: Agreement | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [truth, overview, list] = await Promise.all([
      db.query<{ received: string; shipped: string }>(
        `SELECT COUNT(*)::text AS received,
                COUNT(*) FILTER (WHERE shipped_at IS NOT NULL)::text AS shipped
           FROM orders`,
      ),
      getPlatformOverview(30),
      listCustomers(normalizeCustomerListParams({ pageSize: '100' })),
    ]);

    latest = {
      sqlReceived: Number(truth.rows[0].received),
      sqlShipped: Number(truth.rows[0].shipped),
      overviewReceived: overview.orders.receivedAllTime,
      listReceived: list.totals.orders,
      overviewRatePct: overview.orders.fulfillmentRateAllTimePct,
      listRatePct: list.totals.fulfillmentRatePct,
    };

    if (latest.sqlReceived === latest.overviewReceived && latest.overviewReceived === latest.listReceived) {
      return latest;
    }
  }

  return latest as Agreement;
}

describe('one definition of "received"', () => {
  it('reports the same platform-wide count from Postgres, the overview and the list', async () => {
    const reading = await readAgreement();

    // The three numbers that were 65, 72 and 72-with-a-different-rate.
    expect(reading.overviewReceived).toBe(reading.sqlReceived);
    expect(reading.listReceived).toBe(reading.sqlReceived);
  }, 30000);

  it('reports the same platform-wide fulfilment rate from both surfaces', async () => {
    const reading = await readAgreement();

    const expected = fulfillmentRatePct(reading.sqlShipped, reading.sqlReceived);
    expect(reading.overviewRatePct).toBe(expected);
    expect(reading.listRatePct).toBe(expected);
  }, 30000);

  it('reports the same count for one merchant from the list, the detail and the orders tab', async () => {
    const [listed, detail, orders, truth] = await Promise.all([
      listCustomers(normalizeCustomerListParams({ q: storeSlug })),
      getCustomerDetail(storeId),
      listCustomerOrders(storeId, normalizeCustomerOrdersParams({ pageSize: '100' })),
      db.query<{ received: string }>('SELECT COUNT(*)::text AS received FROM orders WHERE store_id = $1', [
        storeId,
      ]),
    ]);

    if (!detail) throw new Error('fixture store missing');
    const row = listed.customers[0];

    expect(Number(truth.rows[0].received)).toBe(RECEIVED);
    expect(row.orders.received).toBe(RECEIVED);
    expect(detail.orders.received).toBe(RECEIVED);
    expect(orders.pagination.total).toBe(RECEIVED);

    // The cancellations are inside that count and separately visible, which is the whole trade:
    // one definition, nothing hidden by it.
    expect(row.orders.cancelled).toBe(CANCELLED);
    expect(detail.orders.cancelled).toBe(CANCELLED);
  }, 30000);

  it('reports the same fulfilment rate for one merchant from the list and the detail', async () => {
    const [listed, detail] = await Promise.all([
      listCustomers(normalizeCustomerListParams({ q: storeSlug })),
      getCustomerDetail(storeId),
    ]);
    if (!detail) throw new Error('fixture store missing');

    // 2 of 5 = 40%. Under the old per-screen definitions this merchant would have read 40% on one
    // screen and 66.67% on another, both "correct".
    const expected = fulfillmentRatePct(SHIPPED, RECEIVED);
    expect(expected).toBe(40);
    expect(listed.customers[0].fulfillmentRatePct).toBe(expected);
    expect(detail.orders.fulfillmentRatePct).toBe(expected);
  }, 30000);

  it('averages GMV over the settled orders it is the sum of, and says how many those are', async () => {
    const detail = await getCustomerDetail(storeId);
    if (!detail) throw new Error('fixture store missing');

    // $40 + $60 settled over two settled orders. Dividing by the five received orders would give
    // $20.00 — the mental arithmetic a reader was invited to do when "72 orders received" sat
    // beside a settled-only GMV with no settled count anywhere on the screen.
    expect(detail.orders.gmvCents).toBe(10000);
    expect(detail.orders.settledOrders).toBe(2);
    expect(detail.orders.aovCents).toBe(5000);
    expect(detail.orders.received).toBe(RECEIVED);
  }, 30000);
});
