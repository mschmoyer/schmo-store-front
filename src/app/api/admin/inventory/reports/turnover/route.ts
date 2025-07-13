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

    // Get product sales data for the period
    const salesQuery = `
      WITH product_sales AS (
        SELECT 
          p.id as product_id,
          p.sku,
          p.name,
          COALESCE(c.name, 'Uncategorized') as category,
          p.stock_quantity as current_inventory,
          p.cost_price,
          p.base_price,
          COALESCE(SUM(oi.quantity), 0) as total_sales_quantity,
          COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_sales_revenue,
          COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, p.base_price * 0.6)), 0) as cost_of_goods_sold,
          MAX(o.created_at) as last_sale_date
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id 
          AND o.store_id = $1 
          AND o.status IN ('completed', 'shipped', 'processing')
          AND o.created_at BETWEEN $2 AND $3
        WHERE p.store_id = $1
        GROUP BY p.id, p.sku, p.name, p.stock_quantity, p.cost_price, p.base_price, c.name
      ),
      inventory_changes AS (
        -- Get inventory changes from logs as fallback
        SELECT 
          product_id,
          DATE(created_at) as change_date,
          SUM(quantity_change) OVER (PARTITION BY product_id ORDER BY created_at) as running_inventory
        FROM inventory_logs
        WHERE store_id = $1 
          AND created_at <= $3
      ),
      daily_inventory AS (
        -- Get inventory levels from changes
        SELECT DISTINCT ON (product_id, change_date)
          product_id,
          change_date as inventory_date,
          COALESCE(
            running_inventory,
            (SELECT stock_quantity FROM products WHERE id = product_id)
          ) as inventory_level
        FROM inventory_changes
        ORDER BY product_id, change_date
      ),
      average_inventory AS (
        -- Calculate average inventory for the period
        SELECT 
          ps.product_id,
          COALESCE(
            AVG(di.inventory_level),
            -- If no historical data, use current inventory
            ps.current_inventory
          ) as avg_inventory
        FROM product_sales ps
        LEFT JOIN daily_inventory di ON ps.product_id = di.product_id
          AND di.inventory_date BETWEEN $2 AND $3
        GROUP BY ps.product_id, ps.current_inventory
      )
      SELECT 
        ps.*,
        COALESCE(ai.avg_inventory, ps.current_inventory) as average_inventory,
        CASE 
          WHEN COALESCE(ai.avg_inventory, ps.current_inventory) = 0 THEN 0
          ELSE ps.cost_of_goods_sold / COALESCE(ai.avg_inventory, ps.current_inventory)
        END as turnover_ratio,
        CASE 
          WHEN ps.total_sales_quantity = 0 THEN 999999
          ELSE (COALESCE(ai.avg_inventory, ps.current_inventory) / ps.total_sales_quantity) * $4
        END as days_to_sell
      FROM product_sales ps
      LEFT JOIN average_inventory ai ON ps.product_id = ai.product_id
      ORDER BY turnover_ratio DESC
    `;

    const salesResult = await db.query(salesQuery, [
      user.storeId, 
      startDate.toISOString(), 
      endDate.toISOString(),
      daysInPeriod
    ]);

    // Get daily sales trend data for each product
    const trendQuery = `
      WITH daily_sales AS (
        SELECT 
          oi.product_id,
          DATE(o.created_at) as sale_date,
          SUM(oi.quantity) as daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.store_id = $1 
          AND o.status IN ('completed', 'shipped', 'processing')
          AND o.created_at BETWEEN $2 AND $3
        GROUP BY oi.product_id, DATE(o.created_at)
      ),
      date_series AS (
        SELECT generate_series($2::date, $3::date, '1 day'::interval)::date as day
      ),
      product_dates AS (
        SELECT DISTINCT 
          p.id as product_id,
          ds.day
        FROM products p
        CROSS JOIN date_series ds
        WHERE p.store_id = $1
      )
      SELECT 
        pd.product_id,
        pd.day as date,
        COALESCE(ds.daily_sales, 0) as sales,
        (SELECT stock_quantity FROM products WHERE id = pd.product_id) as inventory
      FROM product_dates pd
      LEFT JOIN daily_sales ds ON pd.product_id = ds.product_id AND pd.day = ds.sale_date
      ORDER BY pd.product_id, pd.day
    `;

    const trendResult = await db.query(trendQuery, [
      user.storeId,
      startDate.toISOString(),
      endDate.toISOString()
    ]);

    // Group trend data by product
    const trendDataByProduct = trendResult.rows.reduce((acc, row) => {
      if (!acc[row.product_id]) {
        acc[row.product_id] = [];
      }
      acc[row.product_id].push({
        date: format(new Date(row.date), 'yyyy-MM-dd'),
        sales: Number(row.sales) || 0,
        inventory: Number(row.inventory) || 0
      });
      return acc;
    }, {} as Record<string, Array<{ date: string; sales: number; inventory: number }>>);

    // Process and categorize products
    const turnoverData: TurnoverMetrics[] = salesResult.rows.map(row => {
      const turnoverRatio = Number(row.turnover_ratio) || 0;
      const daysToSell = Number(row.days_to_sell) || 999999;
      const lastSaleDate = row.last_sale_date;
      const daysSinceLastSale = lastSaleDate 
        ? Math.round((new Date().getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
        : 999999;

      // Categorize velocity based on turnover ratio and days since last sale
      let velocityCategory: 'fast' | 'medium' | 'slow' | 'dead';
      if (daysSinceLastSale > 90 || turnoverRatio === 0) {
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
      total_inventory_value: turnoverData.reduce((sum, item) => {
        const unitCost = item.cost_of_goods_sold / Math.max(1, item.total_sales_quantity);
        return sum + (item.current_inventory * unitCost);
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