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

    // Get product sales data for the period - simplified version without order data
    const salesQuery = `
      SELECT 
        p.id as product_id,
        p.sku,
        p.name,
        COALESCE(c.name, 'Uncategorized') as category,
        p.stock_quantity as current_inventory,
        p.cost_price,
        p.base_price,
        0 as total_sales_quantity, -- No order data available
        0 as total_sales_revenue,  -- No order data available
        0 as cost_of_goods_sold,   -- No order data available
        NULL as last_sale_date,    -- No order data available
        p.stock_quantity as average_inventory, -- Use current inventory as average
        0 as turnover_ratio,       -- No sales data to calculate
        999999 as days_to_sell     -- No sales data available
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.store_id = $1
        AND p.is_active = true
      ORDER BY p.name
    `;

    const salesResult = await db.query(salesQuery, [user.storeId]);

    // Skip daily sales trend data since we don't have order data
    const trendResult = { rows: [] };

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