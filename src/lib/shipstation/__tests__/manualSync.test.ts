/**
 * Tests for the operator-triggered sync path.
 *
 * The behaviour worth pinning here is the orchestration, not the writers: how many pages get
 * turned, what happens to the remaining operations when one fails, and — the defect that sent this
 * work off in the first place — whether the reported verdict matches what was actually written.
 *
 * `../sync` is stubbed rather than partially mocked so importing this suite never reaches
 * `@/lib/database/connection`.
 */

import {
  PAGE_CAP,
  ShipStationNotConnectedError,
  collectErrors,
  runManualSync,
  toCounts
} from '../manualSync';
import { getIntegration, recordSyncStatus } from '../credentials';
import { runSyncPage, type SyncOperation } from '../sync';
import { writeSyncLog } from '../syncOrchestrator';

jest.mock('../credentials', () => ({
  getIntegration: jest.fn(),
  recordSyncStatus: jest.fn()
}));

jest.mock('../syncOrchestrator', () => ({
  writeSyncLog: jest.fn()
}));

jest.mock('../sync', () => ({
  SYNC_OPERATIONS: [
    'warehouses',
    'inventory-warehouses',
    'inventory-locations',
    'products',
    'inventory'
  ],
  runSyncPage: jest.fn()
}));

// `jest.mocked` rather than a `jest.MockedFunction<...>` cast: this repo has no `@types/jest`, so
// the `jest` type namespace does not resolve even though the value does.
const mockGetIntegration = jest.mocked(getIntegration);
const mockRecordSyncStatus = jest.mocked(recordSyncStatus);
const mockRunSyncPage = jest.mocked(runSyncPage);
const mockWriteSyncLog = jest.mocked(writeSyncLog);

const STORE = 'store-uuid';

/**
 * Build a page result.
 *
 * @param overrides - Fields to override on the default single-page result.
 * @returns A page sync result.
 */
function page(overrides: Partial<{ processed: number; added: number; updated: number; hasMore: boolean }> = {}) {
  return { processed: 10, added: 4, updated: 6, hasMore: false, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});

  mockGetIntegration.mockResolvedValue({ apiKey: 'key' } as Awaited<ReturnType<typeof getIntegration>>);
  mockRecordSyncStatus.mockResolvedValue(undefined);
  mockWriteSyncLog.mockResolvedValue(undefined);
  mockRunSyncPage.mockResolvedValue(page());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runManualSync', () => {
  it('refuses to run when the store has no stored API key', async () => {
    mockGetIntegration.mockResolvedValue(null);

    await expect(runManualSync(STORE)).rejects.toBeInstanceOf(ShipStationNotConnectedError);
    expect(mockRunSyncPage).not.toHaveBeenCalled();
  });

  it('runs every operation in dependency order so stock lands on existing products', async () => {
    const result = await runManualSync(STORE);

    expect(result.operations.map((entry) => entry.operation)).toEqual([
      'warehouses',
      'inventory-warehouses',
      'inventory-locations',
      'products',
      'inventory'
    ]);
    expect(result.success).toBe(true);
  });

  it('keeps turning pages until ShipStation reports the last one', async () => {
    mockRunSyncPage
      .mockResolvedValueOnce(page({ hasMore: true }))
      .mockResolvedValueOnce(page({ hasMore: true }))
      .mockResolvedValueOnce(page({ hasMore: false }));

    const result = await runManualSync(STORE, { operations: ['inventory'] });

    expect(mockRunSyncPage).toHaveBeenCalledTimes(3);
    expect(mockRunSyncPage).toHaveBeenNthCalledWith(1, 'inventory', 'key', STORE, 1, {});
    expect(mockRunSyncPage).toHaveBeenNthCalledWith(3, 'inventory', 'key', STORE, 3, {});
    expect(result.operations[0].pages).toBe(3);
    expect(result.operations[0].processed).toBe(30);
    expect(result.operations[0].truncated).toBe(false);
  });

  it('stops at the page cap and says so rather than looping forever', async () => {
    mockRunSyncPage.mockResolvedValue(page({ hasMore: true }));

    const result = await runManualSync(STORE, { operations: ['products'] });

    expect(mockRunSyncPage).toHaveBeenCalledTimes(PAGE_CAP);
    expect(result.operations[0].truncated).toBe(true);
  });

  it('stops starting pages once the time budget is spent', async () => {
    mockRunSyncPage.mockResolvedValue(page({ hasMore: true }));

    // A zero budget means the deadline has already passed when the first page is considered.
    const result = await runManualSync(STORE, { operations: ['products'], budgetMs: 0 });

    expect(mockRunSyncPage).not.toHaveBeenCalled();
    expect(result.operations[0].truncated).toBe(true);
  });

  it('reports failure when an operation throws, and still runs the rest', async () => {
    mockRunSyncPage.mockImplementation(async (operation: SyncOperation) => {
      if (operation === 'products') {
        throw new Error('ShipStation returned 429');
      }
      return page();
    });

    const result = await runManualSync(STORE, { operations: ['products', 'inventory'] });

    expect(result.success).toBe(false);
    expect(collectErrors(result)).toEqual(['products: ShipStation returned 429']);
    // The failure must not cost the operations that follow it.
    expect(result.operations[1].operation).toBe('inventory');
    expect(result.operations[1].error).toBeUndefined();
    expect(result.operations[1].processed).toBe(10);
  });

  it('keeps the counts written before a mid-operation failure', async () => {
    mockRunSyncPage
      .mockResolvedValueOnce(page({ processed: 100, hasMore: true }))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await runManualSync(STORE, { operations: ['inventory'] });

    expect(result.operations[0].processed).toBe(100);
    expect(result.operations[0].error).toBe('boom');
  });

  it('records the run against the integration row', async () => {
    await runManualSync(STORE, { operations: ['inventory'] });

    expect(mockRecordSyncStatus).toHaveBeenNthCalledWith(1, STORE, 'running');
    expect(mockRecordSyncStatus).toHaveBeenNthCalledWith(2, STORE, 'completed', null);
  });

  it('records a failed run with the operation that broke', async () => {
    mockRunSyncPage.mockRejectedValue(new Error('nope'));

    await runManualSync(STORE, { operations: ['inventory'] });

    expect(mockRecordSyncStatus).toHaveBeenNthCalledWith(2, STORE, 'failed', 'inventory: nope');
  });

  it('writes a store-scoped sync log for each operation', async () => {
    await runManualSync(STORE, { operations: ['warehouses', 'inventory'] });

    expect(mockWriteSyncLog).toHaveBeenCalledTimes(2);
    expect(mockWriteSyncLog).toHaveBeenCalledWith(
      STORE,
      expect.objectContaining({ operation: 'warehouses', success: true, recordsProcessed: 10 })
    );
  });
});

describe('toCounts', () => {
  it('folds operation results into the triple the admin UI renders', async () => {
    const result = await runManualSync(STORE, { operations: ['products', 'inventory'] });

    expect(toCounts(result.operations)).toEqual({
      totalCount: 20,
      addedCount: 8,
      updatedCount: 12
    });
  });
});
