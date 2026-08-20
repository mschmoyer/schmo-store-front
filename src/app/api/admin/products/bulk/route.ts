/**
 * Bulk product actions.
 *
 *   POST /api/admin/products/bulk  { action, product_ids }
 *
 * The products page has posted here since before the route existed; it
 * resolved to the `[productId]` segment, which exports no POST, and returned
 * 405. Selecting twenty products and listing them was 405, and so was
 * unlisting them, and so was deleting them.
 *
 * Every statement carries `store_id`, so an id belonging to another tenant
 * matches nothing rather than being acted on — and the response reports how
 * many rows were actually touched rather than assuming the request's count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';

import {
  badRequest,
  resolveStoreId,
  unauthorized,
  zodFieldErrors,
} from '../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/** Cap per request. Twenty is a screen; a thousand is a script that wants the importer. */
const MAX_IDS = 500;

const bulkBodySchema = z
  .object({
    action: z.enum(['activate', 'deactivate', 'delete']),
    product_ids: z.array(z.string().uuid()).min(1, 'Select at least one product').max(MAX_IDS),
  })
  .strict();

/**
 * Apply one action to several products.
 * @param request - Incoming request with `{ action, product_ids }`
 * @returns How many products were changed
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = bulkBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('That bulk action is not valid.', zodFieldErrors(parsed.error));
  }

  const { action, product_ids: ids } = parsed.data;

  try {
    if (action === 'delete') {
      // `order_items.product_id` references products without ON DELETE, so a
      // product that has ever been ordered cannot be deleted — and must not be,
      // since that is somebody's order history. Those ids are reported back as
      // skipped rather than failing the whole request.
      const sold = await db.query<{ id: string }>(
        `SELECT DISTINCT p.id
           FROM products p
           JOIN order_items oi ON oi.product_id = p.id
          WHERE p.store_id = $1 AND p.id = ANY($2::uuid[])`,
        [storeId, ids],
      );
      const blocked = new Set(sold.rows.map((row) => row.id));
      const deletable = ids.filter((id) => !blocked.has(id));

      let deleted = 0;
      if (deletable.length > 0) {
        const result = await db.query(
          'DELETE FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])',
          [storeId, deletable],
        );
        deleted = result.rowCount ?? 0;
      }

      return NextResponse.json({
        success: true,
        data: {
          action,
          changed: deleted,
          skipped: blocked.size,
          message:
            blocked.size > 0
              ? `${deleted} deleted. ${blocked.size} kept because they appear in past orders — unlist those instead.`
              : `${deleted} product${deleted === 1 ? '' : 's'} deleted.`,
        },
      });
    }

    const isActive = action === 'activate';
    const result = await db.query(
      `UPDATE products
          SET is_active = $3,
              published_at = CASE WHEN $3 AND published_at IS NULL THEN NOW() ELSE published_at END,
              updated_at = NOW()
        WHERE store_id = $1 AND id = ANY($2::uuid[])`,
      [storeId, ids, isActive],
    );
    const changed = result.rowCount ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        action,
        changed,
        skipped: ids.length - changed,
        message: `${changed} product${changed === 1 ? '' : 's'} ${isActive ? 'listed' : 'unlisted'}.`,
      },
    });
  } catch (error) {
    console.error('Failed to run bulk product action:', error);
    return NextResponse.json(
      { success: false, error: 'The bulk action failed.' },
      { status: 500 },
    );
  }
}
