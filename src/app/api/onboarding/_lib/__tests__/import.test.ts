/**
 * Tests for the catalog import's slicing, resume and failure classification.
 *
 * The database write is injected (`writeProduct`), so the slicing, cursor,
 * budget and error-classification logic all run for real; only the row write and
 * the network are substituted. Nothing under test is stubbed out.
 */

import {
  MAX_PAGES_PER_SLICE,
  PAGE_SIZE,
  describeImportError,
  failProgress,
  finishProgress,
  runImportSlice,
  startedProgress,
  type ProductWriter,
} from '../import';
import type { FetchLike } from '../shipstation';
import type { ImportProgress } from '@/components/onboarding/lib/types';

/**
 * A writer that records what it was asked to store and accepts anything with a
 * SKU — the same contract the real one honours.
 *
 * @returns The stub plus the rows it saw
 */
function recordingWriter() {
  const written: Array<{ sku: string; stock: number }> = [];
  const writeProduct: ProductWriter = async (product, _storeId, stock) => {
    if (!product.sku) return false;
    written.push({ sku: product.sku, stock });
    return true;
  };
  return { writeProduct, written };
}

/**
 * Build a fetch that serves a fake ShipStation with `total` products.
 *
 * @param total - Size of the fake catalog
 * @returns A fetch stand-in plus the product pages it served
 */
function catalogOf(total: number) {
  const pagesServed: number[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (parsed.pathname.endsWith('/warehouses')) {
      return json({ warehouses: [{ warehouse_id: 'w1' }, { warehouse_id: 'w2' }] });
    }
    if (parsed.pathname.endsWith('/inventory')) {
      return json({ inventory: [{ sku: 'SKU-1', available: 7 }] });
    }

    pagesServed.push(page);
    const start = (page - 1) * PAGE_SIZE;
    const count = Math.max(0, Math.min(PAGE_SIZE, total - start));
    return json({
      products: Array.from({ length: count }, (_, index) => ({
        product_id: `p${start + index}`,
        sku: `SKU-${start + index}`,
        name: `Product ${start + index}`,
        customs_value: { amount: 9.99 },
      })),
    });
  };
  return { fetchImpl, pagesServed };
}

/**
 * Wrap a body in the minimal Response shape the import reads.
 *
 * @param body - JSON body
 * @param status - HTTP status
 * @returns A Response stand-in
 */
function json(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe('progress helpers', () => {
  it('starts a run in the running state with zeroed counters', () => {
    const progress = startedProgress();
    expect(progress).toMatchObject({
      status: 'running',
      found: 0,
      imported: 0,
      failed: 0,
      page: 1,
      hasMore: true,
    });
    expect(progress.startedAt).toBeTruthy();
  });

  it('finishes clean when nothing failed', () => {
    const finished = finishProgress({ ...startedProgress(), imported: 12, found: 12 });
    expect(finished.status).toBe('complete');
    expect(finished.hasMore).toBe(false);
  });

  it('finishes partial when something failed', () => {
    const finished = finishProgress({ ...startedProgress(), imported: 10, failed: 2, found: 12 });
    expect(finished.status).toBe('partial');
  });

  it('treats an empty catalog as complete, not as a failure', () => {
    expect(finishProgress(startedProgress()).status).toBe('complete');
  });

  it('preserves counters when a run fails partway', () => {
    const failed = failProgress(
      { ...startedProgress(), imported: 412, found: 500 },
      'ShipStation stopped answering',
      'Retry'
    );
    expect(failed).toMatchObject({
      status: 'failed',
      imported: 412,
      error: 'ShipStation stopped answering',
      errorAction: 'Retry',
      hasMore: false,
    });
  });
});

describe('describeImportError', () => {
  it('names a revoked connection on 401/403', () => {
    for (const httpStatus of [401, 403]) {
      const error = Object.assign(new Error('nope'), { httpStatus });
      expect(describeImportError(error)).toEqual({
        message:
          'Sync failed before it started. Your ShipStation connection may have been revoked.',
        action: 'Check connection',
      });
    }
  });

  it('names rate limiting on 429', () => {
    const error = Object.assign(new Error('slow down'), { httpStatus: 429 });
    expect(describeImportError(error).message).toMatch(/rate-limiting/);
  });

  it('blames their side on a 5xx', () => {
    const error = Object.assign(new Error('boom'), { httpStatus: 500 });
    expect(describeImportError(error).message).toMatch(/on their end/);
  });

  it('explains a 404 as a missing catalog endpoint rather than a bad key', () => {
    const error = Object.assign(new Error('missing'), { httpStatus: 404 });
    expect(describeImportError(error).message).toMatch(/product catalog endpoint/);
  });

  it('falls back to unreachable for a bare transport error', () => {
    expect(describeImportError(new TypeError('fetch failed')).message).toMatch(
      /couldn’t reach ShipStation/
    );
  });
});

describe('runImportSlice', () => {
  it('imports a small catalog in one slice and finishes', async () => {
    const { fetchImpl, pagesServed } = catalogOf(12);
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(result.status).toBe('complete');
    expect(result.found).toBe(12);
    expect(result.imported).toBe(12);
    expect(result.warehouses).toBe(2);
    expect(pagesServed).toEqual([1]);
  });

  it('stops after the slice budget and reports that there is more to do', async () => {
    const { fetchImpl, pagesServed } = catalogOf(PAGE_SIZE * (MAX_PAGES_PER_SLICE + 2));
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(pagesServed).toHaveLength(MAX_PAGES_PER_SLICE);
    expect(result.status).toBe('running');
    expect(result.hasMore).toBe(true);
    expect(result.page).toBe(MAX_PAGES_PER_SLICE + 1);
  });

  it('resumes from the stored cursor rather than restarting', async () => {
    const total = PAGE_SIZE * 2 + 5;
    const { fetchImpl, pagesServed } = catalogOf(total);

    let progress: ImportProgress = startedProgress();
    let slices = 0;
    while (progress.hasMore && slices < 10) {
      progress = await runImportSlice({
        storeId: 'store-1',
        apiKey: 'key',
        progress,
        writeProduct: recordingWriter().writeProduct,
        fetchImpl,
        maxPages: 1,
      });
      slices += 1;
    }

    expect(pagesServed).toEqual([1, 2, 3]);
    expect(progress.status).toBe('complete');
    expect(progress.imported).toBe(total);
  });

  it('honours the wall-clock budget even when pages are still available', async () => {
    const { fetchImpl, pagesServed } = catalogOf(PAGE_SIZE * 5);
    let clock = 0;
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
      budgetMs: 10,
      // Every read of the clock jumps 8ms, so the budget expires after one page.
      now: () => {
        clock += 8;
        return clock;
      },
    });
    expect(pagesServed.length).toBeLessThan(MAX_PAGES_PER_SLICE);
    expect(result.hasMore).toBe(true);
  });

  it('fails with actionable copy when ShipStation rejects the key mid-import', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes('/warehouses') || url.includes('/inventory')) return json({}, 200);
      return json({ errors: [{ message: 'Unauthorized' }] }, 401);
    };
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(result.status).toBe('failed');
    expect(result.errorAction).toBe('Check connection');
  });

  it('fails gracefully with no network at all — the local reality', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/couldn’t reach ShipStation/);
    expect(result.hasMore).toBe(false);
  });

  it('still imports the catalog when the inventory endpoint is unavailable', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes('/inventory')) return json({ errors: [] }, 500);
      if (url.includes('/warehouses')) return json({ warehouses: [] });
      return json({
        products: [{ product_id: 'p1', sku: 'SKU-1', name: 'One', customs_value: { amount: 1 } }],
      });
    };
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(result.status).toBe('complete');
    expect(result.imported).toBe(1);
  });

  it('counts a product with no SKU as failed rather than dropping it silently', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes('/inventory')) return json({ inventory: [] });
      if (url.includes('/warehouses')) return json({ warehouses: [] });
      return json({ products: [{ product_id: 'p1', name: 'Nameless' }] });
    };
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl,
    });
    expect(result.found).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.status).toBe('partial');
  });
});
