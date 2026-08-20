/**
 * Move stock, and say why.
 *
 * The only endpoint in the application that changes on-hand from the admin. It takes one of two
 * shapes and nothing else:
 *
 *   `{ delta: -3, reason: 'damage', note: '...' }`      — a movement of a known size
 *   `{ counted: 47, reason: 'cycle_count' }`            — a physical count, converted to a delta
 *
 * It deliberately will not accept a new absolute quantity under any other reason. "Set stock to 47"
 * cannot say what happened to the missing units, and the difference between a stocktake, a
 * breakage and a theft is the whole reason a merchant keeps stock records at all. Requiring the
 * reason is what turns a number into an audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { postMovement, recountTo, requireManualReason } from '@/lib/inventory/ledger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/inventory/[id]/adjust
 *
 * Post a stock movement against a product.
 *
 * Body: `{ reason, delta?, counted?, location_id?, note?, unit_cost? }`. Exactly one of `delta`
 * and `counted` must be present.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The ledger entry that was written and the product's new position.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }
    const storeId = user.storeId;

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const body = await request.json();
    const reason = requireManualReason(body.reason);

    const hasDelta = body.delta !== undefined && body.delta !== null && body.delta !== '';
    const hasCount = body.counted !== undefined && body.counted !== null && body.counted !== '';

    if (hasDelta === hasCount) {
      throw new AdminApiError(
        hasDelta
          ? 'Send either how many units moved, or the quantity you counted — not both'
          : 'Send either how many units moved, or the quantity you counted',
        400
      );
    }

    /* A count is a count. Recording one under "damaged" would put a stocktake variance in the
     * damage column and make shrinkage reporting meaningless. */
    if (hasCount && reason !== 'cycle_count' && reason !== 'correction') {
      throw new AdminApiError(
        'A counted quantity is recorded as a stock count or a data correction',
        400
      );
    }

    const unitCost =
      body.unit_cost === undefined || body.unit_cost === null || body.unit_cost === ''
        ? null
        : Number(body.unit_cost);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      throw new AdminApiError('Unit cost must be 0 or more', 400);
    }

    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) || null : null;

    /* Shrinkage and write-offs are the entries an auditor reads first. Requiring a note costs the
     * merchant a sentence and is the difference between "40 units vanished" and a record of what
     * they believed had happened at the time. */
    if ((reason === 'shrinkage' || reason === 'write_off') && !note) {
      throw new AdminApiError(`Add a note explaining this ${reason.replace('_', ' ')}`, 400);
    }

    const entry = await db.transaction(async (tx) => {
      const shared = {
        storeId,
        productId: id,
        reason,
        locationId: body.location_id ?? null,
        referenceType: 'manual' as const,
        actorUserId: user.userId,
        note,
        unitCost
      };

      return hasCount
        ? recountTo(shared, Number(body.counted), tx)
        : postMovement({ ...shared, delta: Number(body.delta) }, tx);
    });

    if (!entry) {
      /* A count that agreed with the book. Nothing moved, and saying so is more useful than a
       * success message implying something did. */
      return NextResponse.json({
        success: true,
        data: {
          movement: null,
          message: 'The count matched what was on record — no adjustment needed.'
        }
      });
    }

    const position = await db.query<{ on_hand: number; available: number; committed: number }>(
      `SELECT COALESCE(SUM(on_hand), 0)::int    AS on_hand,
              COALESCE(SUM(available), 0)::int  AS available,
              COALESCE(SUM(committed), 0)::int  AS committed
         FROM inventory_levels WHERE store_id = $1 AND product_id = $2`,
      [storeId, id]
    );

    const available = position.rows[0]?.available ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        movement: entry,
        position: position.rows[0],
        /* Surfaced rather than hidden. Availability below zero means the store has sold more than
         * it holds — the previous code clamped this to zero, which destroyed the evidence of
         * exactly the situation a merchant most needs to be told about. */
        oversold: available < 0,
        message:
          available < 0
            ? `Recorded. This SKU is now oversold by ${Math.abs(available)} units — those orders cannot be fulfilled from stock.`
            : 'Stock adjustment recorded.'
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.adjust');
  }
}
