import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

// These interfaces are used in the response structure
// They are typed explicitly for clarity and documentation

interface HistoricalValuePoint {
  date: string;
  total_cost_value: number;
  total_retail_value: number;
  total_quantity: number;
  product_count: number;
}

interface ValuationSummary {
  total_cost_value: number;
  total_retail_value: number;
  total_quantity: number;
  total_products: number;
  average_margin_percentage: number;
  total_potential_profit: number;
}

interface PeriodComparison {
  current_period: ValuationSummary;
  previous_period: ValuationSummary;
  cost_value_change: number;
  cost_value_change_percentage: number;
  retail_value_change: number;
  retail_value_change_percentage: number;
  quantity_change: number;
  quantity_change_percentage: number;
}

/**
 * GET /api/admin/inventory/reports/valuation
 * Calculate inventory valuation metrics
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
    const endDateParam = searchParams.get('endDate');
    const startDateParam = searchParams.get('startDate');
    const compareWithPrevious = searchParams.get('comparePrevious') === 'true';

    // Default to current date if not provided
    const endDate = endDateParam ? endOfDay(new Date(endDateParam)) : endOfDay(new Date());
    const startDate = startDateParam ? startOfDay(new Date(startDateParam)) : startOfDay(subDays(endDate, 30));

    // Calculate current inventory value
    const currentValueQuery = `
      SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COALESCE(SUM(p.stock_quantity), 0) as total_quantity,
        COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)), 0) as total_cost_value,
        COALESCE(SUM(p.stock_quantity * p.base_price), 0) as total_retail_value
      FROM products p
      WHERE p.store_id = $1
        AND p.is_active = true
        AND p.stock_quantity > 0
    `;

    const currentValueResult = await db.query(currentValueQuery, [user.storeId]);
    const currentValue = currentValueResult.rows[0];

    // Get value by category
    const categoryQuery = `
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(p.stock_quantity), 0) as quantity,
        COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)), 0) as cost_value,
        COALESCE(SUM(p.stock_quantity * p.base_price), 0) as retail_value,
        CASE 
          WHEN SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)) = 0 THEN 0
          ELSE ((SUM(p.stock_quantity * p.base_price) - SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6))) / 
                SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6))) * 100
        END as margin_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1
        AND p.is_active = true
        AND p.stock_quantity > 0
      GROUP BY c.name
      ORDER BY cost_value DESC
    `;

    const categoryResult = await db.query(categoryQuery, [user.storeId]);

    // Get value by supplier - wrap in try/catch in case tables don't exist
    let supplierResult;
    try {
      const supplierQuery = `
        SELECT 
          s.id as supplier_id,
          s.name as supplier_name,
          COUNT(DISTINCT p.id) as product_count,
          COALESCE(SUM(p.stock_quantity), 0) as quantity,
          COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)), 0) as cost_value,
          COALESCE(SUM(p.stock_quantity * p.base_price), 0) as retail_value,
          CASE 
            WHEN SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6)) = 0 THEN 0
            ELSE ((SUM(p.stock_quantity * p.base_price) - SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6))) / 
                  SUM(p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6))) * 100
          END as margin_percentage
        FROM products p
        LEFT JOIN purchase_order_items poi ON p.sku = poi.product_sku
        LEFT JOIN purchase_orders po ON poi.purchase_order_id = po.id
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        WHERE p.store_id = $1
          AND p.is_active = true
          AND p.stock_quantity > 0
          AND s.id IS NOT NULL
        GROUP BY s.id, s.name
        ORDER BY cost_value DESC
      `;

      supplierResult = await db.query(supplierQuery, [user.storeId]);
    } catch (error) {
      console.warn('Supplier query failed (likely missing tables):', error);
      // Return empty result if supplier tables don't exist
      supplierResult = { rows: [] };
    }

    // Get value by warehouse
    const warehouseQuery = `
      SELECT 
        i.warehouse_id,
        i.warehouse_name,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(i.on_hand), 0) as quantity,
        COALESCE(SUM(i.on_hand * COALESCE(p.cost_price, p.base_price * 0.6)), 0) as cost_value,
        COALESCE(SUM(i.on_hand * p.base_price), 0) as retail_value
      FROM inventory i
      JOIN products p ON i.sku = p.sku AND i.store_id = p.store_id
      WHERE i.store_id = $1
        AND p.is_active = true
        AND i.on_hand > 0
      GROUP BY i.warehouse_id, i.warehouse_name
      ORDER BY cost_value DESC
    `;

    const warehouseResult = await db.query(warehouseQuery, [user.storeId]);

    // Get top 10 most valuable products
    const topProductsQuery = `
      SELECT 
        p.id as product_id,
        p.sku,
        p.name,
        COALESCE(c.name, 'Uncategorized') as category,
        p.stock_quantity as quantity,
        COALESCE(p.cost_price, p.base_price * 0.6) as cost_price,
        p.base_price as retail_price,
        p.stock_quantity * COALESCE(p.cost_price, p.base_price * 0.6) as total_cost_value,
        p.stock_quantity * p.base_price as total_retail_value,
        CASE 
          WHEN COALESCE(p.cost_price, p.base_price * 0.6) = 0 THEN 0
          ELSE ((p.base_price - COALESCE(p.cost_price, p.base_price * 0.6)) / COALESCE(p.cost_price, p.base_price * 0.6)) * 100
        END as margin_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1
        AND p.is_active = true
        AND p.stock_quantity > 0
      ORDER BY total_cost_value DESC
      LIMIT 10
    `;

    const topProductsResult = await db.query(topProductsQuery, [user.storeId]);

    // Get historical value trend from inventory_snapshots
    const historicalQuery = `
      SELECT 
        snapshot_date::date as date,
        total_cost_value,
        total_retail_value,
        total_quantity,
        total_products as product_count
      FROM inventory_snapshots
      WHERE store_id = $1
        AND snapshot_date >= $2
        AND snapshot_date <= $3
      ORDER BY snapshot_date ASC
    `;

    const historicalResult = await db.query(historicalQuery, [user.storeId, startDate, endDate]);

    // If no historical data, create a single point with current values
    const historicalData: HistoricalValuePoint[] = historicalResult.rows.length > 0
      ? historicalResult.rows.map(row => ({
          date: format(new Date(row.date), 'yyyy-MM-dd'),
          total_cost_value: Number(row.total_cost_value) || 0,
          total_retail_value: Number(row.total_retail_value) || 0,
          total_quantity: Number(row.total_quantity) || 0,
          product_count: Number(row.product_count) || 0
        }))
      : [{
          date: format(endDate, 'yyyy-MM-dd'),
          total_cost_value: Number(currentValue.total_cost_value) || 0,
          total_retail_value: Number(currentValue.total_retail_value) || 0,
          total_quantity: Number(currentValue.total_quantity) || 0,
          product_count: Number(currentValue.total_products) || 0
        }];

    // Calculate summary
    const summary: ValuationSummary = {
      total_cost_value: Number(currentValue.total_cost_value) || 0,
      total_retail_value: Number(currentValue.total_retail_value) || 0,
      total_quantity: Number(currentValue.total_quantity) || 0,
      total_products: Number(currentValue.total_products) || 0,
      average_margin_percentage: currentValue.total_cost_value > 0
        ? ((Number(currentValue.total_retail_value) - Number(currentValue.total_cost_value)) / Number(currentValue.total_cost_value)) * 100
        : 0,
      total_potential_profit: Number(currentValue.total_retail_value) - Number(currentValue.total_cost_value)
    };

    // Period comparison if requested
    let periodComparison: PeriodComparison | null = null;
    if (compareWithPrevious) {
      const periodLength = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const previousEndDate = subDays(endDate, periodLength);

      const previousQuery = `
        SELECT 
          COALESCE(total_cost_value, 0) as total_cost_value,
          COALESCE(total_retail_value, 0) as total_retail_value,
          COALESCE(total_quantity, 0) as total_quantity,
          COALESCE(total_products, 0) as total_products
        FROM inventory_snapshots
        WHERE store_id = $1
          AND snapshot_date::date = $2::date
        ORDER BY snapshot_date DESC
        LIMIT 1
      `;

      const previousResult = await db.query(previousQuery, [user.storeId, previousEndDate]);
      
      if (previousResult.rows.length > 0) {
        const previous = previousResult.rows[0];
        const previousSummary: ValuationSummary = {
          total_cost_value: Number(previous.total_cost_value) || 0,
          total_retail_value: Number(previous.total_retail_value) || 0,
          total_quantity: Number(previous.total_quantity) || 0,
          total_products: Number(previous.total_products) || 0,
          average_margin_percentage: previous.total_cost_value > 0
            ? ((Number(previous.total_retail_value) - Number(previous.total_cost_value)) / Number(previous.total_cost_value)) * 100
            : 0,
          total_potential_profit: Number(previous.total_retail_value) - Number(previous.total_cost_value)
        };

        periodComparison = {
          current_period: summary,
          previous_period: previousSummary,
          cost_value_change: summary.total_cost_value - previousSummary.total_cost_value,
          cost_value_change_percentage: previousSummary.total_cost_value > 0
            ? ((summary.total_cost_value - previousSummary.total_cost_value) / previousSummary.total_cost_value) * 100
            : 0,
          retail_value_change: summary.total_retail_value - previousSummary.total_retail_value,
          retail_value_change_percentage: previousSummary.total_retail_value > 0
            ? ((summary.total_retail_value - previousSummary.total_retail_value) / previousSummary.total_retail_value) * 100
            : 0,
          quantity_change: summary.total_quantity - previousSummary.total_quantity,
          quantity_change_percentage: previousSummary.total_quantity > 0
            ? ((summary.total_quantity - previousSummary.total_quantity) / previousSummary.total_quantity) * 100
            : 0
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        summary,
        by_category: categoryResult.rows.map(row => ({
          category: row.category,
          cost_value: Number(row.cost_value) || 0,
          retail_value: Number(row.retail_value) || 0,
          quantity: Number(row.quantity) || 0,
          product_count: Number(row.product_count) || 0,
          margin_percentage: Number(row.margin_percentage) || 0
        })),
        by_supplier: supplierResult.rows.map(row => ({
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name,
          cost_value: Number(row.cost_value) || 0,
          retail_value: Number(row.retail_value) || 0,
          quantity: Number(row.quantity) || 0,
          product_count: Number(row.product_count) || 0,
          margin_percentage: Number(row.margin_percentage) || 0
        })),
        by_warehouse: warehouseResult.rows.map(row => ({
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse_name,
          cost_value: Number(row.cost_value) || 0,
          retail_value: Number(row.retail_value) || 0,
          quantity: Number(row.quantity) || 0,
          product_count: Number(row.product_count) || 0
        })),
        top_products: topProductsResult.rows.map(row => ({
          product_id: row.product_id,
          sku: row.sku,
          name: row.name,
          category: row.category,
          quantity: Number(row.quantity) || 0,
          cost_price: Number(row.cost_price) || 0,
          retail_price: Number(row.retail_price) || 0,
          total_cost_value: Number(row.total_cost_value) || 0,
          total_retail_value: Number(row.total_retail_value) || 0,
          margin_percentage: Number(row.margin_percentage) || 0
        })),
        historical_trend: historicalData,
        period_comparison: periodComparison,
        period: {
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd')
        }
      }
    });

  } catch (error) {
    console.error('Inventory valuation report error:', error);
    
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