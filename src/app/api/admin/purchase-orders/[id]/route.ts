import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { PurchaseOrderRow } from '@/lib/types/db-rows';
import { requireAuth } from '@/lib/auth/session';

/** A line item as produced by the `json_agg(json_build_object(...))` projection. */
type PurchaseOrderAggregatedItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_cost: string;
  total_cost: string;
  received_quantity: number | null;
};

/** A purchase order row with its aggregated line items. */
type PurchaseOrderWithItemsRow = PurchaseOrderRow & {
  items: Array<PurchaseOrderAggregatedItem | null> | null;
};

/** Current product details attached to each purchase order line. */
type CurrentProductRow = {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number | null;
  base_price: string;
};

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id: purchaseOrderId } = await params;

    // Get purchase order with items
    const purchaseOrderResult = await db.query<PurchaseOrderWithItemsRow>(`
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
            'received_quantity', poi.quantity_received
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
    // `json_agg` over a LEFT JOIN yields `[null]` when the order has no items.
    const orderItems = (purchaseOrder.items ?? []).filter(
      (item): item is PurchaseOrderAggregatedItem => item !== null
    );
    const productIds = orderItems.map(item => item.product_id).filter(Boolean);
    let productDetails: Record<string, CurrentProductRow> = {};
    
    if (productIds.length > 0) {
      const productsResult = await db.query<CurrentProductRow>(`
        SELECT id, name, sku, stock_quantity, base_price
        FROM products 
        WHERE id = ANY($1::uuid[]) AND store_id = $2
      `, [productIds, user.storeId]);

      productDetails = productsResult.rows.reduce<Record<string, CurrentProductRow>>(
        (acc, product) => {
          acc[product.id] = product;
          return acc;
        },
        {}
      );
    }

    // Enrich items with current product info
    const enrichedItems = orderItems.map(item => {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id: purchaseOrderId } = await params;
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

    /* One connection for the whole update. See the note on the DELETE handler below: `BEGIN` on
     * the pool does not make the statements after it a transaction. */
    const updatedOrder = await db.transaction(async (tx) => {
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
        await tx.query(
          'DELETE FROM purchase_order_items WHERE purchase_order_id = $1',
          [purchaseOrderId]
        );

        // Add new items
        for (const item of body.items) {
          // Get product details
          const productResult = await tx.query(
            'SELECT id, name, sku FROM products WHERE id = $1 AND store_id = $2',
            [item.product_id, user.storeId]
          );

          if (productResult.rows.length === 0) {
            throw new Error(`Product not found: ${item.product_id}`);
          }

          const product = productResult.rows[0];
          const totalCost = item.quantity * item.unit_cost;
          subtotal += totalCost;

          await tx.query(`
            INSERT INTO purchase_order_items (
              purchase_order_id, product_id, product_name, product_sku,
              quantity, unit_cost, total_cost, quantity_received
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

        const updateResult = await tx.query(updateQuery, updateValues);
        
        if (updateResult.rows.length === 0) {
          throw new Error('Failed to update purchase order');
        }
      }

      // Get updated purchase order with items
      const updatedPOResult = await tx.query(`
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
              'received_quantity', poi.quantity_received
            )
          ) as items
        FROM purchase_orders po
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        WHERE po.id = $1 AND po.store_id = $2
        GROUP BY po.id
      `, [purchaseOrderId, user.storeId]);

      return updatedPOResult.rows[0];
    });

    return NextResponse.json({
      success: true,
      data: {
        purchase_order: updatedOrder,
        message: 'Purchase order updated successfully'
      }
    });

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id: purchaseOrderId } = await params;

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

    /*
     * `db.transaction` checks out one connection and runs everything on it.
     *
     * `db.query('BEGIN')` on the *pool* begins a transaction on whichever connection that
     * particular call happens to get, and the statements after it go to whichever connections
     * *they* get — so the "transaction" was decorative, and the `ROLLBACK` could roll back an empty
     * one on a third connection while the deletes stayed committed.
     */
    await db.transaction(async (tx) => {
      /* Explicit rather than relying on the cascade, so the receipts go with them. */
      await tx.query('DELETE FROM purchase_order_receiving WHERE purchase_order_id = $1', [
        purchaseOrderId
      ]);
      await tx.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [
        purchaseOrderId
      ]);

      const deleteResult = await tx.query(
        'DELETE FROM purchase_orders WHERE id = $1 AND store_id = $2 RETURNING *',
        [purchaseOrderId, user.storeId]
      );

      if (deleteResult.rows.length === 0) {
        throw new Error('Failed to delete purchase order');
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        message: 'Purchase order deleted successfully'
      }
    });

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id: purchaseOrderId } = await params;
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

    /*
     * `receive_items` is gone, not repaired.
     *
     * It referenced a column called `received_quantity` in two places; the column is
     * `quantity_received`. So it returned 500 for every shape of request, including `{"items":[]}`
     * — the failure was in its trailing status query, so no input ever reached a working path. It
     * went unnoticed because its only caller, the purchase-order detail page, reported every
     * failure as a generic "Failed to receive items".
     *
     * Repairing it would have been worse than removing it. It wrote `stock_quantity` directly,
     * which is the projection the ledger owns; it ran `BEGIN`/`COMMIT` on the *pool* rather than a
     * checked-out client, so the statements between them were not reliably one transaction; it
     * skipped malformed lines and still reported "Items received and inventory updated
     * successfully"; and it echoed raw Postgres messages to the client. All of that already exists,
     * correctly and tested, at `POST /api/admin/purchase-orders/[id]/receive`.
     *
     * 410 rather than 404: the route is here, this way of using it is not, and saying so is what
     * stops someone reimplementing it.
     */
    if (body.action === 'receive_items') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Receiving moved to POST /api/admin/purchase-orders/{id}/receive, which posts to the ' +
            'stock ledger. Send { items: [{ purchase_order_item_id, quantity_received }] } there.'
        },
        { status: 410 }
      );
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