/**
 * The onboarding catalog import.
 *
 * Constraints this is built to, from the brief and from the audit:
 *
 *  - **Real progress, not a spinner.** Every counter the wizard renders is a
 *    row count from this file, checkpointed to `onboarding_sessions.import_state`
 *    after each page.
 *  - **Never hangs the request.** One POST runs a *bounded slice* — at most
 *    {@link MAX_PAGES_PER_SLICE} pages or {@link SLICE_BUDGET_MS} of wall clock,
 *    whichever comes first — then returns. The client keeps posting while
 *    `hasMore` is true. A ten-thousand-SKU catalog is many short requests, not
 *    one request that dies at the platform timeout (audit P1-2).
 *  - **Resumable and idempotent.** The page cursor is persisted, and every write
 *    is an upsert keyed on `(store_id, shipstation_product_id)` falling back to
 *    `(store_id, sku)`. Re-running a slice updates rather than duplicates.
 *  - **Injectable.** `fetchImpl` is a parameter so the error branches are
 *    testable without touching the network.
 */

import type { ImportProgress } from '@/components/onboarding/lib/types';
import type { FetchLike } from './shipstation';

/** Pages of 100 products per POST. Keeps a slice comfortably under any
 *  serverless limit while still making visible progress. */
export const MAX_PAGES_PER_SLICE = 3;

/** Wall-clock budget for one slice. */
export const SLICE_BUDGET_MS = 8_000;

/** ShipStation's page size. */
export const PAGE_SIZE = 100;

/**
 * Hard ceiling on inventory pages read for a single products page.
 *
 * A SKU appears once per warehouse/location, so a 100-SKU page can legitimately
 * be several hundred inventory rows. The ceiling only exists so a ShipStation
 * that ignores our filter and never stops paginating cannot spin forever.
 */
export const MAX_INVENTORY_PAGES = 50;

/** How many times a 429 is retried before the slice gives up. */
export const RATE_LIMIT_RETRIES = 3;

/** Fallback pause when a 429 arrives with no usable `Retry-After`. */
export const RATE_LIMIT_FALLBACK_MS = 1_000;

/** Upper bound on any single rate-limit pause, so a slice cannot be parked. */
export const RATE_LIMIT_MAX_WAIT_MS = 5_000;

const PRODUCTS_URL = 'https://api.shipstation.com/v2/products';
const INVENTORY_URL = 'https://api.shipstation.com/v2/inventory';
const WAREHOUSES_URL = 'https://api.shipstation.com/v2/warehouses';

export interface ShipStationProduct {
  product_id?: string;
  sku?: string;
  name?: string;
  description?: string;
  customs_value?: { amount?: number };
  thumbnail_url?: string;
  active?: boolean;
  product_category?: { name?: string };
  category?: string;
}

/**
 * How a product gets written. The real implementation lives in
 * `./import-writer.ts`; tests supply a stub so the slicing logic below runs for
 * real without a database.
 */
export type ProductWriter = (
  product: ShipStationProduct,
  storeId: string,
  stock: number
) => Promise<boolean>;

export interface ImportSliceOptions {
  storeId: string;
  apiKey: string;
  /** Progress carried over from the previous slice. */
  progress: ImportProgress;
  fetchImpl?: FetchLike;
  /** Injected by the route (real writer) and by tests (stub). */
  writeProduct: ProductWriter;
  /** Injected in tests so a slice can be forced to end after one page. */
  maxPages?: number;
  budgetMs?: number;
  /** Injected in tests. */
  now?: () => number;
  /** Injected in tests so rate-limit backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A fresh progress object for a run that is about to start.
 *
 * @returns Zeroed progress in the `running` state
 */
export function startedProgress(): ImportProgress {
  return {
    status: 'running',
    found: 0,
    total: null,
    imported: 0,
    failed: 0,
    skus: 0,
    warehouses: 0,
    page: 1,
    hasMore: true,
    error: null,
    errorAction: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

/**
 * Terminal status for a run that has read every page.
 *
 * A run that wrote nothing but also failed nothing is `complete` with zero
 * products — the copy deck has a specific empty-catalog state for that, and it
 * is not an error.
 *
 * @param progress - Progress after the last page
 * @returns The same progress, finished
 */
export function finishProgress(progress: ImportProgress): ImportProgress {
  return {
    ...progress,
    status: progress.failed > 0 ? 'partial' : 'complete',
    hasMore: false,
    // Every page has been read, so `found` *is* the total. Setting it here is
    // what lets a finished bar read a truthful 100% even when ShipStation
    // never sent a count.
    total: progress.found,
    finishedAt: new Date().toISOString(),
  };
}

/**
 * Terminal status for a run that died.
 *
 * The counters are preserved: "412 products synced, then ShipStation stopped
 * answering" is a far more useful thing to show than a bare failure.
 *
 * @param progress - Progress at the point of failure
 * @param message - Merchant-facing sentence
 * @param action - The one thing to do next
 * @returns The same progress, failed
 */
export function failProgress(
  progress: ImportProgress,
  message: string,
  action: string
): ImportProgress {
  return {
    ...progress,
    status: 'failed',
    hasMore: false,
    error: message,
    errorAction: action,
    finishedAt: new Date().toISOString(),
  };
}

/** Wait, injectable so tests never really sleep. */
const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * How long to wait before retrying a rate-limited request.
 *
 * ShipStation sends `Retry-After` in seconds on a 429. A response stand-in with
 * no `headers` (or a header we cannot parse) falls back to a fixed pause, and
 * every value is clamped so a hostile or mistaken header cannot park a slice.
 *
 * @param response - The 429 response
 * @param attempt - 1-based retry attempt, used for a gentle backoff
 * @returns Milliseconds to wait
 */
export function retryAfterMs(response: Pick<Response, 'headers'>, attempt: number): number {
  const raw = response.headers?.get?.('retry-after') ?? null;
  const seconds = raw === null ? Number.NaN : Number(raw);
  const suggested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
  const wait = suggested ?? RATE_LIMIT_FALLBACK_MS * attempt;
  return Math.min(Math.max(wait, 0), RATE_LIMIT_MAX_WAIT_MS);
}

/**
 * GET one ShipStation collection page, retrying a rate limit rather than
 * turning it into a failed import.
 *
 * A 429 is not an error the merchant can act on — it means we asked too fast.
 * The request is retried up to {@link RATE_LIMIT_RETRIES} times, honouring
 * `Retry-After`; only a 429 that survives all of them is thrown, and it still
 * classifies as "the sync will resume automatically" in
 * {@link describeImportError}.
 *
 * @param url - Endpoint
 * @param apiKey - Merchant's key
 * @param fetchImpl - Injected fetch
 * @param query - Query parameters, appended verbatim
 * @param sleep - Injected wait
 * @returns Parsed JSON body
 * @throws When the transport fails or ShipStation returns a non-2xx
 */
async function getPage(
  url: string,
  apiKey: string,
  fetchImpl: FetchLike,
  query: Record<string, string | number>,
  sleep: (ms: number) => Promise<void> = realSleep
): Promise<Record<string, unknown>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) search.set(key, String(value));

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(`${url}?${search.toString()}`, {
      method: 'GET',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    });

    if (response.ok) return (await response.json()) as Record<string, unknown>;

    if (response.status === 429 && attempt <= RATE_LIMIT_RETRIES) {
      await sleep(retryAfterMs(response, attempt));
      continue;
    }

    const error = new Error(`ShipStation returned HTTP ${response.status}`) as Error & {
      httpStatus?: number;
    };
    error.httpStatus = response.status;
    throw error;
  }
}

/**
 * Read the catalog size out of a ShipStation list envelope.
 *
 * V2 list responses carry `total` and `pages` (see
 * `docs/shipstation-api-openapi.yaml`). Either is enough to give the merchant a
 * denominator; neither being present is reported honestly as "unknown" rather
 * than guessed at.
 *
 * @param body - A parsed list response
 * @param pageSize - The page size the request asked for
 * @returns The catalog size, or `null` when the envelope does not say
 */
export function readTotal(body: Record<string, unknown>, pageSize = PAGE_SIZE): number | null {
  const total = Number(body.total);
  if (Number.isFinite(total) && total >= 0) return total;
  const pages = Number(body.pages);
  if (Number.isFinite(pages) && pages > 0) return pages * pageSize;
  return null;
}

/**
 * Whether a list envelope says there is another page after `page`.
 *
 * `links.next` is authoritative when present; `pages` is the next best answer;
 * a full page is the last resort, which is the only signal the previous
 * implementation had.
 *
 * @param body - A parsed list response
 * @param page - The 1-based page just read
 * @param received - How many rows came back
 * @param pageSize - The page size the request asked for
 * @returns Whether to ask for another page
 */
export function hasNextPage(
  body: Record<string, unknown>,
  page: number,
  received: number,
  pageSize = PAGE_SIZE
): boolean {
  const links = body.links as { next?: { href?: string } | null } | undefined;
  if (links && Object.prototype.hasOwnProperty.call(links, 'next')) {
    return Boolean(links.next?.href);
  }
  const pages = Number(body.pages);
  if (Number.isFinite(pages) && pages > 0) return page < pages;
  return received === pageSize;
}

/**
 * Read every inventory row for a set of SKUs and sum the available quantity.
 *
 * This is the fix for the defect that made the whole import untrustworthy: the
 * old code read **page 1 only**, so in a 5,000-SKU catalog the 4,900 products
 * whose SKU was not in the first hundred inventory rows were written with
 * `stock = 0` and the import still reported success.
 *
 * Two things make this correct rather than merely longer:
 *
 *  - **It asks only for the SKUs it needs.** The endpoint takes a `sku` filter
 *    (openapi `/v2/inventory`), so the lookup is scoped to the products page
 *    being written. That keeps it exhaustive without holding a five-thousand
 *    entry map in the onboarding session row between slices, and it means a
 *    resumed import re-reads only what it is about to write.
 *  - **It pages the filtered result to exhaustion.** A SKU has one row per
 *    warehouse and location, so even a hundred SKUs can be several pages, and
 *    the quantities are summed across them rather than last-one-wins.
 *
 * A server that ignores the filter is handled too: unwanted SKUs are simply not
 * in `wanted` and are dropped.
 *
 * @param skus - SKUs on the products page about to be written
 * @param apiKey - Merchant's key
 * @param fetchImpl - Injected fetch
 * @param sleep - Injected wait
 * @returns SKU → available quantity
 */
export async function fetchStockForSkus(
  skus: string[],
  apiKey: string,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void> = realSleep
): Promise<Map<string, number>> {
  const stock = new Map<string, number>();
  const wanted = new Set(skus);
  if (wanted.size === 0) return stock;

  for (let page = 1; page <= MAX_INVENTORY_PAGES; page += 1) {
    const body = await getPage(
      INVENTORY_URL,
      apiKey,
      fetchImpl,
      { page, page_size: PAGE_SIZE, limit: PAGE_SIZE, sku: [...wanted].join(',') },
      sleep
    );
    const rows = Array.isArray(body.inventory) ? body.inventory : [];

    for (const raw of rows) {
      const item = raw as { sku?: string; available?: number };
      if (!item.sku || !wanted.has(item.sku)) continue;
      const available = Number(item.available ?? 0);
      stock.set(item.sku, (stock.get(item.sku) ?? 0) + (Number.isFinite(available) ? available : 0));
    }

    if (!hasNextPage(body, page, rows.length)) break;
  }

  return stock;
}

/**
 * Turn a thrown import error into merchant-facing copy (deck §5.4).
 *
 * @param error - Whatever was thrown
 * @returns Message and action
 */
export function describeImportError(error: unknown): { message: string; action: string } {
  const httpStatus = (error as { httpStatus?: number })?.httpStatus;

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      message:
        'Sync failed before it started. Your ShipStation connection may have been revoked.',
      action: 'Check connection',
    };
  }
  if (httpStatus === 429) {
    return {
      message: 'ShipStation is rate-limiting us. The sync will resume automatically.',
      action: 'Retry',
    };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      message: 'ShipStation had an error on their end. Your data is untouched.',
      action: 'Retry',
    };
  }
  if (httpStatus === 404) {
    return {
      message:
        'ShipStation does not have a product catalog endpoint on this account. Your stock levels still sync — product details need to come from somewhere else.',
      action: 'Skip for now',
    };
  }
  return {
    message: 'We couldn’t reach ShipStation. This is usually on their end — your data is untouched.',
    action: 'Retry',
  };
}

/**
 * Run one bounded slice of the catalog import.
 *
 * @param options - {@link ImportSliceOptions}
 * @returns Progress after the slice; `hasMore` tells the caller to post again
 */
export async function runImportSlice(options: ImportSliceOptions): Promise<ImportProgress> {
  const {
    storeId,
    apiKey,
    fetchImpl = globalThis.fetch as unknown as FetchLike,
    writeProduct,
    maxPages = MAX_PAGES_PER_SLICE,
    budgetMs = SLICE_BUDGET_MS,
    now = Date.now,
    sleep = realSleep,
  } = options;

  let progress: ImportProgress = { ...options.progress, status: 'running', error: null };
  const deadline = now() + budgetMs;

  try {
    // Warehouse count is cheap and only worth reading once, on the first slice.
    if (progress.page === 1 && progress.warehouses === 0) {
      const warehouses = await getPage(
        WAREHOUSES_URL,
        apiKey,
        fetchImpl,
        { page: 1, page_size: PAGE_SIZE },
        sleep
      );
      const list = warehouses.warehouses;
      progress = { ...progress, warehouses: Array.isArray(list) ? list.length : 0 };
    }

    let pagesThisSlice = 0;
    while (progress.hasMore && pagesThisSlice < maxPages && now() < deadline) {
      const body = await getPage(
        PRODUCTS_URL,
        apiKey,
        fetchImpl,
        { page: progress.page, page_size: PAGE_SIZE },
        sleep
      );
      const products = (Array.isArray(body.products) ? body.products : []) as ShipStationProduct[];

      // Stock for exactly the SKUs on this page, paged to exhaustion. Doing it
      // per page rather than once for the whole catalog is what makes a
      // resumed import correct: every product is written with the stock level
      // ShipStation held at the moment it was written, and no product is left
      // at zero because its SKU fell outside an arbitrary first page.
      let stockBySku = new Map<string, number>();
      try {
        stockBySku = await fetchStockForSkus(
          products.map((product) => product.sku).filter((sku): sku is string => Boolean(sku)),
          apiKey,
          fetchImpl,
          sleep
        );
      } catch {
        // Inventory is a nice-to-have. A catalog with no stock levels still
        // beats no catalog, so this failure is swallowed deliberately — but it
        // is now swallowed per page, so one bad page cannot zero the catalog.
      }

      let imported = progress.imported;
      let failed = progress.failed;
      let skus = progress.skus;
      for (const product of products) {
        const stock = stockBySku.get(product.sku ?? '');
        try {
          const written = await writeProduct(product, storeId, stock ?? 0);
          if (written) imported += 1;
          else failed += 1;
          if (written && stock !== undefined) skus += 1;
        } catch {
          failed += 1;
        }
      }

      const found = progress.found + products.length;
      const total = readTotal(body) ?? progress.total;

      progress = {
        ...progress,
        found,
        // Never let the denominator fall below what we have already read: a
        // stale or wrong `total` must not make the bar go backwards past 100%.
        total: total === null ? null : Math.max(total, found),
        imported,
        failed,
        skus,
        page: progress.page + 1,
        hasMore: hasNextPage(body, progress.page, products.length),
      };
      pagesThisSlice += 1;
    }

    return progress.hasMore ? progress : finishProgress(progress);
  } catch (error) {
    const described = describeImportError(error);
    return failProgress(progress, described.message, described.action);
  }
}
