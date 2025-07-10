import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import { PurchaseOrder, CreatePurchaseOrderInput, PaginatedResponse } from '@/lib/types/database';

/**
 * GET /api/admin/purchase-orders
 * 
 * Retrieves purchase orders with pagination and filtering
 * 
 * @param request - Next.js request object
 * @returns Paginated purchase orders response
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const supplier_id = searchParams.get('supplier_id');
    const store_id = searchParams.get('store_id');
    const offset = (page - 1) * limit;

    // Build query conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`po.status = $${paramIndex++}`);
      params.push(status);
    }

    if (supplier_id) {
      conditions.push(`po.supplier_id = $${paramIndex++}`);
      params.push(supplier_id);
    }

    if (store_id) {
      conditions.push(`po.store_id = $${paramIndex++}`);
      params.push(store_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM purchase_orders po
      ${whereClause}
    `;
    
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get purchase orders with supplier info
    const query = `
      SELECT 
        po.*,
        s.name as supplier_name,
        s.contact_person as supplier_contact,
        (
          SELECT COUNT(*) 
          FROM purchase_order_items poi 
          WHERE poi.purchase_order_id = po.id
        ) as items_count
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    params.push(limit, offset);
    const result = await db.query(query, params);

    const totalPages = Math.ceil(total / limit);

    const response: PaginatedResponse<PurchaseOrder> = {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/purchase-orders
 * 
 * Creates a new purchase order
 * 
 * @param request - Next.js request object
 * @returns Created purchase order
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = body as CreatePurchaseOrderInput;

    // Validate required fields
    if (!input.store_id || !input.supplier_id || !input.items || input.items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: store_id, supplier_id, items' },
        { status: 400 }
      );
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Generate purchase order number if not provided
      if (!input.purchase_order_number) {
        const nextNumber = await generatePurchaseOrderNumber(input.store_id);
        input.purchase_order_number = nextNumber;
      }

      // Calculate totals
      const subtotal = input.items.reduce((sum, item) => sum + (item.quantity_ordered * item.unit_cost), 0);
      const tax_amount = 0; // TODO: Calculate tax if needed
      const shipping_amount = 0; // TODO: Calculate shipping if needed
      const total_amount = subtotal + tax_amount + shipping_amount;

      // Create purchase order
      const purchaseOrderId = uuidv4();
      const purchaseOrderQuery = `
        INSERT INTO purchase_orders (
          id, store_id, supplier_id, purchase_order_number, status, order_date,
          expected_delivery_date, subtotal, tax_amount, shipping_amount, total_amount,
          currency, payment_status, payment_terms, notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, $14, $15
        ) RETURNING *
      `;

      const purchaseOrderResult = await db.query(purchaseOrderQuery, [
        purchaseOrderId,
        input.store_id,
        input.supplier_id,
        input.purchase_order_number,
        input.order_date,
        input.expected_delivery_date,
        subtotal,
        tax_amount,
        shipping_amount,
        total_amount,
        'USD', // Default currency
        input.payment_terms,
        input.notes,
        new Date(),
        new Date(),
      ]);

      const purchaseOrder = purchaseOrderResult.rows[0];

      // Create purchase order items
      const itemsQuery = `
        INSERT INTO purchase_order_items (
          id, purchase_order_id, product_id, sku, product_name, description,
          quantity_ordered, quantity_received, unit_cost, total_cost, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11
        )
      `;

      for (const item of input.items) {
        const itemId = uuidv4();
        const totalCost = item.quantity_ordered * item.unit_cost;
        
        await db.query(itemsQuery, [
          itemId,
          purchaseOrderId,
          item.product_id,
          item.sku,
          item.product_name,
          item.description,
          item.quantity_ordered,
          item.unit_cost,
          totalCost,
          new Date(),
          new Date(),
        ]);
      }

      // Commit transaction
      await db.query('COMMIT');

      return NextResponse.json(purchaseOrder, { status: 201 });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating purchase order:', error);
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    );
  }
}

/**
 * Generate next purchase order number for a store
 * 
 * @param storeId - Store UUID
 * @returns Promise<string> - Next purchase order number
 */
async function generatePurchaseOrderNumber(storeId: string): Promise<string> {
  const result = await db.query(
    `SELECT purchase_order_number 
     FROM purchase_orders 
     WHERE store_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [storeId]
  );

  if (result.rows.length === 0) {
    return 'PO-001';
  }

  const lastNumber = result.rows[0].purchase_order_number;
  const match = lastNumber.match(/PO-(\d+)/);
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `PO-${nextNumber.toString().padStart(3, '0')}`;
  }

  return 'PO-001';
}