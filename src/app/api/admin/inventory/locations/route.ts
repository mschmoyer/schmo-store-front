/**
 * The places a merchant keeps stock.
 *
 * `inventory_locations` has existed since migration 027, the levels table is keyed on it, the grid
 * has a location filter and the ledger records a location on every movement — and nothing could
 * create a second row. Every store had exactly the one the trigger makes, so multi-location was
 * presented throughout the product and implemented nowhere: `transferStock` was exported and never
 * called, the adjustment dialog's location picker had one option, and a merchant with a shop and a
 * back room could not tell the platform they existed.
 *
 * A location is not a warehouse address. It is a place a unit can be, which is the thing the ledger
 * needs to keep balances apart — a shelf, a van, a third-party fulfilment centre, or the pallet of
 * returns nobody has inspected yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';

/**
 * The location types the database accepts.
 *
 * Kept in one place because two hand-written copies disagreed: the route allowed `supplier` and not
 * `quarantine`, the CHECK constraint the reverse.
 */
export const LOCATION_TYPES = [
  'warehouse',
  'store',
  'transit',
  'quarantine',
  'virtual'
] as const;

/**
 * GET /api/admin/inventory/locations
 *
 * Every location in the store, with how much is sitting in each.
 *
 * @param request - The incoming request.
 * @returns The locations, each with its SKU count and unit count.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const result = await db.query(
      `SELECT l.id, l.code, l.name, l.location_type, l.is_default, l.is_fulfillable,
              l.is_active, l.priority, l.shipstation_warehouse_id,
              COALESCE(s.skus, 0)::int  AS sku_count,
              COALESCE(s.units, 0)::int AS unit_count,
              COALESCE(s.committed, 0)::int AS committed
         FROM inventory_locations l
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE lv.on_hand <> 0) AS skus,
                  SUM(lv.on_hand)   AS units,
                  SUM(lv.committed) AS committed
             FROM inventory_levels lv
            WHERE lv.location_id = l.id AND lv.store_id = l.store_id
         ) s ON TRUE
        WHERE l.store_id = $1
        ORDER BY l.is_default DESC, l.priority, l.name`,
      [user.storeId]
    );

    return NextResponse.json({ success: true, locations: result.rows });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.locations.list');
  }
}

/**
 * POST /api/admin/inventory/locations
 *
 * Add a place stock can be.
 *
 * @param request - The incoming request, with `{ name, code, location_type, is_fulfillable }`.
 * @returns The created location.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    if (!name) throw new AdminApiError('Give the location a name', 400);
    if (name.length > 255) throw new AdminApiError('That name is too long', 400);

    /*
     * Derived from the name when the merchant does not supply one, because a code is for scanning
     * and typing and most merchants have not thought about one yet.
     *
     * A derived code that collides is made unique rather than refused. The merchant did not choose
     * it, so a 409 naming a code they have never seen is not an error they can act on — "Back Room"
     * and "Back Room 2" both truncating to the same twelve characters is our problem, not theirs.
     * An explicitly supplied code still conflicts loudly, because that one they did choose.
     */
    const supplied = String(body.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const code = supplied
      ? supplied
      : await freeLocationCode(
          user.storeId,
          name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'LOC'
        );

    /*
     * The same set the database CHECK allows, and no other.
     *
     * This list said `supplier` and omitted `quarantine`; the constraint says the opposite. So
     * `quarantine` — the type migration 038 exists to serve — was silently stored as `warehouse`,
     * a success reporting a different value than the one requested, and `supplier` produced an
     * opaque constraint error. An unknown value is now refused with the list rather than quietly
     * becoming something else.
     */
    const rawType = String(body.location_type ?? 'warehouse');
    if (!LOCATION_TYPES.includes(rawType as (typeof LOCATION_TYPES)[number])) {
      throw new AdminApiError(
        `"${rawType}" is not a location type. Choose one of: ${LOCATION_TYPES.join(', ')}.`,
        400
      );
    }
    const type = rawType;

    const result = await db.query(
      `INSERT INTO inventory_locations
         (store_id, code, name, location_type, is_fulfillable, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::int, 100), true)
       RETURNING id, code, name, location_type, is_default, is_fulfillable, is_active, priority`,
      [
        user.storeId,
        code,
        name,
        type,
        /* A returns bay or a quarantine shelf holds stock that must not be sold, so this is a
         * question rather than an assumption. */
        body.is_fulfillable !== false,
        Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : null
      ]
    );

    return NextResponse.json({ success: true, location: result.rows[0] }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.locations.create');
  }
}

/**
 * A location code free within the store, appending `-2`, `-3`, … until one is.
 *
 * @param storeId - The tenant.
 * @param desired - The code derived from the name.
 * @returns A code free in this store at the time of the call.
 */
async function freeLocationCode(storeId: string, desired: string): Promise<string> {
  const taken = await db.query<{ code: string }>(
    `SELECT code FROM inventory_locations
      WHERE store_id = $1 AND (code = $2 OR code LIKE $2 || '-%')`,
    [storeId, desired]
  );
  const used = new Set(taken.rows.map((r) => r.code));
  if (!used.has(desired)) return desired;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${desired.slice(0, 12)}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${desired.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
}
