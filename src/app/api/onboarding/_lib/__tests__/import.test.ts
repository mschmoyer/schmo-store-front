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
  RATE_LIMIT_RETRIES,
  describeImportError,
  failProgress,
  fetchStockForSkus,
  finishProgress,
  hasNextPage,
  readTotal,
  retryAfterMs,
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
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as unknown as Response;
}

/** Backoff without the wait. */
const noSleep = async (): Promise<void> => {};

interface ShipStationFakeOptions {
  /** Size of the fake catalog. */
  products: number;
  /**
   * Inventory rows per SKU. ShipStation returns one row per
   * warehouse/location, so a SKU legitimately appears more than once and the
   * quantities have to be summed.
   */
  rowsPerSku?: number;
  /** Available quantity on each row. */
  availablePerRow?: number;
  /** Serve N `429`s before the first successful response on each endpoint. */
  rateLimitFirst?: number;
  /** `Retry-After` header value sent with a 429. */
  retryAfter?: string;
  /** Drop `total`/`pages`/`links` from the products envelope. */
  withoutTotals?: boolean;
}

/**
 * A ShipStation stand-in that behaves like the real V2 list endpoints.
 *
 * It carries `total`, `pages` and `links.next` exactly as
 * `docs/shipstation-api-openapi.yaml` describes, honours the inventory `sku`
 * filter, and paginates the filtered inventory result — which is precisely the
 * behaviour the old single-page read got wrong.
 *
 * @param options - {@link ShipStationFakeOptions}
 * @returns A fetch stand-in plus the requests it served
 */
function shipStationOf(options: ShipStationFakeOptions) {
  const {
    products: totalProducts,
    rowsPerSku = 1,
    availablePerRow = 3,
    rateLimitFirst = 0,
    retryAfter,
    withoutTotals = false,
  } = options;

  const productPages: number[] = [];
  const inventoryRequests: Array<{ page: number; skus: string[] }> = [];
  let rateLimitsLeft = rateLimitFirst;

  const envelope = (page: number, pages: number, total: number) =>
    withoutTotals
      ? {}
      : {
          total,
          page,
          pages,
          links: { next: page < pages ? { href: `?page=${page + 1}` } : null },
        };

  const fetchImpl: FetchLike = async (url) => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page') ?? '1');

    if (rateLimitsLeft > 0) {
      rateLimitsLeft -= 1;
      return json({ errors: [{ message: 'Too many requests' }] }, 429,
        retryAfter === undefined ? {} : { 'retry-after': retryAfter });
    }

    if (parsed.pathname.endsWith('/warehouses')) {
      return json({ warehouses: [{ warehouse_id: 'w1' }, { warehouse_id: 'w2' }] });
    }

    if (parsed.pathname.endsWith('/inventory')) {
      const skus = (parsed.searchParams.get('sku') ?? '').split(',').filter(Boolean);
      inventoryRequests.push({ page, skus });

      // One row per SKU per warehouse, then paginated at PAGE_SIZE.
      const allRows = skus.flatMap((sku) =>
        Array.from({ length: rowsPerSku }, (_, warehouse) => ({
          sku,
          available: availablePerRow,
          inventory_warehouse_id: `w${warehouse + 1}`,
        })),
      );
      const pages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
      const slice = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return json({ inventory: slice, ...envelope(page, pages, allRows.length) });
    }

    productPages.push(page);
    const pages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const count = Math.max(0, Math.min(PAGE_SIZE, totalProducts - start));
    return json({
      products: Array.from({ length: count }, (_, index) => ({
        product_id: `p${start + index}`,
        sku: `SKU-${start + index}`,
        name: `Product ${start + index}`,
        customs_value: { amount: 9.99 },
      })),
      ...envelope(page, pages, totalProducts),
    });
  };

  return { fetchImpl, productPages, inventoryRequests };
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

  it('reads a total out of the list envelope so the bar has a real denominator', async () => {
    const shipstation = shipStationOf({ products: 250 });
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl: shipstation.fetchImpl,
      maxPages: 1,
      sleep: noSleep,
    });
    // One page read of a 250-product catalog: 100 found, 250 total.
    expect(result.found).toBe(100);
    expect(result.total).toBe(250);
    expect(result.hasMore).toBe(true);
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

/* ------------------------------------------------------------------ *
 * Envelope reading
 * ------------------------------------------------------------------ */

describe('readTotal', () => {
  it('prefers the envelope total', () => {
    expect(readTotal({ total: 4_812, pages: 49 })).toBe(4_812);
  });

  it('falls back to pages × page size when only a page count is sent', () => {
    expect(readTotal({ pages: 50 })).toBe(50 * PAGE_SIZE);
  });

  it('reports unknown rather than guessing when the envelope says nothing', () => {
    expect(readTotal({})).toBeNull();
  });

  it('treats a legitimately empty catalog as zero, not unknown', () => {
    expect(readTotal({ total: 0 })).toBe(0);
  });
});

describe('hasNextPage', () => {
  it('trusts links.next when it is present', () => {
    expect(hasNextPage({ links: { next: { href: '?page=2' } } }, 1, 3)).toBe(true);
    expect(hasNextPage({ links: { next: null } }, 9, PAGE_SIZE)).toBe(false);
  });

  it('falls back to the page count', () => {
    expect(hasNextPage({ pages: 3 }, 2, 7)).toBe(true);
    expect(hasNextPage({ pages: 3 }, 3, 7)).toBe(false);
  });

  it('falls back to a full page when the envelope carries no pagination at all', () => {
    expect(hasNextPage({}, 1, PAGE_SIZE)).toBe(true);
    expect(hasNextPage({}, 1, PAGE_SIZE - 1)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

describe('retryAfterMs', () => {
  const withHeader = (value: string | null) =>
    ({ headers: { get: () => value } }) as unknown as Response;

  it('honours Retry-After, in seconds', () => {
    expect(retryAfterMs(withHeader('2'), 1)).toBe(2_000);
  });

  it('clamps an absurd Retry-After so a slice cannot be parked', () => {
    expect(retryAfterMs(withHeader('3600'), 1)).toBe(5_000);
  });

  it('backs off progressively when the header is missing or unusable', () => {
    expect(retryAfterMs(withHeader(null), 1)).toBe(1_000);
    expect(retryAfterMs(withHeader('soon'), 2)).toBe(2_000);
  });

  it('survives a response with no headers object at all', () => {
    expect(retryAfterMs({} as unknown as Response, 1)).toBe(1_000);
  });
});

describe('rate limits during an import', () => {
  it('retries a 429 and completes rather than failing the import', async () => {
    const shipstation = shipStationOf({ products: 5, rateLimitFirst: 2, retryAfter: '0' });
    const waits: number[] = [];
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl: shipstation.fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toHaveLength(2);
    expect(result.status).toBe('complete');
    expect(result.imported).toBe(5);
  });

  it('gives up with resumable copy when the rate limit never lifts', async () => {
    const shipstation = shipStationOf({
      products: 5,
      rateLimitFirst: RATE_LIMIT_RETRIES + 5,
      retryAfter: '0',
    });
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl: shipstation.fetchImpl,
      sleep: noSleep,
    });
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/rate-limiting/);
    expect(result.errorAction).toBe('Retry');
  });
});

/* ------------------------------------------------------------------ *
 * Inventory pagination — the defect this suite exists for
 * ------------------------------------------------------------------ */

describe('fetchStockForSkus', () => {
  it('pages a filtered inventory result to exhaustion and sums across warehouses', async () => {
    const shipstation = shipStationOf({
      products: 0,
      rowsPerSku: 3,
      availablePerRow: 4,
    });
    const skus = Array.from({ length: 100 }, (_, index) => `SKU-${index}`);
    const stock = await fetchStockForSkus(skus, 'key', shipstation.fetchImpl, noSleep);

    // 100 SKUs × 3 warehouse rows = 300 rows = 3 pages of 100.
    expect(shipstation.inventoryRequests.map((request) => request.page)).toEqual([1, 2, 3]);
    expect(stock.size).toBe(100);
    for (const sku of skus) expect(stock.get(sku)).toBe(12);
  });

  it('asks for nothing when the page has no SKUs', async () => {
    const shipstation = shipStationOf({ products: 0 });
    const stock = await fetchStockForSkus([], 'key', shipstation.fetchImpl, noSleep);
    expect(stock.size).toBe(0);
    expect(shipstation.inventoryRequests).toHaveLength(0);
  });

  it('ignores rows for SKUs it did not ask about', async () => {
    const fetchImpl: FetchLike = async () =>
      json({ inventory: [{ sku: 'WANTED', available: 5 }, { sku: 'STRANGER', available: 99 }] });
    const stock = await fetchStockForSkus(['WANTED'], 'key', fetchImpl, noSleep);
    expect([...stock.entries()]).toEqual([['WANTED', 5]]);
  });
});

describe('a five-thousand SKU catalog', () => {
  const TOTAL = 5_000;

  /**
   * Drive the wizard's loop to completion the way the client does.
   *
   * @param fetchImpl - The ShipStation stand-in
   * @param writeProduct - The recording writer
   * @returns Terminal progress and how many slices it took
   */
  async function driveToCompletion(fetchImpl: FetchLike, writeProduct: ProductWriter) {
    let progress: ImportProgress = startedProgress();
    let slices = 0;
    while (progress.hasMore && slices < 500) {
      progress = await runImportSlice({
        storeId: 'store-1',
        apiKey: 'key',
        progress,
        writeProduct,
        fetchImpl,
        sleep: noSleep,
      });
      slices += 1;
    }
    return { progress, slices };
  }

  it('imports every one of 5,000 products with its real stock level', async () => {
    const shipstation = shipStationOf({ products: TOTAL, rowsPerSku: 2, availablePerRow: 6 });
    const writer = recordingWriter();
    const { progress, slices } = await driveToCompletion(shipstation.fetchImpl, writer.writeProduct);

    expect(progress.status).toBe('complete');
    expect(progress.found).toBe(TOTAL);
    expect(progress.imported).toBe(TOTAL);
    expect(progress.failed).toBe(0);
    expect(progress.total).toBe(TOTAL);

    // Every page of the catalog, exactly once.
    expect(shipstation.productPages).toEqual(
      Array.from({ length: TOTAL / PAGE_SIZE }, (_, index) => index + 1),
    );
    expect(slices).toBe(Math.ceil(TOTAL / PAGE_SIZE / MAX_PAGES_PER_SLICE));

    // The regression this whole change exists to prevent: not one product may
    // be written with a fabricated zero.
    expect(writer.written).toHaveLength(TOTAL);
    expect(new Set(writer.written.map((row) => row.sku)).size).toBe(TOTAL);
    expect(writer.written.filter((row) => row.stock === 0)).toHaveLength(0);
    for (const row of writer.written) expect(row.stock).toBe(12);
    expect(progress.skus).toBe(TOTAL);
  });

  it('never reports a percentage above the fraction actually imported', async () => {
    const shipstation = shipStationOf({ products: TOTAL });
    const writer = recordingWriter();

    let progress: ImportProgress = startedProgress();
    const percents: number[] = [];
    while (progress.hasMore) {
      progress = await runImportSlice({
        storeId: 'store-1',
        apiKey: 'key',
        progress,
        writeProduct: writer.writeProduct,
        fetchImpl: shipstation.fetchImpl,
        sleep: noSleep,
      });
      const total = progress.total;
      if (total !== null && total > 0) {
        percents.push(Math.round((progress.imported / total) * 100));
      }
    }

    // The old code reported 100 after the very first slice.
    expect(percents[0]).toBeLessThan(10);
    expect(percents[percents.length - 1]).toBe(100);
    // Monotonically increasing, never above 100.
    for (let index = 1; index < percents.length; index += 1) {
      expect(percents[index]).toBeGreaterThanOrEqual(percents[index - 1]);
      expect(percents[index]).toBeLessThanOrEqual(100);
    }
  });

  it('reports an unknown total rather than a false one when the envelope omits it', async () => {
    const shipstation = shipStationOf({ products: 250, withoutTotals: true });
    const result = await runImportSlice({
      storeId: 'store-1',
      apiKey: 'key',
      progress: startedProgress(),
      writeProduct: recordingWriter().writeProduct,
      fetchImpl: shipstation.fetchImpl,
      maxPages: 1,
      sleep: noSleep,
    });
    expect(result.total).toBeNull();
    expect(result.found).toBe(100);
    expect(result.hasMore).toBe(true);
  });
});
