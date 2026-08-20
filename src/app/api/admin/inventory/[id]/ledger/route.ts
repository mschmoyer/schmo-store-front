/**
 * A product's stock movement history.
 *
 * The data for this has been accumulating since the platform was built and nothing has ever
 * displayed it. `inventory_logs` was written by four different code paths and read by one — the
 * catalogue list, which showed the last five rows as an unlabelled "recent changes" array nothing
 * rendered. A merchant investigating a discrepancy had no way to ask what happened to a SKU.
 *
 * The answer to that question is the point of keeping a ledger, so it gets its own endpoint:
 * filterable by reason and by date, exportable, and paginated so a fast-moving SKU's history is
 * readable rather than a wall.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse } from '@/lib/api/adminError';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every reason the ledger records, including the ones only the system posts. */
const ALL_REASONS = new Set([
  'initial_stock', 'sale', 'return_to_stock', 'po_receipt', 'transfer_in', 'transfer_out',
  'cycle_count', 'damage', 'shrinkage', 'expiry', 'sample', 'write_off', 'correction',
  'sync_correction'
]);

/**
 * GET /api/admin/inventory/[id]/ledger
 *
 * The movements that produced this product's current balance, newest first.
 *
 * Query parameters: `page`, `limit`, `reason`, `location_id`, `from`, `to`.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The movements, a per-reason summary for the filtered range, and pagination metadata.
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['t.store_id = $1', 't.product_id = $2'];
    const values: unknown[] = [user.storeId, id];
    const next = () => `$${values.length + 1}`;

    const reason = searchParams.get('reason');
    if (reason && ALL_REASONS.has(reason)) {
      conditions.push(`t.reason = ${next()}::inventory_reason`);
      values.push(reason);
    }

    const locationId = searchParams.get('location_id');
    if (locationId && UUID.test(locationId)) {
      conditions.push(`t.location_id = ${next()}::uuid`);
      values.push(locationId);
    }

    /* Dates are validated rather than passed through. An unparseable date reaching Postgres raised
     * `invalid input syntax` and, because the old routes echoed error messages, printed the raw
     * database error to the caller. */
    const from = parseDate(searchParams.get('from'));
    if (from) {
      conditions.push(`t.created_at >= ${next()}::timestamptz`);
      values.push(from);
    }

    const to = parseDate(searchParams.get('to'));
    if (to) {
      conditions.push(`t.created_at < ${next()}::timestamptz + INTERVAL '1 day'`);
      values.push(to);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [entries, count, summary] = await Promise.all([
      db.query(
        `SELECT t.id, t.reason, t.delta, t.balance_after, t.unit_cost, t.note, t.created_at,
                t.reference_type, t.reference_id,
                l.name AS location_name,
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS actor_name,
                u.email AS actor_email
           FROM inventory_transactions t
           JOIN inventory_locations l ON l.id = t.location_id
           LEFT JOIN users u ON u.id = t.actor_user_id
           ${where}
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT ${next()} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM inventory_transactions t ${where}`,
        values
      ),
      /* Where the units went, over the filtered range. This is the shape of the question a merchant
       * actually asks — "we lost 60 units this quarter, to what?" — and it is one GROUP BY away
       * once the reason vocabulary is closed. */
      db.query(
        `SELECT t.reason,
                COUNT(*)::int        AS movements,
                SUM(t.delta)::int    AS net_units,
                SUM(GREATEST(t.delta, 0))::int AS units_in,
                SUM(LEAST(t.delta, 0))::int    AS units_out
           FROM inventory_transactions t ${where}
          GROUP BY t.reason
          ORDER BY ABS(SUM(t.delta)) DESC`,
        values
      )
    ]);

    const total = count.rows[0]?.total ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        movements: entries.rows.map((row) => ({
          ...row,
          unit_cost: row.unit_cost === null ? null : Number(row.unit_cost)
        })),
        summary: summary.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasNext: offset + entries.rows.length < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.ledger');
  }
}

/**
 * Parse a `YYYY-MM-DD` query parameter, rejecting anything else.
 *
 * @param value - The raw parameter.
 * @returns The date string when valid, otherwise null.
 */
function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}
