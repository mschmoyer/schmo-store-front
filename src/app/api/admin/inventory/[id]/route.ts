/**
 * One product's inventory: its stock across locations, and the policy that governs restocking it.
 *
 * The split matters. This route changes *settings* — reorder point, lead time, supplier, cost. It
 * cannot change stock. Moving stock is `./[id]/adjust`, which takes a delta and a reason and posts
 * to the ledger.
 *
 * They used to be one operation, and that was the defect. `PUT` accepted an absolute
 * `stock_quantity` *and* a separate `quantity_change` for the audit log, both from the browser,
 * with nothing reconciling them: a caller could set stock to 500 and record a movement of +1, and
 * the log would say so forever. The modal computed its own delta from the value loaded when the
 * dialog opened, so any concurrent change made both the write and the log wrong. And three of the
 * six fields it collected — reorder point, reorder quantity, supplier — had no columns and were
 * dropped on the floor beneath a green "Successfully updated" toast.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';

/** A product id is a uuid. Anything else is a bad route, not a database error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/inventory/[id]
 *
 * A product's stock position: the roll-up, the per-location breakdown, measured demand, what is on
 * order, and the last movements.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The stock position, or 404 when the product is not in this store.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    /*
     * Demand windows key off the *order's* date, and count everything not cancelled.
     *
     * Both were wrong here in ways the list route had already been fixed for, and the two screens
     * disagreed as a result: this one keyed off `oi.created_at` — the line item's insert timestamp,
     * which for an imported catalogue is the import date for every row, making all windows equal —
     * and filtered `status IN ('completed','processing')`, so a shipped order was not a sale. It
     * also used `COUNT(*)` where the grid used `SUM(quantity)`, so the same SKU showed lines sold
     * on one screen and units sold on the other.
     */
    const detail = await db.query(
      `SELECT
         p.id, p.sku, p.name, p.barcode, p.featured_image_url, p.track_inventory, p.status,
         p.base_price, p.sale_price, p.cost_price, p.low_stock_threshold,
         p.reorder_point, p.reorder_quantity, p.lead_time_days, p.safety_stock,
         p.supplier_id, p.allow_backorder,
         c.name AS category_name,
         sup.name AS supplier_name,
         sup.payment_terms AS supplier_terms,
         COALESCE(agg.on_hand, 0)      AS on_hand,
         COALESCE(agg.committed, 0)    AS committed,
         COALESCE(agg.reserved, 0)     AS reserved,
         COALESCE(agg.unavailable, 0)  AS unavailable,
         COALESCE(agg.available, 0)    AS available,
         COALESCE(inc.incoming, 0)     AS incoming,
         COALESCE(sv.units_30d, 0)     AS units_30d,
         COALESCE(sv.units_90d, 0)     AS units_90d,
         COALESCE(sv.units_365d, 0)    AS units_365d,
         sv.last_sale_date,
         ROUND(COALESCE(sv.units_90d, 0) / 90.0, 4) AS daily_demand
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
       LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.store_id = p.store_id
       LEFT JOIN LATERAL (
         SELECT SUM(on_hand) AS on_hand, SUM(committed) AS committed, SUM(reserved) AS reserved,
                SUM(unavailable) AS unavailable, SUM(available) AS available
           FROM inventory_levels l WHERE l.product_id = p.id AND l.store_id = p.store_id
       ) agg ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(poi.quantity_pending)::int AS incoming
           FROM purchase_order_items poi
           JOIN purchase_orders po ON po.id = poi.purchase_order_id
          WHERE po.store_id = p.store_id AND poi.product_sku = p.sku
            AND po.status NOT IN ('cancelled', 'closed', 'draft') AND poi.quantity_pending > 0
       ) inc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::int  AS units_30d,
           SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '90 days')::int  AS units_90d,
           SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '365 days')::int AS units_365d,
           MAX(o.created_at) AS last_sale_date
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
       ) sv ON TRUE
       WHERE p.id = $1 AND p.store_id = $2`,
      [id, user.storeId]
    );

    if (detail.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const product = detail.rows[0];

    /*
     * The per-location rows, kept separate from the roll-up rather than collapsed into it.
     *
     * The old detail query joined `inventory` on SKU with no location predicate and then took
     * `rows[0]` — so a product held in three warehouses reported one arbitrary warehouse's numbers
     * as though they were the whole picture.
     */
    const [locations, incoming, movements] = await Promise.all([
      db.query(
        `SELECT l.id AS location_id, l.name AS location_name, l.code, l.is_fulfillable,
                lv.on_hand, lv.committed, lv.reserved, lv.unavailable, lv.available,
                lv.updated_at AS last_movement_at
           FROM inventory_locations l
           LEFT JOIN inventory_levels lv
             ON lv.location_id = l.id AND lv.product_id = $2 AND lv.store_id = l.store_id
          WHERE l.store_id = $1 AND l.is_active
          ORDER BY l.is_default DESC, l.priority, l.name`,
        [user.storeId, id]
      ),
      db.query(
        `SELECT po.id AS purchase_order_id, po.po_number, po.status, po.expected_delivery,
                po.supplier_name, poi.quantity, poi.quantity_received, poi.quantity_pending,
                poi.unit_cost
           FROM purchase_order_items poi
           JOIN purchase_orders po ON po.id = poi.purchase_order_id
          WHERE po.store_id = $1 AND poi.product_sku = (SELECT sku FROM products WHERE id = $2)
            AND po.status NOT IN ('cancelled', 'closed')
          ORDER BY po.expected_delivery NULLS LAST, po.created_at DESC
          LIMIT 20`,
        [user.storeId, id]
      ),
      db.query(
        `SELECT t.id, t.reason, t.delta, t.balance_after, t.note, t.created_at,
                t.reference_type, t.reference_id, t.unit_cost,
                l.name AS location_name,
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS actor_name
           FROM inventory_transactions t
           JOIN inventory_locations l ON l.id = t.location_id
           LEFT JOIN users u ON u.id = t.actor_user_id
          WHERE t.store_id = $1 AND t.product_id = $2
          ORDER BY t.sequence DESC   -- never created_at: NOW() is transaction start time (migration 034)
          LIMIT 20`,
        [user.storeId, id]
      )
    ]);

    const dailyDemand = Number(product.daily_demand) || 0;
    const available = Number(product.available) || 0;

    return NextResponse.json({
      success: true,
      data: {
        product: {
          ...product,
          base_price: Number(product.base_price) || 0,
          sale_price: product.sale_price === null ? null : Number(product.sale_price),
          cost_price: product.cost_price === null ? null : Number(product.cost_price),
          daily_demand: dailyDemand,
          /* Null rather than Infinity when nothing sells. A screen that prints "∞ days of cover"
           * has told the merchant nothing; "no sales in the last 90 days" has told them a lot. */
          days_of_cover: dailyDemand > 0 ? Math.round((available / dailyDemand) * 10) / 10 : null,
          /* When the shelf empties at the current rate, for the same reason. */
          projected_stockout_date:
            dailyDemand > 0 && available > 0
              ? new Date(Date.now() + (available / dailyDemand) * 86_400_000).toISOString()
              : null
        },
        locations: locations.rows,
        incoming: incoming.rows,
        movements: movements.rows
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.detail');
  }
}

/** Settings this route may change, with how each is coerced. Anything absent is left alone. */
const INTEGER_SETTINGS = [
  'low_stock_threshold',
  'reorder_point',
  'reorder_quantity',
  'lead_time_days',
  'safety_stock'
] as const;

/**
 * PUT /api/admin/inventory/[id]
 *
 * Update a product's replenishment policy. This never moves stock — see `./adjust` for that.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The fields that were applied, so the client can tell if anything it sent was ignored.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();

    if (body.stock_quantity !== undefined || body.quantity_change !== undefined) {
      /*
       * Refused rather than silently ignored. A caller reaching for the old shape needs to know
       * their stock change did not happen, not discover it in a stocktake.
       */
      throw new AdminApiError(
        'Stock is changed through /api/admin/inventory/[id]/adjust, which records why it moved',
        400
      );
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const field of INTEGER_SETTINGS) {
      if (body[field] === undefined) continue;
      if (body[field] === null) {
        fields.push(`${field} = NULL`);
        continue;
      }
      const parsed = Math.trunc(Number(body[field]));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new AdminApiError(`${field.replace(/_/g, ' ')} must be 0 or more`, 400);
      }
      values.push(parsed);
      fields.push(`${field} = $${values.length}`);
    }

    /* Cost is money, so it is validated as money: non-negative, and null means "not known" rather
     * than zero. The valuation reports depend on being able to tell those apart — a product with a
     * genuinely unknown cost must be excluded and counted, not valued at nothing. */
    if (body.unit_cost !== undefined || body.cost_price !== undefined) {
      const raw = body.unit_cost ?? body.cost_price;
      if (raw === null || raw === '') {
        fields.push('cost_price = NULL');
      } else {
        const cost = Number(raw);
        if (!Number.isFinite(cost) || cost < 0) {
          throw new AdminApiError('Unit cost must be 0 or more', 400);
        }
        values.push(cost);
        fields.push(`cost_price = $${values.length}`);
      }
    }

    if (body.supplier_id !== undefined) {
      if (body.supplier_id === null || body.supplier_id === '') {
        fields.push('supplier_id = NULL');
      } else {
        /* The composite foreign key added in migration 026 would refuse a supplier from another
         * store anyway; checking here turns a constraint violation into a sentence. */
        const supplier = await db.query('SELECT id FROM suppliers WHERE id = $1 AND store_id = $2', [
          body.supplier_id,
          user.storeId
        ]);
        if (supplier.rows.length === 0) {
          throw new AdminApiError('That supplier is not in this store', 400);
        }
        values.push(body.supplier_id);
        fields.push(`supplier_id = $${values.length}`);
      }
    }

    if (body.track_inventory !== undefined) {
      values.push(Boolean(body.track_inventory));
      fields.push(`track_inventory = $${values.length}`);
    }

    if (body.allow_backorder !== undefined) {
      values.push(Boolean(body.allow_backorder));
      fields.push(`allow_backorder = $${values.length}`);
    }

    if (fields.length === 0) {
      throw new AdminApiError('Nothing to update', 400);
    }

    values.push(id, user.storeId);
    const updated = await db.query(
      `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length - 1} AND store_id = $${values.length}
        RETURNING id, sku, low_stock_threshold, reorder_point, reorder_quantity,
                  lead_time_days, safety_stock, cost_price, supplier_id,
                  track_inventory, allow_backorder`,
      values
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        product: updated.rows[0],
        /* Echoing what was applied lets the client detect a field it sent that the server does not
         * accept, instead of showing a success message over a silent drop. */
        applied: fields.map((f) => f.split(' ')[0])
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.settings');
  }
}

/**
 * DELETE /api/admin/inventory/[id]
 *
 * Stop tracking and selling a product.
 *
 * This used to set `is_active = false` and write a ledger row claiming `quantity_change: 0,
 * quantity_after: 0` while the real units were still on the shelf — a false entry that asserted a
 * balance of zero, and made the store's valuation silently drop by that product's whole value with
 * nothing to account for it. Archiving is a status change, not a stock movement, so no ledger entry
 * is written and the stock stays where it is. Writing it off is a separate, deliberate act with its
 * own reason code.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The archived product and whatever stock it still holds.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const archived = await db.query(
      `UPDATE products SET status = 'archived', updated_at = NOW()
        WHERE id = $1 AND store_id = $2
        RETURNING id, sku, name, stock_quantity, cost_price`,
      [id, user.storeId]
    );

    if (archived.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const product = archived.rows[0];
    const remaining = Number(product.stock_quantity) || 0;

    return NextResponse.json({
      success: true,
      data: {
        product,
        /* Said plainly rather than left for the merchant to discover. Stock that is still on the
         * shelf after archiving is real, and it is still worth money. */
        remaining_stock: remaining,
        message:
          remaining > 0
            ? `${product.name} is archived. ${remaining} units are still in stock and still counted in your valuation — write them off if they are gone.`
            : `${product.name} is archived.`
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.archive');
  }
}
