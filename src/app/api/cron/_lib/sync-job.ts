/**
 * ShipStation background sync job.
 *
 * Thin wrapper over the existing `BackgroundSyncService` so the cron route and
 * the CLI script share one implementation. The service already writes its
 * summary to the `sync_logs` table, so nothing is duplicated here beyond
 * resolving the base URL the service uses to call back into the app's own
 * `/api/admin/sync/*` endpoints.
 */

import BackgroundSyncService from '@/lib/services/backgroundSyncService';
import { resolveBaseUrl } from './cron-auth';

/** Per-operation result, flattened for the JSON response. */
export interface SyncOperationResult {
  operation: string;
  success: boolean;
  duration: number;
  recordsProcessed?: number;
  error?: string;
}

/** Aggregate outcome of one sync run. */
export interface SyncJobSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalDuration: number;
  timestamp: string;
  baseUrl: string;
  operations: SyncOperationResult[];
}

/**
 * Run a full ShipStation sync for every store with an active integration.
 *
 * @returns A structured summary. Individual operation failures are reported in
 *          `operations` rather than thrown, so a partial failure still yields a
 *          usable result.
 */
export async function runSyncJob(): Promise<SyncJobSummary> {
  const baseUrl = resolveBaseUrl();

  if (!process.env.SYNC_AUTH_TOKEN) {
    throw new Error(
      'SYNC_AUTH_TOKEN is not set. The sync job calls back into /api/admin/sync/* ' +
        'with this token as a bearer credential; without it every operation returns 401.',
    );
  }

  console.log(`[cron:sync] starting against ${baseUrl}`);

  const service = new BackgroundSyncService(baseUrl);
  const summary = await service.runFullSync();

  return {
    totalOperations: summary.totalOperations,
    successfulOperations: summary.successfulOperations,
    failedOperations: summary.failedOperations,
    totalDuration: summary.totalDuration,
    timestamp: summary.timestamp,
    baseUrl,
    operations: summary.results.map((result) => ({
      operation: result.operation,
      success: result.success,
      duration: result.duration,
      recordsProcessed: result.recordsProcessed,
      error: result.error,
    })),
  };
}
