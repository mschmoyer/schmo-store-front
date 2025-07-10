import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface UpdateInventoryData {
  stock_quantity?: number;
  low_stock_threshold?: number;
  unit_cost?: number;
  reorder_point?: number;
  reorder_quantity?: number;
  supplier?: string;
  adjustment_notes?: string;
  quantity_change?: number;
}

/**
 * GET /api/admin/inventory/[id]
 * Get a specific inventory item by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id } = params;
    
    // Get the specific inventory item
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
      WHERE p.id = $1 AND p.store_id = $2
    `;

    const inventoryResult = await db.query(inventoryQuery, [id, user.storeId]);
    
    if (inventoryResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Inventory item not found'
      }, { status: 404 });
    }

    const product = inventoryResult.rows[0];

    // Get sales data for this product
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
      WHERE oi.product_id = $1 AND o.store_id = $2 AND o.status IN ('completed', 'processing')
      GROUP BY oi.product_id, oi.product_sku
    `;

    const salesResult = await db.query(salesQuery, [id, user.storeId]);
    const sales = salesResult.rows[0] || {};

    // Get last restock info
    const lastRestockQuery = `
      SELECT created_at as last_restocked, change_type, quantity_change
      FROM inventory_logs
      WHERE product_id = $1 AND store_id = $2 AND change_type IN ('restock', 'adjustment', 'initial_stock')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const lastRestockResult = await db.query(lastRestockQuery, [id, user.storeId]);
    const lastRestock = lastRestockResult.rows[0];

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

    // Calculate forecasts
    const avgMonthlySales = Number(sales.avg_monthly_sales) || 0;
    const salesLast30Days = Number(sales.sales_last_30_days) || 0;
    const salesLast90Days = Number(sales.sales_last_90_days) || 0;
    
    const forecast30Days = Math.max(salesLast30Days, avgMonthlySales);
    const forecast90Days = Math.max(salesLast90Days, avgMonthlySales * 3);
    const reorderPoint = Math.max(forecast30Days + 5, lowStockThreshold);
    const reorderQuantity = Math.max(forecast90Days, 20);

    const inventoryItem = {
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
      supplier: 'ShipStation',
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

    return NextResponse.json({
      success: true,
      data: inventoryItem
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
 * PUT /api/admin/inventory/[id]
 * Update a specific inventory item
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id } = params;
    const updateData: UpdateInventoryData = await request.json();

    // Validate the product exists and belongs to the store
    const productQuery = `
      SELECT id, name, sku, stock_quantity, low_stock_threshold, cost_price, base_price
      FROM products 
      WHERE id = $1 AND store_id = $2
    `;
    
    const productResult = await db.query(productQuery, [id, user.storeId]);
    
    if (productResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Build update query dynamically based on provided fields
      const updateFields: string[] = [];
      const updateValues: (string | number)[] = [];
      let valueIndex = 1;

      if (updateData.stock_quantity !== undefined) {
        updateFields.push(`stock_quantity = $${valueIndex++}`);
        updateValues.push(updateData.stock_quantity);
      }

      if (updateData.low_stock_threshold !== undefined) {
        updateFields.push(`low_stock_threshold = $${valueIndex++}`);
        updateValues.push(updateData.low_stock_threshold);
      }

      if (updateData.unit_cost !== undefined) {
        updateFields.push(`cost_price = $${valueIndex++}`);
        updateValues.push(updateData.unit_cost);
      }

      // Always update the timestamp
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updateFields.length > 1) { // More than just updated_at
        const updateQuery = `
          UPDATE products 
          SET ${updateFields.join(', ')}
          WHERE id = $${valueIndex} AND store_id = $${valueIndex + 1}
          RETURNING *
        `;
        updateValues.push(id, user.storeId);

        const updateResult = await db.query(updateQuery, updateValues);
        
        if (updateResult.rows.length === 0) {
          throw new Error('Failed to update product');
        }
      }

      // Log inventory change if stock quantity changed
      if (updateData.stock_quantity !== undefined && updateData.quantity_change !== undefined) {
        const logQuery = `
          INSERT INTO inventory_logs (
            store_id, product_id, change_type, quantity_change, quantity_after, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        await db.query(logQuery, [
          user.storeId,
          id,
          'adjustment',
          updateData.quantity_change,
          updateData.stock_quantity,
          updateData.adjustment_notes || 'Inventory adjustment via admin panel'
        ]);
      }

      // Commit transaction
      await db.query('COMMIT');

      // Get the updated item data
      const updatedItemResponse = await GET(request, { params });
      const updatedItemData = await updatedItemResponse.json();

      return NextResponse.json({
        success: true,
        message: 'Inventory updated successfully',
        data: updatedItemData.data
      });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Admin inventory PUT error:', error);
    
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
 * DELETE /api/admin/inventory/[id]
 * Delete/deactivate an inventory item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id } = params;
    
    // Soft delete by setting is_active to false
    const deleteQuery = `
      UPDATE products 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2
      RETURNING name, sku
    `;
    
    const deleteResult = await db.query(deleteQuery, [id, user.storeId]);
    
    if (deleteResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    const product = deleteResult.rows[0];

    // Log the deactivation
    await db.query(`
      INSERT INTO inventory_logs (
        store_id, product_id, change_type, quantity_change, quantity_after, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      user.storeId,
      id,
      'discontinued',
      0,
      0,
      'Product deactivated via admin panel'
    ]);

    return NextResponse.json({
      success: true,
      message: `Product "${product.name}" has been deactivated`,
      data: { id, name: product.name, sku: product.sku }
    });

  } catch (error) {
    console.error('Admin inventory DELETE error:', error);
    
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