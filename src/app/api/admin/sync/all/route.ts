/**
 * POST /api/admin/sync/all
 *
 * The admin "Sync All" button. Runs every ShipStation operation for the caller's store
 * synchronously and reports what actually happened.
 *
 * The previous implementation wrapped each of its five steps in a `try/catch` that logged and
 * continued, then returned `success: true, 'All data synced successfully'` unconditionally — so a
 * run that wrote nothing at all still lit up a green toast. Failures are now carried in the
 * response, and `success` means every operation succeeded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { collectErrors, runManualSync, toCounts } from '@/lib/shipstation/manualSync';
import { statusForResult, syncErrorResponse } from '../_lib/respond';

/** Node runtime: the sync writers talk to Postgres. */
export const runtime = 'nodejs';

/** Never cached: this mutates. */
export const dynamic = 'force-dynamic';

/** Matches the `vercel.json` budget for `src/app/api/admin/sync/**`. */
export const maxDuration = 300;

/**
 * Run every sync operation for the caller's store.
 *
 * @param request - Inbound admin request.
 * @returns Per-area counts, plus any per-operation errors.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);

    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const result = await runManualSync(user.storeId);
    const by = (...operations: string[]) =>
      toCounts(result.operations.filter((entry) => operations.includes(entry.operation)));

    const errors = collectErrors(result);

    return NextResponse.json(
      {
        success: result.success,
        message: result.success
          ? 'All data synced successfully'
          : `Synced with ${errors.length} failed operation(s)`,
        data: {
          products: by('products'),
          inventory: by('inventory'),
          warehouses: by('warehouses'),
          // Inventory warehouses and locations have always been reported as one "locations" figure.
          locations: by('inventory-warehouses', 'inventory-locations')
        },
        errors,
        truncated: result.operations.some((entry) => entry.truncated),
        durationMs: result.durationMs
      },
      { status: statusForResult(result) }
    );
  } catch (error) {
    return syncErrorResponse(error, 'sync:all');
  }
}
