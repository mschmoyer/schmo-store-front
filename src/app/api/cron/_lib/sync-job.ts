/**
 * ShipStation background sync job.
 *
 * Thin wrapper over `BackgroundSyncService` so the cron route and the CLI script
 * share one implementation.
 *
 * NOTE ON SEMANTICS — this used to be an executor and is now a *scheduler*.
 *
 * The old version called back into the app's own `/api/admin/sync/*` endpoints
 * over HTTP and waited for every operation to finish, which meant one cron
 * invocation had to crawl every store's entire ShipStation catalogue inside a
 * single serverless function. On Vercel that is bounded by `maxDuration`, so a
 * merchant with a large catalogue would have their sync truncated mid-run with
 * no way to resume.
 *
 * `runFullSync()` now enqueues one job per store per operation and returns as
 * soon as they are queued, so this call scales with the number of *stores*
 * rather than with catalogue size. The queue drain does the actual crawling and
 * can resume. That also removes the self-call, so `SYNC_AUTH_TOKEN` and the
 * base-URL resolution are no longer part of this path.
 */

import BackgroundSyncService from '@/lib/services/backgroundSyncService';

/** What was scheduled for a single store. */
export interface StoreScheduleReport {
  storeId: string;
  storeName: string;
  /** Jobs enqueued. Zero means every operation already had work outstanding. */
  enqueued: number;
  operations: string[];
  error?: string;
}

/** Aggregate outcome of one scheduling pass. */
export interface SyncJobSummary {
  storesConsidered: number;
  storesScheduled: number;
  jobsEnqueued: number;
  /** Stores that could not be scheduled at all. */
  storesFailed: number;
  durationMs: number;
  timestamp: string;
  stores: StoreScheduleReport[];
}

/**
 * Enqueue a ShipStation sync for every store with an active integration.
 *
 * @returns A structured summary of what was scheduled. A store that fails to
 *          schedule is reported in `stores[].error` rather than thrown, so one
 *          bad tenant cannot stop the rest of the run.
 * @throws {Error} Only when store discovery itself fails.
 */
export async function runSyncJob(): Promise<SyncJobSummary> {
  console.log('[cron:sync] scheduling ShipStation sync');

  const service = new BackgroundSyncService();
  const summary = await service.runFullSync();

  const stores: StoreScheduleReport[] = summary.results.map((result) => ({
    storeId: result.storeId,
    storeName: result.storeName,
    enqueued: result.enqueued,
    operations: result.operations,
    error: result.error,
  }));

  return {
    storesConsidered: summary.storesConsidered,
    storesScheduled: summary.storesScheduled,
    jobsEnqueued: summary.jobsEnqueued,
    storesFailed: stores.filter((store) => store.error !== undefined).length,
    durationMs: summary.durationMs,
    timestamp: summary.timestamp,
    stores,
  };
}
