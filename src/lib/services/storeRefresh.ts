/**
 * Visit-driven, throttled per-store background refresh.
 *
 * Production runs on Neon, which scales the database to zero after a few idle minutes. Vercel Cron
 * used to drain `job_queue` every five minutes and schedule a ShipStation sync for every store every
 * hour, which kept the database awake around the clock for stores nobody was visiting. The platform
 * has very little traffic, so that was nearly all waste.
 *
 * This module moves the work to where the traffic is. When a storefront is viewed, its layout
 * schedules {@link refreshStoreIfStale} with Next's `after()` — after the response is sent, inside
 * the same function invocation — and the refresh:
 *
 * 1. **Claims the throttle** in one atomic upsert on `store_refresh_state` (migration 043). At most
 *    one caller per {@link STORE_REFRESH_INTERVAL_MINUTES} wins, across every Vercel instance. A
 *    visitor who loses pays that single statement and nothing else.
 * 2. **Schedules a ShipStation sync** when the store has an active, credentialled integration and its
 *    last sync run started more than {@link SYNC_MIN_INTERVAL_MINUTES} ago. Not every ten minutes:
 *    ShipStation rate-limits, and a catalogue does not change that fast.
 * 3. **Takes today's inventory snapshot** if the store does not have one yet.
 * 4. **Drains a bounded batch of this store's queued jobs** — order pushes, customer notifications,
 *    sync pages.
 *
 * Sync is enqueued *before* the drain so the first page of each operation runs on this same visit;
 * the other way round, a low-traffic store would wait for its next visit (or the daily safety-net
 * cron) before a single page moved. The drain runs *last* because it is the only open-ended step:
 * everything before it is a handful of statements, so putting the bounded-but-long step at the end
 * means nothing cheap is ever starved by it.
 *
 * Every step is isolated — one failing never stops the others — and reported honestly as `done`,
 * `skipped`, `not_applicable` or `failed`. Nothing here throws: this runs after the response has gone,
 * so there is nobody to throw to, and an unhandled rejection in `after()` is just noise in the logs.
 *
 * All collaborators come in through {@link StoreRefreshDeps} so tests exercise this logic for real
 * without mocking modules. The defaults load the queue, the sync orchestrator and the snapshot
 * service with dynamic `import()`, which keeps the storefront layout's static module graph to this
 * file plus the connection module — the layout is rendered on every storefront request and has no
 * business pulling the e-mail and ShipStation stacks into its bundle.
 */

import { db } from '@/lib/database/connection';
import { isEncryptionConfigured } from '@/lib/shipstation/crypto';
import type { DrainSummary, ProcessJobsOptions } from '@/lib/services/jobQueueService';

/** Minimum gap between refreshes of one store. */
export const STORE_REFRESH_INTERVAL_MINUTES = 10;

/**
 * Minimum gap between ShipStation syncs of one store, measured from the start of the most recent
 * `sync_runs` row. The old hourly cron's cadence, kept so moving the trigger to visits does not
 * change how hard we lean on ShipStation's rate limits.
 */
export const SYNC_MIN_INTERVAL_MINUTES = 60;

/**
 * Jobs claimed per visit-driven drain.
 *
 * Enough to take every operation's freshly enqueued first page (six operations) plus a few
 * notifications or order pushes, which outrank sync pages (`high` vs `low` priority) and so go
 * first. Small enough that one store's visit cannot hold a large batch of rows in `processing` if
 * the invocation is cut short. The daily cron drains whatever a quiet store leaves behind.
 */
export const REFRESH_DRAIN_BATCH_SIZE = 10;

/**
 * Wall-clock budget for a visit-driven drain.
 *
 * This runs in `after()`, inside the storefront request's own function lifetime, so it is bounded
 * by that route's `maxDuration`. The queue checks the budget only *before starting* a job, so the
 * real ceiling is budget + one job (a ShipStation page with retry/backoff can take several seconds).
 * 45 s keeps that comfortably inside a 60 s limit, and well inside Fluid compute's 300 s default.
 * A job killed mid-run stays `processing` with nothing to reclaim it, so erring short matters more
 * than draining everything — the next visit or the daily cron picks up the rest.
 */
export const REFRESH_DRAIN_BUDGET_MS = 45_000;

/** Outcome of one refresh step. */
export type RefreshStepStatus = 'done' | 'skipped' | 'not_applicable' | 'failed';

/** What one step did, in words an operator can act on. */
export interface RefreshStepOutcome {
  status: RefreshStepStatus;
  /** Why it was skipped, what it did, or what went wrong. Never contains a credential. */
  detail?: string;
}

/** Whether this caller won the throttle. */
export type RefreshThrottleOutcome = 'won' | 'lost' | 'failed';

/** What a call to {@link refreshStoreIfStale} did. */
export interface StoreRefreshResult {
  storeId: string;
  /**
   * `won`: this caller claimed the interval and ran the steps. `lost`: another refresh ran within
   * {@link STORE_REFRESH_INTERVAL_MINUTES}, so nothing else was attempted. `failed`: the claim itself
   * could not be made (bad store id, database down), so nothing else was attempted either.
   */
  throttle: RefreshThrottleOutcome;
  /** Detail when the throttle claim failed. */
  throttleError?: string;
  steps: {
    sync: RefreshStepOutcome;
    snapshot: RefreshStepOutcome;
    drain: RefreshStepOutcome;
  };
  /** The queue's own summary of the drain, when one ran. */
  drainSummary: DrainSummary | null;
  durationMs: number;
}

/** Minimal query surface this module needs; `db.query` satisfies it. */
export type RefreshQuery = <T extends Record<string, unknown>>(
  text: string,
  values: unknown[]
) => Promise<{ rows: T[] }>;

/** Outcome of creating a snapshot, as `inventorySnapshotService.createDailySnapshot` reports it. */
export interface SnapshotCreateResult {
  success: boolean;
  snapshotId?: string;
  error?: string;
}

/** Everything {@link refreshStoreIfStale} and {@link drainStoreQueue} touch. Each is optional. */
export interface StoreRefreshDeps {
  /** Database access. Defaults to `db.query`. */
  query: RefreshQuery;
  /** Clock, for the snapshot date and durations. The throttle itself uses the database's `NOW()`. */
  now: () => Date;
  /** Drain the job queue. Defaults to `jobQueueService.processJobs`. */
  processJobs: (options: ProcessJobsOptions & { storeId: string }) => Promise<DrainSummary>;
  /** Enqueue a full sync. Defaults to `syncOrchestrator.enqueueStoreSync`. */
  enqueueStoreSync: (storeId: string) => Promise<{ enqueued: number }>;
  /** Whether `SHIPSTATION_ENCRYPTION_KEY` is usable. Defaults to `crypto.isEncryptionConfigured`. */
  isEncryptionConfigured: () => boolean;
  /** Defaults to `inventorySnapshotService.snapshotExists`. */
  snapshotExists: (storeId: string, date: Date) => Promise<boolean>;
  /** Defaults to `inventorySnapshotService.createDailySnapshot`. */
  createDailySnapshot: (storeId: string, date: Date) => Promise<SnapshotCreateResult>;
  /** Defaults to `console`. */
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

/** The real collaborators. Service modules load lazily; see the file header for why. */
const DEFAULT_DEPS: StoreRefreshDeps = {
  query: <T extends Record<string, unknown>>(text: string, values: unknown[]) =>
    db.query<T>(text, values),
  now: () => new Date(),
  processJobs: async (options) => {
    const { jobQueueService } = await import('@/lib/services/jobQueueService');
    return jobQueueService.processJobs(options);
  },
  enqueueStoreSync: async (storeId) => {
    const { enqueueStoreSync } = await import('@/lib/shipstation/syncOrchestrator');
    return enqueueStoreSync(storeId);
  },
  isEncryptionConfigured,
  snapshotExists: async (storeId, date) => {
    const { inventorySnapshotService } = await import('@/lib/services/inventorySnapshotService');
    return inventorySnapshotService.snapshotExists(storeId, date);
  },
  createDailySnapshot: async (storeId, date) => {
    const { inventorySnapshotService } = await import('@/lib/services/inventorySnapshotService');
    return inventorySnapshotService.createDailySnapshot(storeId, date);
  },
  logger: console
};

/** Canonical UUID text. Rejecting anything else up front saves a round trip that would only fail. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Log prefix, so a refresh's lines can be grepped out of the storefront's. */
const LOG_PREFIX = '[store-refresh]';

/**
 * Merge caller overrides onto the real collaborators.
 *
 * @param deps - Overrides.
 * @returns A complete set.
 */
function resolveDeps(deps: Partial<StoreRefreshDeps> | undefined): StoreRefreshDeps {
  return { ...DEFAULT_DEPS, ...deps };
}

/**
 * Render an unknown thrown value as a message.
 *
 * @param error - Whatever was thrown.
 * @returns A message string.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Log without ever throwing. This code runs after the response has gone; a logger that throws
 * (a closed stream, a broken drain) must not turn a finished refresh into an unhandled rejection.
 *
 * @param deps - Collaborators, for the logger.
 * @param level - Console level.
 * @param args - What to log.
 * @returns Nothing.
 */
function log(deps: StoreRefreshDeps, level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  try {
    deps.logger[level](...args);
  } catch {
    // Nowhere left to report it.
  }
}

/**
 * Try to claim this store's refresh interval.
 *
 * One statement, so exactly one concurrent caller wins: the upsert locks the conflicting row and
 * the `WHERE` re-checks staleness under that lock, so a second caller sees the first caller's fresh
 * timestamp and updates nothing. The first ever visit inserts and wins.
 *
 * @param storeId - Store UUID.
 * @param deps - Collaborators.
 * @returns True when this caller won.
 */
async function claimRefresh(storeId: string, deps: StoreRefreshDeps): Promise<boolean> {
  const result = await deps.query<{ store_id: string }>(
    `INSERT INTO store_refresh_state (store_id, last_refreshed_at)
     VALUES ($1::uuid, NOW())
     ON CONFLICT (store_id) DO UPDATE
        SET last_refreshed_at = NOW()
      WHERE store_refresh_state.last_refreshed_at < NOW() - make_interval(mins => $2::int)
     RETURNING store_id`,
    [storeId, STORE_REFRESH_INTERVAL_MINUTES]
  );
  return result.rows.length > 0;
}

/** Row shape of {@link readSyncEligibility}. */
type SyncEligibilityRow = {
  has_integration: boolean;
  sync_due: boolean;
};

/**
 * Decide whether this store's ShipStation sync is due, without decrypting anything.
 *
 * "Credentialled" is the presence of a stored ciphertext, the same predicate the scheduled sync's
 * `getActiveShipStationStores` uses. Decrypting the key just to learn that it exists would throw
 * when `SHIPSTATION_ENCRYPTION_KEY` is missing and cost a decrypt on every refresh.
 *
 * "Due" reads `sync_runs` rather than `store_integrations.last_sync_at`: `last_sync_at` only moves
 * when a whole sync completes, so a store whose sync keeps failing would look permanently stale and
 * get re-crawled every ten minutes — exactly the rate-limit pressure this throttle exists to avoid.
 * The newest run's `started_at` advances on every attempt, success or not. A run still `running`
 * after the interval is handed back to `enqueueStoreSync`, which resumes it from its cursor and
 * de-duplicates the page job, so a stalled chain is restarted rather than duplicated.
 *
 * `sync_runs.started_at` is `TIMESTAMP` (no zone, written as `CURRENT_TIMESTAMP`), so it is compared
 * against `LOCALTIMESTAMP` — the same type, the same session clock.
 *
 * @param storeId - Store UUID.
 * @param deps - Collaborators.
 * @returns Whether the store has an integration, and whether its sync is due.
 */
async function readSyncEligibility(
  storeId: string,
  deps: StoreRefreshDeps
): Promise<{ hasIntegration: boolean; syncDue: boolean }> {
  const result = await deps.query<SyncEligibilityRow>(
    `SELECT
       EXISTS (
         SELECT 1 FROM store_integrations
          WHERE store_id = $1::uuid
            AND integration_type = 'shipstation'
            AND is_active = true
            AND api_key_encrypted IS NOT NULL
            AND api_key_encrypted <> ''
       ) AS has_integration,
       COALESCE(
         (SELECT MAX(started_at) FROM sync_runs WHERE store_id = $1::uuid)
           < LOCALTIMESTAMP - make_interval(mins => $2::int),
         true
       ) AS sync_due`,
    [storeId, SYNC_MIN_INTERVAL_MINUTES]
  );

  const row = result.rows[0];
  return {
    hasIntegration: row?.has_integration === true,
    syncDue: row?.sync_due === true
  };
}

/**
 * Step: schedule a ShipStation sync when one is due.
 *
 * @param storeId - Store UUID.
 * @param deps - Collaborators.
 * @returns What happened.
 */
async function syncStep(storeId: string, deps: StoreRefreshDeps): Promise<RefreshStepOutcome> {
  try {
    const { hasIntegration, syncDue } = await readSyncEligibility(storeId, deps);

    if (!hasIntegration) {
      return { status: 'not_applicable', detail: 'No active ShipStation integration with a stored key' };
    }

    if (!syncDue) {
      return {
        status: 'skipped',
        detail: `Last sync started within ${SYNC_MIN_INTERVAL_MINUTES} minutes`
      };
    }

    // Every sync page job decrypts the key first. Without a usable encryption key each would fail
    // three times and land in `failed`; say so here, loudly, instead of queueing doomed work.
    if (!deps.isEncryptionConfigured()) {
      return {
        status: 'failed',
        detail: 'SHIPSTATION_ENCRYPTION_KEY is not configured; stored credentials cannot be read'
      };
    }

    const { enqueued } = await deps.enqueueStoreSync(storeId);

    if (enqueued === 0) {
      return { status: 'skipped', detail: 'Every sync page job was already queued' };
    }

    return { status: 'done', detail: `Enqueued ${enqueued} sync page job(s)` };
  } catch (error) {
    return { status: 'failed', detail: messageOf(error) };
  }
}

/**
 * Step: take today's inventory snapshot if there is none yet.
 *
 * @param storeId - Store UUID.
 * @param today - The date to snapshot.
 * @param deps - Collaborators.
 * @returns What happened.
 */
async function snapshotStep(
  storeId: string,
  today: Date,
  deps: StoreRefreshDeps
): Promise<RefreshStepOutcome> {
  try {
    if (await deps.snapshotExists(storeId, today)) {
      return { status: 'skipped', detail: "Today's snapshot already exists" };
    }

    const created = await deps.createDailySnapshot(storeId, today);
    if (!created.success) {
      return { status: 'failed', detail: created.error ?? 'Snapshot was not created' };
    }

    return { status: 'done', detail: `Created snapshot ${created.snapshotId ?? '(no id returned)'}` };
  } catch (error) {
    return { status: 'failed', detail: messageOf(error) };
  }
}

/**
 * Translate a drain summary into a step outcome.
 *
 * @param summary - What the queue reported.
 * @returns The outcome.
 */
function describeDrain(summary: DrainSummary): RefreshStepOutcome {
  if (summary.error) {
    return { status: 'failed', detail: summary.error };
  }

  if (summary.claimed === 0 && summary.completed === 0 && summary.failed === 0) {
    return {
      status: 'skipped',
      detail: summary.skippedBusy ? 'Queue busy in this process' : 'No due jobs for this store'
    };
  }

  const counts =
    `${summary.completed} completed, ${summary.failed} failed of ${summary.claimed} claimed` +
    (summary.budgetExhausted ? '; stopped on time budget' : '');

  // Every claimed job failing is a failure of the step; a mix is work done, with the failures
  // visible in the counts and already on their way through the queue's own retry/backoff.
  if (summary.completed === 0 && summary.failed > 0) {
    return { status: 'failed', detail: counts };
  }

  return { status: 'done', detail: counts };
}

/**
 * Drain a bounded batch of one store's jobs and report the result.
 *
 * @param storeId - Store UUID.
 * @param deps - Collaborators.
 * @returns The step outcome and, when the queue answered, its summary.
 */
async function drainStep(
  storeId: string,
  deps: StoreRefreshDeps
): Promise<{ outcome: RefreshStepOutcome; summary: DrainSummary | null }> {
  try {
    const summary = await deps.processJobs({
      storeId,
      batchSize: REFRESH_DRAIN_BATCH_SIZE,
      budgetMs: REFRESH_DRAIN_BUDGET_MS
    });
    return { outcome: describeDrain(summary), summary };
  } catch (error) {
    return { outcome: { status: 'failed', detail: messageOf(error) }, summary: null };
  }
}

/**
 * Persist what this refresh did, for an operator to read back. Best-effort.
 *
 * @param result - The finished result.
 * @param deps - Collaborators.
 * @returns Nothing; failure is logged, never thrown.
 */
async function recordResult(result: StoreRefreshResult, deps: StoreRefreshDeps): Promise<void> {
  try {
    await deps.query(
      `UPDATE store_refresh_state
          SET last_finished_at = NOW(), last_result = $2::jsonb
        WHERE store_id = $1::uuid`,
      [result.storeId, JSON.stringify(result)]
    );
  } catch (error) {
    log(deps, 'warn', `${LOG_PREFIX} could not record result for store ${result.storeId}:`, messageOf(error));
  }
}

/**
 * Build a result in which nothing past the throttle ran.
 *
 * @param storeId - Store UUID.
 * @param throttle - Why nothing ran.
 * @param detail - Shared detail for every step.
 * @param startedMs - Start time, for the duration.
 * @param deps - Collaborators.
 * @returns The result.
 */
function notRun(
  storeId: string,
  throttle: Exclude<RefreshThrottleOutcome, 'won'>,
  detail: string,
  startedMs: number,
  deps: StoreRefreshDeps
): StoreRefreshResult {
  const skipped: RefreshStepOutcome = { status: 'skipped', detail };
  return {
    storeId,
    throttle,
    ...(throttle === 'failed' ? { throttleError: detail } : {}),
    steps: { sync: skipped, snapshot: skipped, drain: skipped },
    drainSummary: null,
    durationMs: deps.now().getTime() - startedMs
  };
}

/**
 * Throttled per-store refresh. Never throws — logs and returns a result.
 *
 * Intended to be called from a storefront render via `after()`. At most one call per store per
 * {@link STORE_REFRESH_INTERVAL_MINUTES} does any work; every other call costs one upsert.
 *
 * @param storeId - Store UUID. Anything that is not a UUID is refused without touching the database.
 * @param deps - Collaborator overrides, for tests. Omit in application code.
 * @returns What the refresh did, step by step.
 */
export async function refreshStoreIfStale(
  storeId: string,
  deps?: Partial<StoreRefreshDeps>
): Promise<StoreRefreshResult> {
  const resolved = resolveDeps(deps);
  const startedMs = resolved.now().getTime();

  try {
    if (!UUID_PATTERN.test(storeId)) {
      log(resolved, 'warn', `${LOG_PREFIX} refused non-UUID store id`);
      return notRun(storeId, 'failed', 'Store id is not a UUID', startedMs, resolved);
    }

    let won: boolean;
    try {
      won = await claimRefresh(storeId, resolved);
    } catch (error) {
      const message = messageOf(error);
      log(resolved, 'error', `${LOG_PREFIX} throttle claim failed for store ${storeId}:`, message);
      return notRun(storeId, 'failed', `Throttle claim failed: ${message}`, startedMs, resolved);
    }

    if (!won) {
      return notRun(
        storeId,
        'lost',
        `Refreshed within the last ${STORE_REFRESH_INTERVAL_MINUTES} minutes`,
        startedMs,
        resolved
      );
    }

    // Order is deliberate; see the file header. Each step catches its own failures.
    const sync = await syncStep(storeId, resolved);
    const snapshot = await snapshotStep(storeId, resolved.now(), resolved);
    const drain = await drainStep(storeId, resolved);

    const result: StoreRefreshResult = {
      storeId,
      throttle: 'won',
      steps: { sync, snapshot, drain: drain.outcome },
      drainSummary: drain.summary,
      durationMs: resolved.now().getTime() - startedMs
    };

    await recordResult(result, resolved);

    const failed = Object.entries(result.steps)
      .filter(([, outcome]) => outcome.status === 'failed')
      .map(([name, outcome]) => `${name}: ${outcome.detail ?? 'failed'}`);

    const line =
      `${LOG_PREFIX} store ${storeId} refreshed in ${result.durationMs}ms ` +
      `(sync ${sync.status}, snapshot ${snapshot.status}, drain ${drain.outcome.status})`;

    if (failed.length > 0) {
      log(resolved, 'warn', `${line} — ${failed.join('; ')}`);
    } else {
      log(resolved, 'info', line);
    }

    return result;
  } catch (error) {
    // Unreachable by construction — every step catches — but this runs after the response is
    // sent, and the contract is that it never throws.
    const message = messageOf(error);
    log(resolved, 'error', `${LOG_PREFIX} unexpected failure for store ${storeId}:`, message);
    return notRun(storeId, 'failed', `Unexpected failure: ${message}`, startedMs, resolved);
  }
}

/**
 * Drain a bounded batch of this store's queued jobs. Never throws. Used by webhooks after they
 * enqueue work.
 *
 * Not throttled: a webhook has just put work on the queue and wants it run now, and the drain only
 * ever claims this store's rows, under `SKIP LOCKED`, so a concurrent visit-driven refresh of the
 * same store takes disjoint jobs rather than duplicates.
 *
 * @param storeId - Store UUID. Anything that is not a UUID is ignored.
 * @param deps - Collaborator overrides, for tests. Omit in application code.
 * @returns Nothing; the outcome is logged.
 */
export async function drainStoreQueue(
  storeId: string,
  deps?: Partial<StoreRefreshDeps>
): Promise<void> {
  const resolved = resolveDeps(deps);

  try {
    if (!UUID_PATTERN.test(storeId)) {
      log(resolved, 'warn', `${LOG_PREFIX} drain refused non-UUID store id`);
      return;
    }

    const { outcome } = await drainStep(storeId, resolved);
    const line = `${LOG_PREFIX} drain for store ${storeId}: ${outcome.status} (${outcome.detail ?? ''})`;

    if (outcome.status === 'failed') {
      log(resolved, 'warn', line);
    } else {
      log(resolved, 'info', line);
    }
  } catch (error) {
    log(resolved, 'error', `${LOG_PREFIX} drain for store ${storeId} failed:`, messageOf(error));
  }
}
