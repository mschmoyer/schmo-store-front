import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

// Purchase Order Status Types
export type PurchaseOrderStatus = 'pending' | 'approved' | 'shipped' | 'delivered' | 'cancelled';

interface UpdatePurchaseOrderRequest {
  supplier?: string;
  order_date?: string;
  expected_delivery?: string;
  actual_delivery?: string;
  status?: PurchaseOrderStatus;
  notes?: string;
  items?: Array<{
    id?: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
    received_quantity?: number;
  }>;
}

// Interface moved inline where needed to avoid unused import error

/**
 * GET /api/admin/purchase-orders/[id]
 * Get a specific purchase order by ID
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

    const purchaseOrderId = params.id;

    // Get purchase order with items
    const purchaseOrderResult = await db.query(`
      SELECT 
        po.*,
        json_agg(
          json_build_object(
            'id', poi.id,
            'product_id', poi.product_id,
            'product_name', poi.product_name,
            'product_sku', poi.product_sku,
            'quantity', poi.quantity,
            'unit_cost', poi.unit_cost,
            'total_cost', poi.total_cost,
            'received_quantity', poi.received_quantity
          )
        ) as items
      FROM purchase_orders po
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      WHERE po.id = $1 AND po.store_id = $2
      GROUP BY po.id
    `, [purchaseOrderId, user.storeId]);

    if (purchaseOrderResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Purchase order not found'
      }, { status: 404 });
    }

    const purchaseOrder = purchaseOrderResult.rows[0];

    // Get product details for items (for current product info)
    const productIds = purchaseOrder.items.map((item: { product_id?: string }) => item.product_id).filter(Boolean);
    let productDetails = {};
    
    if (productIds.length > 0) {
      const productsResult = await db.query(`
        SELECT id, name, sku, stock_quantity, base_price
        FROM products 
        WHERE id = ANY($1::uuid[]) AND store_id = $2
      `, [productIds, user.storeId]);

      productDetails = productsResult.rows.reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
      }, {});
    }

    // Enrich items with current product info
    const enrichedItems = purchaseOrder.items.map((item: {
      id: string;
      product_id: string;
      product_name: string;
      product_sku: string;
      quantity: number;
      unit_cost: number;
      total_cost: number;
      received_quantity: number;
    }) => {
      const currentProduct = productDetails[item.product_id];
      return {
        ...item,
        current_product: currentProduct || null
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        purchase_order: {
          ...purchaseOrder,
          items: enrichedItems
        }
      }
    });

  } catch (error) {
    console.error('Admin purchase order GET error:', error);
    
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
 * PUT /api/admin/purchase-orders/[id]
 * Update a specific purchase order
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

    const purchaseOrderId = params.id;
    const body: UpdatePurchaseOrderRequest = await request.json();

    // Verify purchase order exists and belongs to store
    const existingPOResult = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2',
      [purchaseOrderId, user.storeId]
    );

    if (existingPOResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Purchase order not found'
      }, { status: 404 });
    }

    // Purchase order exists, proceeding with update

    // Start transaction
    await db.query('BEGIN');

    try {
      // Update purchase order basic info
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (body.supplier !== undefined) {
        updateFields.push(`supplier = $${paramIndex}`);
        updateValues.push(body.supplier);
        paramIndex++;
      }

      if (body.order_date !== undefined) {
        updateFields.push(`order_date = $${paramIndex}`);
        updateValues.push(body.order_date);
        paramIndex++;
      }

      if (body.expected_delivery !== undefined) {
        updateFields.push(`expected_delivery = $${paramIndex}`);
        updateValues.push(body.expected_delivery);
        paramIndex++;
      }

      if (body.actual_delivery !== undefined) {
        updateFields.push(`actual_delivery = $${paramIndex}`);
        updateValues.push(body.actual_delivery);
        paramIndex++;
      }

      if (body.status !== undefined) {
        updateFields.push(`status = $${paramIndex}`);
        updateValues.push(body.status);
        paramIndex++;
      }

      if (body.notes !== undefined) {
        updateFields.push(`notes = $${paramIndex}`);
        updateValues.push(body.notes);
        paramIndex++;
      }

      // Update items if provided
      if (body.items) {
        let subtotal = 0;
        
        // Delete existing items
        await db.query(
          'DELETE FROM purchase_order_items WHERE purchase_order_id = $1',
          [purchaseOrderId]
        );

        // Add new items
        for (const item of body.items) {
          // Get product details
          const productResult = await db.query(
            'SELECT id, name, sku FROM products WHERE id = $1 AND store_id = $2',
            [item.product_id, user.storeId]
          );

          if (productResult.rows.length === 0) {
            throw new Error(`Product not found: ${item.product_id}`);
          }

          const product = productResult.rows[0];
          const totalCost = item.quantity * item.unit_cost;
          subtotal += totalCost;

          await db.query(`
            INSERT INTO purchase_order_items (
              purchase_order_id, product_id, product_name, product_sku,
              quantity, unit_cost, total_cost, received_quantity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            purchaseOrderId,
            item.product_id,
            product.name,
            product.sku,
            item.quantity,
            item.unit_cost,
            totalCost,
            item.received_quantity || 0
          ]);
        }

        // Update totals
        const taxAmount = 0; // TODO: Calculate tax if needed
        const shippingAmount = 0; // TODO: Calculate shipping if needed
        const totalAmount = subtotal + taxAmount + shippingAmount;

        updateFields.push(`subtotal = $${paramIndex}`);
        updateValues.push(subtotal);
        paramIndex++;

        updateFields.push(`total_amount = $${paramIndex}`);
        updateValues.push(totalAmount);
        paramIndex++;
      }

      // Update purchase order if there are changes
      if (updateFields.length > 0) {
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(purchaseOrderId, user.storeId);

        const updateQuery = `
          UPDATE purchase_orders 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex} AND store_id = $${paramIndex + 1}
          RETURNING *
        `;

        const updateResult = await db.query(updateQuery, updateValues);
        
        if (updateResult.rows.length === 0) {
          throw new Error('Failed to update purchase order');
        }
      }

      await db.query('COMMIT');

      // Get updated purchase order with items
      const updatedPOResult = await db.query(`
        SELECT 
          po.*,
          json_agg(
            json_build_object(
              'id', poi.id,
              'product_id', poi.product_id,
              'product_name', poi.product_name,
              'product_sku', poi.product_sku,
              'quantity', poi.quantity,
              'unit_cost', poi.unit_cost,
              'total_cost', poi.total_cost,
              'received_quantity', poi.received_quantity
            )
          ) as items
        FROM purchase_orders po
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        WHERE po.id = $1 AND po.store_id = $2
        GROUP BY po.id
      `, [purchaseOrderId, user.storeId]);

      const updatedPO = updatedPOResult.rows[0];

      return NextResponse.json({
        success: true,
        data: {
          purchase_order: updatedPO,
          message: 'Purchase order updated successfully'
        }
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Admin purchase order PUT error:', error);
    
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
 * DELETE /api/admin/purchase-orders/[id]
 * Delete a specific purchase order
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

    const purchaseOrderId = params.id;

    // Check if purchase order exists and belongs to store
    const existingPOResult = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2',
      [purchaseOrderId, user.storeId]
    );

    if (existingPOResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Purchase order not found'
      }, { status: 404 });
    }

    const existingPO = existingPOResult.rows[0];

    // Check if purchase order can be deleted (business logic)
    if (existingPO.status === 'delivered') {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete delivered purchase orders'
      }, { status: 400 });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Delete purchase order items first (cascade should handle this, but being explicit)
      await db.query(
        'DELETE FROM purchase_order_items WHERE purchase_order_id = $1',
        [purchaseOrderId]
      );

      // Delete purchase order
      const deleteResult = await db.query(
        'DELETE FROM purchase_orders WHERE id = $1 AND store_id = $2 RETURNING *',
        [purchaseOrderId, user.storeId]
      );

      if (deleteResult.rows.length === 0) {
        throw new Error('Failed to delete purchase order');
      }

      await db.query('COMMIT');

      return NextResponse.json({
        success: true,
        data: {
          message: 'Purchase order deleted successfully'
        }
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Admin purchase order DELETE error:', error);
    
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
 * PATCH /api/admin/purchase-orders/[id]
 * Partially update a purchase order (e.g., status change, receive items)
 */
export async function PATCH(
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

    const purchaseOrderId = params.id;
    const body = await request.json();

    // Verify purchase order exists and belongs to store
    const existingPOResult = await db.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2',
      [purchaseOrderId, user.storeId]
    );

    if (existingPOResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Purchase order not found'
      }, { status: 404 });
    }

    // Handle special actions
    if (body.action === 'receive_items') {
      // Handle receiving items and updating inventory
      const { items } = body;
      
      if (!items || !Array.isArray(items)) {
        return NextResponse.json({
          success: false,
          error: 'Items array is required for receive_items action'
        }, { status: 400 });
      }

      await db.query('BEGIN');

      try {
        for (const item of items) {
          if (!item.item_id || !item.received_quantity) {
            continue;
          }

          // Update received quantity in purchase order item
          const updateResult = await db.query(`
            UPDATE purchase_order_items 
            SET received_quantity = $1 
            WHERE id = $2 AND purchase_order_id = $3
            RETURNING product_id, quantity, received_quantity
          `, [item.received_quantity, item.item_id, purchaseOrderId]);

          if (updateResult.rows.length === 0) {
            continue;
          }

          const updatedItem = updateResult.rows[0];
          const productId = updatedItem.product_id;

          // Update product inventory
          await db.query(`
            UPDATE products 
            SET stock_quantity = stock_quantity + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND store_id = $3
          `, [item.received_quantity, productId, user.storeId]);

          // Log inventory change
          await db.query(`
            INSERT INTO inventory_logs (
              store_id, product_id, change_type, quantity_change, 
              quantity_after, reference_type, reference_id, notes
            ) VALUES ($1, $2, $3, $4, 
              (SELECT stock_quantity FROM products WHERE id = $2), 
              $5, $6, $7)
          `, [
            user.storeId,
            productId,
            'restock',
            item.received_quantity,
            'purchase_order',
            purchaseOrderId,
            `Received ${item.received_quantity} units from purchase order`
          ]);
        }

        // Check if all items are fully received and update PO status
        const allItemsResult = await db.query(`
          SELECT 
            COUNT(*) as total_items,
            COUNT(CASE WHEN received_quantity >= quantity THEN 1 END) as fully_received
          FROM purchase_order_items 
          WHERE purchase_order_id = $1
        `, [purchaseOrderId]);

        const itemStats = allItemsResult.rows[0];
        if (itemStats.total_items === itemStats.fully_received) {
          await db.query(`
            UPDATE purchase_orders 
            SET status = 'delivered', 
                actual_delivery = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND store_id = $2
          `, [purchaseOrderId, user.storeId]);
        }

        await db.query('COMMIT');

        return NextResponse.json({
          success: true,
          data: {
            message: 'Items received and inventory updated successfully'
          }
        });

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }

    // Handle regular PATCH updates
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (body.status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(body.status);
      paramIndex++;
    }

    if (body.expected_delivery !== undefined) {
      updateFields.push(`expected_delivery = $${paramIndex}`);
      updateValues.push(body.expected_delivery);
      paramIndex++;
    }

    if (body.actual_delivery !== undefined) {
      updateFields.push(`actual_delivery = $${paramIndex}`);
      updateValues.push(body.actual_delivery);
      paramIndex++;
    }

    if (body.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      updateValues.push(body.notes);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid fields to update'
      }, { status: 400 });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(purchaseOrderId, user.storeId);

    const updateQuery = `
      UPDATE purchase_orders 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND store_id = $${paramIndex + 1}
      RETURNING *
    `;

    const updateResult = await db.query(updateQuery, updateValues);
    
    if (updateResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update purchase order'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        purchase_order: updateResult.rows[0],
        message: 'Purchase order updated successfully'
      }
    });

  } catch (error) {
    console.error('Admin purchase order PATCH error:', error);
    
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