/**
 * Scheduled ShipStation sync.
 *
 * What this used to be: a service that queried a table called `integrations` (which does not exist),
 * selected `s.name` (which is `store_name`), threw, caught its own error, and returned `[]` — so
 * every run logged "No active ShipStation integrations found" and did nothing, forever. And if that
 * had worked, each operation was invoked over internal HTTP with
 * `Authorization: Bearer $SYNC_AUTH_TOKEN`, which `requireAuth` tries to verify as a signed session
 * JWT and rejects. Two independent failures; `sync_logs` had zero rows (audit P0-4).
 *
 * What it is now:
 *
 * - Store discovery is a single query checked against the live schema, in
 *   `credentials.getActiveShipStationStores()`, and it does **not** swallow errors.
 * - Nothing is invoked over HTTP. There is no internal request, no bearer token, and therefore no
 *   auth layer to get wrong. Sync is enqueued in-process as `job_queue` rows.
 * - No sync work happens in this service's own invocation. It only enqueues; `/api/jobs/process`
 *   does the work, one page per job. A store with 5,000 products no longer needs a single
 *   invocation that can outlive a serverless limit.
 */

import { db } from '@/lib/database/connection';
import { getActiveShipStationStores } from '@/lib/shipstation/credentials';
import { enqueueStoreSync } from '@/lib/shipstation/syncOrchestrator';
import { SYNC_OPERATIONS, type SyncOperation } from '@/lib/shipstation/sync';

/** A store eligible for scheduled sync. */
export interface ActiveStore {
  id: string;
  name: string;
}

/** What one scheduling pass did for a single store. */
export interface StoreScheduleResult {
  storeId: string;
  storeName: string;
  /** Jobs enqueued. Zero means every operation already had work outstanding. */
  enqueued: number;
  operations: SyncOperation[];
  error?: string;
}

/** What one scheduling pass did overall. */
export interface SyncScheduleSummary {
  storesConsidered: number;
  storesScheduled: number;
  jobsEnqueued: number;
  results: StoreScheduleResult[];
  durationMs: number;
  timestamp: string;
}

/** One recorded sync operation, as stored in `sync_logs.results`. */
export interface SyncLogResult {
  operation: string;
  success: boolean;
  duration: number;
  recordsProcessed?: number;
  error?: string;
}

/** A `sync_logs` row, scoped to one store. */
export interface SyncHistoryEntry {
  storeId: string | null;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalDuration: number;
  results: SyncLogResult[];
  timestamp: string;
}

/**
 * Schedules ShipStation synchronisation.
 */
export class BackgroundSyncService {
  /**
   * List stores with an active, credentialled ShipStation integration.
   *
   * @returns Eligible stores.
   * @throws {Error} When the query fails. Deliberately not swallowed: a broken query must look
   *   like a broken query, not like "no work to do".
   */
  async getActiveStores(): Promise<ActiveStore[]> {
    const stores = await getActiveShipStationStores();
    return stores.map((store) => ({ id: store.id, name: store.name }));
  }

  /**
   * Enqueue sync work for one store.
   *
   * @param store - Store to sync.
   * @param operations - Operations to run. Defaults to all of them.
   * @returns What was enqueued.
   */
  async syncStore(
    store: ActiveStore,
    operations: readonly SyncOperation[] = SYNC_OPERATIONS
  ): Promise<StoreScheduleResult> {
    try {
      const { enqueued } = await enqueueStoreSync(store.id, operations);

      return {
        storeId: store.id,
        storeName: store.name,
        enqueued,
        operations: [...operations]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to schedule ShipStation sync for store ${store.id}:`, message);

      return {
        storeId: store.id,
        storeName: store.name,
        enqueued: 0,
        operations: [...operations],
        error: message
      };
    }
  }

  /**
   * Enqueue sync work for every eligible store.
   *
   * Returns as soon as the jobs are queued. The actual crawling happens in the queue drain, which
   * is the whole point: this call is bounded by the number of stores, not by catalogue size.
   *
   * @returns A summary of what was scheduled.
   * @throws {Error} When store discovery fails.
   */
  async runFullSync(): Promise<SyncScheduleSummary> {
    const started = Date.now();
    const stores = await this.getActiveStores();

    if (stores.length === 0) {
      console.log('No stores have an active ShipStation integration with a stored API key');
      return {
        storesConsidered: 0,
        storesScheduled: 0,
        jobsEnqueued: 0,
        results: [],
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString()
      };
    }

    const results: StoreScheduleResult[] = [];
    for (const store of stores) {
      results.push(await this.syncStore(store));
    }

    const jobsEnqueued = results.reduce((total, result) => total + result.enqueued, 0);

    console.log(
      `Scheduled ShipStation sync for ${results.length} store(s); ${jobsEnqueued} job(s) enqueued`
    );

    return {
      storesConsidered: stores.length,
      storesScheduled: results.filter((result) => !result.error).length,
      jobsEnqueued,
      results,
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Read recent sync history for one store.
   *
   * The `storeId` argument is required. `sync_logs` had no `store_id` column at all before
   * migration 022, which is exactly why the status endpoint could not scope its reads and returned
   * every tenant's history to every merchant admin (audit P1-4).
   *
   * @param storeId - Store to read history for.
   * @param limit - Maximum entries.
   * @returns Most recent entries first.
   */
  async getSyncHistory(storeId: string, limit: number = 20): Promise<SyncHistoryEntry[]> {
    if (!storeId) {
      throw new Error('getSyncHistory requires a store scope');
    }

    const result = await db.query<{
      store_id: string | null;
      timestamp: Date;
      total_operations: number;
      successful_operations: number;
      failed_operations: number;
      total_duration: number;
      results: SyncLogResult[] | null;
    }>(
      `SELECT store_id, timestamp, total_operations, successful_operations,
              failed_operations, total_duration, results
         FROM sync_logs
        WHERE store_id = $1
        ORDER BY timestamp DESC
        LIMIT $2`,
      [storeId, limit]
    );

    return result.rows.map((row) => ({
      storeId: row.store_id,
      totalOperations: row.total_operations,
      successfulOperations: row.successful_operations,
      failedOperations: row.failed_operations,
      totalDuration: row.total_duration,
      results: row.results ?? [],
      timestamp: row.timestamp.toISOString()
    }));
  }
}

export default BackgroundSyncService;
