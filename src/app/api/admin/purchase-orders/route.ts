import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import { CreatePurchaseOrderInput, PaginatedResponse } from '@/lib/types/database';
import { CountRow, PurchaseOrderRow } from '@/lib/types/db-rows';

/** A purchase order row joined with its supplier and line-item count. */
type PurchaseOrderListRow = PurchaseOrderRow & {
  supplier_name: string;
  supplier_contact: string | null;
  items_count: string;
};

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
      SELECT COUNT(*) as count
      FROM purchase_orders po
      ${whereClause}
    `;
    
    const countResult = await db.query<CountRow>(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

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
    const result = await db.query<PurchaseOrderListRow>(query, params);

    const totalPages = Math.ceil(total / limit);

    const response: PaginatedResponse<PurchaseOrderListRow> = {
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
      /*
       * WRITING AGAINST THE SCHEMA THAT ACTUALLY EXISTS.
       *
       * This insert named eight columns `purchase_orders` does not have:
       * `purchase_order_number` (it is `po_number`), `expected_delivery_date`
       * (`expected_delivery`), `total_amount` (`total_cost`), plus `currency`
       * and `payment_status`, which the table has no equivalent of. The items
       * insert named `sku`, `description` and `quantity_ordered` against
       * columns called `product_sku`, `product_description` and `quantity`.
       *
       * So the create flow — described as "real and correctly wired" because
       * the page genuinely POSTs to it — failed with
       * `column "purchase_order_number" does not exist` on every attempt. It
       * was invisible for as long as the list page rendered three hardcoded
       * orders: nobody could tell the difference between a PO that failed to
       * save and a list that would not have shown it anyway.
       *
       * `supplier_name` is denormalised onto the row by this table's design,
       * so it is resolved from `suppliers` here rather than left null against
       * a NOT NULL column.
       */
      if (!input.purchase_order_number) {
        const nextNumber = await generatePurchaseOrderNumber(input.store_id);
        input.purchase_order_number = nextNumber;
      }

      const supplierResult = await db.query<{
        name: string;
        email: string | null;
        phone: string | null;
      }>(
        'SELECT name, email, phone FROM suppliers WHERE id = $1 AND store_id = $2',
        [input.supplier_id, input.store_id]
      );

      if (supplierResult.rows.length === 0) {
        await db.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Supplier not found for this store' },
          { status: 404 }
        );
      }

      const supplier = supplierResult.rows[0];

      // Calculate totals
      const subtotal = input.items.reduce((sum, item) => sum + (item.quantity_ordered * item.unit_cost), 0);
      const tax_amount = 0;
      const shipping_amount = 0;
      const total_cost = subtotal + tax_amount + shipping_amount;

      const purchaseOrderId = uuidv4();
      const purchaseOrderQuery = `
        INSERT INTO purchase_orders (
          id, store_id, supplier_id, supplier_name, supplier_email, supplier_phone,
          po_number, status, order_date, expected_delivery,
          subtotal, tax_amount, shipping_amount, total_cost,
          payment_terms, notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'pending', COALESCE($8::date, CURRENT_DATE), $9,
          $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING *
      `;

      const purchaseOrderResult = await db.query(purchaseOrderQuery, [
        purchaseOrderId,
        input.store_id,
        input.supplier_id,
        supplier.name,
        supplier.email,
        supplier.phone,
        input.purchase_order_number,
        input.order_date ?? null,
        input.expected_delivery_date ?? null,
        subtotal,
        tax_amount,
        shipping_amount,
        total_cost,
        input.payment_terms ?? null,
        input.notes ?? null,
        new Date(),
        new Date(),
      ]);

      const purchaseOrder = purchaseOrderResult.rows[0];

      // `quantity_pending` is a GENERATED column (quantity - quantity_received);
      // Postgres rejects any explicit value for it.
      const itemsQuery = `
        INSERT INTO purchase_order_items (
          id, purchase_order_id, product_id, product_sku, product_name, product_description,
          quantity, quantity_received, unit_cost, total_cost, created_at, updated_at
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
          item.description ?? null,
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
  // `po_number`, not `purchase_order_number` — see the insert above.
  const result = await db.query<{ po_number: string | null }>(
    `SELECT po_number
     FROM purchase_orders
     WHERE store_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [storeId]
  );

  if (result.rows.length === 0) {
    return 'PO-001';
  }

  const lastNumber = result.rows[0].po_number;
  const match = lastNumber === null ? null : lastNumber.match(/PO-(\d+)/);
  
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `PO-${nextNumber.toString().padStart(3, '0')}`;
  }

  return 'PO-001';
}