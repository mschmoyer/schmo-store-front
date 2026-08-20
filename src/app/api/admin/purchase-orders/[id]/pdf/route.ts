/**
 * The printable purchase order.
 *
 * This route had no authentication and rendered a hardcoded literal — PO-001, "ABC Supply Co.",
 * John Smith, 123 Industrial Blvd, $2,750.00, "Rush order - please expedite shipping" — for every
 * merchant and every purchase order, while the admin reported "PDF Downloaded — Purchase order PDF
 * has been downloaded successfully". A merchant emailing that to their supplier was sending a
 * forged commercial document with someone else's company on it.
 *
 * The template was never the problem; it takes a purchase order with its supplier, store and line
 * items and renders them properly. Nothing had ever fetched one. This does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse } from '@/lib/api/adminError';
import {
  generatePurchaseOrderPDF,
  type PurchaseOrderWithRelations
} from '@/lib/pdf/purchase-order';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load a purchase order with everything the template renders, scoped to one store.
 *
 * @param purchaseOrderId - The order to load.
 * @param storeId - The tenant. A purchase order in another store resolves to null, not to an error
 *   that would reveal it exists.
 * @returns The order with its supplier, store and line items, or null.
 */
async function loadPurchaseOrder(
  purchaseOrderId: string,
  storeId: string
): Promise<PurchaseOrderWithRelations | null> {
  const orderResult = await db.query(
    `SELECT po.*
       FROM purchase_orders po
      WHERE po.id = $1 AND po.store_id = $2`,
    [purchaseOrderId, storeId]
  );

  const order = orderResult.rows[0];
  if (!order) return null;

  const [supplierResult, storeResult, itemsResult] = await Promise.all([
    db.query(
      'SELECT * FROM suppliers WHERE id = $1 AND store_id = $2',
      [order.supplier_id, storeId]
    ),
    /*
     * WHERE THE GOODS ARE ACTUALLY GOING.
     *
     * The template's "ship to" block wants an address, and `stores` has no address columns — the
     * `Store` type claims six that no migration creates, which is why this query previously failed
     * with `column "address" does not exist` the moment it stopped using mock data.
     *
     * The right source was already here. A purchase order ships to a warehouse, and ShipStation's
     * ship-from addresses are synced into `shipfroms`; that is the address the supplier needs, not
     * a billing address someone would have to re-enter. The store's own name and currency come from
     * `stores`, which does have those.
     */
    db.query(
      `SELECT
         s.id,
         s.store_name AS name,
         s.currency,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', f.origin_address_line1, f.origin_address_line2)), ''),
           ''
         )                          AS address,
         COALESCE(f.origin_city_locality, '')   AS city,
         COALESCE(f.origin_state_province, '')  AS state,
         COALESCE(f.origin_postal_code, '')     AS zip,
         COALESCE(f.email, '')                  AS contact_email,
         COALESCE(f.phone, '')                  AS contact_phone
       FROM stores s
       LEFT JOIN LATERAL (
         SELECT * FROM shipfroms
          WHERE store_id = s.id AND is_active
          ORDER BY is_default DESC, created_at
          LIMIT 1
       ) f ON TRUE
       WHERE s.id = $1`,
      [storeId]
    ),
    db.query(
      `SELECT * FROM purchase_order_items
        WHERE purchase_order_id = $1
        ORDER BY created_at, id`,
      [purchaseOrderId]
    )
  ]);

  /*
   * A supplier deleted after the order was raised must not make the document unprintable — the
   * order still happened and the merchant may still need to send or file it. `purchase_orders`
   * denormalises the supplier's details for exactly this case, so the row is reconstructed from
   * what the order itself recorded at the time.
   */
  const supplierRow = supplierResult.rows[0];

  /*
   * The template expects `supplier.address` to be an object with `street`, `city`, `state`,
   * `postal_code` and `country`; the table stores those as flat columns. Passing the row through
   * unchanged rendered a bare ", " on the document where the supplier's address should be — the
   * kind of detail that makes a merchant look careless in front of their supplier.
   *
   * Left undefined entirely when there is no street on file, so the template's own `&&` guard
   * omits the block rather than printing an empty one.
   */
  const address =
    supplierRow?.address || supplierRow?.city
      ? {
          street: supplierRow.address ?? '',
          city: supplierRow.city ?? '',
          state: supplierRow.state ?? '',
          postal_code: supplierRow.zip ?? '',
          country: supplierRow.country ?? ''
        }
      : undefined;

  const supplier = supplierRow
    ? { ...supplierRow, address }
    : {
        /* The supplier row is gone but the order recorded their details when it was raised, so the
         * document is still printable — which matters, because the order still happened. */
        id: order.supplier_id,
        store_id: storeId,
        name: order.supplier_name,
        email: order.supplier_email,
        phone: order.supplier_phone,
        address: undefined,
        payment_terms: order.payment_terms
      };

  /*
   * MAPPING, BECAUSE THE TEMPLATE AND THE SCHEMA DISAGREE ABOUT NAMES.
   *
   * `PurchaseOrder` in `lib/types/database.ts` predates the table and never matched it:
   * `purchase_order_number` is `po_number`, `expected_delivery_date` is `expected_delivery`,
   * `total_amount` is `total_cost`, and on a line `quantity_ordered` is `quantity`, `sku` is
   * `product_sku`, `description` is `product_description`. `currency` and `payment_status` have no
   * column at all.
   *
   * Spreading the row and casting would typecheck and render a document with blank fields where the
   * names differ — which is how a plausible-looking but wrong PDF reaches a supplier. Mapping
   * explicitly means every field the template prints is one this route deliberately supplied, and
   * the two invented fields get honest defaults rather than undefined.
   */
  return {
    ...order,
    purchase_order_number: order.po_number,
    expected_delivery_date: order.expected_delivery,
    received_date: order.actual_delivery,
    total_amount: Number(order.total_cost) || 0,
    subtotal: Number(order.subtotal) || 0,
    tax_amount: Number(order.tax_amount) || 0,
    shipping_amount: Number(order.shipping_amount) || 0,
    /* The store's own currency. A total with the wrong unit on a document a supplier invoices
     * against is worse than one with no unit at all. */
    currency: storeResult.rows[0]?.currency ?? 'USD',
    payment_status: 'pending',
    supplier,
    store: storeResult.rows[0],
    items: itemsResult.rows.map((item) => ({
      ...item,
      sku: item.product_sku,
      description: item.product_description,
      quantity_ordered: Number(item.quantity) || 0,
      quantity_received: Number(item.quantity_received) || 0,
      unit_cost: Number(item.unit_cost) || 0,
      total_cost: Number(item.total_cost) || 0
    }))
  } as unknown as PurchaseOrderWithRelations;
}

/**
 * GET /api/admin/purchase-orders/[id]/pdf
 *
 * Render this store's purchase order as a PDF.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the purchase order id.
 * @returns The PDF, or 404 when the order is not in this store.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const purchaseOrder = await loadPurchaseOrder(id, user.storeId);
    if (!purchaseOrder) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const pdfBuffer = await generatePurchaseOrderPDF(purchaseOrder);

    /* Record that a document was produced, so "which version did I send them" is answerable. */
    await db.query(
      `UPDATE purchase_orders
          SET pdf_generated_at = NOW(), pdf_version = COALESCE(pdf_version, 0) + 1
        WHERE id = $1 AND store_id = $2`,
      [id, user.storeId]
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${purchaseOrder.purchase_order_number ?? 'purchase-order'}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        /* Never cached: the document changes as the order is received against. */
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'purchase-orders.pdf');
  }
}

/**
 * POST /api/admin/purchase-orders/[id]/pdf
 *
 * The same document, for callers that prefer to POST. Kept because the admin already used it, and
 * it was unauthenticated too.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the purchase order id.
 * @returns The PDF, or 404 when the order is not in this store.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return GET(request, context);
}
