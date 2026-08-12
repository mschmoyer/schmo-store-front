import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database/connection';
import { ProductSalesVelocityRow } from '@/lib/types/db-rows';

/** Product projection driving the reorder recommendations. */
type RecommendationProductRow = {
  product_id: string;
  name: string;
  sku: string;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  unit_cost: string | null;
  base_price: string;
  is_active: boolean | null;
  category: string | null;
};

import { requireAuth } from '@/lib/auth/session';

interface RecommendationItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  current_stock: number;
  reorder_point: number;
  forecast_demand: number;
  recommended_quantity: number;
  unit_cost: number;
  supplier: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  days_until_stockout: number;
  sales_velocity: {
    daily_velocity: number;
    weekly_velocity: number;
    monthly_velocity: number;
    velocity_trend: 'increasing' | 'stable' | 'decreasing';
  };
}

interface SalesVelocity {
  total_sales: number;
  total_orders: number;
  avg_order_quantity: number;
  last_sale_date: string | null;
  sales_last_7_days: number;
  sales_last_14_days: number;
  sales_last_30_days: number;
  sales_last_60_days: number;
  sales_last_90_days: number;
  sales_last_180_days: number;
  sales_last_365_days: number;
  avg_monthly_sales: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'No store associated with user' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Get inventory data with sales velocity
    const inventoryQuery = `
      SELECT 
        p.id as product_id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.low_stock_threshold,
        p.cost_price as unit_cost,
        p.base_price,
        p.is_active,
        c.name as category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.name
    `;

    const inventoryResult = await query<RecommendationProductRow>(inventoryQuery, [user.storeId]);
    const products = inventoryResult.rows;

    /*
     * SALES VELOCITY — THE MISSING TIME DIMENSION.
     *
     * Every window here used to key off `oi.created_at`. That column defaults
     * to CURRENT_TIMESTAMP and is the *insert* time of the line, not the date
     * of the sale: all 119 rows in the seeded store carry a single timestamp
     * while their parent orders span three months, so 114 of 119 rows
     * disagreed with their own order's date. The consequence was that 7-day,
     * 30-day and 90-day sales were **the same number for every SKU** — the
     * "tracks sales velocity across 7, 14, 30, 60, 90, 180 and 365 days"
     * claim was seven copies of one figure.
     *
     * Every window now keys off `o.created_at`, the date the customer bought.
     *
     * Verified: SELECT oi.product_sku, SUM(oi.quantity) AS all_time,
     *   SUM(CASE WHEN o.created_at >= NOW()-INTERVAL '7 days' THEN oi.quantity ELSE 0 END)  AS d7,
     *   SUM(CASE WHEN o.created_at >= NOW()-INTERVAL '30 days' THEN oi.quantity ELSE 0 END) AS d30,
     *   SUM(CASE WHEN o.created_at >= NOW()-INTERVAL '90 days' THEN oi.quantity ELSE 0 END) AS d90
     *   FROM order_items oi JOIN orders o ON o.id = oi.order_id
     *   WHERE o.store_id = '650e8400-…0001' AND o.status <> 'cancelled'
     *   GROUP BY 1;
     *   -> BCA-DSK-1009  all_time 10 | d7 0 | d30 2 | d90 10   (was 7/7/7/7)
     *      BCA-WBL-1012  all_time  7 | d7 0 | d30 3 | d90  7   (was 4/4/4/4)
     *
     * The status filter also widens from `IN ('completed','processing')` to
     * everything not cancelled — a shipped order is a sale, and excluding it
     * understated demand for exactly the SKUs that are moving.
     *
     * `avg_monthly_sales` was `AVG(quantity)` over the 30-day window, i.e. the
     * mean *line size*, not the monthly sales rate. Comparing 30-day sales to
     * it is comparing a sum to an average, which is why "increasing sales
     * trend" fired on a SKU that had sold twice. It is now the true monthly
     * rate: 90 days of demand divided by three.
     */
    const salesQuery = `
      SELECT
        oi.product_id,
        oi.product_sku,
        SUM(oi.quantity) as total_sales,
        COUNT(DISTINCT oi.order_id) as total_orders,
        AVG(oi.quantity) as avg_order_quantity,
        MAX(o.created_at) as last_sale_date,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_7_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '14 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_14_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_30_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '60 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_60_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_90_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '180 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_180_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '365 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_365_days,
        COALESCE(SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END), 0) / 3.0 as avg_monthly_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.store_id = $1 AND o.status <> 'cancelled'
      GROUP BY oi.product_id, oi.product_sku
    `;

    const salesResult = await query<ProductSalesVelocityRow>(salesQuery, [user.storeId]);
    const salesData = salesResult.rows.reduce<Record<string, SalesVelocity>>((acc, row) => {
      acc[row.product_id] = {
        total_sales: Number(row.total_sales) || 0,
        total_orders: Number(row.total_orders) || 0,
        avg_order_quantity: Number(row.avg_order_quantity) || 0,
        last_sale_date: row.last_sale_date?.toISOString() ?? null,
        sales_last_7_days: Number(row.sales_last_7_days) || 0,
        sales_last_14_days: Number(row.sales_last_14_days) || 0,
        sales_last_30_days: Number(row.sales_last_30_days) || 0,
        sales_last_60_days: Number(row.sales_last_60_days) || 0,
        sales_last_90_days: Number(row.sales_last_90_days) || 0,
        sales_last_180_days: Number(row.sales_last_180_days) || 0,
        sales_last_365_days: Number(row.sales_last_365_days) || 0,
        avg_monthly_sales: Number(row.avg_monthly_sales) || 0
      };
      return acc;
    }, {});

    /*
     * Who last supplied each SKU, from purchase order history. DISTINCT ON
     * takes the most recent row per SKU.
     */
    const supplierHistoryResult = await query<{ product_sku: string; supplier_name: string }>(
      `SELECT DISTINCT ON (poi.product_sku)
              poi.product_sku,
              s.name AS supplier_name
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.store_id = $1
        ORDER BY poi.product_sku, po.created_at DESC`,
      [user.storeId]
    );
    const supplierBySku = supplierHistoryResult.rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.product_sku] = row.supplier_name;
      return acc;
    }, {});

    // Generate recommendations
    const recommendations: RecommendationItem[] = [];

    for (const product of products) {
      const sales = salesData[product.product_id] || {
        total_sales: 0,
        total_orders: 0,
        avg_order_quantity: 0,
        last_sale_date: null,
        sales_last_7_days: 0,
        sales_last_14_days: 0,
        sales_last_30_days: 0,
        sales_last_60_days: 0,
        sales_last_90_days: 0,
        sales_last_180_days: 0,
        sales_last_365_days: 0,
        avg_monthly_sales: 0
      };

      const stockQuantity = Number(product.stock_quantity) || 0;
      const lowStockThreshold = Number(product.low_stock_threshold) || 10;
      const unitCost = Number(product.unit_cost) || 0;

      // Calculate sales velocity and forecasting
      const salesLast30Days = Number(sales.sales_last_30_days) || 0;
      const salesLast90Days = Number(sales.sales_last_90_days) || 0;
      const avgMonthlySales = Number(sales.avg_monthly_sales) || 0;
      
      /*
       * Velocity, all derived from ONE rate.
       *
       * These were three independent expressions over different windows and
       * they contradicted each other on screen: Pulse Smartwatch read
       * "0.1/day, 4/week", but 0.1/day is 0.7/week — `dailyVelocity` divided
       * 30-day sales by 30 while `weeklyVelocity` used raw 7-day sales, two
       * different windows presented side by side as if comparable, off by 6x.
       *
       * There is now a single daily rate, and the week and month figures are
       * that rate multiplied out, so they cannot disagree. The rate prefers
       * the 90-day window because a 200-SKU store's 7-day count is mostly
       * zeroes, and falls back to 30 days for a product too new to have 90.
       */
      const dailyVelocity =
        salesLast90Days > 0 ? salesLast90Days / 90
        : salesLast30Days > 0 ? salesLast30Days / 30
        : 0;
      const weeklyVelocity = dailyVelocity * 7;
      const monthlyVelocity = dailyVelocity * 30;
      
      // Determine velocity trend
      let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (salesLast30Days > avgMonthlySales * 1.2) {
        velocityTrend = 'increasing';
      } else if (salesLast30Days < avgMonthlySales * 0.8 && avgMonthlySales > 0) {
        velocityTrend = 'decreasing';
      }

      // Forecasts follow from the same rate.
      const forecast30Days = Math.round(dailyVelocity * 30);
      const forecast90Days = Math.round(dailyVelocity * 90);

      // Calculate reorder point (30 days of sales + buffer)
      const reorderPoint = Math.max(forecast30Days + 5, lowStockThreshold);

      /*
       * THE HARDCODED FLOOR OF 20.
       *
       * Was `Math.max(forecast90Days, 20)`, which made every recommendation
       * in the product exactly 20 units. Arclight LED Desk Lamp has never sold
       * a single unit — no `order_items` row exists for it — so its 90-day
       * forecast is 0 and the app advised buying 20 units at $46.28 = $925.60,
       * badged `high` priority. That is the precise opposite of the correct
       * action, which is to mark it down.
       *
       * The quantity is now demand-derived: enough to cover the forecast plus
       * the reorder buffer, less what is already on the shelf. A product with
       * no demand produces no quantity, and the guard below stops it being
       * recommended at all.
       */
      const reorderQuantity = Math.max(0, Math.round(forecast90Days + reorderPoint - stockQuantity));

      // Calculate days until stockout
      const daysUntilStockout = dailyVelocity > 0 ? Math.floor(stockQuantity / dailyVelocity) : 999;

      // Determine if recommendation is needed
      let needsRecommendation = false;
      let priority: 'urgent' | 'high' | 'medium' | 'low' = 'low';
      let reason = '';
      let confidence: 'high' | 'medium' | 'low' = 'low';

      if (stockQuantity === 0) {
        needsRecommendation = true;
        priority = 'urgent';
        reason = 'Out of stock';
        confidence = 'high';
      } else if (stockQuantity <= lowStockThreshold) {
        needsRecommendation = true;
        priority = 'high';
        reason = 'Below low stock threshold';
        confidence = sales.total_sales > 5 ? 'high' : 'medium';
      } else if (stockQuantity <= reorderPoint) {
        needsRecommendation = true;
        priority = 'high';
        reason = 'Below reorder point';
        confidence = sales.total_sales > 3 ? 'high' : 'medium';
      } else if (forecast30Days > stockQuantity) {
        needsRecommendation = true;
        priority = 'medium';
        reason = 'Forecast demand exceeds current stock';
        confidence = sales.total_sales > 2 ? 'medium' : 'low';
      } else if (daysUntilStockout < 30 && dailyVelocity > 0) {
        needsRecommendation = true;
        priority = 'medium';
        reason = 'Will run out of stock within 30 days';
        confidence = sales.total_sales > 2 ? 'medium' : 'low';
      }

      /*
       * A product with no demand is not a reorder — it is a markdown.
       *
       * The low-stock and out-of-stock branches above fire on stock level
       * alone, which is how the app came to advise $925.60 of a lamp that has
       * never sold one unit. Buying more of something nothing is pulling
       * through is how a small merchant runs out of cash, so a recommendation
       * now requires evidence that the product actually moves.
       */
      if (needsRecommendation && dailyVelocity === 0 && sales.total_sales === 0) {
        needsRecommendation = false;
      }

      // Add seasonal adjustment
      if (needsRecommendation) {
        // avg_monthly_sales is now the true 90-day monthly rate, so this
        // compares the last month against the quarter's run rate rather than
        // comparing two aggregates over the same broken window.
        const recentTrend = avgMonthlySales > 0 && salesLast30Days > avgMonthlySales * 1.2;
        if (recentTrend) {
          reason += ', increasing sales trend';
          if (priority === 'medium') priority = 'high';
        }
      }

      if (needsRecommendation) {
        /*
         * Supplier assignment was `Math.floor(Math.random() * …)` with the
         * comment "random for now" — the merchant was being told to raise a
         * purchase order against a supplier picked by dice, and the pick
         * changed on every refresh. It now comes from the most recent purchase
         * order that actually contained this SKU, and says so plainly when
         * there is no history to go on.
         */
        const supplier = supplierBySku[product.sku] ?? 'No supplier on file';

        recommendations.push({
          product_id: product.product_id,
          product_name: product.name,
          product_sku: product.sku,
          current_stock: stockQuantity,
          reorder_point: reorderPoint,
          forecast_demand: forecast30Days,
          recommended_quantity: reorderQuantity,
          unit_cost: unitCost,
          supplier: supplier,
          confidence: confidence,
          reason: reason,
          priority: priority,
          days_until_stockout: Math.max(0, daysUntilStockout),
          sales_velocity: {
            daily_velocity: Math.round(dailyVelocity * 100) / 100,
            weekly_velocity: Math.round(weeklyVelocity * 100) / 100,
            monthly_velocity: Math.round(monthlyVelocity * 100) / 100,
            velocity_trend: velocityTrend
          }
        });
      }
    }

    // Sort by priority (urgent first, then high, medium, low)
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.days_until_stockout - b.days_until_stockout;
    });

    // Apply limit
    const filteredRecommendations = recommendations.slice(0, limit);

    // Calculate summary statistics
    const urgentCount = recommendations.filter(r => r.priority === 'urgent').length;
    const highCount = recommendations.filter(r => r.priority === 'high').length;
    const estimatedCost = filteredRecommendations.reduce((sum, r) => sum + (r.recommended_quantity * r.unit_cost), 0);

    return NextResponse.json({
      success: true,
      data: {
        recommendations: filteredRecommendations,
        summary: {
          total_recommendations: recommendations.length,
          urgent_items: urgentCount,
          high_priority_items: highCount,
          estimated_cost: estimatedCost
        }
      }
    });

  } catch (error) {
    console.error('Error in recommendations API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}