/**
 * Daily inventory snapshot job.
 *
 * This module is the single implementation of the job that used to live inline
 * in `scripts/inventory-snapshot.js`. The cron route invokes it directly; the
 * CLI script is now a thin HTTP trigger, so there is exactly one copy of the
 * logic.
 */

import { db } from '@/lib/database/connection';
import { inventorySnapshotService } from '@/lib/services/inventorySnapshotService';

/** Outcome for a single store. */
export interface SnapshotStoreResult {
  operation: string;
  storeId: string;
  storeName: string;
  success: boolean;
  skipped: boolean;
  duration: number;
  snapshotId?: string;
  error?: string;
}

/** Aggregate outcome of one job run. */
export interface SnapshotJobSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  skippedOperations: number;
  totalDuration: number;
  timestamp: string;
  results: SnapshotStoreResult[];
}

interface StoreRow extends Record<string, unknown> {
  id: string;
  store_name: string;
}

/**
 * Persist a run summary to the shared `sync_logs` table.
 *
 * Note: the columns used here are the ones `sync_logs` actually has
 * (migration 015). The previous CommonJS script inserted `store_id`,
 * `sync_type`, `status`, `items_synced`, `details`, `started_at` and
 * `completed_at`, none of which exist — every one of those inserts failed at
 * runtime and was swallowed.
 *
 * @param summary - The completed run summary.
 */
async function logSnapshotRun(summary: SnapshotJobSummary): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sync_logs (
         timestamp,
         total_operations,
         successful_operations,
         failed_operations,
         total_duration,
         results
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        summary.timestamp,
        summary.totalOperations,
        summary.successfulOperations,
        summary.failedOperations,
        summary.totalDuration,
        JSON.stringify(summary.results),
      ],
    );
  } catch (error) {
    // Logging must never fail the job.
    console.error('[cron:inventory-snapshot] failed to write sync_logs row:', error);
  }
}

/**
 * Create today's inventory snapshot for every active store.
 *
 * Stores that already have a snapshot for the target date are skipped, so the
 * job is safe to run more than once a day and safe to retry.
 *
 * @param snapshotDate - Date to snapshot. Defaults to now.
 * @returns A structured summary of the run.
 */
export async function runInventorySnapshotJob(
  snapshotDate: Date = new Date(),
): Promise<SnapshotJobSummary> {
  const startedAt = Date.now();
  const dateLabel = snapshotDate.toISOString().split('T')[0];
  const results: SnapshotStoreResult[] = [];

  console.log(`[cron:inventory-snapshot] starting for ${dateLabel}`);

  const storesResult = await db.query<StoreRow>(
    'SELECT id, store_name FROM stores WHERE is_active = true ORDER BY store_name',
  );
  const stores = storesResult.rows;
  console.log(`[cron:inventory-snapshot] ${stores.length} active store(s)`);

  for (const store of stores) {
    const storeStart = Date.now();
    const base = {
      operation: 'inventory_snapshot',
      storeId: store.id,
      storeName: store.store_name,
    };

    try {
      if (await inventorySnapshotService.snapshotExists(store.id, snapshotDate)) {
        results.push({
          ...base,
          success: true,
          skipped: true,
          duration: Date.now() - storeStart,
        });
        console.log(`[cron:inventory-snapshot] ${store.store_name}: already exists, skipped`);
        continue;
      }

      const created = await inventorySnapshotService.createDailySnapshot(store.id, snapshotDate);

      if (created.success) {
        results.push({
          ...base,
          success: true,
          skipped: false,
          duration: Date.now() - storeStart,
          snapshotId: created.snapshotId,
        });
        console.log(`[cron:inventory-snapshot] ${store.store_name}: ${created.snapshotId}`);
      } else {
        results.push({
          ...base,
          success: false,
          skipped: false,
          duration: Date.now() - storeStart,
          error: created.error ?? 'Unknown error',
        });
        console.error(`[cron:inventory-snapshot] ${store.store_name} failed: ${created.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        ...base,
        success: false,
        skipped: false,
        duration: Date.now() - storeStart,
        error: message,
      });
      console.error(`[cron:inventory-snapshot] ${store.store_name} threw: ${message}`);
    }
  }

  const skippedOperations = results.filter((r) => r.skipped).length;
  const failedOperations = results.filter((r) => !r.success).length;

  const summary: SnapshotJobSummary = {
    totalOperations: results.length,
    successfulOperations: results.filter((r) => r.success && !r.skipped).length,
    failedOperations,
    skippedOperations,
    totalDuration: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
    results,
  };

  await logSnapshotRun(summary);

  console.log(
    `[cron:inventory-snapshot] done in ${summary.totalDuration}ms ` +
      `(created ${summary.successfulOperations}, skipped ${skippedOperations}, failed ${failedOperations})`,
  );

  return summary;
}
