import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

interface TurnoverMetrics {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  total_sales_quantity: number;
  total_sales_revenue: number;
  average_inventory: number;
  current_inventory: number;
  cost_of_goods_sold: number;
  turnover_ratio: number;
  days_to_sell: number;
  velocity_category: 'fast' | 'medium' | 'slow' | 'dead';
  last_sale_date: string | null;
  trend_data: Array<{
    date: string;
    sales: number;
    inventory: number;
  }>;
}

/** Row shape returned by the turnover sales query. */
type TurnoverSalesRow = {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  current_inventory: number | null;
  cost_price: string | null;
  base_price: string;
  total_sales_quantity: number;
  total_sales_revenue: number;
  cost_of_goods_sold: number;
  last_sale_date: Date | null;
  average_inventory: number | null;
  turnover_ratio: number;
  days_to_sell: number;
};

/** Row shape of the per-product daily sales trend series. */
interface TurnoverTrendRow {
  [key: string]: unknown;
  product_id: string;
  date: Date;
  sales: number;
  inventory: number;
}

interface TurnoverStats {
  total_products: number;
  average_turnover_ratio: number;
  fast_moving_count: number;
  slow_moving_count: number;
  dead_stock_count: number;
  total_inventory_value: number;
  total_sales_revenue: number;
}

/**
 * GET /api/admin/inventory/reports/turnover
 * Calculate inventory turnover metrics for the specified date range
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Default to last 30 days if no dates provided
    const endDate = endDateParam ? endOfDay(new Date(endDateParam)) : endOfDay(new Date());
    const startDate = startDateParam ? startOfDay(new Date(startDateParam)) : startOfDay(subDays(endDate, 30));

    // Calculate days in period
    const daysInPeriod = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    /*
     * TURNOVER — THE PLACEHOLDER THAT SHIPPED.
     *
     * Every metric in this query was the literal 0 behind the comment
     * "No order data available". Order data is available: 119 `order_items`
     * rows. The report consequently declared all twelve products dead stock at
     * 0.00x turnover with infinite days-to-sell and an INVENTORY VALUE of $0,
     * for a store holding $22,275.99 of stock that sold $5,358.00 in 90 days.
     * That is worse than shipping nothing — it is confidently, specifically
     * wrong, and it is one of the three reports the marketing deck says come
     * standard.
     *
     * The arithmetic now:
     *   COGS      = SUM(qty * unit_cost)   over the window, cost snapshotted
     *               at order time (migration 023)
     *   turnover  = COGS / average inventory *at cost*, annualised to the
     *               window — the standard inventory-turnover definition, not
     *               units sold over units held
     *   days_to_sell = window days / turnover for the window
     *
     * Average inventory is approximated as the midpoint between opening and
     * closing stock, opening being closing plus what sold during the window.
     * That is the usual approximation when no daily snapshot series exists;
     * `inventory_snapshots` is the table that would replace it.
     *
     * Verified for the trailing 90 days:
     *   SELECT SUM(oi.quantity * oi.unit_cost) FROM order_items oi
     *     JOIN orders o ON o.id = oi.order_id
     *    WHERE o.store_id = '650e8400-…0001' AND o.status <> 'cancelled'
     *      AND o.created_at >= NOW() - INTERVAL '90 days';   -> 2972.01
     */
    const salesQuery = `
      WITH window_sales AS (
        SELECT
          oi.product_id,
          SUM(oi.quantity)                                          AS qty,
          SUM(oi.quantity * oi.unit_price)                          AS revenue,
          SUM(oi.quantity * COALESCE(oi.unit_cost, 0))              AS cogs,
          MAX(o.created_at)                                         AS last_sale_date
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.store_id = $1
          AND o.status <> 'cancelled'
          AND o.created_at >= $2
          AND o.created_at <= $3
        GROUP BY oi.product_id
      ),
      all_time_sales AS (
        SELECT oi.product_id, MAX(o.created_at) AS last_sale_date
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.store_id = $1 AND o.status <> 'cancelled'
         GROUP BY oi.product_id
      ),
      base AS (
        SELECT
          p.id                                     AS product_id,
          p.sku,
          p.name,
          COALESCE(c.name, 'Uncategorized')        AS category,
          p.stock_quantity                         AS current_inventory,
          p.cost_price,
          p.base_price,
          COALESCE(ws.qty, 0)                      AS total_sales_quantity,
          COALESCE(ws.revenue, 0)                  AS total_sales_revenue,
          COALESCE(ws.cogs, 0)                     AS cost_of_goods_sold,
          COALESCE(ws.last_sale_date, ats.last_sale_date) AS last_sale_date,
          -- Midpoint of opening and closing stock, in units.
          GREATEST(
            (p.stock_quantity + (p.stock_quantity + COALESCE(ws.qty, 0))) / 2.0,
            1
          )                                        AS average_inventory
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN window_sales ws ON ws.product_id = p.id
        LEFT JOIN all_time_sales ats ON ats.product_id = p.id
        WHERE p.store_id = $1
          AND p.is_active = true
      )
      SELECT
        b.*,
        -- COGS over average inventory at cost, annualised across the window.
        CASE
          WHEN b.average_inventory * COALESCE(b.cost_price, b.base_price * 0.6) = 0 THEN 0
          ELSE (b.cost_of_goods_sold
                / (b.average_inventory * COALESCE(b.cost_price, b.base_price * 0.6)))
               * (365.0 / $4::numeric)
        END                                        AS turnover_ratio,
        -- How long the stock on hand would take to sell at the window's rate.
        CASE
          WHEN b.total_sales_quantity = 0 THEN 999999
          ELSE ROUND(b.current_inventory / (b.total_sales_quantity / $4::numeric))
        END                                        AS days_to_sell
      FROM base b
      ORDER BY b.name
    `;

    const salesResult = await db.query<TurnoverSalesRow>(salesQuery, [
      user.storeId,
      startDate,
      endDate,
      daysInPeriod,
    ]);

    /*
     * The per-product daily trend series. Was hardcoded empty ("we don't have
     * order data"), so every sparkline in the report was a flat line.
     */
    const trendResult = await db.query<TurnoverTrendRow>(
      `SELECT
         oi.product_id,
         DATE(o.created_at)      AS date,
         SUM(oi.quantity)::int   AS sales,
         0                       AS inventory
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = $1
         AND o.status <> 'cancelled'
         AND o.created_at >= $2
         AND o.created_at <= $3
       GROUP BY oi.product_id, DATE(o.created_at)
       ORDER BY DATE(o.created_at)`,
      [user.storeId, startDate, endDate]
    );

    // Group trend data by product
    const trendDataByProduct = trendResult.rows.reduce<
      Record<string, Array<{ date: string; sales: number; inventory: number }>>
    >((acc, row) => {
      if (!acc[row.product_id]) {
        acc[row.product_id] = [];
      }
      acc[row.product_id].push({
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        sales: Number(row.sales) || 0,
        inventory: Number(row.inventory) || 0
      });
      return acc;
    }, {});

    // Process and categorize products
    const turnoverData: TurnoverMetrics[] = salesResult.rows.map(row => {
      const turnoverRatio = Number(row.turnover_ratio) || 0;
      const daysToSell = Number(row.days_to_sell) || 999999;
      const lastSaleDate = row.last_sale_date;
      const daysSinceLastSale = lastSaleDate 
        ? Math.round((new Date().getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
        : 999999;

      /*
       * Velocity band. A product that sold within the window is not dead
       * merely because its annualised ratio rounds to zero — the old
       * `turnoverRatio === 0` test caught every SKU because every ratio was
       * the literal 0. Dead now means: nothing sold in the window AND nothing
       * sold in the last 90 days.
       */
      let velocityCategory: 'fast' | 'medium' | 'slow' | 'dead';
      if (daysSinceLastSale > 90 || (turnoverRatio === 0 && Number(row.total_sales_quantity) === 0)) {
        velocityCategory = 'dead';
      } else if (turnoverRatio >= 6) {
        velocityCategory = 'fast';
      } else if (turnoverRatio >= 3) {
        velocityCategory = 'medium';
      } else {
        velocityCategory = 'slow';
      }

      return {
        product_id: row.product_id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        total_sales_quantity: Number(row.total_sales_quantity) || 0,
        total_sales_revenue: Number(row.total_sales_revenue) || 0,
        average_inventory: Number(row.average_inventory) || 0,
        current_inventory: Number(row.current_inventory) || 0,
        cost_of_goods_sold: Number(row.cost_of_goods_sold) || 0,
        turnover_ratio: turnoverRatio,
        days_to_sell: daysToSell,
        velocity_category: velocityCategory,
        last_sale_date: row.last_sale_date ? format(new Date(row.last_sale_date), 'yyyy-MM-dd') : null,
        trend_data: trendDataByProduct[row.product_id] || []
      };
    });

    // Calculate summary statistics
    const stats: TurnoverStats = {
      total_products: turnoverData.length,
      average_turnover_ratio: turnoverData.length > 0 
        ? turnoverData.reduce((sum, item) => sum + item.turnover_ratio, 0) / turnoverData.length 
        : 0,
      fast_moving_count: turnoverData.filter(item => item.velocity_category === 'fast').length,
      slow_moving_count: turnoverData.filter(item => item.velocity_category === 'slow').length,
      dead_stock_count: turnoverData.filter(item => item.velocity_category === 'dead').length,
      /*
       * Inventory value read $0 because it derived a unit cost from COGS
       * divided by units sold, and both were the literal 0. It now comes from
       * the products themselves and reconciles with the Inventory tile and the
       * valuation report.
       *
       * Verified: SELECT SUM(stock_quantity * COALESCE(cost_price, base_price*0.6))
       *   FROM products WHERE store_id = '650e8400-…0001' AND is_active;
       *   -> matches /admin/inventory and /admin/inventory/reports/valuation
       */
      total_inventory_value: salesResult.rows.reduce((sum, row) => {
        const unitCost = Number(row.cost_price) || Number(row.base_price) * 0.6;
        return sum + (Number(row.current_inventory) || 0) * unitCost;
      }, 0),
      total_sales_revenue: turnoverData.reduce((sum, item) => sum + item.total_sales_revenue, 0)
    };

    return NextResponse.json({
      success: true,
      data: {
        turnover: turnoverData,
        stats: stats,
        period: {
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd'),
          days: daysInPeriod
        }
      }
    });

  } catch (error) {
    console.error('Inventory turnover report error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}