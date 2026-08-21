/**
 * @jest-environment node
 */

/**
 * The customers read model, exercised against the real local Postgres.
 *
 * This suite deliberately does not mock the database. Every defect it guards against is a defect
 * *of the SQL* — a `bigint` arriving as a string, a `numeric` in dollars escaping as cents, a
 * `LATERAL` that fans a row out, a filter predicate that does not compose with a search term. A
 * mocked `db.query` returning hand-written rows would agree with any of those and prove nothing.
 * `jest.setup.js` installs a global mock of `@/lib/database/connection`; the `jest.unmock` below
 * is what puts the real pool back for this file.
 *
 * The fixture is a throwaway tenant created in `beforeAll` and dropped in `afterAll`. It is built
 * rather than borrowed from the seed so the arithmetic below can be asserted exactly: the seeded
 * demo stores are re-seeded by other work and their numbers move.
 *
 * Requires `DATABASE_URL`. `next/jest` loads `.env.local`, so a session that has run
 * `npm run setup:local` needs no further setup.
 */

jest.unmock('@/lib/database/connection');

import { randomUUID } from 'crypto';
import { db } from '@/lib/database/connection';
import {
  COMPLETENESS_SIGNALS,
  DEFAULT_FILTER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_PAGE_SIZE,
  buildPagination,
  getCustomerDetail,
  listCustomerOrders,
  listCustomers,
  normalizeCustomerListParams,
  normalizeCustomerOrdersParams,
  storeExists,
} from '../customers';

/** Everything the fixture created, so `afterAll` can remove exactly that. */
interface Fixture {
  ownerId: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
  productIds: string[];
}

const fixture: Fixture = {
  ownerId: randomUUID(),
  storeId: randomUUID(),
  // A slug and name unique enough that `q` cannot match a seeded store by accident.
  storeSlug: `zz-platform-test-${randomUUID().slice(0, 8)}`,
  storeName: `ZZ Platform Fixture ${randomUUID().slice(0, 8)}`,
  productIds: [],
};

/**
 * Orders the fixture creates. `null` `shippedAt` means still unshipped.
 *
 * `paymentStatus` covers all three shapes the column takes in this codebase: real checkout writes
 * `'paid'`, the demo seed writes `'completed'`, and an unpaid order sits at `'pending'`. GMV must
 * count the first two and only those.
 */
const ORDERS: Array<{
  total: string;
  status: string;
  paymentStatus: string;
  shippedDaysAgo: number | null;
}> = [
  { total: '10.00', status: 'completed', paymentStatus: 'completed', shippedDaysAgo: 1 },
  { total: '25.50', status: 'shipped', paymentStatus: 'paid', shippedDaysAgo: 2 },
  { total: '4.50', status: 'processing', paymentStatus: 'pending', shippedDaysAgo: null },
  { total: '99.99', status: 'cancelled', paymentStatus: 'refunded', shippedDaysAgo: null },
];

/** Settled dollars: 10.00 (completed) + 25.50 (paid). The pending 4.50 is not revenue. */
const EXPECTED_GMV_CENTS = 3550;

/** Placed, not cancelled, never paid: the 4.50 processing order. */
const EXPECTED_UNSETTLED_CENTS = 450;

beforeAll(async () => {
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, is_active)
     VALUES ($1, $2, 'not-a-real-hash', 'Platform', 'Fixture', TRUE)`,
    [fixture.ownerId, `platform-fixture-${fixture.ownerId}@example.test`]
  );

  await db.query(
    `INSERT INTO stores (id, owner_id, store_name, store_slug, store_description, hero_title,
                         logo_url, is_active, is_public, created_at)
     VALUES ($1, $2, $3, $4, 'A throwaway tenant', 'Hero', '/logo.png', TRUE, TRUE, NOW())`,
    [fixture.storeId, fixture.ownerId, fixture.storeName, fixture.storeSlug]
  );

  for (let index = 0; index < 3; index += 1) {
    const productId = randomUUID();
    fixture.productIds.push(productId);
    await db.query(
      `INSERT INTO products (id, store_id, sku, name, slug, base_price, cost_price,
                             stock_quantity, track_inventory, is_active)
       VALUES ($1, $2, $3, $4, $5, 20.00, 5.00, $6, TRUE, $7)`,
      [
        productId,
        fixture.storeId,
        `ZZ-SKU-${index}`,
        `Fixture product ${index}`,
        `fixture-product-${index}-${productId.slice(0, 8)}`,
        10 * (index + 1),
        index < 2,
      ]
    );
  }

  for (const [index, order] of ORDERS.entries()) {
    const orderId = randomUUID();
    await db.query(
      `INSERT INTO orders (id, store_id, order_number, customer_email, customer_first_name,
                           customer_last_name, shipping_first_name, shipping_last_name,
                           shipping_address_line1, shipping_city, shipping_state,
                           shipping_postal_code, subtotal, total_amount, status,
                           payment_status, fulfillment_status, created_at, shipped_at)
       VALUES ($1, $2, $3, 'buyer@example.test', 'Buyer', 'One', 'Buyer', 'One',
               '1 Test Way', 'Testville', 'TS', '00000', $4, $4, $5, $6, $7,
               NOW() - ($8 || ' days')::interval,
               CASE WHEN $9::int IS NULL THEN NULL ELSE NOW() - ($9 || ' days')::interval END)`,
      [
        orderId,
        fixture.storeId,
        `ZZ-${index}-${orderId.slice(0, 8)}`,
        order.total,
        order.status,
        order.paymentStatus,
        order.shippedDaysAgo === null ? 'unfulfilled' : 'fulfilled',
        String(index + 3),
        order.shippedDaysAgo,
      ]
    );

    // One line per order, so `topProducts` has something to rank. Product 0 sells the most.
    await db.query(
      `INSERT INTO order_items (store_id, order_id, product_id, product_sku, product_name,
                                unit_price, quantity, total_price)
       VALUES ($1, $2, $3, $4, $5, 10.00, $6, $7)`,
      [
        fixture.storeId,
        orderId,
        fixture.productIds[index === 0 ? 0 : index % 2],
        `ZZ-SKU-${index === 0 ? 0 : index % 2}`,
        'Fixture line',
        index === 0 ? 5 : 1,
        (index === 0 ? 50 : 10).toFixed(2),
      ]
    );
  }

  // Click events. The AFTER INSERT trigger maintains storefront_click_daily, so the rollup the
  // list reads is populated by writing events exactly as the storefront does.
  const events: Array<[string, string, string | null, string | null]> = [
    ['storefront_view', 'visitor-a', '/', 'google.com'],
    ['storefront_view', 'visitor-a', '/', 'google.com'],
    ['product_view', 'visitor-b', '/products/fixture', 'google.com'],
    ['add_to_cart', 'visitor-c', '/products/fixture', null],
  ];
  for (const [eventType, visitorId, path, referrer] of events) {
    await db.query(
      `INSERT INTO storefront_click_events
         (store_id, occurred_at, event_type, path, visitor_id, referrer_domain)
       VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [fixture.storeId, eventType, path, visitorId, referrer]
    );
  }
});

afterAll(async () => {
  // `stores` and `users` cascade to orders, order_items, products and click events.
  await db.query('DELETE FROM stores WHERE id = $1', [fixture.storeId]);
  await db.query('DELETE FROM users WHERE id = $1', [fixture.ownerId]);
  await db.close();
});

describe('parameter normalisation', () => {
  it('falls back to the default sort rather than erroring on an unknown value', () => {
    const params = normalizeCustomerListParams({ sort: 'DROP TABLE stores' });
    expect(params.sort).toBe(DEFAULT_SORT);
  });

  it('falls back to the defaults for unknown dir and filter', () => {
    const params = normalizeCustomerListParams({ dir: 'sideways', filter: 'whatever' });
    expect(params.dir).toBe('desc');
    expect(params.filter).toBe(DEFAULT_FILTER);
  });

  it('keeps every allowlisted value it is given', () => {
    const params = normalizeCustomerListParams({ sort: 'gmv', dir: 'asc', filter: 'has_orders' });
    expect(params).toMatchObject({ sort: 'gmv', dir: 'asc', filter: 'has_orders' });
  });

  it('clamps page to at least 1 and page size to the ceiling', () => {
    expect(normalizeCustomerListParams({ page: '-7' }).page).toBe(1);
    expect(normalizeCustomerListParams({ page: 'banana' }).page).toBe(1);
    expect(normalizeCustomerListParams({ pageSize: '100000' }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(normalizeCustomerListParams({ pageSize: '0' }).pageSize).toBe(1);
    expect(normalizeCustomerListParams({}).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('treats a blank search as no search', () => {
    expect(normalizeCustomerListParams({ q: '   ' }).q).toBeNull();
    expect(normalizeCustomerListParams({ q: '  fern ' }).q).toBe('fern');
  });

  it('reads URLSearchParams as well as a plain record', () => {
    const params = normalizeCustomerListParams(new URLSearchParams('page=3&pageSize=10&sort=name'));
    expect(params).toMatchObject({ page: 3, pageSize: 10, sort: 'name' });
  });

  it('normalises the order-list parameters the same way', () => {
    expect(normalizeCustomerOrdersParams({ page: '0', pageSize: '999', status: ' ' })).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      status: null,
    });
    expect(normalizeCustomerOrdersParams({ status: 'shipped' }).status).toBe('shipped');
  });
});

describe('pagination arithmetic', () => {
  it('rounds total pages up and reports zero for an empty set', () => {
    expect(buildPagination(1, 25, 0)).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
    expect(buildPagination(1, 25, 1).totalPages).toBe(1);
    expect(buildPagination(1, 25, 25).totalPages).toBe(1);
    expect(buildPagination(1, 25, 26).totalPages).toBe(2);
    expect(buildPagination(1, 10, 99).totalPages).toBe(10);
  });

  it('echoes an out-of-range page back rather than silently clamping to the last one', () => {
    expect(buildPagination(40, 25, 3)).toEqual({
      page: 40,
      pageSize: 25,
      total: 3,
      totalPages: 1,
    });
  });
});

describe('listCustomers', () => {
  it('finds the fixture by store name, slug and owner email', async () => {
    for (const term of [fixture.storeName, fixture.storeSlug, `platform-fixture-${fixture.ownerId}`]) {
      const result = await listCustomers(normalizeCustomerListParams({ q: term }));
      expect(result.customers.map((row) => row.storeId)).toEqual([fixture.storeId]);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    }
  });

  it('returns real numbers, not the strings Postgres hands back', async () => {
    const result = await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug }));
    const row = result.customers[0];

    for (const value of [
      row.orders.received,
      row.orders.shipped,
      row.orders.last30d,
      row.gmvCents,
      row.clicks.allTime,
      row.clicks.last30d,
      row.products,
      row.inventoryUnits,
    ]) {
      expect(typeof value).toBe('number');
    }

    expect(result.totals).toEqual({
      customers: 1,
      orders: ORDERS.length,
      shipped: 2,
      gmvCents: EXPECTED_GMV_CENTS,
      unsettledCents: EXPECTED_UNSETTLED_CENTS,
      clicks: 4,
    });
  });

  it('books only money that moved: cancelled is out, and so is unpaid', async () => {
    const result = await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug }));
    const row = result.customers[0];

    // 10.00 `completed` + 25.50 `paid` = 35.50. The 99.99 cancellation is not GMV, and neither is
    // the 4.50 order that was placed but never paid - booking that was a 23% overstatement.
    expect(row.gmvCents).toBe(EXPECTED_GMV_CENTS);
    expect(Number.isInteger(row.gmvCents)).toBe(true);

    // The unpaid remainder is reported rather than dropped, so nothing vanishes between the two.
    expect(row.unsettledCents).toBe(EXPECTED_UNSETTLED_CENTS);
    expect(row.gmvCents + row.unsettledCents).toBe(1000 + 2550 + 450);
  });

  it('treats both payment statuses this codebase writes as paid', async () => {
    // Real checkout writes 'paid' (src/lib/billing/orders.ts); the demo seed writes 'completed'.
    // A predicate that recognised only one of them would zero out half the platform.
    const result = await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug }));
    expect(result.customers[0].gmvCents).toBe(1000 + 2550);
  });

  it('does not key settlement off `paid_at`, which nothing writes', async () => {
    // Every fixture order has a NULL paid_at, exactly as the seed and the app leave it. If GMV
    // required a paid_at timestamp, the figure below would be zero for every store on the platform.
    const nulls = await db.query<{ n: string }>(
      'SELECT COUNT(*)::bigint AS n FROM orders WHERE store_id = $1 AND paid_at IS NULL',
      [fixture.storeId]
    );
    expect(Number(nulls.rows[0].n)).toBe(ORDERS.length);

    const result = await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug }));
    expect(result.customers[0].gmvCents).toBeGreaterThan(0);
  });

  it('never leaks a credential column', async () => {
    const result = await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug }));
    const serialised = JSON.stringify(result);
    for (const forbidden of [
      'api_key_encrypted',
      'webhook_secret_encrypted',
      'password_hash',
      'apiKey',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('agrees with itself: summing every page reproduces `totals`', async () => {
    const base = normalizeCustomerListParams({ pageSize: '2', sort: 'gmv', dir: 'desc' });
    const first = await listCustomers(base);

    let seen = 0;
    let orders = 0;
    let gmvCents = 0;
    let unsettledCents = 0;
    const ids: string[] = [];

    for (let page = 1; page <= first.pagination.totalPages; page += 1) {
      const result = await listCustomers({ ...base, page });
      for (const row of result.customers) {
        seen += 1;
        orders += row.orders.received;
        gmvCents += row.gmvCents;
        unsettledCents += row.unsettledCents;
        ids.push(row.storeId);
      }
      // Every page reports the same set-wide totals.
      expect(result.totals).toEqual(first.totals);
      expect(result.pagination.total).toBe(first.pagination.total);
    }

    expect(seen).toBe(first.totals.customers);
    expect(orders).toBe(first.totals.orders);
    expect(gmvCents).toBe(first.totals.gmvCents);
    expect(unsettledCents).toBe(first.totals.unsettledCents);
    // No store appears on two pages, which is what an unstable ORDER BY would cause.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty page with honest numbers when the page is out of range', async () => {
    const result = await listCustomers(
      normalizeCustomerListParams({ q: fixture.storeSlug, page: '99' })
    );
    expect(result.customers).toEqual([]);
    expect(result.pagination).toEqual({ page: 99, pageSize: DEFAULT_PAGE_SIZE, total: 1, totalPages: 1 });
    // The totals still describe the filtered set, not the empty page.
    expect(result.totals.customers).toBe(1);
    expect(result.totals.gmvCents).toBe(EXPECTED_GMV_CENTS);
    expect(result.totals.unsettledCents).toBe(EXPECTED_UNSETTLED_CENTS);
  });

  it('sorts by an allowlisted column in both directions', async () => {
    const desc = await listCustomers(normalizeCustomerListParams({ sort: 'gmv', dir: 'desc' }));
    const asc = await listCustomers(normalizeCustomerListParams({ sort: 'gmv', dir: 'asc' }));

    const descValues = desc.customers.map((row) => row.gmvCents);
    const ascValues = asc.customers.map((row) => row.gmvCents);
    expect([...descValues].sort((a, b) => b - a)).toEqual(descValues);
    expect([...ascValues].sort((a, b) => a - b)).toEqual(ascValues);
  });

  it('treats an injection attempt in `sort` as the default sort', async () => {
    const attack = await listCustomers(
      normalizeCustomerListParams({ sort: "created; DROP TABLE stores; --" })
    );
    const fallback = await listCustomers(normalizeCustomerListParams({}));
    expect(attack.customers.map((row) => row.storeId)).toEqual(
      fallback.customers.map((row) => row.storeId)
    );

    // The table the payload named is still there.
    const stillThere = await db.query<{ n: string }>('SELECT COUNT(*)::bigint AS n FROM stores');
    expect(Number(stillThere.rows[0].n)).toBeGreaterThan(0);
  });

  it('composes a filter with a search term', async () => {
    const hasOrders = await listCustomers(
      normalizeCustomerListParams({ q: fixture.storeSlug, filter: 'has_orders' })
    );
    expect(hasOrders.pagination.total).toBe(1);

    const noOrders = await listCustomers(
      normalizeCustomerListParams({ q: fixture.storeSlug, filter: 'no_orders' })
    );
    expect(noOrders.customers).toEqual([]);
    expect(noOrders.pagination.total).toBe(0);
    expect(noOrders.pagination.totalPages).toBe(0);
    expect(noOrders.totals.customers).toBe(0);

    // The fixture has no ShipStation credential, so it is in `unconnected` and not `connected`.
    const unconnected = await listCustomers(
      normalizeCustomerListParams({ q: fixture.storeSlug, filter: 'unconnected' })
    );
    expect(unconnected.pagination.total).toBe(1);
    const connected = await listCustomers(
      normalizeCustomerListParams({ q: fixture.storeSlug, filter: 'connected' })
    );
    expect(connected.pagination.total).toBe(0);
  });

  it('escapes LIKE metacharacters so `%` is a search for a percent sign', async () => {
    const result = await listCustomers(normalizeCustomerListParams({ q: '%' }));
    expect(result.customers.map((row) => row.storeId)).not.toContain(fixture.storeId);
  });
});

describe('getCustomerDetail', () => {
  it('returns null for a well-formed id that matches no store', async () => {
    expect(await getCustomerDetail(randomUUID())).toBeNull();
  });

  it('returns null for an id that is not a UUID, rather than letting Postgres throw', async () => {
    expect(await getCustomerDetail('not-a-uuid')).toBeNull();
    expect(await getCustomerDetail("' OR 1=1 --")).toBeNull();
  });

  it('reports the store, owner and order arithmetic', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.store.storeId).toBe(fixture.storeId);
    expect(detail.store.storeUrl).toBe(`/store/${fixture.storeSlug}`);
    expect(detail.owner.name).toBe('Platform Fixture');

    // `users.last_login` is written by nothing in this codebase. Reporting a bare null would have
    // the UI say "never signed in" about a merchant who signs in daily; the flag says "not
    // tracked" instead, and flips on its own once the sign-in route starts writing the column.
    const stored = await db.query<{ last_login: Date | null }>(
      'SELECT last_login FROM users WHERE id = $1',
      [fixture.ownerId]
    );
    expect(stored.rows[0].last_login).toBeNull();
    expect(detail.owner.lastLogin).toBeNull();
    expect(detail.owner.lastLoginTracked).toBe(false);

    expect(detail.orders.received).toBe(ORDERS.length);
    expect(detail.orders.shipped).toBe(2);
    expect(detail.orders.cancelled).toBe(1);
    expect(detail.orders.gmvCents).toBe(EXPECTED_GMV_CENTS);
    expect(detail.orders.unsettledCents).toBe(EXPECTED_UNSETTLED_CENTS);
    expect(detail.orders.unsettledOrders).toBe(1);
    // AOV is over the two settled orders that make up GMV, not over all four.
    expect(detail.orders.aovCents).toBe(Math.round(EXPECTED_GMV_CENTS / 2));
    expect(typeof detail.orders.avgHoursToShip).toBe('number');
    expect(detail.orders.recent).toHaveLength(ORDERS.length);
    expect(Number.isInteger(detail.orders.recent[0].totalCents)).toBe(true);
  });

  it('counts the catalogue and ranks top products by units sold', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    expect(detail.catalog.products).toBe(3);
    expect(detail.catalog.activeProducts).toBe(2);

    // Stock is read back rather than hardcoded: inserting `order_items` fires
    // `trigger_update_inventory_on_order`, so the opening quantities are not the closing ones.
    // What is being asserted is the aggregate and the cents conversion, not the ledger.
    const stock = await db.query<{ units: string }>(
      'SELECT COALESCE(SUM(GREATEST(stock_quantity, 0)), 0)::bigint AS units FROM products WHERE store_id = $1',
      [fixture.storeId]
    );
    const units = Number(stock.rows[0].units);
    expect(units).toBeGreaterThan(0);
    expect(detail.catalog.inventoryUnits).toBe(units);
    // Every fixture product costs 5.00, so the value is units x 500 cents.
    expect(detail.catalog.inventoryValueCents).toBe(units * 500);

    // Ranked over settled orders only: product 0 sold 5 units on the paid order, and the extra
    // unit on the unpaid order is not revenue.
    expect(detail.catalog.topProducts[0].id).toBe(fixture.productIds[0]);
    expect(detail.catalog.topProducts[0].unitsSold).toBe(5);
    expect(detail.catalog.topProducts[0].revenueCents).toBe(5000);
    for (const product of detail.catalog.topProducts) {
      expect(typeof product.unitsSold).toBe('number');
      expect(typeof product.revenueCents).toBe('number');
    }
  });

  it('reports traffic with every day present and uniques from the event table', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    expect(detail.traffic.clicksAllTime).toBe(4);
    expect(detail.traffic.clicksLast30d).toBe(4);
    // Three distinct visitor ids across four events.
    expect(detail.traffic.uniqueVisitorsLast30d).toBe(3);

    expect(detail.traffic.daily).toHaveLength(30);
    expect(detail.traffic.daily.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.day))).toBe(true);
    const days = detail.traffic.daily.map((day) => day.day);
    expect([...days].sort()).toEqual(days);
    expect(detail.traffic.daily.reduce((sum, day) => sum + day.clicks, 0)).toBe(4);

    expect(detail.traffic.topPages.map((page) => page.path)).toContain('/');
    expect(detail.traffic.topReferrers[0]).toEqual({ domain: 'google.com', clicks: 3 });
  });

  it('builds a checklist whose details are facts', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    const keys = detail.checklist.map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining(['shipstation', 'stripe', 'products', 'theme', 'published', 'first_order'])
    );

    const byKey = Object.fromEntries(detail.checklist.map((item) => [item.key, item]));
    expect(byKey.shipstation.done).toBe(false);
    expect(byKey.shipstation.detail).toBe('no credentials stored');
    expect(byKey.stripe.done).toBe(false);
    expect(byKey.stripe.detail).toBe('no Connect account');
    expect(byKey.products.done).toBe(true);
    expect(byKey.products.detail).toBe('3 products, 2 active');
    // The shared rule (src/lib/platform/customization.ts) is the union of theme editing and
    // branding. The fixture has branding and has never opened the customizer, and the detail
    // string says which of the two it was rather than leaving the operator to guess.
    expect(byKey.theme.done).toBe(true);
    expect(byKey.theme.detail).toBe('branding set, customizer not opened');
    expect(byKey.published.done).toBe(true);
    expect(byKey.first_order.done).toBe(true);
    expect(byKey.first_order.detail).toMatch(/^4 orders, last /);

    for (const item of detail.checklist) {
      expect(typeof item.label).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });

  it('reports completeness as a share of the named signal set', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    // Logo, description, hero, public and products hold; themeEdited, ShipStation and Stripe do
    // not. themeEdited rather than themeCustomized is what the set counts - the shared
    // "customized" rule already contains the branding signals, so counting it here would score
    // the fixture's logo twice and report 75% for a store that has never opened the customizer.
    expect(COMPLETENESS_SIGNALS).toContain('themeEdited');
    expect(COMPLETENESS_SIGNALS).not.toContain('themeCustomized');
    const expected = Math.round((5 / COMPLETENESS_SIGNALS.length) * 100);
    expect(detail.customization.completenessPct).toBe(expected);
    expect(detail.customization.hasLogo).toBe(true);
    expect(detail.customization.hasHero).toBe(true);
    expect(detail.customization.hasDescription).toBe(true);
    // True by branding under the shared rule, even though no theme row exists.
    expect(detail.customization.themeCustomized).toBe(true);
    expect(detail.customization.sectionCount).toBe(0);
  });

  it('reports integrations as booleans and timestamps only', async () => {
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    expect(detail.integrations.shipstation).toEqual({
      connected: false,
      lastSyncAt: null,
      syncStatus: null,
      errorMessage: null,
      webhookRegistered: false,
      autoSyncEnabled: false,
    });
    expect(detail.integrations.stripe.connected).toBe(false);
    expect(detail.integrations.subscription.plan).toBeNull();

    const serialised = JSON.stringify(detail);
    for (const forbidden of ['api_key_encrypted', 'webhook_secret_encrypted', 'password_hash']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('the list and the detail describe the same merchant', () => {
  it('agrees about customization, orders, GMV and products', async () => {
    const listed = (await listCustomers(normalizeCustomerListParams({ q: fixture.storeSlug })))
      .customers[0];
    const detail = await getCustomerDetail(fixture.storeId);
    if (!detail) throw new Error('fixture store missing');

    // `customized` in the list is the same predicate as `themeCustomized` in the detail. Two
    // near-identical definitions in two places is how one screen contradicts another.
    expect(listed.customized).toBe(detail.customization.themeCustomized);
    expect(listed.orders.received).toBe(detail.orders.received);
    expect(listed.orders.shipped).toBe(detail.orders.shipped);
    expect(listed.gmvCents).toBe(detail.orders.gmvCents);
    expect(listed.products).toBe(detail.catalog.products);
    expect(listed.inventoryUnits).toBe(detail.catalog.inventoryUnits);
    expect(listed.clicks.allTime).toBe(detail.traffic.clicksAllTime);
    expect(listed.integrations.shipstation).toBe(detail.integrations.shipstation.connected);
  });
});

describe('storeExists', () => {
  it('separates "no such store" from "a store with nothing in it"', async () => {
    expect(await storeExists(fixture.storeId)).toBe(true);
    expect(await storeExists(randomUUID())).toBe(false);
    expect(await storeExists('not-a-uuid')).toBe(false);
  });
});

describe('listCustomerOrders', () => {
  it('pages one store\'s orders newest first', async () => {
    const page1 = await listCustomerOrders(
      fixture.storeId,
      normalizeCustomerOrdersParams({ pageSize: '2' })
    );
    expect(page1.orders).toHaveLength(2);
    expect(page1.pagination).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(page1.orders[0].createdAt >= page1.orders[1].createdAt).toBe(true);

    const page2 = await listCustomerOrders(
      fixture.storeId,
      normalizeCustomerOrdersParams({ pageSize: '2', page: '2' })
    );
    expect(page2.orders).toHaveLength(2);

    const ids = [...page1.orders, ...page2.orders].map((order) => order.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('narrows by status through a bound parameter', async () => {
    const cancelled = await listCustomerOrders(
      fixture.storeId,
      normalizeCustomerOrdersParams({ status: 'cancelled' })
    );
    expect(cancelled.pagination.total).toBe(1);
    expect(cancelled.orders[0].status).toBe('cancelled');
    expect(cancelled.orders[0].totalCents).toBe(9999);

    const injection = await listCustomerOrders(
      fixture.storeId,
      normalizeCustomerOrdersParams({ status: "shipped' OR '1'='1" })
    );
    expect(injection.orders).toEqual([]);
    expect(injection.pagination.total).toBe(0);
  });

  it('returns an empty page with honest numbers past the end', async () => {
    const result = await listCustomerOrders(
      fixture.storeId,
      normalizeCustomerOrdersParams({ page: '9', pageSize: '2' })
    );
    expect(result.orders).toEqual([]);
    expect(result.pagination).toEqual({ page: 9, pageSize: 2, total: 4, totalPages: 2 });
  });

  it('is store-scoped: another tenant\'s orders never appear', async () => {
    const others = await db.query<{ id: string }>(
      'SELECT id FROM stores WHERE id <> $1 LIMIT 1',
      [fixture.storeId]
    );
    if (others.rows.length === 0) return;

    const result = await listCustomerOrders(
      others.rows[0].id,
      normalizeCustomerOrdersParams({ pageSize: '100' })
    );
    const fixtureNumbers = new Set(ORDERS.map((_, index) => `ZZ-${index}-`));
    for (const order of result.orders) {
      for (const prefix of fixtureNumbers) {
        expect(order.orderNumber.startsWith(prefix)).toBe(false);
      }
    }
  });
});
