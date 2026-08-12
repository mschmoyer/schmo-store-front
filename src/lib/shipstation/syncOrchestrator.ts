/**
 * Turns "sync this store" into a chain of small, resumable `job_queue` rows.
 *
 * The audit's recommended architecture, implemented: one job per page, each job enqueuing the next
 * page on success, drained by `/api/jobs/process` on a Vercel Cron. Nothing here loops over a whole
 * catalogue inside one invocation, so no single unit of work can exceed a serverless limit, and a
 * crash costs one page rather than the run.
 *
 * Progress lives in `sync_runs` (migration 022): `last_page_completed` is the cursor, so a run that
 * dies at page 37 resumes at 38 instead of restarting at 1 (P1-3).
 *
 * This module deliberately does **not** contain a queue. `jobQueueService` already had a good one —
 * priority ordering, bounded batches, exponential backoff, an operator retry hatch — that nothing
 * ever called (P1-5). Reusing it, rather than building a second mechanism, is the whole point.
 */

import { db } from '@/lib/database/connection';
import { jobQueueService } from '@/lib/services/jobQueueService';
import { getIntegration, recordSyncStatus } from './credentials';
import {
  PAGED_OPERATIONS,
  SYNC_OPERATIONS,
  runSyncPage,
  type SyncNetworkOptions,
  type SyncOperation
} from './sync';

/** A row of `sync_runs`. */
export interface SyncRun {
  id: string;
  storeId: string;
  operation: SyncOperation;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  lastPageCompleted: number;
  recordsProcessed: number;
  recordsAdded: number;
  recordsUpdated: number;
  errorMessage: string | null;
}

/** Payload of a `shipstation_sync_page` job. */
export interface SyncPageJobPayload extends Record<string, unknown> {
  store_id: string;
  operation: SyncOperation;
  page: number;
  run_id: string;
}

/** Row shape returned by the `sync_runs` queries. */
type SyncRunRow = {
  id: string;
  store_id: string;
  operation: string;
  status: string;
  last_page_completed: number;
  records_processed: number;
  records_added: number;
  records_updated: number;
  error_message: string | null;
};

/**
 * Map a database row to the domain object.
 *
 * @param row - Row from `sync_runs`.
 * @returns The run.
 */
function toRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    storeId: row.store_id,
    operation: row.operation as SyncOperation,
    status: row.status as SyncRun['status'],
    lastPageCompleted: row.last_page_completed,
    recordsProcessed: row.records_processed,
    recordsAdded: row.records_added,
    recordsUpdated: row.records_updated,
    errorMessage: row.error_message
  };
}

/**
 * Find an in-flight run for a store and operation, or start a new one.
 *
 * Resuming rather than restarting is what makes a partial failure cheap: the returned run's
 * `lastPageCompleted` tells the caller where to pick up.
 *
 * @param storeId - Store UUID.
 * @param operation - Sync operation.
 * @returns The run to work on.
 */
export async function startOrResumeRun(
  storeId: string,
  operation: SyncOperation
): Promise<SyncRun> {
  const existing = await db.query<SyncRunRow>(
    `SELECT * FROM sync_runs
      WHERE store_id = $1 AND operation = $2 AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1`,
    [storeId, operation]
  );

  if (existing.rows[0]) {
    return toRun(existing.rows[0]);
  }

  const created = await db.query<SyncRunRow>(
    `INSERT INTO sync_runs (store_id, operation, status)
     VALUES ($1, $2, 'running')
     RETURNING *`,
    [storeId, operation]
  );

  return toRun(created.rows[0]);
}

/**
 * Advance a run's cursor after a page landed.
 *
 * @param runId - Run UUID.
 * @param page - Page that just completed.
 * @param counts - Records touched by that page.
 * @returns Nothing.
 */
export async function advanceRun(
  runId: string,
  page: number,
  counts: { processed: number; added: number; updated: number }
): Promise<void> {
  await db.query(
    `UPDATE sync_runs
        SET last_page_completed = GREATEST(last_page_completed, $2),
            records_processed = records_processed + $3,
            records_added = records_added + $4,
            records_updated = records_updated + $5,
            updated_at = NOW()
      WHERE id = $1`,
    [runId, page, counts.processed, counts.added, counts.updated]
  );
}

/**
 * Close a run.
 *
 * @param runId - Run UUID.
 * @param status - Terminal status.
 * @param errorMessage - Failure detail, when relevant.
 * @returns Nothing.
 */
export async function finishRun(
  runId: string,
  status: 'completed' | 'failed' | 'cancelled',
  errorMessage?: string | null
): Promise<void> {
  await db.query(
    `UPDATE sync_runs
        SET status = $2, error_message = $3, finished_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [runId, status, errorMessage ?? null]
  );
}

/**
 * Read a run by id.
 *
 * @param runId - Run UUID.
 * @returns The run, or null.
 */
export async function getRun(runId: string): Promise<SyncRun | null> {
  const result = await db.query<SyncRunRow>('SELECT * FROM sync_runs WHERE id = $1', [runId]);
  return result.rows[0] ? toRun(result.rows[0]) : null;
}

/**
 * Enqueue the job that syncs one page.
 *
 * The dedupe key means re-triggering a sync while one is already queued is a no-op rather than a
 * duplicate crawl (enforced by the partial unique index added in 022).
 *
 * @param payload - Which store, operation and page.
 * @param priority - Queue priority.
 * @returns The job id, or null when an identical job was already outstanding.
 */
export async function enqueueSyncPage(
  payload: SyncPageJobPayload,
  priority: 'low' | 'medium' | 'high' = 'low'
): Promise<string | null> {
  return jobQueueService.addJob('shipstation_sync_page', payload, priority, undefined, {
    storeId: payload.store_id,
    dedupeKey: `sync:${payload.store_id}:${payload.operation}:${payload.page}`
  });
}

/**
 * Kick off a full sync for one store by enqueuing the first page of every operation.
 *
 * Operations are independent chains, so a catalogue that 404s does not stop inventory from
 * syncing. That is the opposite of the old behaviour, where the first failing page aborted
 * everything.
 *
 * @param storeId - Store UUID.
 * @param operations - Operations to run. Defaults to all of them.
 * @returns The runs that were started, and how many jobs were enqueued.
 */
export async function enqueueStoreSync(
  storeId: string,
  operations: readonly SyncOperation[] = SYNC_OPERATIONS
): Promise<{ runs: SyncRun[]; enqueued: number }> {
  const runs: SyncRun[] = [];
  let enqueued = 0;

  for (const operation of operations) {
    const run = await startOrResumeRun(storeId, operation);
    runs.push(run);

    const jobId = await enqueueSyncPage({
      store_id: storeId,
      operation,
      page: run.lastPageCompleted + 1,
      run_id: run.id
    });

    if (jobId) {
      enqueued++;
    }
  }

  await recordSyncStatus(storeId, 'running');

  return { runs, enqueued };
}

/**
 * Execute one page-sync job.
 *
 * Called by `jobQueueService` when it drains a `shipstation_sync_page` row. On success it enqueues
 * the next page (if any) and returns true; on the last page it closes the run and writes the
 * store-scoped `sync_logs` entry. Returning false hands the job back to the queue's retry/backoff.
 *
 * @param payload - The job payload.
 * @param network - Injected network primitives, for tests.
 * @returns True when the page was processed.
 */
export async function processSyncPageJob(
  payload: SyncPageJobPayload,
  network: SyncNetworkOptions = {}
): Promise<boolean> {
  const { store_id: storeId, operation, page, run_id: runId } = payload;

  const run = await getRun(runId);
  if (!run || run.status !== 'running') {
    // The run was closed or cancelled while this job sat in the queue. Nothing to do, and this is
    // a success from the queue's point of view — retrying would not change it.
    console.info(`Skipping sync page job for closed run ${runId}`);
    return true;
  }

  const integration = await getIntegration(storeId, { activeOnly: true });
  if (!integration?.apiKey) {
    await finishRun(runId, 'failed', 'ShipStation integration is inactive or has no API key');
    await recordSyncStatus(storeId, 'failed', 'ShipStation integration is inactive');
    return true;
  }

  const started = Date.now();

  try {
    const result = await runSyncPage(operation, integration.apiKey, storeId, page, network);
    await advanceRun(runId, page, result);

    const morePages = result.hasMore && PAGED_OPERATIONS.includes(operation);

    if (morePages) {
      await enqueueSyncPage({ store_id: storeId, operation, page: page + 1, run_id: runId });
      return true;
    }

    await finishRun(runId, 'completed');

    const finalRun = await getRun(runId);
    await writeSyncLog(storeId, {
      operation,
      success: true,
      duration: Date.now() - started,
      recordsProcessed: finalRun?.recordsProcessed ?? result.processed
    });

    await maybeMarkStoreSyncComplete(storeId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    console.error(`ShipStation ${operation} page ${page} failed for store ${storeId}:`, message);

    await finishRun(runId, 'failed', message);
    await recordSyncStatus(storeId, 'failed', message);
    await writeSyncLog(storeId, {
      operation,
      success: false,
      duration: Date.now() - started,
      error: message
    });

    // Reported as a job failure so the queue's backoff gets a chance; the run is reopened on the
    // next scheduled sync, which resumes from the cursor rather than page 1.
    return false;
  }
}

/** One line of a `sync_logs` entry. */
interface SyncLogEntry {
  operation: string;
  success: boolean;
  duration: number;
  recordsProcessed?: number;
  error?: string;
}

/**
 * Write a store-scoped `sync_logs` row.
 *
 * `sync_logs` previously had no `store_id` at all, which is precisely why `/api/admin/sync/status`
 * could not be scoped and leaked every tenant's history (P1-4). Migration 022 added the column;
 * this is the only writer.
 *
 * @param storeId - Store UUID.
 * @param entry - The operation result to record.
 * @returns Nothing; logging failures never break a sync.
 */
export async function writeSyncLog(storeId: string, entry: SyncLogEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sync_logs (
         store_id, timestamp, total_operations, successful_operations,
         failed_operations, total_duration, results
       ) VALUES ($1, NOW(), 1, $2, $3, $4, $5)`,
      [
        storeId,
        entry.success ? 1 : 0,
        entry.success ? 0 : 1,
        entry.duration,
        JSON.stringify([entry])
      ]
    );
  } catch (error) {
    console.error('Failed to write sync log:', error);
  }
}

/**
 * Mark the integration healthy once no run for the store is still open.
 *
 * @param storeId - Store UUID.
 * @returns Nothing.
 */
async function maybeMarkStoreSyncComplete(storeId: string): Promise<void> {
  const open = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sync_runs WHERE store_id = $1 AND status = 'running'`,
    [storeId]
  );

  if (Number(open.rows[0]?.count ?? '0') === 0) {
    await recordSyncStatus(storeId, 'completed', null);
  }
}
