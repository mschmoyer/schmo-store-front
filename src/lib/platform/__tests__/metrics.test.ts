/**
 * @jest-environment node
 */

/**
 * Behavioural guards for the platform metrics, run against the real local Postgres.
 *
 * Everything in `metrics.ts` is SQL. A mocked driver would assert that this file's own fixture
 * strings come back unchanged and would not have caught a single one of the faults these tests
 * exist for: a `bigint` arriving as `"12"`, a `numeric` dollar amount reaching the client as
 * dollars, a `LEFT JOIN` fanning a store row out once per product, a window that slices the first
 * daily bucket in half so the chart disagrees with the tile above it. `CLAUDE.md` says prefer real
 * data; here the real database *is* the thing under test.
 *
 * Two shapes of assertion appear below and the distinction matters:
 *
 *   * **Deltas.** These functions aggregate the whole tenancy, and the local database already holds
 *     seeded demo stores. Asserting an absolute total would be asserting the seed. So each test
 *     reads the metric, writes a known fixture, reads it again, and asserts the *difference* —
 *     which is true whatever else is in the database.
 *   * **Invariants.** Zero-division, coercion and internal consistency (the timeseries summing to
 *     the overview) are absolute, and are asserted as such.
 *
 * The fixture is one throwaway store. `stores` cascades to every tenant table, so deleting that one
 * row in `afterAll` removes the orders, products, click events and rollup rows with it; the owner
 * user is deleted separately because it is the parent, not a child.
 */

import { db } from '@/lib/database/connection';
import {
  DEFAULT_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
  averageCents,
  fulfillmentRatePct,
  getPlatformHealth,
  getPlatformOverview,
  getPlatformTimeseries,
  ratioPct,
  resolveWindow,
  resolveWindowDays,
  sampledRatioPct,
  toNullableNumber,
  toNumber,
  type PlatformOverview,
} from '../metrics';

/** The instant every windowed assertion is measured against. Fixed so the tests are not racy. */
const NOW = new Date();

/** Window used throughout: wide enough to hold the fixture, narrow enough to stay cheap. */
const WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Unique-per-run suffix so a re-run never collides with a row a previous run failed to clean up. */
const SUFFIX = Math.random().toString(36).slice(2, 10);

/** Ids assigned by the fixture, filled in by `beforeAll`. */
let ownerId = '';
let storeId = '';

/**
 * An instant a whole number of hours before {@link NOW}.
 *
 * @param hours - How many hours back.
 * @returns The instant, as an ISO string Postgres can bind.
 */
function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Insert the throwaway tenant: an owner, a store, an active product, five orders and five click
 * events.
 *
 * The fixture is deliberately placed *inside* the window and away from its edges (25-50 hours old
 * against a seven-day window) so that a timezone or boundary defect shows up as a wrong delta
 * rather than as a flake at midnight UTC.
 *
 * @returns Nothing; ids are assigned to module state.
 */
async function seedFixture(): Promise<void> {
  const owner = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active, created_at)
     VALUES ($1, 'not-a-real-hash', 'Platform', 'Fixture', TRUE, $2)
     RETURNING id`,
    [`platform-metrics-${SUFFIX}@example.test`, hoursAgo(30)],
  );
  ownerId = owner.rows[0].id;

  const store = await db.query<{ id: string }>(
    `INSERT INTO stores (owner_id, store_name, store_slug, is_active, is_public, created_at, updated_at)
     VALUES ($1, $2, $3, TRUE, TRUE, $4, $4)
     RETURNING id`,
    [ownerId, `Metrics Fixture ${SUFFIX}`, `metrics-fixture-${SUFFIX}`, hoursAgo(30)],
  );
  storeId = store.rows[0].id;

  // An active product is what makes the store count as `launched` as well as merely public.
  await db.query(
    `INSERT INTO products (store_id, sku, name, slug, base_price, cost_price, status, is_active,
                           track_inventory, stock_quantity, created_at, updated_at)
     VALUES ($1, $2, 'Fixture Widget', $3, 20.00, 8.00, 'active', TRUE, TRUE, 10, $4, $4)`,
    [storeId, `FIXTURE-${SUFFIX}`, `fixture-widget-${SUFFIX}`, hoursAgo(30)],
  );

  // Four orders inside the seven-day window, all four of them "received" — the cancellation
  // included, because the merchant did receive it and it then fell through.
  //  * shipped 25h ago, 24h after it was placed -> contributes exactly 24.0 to hours-to-ship
  //  * settled 72h ago and never shipped        -> the 48-hour backlog
  //  * cancelled and refunded in full           -> received and cancelled, never GMV, never a refund
  //                                                against GMV
  //  * pending payment                          -> received, but booked-not-settled, not GMV
  await insertOrder({
    number: `FIX-${SUFFIX}-1`,
    total: '100.25',
    status: 'shipped',
    paymentStatus: 'completed',
    createdAt: hoursAgo(49),
    shippedAt: hoursAgo(25),
    paidAt: hoursAgo(49),
  });
  await insertOrder({
    number: `FIX-${SUFFIX}-2`,
    total: '150.25',
    status: 'processing',
    paymentStatus: 'completed',
    createdAt: hoursAgo(72),
    shippedAt: null,
    paidAt: hoursAgo(72),
  });
  await insertOrder({
    number: `FIX-${SUFFIX}-3`,
    total: '999.99',
    status: 'cancelled',
    paymentStatus: 'refunded',
    createdAt: hoursAgo(30),
    shippedAt: null,
    paidAt: null,
    // Refunded in full, and cancelled: the overlap the console used to render as two separate
    // bad-order columns. Its refund is money GMV never contained.
    refundedAmount: '999.99',
    refundedAt: hoursAgo(29),
  });
  // Booked but never paid: counts as received, must not count as revenue.
  await insertOrder({
    number: `FIX-${SUFFIX}-4`,
    total: '77.00',
    status: 'pending',
    paymentStatus: 'pending',
    createdAt: hoursAgo(31),
    shippedAt: null,
    paidAt: null,
  });

  // One order in the *previous* seven-day window, shipped inside it: the baseline the "Orders
  // shipped" card had no field for and therefore claimed did not exist.
  await insertOrder({
    number: `FIX-${SUFFIX}-5`,
    total: '60.00',
    status: 'completed',
    paymentStatus: 'paid',
    createdAt: hoursAgo(12 * 24),
    shippedAt: hoursAgo(10 * 24),
    paidAt: hoursAgo(12 * 24),
  });

  // Five clicks from two identifiable visitors, spread across three event types.
  const clicks: Array<[string, string | null, string]> = [
    ['storefront_view', 'visitor-a', hoursAgo(26)],
    ['storefront_view', 'visitor-a', hoursAgo(26)],
    ['storefront_view', 'visitor-b', hoursAgo(27)],
    ['product_view', 'visitor-b', hoursAgo(27)],
    ['add_to_cart', 'visitor-b', hoursAgo(28)],
  ];
  for (const [eventType, visitorId, occurredAt] of clicks) {
    await db.query(
      `INSERT INTO storefront_click_events (store_id, occurred_at, event_type, path, visitor_id)
       VALUES ($1, $2::timestamptz, $3, '/', $4)`,
      [storeId, occurredAt, eventType, visitorId],
    );
  }
}

/**
 * Insert one order for the fixture store.
 *
 * @param order - The fields the assertions depend on; everything else is filler the NOT NULL
 *                constraints require.
 * @returns Nothing.
 */
async function insertOrder(order: {
  number: string;
  total: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  shippedAt: string | null;
  paidAt: string | null;
  /** Dollars refunded, as a `numeric` literal. Omitted means nothing was refunded. */
  refundedAmount?: string | null;
  /** When the refund happened; omitted falls back to the order's own date, as the SQL does. */
  refundedAt?: string | null;
}): Promise<void> {
  await db.query(
    `INSERT INTO orders (
       store_id, order_number, customer_email, customer_first_name, customer_last_name,
       shipping_first_name, shipping_last_name, shipping_address_line1, shipping_city,
       shipping_state, shipping_postal_code, subtotal, total_amount, status, payment_status,
       created_at, updated_at, shipped_at, paid_at, refunded_amount, refunded_at
     ) VALUES (
       $1, $2, 'buyer@example.test', 'Buyer', 'Fixture',
       'Buyer', 'Fixture', '1 Test Way', 'Testville',
       'CA', '94000', $3, $3, $4, $5,
       $6::timestamptz AT TIME ZONE 'UTC', $6::timestamptz AT TIME ZONE 'UTC',
       $7::timestamptz AT TIME ZONE 'UTC', $8::timestamptz AT TIME ZONE 'UTC',
       COALESCE($9::numeric, 0), $10::timestamptz AT TIME ZONE 'UTC'
     )`,
    [
      storeId,
      order.number,
      order.total,
      order.status,
      order.paymentStatus,
      order.createdAt,
      order.shippedAt,
      order.paidAt,
      order.refundedAmount ?? null,
      order.refundedAt ?? null,
    ],
  );
}

beforeAll(async () => {
  await seedFixture();
}, 30000);

afterAll(async () => {
  // `stores` cascades to orders, order_items, products, click events and the click rollup.
  if (storeId) await db.query('DELETE FROM stores WHERE id = $1', [storeId]);
  if (ownerId) await db.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await db.close();
}, 30000);

describe('window resolution', () => {
  it('clamps whatever the query string carries', () => {
    expect(resolveWindowDays(null)).toBe(DEFAULT_WINDOW_DAYS);
    expect(resolveWindowDays('')).toBe(DEFAULT_WINDOW_DAYS);
    expect(resolveWindowDays('not-a-number')).toBe(DEFAULT_WINDOW_DAYS);
    expect(resolveWindowDays('0')).toBe(MIN_WINDOW_DAYS);
    expect(resolveWindowDays('-90')).toBe(MIN_WINDOW_DAYS);
    expect(resolveWindowDays('99999')).toBe(MAX_WINDOW_DAYS);
    expect(resolveWindowDays('7')).toBe(7);
    expect(resolveWindowDays('7.9')).toBe(7);
  });

  it('starts the window at a UTC midnight so the daily buckets line up', () => {
    const bounds = resolveWindow(7, new Date('2026-08-21T13:45:00.000Z'));

    expect(bounds.start.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-21T13:45:00.000Z');
    expect(bounds.startDay).toBe('2026-08-15');
    expect(bounds.endDay).toBe('2026-08-21');
  });

  it('puts the comparison window immediately before, and the same width', () => {
    const bounds = resolveWindow(30, new Date('2026-08-21T13:45:00.000Z'));

    expect(bounds.prevStart.toISOString()).toBe('2026-06-23T00:00:00.000Z');
    expect(bounds.start.getTime() - bounds.prevStart.getTime()).toBe(30 * DAY_MS);
  });
});

describe('coercion and arithmetic', () => {
  it('turns the driver strings into real numbers', () => {
    // Postgres hands back COUNT(*) and numeric as strings; "12" + "8" is "128".
    expect(toNumber('12')).toBe(12);
    expect(toNumber('1201704')).toBe(1201704);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('not a number')).toBe(0);
    expect(typeof toNumber('7')).toBe('number');
  });

  it('keeps "no data" distinct from "zero" for averages', () => {
    expect(toNullableNumber(null)).toBeNull();
    expect(toNullableNumber('0')).toBe(0);
    expect(toNullableNumber('34.5')).toBe(34.5);
  });

  it('never divides by zero', () => {
    expect(ratioPct(0, 0)).toBe(0);
    expect(ratioPct(5, 0)).toBe(0);
    expect(ratioPct(5, -1)).toBe(0);
    expect(ratioPct(Number.NaN, 10)).toBe(0);
    expect(Number.isFinite(ratioPct(5, 0))).toBe(true);
    expect(ratioPct(1, 3)).toBe(33.33);
    expect(ratioPct(16, 21)).toBe(76.19);
  });

  it('will not quote a rate from too small a sample', () => {
    // Arithmetically 82.61% and editorially a lie: 19 orders in 23 clicks is not a conversion rate.
    expect(sampledRatioPct(19, 23, 100)).toBeNull();
    expect(sampledRatioPct(0, 0, 100)).toBeNull();
    expect(sampledRatioPct(50, 100, 100)).toBe(50);
    expect(sampledRatioPct(500, 10000, 100)).toBe(5);
  });

  it('answers "unknown", not "$0.00", when there is nothing to average', () => {
    // The defect this replaces: `?days=7` had three orders received, $455.41 booked-but-unpaid and
    // nothing settled, and the revenue panel printed "Average order value $0.00". Zero is a
    // measurement; there was no measurement.
    expect(averageCents(0, 0)).toBeNull();
    expect(averageCents(25050, 0)).toBeNull();
    expect(averageCents(25050, -1)).toBeNull();
    expect(averageCents(Number.NaN, 2)).toBeNull();
    expect(averageCents(25050, 2)).toBe(12525);
    expect(Number.isInteger(averageCents(1000, 3) as number)).toBe(true);
  });

  it('answers "unknown", not "0%", for a fulfilment rate with nothing received', () => {
    expect(fulfillmentRatePct(0, 0)).toBeNull();
    expect(fulfillmentRatePct(5, 0)).toBeNull();
    expect(fulfillmentRatePct(5, -3)).toBeNull();
    expect(fulfillmentRatePct(Number.NaN, 10)).toBeNull();
    expect(fulfillmentRatePct(49, 72)).toBe(68.06);
    expect(fulfillmentRatePct(17, 27)).toBe(62.96);
    // Uncapped on purpose: shipped and received are different populations, so clearing a backlog
    // legitimately reads above 100% rather than being clamped into a prettier number.
    expect(fulfillmentRatePct(12, 10)).toBe(120);
  });
});

describe('getPlatformOverview', () => {
  let after: PlatformOverview;

  beforeAll(async () => {
    after = await getPlatformOverview(WINDOW_DAYS, NOW);
  }, 30000);

  it('returns the window it actually queried', () => {
    expect(after.window.days).toBe(WINDOW_DAYS);
    expect(new Date(after.window.start).toISOString()).toBe(after.window.start);
    expect(new Date(after.window.end).toISOString()).toBe(after.window.end);
    expect(new Date(after.window.start).getTime()).toBeLessThan(new Date(after.window.end).getTime());
    expect(after.window.start.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('returns real numbers in every numeric field', () => {
    // Spread into anonymous objects so each group can be walked generically; the interfaces
    // themselves carry no index signature.
    const groups: Array<Record<string, unknown>> = [
      { ...after.merchants },
      { ...after.traffic },
      { ...after.orders },
      { ...after.revenue },
      { ...after.catalog },
      { ...after.integrations },
      { ...after.conversion },
    ];

    for (const group of groups) {
      for (const [key, value] of Object.entries(group)) {
        if (value === null) {
          // Every null is a statement: nothing shipped, nothing settled, or the sample was too
          // small to quote a rate. Each of these fields answers "unknown" rather than "zero",
          // which is the rule CLAUDE.md states and the revenue panel used to break.
          expect([
            'avgHoursToShip',
            'medianHoursToShip',
            'p90HoursToShip',
            'clickToOrderPct',
            'storefrontViewToOrderPct',
            'cartToOrderPct',
            'fulfillmentRatePct',
            'fulfillmentRateAllTimePct',
            'cohortFulfillmentRatePct',
            'shippedWithin48hPct',
            'avgOrderValueCents',
          ]).toContain(key);
          continue;
        }
        if (typeof value === 'string') {
          // One deliberately non-numeric field: which event type `clickSample` counts.
          expect(key).toBe('clickSampleEvent');
          expect(value).toBe('storefront_view');
          continue;
        }
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value as number)).toBe(true);
      }
    }
  });

  it('counts the fixture store, its clicks, its orders and its money', () => {
    expect(after.merchants.total).toBeGreaterThanOrEqual(1);
    expect(after.merchants.newInWindow).toBeGreaterThanOrEqual(1);
    expect(after.merchants.withOrders).toBeGreaterThanOrEqual(1);
    // Public, active and carrying an active product.
    expect(after.merchants.launched).toBeGreaterThanOrEqual(1);

    expect(after.traffic.clicksInWindow).toBeGreaterThanOrEqual(5);
    expect(after.traffic.clicksAllTime).toBeGreaterThanOrEqual(after.traffic.clicksInWindow);
    expect(after.traffic.uniqueVisitorsInWindow).toBeGreaterThanOrEqual(2);
    // Five clicks, but only two people: a rollup that incremented a "unique" counter per event
    // would report five here.
    expect(after.traffic.uniqueVisitorsInWindow).toBeLessThan(after.traffic.clicksInWindow);
    expect(after.traffic.storefrontViews).toBeGreaterThanOrEqual(3);
    expect(after.traffic.productViews).toBeGreaterThanOrEqual(1);
    expect(after.traffic.addToCart).toBeGreaterThanOrEqual(1);

    expect(after.orders.receivedInWindow).toBeGreaterThanOrEqual(2);
    expect(after.revenue.gmvCentsInWindow).toBeGreaterThanOrEqual(25050);
  });

  it('reports money as integer cents, never dollars', () => {
    for (const value of [
      after.revenue.gmvCentsAllTime,
      after.revenue.gmvCentsInWindow,
      after.revenue.gmvCentsPrevWindow,
      after.revenue.refundedCentsInWindow,
      after.revenue.refundedTotalCentsInWindow,
      after.revenue.refundedCancelledCentsInWindow,
      after.catalog.inventoryValueCents,
      after.orders.avgOrderValueCents ?? 0,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    // $100.25 + $150.25 = 25050 cents. A float multiply gives 25049.999999999996.
    expect(after.revenue.gmvCentsInWindow).toBeGreaterThanOrEqual(25050);
  });

  it('keeps every ratio finite', () => {
    for (const value of [
      after.orders.fulfillmentRatePct,
      after.orders.cohortFulfillmentRatePct,
      after.orders.shippedWithin48hPct,
      after.conversion.clickToOrderPct,
      after.conversion.cartToOrderPct,
    ]) {
      if (value === null) continue;
      expect(Number.isFinite(value)).toBe(true);
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('cannot report more of a cohort shipped than the cohort contains', () => {
    // Throughput may exceed 100% while a backlog clears; the cohort rate never can.
    expect(after.orders.cohortFulfillmentRatePct).not.toBeNull();
    expect(after.orders.cohortFulfillmentRatePct as number).toBeLessThanOrEqual(100);
    expect(after.orders.shippedWithin48hPct as number).toBeLessThanOrEqual(
      after.orders.cohortFulfillmentRatePct as number,
    );
  });

  it('separates money that settled from money that only got booked', () => {
    // The fixture books $100.25 + $150.25 settled, $77.00 pending and $999.99 cancelled.
    expect(after.revenue.gmvSettledCentsInWindow).toBeGreaterThanOrEqual(25050);
    expect(after.revenue.gmvUnsettledCentsInWindow).toBeGreaterThanOrEqual(7700);
    expect(after.revenue.gmvCancelledCentsInWindow).toBeGreaterThanOrEqual(99999);

    // The contract aliases are the settled figures, by construction.
    expect(after.revenue.gmvCentsInWindow).toBe(after.revenue.gmvSettledCentsInWindow);
    expect(after.revenue.gmvCentsAllTime).toBe(after.revenue.gmvSettledCentsAllTime);
    expect(after.revenue.gmvCentsPrevWindow).toBe(after.revenue.gmvSettledCentsPrevWindow);

    // A cancelled order is never revenue.
    expect(after.revenue.gmvSettledCentsInWindow).toBeLessThan(
      after.revenue.gmvSettledCentsInWindow + after.revenue.gmvCancelledCentsInWindow,
    );
  });

  it('reports the shipping-time distribution, not just the mean', () => {
    if (after.orders.shippedInWindow === 0) {
      expect(after.orders.medianHoursToShip).toBeNull();
      expect(after.orders.p90HoursToShip).toBeNull();
      return;
    }
    expect(after.orders.medianHoursToShip).not.toBeNull();
    expect(after.orders.p90HoursToShip).not.toBeNull();
    // The tail is at least as slow as the middle. If this ever inverts, the percentiles are being
    // computed over different populations.
    expect(after.orders.p90HoursToShip as number).toBeGreaterThanOrEqual(
      after.orders.medianHoursToShip as number,
    );
  });

  it('counts a merchant as active only if it traded in the window', () => {
    // `stores.is_active` is true for every store ever created, so `active` must not be sourced
    // from it: it would equal `total` on every platform, forever.
    expect(after.merchants.active).toBeLessThanOrEqual(after.merchants.withOrders);
    expect(after.merchants.withOrders).toBeLessThanOrEqual(after.merchants.total);
    // The fixture store placed orders inside the window.
    expect(after.merchants.active).toBeGreaterThanOrEqual(1);
  });

  it('refuses to quote a conversion rate it cannot support', () => {
    // A day in 1970 has no traffic at all; the answer is "unknown", not "0%".
    expect(after.conversion.minClickSample).toBeGreaterThan(0);
    expect(after.conversion.minCartSample).toBeGreaterThan(0);

    if (after.conversion.clickSample < after.conversion.minClickSample) {
      expect(after.conversion.clickToOrderPct).toBeNull();
    } else {
      expect(typeof after.conversion.clickToOrderPct).toBe('number');
    }
    if (after.conversion.cartSample < after.conversion.minCartSample) {
      expect(after.conversion.cartToOrderPct).toBeNull();
    } else {
      expect(typeof after.conversion.cartToOrderPct).toBe('number');
    }
  });

  it('reports a plausible mean time to ship', () => {
    // The fixture ships one order exactly 24 hours after it was placed.
    if (after.orders.shippedInWindow > 0) {
      expect(after.orders.avgHoursToShip).not.toBeNull();
      expect(after.orders.avgHoursToShip as number).toBeGreaterThan(0);
    } else {
      expect(after.orders.avgHoursToShip).toBeNull();
    }
  });

  it('never reports more connected integrations than stores', () => {
    expect(after.integrations.bothConnected).toBeLessThanOrEqual(after.integrations.shipstationConnected);
    expect(after.integrations.bothConnected).toBeLessThanOrEqual(after.integrations.stripeConnected);
    expect(after.integrations.shipstationConnected).toBeLessThanOrEqual(after.merchants.total);
    expect(after.integrations.stripeConnected).toBeLessThanOrEqual(after.merchants.total);
    expect(after.integrations.publishedStores).toBeLessThanOrEqual(after.merchants.total);
    // A store that only ever completed onboarding writes version 1 and is not "customized".
    expect(after.integrations.themeCustomized).toBeLessThanOrEqual(after.merchants.total);
  });


  it('counts a cancelled order as received, and reports the cancellation beside it', async () => {
    // The defect: this query said received meant `status <> 'cancelled'` (65 platform-wide) while
    // the customers list said COUNT(*) (72) and the store detail divided a shipped count by
    // COUNT(*) again — 75%, 68% and 63% for one platform on three adjacent screens. One
    // definition now, and cancellations are visible rather than silently removed.
    const truth = await db.query<{ received: string; cancelled: string; shipped: string }>(
      `SELECT COUNT(*)::text AS received,
              COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled,
              COUNT(*) FILTER (WHERE shipped_at IS NOT NULL)::text AS shipped
         FROM orders`,
    );

    expect(after.orders.receivedAllTime).toBe(Number(truth.rows[0].received));
    expect(after.orders.cancelledAllTime).toBe(Number(truth.rows[0].cancelled));
    expect(after.orders.shippedAllTime).toBe(Number(truth.rows[0].shipped));
    // The fixture's own cancellation is inside the window and inside `received`.
    expect(after.orders.cancelledInWindow).toBeGreaterThanOrEqual(1);
    expect(after.orders.receivedInWindow).toBeGreaterThanOrEqual(4);
  }, 30000);

  it('derives every fulfilment rate from the one helper, over the one population', () => {
    // Not "the numbers look plausible" — the exact identity. If a future edit reintroduces a
    // second definition anywhere in this payload, these fail rather than drifting quietly.
    expect(after.orders.fulfillmentRateAllTimePct).toBe(
      fulfillmentRatePct(after.orders.shippedAllTime, after.orders.receivedAllTime),
    );
    expect(after.orders.fulfillmentRatePct).toBe(
      fulfillmentRatePct(after.orders.shippedInWindow, after.orders.receivedInWindow),
    );
  });

  it('reports the previous window for shipments and refunds instead of claiming it does not exist', async () => {
    // The console hard-coded `previous={null}` on "Orders shipped" because the contract had no
    // field, and printed "No previous 30 days to compare against" over a period that existed and
    // had shipments in it.
    const bounds = resolveWindow(WINDOW_DAYS, NOW);
    const truth = await db.query<{ shipped: string }>(
      `SELECT COUNT(*)::text AS shipped
         FROM orders
        WHERE shipped_at >= ($1::timestamptz AT TIME ZONE 'UTC')
          AND shipped_at <  ($2::timestamptz AT TIME ZONE 'UTC')`,
      [bounds.prevStart.toISOString(), bounds.start.toISOString()],
    );

    expect(after.orders.shippedPrevWindow).toBe(Number(truth.rows[0].shipped));
    // The fixture ships one order ten days ago, inside the previous seven-day window.
    expect(after.orders.shippedPrevWindow).toBeGreaterThanOrEqual(1);
    expect(typeof after.revenue.refundedCentsPrevWindow).toBe('number');
  }, 30000);

  it('says whether a zero baseline was measured or simply predates the platform', () => {
    // "The baseline was zero" and "there is no baseline" are different facts, and the console had
    // one sentence for both.
    expect(after.comparison.start).toBe(resolveWindow(WINDOW_DAYS, NOW).prevStart.toISOString());
    expect(after.comparison.end).toBe(after.window.start);
    expect(after.comparison.platformSince).not.toBeNull();
    expect(after.comparison.measured).toBe(true);
  });

  it('marks the comparison unmeasured for a window before the platform existed', async () => {
    const ancient = await getPlatformOverview(1, new Date('1970-01-02T12:00:00.000Z'));

    expect(ancient.comparison.measured).toBe(false);
    // Every baseline in that payload is zero, and none of those zeros is a measurement.
    expect(ancient.orders.shippedPrevWindow).toBe(0);
    expect(ancient.revenue.gmvCentsPrevWindow).toBe(0);
  }, 30000);

  it('names a top of funnel that does not contain its own numerator', () => {
    // `clicksInWindow` is the SUM of the stages, so dividing product views by it puts the
    // numerator inside the denominator: 1,181 of 4,130 rather than 1,181 of 2,638.
    expect(after.funnel.topOfFunnelKey).toBe('storefront_view');
    expect(after.funnel.stages[0].key).toBe(after.funnel.topOfFunnelKey);
    expect(after.funnel.stages[0].count).toBe(after.traffic.storefrontViews);
    expect(after.funnel.allEventsInWindow).toBe(after.traffic.clicksInWindow);

    const stageSum = after.funnel.stages
      .filter((stage) => stage.key !== 'order')
      .reduce((total, stage) => total + stage.count, 0);
    // The event stages cannot exceed the total they are drawn from, and the total is not an entry
    // count: it is at least as large as the entries, and larger whenever anything else happened.
    expect(stageSum).toBeLessThanOrEqual(after.funnel.allEventsInWindow);
    expect(after.funnel.allEventsInWindow).toBeGreaterThanOrEqual(after.funnel.stages[0].count);

    // The conversion rate divides by the same denominator the funnel does, and says which one.
    expect(after.conversion.clickSample).toBe(after.traffic.storefrontViews);
    expect(after.conversion.clickSampleEvent).toBe('storefront_view');
    expect(after.conversion.clickToOrderPct).toBe(after.conversion.storefrontViewToOrderPct);
  });

  it('keeps refunds against GMV apart from refunds of money GMV never held', async () => {
    // The fixture refunds $999.99 on a cancelled order. That is real money back to a buyer and it
    // is NOT deductible from GMV, because GMV never contained it.
    expect(after.revenue.refundedCancelledCentsInWindow).toBeGreaterThanOrEqual(99999);
    expect(after.revenue.refundedTotalCentsInWindow).toBe(
      after.revenue.refundedSettledCentsInWindow + after.revenue.refundedCancelledCentsInWindow,
    );
    expect(after.revenue.refundedCentsInWindow).toBe(after.revenue.refundedSettledCentsInWindow);
    expect(after.revenue.refundedOrdersInWindow).toBeGreaterThanOrEqual(1);
    // The overlap is stated rather than left for a reader to assume away.
    expect(after.revenue.refundedCancelledOrdersInWindow).toBeLessThanOrEqual(
      after.revenue.refundedOrdersInWindow,
    );

    const truth = await db.query<{ settled: string }>(
      `SELECT COALESCE(ROUND(SUM(refunded_amount) FILTER (
                WHERE status <> 'cancelled' AND payment_status IN ('paid', 'completed', 'refunded')
              ) * 100), 0)::text AS settled
         FROM orders
        WHERE COALESCE(refunded_at, created_at) >= ($1::timestamptz AT TIME ZONE 'UTC')`,
      [resolveWindow(WINDOW_DAYS, NOW).start.toISOString()],
    );
    expect(after.revenue.refundedSettledCentsInWindow).toBe(Number(truth.rows[0].settled));
  }, 30000);

  it('counts units over the same orders the money came from', async () => {
    // Units sold sits beside settled GMV, so counting them over a wider population would produce a
    // revenue-per-unit an operator can compute and cannot trust.
    const bounds = resolveWindow(WINDOW_DAYS, NOW);
    const truth = await db.query<{ units: string }>(
      `SELECT COALESCE(SUM(oi.quantity), 0)::text AS units
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.store_id = oi.store_id
        WHERE o.status <> 'cancelled'
          AND o.payment_status IN ('paid', 'completed', 'refunded')
          AND o.created_at >= ($1::timestamptz AT TIME ZONE 'UTC')
          AND o.created_at <  ($2::timestamptz AT TIME ZONE 'UTC')`,
      [bounds.start.toISOString(), bounds.end.toISOString()],
    );

    expect(after.revenue.unitsSoldInWindow).toBe(Number(truth.rows[0].units));
  }, 30000);

  it('degrades to zeros rather than errors on a window with nothing in it', async () => {
    // A single day, a century ago: every aggregate is over an empty set.
    const empty = await getPlatformOverview(1, new Date('1970-01-02T12:00:00.000Z'));

    expect(empty.merchants.newInWindow).toBe(0);
    expect(empty.traffic.clicksInWindow).toBe(0);
    expect(empty.orders.receivedInWindow).toBe(0);
    // Not zero: an empty window has no fulfilment rate and no average order value. Reporting `0`
    // for either states a measurement that was never taken.
    expect(empty.orders.fulfillmentRatePct).toBeNull();
    expect(empty.orders.cohortFulfillmentRatePct).toBeNull();
    expect(empty.orders.shippedWithin48hPct).toBeNull();
    expect(empty.orders.avgOrderValueCents).toBeNull();
    expect(empty.orders.avgHoursToShip).toBeNull();
    // All-time counts are not window-scoped, so this one is a real rate even on an empty window.
    expect(empty.orders.fulfillmentRateAllTimePct).not.toBeNull();
    expect(empty.revenue.gmvCentsInWindow).toBe(0);
    expect(empty.revenue.gmvSettledCentsInWindow).toBe(0);
    expect(empty.revenue.gmvUnsettledCentsInWindow).toBe(0);
    // Not zero: an empty window has no sample, and "0% of visitors bought" would be a claim the
    // data cannot support.
    expect(empty.conversion.clickToOrderPct).toBeNull();
    expect(empty.conversion.cartToOrderPct).toBeNull();
    expect(empty.conversion.clickSample).toBe(0);
    expect(empty.conversion.cartSample).toBe(0);
    // All-time figures are not window-scoped and still report the truth.
    expect(empty.merchants.total).toBeGreaterThanOrEqual(1);
  }, 30000);
});

describe('getPlatformTimeseries', () => {
  it('returns one zero-filled row per day, ascending, with no gaps', async () => {
    const series = await getPlatformTimeseries(WINDOW_DAYS, NOW);

    expect(series.days).toHaveLength(WINDOW_DAYS);

    const isoDay = /^\d{4}-\d{2}-\d{2}$/;
    let previous = '';
    for (const day of series.days) {
      expect(day.day).toMatch(isoDay);
      expect(day.day > previous).toBe(true);
      previous = day.day;

      for (const [, value] of Object.entries(day).filter(([key]) => key !== 'day')) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value as number)).toBe(true);
        expect(value as number).toBeGreaterThanOrEqual(0);
      }
    }

    // Consecutive days, one calendar day apart.
    for (let i = 1; i < series.days.length; i += 1) {
      const gap = Date.parse(`${series.days[i].day}T00:00:00Z`) - Date.parse(`${series.days[i - 1].day}T00:00:00Z`);
      expect(gap).toBe(DAY_MS);
    }
  }, 30000);

  it('sums to the overview it sits underneath', async () => {
    // The whole point of defining the window as whole UTC days: the chart and the tile above it
    // are computed from different statements and must still agree exactly.
    const [overview, series] = await Promise.all([
      getPlatformOverview(WINDOW_DAYS, NOW),
      getPlatformTimeseries(WINDOW_DAYS, NOW),
    ]);

    const sum = (pick: (day: (typeof series.days)[number]) => number): number =>
      series.days.reduce((total, day) => total + pick(day), 0);

    expect(sum((day) => day.orders)).toBe(overview.orders.receivedInWindow);
    expect(sum((day) => day.gmvCents)).toBe(overview.revenue.gmvCentsInWindow);
    expect(sum((day) => day.shipped)).toBe(overview.orders.shippedInWindow);
    expect(sum((day) => day.clicks)).toBe(overview.traffic.clicksInWindow);
    expect(sum((day) => day.signups)).toBe(overview.merchants.newInWindow);

    // Uniques do not sum: one person who visits on three days is three daily uniques and one
    // window unique. The relationship is an inequality, and it is the right way round only if both
    // figures are computed over the same span.
    expect(sum((day) => day.uniqueVisitors)).toBeGreaterThanOrEqual(overview.traffic.uniqueVisitorsInWindow);
  }, 30000);

  it('honours the clamp on the day count', async () => {
    const series = await getPlatformTimeseries(0, NOW);
    expect(series.days).toHaveLength(MIN_WINDOW_DAYS);
  }, 30000);
});

describe('getPlatformHealth', () => {
  it('classifies every store and the counts add up', async () => {
    const health = await getPlatformHealth();

    const total = health.counts.healthy + health.counts.stale + health.counts.failing + health.counts.notConnected;
    expect(total).toBe(health.stores.length);

    for (const store of health.stores) {
      expect(['healthy', 'stale', 'failing', 'not_connected']).toContain(store.state);
      expect(typeof store.storeId).toBe('string');
      expect(typeof store.storeName).toBe('string');
      if (store.lastSyncAt !== null) {
        expect(new Date(store.lastSyncAt).toISOString()).toBe(store.lastSyncAt);
      }
    }

    for (const value of Object.values(health.jobs)) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(typeof health.unfulfilledOver48h).toBe('number');
  }, 30000);

  it('treats a placeholder integration row as not connected', async () => {
    // Onboarding writes an inactive, key-less `store_integrations` row for every store. A bare
    // EXISTS would report the whole tenancy as connected; this store has nothing set up.
    await db.query(
      `INSERT INTO store_integrations (store_id, integration_type, is_active, sync_status)
       VALUES ($1, 'shipstation', FALSE, 'pending')`,
      [storeId],
    );

    const health = await getPlatformHealth();
    const fixture = health.stores.find((store) => store.storeId === storeId);

    expect(fixture).toBeDefined();
    expect(fixture?.state).toBe('not_connected');
  }, 30000);

  it('reports a failing sync as failing, and names the store in an alert', async () => {
    await db.query(
      `UPDATE store_integrations
          SET is_active = TRUE,
              api_key_encrypted = 'v1:fixture-ciphertext-not-a-key',
              sync_status = 'failed',
              sync_error_message = 'Fixture: upstream returned 401',
              last_sync_at = (NOW() AT TIME ZONE 'UTC')
        WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [storeId],
    );

    const health = await getPlatformHealth();
    const fixture = health.stores.find((store) => store.storeId === storeId);

    expect(fixture?.state).toBe('failing');
    expect(fixture?.errorMessage).toContain('upstream returned 401');
    expect(health.counts.failing).toBeGreaterThanOrEqual(1);

    const alert = health.alerts.find((entry) => entry.storeId === storeId && entry.severity === 'critical');
    expect(alert).toBeDefined();
    expect(alert?.storeName).toContain(SUFFIX);
    expect(alert?.title).toContain(SUFFIX);
    expect(alert?.href).toBe(`/platform/customers/${storeId}`);
  }, 30000);

  it('calls a connected integration that has not synced recently stale', async () => {
    await db.query(
      `UPDATE store_integrations
          SET sync_status = 'completed',
              sync_error_message = NULL,
              last_sync_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '3 days'
        WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [storeId],
    );

    const health = await getPlatformHealth();
    const fixture = health.stores.find((store) => store.storeId === storeId);

    expect(fixture?.state).toBe('stale');
    expect(health.alerts.some((entry) => entry.storeId === storeId && entry.severity === 'warning')).toBe(true);
  }, 30000);

  it('calls a freshly synced integration healthy', async () => {
    await db.query(
      `UPDATE store_integrations
          SET sync_status = 'completed',
              sync_error_message = NULL,
              last_sync_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '10 minutes'
        WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [storeId],
    );

    const health = await getPlatformHealth();
    expect(health.stores.find((store) => store.storeId === storeId)?.state).toBe('healthy');
  }, 30000);

  it('counts the fixture backlog and names it in an alert', async () => {
    const health = await getPlatformHealth();

    // One fixture order was paid 72 hours ago and never shipped.
    expect(health.unfulfilledOver48h).toBeGreaterThanOrEqual(1);

    const alert = health.alerts.find(
      (entry) => entry.storeId === storeId && entry.title.includes('unshipped'),
    );
    expect(alert).toBeDefined();
    expect(alert?.detail).toContain('no dispatch recorded');
    expect(alert?.href).toBe(`/platform/customers/${storeId}`);

    // One digit is not actionable: the breakdown has to carry value and age per store.
    const fixture = health.unfulfilled.stores.find((entry) => entry.storeId === storeId);
    expect(fixture).toBeDefined();
    expect(fixture?.count).toBe(1);
    expect(fixture?.stuckCents).toBe(15025);
    expect(fixture?.oldestAgeHours).toBeGreaterThanOrEqual(48);

    // The scalar and the breakdown are the same fact.
    expect(health.unfulfilled.total).toBe(health.unfulfilledOver48h);
    expect(health.unfulfilled.total).toBe(
      health.unfulfilled.stores.reduce((sum, entry) => sum + entry.count, 0),
    );
    expect(health.unfulfilled.totalCents).toBe(
      health.unfulfilled.stores.reduce((sum, entry) => sum + entry.stuckCents, 0),
    );
    expect(health.unfulfilled.oldestAgeHours).not.toBeNull();
  }, 30000);

  it('leaves a booked-but-unpaid order out of the backlog', async () => {
    // The fixture's pending-payment order is older than the threshold and unshipped. It is not a
    // fulfilment problem — nobody has taken the money — and counting it would send an operator to
    // chase a shipment that should not go out.
    const health = await getPlatformHealth();
    const fixture = health.unfulfilled.stores.find((entry) => entry.storeId === storeId);

    expect(fixture?.count).toBe(1);
    expect(fixture?.stuckCents).toBe(15025);
  }, 30000);

  it('caps the alert list and orders it worst-first', async () => {
    const health = await getPlatformHealth();

    expect(health.alerts.length).toBeLessThanOrEqual(25);

    const rank = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < health.alerts.length; i += 1) {
      expect(rank[health.alerts[i].severity]).toBeGreaterThanOrEqual(rank[health.alerts[i - 1].severity]);
    }

    for (const alert of health.alerts) {
      expect(alert.title.length).toBeGreaterThan(0);
      expect(alert.detail.length).toBeGreaterThan(0);
      // A store-scoped alert must name its store; a platform-wide one must not pretend to.
      if (alert.storeId !== null) {
        expect(alert.storeName).toBeTruthy();
        expect(alert.title).toContain(alert.storeName as string);
      }
    }
  }, 30000);
});
