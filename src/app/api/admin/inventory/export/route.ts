import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { 
  convertInventoryToCSV, 
  generateCSVFilename, 
  createCSVDownloadResponse, 
  validateInventoryData, 
  formatInventoryForCSV,
  type InventoryCSVData 
} from '@/lib/utils/csv-export';

/**
 * GET /api/admin/inventory/export
 * Export inventory data as CSV file
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
    const format = searchParams.get('format') || 'csv';

    // Only support CSV format for now
    if (format !== 'csv') {
      return NextResponse.json({
        success: false,
        error: 'Only CSV format is supported'
      }, { status: 400 });
    }

    // Get all products with their inventory data
    const inventoryQuery = `
      SELECT 
        p.id as product_id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.low_stock_threshold,
        p.cost_price as unit_cost,
        p.base_price,
        p.featured_image_url,
        c.name as category,
        p.created_at,
        p.updated_at,
        p.is_active,
        i.available as shipstation_available,
        i.on_hand as shipstation_on_hand,
        i.allocated as shipstation_allocated,
        i.warehouse_id,
        i.warehouse_name,
        i.updated_at as inventory_updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.sku = i.sku AND p.store_id = i.store_id
      WHERE p.store_id = $1
      ORDER BY p.name
    `;

    const inventoryResult = await db.query(inventoryQuery, [user.storeId]);
    const products = inventoryResult.rows;

    // Get sales data for forecasting
    const salesQuery = `
      SELECT 
        oi.product_id,
        oi.product_sku,
        SUM(oi.quantity) as total_sales,
        COUNT(DISTINCT oi.order_id) as total_orders,
        AVG(oi.quantity) as avg_order_quantity,
        MAX(oi.created_at) as last_sale_date,
        COUNT(CASE WHEN oi.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as sales_last_30_days,
        COUNT(CASE WHEN oi.created_at >= NOW() - INTERVAL '90 days' THEN 1 END) as sales_last_90_days,
        AVG(CASE WHEN oi.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity END) as avg_monthly_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.store_id = $1 AND o.status IN ('completed', 'processing')
      GROUP BY oi.product_id, oi.product_sku
    `;

    const salesResult = await db.query(salesQuery, [user.storeId]);
    const salesData = salesResult.rows.reduce((acc, row) => {
      acc[row.product_id] = row;
      return acc;
    }, {} as Record<string, {
      product_id: string;
      product_sku: string;
      total_sales: number;
      total_orders: number;
      avg_order_quantity: number;
      last_sale_date: string;
      sales_last_30_days: number;
      sales_last_90_days: number;
      avg_monthly_sales: number;
    }>);

    // Get recent inventory changes for last restocked dates
    const inventoryLogsQuery = `
      SELECT DISTINCT ON (product_id) 
        product_id,
        created_at as last_restocked,
        change_type,
        quantity_change
      FROM inventory_logs
      WHERE store_id = $1 AND change_type IN ('restock', 'adjustment', 'initial_stock')
      ORDER BY product_id, created_at DESC
    `;

    const inventoryLogsResult = await db.query(inventoryLogsQuery, [user.storeId]);
    const inventoryLogs = inventoryLogsResult.rows.reduce((acc, row) => {
      acc[row.product_id] = row;
      return acc;
    }, {} as Record<string, {
      product_id: string;
      last_restocked: string;
      change_type: string;
      quantity_change: number;
    }>);

    // Transform data into inventory items
    const inventoryItems: InventoryCSVData[] = products.map(product => {
      const sales = salesData[product.product_id] || {};
      const lastRestock = inventoryLogs[product.product_id];
      
      // Calculate stock status
      const stockQuantity = Number(product.stock_quantity) || 0;
      const lowStockThreshold = Number(product.low_stock_threshold) || 10;
      
      let status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';
      if (!product.is_active) {
        status = 'discontinued';
      } else if (stockQuantity === 0) {
        status = 'out_of_stock';
      } else if (stockQuantity <= lowStockThreshold) {
        status = 'low_stock';
      } else {
        status = 'in_stock';
      }

      // Calculate forecasts based on sales history
      const avgMonthlySales = Number(sales.avg_monthly_sales) || 0;
      const salesLast30Days = Number(sales.sales_last_30_days) || 0;
      const salesLast90Days = Number(sales.sales_last_90_days) || 0;
      
      // Simple forecast calculation: recent sales trend
      const forecast30Days = Math.max(salesLast30Days, avgMonthlySales);
      const forecast90Days = Math.max(salesLast90Days, avgMonthlySales * 3);

      // Calculate reorder point (30 days of sales + buffer)
      const reorderPoint = Math.max(forecast30Days + 5, lowStockThreshold);
      const reorderQuantity = Math.max(forecast90Days, 20);

      return {
        id: product.product_id,
        product_id: product.product_id,
        name: product.name,
        sku: product.sku,
        stock_quantity: stockQuantity,
        low_stock_threshold: lowStockThreshold,
        unit_cost: Number(product.unit_cost) || 0,
        base_price: Number(product.base_price) || 0,
        featured_image_url: product.featured_image_url,
        category: product.category || 'Uncategorized',
        supplier: 'ShipStation', // Default supplier
        last_restocked: lastRestock?.last_restocked || null,
        forecast_30_days: forecast30Days,
        forecast_90_days: forecast90Days,
        avg_monthly_sales: avgMonthlySales,
        reorder_point: reorderPoint,
        reorder_quantity: reorderQuantity,
        status,
        warehouse_id: product.warehouse_id,
        warehouse_name: product.warehouse_name,
        shipstation_inventory: product.shipstation_available !== null ? {
          available: Number(product.shipstation_available) || 0,
          on_hand: Number(product.shipstation_on_hand) || 0,
          allocated: Number(product.shipstation_allocated) || 0
        } : undefined
      };
    });

    // Validate inventory data
    const validation = validateInventoryData(inventoryItems);
    if (!validation.isValid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid inventory data',
        details: validation.errors
      }, { status: 400 });
    }

    // Format and convert to CSV
    const formattedData = formatInventoryForCSV(inventoryItems);
    const csvContent = convertInventoryToCSV(formattedData);
    const filename = generateCSVFilename('inventory');
    
    return createCSVDownloadResponse(csvContent, filename);

  } catch (error) {
    console.error('Admin inventory export error:', error);
    
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