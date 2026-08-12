/**
 * Order reporting primitives shared by the admin orders API and the dashboard.
 *
 * Everything here exists because the same three decisions were about to be
 * re-made in four places and get made differently each time:
 *
 * 1. **What counts as revenue.** `status = 'completed'` — the filter the
 *    dashboard shipped with — discards every shipped, processing and pending
 *    order, which for the seeded store is 61% of booked value. A merchant does
 *    not think an order they shipped last Tuesday is not revenue. The rule is
 *    `status <> 'cancelled'`; {@link ORDER_REVENUE_STATUSES} is that rule.
 *
 * 2. **What counts as unshipped.** `pending` and `processing`: money taken,
 *    nothing out the door. This is the bucket that needs action on a Monday.
 *
 * 3. **What counts as late.** {@link AGEING_THRESHOLD_DAYS}. Anything unshipped
 *    older than this is a customer who is about to email you.
 */

/** Every status an order row can carry, in workflow order. */
export const ORDER_STATUSES: readonly string[] = [
  'pending',
  'processing',
  'shipped',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Money taken but nothing dispatched. The orders that need a human today.
 */
export const ORDER_UNSHIPPED_STATUSES: readonly OrderStatus[] = ['pending', 'processing'];

/**
 * Statuses that count as booked revenue: everything that was not cancelled.
 *
 * Kept as a list as well as the `<> 'cancelled'` predicate so callers that need
 * an `= ANY()` binding do not hand-roll the set.
 */
export const ORDER_REVENUE_STATUSES: readonly OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'completed',
];

/**
 * Days an order may sit unshipped before the admin calls it out.
 *
 * Seven working days is generous for a store whose pitch is same-week
 * shipping, and it is short enough that the five 61-to-73-day-old orders in the
 * seeded store are impossible to miss rather than merely present in a list.
 */
export const AGEING_THRESHOLD_DAYS = 7;

/**
 * The list projection. Age is computed in SQL rather than in the browser so
 * that "73 days" is the database's answer and not a timezone-dependent
 * subtraction done on a serialised date.
 */
export const ORDER_LIST_SELECT = `
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.fulfillment_status,
    o.payment_status,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_email,
    o.shipping_city,
    o.shipping_state,
    o.total_amount,
    o.refunded_amount,
    o.discount_amount,
    o.tracking_number,
    o.tracking_url,
    o.carrier,
    o.created_at,
    o.shipped_at,
    (CURRENT_DATE - o.created_at::date) AS age_days,
    COALESCE(SUM(oi.quantity), 0)       AS item_count
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;

/** A row as returned by {@link ORDER_LIST_SELECT}. */
export interface OrderListRow {
  [key: string]: unknown;
  id: string;
  order_number: string;
  status: string;
  fulfillment_status: string | null;
  payment_status: string | null;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  shipping_city: string;
  shipping_state: string;
  total_amount: string;
  refunded_amount: string;
  discount_amount: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  created_at: Date | string;
  shipped_at: Date | string | null;
  age_days: string | number;
  item_count: string | number;
}

/** The list shape the admin UI consumes. */
export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string | null;
  paymentStatus: string | null;
  customerName: string;
  customerEmail: string;
  destination: string;
  totalAmount: number;
  refundedAmount: number;
  discountAmount: number;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  createdAt: string;
  shippedAt: string | null;
  ageDays: number;
  itemCount: number;
  /** Unshipped and past {@link AGEING_THRESHOLD_DAYS}. Drives the row warning. */
  isAgeing: boolean;
}

/**
 * Normalise a database row into the shape the list renders.
 *
 * @param row - A row from {@link ORDER_LIST_SELECT}.
 * @returns The camel-cased, number-coerced list item.
 */
export function mapOrderListRow(row: OrderListRow): AdminOrderListItem {
  const ageDays = Number(row.age_days) || 0;
  const unshipped = ORDER_UNSHIPPED_STATUSES.includes(row.status as OrderStatus);

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    fulfillmentStatus: row.fulfillment_status,
    paymentStatus: row.payment_status,
    customerName: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
    customerEmail: row.customer_email,
    destination: [row.shipping_city, row.shipping_state].filter(Boolean).join(', '),
    totalAmount: parseFloat(row.total_amount || '0'),
    refundedAmount: parseFloat(row.refunded_amount || '0'),
    discountAmount: parseFloat(row.discount_amount || '0'),
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    carrier: row.carrier,
    createdAt: new Date(row.created_at).toISOString(),
    shippedAt: row.shipped_at ? new Date(row.shipped_at).toISOString() : null,
    ageDays,
    itemCount: Number(row.item_count) || 0,
    isAgeing: unshipped && ageDays > AGEING_THRESHOLD_DAYS,
  };
}

/**
 * Gross profit over a window, from data the store already has.
 *
 * Two things about this query are deliberate and were wrong before it existed:
 *
 * - **`o.status <> 'cancelled'`**, not `= 'completed'`. See above.
 * - **`COALESCE(oi.unit_cost, p.cost_price)`**. Migration 023 snapshots the
 *   cost onto the line at order time; the fallback covers rows written before
 *   it whose product had no cost on file. Without the snapshot a supplier
 *   price change silently rewrites every historical margin in the admin.
 *
 * Verified against:
 * ```sql
 * SELECT SUM(oi.quantity*oi.unit_price)                      AS revenue,
 *        SUM(oi.quantity*oi.unit_cost)                       AS cogs,
 *        SUM(oi.quantity*(oi.unit_price-oi.unit_cost))       AS gross_profit
 *   FROM order_items oi JOIN orders o ON o.id = oi.order_id
 *  WHERE o.store_id = '650e8400-e29b-41d4-a716-446655440001'
 *    AND o.status <> 'cancelled';
 * -- revenue 5358.00 | cogs 2972.01 | gross_profit 2385.99 | margin 44.5%
 * ```
 *
 * `$1` store id, `$2` inclusive window start (or NULL for all time), `$3`
 * exclusive window end (or NULL for "up to now").
 */
export const GROSS_PROFIT_QUERY = `
  SELECT
    COALESCE(SUM(oi.quantity * oi.unit_price), 0)                    AS revenue,
    COALESCE(SUM(oi.quantity * COALESCE(oi.unit_cost, p.cost_price)), 0)
                                                                     AS cogs,
    COALESCE(SUM(oi.quantity * (oi.unit_price - COALESCE(oi.unit_cost, p.cost_price))), 0)
                                                                     AS gross_profit,
    COUNT(DISTINCT o.id)                                             AS order_count,
    COALESCE(SUM(oi.quantity), 0)                                    AS units
  FROM order_items oi
  JOIN orders   o ON o.id = oi.order_id
  JOIN products p ON p.id = oi.product_id
  WHERE o.store_id = $1
    AND o.status <> 'cancelled'
    AND ($2::timestamp IS NULL OR o.created_at >= $2::timestamp)
    AND ($3::timestamp IS NULL OR o.created_at <  $3::timestamp)
`;

/** A row from {@link GROSS_PROFIT_QUERY}. */
export interface GrossProfitRow {
  [key: string]: unknown;
  revenue: string;
  cogs: string;
  gross_profit: string;
  order_count: string;
  units: string;
}

/** The profit shape the dashboard renders. */
export interface GrossProfitPeriod {
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Gross profit as a share of **revenue**, never of cost. See below. */
  marginPct: number;
  orderCount: number;
  units: number;
}

/**
 * Turn a {@link GROSS_PROFIT_QUERY} row into a period summary.
 *
 * `marginPct` divides by revenue. The valuation report used to divide by cost
 * and call the result "margin", which is how a 49.3% margin was displayed as
 * 97.3% and why rows read 108% and 117% — a margin above 100% is
 * arithmetically impossible and was the tell.
 *
 * @param row - A row from {@link GROSS_PROFIT_QUERY}, possibly undefined.
 * @returns The period summary, zeroed when there are no rows.
 */
export function mapGrossProfitRow(row: GrossProfitRow | undefined): GrossProfitPeriod {
  const revenue = parseFloat(row?.revenue || '0');
  const cogs = parseFloat(row?.cogs || '0');
  const grossProfit = parseFloat(row?.gross_profit || '0');

  return {
    revenue,
    cogs,
    grossProfit,
    marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    orderCount: parseInt(row?.order_count || '0', 10),
    units: parseInt(row?.units || '0', 10),
  };
}

/**
 * Percentage change between two periods, guarding the zero-baseline case.
 *
 * @param current - This period's figure.
 * @param prior - The prior period's figure.
 * @returns The delta as a percentage, or `null` when there is no baseline to
 *   compare against — rendering "+∞%" or "+100%" off a zero prior period is
 *   the kind of confident nonsense this pass is removing.
 */
export function periodDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
