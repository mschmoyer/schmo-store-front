/**
 * One stock location: rename it, retire it, or make it the default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';

/**
 * PATCH /api/admin/inventory/locations/[locationId]
 *
 * @param request - The incoming request.
 * @param context - Route parameters.
 * @returns The updated location.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ locationId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { locationId } = await context.params;
    const body = await request.json().catch(() => ({}));

    const updated = await db.transaction(async (tx) => {
      const owned = await tx.query<{ id: string; is_default: boolean }>(
        'SELECT id, is_default FROM inventory_locations WHERE id = $1 AND store_id = $2 FOR UPDATE',
        [locationId, user.storeId]
      );
      if (owned.rows.length === 0) throw new AdminApiError('Location not found', 404);

      /* Exactly one default, always: it is where a movement with no location named goes. Demoting
       * the old one and promoting the new one has to happen together. */
      if (body.is_default === true) {
        await tx.query(
          'UPDATE inventory_locations SET is_default = false WHERE store_id = $1 AND id <> $2',
          [user.storeId, locationId]
        );
      } else if (body.is_default === false && owned.rows[0].is_default) {
        throw new AdminApiError(
          'Every store needs a default location. Make another one the default instead.',
          400
        );
      }

      const assignments: string[] = [];
      const values: unknown[] = [];

      if (typeof body.name === 'string' && body.name.trim()) {
        values.push(body.name.trim().slice(0, 255));
        assignments.push(`name = $${values.length}`);
      }
      if (typeof body.is_fulfillable === 'boolean') {
        values.push(body.is_fulfillable);
        assignments.push(`is_fulfillable = $${values.length}`);
      }
      if (body.is_default === true) assignments.push('is_default = true');
      if (typeof body.is_active === 'boolean') {
        if (!body.is_active && owned.rows[0].is_default) {
          throw new AdminApiError('The default location cannot be deactivated', 400);
        }
        values.push(body.is_active);
        assignments.push(`is_active = $${values.length}`);
      }

      if (assignments.length === 0) throw new AdminApiError('Nothing to update', 400);

      values.push(locationId, user.storeId);
      const result = await tx.query(
        `UPDATE inventory_locations SET ${assignments.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length - 1} AND store_id = $${values.length}
          RETURNING id, code, name, location_type, is_default, is_fulfillable, is_active, priority`,
        values
      );
      return result.rows[0];
    });

    return NextResponse.json({ success: true, location: updated });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.locations.update');
  }
}

/**
 * DELETE /api/admin/inventory/locations/[locationId]
 *
 * Refused while the location still holds stock. Deleting it would either orphan the ledger rows
 * that describe those units or silently write them off, and a location disappearing is not a reason
 * for stock to vanish — the merchant has to say where the units went first.
 *
 * @param request - The incoming request.
 * @param context - Route parameters.
 * @returns Confirmation, or an explanation of what is in the way.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ locationId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { locationId } = await context.params;

    const result = await db.transaction(async (tx) => {
      const owned = await tx.query<{ id: string; name: string; is_default: boolean }>(
        'SELECT id, name, is_default FROM inventory_locations WHERE id = $1 AND store_id = $2',
        [locationId, user.storeId]
      );
      if (owned.rows.length === 0) throw new AdminApiError('Location not found', 404);
      if (owned.rows[0].is_default) {
        throw new AdminApiError(
          'This is the default location, where stock goes when nothing else is named. Make another '
            + 'location the default before removing this one.',
          400
        );
      }

      const held = await tx.query<{ skus: string; units: string }>(
        `SELECT COUNT(*) FILTER (WHERE on_hand <> 0) AS skus, COALESCE(SUM(on_hand), 0) AS units
           FROM inventory_levels WHERE location_id = $1 AND store_id = $2`,
        [locationId, user.storeId]
      );
      const skus = Number(held.rows[0]?.skus ?? 0);
      const units = Number(held.rows[0]?.units ?? 0);

      if (skus > 0) {
        throw new AdminApiError(
          `${owned.rows[0].name} still holds ${units} unit${units === 1 ? '' : 's'} across `
            + `${skus} product${skus === 1 ? '' : 's'}. Transfer or count them out first — removing `
            + 'the location cannot decide what happened to the stock.',
          409
        );
      }

      /* Deactivated rather than deleted when it has history: the ledger rows naming it are the
       * record of where units used to be, and they have to keep resolving. */
      const hasHistory = await tx.query(
        'SELECT 1 FROM inventory_transactions WHERE location_id = $1 LIMIT 1',
        [locationId]
      );
      if (hasHistory.rows.length > 0) {
        await tx.query(
          'UPDATE inventory_locations SET is_active = false, updated_at = NOW() WHERE id = $1 AND store_id = $2',
          [locationId, user.storeId]
        );
        return { retired: true };
      }

      await tx.query('DELETE FROM inventory_levels WHERE location_id = $1 AND store_id = $2', [
        locationId,
        user.storeId
      ]);
      await tx.query('DELETE FROM inventory_locations WHERE id = $1 AND store_id = $2', [
        locationId,
        user.storeId
      ]);
      return { retired: false };
    });

    return NextResponse.json({
      success: true,
      message: result.retired
        ? 'Location closed. Its movement history is kept, so past records still resolve.'
        : 'Location removed.'
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.locations.delete');
  }
}
