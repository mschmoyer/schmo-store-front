/**
 * Operator-triggered ShipStation sync that finishes inside its own request.
 *
 * The scheduled path (`/api/cron/sync` → `syncOrchestrator`) enqueues `job_queue` rows and lets a
 * queue drain turn one page per invocation, which is what keeps a large catalogue inside
 * `maxDuration`. That design needs something to drain the queue; until a cron does, the admin
 * "Sync" button needs a path that completes on its own.
 *
 * This module is that path. It loops the same {@link runSyncPage} operations the queue would have
 * run, in the same dependency order, inside the caller's invocation — identical writers, identical
 * rate-limit and retry handling via `shipStationFetch`, identical store-scoped `sync_logs` rows.
 * The only difference is who turns the pages.
 *
 * Replaces the hand-rolled fetch-and-upsert loops that used to live beside each
 * `/api/admin/sync/*` route. Those were a second, diverging implementation: no retry on 429, raw
 * `Buffer.from(key, 'base64')` credential reads, and per-record `catch` blocks that logged and
 * continued so a route could report success having written nothing.
 *
 * Bounded on purpose. Work stops at {@link PAGE_CAP} pages per operation or when the time budget
 * is spent, and says so via `truncated`, so a catalogue too large to finish synchronously degrades
 * to "synced what it could, and reported it" rather than an invocation killed mid-write.
 */

import { getIntegration, recordSyncStatus } from './credentials';
import { SYNC_OPERATIONS, runSyncPage, type SyncNetworkOptions, type SyncOperation } from './sync';
import { writeSyncLog } from './syncOrchestrator';

/**
 * Maximum pages fetched per operation in one manual run.
 *
 * At `PAGE_SIZE` 100 this is 5,000 records per operation — far past any catalogue that belongs on
 * a synchronous path, and a backstop against a `hasMore` that never goes false.
 */
export const PAGE_CAP = 50;

/**
 * Default wall-clock budget for a whole run.
 *
 * Routes under `/api/admin/sync/**` get `maxDuration: 300` from `vercel.json`; stopping at 240s
 * leaves room to record status, write the logs and serialise a response.
 */
export const DEFAULT_BUDGET_MS = 240_000;

/** Outcome of one sync operation. */
export interface ManualSyncOperationResult {
  operation: SyncOperation;
  /** Records read from ShipStation. */
  processed: number;
  /** Rows inserted locally. */
  added: number;
  /** Rows updated locally. */
  updated: number;
  /** Pages fetched. */
  pages: number;
  durationMs: number;
  /** True when the page cap or time budget stopped this operation early. */
  truncated: boolean;
  /** Present when the operation failed; the rows written before the failure still stand. */
  error?: string;
}

/** Aggregate outcome of one manual run. */
export interface ManualSyncResult {
  storeId: string;
  /** True only when every operation completed without error. */
  success: boolean;
  operations: ManualSyncOperationResult[];
  durationMs: number;
}

/** Raised when a store has no usable ShipStation connection. Distinct from a sync failure. */
export class ShipStationNotConnectedError extends Error {
  /** Stable discriminator so routes can map this to a 400 without matching on message text. */
  readonly code = 'SHIPSTATION_NOT_CONNECTED';

  /**
   * @param message - Operator-facing explanation.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ShipStationNotConnectedError';
  }
}

/** Knobs for a manual run. */
export interface ManualSyncOptions {
  /** Operations to run, in order. Defaults to {@link SYNC_OPERATIONS}. */
  operations?: readonly SyncOperation[];
  /** Wall-clock budget for the whole run. Defaults to {@link DEFAULT_BUDGET_MS}. */
  budgetMs?: number;
  /** Injected network primitives, for tests. */
  network?: SyncNetworkOptions;
}

/**
 * Page through one operation until ShipStation runs out of records.
 *
 * A failure is captured rather than thrown: each operation writes in its own transaction, so
 * whatever landed before the error is real and the remaining operations still deserve a turn.
 *
 * @param operation - Operation to run.
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param deadline - Epoch milliseconds after which no new page is started.
 * @param network - Injected network primitives, for tests.
 * @returns The operation's counts, carrying `error` when it failed.
 */
async function runOperation(
  operation: SyncOperation,
  apiKey: string,
  storeId: string,
  deadline: number,
  network: SyncNetworkOptions
): Promise<ManualSyncOperationResult> {
  const startedAt = Date.now();
  let processed = 0;
  let added = 0;
  let updated = 0;
  let pages = 0;
  let truncated = false;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Checked before the call, not after: a page started with no budget left is the invocation
      // that gets killed mid-write.
      if (Date.now() >= deadline) {
        truncated = true;
        break;
      }

      const result = await runSyncPage(operation, apiKey, storeId, page, network);

      processed += result.processed;
      added += result.added;
      updated += result.updated;
      pages += 1;
      hasMore = result.hasMore;
      page += 1;

      if (hasMore && pages >= PAGE_CAP) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      console.warn(
        `[manual-sync] ${operation} stopped early for store ${storeId} after ${pages} page(s); ` +
          `more records remain`
      );
    }

    const durationMs = Date.now() - startedAt;
    await writeSyncLog(storeId, {
      operation,
      success: true,
      duration: durationMs,
      recordsProcessed: processed
    });

    return { operation, processed, added, updated, pages, durationMs, truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startedAt;

    console.error(`[manual-sync] ${operation} failed for store ${storeId}: ${message}`);

    await writeSyncLog(storeId, {
      operation,
      success: false,
      duration: durationMs,
      recordsProcessed: processed,
      error: message
    });

    return { operation, processed, added, updated, pages, durationMs, truncated, error: message };
  }
}

/**
 * Run a full ShipStation sync for one store, synchronously.
 *
 * @param storeId - Store UUID.
 * @param options - Operations, budget and injected network primitives.
 * @returns Per-operation counts and an overall verdict.
 * @throws {ShipStationNotConnectedError} When the store has no active integration or no stored key.
 * @throws {ShipStationKeyError} When `SHIPSTATION_ENCRYPTION_KEY` is missing, so the stored
 *   credential cannot be read.
 */
export async function runManualSync(
  storeId: string,
  options: ManualSyncOptions = {}
): Promise<ManualSyncResult> {
  const operations = options.operations ?? SYNC_OPERATIONS;
  const startedAt = Date.now();
  const deadline = startedAt + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  const network = options.network ?? {};

  const integration = await getIntegration(storeId, { activeOnly: true });

  if (!integration?.apiKey) {
    throw new ShipStationNotConnectedError(
      'This store has no active ShipStation integration with a stored API key. Connect ShipStation ' +
        'in Integration Settings before syncing.'
    );
  }

  await recordSyncStatus(storeId, 'running');

  const results: ManualSyncOperationResult[] = [];
  for (const operation of operations) {
    // Sequential by design: `products` must land before `inventory` so stock updates find rows.
    results.push(await runOperation(operation, integration.apiKey, storeId, deadline, network));
  }

  const failures = results.filter((result) => result.error !== undefined);
  const success = failures.length === 0;

  await recordSyncStatus(
    storeId,
    success ? 'completed' : 'failed',
    success ? null : failures.map((failure) => `${failure.operation}: ${failure.error}`).join('; ')
  );

  const total = results.reduce((sum, result) => sum + result.processed, 0);
  console.log(
    `[manual-sync] store ${storeId}: ${total} record(s) across ${results.length} operation(s), ` +
      `${failures.length} failed`
  );

  return { storeId, success, operations: results, durationMs: Date.now() - startedAt };
}

/**
 * Collapse operation results into the `{ totalCount, addedCount, updatedCount }` triple the admin
 * UI has always rendered.
 *
 * @param results - Operation results to fold together.
 * @returns The combined counts.
 */
export function toCounts(results: ManualSyncOperationResult[]): {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
} {
  return {
    totalCount: results.reduce((sum, result) => sum + result.processed, 0),
    addedCount: results.reduce((sum, result) => sum + result.added, 0),
    updatedCount: results.reduce((sum, result) => sum + result.updated, 0)
  };
}

/**
 * Build the operator-facing error list for a finished run.
 *
 * @param result - A completed run.
 * @returns One `operation: message` string per failed operation.
 */
export function collectErrors(result: ManualSyncResult): string[] {
  return result.operations
    .filter((operation) => operation.error !== undefined)
    .map((operation) => `${operation.operation}: ${operation.error}`);
}
