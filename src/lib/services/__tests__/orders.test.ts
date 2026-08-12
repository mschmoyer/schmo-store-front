/**
 * Guards for the order and profit primitives.
 *
 * Each block corresponds to a figure the admin displayed wrongly. The point of
 * a test here is not coverage; it is that the specific wrong answer cannot come
 * back. Where a case is drawn from the seeded Basecamp Audio store the expected
 * value is the one verified with psql, and the query is named in the comment.
 */

import {
  AGEING_THRESHOLD_DAYS,
  GROSS_PROFIT_QUERY,
  ORDER_LIST_SELECT,
  ORDER_REVENUE_STATUSES,
  ORDER_STATUSES,
  ORDER_UNSHIPPED_STATUSES,
  mapGrossProfitRow,
  mapOrderListRow,
  periodDelta,
  type OrderListRow,
} from '../orders';

/**
 * Builds an order list row with sensible defaults.
 *
 * @param overrides - Fields to override on the base row.
 * @returns A complete {@link OrderListRow}.
 */
function orderRow(overrides: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: 'edf08860-d9fd-4b0c-a637-9189252b4d52',
    order_number: 'BCA-1014',
    status: 'processing',
    fulfillment_status: 'unfulfilled',
    payment_status: 'completed',
    customer_first_name: 'Mason',
    customer_last_name: 'Clark',
    customer_email: 'mason.clark@example.com',
    shipping_city: 'Atlanta',
    shipping_state: 'GA',
    total_amount: '155.01',
    refunded_amount: '0',
    discount_amount: '35.80',
    tracking_number: null,
    tracking_url: null,
    carrier: null,
    created_at: '2026-05-31T12:59:17.000Z',
    shipped_at: null,
    age_days: 73,
    item_count: 1,
    ...overrides,
  };
}

describe('what counts as revenue', () => {
  it('excludes cancellations and nothing else', () => {
    // The dashboard shipped with `status = 'completed'`, which discarded
    // shipped, processing and pending orders — $3,414.06 of $5,588.11.
    expect(ORDER_REVENUE_STATUSES).toEqual(['pending', 'processing', 'shipped', 'completed']);
    expect(ORDER_REVENUE_STATUSES).not.toContain('cancelled');
  });

  it('uses `<> cancelled` in the profit query, never `= completed`', () => {
    expect(GROSS_PROFIT_QUERY).toContain("o.status <> 'cancelled'");
    expect(GROSS_PROFIT_QUERY).not.toContain("o.status = 'completed'");
  });

  it('reads the cost snapshot first and only falls back to current cost', () => {
    // Without the snapshot, a supplier price change silently rewrites every
    // historical margin in the application.
    expect(GROSS_PROFIT_QUERY).toContain('COALESCE(oi.unit_cost, p.cost_price)');
  });

  it('keys its window off the order date, not the line insert timestamp', () => {
    expect(GROSS_PROFIT_QUERY).toContain('o.created_at >= $2');
    expect(GROSS_PROFIT_QUERY).not.toContain('oi.created_at');
  });
});

describe('what counts as unshipped', () => {
  it('is money taken with nothing dispatched', () => {
    expect(ORDER_UNSHIPPED_STATUSES).toEqual(['pending', 'processing']);
  });

  it('covers every status the schema can produce', () => {
    expect(ORDER_STATUSES).toEqual(['pending', 'processing', 'shipped', 'completed', 'cancelled']);
  });
});

describe('mapOrderListRow', () => {
  it('flags an unshipped order past the ageing threshold', () => {
    // BCA-1014: processing, placed 2026-05-31, 73 days old, $155.01.
    const row = mapOrderListRow(orderRow());

    expect(row.orderNumber).toBe('BCA-1014');
    expect(row.ageDays).toBe(73);
    expect(row.isAgeing).toBe(true);
    expect(row.totalAmount).toBeCloseTo(155.01, 2);
    expect(row.customerName).toBe('Mason Clark');
    expect(row.destination).toBe('Atlanta, GA');
  });

  it('does not flag a shipped order however old it is', () => {
    // Age alone is not the alarm — an order that went out six months ago is
    // finished business, not a customer waiting.
    const row = mapOrderListRow(orderRow({ status: 'shipped', age_days: 180 }));
    expect(row.isAgeing).toBe(false);
  });

  it('does not flag an unshipped order inside the threshold', () => {
    const row = mapOrderListRow(orderRow({ age_days: AGEING_THRESHOLD_DAYS }));
    expect(row.isAgeing).toBe(false);

    const late = mapOrderListRow(orderRow({ age_days: AGEING_THRESHOLD_DAYS + 1 }));
    expect(late.isAgeing).toBe(true);
  });

  it('coerces numeric strings out of pg rather than concatenating them', () => {
    const row = mapOrderListRow(
      orderRow({ total_amount: '515.27', refunded_amount: '10.00', item_count: '4' })
    );
    expect(row.totalAmount).toBe(515.27);
    expect(row.refundedAmount).toBe(10);
    expect(row.itemCount).toBe(4);
  });

  it('selects the tracking number the merchant needs for a support email', () => {
    expect(ORDER_LIST_SELECT).toContain('o.tracking_number');
    expect(ORDER_LIST_SELECT).toContain('(CURRENT_DATE - o.created_at::date) AS age_days');
  });
});

describe('mapGrossProfitRow', () => {
  it('reproduces the store-wide all-time figures', () => {
    /*
     * SELECT SUM(oi.quantity*oi.unit_price), SUM(oi.quantity*oi.unit_cost),
     *        SUM(oi.quantity*(oi.unit_price-oi.unit_cost))
     *   FROM order_items oi JOIN orders o ON o.id = oi.order_id
     *  WHERE o.store_id = '650e8400-e29b-41d4-a716-446655440001'
     *    AND o.status <> 'cancelled';
     *  -> 5358.00 | 2972.01 | 2385.99
     */
    const period = mapGrossProfitRow({
      revenue: '5358.00',
      cogs: '2972.01',
      gross_profit: '2385.99',
      order_count: '21',
      units: '53',
    });

    expect(period.revenue).toBe(5358);
    expect(period.cogs).toBe(2972.01);
    expect(period.grossProfit).toBe(2385.99);
    expect(period.marginPct).toBeCloseTo(44.5, 1);
    expect(period.orderCount).toBe(21);
  });

  it('reproduces the trailing-30-day figures', () => {
    // Same query with `AND o.created_at >= NOW() - INTERVAL '30 days'`.
    const period = mapGrossProfitRow({
      revenue: '918.00',
      cogs: '476.77',
      gross_profit: '441.23',
      order_count: '5',
      units: '7',
    });

    expect(period.grossProfit).toBe(441.23);
    expect(period.marginPct).toBeCloseTo(48.1, 1);
  });

  it('divides by revenue, so margin can never exceed 100%', () => {
    /*
     * The valuation report divided by cost and called it margin, reporting
     * 97.3% against a true 49.3% and printing per-row values of 108% and 117%.
     * A margin above 100% is arithmetically impossible; a markup is not.
     */
    const period = mapGrossProfitRow({
      revenue: '43958.00',
      cogs: '22275.99',
      gross_profit: '21682.01',
      order_count: '1',
      units: '1',
    });

    expect(period.marginPct).toBeCloseTo(49.3, 1);
    expect(period.marginPct).toBeLessThan(100);
  });

  it('returns zeroes rather than NaN for a store with no orders', () => {
    const period = mapGrossProfitRow(undefined);
    expect(period).toEqual({
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      marginPct: 0,
      orderCount: 0,
      units: 0,
    });
  });
});

describe('periodDelta', () => {
  it('reports a rise and a fall', () => {
    expect(periodDelta(120, 100)).toBeCloseTo(20);
    expect(periodDelta(80, 100)).toBeCloseTo(-20);
  });

  it('returns null when there is no baseline, instead of a fake +100%', () => {
    /*
     * The seeded store has no non-cancelled orders in the 30 days before the
     * current window, so this is the live case: the dashboard must say "no
     * prior period to compare against" rather than invent a percentage.
     */
    expect(periodDelta(918, 0)).toBeNull();
    expect(periodDelta(0, 0)).toBeNull();
  });
});
