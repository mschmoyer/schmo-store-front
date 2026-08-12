/**
 * Factory for the single-operation `/api/admin/sync/*` routes.
 *
 * Products, warehouses, inventory, inventory warehouses and inventory locations each had their own
 * route file containing the same handler around a different endpoint — five copies of the auth
 * check, the credential read and the response envelope, which is how they drifted apart in the
 * first place. Each route is now a name and an operation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import {
  collectErrors,
  runManualSync,
  toCounts,
  type ManualSyncOptions
} from '@/lib/shipstation/manualSync';
import type { SyncOperation } from '@/lib/shipstation/sync';
import { statusForResult, syncErrorResponse } from './respond';

/**
 * Build a POST handler that runs one or more sync operations for the caller's store.
 *
 * @param operations - Operations to run, in dependency order.
 * @param label - Human-readable name used in the response message and log lines.
 * @param options - Extra knobs forwarded to `runManualSync`.
 * @returns A Next.js route handler.
 */
export function createSyncRoute(
  operations: readonly SyncOperation[],
  label: string,
  options: Omit<ManualSyncOptions, 'operations'> = {}
) {
  /**
   * Run the configured operations.
   *
   * @param request - Inbound admin request.
   * @returns Counts for the operations that ran, plus any errors.
   */
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const user = await requireAuth(request);

      if (!user.storeId) {
        return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
      }

      const result = await runManualSync(user.storeId, { ...options, operations });
      const errors = collectErrors(result);

      return NextResponse.json(
        {
          success: result.success,
          message: result.success
            ? `${label} synced successfully`
            : `${label} sync finished with ${errors.length} error(s)`,
          data: toCounts(result.operations),
          errors,
          truncated: result.operations.some((entry) => entry.truncated),
          durationMs: result.durationMs
        },
        { status: statusForResult(result) }
      );
    } catch (error) {
      return syncErrorResponse(error, `sync:${label.toLowerCase()}`);
    }
  };
}
