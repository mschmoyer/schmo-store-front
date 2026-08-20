/**
 * The inventory grid.
 *
 * This route used to `SELECT ... FROM products WHERE store_id = $1 ORDER BY p.name` with no LIMIT,
 * attach seven windowed sales aggregates per SKU, and ship the whole catalogue to the browser,
 * which then filtered it in JavaScript and recomputed a forecast for every row on every change. At
 * a few thousand SKUs that is a multi-megabyte response and an unusable page. It is paginated and
 * filtered server-side now, and the forecast arithmetic happens in SQL where the data already is.
 *
 * The numbers changed as well as the shape. The grid showed one quantity — `products.stock_quantity`
 * — which the ShipStation sync overwrote with *available* while an order trigger subtracted from it
 * as *on hand*. It now reads the five quantities the ledger maintains separately, so "12 on the
 * shelf, 4 already sold, 8 sellable, 50 arriving Tuesday" is a sentence the screen can actually
 * say. Supplier was the hardcoded string `'ShipStation'` for every row, which made the supplier
 * filter a dropdown with one option; it is the real supplier relation now, and null where there
 * genuinely is not one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse } from '@/lib/api/adminError';
import { suggestReorderPoint } from '@/lib/inventory/reorder';
import {
  INVENTORY_STATE_SQL,
  INVENTORY_SELECT,
  buildInventoryOrderBy,
  buildInventoryWhere,
  inventoryFrom,
  resolveDirection,
  resolveInventorySort,
  resolveInventoryState,
  type InventoryFilters
} from './_lib/query';

/** Hard ceiling on page size. The export route exists for "give me everything". */
const MAX_LIMIT = 250;

/**
 * GET /api/admin/inventory
 *
 * One page of the inventory grid, plus the store-wide counts that label its saved views.
 *
 * Query parameters: `page`, `limit`, `search`, `state`, `category_id`, `supplier_id`,
 * `location_id`, `vendor`, `sort_by`, `sort_order`.
 *
 * @param request - The incoming request.
 * @returns The page of stock rows, pagination metadata, view counts, and the store's locations.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50)
    );
    const offset = (page - 1) * limit;

    const filters: InventoryFilters = {
      search: searchParams.get('search')?.trim() || undefined,
      state: resolveInventoryState(searchParams.get('state')),
      categoryId: searchParams.get('category_id') || undefined,
      supplierId: searchParams.get('supplier_id') || undefined,
      locationId: searchParams.get('location_id') || undefined,
      vendor: searchParams.get('vendor') || undefined
    };

    const sortKey = resolveInventorySort(searchParams.get('sort_by'));
    const direction = resolveDirection(searchParams.get('sort_order'));

    const where = buildInventoryWhere(user.storeId, filters);
    const from = inventoryFrom(where.locationParam);

    const rowsSql = `
      SELECT ${INVENTORY_SELECT}
      ${from}
      ${where.sql}
      ${buildInventoryOrderBy(sortKey, direction)}
      LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
    `;

    const countSql = `SELECT COUNT(*)::int AS total ${from} ${where.sql}`;

    /*
     * View counts are scoped to the store and the selected location, but not to the other filters —
     * they label the tabs above the grid, and a tab whose count depended on which tab you were
     * already on would be useless for navigating between them.
     *
     * `uncosted_value` is deliberately absent: there is no honest way to value stock whose cost is
     * unknown. The count is reported instead, so the merchant can see how much of their valuation
     * is missing rather than being handed a figure that quietly imputed one. An earlier version of
     * the reports multiplied retail by 0.6 to fill the gap; a number a merchant takes to an insurer
     * must not be invented.
     */
    /*
     * Every state count is generated from `INVENTORY_STATE_SQL`, the same map the `state` filter
     * uses, so a badge and the list it opens cannot disagree. They used to: this query carried
     * `p.track_inventory` guards the filter predicates lacked, so untracked products (whose
     * `available` is 0) were counted out of "Out of stock" and listed into it. An adversarial
     * review reproduced a badge of 3 over a list of 5.
     */
    const stateCounts = Object.entries(INVENTORY_STATE_SQL)
      .map(([state, predicate]) => `COUNT(*) FILTER (WHERE ${predicate})::int AS ${state}`)
      .join(',\n        ');

    const statsSql = `
      SELECT
        COUNT(*)::int AS total,
        ${stateCounts},
        COALESCE(SUM(lv.on_hand), 0)::int                                         AS total_units,
        COALESCE(SUM(lv.on_hand * COALESCE(p.cost_price, 0)), 0)::numeric         AS value_at_cost,
        COALESCE(SUM(lv.on_hand * COALESCE(p.sale_price, p.base_price)), 0)::numeric AS value_at_retail,
        COALESCE(SUM(CASE WHEN lv.on_hand > 0 AND (p.cost_price IS NULL OR p.cost_price <= 0)
                          THEN lv.on_hand ELSE 0 END), 0)::int                    AS uncosted_units
      ${from}
      WHERE p.store_id = $1
    `;

    const [rowsResult, countResult, statsResult, locationsResult] = await Promise.all([
      db.query(rowsSql, [...where.params, limit, offset]),
      db.query<{ total: number }>(countSql, where.params),
      db.query(statsSql, where.params.slice(0, 2)),
      db.query(
        `SELECT id, code, name, location_type, is_default, is_fulfillable
           FROM inventory_locations
          WHERE store_id = $1 AND is_active
          ORDER BY is_default DESC, priority, name`,
        [user.storeId]
      )
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const stats = statsResult.rows[0] ?? {};

    /* `pg` returns NUMERIC as a string to protect precision. These are display figures the grid
     * formats and sorts, so they are coerced once here. */
    const items = rowsResult.rows.map((row) => ({
      ...row,
      base_price: Number(row.base_price) || 0,
      sale_price: row.sale_price === null ? null : Number(row.sale_price),
      unit_cost: row.unit_cost === null ? null : Number(row.unit_cost),
      value_at_cost: Number(row.value_at_cost) || 0,
      value_at_retail: Number(row.value_at_retail) || 0,
      daily_demand: Number(row.daily_demand) || 0,
      days_of_cover: row.days_of_cover === null ? null : Number(row.days_of_cover),
      /* The suggested reorder point, shown *beside* the merchant's own figure rather than instead
       * of it. Demand over the lead time plus safety stock — the textbook formula, using the
       * store's own lead time where one is recorded and a fortnight where it is not. */
      suggested_reorder_point: suggestReorderPoint({
      dailyDemand: Number(row.daily_demand) || 0,
      leadTimeDays: Number(row.lead_time_days) || null,
      safetyStock: Number(row.safety_stock) || null
    })
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasNext: offset + items.length < total,
          hasPrev: page > 1
        },
        statistics: {
          /*
           * Every state the grid can filter to, keyed by the same name the `state` parameter takes,
           * generated from `INVENTORY_STATE_SQL`. The camelCase keys below are what the page reads
           * today and are kept; these are what make the whole vocabulary available without a third
           * hand-written copy of the list.
           */
          ...Object.fromEntries(
            Object.keys(INVENTORY_STATE_SQL).map((state) => [state, Number(stats[state]) || 0])
          ),
          total: Number(stats.total) || 0,
          oversold: Number(stats.oversold) || 0,
          outOfStock: Number(stats.out_of_stock) || 0,
          lowStock: Number(stats.low_stock) || 0,
          needsReorder: Number(stats.needs_reorder) || 0,
          incoming: Number(stats.incoming) || 0,
          unavailable: Number(stats.unavailable) || 0,
          deadStock: Number(stats.dead_stock) || 0,
          totalUnits: Number(stats.total_units) || 0,
          valueAtCost: Number(stats.value_at_cost) || 0,
          valueAtRetail: Number(stats.value_at_retail) || 0,
          /* Reported, never imputed. The grid renders this as "excludes N SKUs with no cost on
           * file" beside the valuation, so the figure's own limits travel with it. */
          uncostedProducts: Number(stats.uncosted) || 0,
          uncostedUnits: Number(stats.uncosted_units) || 0
        },
        locations: locationsResult.rows,
        sort: { by: sortKey, order: direction.toLowerCase() }
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.list');
  }
}
