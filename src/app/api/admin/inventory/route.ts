import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { inventoryService } from '@/lib/services/inventoryService';
import { 
  convertInventoryToCSV, 
  generateCSVFilename, 
  createCSVDownloadResponse, 
  validateInventoryData, 
  formatInventoryForCSV,
  type InventoryCSVData 
} from '@/lib/utils/csv-export';

interface InventoryItem {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_cost: number;
  base_price: number;
  featured_image_url: string | null;
  category: string;
  supplier: string;
  last_restocked: string | null;
  forecast_30_days: number;
  forecast_90_days: number;
  avg_monthly_sales: number;
  reorder_point: number;
  reorder_quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';
  warehouse_id: string | null;
  warehouse_name: string | null;
  shipstation_inventory?: {
    available: number;
    on_hand: number;
    allocated: number;
  };
}

interface InventoryStats {
  total_products: number;
  total_value: number;
  low_stock_items: number;
  out_of_stock_items: number;
  pending_orders: number;
  this_month_restocked: number;
  average_cost_per_item: number;
  total_on_hand: number;
}

/**
 * GET /api/admin/inventory
 * Get comprehensive inventory data with real-time ShipStation sync
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
    const includeShipStation = searchParams.get('sync') === 'true';
    const exportFormat = searchParams.get('export');

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

    // Get sales data for forecasting with multiple time periods
    const salesQuery = `
      SELECT 
        oi.product_id,
        oi.product_sku,
        SUM(oi.quantity) as total_sales,
        COUNT(DISTINCT oi.order_id) as total_orders,
        AVG(oi.quantity) as avg_order_quantity,
        MAX(oi.created_at) as last_sale_date,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '7 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_7_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '14 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_14_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_30_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '60 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_60_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_90_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '180 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_180_days,
        COALESCE(SUM(CASE WHEN oi.created_at >= NOW() - INTERVAL '365 days' THEN oi.quantity ELSE 0 END), 0) as sales_last_365_days,
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
      sales_last_7_days: number;
      sales_last_14_days: number;
      sales_last_30_days: number;
      sales_last_60_days: number;
      sales_last_90_days: number;
      sales_last_180_days: number;
      sales_last_365_days: number;
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
    const inventoryItems: InventoryItem[] = products.map(product => {
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
        // Include detailed sales velocity data for frontend forecasting
        sales_velocity: {
          total_sales: Number(sales.total_sales) || 0,
          total_orders: Number(sales.total_orders) || 0,
          avg_order_quantity: Number(sales.avg_order_quantity) || 0,
          last_sale_date: sales.last_sale_date || null,
          sales_last_7_days: Number(sales.sales_last_7_days) || 0,
          sales_last_14_days: Number(sales.sales_last_14_days) || 0,
          sales_last_30_days: Number(sales.sales_last_30_days) || 0,
          sales_last_60_days: Number(sales.sales_last_60_days) || 0,
          sales_last_90_days: Number(sales.sales_last_90_days) || 0,
          sales_last_180_days: Number(sales.sales_last_180_days) || 0,
          sales_last_365_days: Number(sales.sales_last_365_days) || 0,
          avg_monthly_sales: avgMonthlySales
        },
        shipstation_inventory: product.shipstation_available !== null ? {
          available: Number(product.shipstation_available) || 0,
          on_hand: Number(product.shipstation_on_hand) || 0,
          allocated: Number(product.shipstation_allocated) || 0
        } : undefined
      };
    });

    // Calculate inventory statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_quantity > low_stock_threshold THEN 1 END) as in_stock_items,
        COUNT(CASE WHEN stock_quantity <= low_stock_threshold AND stock_quantity > 0 THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_items,
        SUM(stock_quantity * COALESCE(cost_price, base_price)) as total_value,
        SUM(stock_quantity) as total_on_hand,
        AVG(COALESCE(cost_price, base_price)) as average_cost_per_item,
        COUNT(CASE WHEN il.created_at >= NOW() - INTERVAL '30 days' AND il.change_type = 'restock' THEN 1 END) as restocked_this_month
      FROM products p
      LEFT JOIN inventory_logs il ON p.id = il.product_id
      WHERE p.store_id = $1
    `;

    const statsResult = await db.query(statsQuery, [user.storeId]);
    const stats = statsResult.rows[0] || {};

    // Get pending purchase orders count (mock for now)
    const pendingOrdersQuery = `
      SELECT COUNT(*) as pending_orders
      FROM orders
      WHERE store_id = $1 AND status IN ('pending', 'processing')
    `;
    const pendingOrdersResult = await db.query(pendingOrdersQuery, [user.storeId]);
    const pendingOrders = Number(pendingOrdersResult.rows[0]?.pending_orders) || 0;

    const inventoryStats: InventoryStats = {
      total_products: Number(stats.total_products) || 0,
      total_value: Number(stats.total_value) || 0,
      low_stock_items: Number(stats.low_stock_items) || 0,
      out_of_stock_items: Number(stats.out_of_stock_items) || 0,
      pending_orders: pendingOrders,
      this_month_restocked: Number(stats.restocked_this_month) || 0,
      average_cost_per_item: Number(stats.average_cost_per_item) || 0,
      total_on_hand: Number(stats.total_on_hand) || 0
    };

    // Handle CSV export
    if (exportFormat === 'csv') {
      const csvData = inventoryItems as InventoryCSVData[];
      const validation = validateInventoryData(csvData);
      
      if (!validation.isValid) {
        return NextResponse.json({
          success: false,
          error: 'Invalid inventory data',
          details: validation.errors
        }, { status: 400 });
      }

      const formattedData = formatInventoryForCSV(csvData);
      const csvContent = convertInventoryToCSV(formattedData);
      const filename = generateCSVFilename('inventory');
      
      return createCSVDownloadResponse(csvContent, filename);
    }

    return NextResponse.json({
      success: true,
      data: {
        inventory: inventoryItems,
        stats: inventoryStats,
        last_updated: new Date().toISOString(),
        shipstation_synced: includeShipStation
      }
    });

  } catch (error) {
    console.error('Admin inventory GET error:', error);
    
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

/**
 * POST /api/admin/inventory/sync
 * Sync inventory data with ShipStation
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const body = await request.json();
    const { action, productId, quantity, notes } = body;

    if (action === 'sync_shipstation') {
      // Get ShipStation integration using the existing pattern
      const integrationResult = await db.query(`
        SELECT api_key_encrypted, is_active
        FROM store_integrations 
        WHERE store_id = $1 AND integration_type = 'shipstation' AND is_active = true
      `, [user.storeId]);

      if (integrationResult.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'ShipStation integration not found or inactive'
        }, { status: 400 });
      }

      const encryptedApiKey = String(integrationResult.rows[0].api_key_encrypted);
      const apiKey = Buffer.from(encryptedApiKey, 'base64').toString('utf-8');

      // Fetch inventory from ShipEngine v2 API with pagination (following existing pattern)
      let allInventory: Array<{
        sku: string;
        available: number;
        on_hand: number;
        allocated: number;
        warehouse_id?: string;
        warehouse_name?: string;
      }> = [];
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const inventoryResponse = await fetch(`https://api.shipstation.com/v2/inventory?page=${page}&page_size=100`, {
          headers: {
            'API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        if (!inventoryResponse.ok) {
          const errorData = await inventoryResponse.json().catch(() => ({}));
          return NextResponse.json({
            success: false,
            error: errorData.message || 'Failed to fetch inventory from ShipEngine'
          }, { status: 500 });
        }
        
        const inventoryData = await inventoryResponse.json();
        allInventory = allInventory.concat(inventoryData.inventory || []);
        
        // Check if there are more pages
        hasMorePages = (inventoryData.inventory?.length || 0) === 100;
        page++;
      }
      
      let addedCount = 0;
      let updatedCount = 0;
      
      // Use inventory service to sync with external system
      const inventoryData = allInventory.map(item => ({
        sku: item.sku,
        available_quantity: item.available || 0,
        allocated_quantity: item.allocated || 0,
        warehouse_id: item.warehouse_id || undefined,
        last_updated: new Date()
      }));
      
      const syncResult = await inventoryService.syncInventoryWithExternalSystem(
        user.storeId,
        inventoryData
      );
      
      if (!syncResult.success) {
        return NextResponse.json({
          success: false,
          error: 'Failed to sync inventory with database',
          details: syncResult.errors
        }, { status: 500 });
      }
      
      addedCount = syncResult.synced;
      updatedCount = syncResult.synced; // The service doesn't distinguish between added/updated

      return NextResponse.json({
        success: true,
        message: 'Inventory synced successfully with ShipStation',
        data: {
          addedCount,
          updatedCount,
          totalCount: addedCount + updatedCount
        }
      });

    } else if (action === 'adjust_inventory' && productId && quantity !== undefined) {
      // Manual inventory adjustment
      const product = await db.query('SELECT * FROM products WHERE id = $1 AND store_id = $2', [productId, user.storeId]);
      
      if (product.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Product not found'
        }, { status: 404 });
      }

      const currentQuantity = Number(product.rows[0].stock_quantity) || 0;
      const newQuantity = Math.max(0, currentQuantity + quantity);
      
      // Update product stock
      await db.query(
        'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQuantity, productId]
      );

      // Log the inventory change
      await db.query(`
        INSERT INTO inventory_logs (
          store_id, product_id, change_type, quantity_change, quantity_after, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user.storeId,
        productId,
        'adjustment',
        quantity,
        newQuantity,
        notes || 'Manual inventory adjustment'
      ]);

      return NextResponse.json({
        success: true,
        message: 'Inventory adjusted successfully',
        old_quantity: currentQuantity,
        new_quantity: newQuantity
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 });

  } catch (error) {
    console.error('Admin inventory POST error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}