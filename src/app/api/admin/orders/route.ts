import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import {
  AGEING_THRESHOLD_DAYS,
  ORDER_LIST_SELECT,
  ORDER_STATUSES,
  ORDER_UNSHIPPED_STATUSES,
  mapOrderListRow,
  type OrderListRow,
} from '@/lib/services/orders';

/**
 * GET /api/admin/orders
 *
 * The orders list. Until this route existed there was no screen anywhere in the
 * admin that showed an order, which meant a merchant could not see what was
 * unshipped, could not look up a tracking number to answer "where is my
 * package?", and could not tell that five orders had been sitting in
 * `processing` for two months.
 *
 * Query parameters
 * ----------------
 * - `status`     one of {@link ORDER_STATUSES}, or `unshipped` for the
 *                pending+processing bucket that actually needs action.
 * - `ageing`     `true` to restrict to unshipped orders older than
 *                {@link AGEING_THRESHOLD_DAYS}.
 * - `search`     order number, customer name, email, or tracking number.
 * - `page`       1-based. `limit` defaults to 25.
 *
 * The response also carries a `summary` block computed over the whole store,
 * not the current page, so the tiles do not change when you paginate.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @returns `{ success, data: { orders, pagination, summary } }`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || '';
    const search = (searchParams.get('search') || '').trim();
    const ageingOnly = searchParams.get('ageing') === 'true';

    const conditions: string[] = ['o.store_id = $1'];
    const params: (string | number)[] = [user.storeId];
    let i = 2;

    if (status === 'unshipped') {
      conditions.push(`o.status = ANY($${i}::text[])`);
      params.push(`{${ORDER_UNSHIPPED_STATUSES.join(',')}}`);
      i++;
    } else if (status && ORDER_STATUSES.includes(status)) {
      conditions.push(`o.status = $${i}`);
      params.push(status);
      i++;
    }

    if (ageingOnly) {
      conditions.push(
        `o.status = ANY($${i}::text[]) AND o.created_at < CURRENT_DATE - $${i + 1}::int`
      );
      params.push(`{${ORDER_UNSHIPPED_STATUSES.join(',')}}`, AGEING_THRESHOLD_DAYS);
      i += 2;
    }

    if (search) {
      conditions.push(`(
        o.order_number ILIKE $${i}
        OR o.customer_email ILIKE $${i}
        OR (o.customer_first_name || ' ' || o.customer_last_name) ILIKE $${i}
        OR o.tracking_number ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countResult, ordersResult, summaryResult] = await Promise.all([
      db.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM orders o ${where}`,
        params
      ),

      // Oldest-unshipped-first is the ordering that matches the job: the thing
      // that has been waiting longest is the thing to deal with. Everything
      // else falls back to newest-first.
      db.query<OrderListRow>(
        `${ORDER_LIST_SELECT}
         ${where}
         GROUP BY o.id
         ORDER BY
           CASE WHEN o.status IN ('pending', 'processing') THEN 0 ELSE 1 END,
           CASE WHEN o.status IN ('pending', 'processing') THEN o.created_at END ASC,
           o.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),

      // Store-wide summary. Verified against:
      //   SELECT status, count(*), sum(total_amount) FROM orders
      //   WHERE store_id = '650e8400-…0001' GROUP BY status;
      //   -> cancelled 6/723.68, completed 8/2174.05, pending 1/654.91,
      //      processing 4/1291.64, shipped 8/1467.51
      // Booked value excludes cancellations only (a shipped order is revenue);
      // the five unshipped orders total $1,946.55 and are 61-73 days old.
      db.query<{
        total_orders: string;
        booked_value: string;
        unshipped_count: string;
        unshipped_value: string;
        ageing_count: string;
        ageing_value: string;
        oldest_unshipped_days: string | null;
        awaiting_tracking: string;
      }>(
        `SELECT
           COUNT(*)                                                        AS total_orders,
           COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'), 0)
                                                                           AS booked_value,
           COUNT(*) FILTER (WHERE status = ANY($2::text[]))                AS unshipped_count,
           COALESCE(SUM(total_amount) FILTER (WHERE status = ANY($2::text[])), 0)
                                                                           AS unshipped_value,
           COUNT(*) FILTER (
             WHERE status = ANY($2::text[])
               AND created_at < CURRENT_DATE - $3::int
           )                                                               AS ageing_count,
           COALESCE(SUM(total_amount) FILTER (
             WHERE status = ANY($2::text[])
               AND created_at < CURRENT_DATE - $3::int
           ), 0)                                                           AS ageing_value,
           MAX(CURRENT_DATE - created_at::date) FILTER (WHERE status = ANY($2::text[]))
                                                                           AS oldest_unshipped_days,
           COUNT(*) FILTER (
             WHERE status IN ('shipped', 'completed') AND tracking_number IS NULL
           )                                                               AS awaiting_tracking
         FROM orders
         WHERE store_id = $1`,
        [user.storeId, `{${ORDER_UNSHIPPED_STATUSES.join(',')}}`, AGEING_THRESHOLD_DAYS]
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0', 10);
    const s = summaryResult.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        orders: ordersResult.rows.map(mapOrderListRow),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
        summary: {
          totalOrders: parseInt(s?.total_orders || '0', 10),
          bookedValue: parseFloat(s?.booked_value || '0'),
          unshippedCount: parseInt(s?.unshipped_count || '0', 10),
          unshippedValue: parseFloat(s?.unshipped_value || '0'),
          ageingCount: parseInt(s?.ageing_count || '0', 10),
          ageingValue: parseFloat(s?.ageing_value || '0'),
          oldestUnshippedDays: s?.oldest_unshipped_days
            ? parseInt(s.oldest_unshipped_days, 10)
            : 0,
          awaitingTracking: parseInt(s?.awaiting_tracking || '0', 10),
          ageingThresholdDays: AGEING_THRESHOLD_DAYS,
        },
      },
    });
  } catch (error) {
    console.error('Admin orders GET error:', error);

    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
