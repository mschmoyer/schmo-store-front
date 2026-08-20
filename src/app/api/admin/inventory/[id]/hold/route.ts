/**
 * Holding units back from sale, and releasing them.
 *
 * `inventory_levels.unavailable` has been in the grid, the CSV, the detail page and a statistics
 * tile since the ledger was built, and no code path ever wrote it. So "present but not saleable"
 * was displayed throughout and could not happen, and the grid's "Unavailable" view could never
 * match a row.
 *
 * A hold is not a stock movement — the units are still on the shelf — so it does not go through the
 * ledger. See migration 038 for why that separation is worth keeping.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';

/** Reasons a merchant can hold stock back, with the wording the dialog shows. */
export const HOLD_REASONS = [
  { value: 'quarantine', label: 'Quarantine — awaiting inspection' },
  { value: 'damage', label: 'Damaged — not fit to sell' },
  { value: 'expiry', label: 'Expired or out of date' },
  { value: 'sample', label: 'Set aside as a sample' }
] as const;

/**
 * POST /api/admin/inventory/[id]/hold
 *
 * @param request - The incoming request, with `{ quantity, reason, location_id, note, release }`.
 *   A positive `quantity` holds units; `release: true` returns them to sale.
 * @param context - Route params carrying the product id.
 * @returns The new held total and what it leaves available.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { id: productId } = await context.params;
    const body = await request.json().catch(() => ({}));

    const magnitude = Math.trunc(Number(body.quantity));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      throw new AdminApiError('Enter how many units', 400);
    }

    const releasing = body.release === true;
    const delta = releasing ? -magnitude : magnitude;

    /* Releasing needs no reason beyond "these are sellable again" — the reason is already on the
     * hold being undone, and asking twice is asking a merchant to justify fixing something. */
    const reason = releasing
      ? 'release'
      : HOLD_REASONS.some((r) => r.value === body.reason)
        ? String(body.reason)
        : 'quarantine';

    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    if (!releasing && reason === 'quarantine' && !note) {
      /* A quarantine with no note is a number nobody can act on later — the whole point is that
       * somebody eventually decides what happens to these units. */
      throw new AdminApiError('Say what these units are waiting on', 400);
    }

    const owned = await db.query<{ sku: string }>(
      'SELECT sku FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );
    if (owned.rows.length === 0) throw new AdminApiError('That product is not in this store', 404);

    const result = await db.query<{ held_after: number; location_id: string }>(
      /*
       * `SELECT * FROM f(...)`, never `SELECT (f(...)).*`.
       *
       * The second form is a trap: Postgres expands it to one call of `f` per output column, so a
       * function with thirteen columns runs thirteen times. Here that meant a request to hold four
       * units posted four, then four again, until one of them hit the "only N available" guard —
       * which is how this was noticed. It is silent whenever the function is idempotent, which is
       * the dangerous half.
       */
      `SELECT * FROM post_inventory_hold($1, $2, $3, $4::inventory_reason, $5, $6, $7)`,
      [
        user.storeId,
        productId,
        delta,
        reason,
        body.location_id || null,
        user.userId,
        note
      ]
    );

    const held = Number(result.rows[0]?.held_after ?? 0);
    const level = await db.query<{ available: number; on_hand: number; name: string }>(
      `SELECT lv.available, lv.on_hand, l.name
         FROM inventory_levels lv
         JOIN inventory_locations l ON l.id = lv.location_id
        WHERE lv.product_id = $1 AND lv.location_id = $2 AND lv.store_id = $3`,
      [productId, result.rows[0]?.location_id, user.storeId]
    );
    const row = level.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        sku: owned.rows[0].sku,
        held,
        available: Number(row?.available ?? 0),
        on_hand: Number(row?.on_hand ?? 0),
        message: releasing
          ? `${magnitude} unit${magnitude === 1 ? '' : 's'} returned to sale at ${row?.name}. `
            + `${held} still held; ${row?.available} available.`
          : `${magnitude} unit${magnitude === 1 ? '' : 's'} held back at ${row?.name}. `
            + `Still on the shelf, not sellable — ${row?.available} available.`
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.hold');
  }
}

/**
 * GET /api/admin/inventory/[id]/hold
 *
 * What is currently held, and the history of holds and releases.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns Held totals per location, and recent hold movements.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { id: productId } = await context.params;

    const [held, history] = await Promise.all([
      db.query(
        `SELECT l.id AS location_id, l.name AS location_name,
                lv.on_hand, lv.unavailable, lv.available
           FROM inventory_levels lv
           JOIN inventory_locations l ON l.id = lv.location_id
          WHERE lv.product_id = $1 AND lv.store_id = $2 AND lv.unavailable > 0
          ORDER BY l.name`,
        [productId, user.storeId]
      ),
      db.query(
        `SELECT h.id, h.delta, h.held_after, h.reason, h.note, h.created_at,
                l.name AS location_name,
                CONCAT(u.first_name, ' ', u.last_name) AS actor_name
           FROM inventory_holds h
           JOIN inventory_locations l ON l.id = h.location_id
           LEFT JOIN users u ON u.id = h.actor_user_id
          WHERE h.product_id = $1 AND h.store_id = $2
          ORDER BY h.sequence DESC
          LIMIT 50`,
        [productId, user.storeId]
      )
    ]);

    return NextResponse.json({
      success: true,
      data: { held: held.rows, history: history.rows }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.hold.list');
  }
}
