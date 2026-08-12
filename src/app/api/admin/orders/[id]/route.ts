import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { AGEING_THRESHOLD_DAYS, ORDER_UNSHIPPED_STATUSES, type OrderStatus } from '@/lib/services/orders';

/** An order row plus the derived fields the detail view needs. */
interface OrderDetailRow {
  [key: string]: unknown;
  id: string;
  order_number: string;
  status: string;
  total_amount: string;
  created_at: Date | string;
  age_days: string | number;
}

/** One line of the order, with its cost snapshot resolved. */
interface OrderItemRow {
  [key: string]: unknown;
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_image_url: string | null;
  unit_price: string;
  unit_cost: string | null;
  quantity: number;
  total_price: string;
  discount_amount: string | null;
}

/**
 * GET /api/admin/orders/[id]
 *
 * One order: the customer, the destination, the lines with their per-line
 * margin, the tracking number, and the coupon that was redeemed against it.
 *
 * Per-line profit uses `COALESCE(oi.unit_cost, p.cost_price)` — the cost
 * snapshot written by migration 023, falling back to the product's current
 * cost for lines predating it.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @param context - Route params carrying the order id.
 * @returns `{ success, data: { order, items, coupon } }`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;

    // Scoped by store_id as well as id so one merchant cannot read another's
    // order by guessing a uuid.
    const orderResult = await db.query<OrderDetailRow>(
      `SELECT o.*, (CURRENT_DATE - o.created_at::date) AS age_days
         FROM orders o
        WHERE o.id = $1 AND o.store_id = $2`,
      [id, user.storeId]
    );

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const [itemsResult, couponResult] = await Promise.all([
      db.query<OrderItemRow>(
        `SELECT
           oi.id,
           oi.product_id,
           oi.product_sku,
           oi.product_name,
           oi.product_image_url,
           oi.unit_price,
           COALESCE(oi.unit_cost, p.cost_price) AS unit_cost,
           oi.quantity,
           oi.total_price,
           oi.discount_amount
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1
        ORDER BY oi.product_name`,
        [id]
      ),

      db.query<{ code: string; discount_amount: string; used_at: Date | string }>(
        `SELECT c.code, cu.discount_amount, cu.used_at
           FROM coupon_usage cu
           JOIN coupons c ON c.id = cu.coupon_id
          WHERE cu.order_id = $1`,
        [id]
      ),
    ]);

    const order = orderResult.rows[0];
    const ageDays = Number(order.age_days) || 0;

    const items = itemsResult.rows.map((row) => {
      const unitPrice = parseFloat(row.unit_price || '0');
      const unitCost = row.unit_cost === null ? null : parseFloat(row.unit_cost);
      const quantity = Number(row.quantity) || 0;
      const lineRevenue = parseFloat(row.total_price || '0');
      const lineProfit = unitCost === null ? null : (unitPrice - unitCost) * quantity;

      return {
        id: row.id,
        productId: row.product_id,
        sku: row.product_sku,
        name: row.product_name,
        imageUrl: row.product_image_url,
        unitPrice,
        unitCost,
        quantity,
        lineTotal: lineRevenue,
        discountAmount: parseFloat(row.discount_amount || '0'),
        lineProfit,
        // Margin on revenue, not on cost.
        marginPct: lineProfit !== null && lineRevenue > 0 ? (lineProfit / lineRevenue) * 100 : null,
      };
    });

    const knownCostLines = items.filter((line) => line.lineProfit !== null);
    const itemsRevenue = knownCostLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const itemsProfit = knownCostLines.reduce((sum, line) => sum + (line.lineProfit ?? 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        order: {
          ...order,
          age_days: ageDays,
          is_ageing:
            ORDER_UNSHIPPED_STATUSES.includes(order.status as OrderStatus) &&
            ageDays > AGEING_THRESHOLD_DAYS,
          ageing_threshold_days: AGEING_THRESHOLD_DAYS,
        },
        items,
        profit: {
          revenue: itemsRevenue,
          grossProfit: itemsProfit,
          marginPct: itemsRevenue > 0 ? (itemsProfit / itemsRevenue) * 100 : 0,
          // True when a line had no cost on file, so the figure understates.
          partial: knownCostLines.length !== items.length,
        },
        coupon: couponResult.rows[0]
          ? {
              code: couponResult.rows[0].code,
              discountAmount: parseFloat(couponResult.rows[0].discount_amount || '0'),
              usedAt: new Date(couponResult.rows[0].used_at).toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Admin order detail GET error:', error);

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
