/**
 * Moving stock from one location to another.
 *
 * `transferStock` has been in `src/lib/inventory/ledger.ts` since the ledger was built, correct and
 * tested, with no caller anywhere in the application. This is the caller. Without it a merchant
 * with a shop and a stockroom could record that units existed and never record them moving, which
 * is most of what an inventory system is for.
 *
 * A transfer is two ledger entries, not an edit of one balance. Both sides are visible in each
 * location's history, they net to zero across the store, and the movement is auditable from either
 * end — which is what makes "we are three units short in the shop" answerable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { transferStock } from '@/lib/inventory/ledger';

/**
 * POST /api/admin/inventory/[id]/transfer
 *
 * @param request - The incoming request, with `{ from_location_id, to_location_id, quantity, note }`.
 * @param context - Route params carrying the product id.
 * @returns Both ledger entries and the balances they left behind.
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

    const fromLocationId = String(body.from_location_id ?? '').trim();
    const toLocationId = String(body.to_location_id ?? '').trim();
    if (!fromLocationId || !toLocationId) {
      throw new AdminApiError('Choose where the stock is moving from and to', 400);
    }

    /*
     * Both locations checked against this store before anything moves. The composite foreign keys
     * on `inventory_levels` would refuse a cross-tenant location anyway, but a constraint violation
     * is not a sentence a merchant can act on — and the error would arrive after one leg of the
     * transfer had already been considered.
     */
    const locations = await db.query<{ id: string; name: string; is_active: boolean }>(
      `SELECT id, name, is_active FROM inventory_locations
        WHERE store_id = $1 AND id = ANY($2::uuid[])`,
      [user.storeId, [fromLocationId, toLocationId]]
    );
    if (locations.rows.length !== 2) {
      throw new AdminApiError('One of those locations is not in this store', 404);
    }
    const destination = locations.rows.find((l) => l.id === toLocationId);
    if (destination && !destination.is_active) {
      throw new AdminApiError(`${destination.name} is closed — stock cannot be moved into it`, 400);
    }

    const owned = await db.query<{ sku: string; name: string }>(
      'SELECT sku, name FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );
    if (owned.rows.length === 0) {
      throw new AdminApiError('That product is not in this store', 404);
    }

    const [out, into] = await transferStock({
      storeId: user.storeId,
      productId,
      fromLocationId,
      toLocationId,
      quantity: Number(body.quantity),
      actorUserId: user.userId,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null
    });

    const fromName = locations.rows.find((l) => l.id === fromLocationId)?.name ?? 'origin';
    const toName = destination?.name ?? 'destination';
    const moved = Math.abs(Number(out.delta));

    return NextResponse.json({
      success: true,
      data: {
        sku: owned.rows[0].sku,
        moved,
        from: { location_id: fromLocationId, name: fromName, balance_after: out.balance_after },
        to: { location_id: toLocationId, name: toName, balance_after: into.balance_after },
        /* Both movement ids, so the merchant can open either side of the pair in the history. */
        movements: [out.id, into.id],
        message:
          `${moved} unit${moved === 1 ? '' : 's'} moved from ${fromName} to ${toName}. `
          + `${fromName} now holds ${out.balance_after}; ${toName} holds ${into.balance_after}.`
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.transfer');
  }
}
