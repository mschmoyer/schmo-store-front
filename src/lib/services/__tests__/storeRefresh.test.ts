/**
 * @jest-environment node
 */

/**
 * Tests for the visit-driven per-store refresh.
 *
 * Nothing is module-mocked. `refreshStoreIfStale` takes its database, clock and services through
 * `deps`, so these run the real orchestration — throttle, step order, step isolation, the honest
 * per-step verdicts — against an in-memory stand-in that answers the three statements this module
 * issues and records every call.
 *
 * What the stand-in cannot prove is that the SQL is valid Postgres; the throttle's atomicity is a
 * property of `INSERT ... ON CONFLICT ... WHERE ... RETURNING` under a row lock, not of this code.
 * The assertions on SQL text below pin the parts that matter (the `::uuid`/`::int` casts and the
 * staleness guard) so they cannot be quietly dropped.
 */

import type { DrainSummary, ProcessJobsOptions } from '../jobQueueService';
import {
  REFRESH_DRAIN_BATCH_SIZE,
  REFRESH_DRAIN_BUDGET_MS,
  STORE_REFRESH_INTERVAL_MINUTES,
  SYNC_MIN_INTERVAL_MINUTES,
  drainStoreQueue,
  refreshStoreIfStale,
  type SnapshotCreateResult,
  type StoreRefreshDeps
} from '../storeRefresh';

const STORE = '650e8400-e29b-41d4-a716-446655440001';
const NOW = new Date('2026-10-21T15:00:00.000Z');

/** Knobs for the in-memory world each test builds. */
interface World {
  throttleWon: boolean;
  throttleThrows: boolean;
  hasIntegration: boolean;
  syncDue: boolean;
  encryptionConfigured: boolean;
  enqueued: number;
  enqueueThrows: boolean;
  snapshotExists: boolean;
  snapshotResult: SnapshotCreateResult;
  snapshotThrows: boolean;
  drain: DrainSummary;
  drainThrows: boolean;
}

/** One recorded SQL statement. */
interface QueryCall {
  text: string;
  values: unknown[];
}

/**
 * A drain summary with defaults.
 *
 * @param overrides - Fields to change.
 * @returns A summary.
 */
function summary(overrides: Partial<DrainSummary> = {}): DrainSummary {
  return {
    claimed: 0,
    completed: 0,
    failed: 0,
    budgetExhausted: false,
    skippedBusy: false,
    durationMs: 5,
    ...overrides
  };
}

/**
 * Build deps backed by an in-memory world, plus the call log.
 *
 * @param overrides - World knobs to change from a "won, everything due, all healthy" default.
 * @returns The deps and what they recorded.
 */
function harness(overrides: Partial<World> = {}) {
  const world: World = {
    throttleWon: true,
    throttleThrows: false,
    hasIntegration: true,
    syncDue: true,
    encryptionConfigured: true,
    enqueued: 6,
    enqueueThrows: false,
    snapshotExists: false,
    snapshotResult: { success: true, snapshotId: 'snap-1' },
    snapshotThrows: false,
    drain: summary({ claimed: 3, completed: 3 }),
    drainThrows: false,
    ...overrides
  };

  const queries: QueryCall[] = [];
  const drains: ProcessJobsOptions[] = [];
  const enqueues: string[] = [];
  const snapshotsCreated: Array<{ storeId: string; date: Date }> = [];
  const order: string[] = [];

  const query = async <T extends Record<string, unknown>>(
    text: string,
    values: unknown[]
  ): Promise<{ rows: T[] }> => {
    queries.push({ text, values });

    if (text.includes('INSERT INTO store_refresh_state')) {
      order.push('claim');
      if (world.throttleThrows) {
        throw new Error('connection refused');
      }
      return { rows: (world.throttleWon ? [{ store_id: values[0] }] : []) as unknown as T[] };
    }

    if (text.includes('FROM store_integrations')) {
      order.push('eligibility');
      return {
        rows: [{ has_integration: world.hasIntegration, sync_due: world.syncDue }] as unknown as T[]
      };
    }

    if (text.includes('UPDATE store_refresh_state')) {
      order.push('record');
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in test: ${text}`);
  };

  const deps: Partial<StoreRefreshDeps> = {
    query,
    now: () => NOW,
    isEncryptionConfigured: () => world.encryptionConfigured,
    enqueueStoreSync: async (storeId) => {
      order.push('enqueue');
      enqueues.push(storeId);
      if (world.enqueueThrows) {
        throw new Error('sync_runs insert failed');
      }
      return { enqueued: world.enqueued };
    },
    snapshotExists: async () => {
      order.push('snapshotExists');
      if (world.snapshotThrows) {
        throw new Error('snapshot table missing');
      }
      return world.snapshotExists;
    },
    createDailySnapshot: async (storeId, date) => {
      order.push('createSnapshot');
      snapshotsCreated.push({ storeId, date });
      return world.snapshotResult;
    },
    processJobs: async (options) => {
      order.push('drain');
      drains.push(options);
      if (world.drainThrows) {
        throw new Error('pool exhausted');
      }
      return world.drain;
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  };

  return { deps, world, queries, drains, enqueues, snapshotsCreated, order };
}

describe('refreshStoreIfStale', () => {
  describe('throttle', () => {
    it('claims with one guarded upsert, typed parameters, and the configured interval', async () => {
      const h = harness();
      await refreshStoreIfStale(STORE, h.deps);

      const claim = h.queries[0];
      expect(claim.text).toContain('ON CONFLICT (store_id) DO UPDATE');
      expect(claim.text).toContain('$1::uuid');
      expect(claim.text).toMatch(
        /WHERE store_refresh_state\.last_refreshed_at < NOW\(\) - make_interval\(mins => \$2::int\)/
      );
      expect(claim.text).toContain('RETURNING store_id');
      expect(claim.values).toEqual([STORE, STORE_REFRESH_INTERVAL_MINUTES]);
    });

    it('does nothing else when the throttle is lost', async () => {
      const h = harness({ throttleWon: false });
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.throttle).toBe('lost');
      expect(h.order).toEqual(['claim']);
      expect(h.queries).toHaveLength(1);
      expect(h.drains).toHaveLength(0);
      expect(h.enqueues).toHaveLength(0);
      expect(result.steps.sync.status).toBe('skipped');
      expect(result.steps.snapshot.status).toBe('skipped');
      expect(result.steps.drain.status).toBe('skipped');
      expect(result.drainSummary).toBeNull();
    });

    it('reports a failed claim and attempts nothing else', async () => {
      const h = harness({ throttleThrows: true });
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.throttle).toBe('failed');
      expect(result.throttleError).toContain('connection refused');
      expect(h.order).toEqual(['claim']);
    });

    it('refuses a non-UUID store id without touching the database', async () => {
      const h = harness();
      const result = await refreshStoreIfStale('not-a-store', h.deps);

      expect(result.throttle).toBe('failed');
      expect(h.queries).toHaveLength(0);
    });
  });

  describe('when the throttle is won', () => {
    it('runs sync, snapshot, then drain, and records the result', async () => {
      const h = harness();
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.throttle).toBe('won');
      expect(h.order).toEqual([
        'claim',
        'eligibility',
        'enqueue',
        'snapshotExists',
        'createSnapshot',
        'drain',
        'record'
      ]);
      expect(result.steps).toEqual({
        sync: { status: 'done', detail: 'Enqueued 6 sync page job(s)' },
        snapshot: { status: 'done', detail: 'Created snapshot snap-1' },
        drain: { status: 'done', detail: '3 completed, 0 failed of 3 claimed' }
      });

      const record = h.queries.find((q) => q.text.includes('UPDATE store_refresh_state'));
      expect(record?.text).toContain('WHERE store_id = $1::uuid');
      expect(record?.values[0]).toBe(STORE);
      expect(JSON.parse(String(record?.values[1])).throttle).toBe('won');
    });

    it('drains only this store, bounded', async () => {
      const h = harness();
      await refreshStoreIfStale(STORE, h.deps);

      expect(h.drains).toEqual([
        { storeId: STORE, batchSize: REFRESH_DRAIN_BATCH_SIZE, budgetMs: REFRESH_DRAIN_BUDGET_MS }
      ]);
    });

    it('reports an empty queue as skipped, not done', async () => {
      const h = harness({ drain: summary() });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(result.steps.drain.status).toBe('skipped');
    });

    it('reports a drain whose every job failed as failed', async () => {
      const h = harness({ drain: summary({ claimed: 2, failed: 2 }) });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(result.steps.drain.status).toBe('failed');
    });

    it('reports a drain pass that errored internally as failed', async () => {
      const h = harness({ drain: summary({ error: 'claim query failed' }) });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(result.steps.drain).toEqual({ status: 'failed', detail: 'claim query failed' });
    });
  });

  describe('sync step', () => {
    it('reads eligibility store-scoped, without decrypting, against the sync interval', async () => {
      const h = harness();
      await refreshStoreIfStale(STORE, h.deps);

      const eligibility = h.queries.find((q) => q.text.includes('FROM store_integrations'));
      expect(eligibility?.text).toContain('store_id = $1::uuid');
      expect(eligibility?.text).toContain('FROM sync_runs WHERE store_id = $1::uuid');
      expect(eligibility?.text).toContain("api_key_encrypted <> ''");
      expect(eligibility?.values).toEqual([STORE, SYNC_MIN_INTERVAL_MINUTES]);
    });

    it('enqueues when stale and the integration is active', async () => {
      const h = harness();
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(h.enqueues).toEqual([STORE]);
      expect(result.steps.sync.status).toBe('done');
    });

    it('does not enqueue when the last sync is recent', async () => {
      const h = harness({ syncDue: false });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(h.enqueues).toHaveLength(0);
      expect(result.steps.sync.status).toBe('skipped');
    });

    it('is not applicable without an active, credentialled integration', async () => {
      const h = harness({ hasIntegration: false });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(h.enqueues).toHaveLength(0);
      expect(result.steps.sync.status).toBe('not_applicable');
    });

    it('fails loudly, without enqueuing, when the encryption key is missing', async () => {
      const h = harness({ encryptionConfigured: false });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(h.enqueues).toHaveLength(0);
      expect(result.steps.sync.status).toBe('failed');
      expect(result.steps.sync.detail).toContain('SHIPSTATION_ENCRYPTION_KEY');
      // The rest of the refresh still ran.
      expect(result.steps.drain.status).toBe('done');
    });

    it('does not claim success when every page job was already queued', async () => {
      const h = harness({ enqueued: 0 });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(result.steps.sync.status).toBe('skipped');
    });
  });

  describe('snapshot step', () => {
    it("creates today's snapshot when missing, for this store and the injected date", async () => {
      const h = harness();
      await refreshStoreIfStale(STORE, h.deps);
      expect(h.snapshotsCreated).toEqual([{ storeId: STORE, date: NOW }]);
    });

    it('does not create one when it already exists', async () => {
      const h = harness({ snapshotExists: true });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(h.snapshotsCreated).toHaveLength(0);
      expect(result.steps.snapshot.status).toBe('skipped');
    });

    it('reports a snapshot the service could not create as failed', async () => {
      const h = harness({ snapshotResult: { success: false, error: 'no rows' } });
      const result = await refreshStoreIfStale(STORE, h.deps);
      expect(result.steps.snapshot).toEqual({ status: 'failed', detail: 'no rows' });
    });
  });

  describe('step isolation', () => {
    it('keeps going when the sync step throws, and reports it', async () => {
      const h = harness({ enqueueThrows: true });
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.steps.sync).toEqual({ status: 'failed', detail: 'sync_runs insert failed' });
      expect(result.steps.snapshot.status).toBe('done');
      expect(result.steps.drain.status).toBe('done');
      expect(h.drains).toHaveLength(1);
    });

    it('keeps going when the snapshot step throws, and reports it', async () => {
      const h = harness({ snapshotThrows: true });
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.steps.snapshot).toEqual({ status: 'failed', detail: 'snapshot table missing' });
      expect(result.steps.drain.status).toBe('done');
    });

    it('reports a throwing drain as failed and still records the result', async () => {
      const h = harness({ drainThrows: true });
      const result = await refreshStoreIfStale(STORE, h.deps);

      expect(result.steps.drain).toEqual({ status: 'failed', detail: 'pool exhausted' });
      expect(result.drainSummary).toBeNull();
      expect(result.steps.sync.status).toBe('done');
      expect(h.order[h.order.length - 1]).toBe('record');
    });

    it('never throws, even when every collaborator does', async () => {
      const failing = async (): Promise<never> => {
        throw new Error('everything is down');
      };
      const h = harness();
      const deps: Partial<StoreRefreshDeps> = {
        ...h.deps,
        query: async <T extends Record<string, unknown>>(text: string): Promise<{ rows: T[] }> => {
          if (text.includes('INSERT INTO store_refresh_state')) {
            return { rows: [{ store_id: STORE }] as unknown as T[] };
          }
          throw new Error('everything is down');
        },
        enqueueStoreSync: failing,
        snapshotExists: failing,
        createDailySnapshot: failing,
        processJobs: failing,
        isEncryptionConfigured: () => {
          throw new Error('everything is down');
        }
      };

      const result = await refreshStoreIfStale(STORE, deps);

      expect(result.throttle).toBe('won');
      expect(result.steps.sync.status).toBe('failed');
      expect(result.steps.snapshot.status).toBe('failed');
      expect(result.steps.drain.status).toBe('failed');
    });

    it('never throws when the logger itself throws', async () => {
      const h = harness();
      const exploding = () => {
        throw new Error('stdout closed');
      };
      await expect(
        refreshStoreIfStale(STORE, {
          ...h.deps,
          logger: { info: exploding, warn: exploding, error: exploding }
        })
      ).resolves.toBeDefined();
    });
  });
});

describe('drainStoreQueue', () => {
  it('drains only the named store, bounded', async () => {
    const h = harness();
    await drainStoreQueue(STORE, h.deps);

    expect(h.drains).toEqual([
      { storeId: STORE, batchSize: REFRESH_DRAIN_BATCH_SIZE, budgetMs: REFRESH_DRAIN_BUDGET_MS }
    ]);
    // Not throttled: no claim, no other work.
    expect(h.queries).toHaveLength(0);
    expect(h.enqueues).toHaveLength(0);
  });

  it('never throws when the drain does', async () => {
    const h = harness({ drainThrows: true });
    await expect(drainStoreQueue(STORE, h.deps)).resolves.toBeUndefined();
  });

  it('ignores a non-UUID store id', async () => {
    const h = harness();
    await drainStoreQueue('nope', h.deps);
    expect(h.drains).toHaveLength(0);
  });
});
