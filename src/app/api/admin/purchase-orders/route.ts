/**
 * Purchase orders: listing and creation.
 *
 * This route had no authentication at all. Neither handler called `requireAuth`; the tenant came
 * from `?store_id=`, and omitting it produced an empty `WHERE` clause, so an anonymous request to
 * `/api/admin/purchase-orders` returned every purchase order on the platform — supplier names,
 * contacts, payment terms and unit costs for every merchant. POST took `store_id` from the request
 * body, so anyone could write a purchase order into anyone's store. Both are fixed the only way
 * they can be: the store comes from the session and the client cannot name it.
 *
 * The transaction handling was also wrong in a way that is easy to miss. `db.query('BEGIN')` runs
 * on the *pool*, so `BEGIN`, the inserts and `COMMIT` could each land on a different connection —
 * the statements autocommit individually and a connection is returned to the pool with an open
 * transaction on it, poisoning the next request that borrows it. `db.transaction()` holds one
 * connection for the callback, which is what this needed all along.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { CountRow, PurchaseOrderRow } from '@/lib/types/db-rows';
import type { PaginatedResponse } from '@/lib/types/database';

/** A purchase order row joined with its supplier and line-item count. */
type PurchaseOrderListRow = PurchaseOrderRow & {
  supplier_name: string;
  supplier_contact: string | null;
  items_count: string;
};

/** Statuses a purchase order may be filtered by. Anything else is rejected rather than ignored. */
const PO_STATUSES = [
  'draft',
  'pending',
  'approved',
  'shipped',
  'partially_received',
  'delivered',
  'closed',
  'cancelled'
] as const;

/**
 * GET /api/admin/purchase-orders
 *
 * List the signed-in store's purchase orders, newest first.
 *
 * Query parameters: `page`, `limit`, `status`, `supplier_id`. `store_id` is deliberately ignored —
 * the tenant is whichever store the session belongs to, and accepting it from the client is what
 * made this route a cross-tenant leak.
 *
 * @param request - The incoming request.
 * @returns A page of purchase orders with pagination metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['po.store_id = $1'];
    const params: unknown[] = [user.storeId];

    const status = searchParams.get('status');
    if (status) {
      if (!(PO_STATUSES as readonly string[]).includes(status)) {
        throw new AdminApiError(`"${status}" is not a purchase order status`, 400);
      }
      conditions.push(`po.status = $${params.length + 1}`);
      params.push(status);
    }

    const supplierId = searchParams.get('supplier_id');
    if (supplierId) {
      conditions.push(`po.supplier_id = $${params.length + 1}`);
      params.push(supplierId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*) as count FROM purchase_orders po ${whereClause}`,
      params
    );
    const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

    /*
     * `LEFT JOIN`, not `JOIN`. A supplier deleted after the order was raised would otherwise make
     * the purchase order disappear from the list entirely — the record of money committed, hidden
     * because a row in a different table went away. `supplier_name` is denormalised onto the order
     * for exactly this reason, so the join is only for the current contact details.
     */
    const rows = await db.query<PurchaseOrderListRow>(
      `SELECT
         po.*,
         COALESCE(s.name, po.supplier_name) AS supplier_name,
         s.contact_person                   AS supplier_contact,
         (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS items_count,
         (SELECT COALESCE(SUM(poi.quantity_pending), 0)
            FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS units_pending
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id AND s.store_id = po.store_id
       ${whereClause}
       ORDER BY po.created_at DESC, po.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const response: PaginatedResponse<PurchaseOrderListRow> = {
      data: rows.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    return adminErrorResponse(error, 'purchase-orders.list');
  }
}

/** One line of a purchase order as the client sends it. */
interface IncomingItem {
  product_id?: string | null;
  sku?: string;
  product_sku?: string;
  product_name?: string;
  description?: string | null;
  quantity_ordered?: number;
  quantity?: number;
  unit_cost?: number;
}

/**
 * POST /api/admin/purchase-orders
 *
 * Raise a purchase order against one of the store's suppliers.
 *
 * The store comes from the session. A `store_id` in the body is ignored — writing into a store
 * named by the caller is how this route let anyone create orders in anyone's account.
 *
 * @param request - The incoming request.
 * @returns The created purchase order with its line items.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json();
    const storeId = user.storeId;

    if (!body.supplier_id) {
      throw new AdminApiError('Choose a supplier for this purchase order', 400);
    }

    const rawItems: IncomingItem[] = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      throw new AdminApiError('A purchase order needs at least one line item', 400);
    }

    /* Normalise and validate every line before opening a transaction, so a bad line is a 400 and
     * not a rolled-back write. Quantities and costs are the two things nobody may fudge. */
    const items = rawItems.map((item, index) => {
      const quantity = Math.round(Number(item.quantity_ordered ?? item.quantity ?? 0));
      const unitCost = Number(item.unit_cost ?? 0);
      const sku = String(item.product_sku ?? item.sku ?? '').trim();

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new AdminApiError(`Line ${index + 1}: order quantity must be 1 or more`, 400);
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new AdminApiError(`Line ${index + 1}: unit cost must be 0 or more`, 400);
      }
      if (!sku) {
        throw new AdminApiError(`Line ${index + 1}: a SKU is required`, 400);
      }

      return {
        productId: item.product_id || null,
        sku,
        name: String(item.product_name ?? sku).trim(),
        description: item.description ?? null,
        quantity,
        unitCost
      };
    });

    const created = await db.transaction(async (tx) => {
      const supplier = await tx.query<{ name: string; email: string | null; phone: string | null }>(
        'SELECT name, email, phone FROM suppliers WHERE id = $1 AND store_id = $2',
        [body.supplier_id, storeId]
      );
      if (supplier.rows.length === 0) {
        throw new AdminApiError('That supplier is not in this store', 404);
      }

      /*
       * Every referenced product must belong to this store. Without this a caller could put
       * another tenant's SKU on their own order, and the receipt would then move that tenant's
       * stock. Line items keep the SKU as text by design (a supplier's catalogue outlives ours),
       * but a `product_id` that is set has to be real and ours.
       */
      const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
      if (productIds.length > 0) {
        const owned = await tx.query<{ id: string }>(
          'SELECT id FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])',
          [storeId, productIds]
        );
        if (owned.rows.length !== new Set(productIds).size) {
          throw new AdminApiError('One of those products is not in this store', 400);
        }
      }

      const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
      const taxAmount = Number(body.tax_amount ?? 0) || 0;
      const shippingAmount = Number(body.shipping_amount ?? 0) || 0;
      const totalCost = subtotal + taxAmount + shippingAmount;

      /*
       * The order number is chosen inside the same statement that inserts the row, from `MAX` over
       * the store's existing numbers, rather than read-then-increment in JavaScript. The previous
       * version took the most *recently created* order's number — not the highest — and two
       * concurrent creates both computed the same next value, so one of them died on the unique
       * index. Deriving it in SQL under the row lock the insert already takes removes the window.
       */
      const poNumber =
        typeof body.po_number === 'string' && body.po_number.trim()
          ? body.po_number.trim()
          : null;

      const orderResult = await tx.query<PurchaseOrderRow>(
        `INSERT INTO purchase_orders (
           store_id, supplier_id, supplier_name, supplier_email, supplier_phone,
           po_number, status, order_date, expected_delivery,
           subtotal, tax_amount, shipping_amount, total_cost,
           payment_terms, notes, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           COALESCE($6, (
             SELECT 'PO-' || LPAD((COALESCE(MAX(NULLIF(regexp_replace(po_number, '\\D', '', 'g'), ''))::int, 0) + 1)::text, 4, '0')
               FROM purchase_orders WHERE store_id = $1
           )),
           $7, COALESCE($8::date, CURRENT_DATE), $9::date,
           $10, $11, $12, $13,
           $14, $15, $16
         ) RETURNING *`,
        [
          storeId,
          body.supplier_id,
          supplier.rows[0].name,
          supplier.rows[0].email,
          supplier.rows[0].phone,
          poNumber,
          body.status === 'draft' ? 'draft' : 'pending',
          body.order_date ?? null,
          body.expected_delivery ?? body.expected_delivery_date ?? null,
          subtotal,
          taxAmount,
          shippingAmount,
          totalCost,
          body.payment_terms ?? null,
          body.notes ?? null,
          user.userId
        ]
      );

      const order = orderResult.rows[0];

      /* One multi-row insert rather than a query per line: a fifty-line order was fifty round
       * trips, each of which could previously have landed on a different connection. */
      const values: unknown[] = [];
      const tuples = items.map((item, i) => {
        const base = i * 7;
        values.push(
          order.id,
          item.productId,
          item.sku,
          item.name,
          item.description,
          item.quantity,
          item.unitCost
        );
        /* The placeholders carry explicit casts: `$6 * $7` with two untyped parameters is
         * `unknown * unknown`, which Postgres refuses as ambiguous rather than guessing. */
        return (
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
          `$${base + 6}::int, 0, $${base + 7}::numeric, $${base + 6}::int * $${base + 7}::numeric)`
        );
      });

      /* `quantity_pending` is a GENERATED column; Postgres rejects an explicit value for it. */
      const lineResult = await tx.query(
        `INSERT INTO purchase_order_items (
           purchase_order_id, product_id, product_sku, product_name, product_description,
           quantity, quantity_received, unit_cost, total_cost
         ) VALUES ${tuples.join(', ')}
         RETURNING *`,
        values
      );

      return { ...order, items: lineResult.rows };
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, 'purchase-orders.create');
  }
}
