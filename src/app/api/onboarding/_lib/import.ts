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

import { db } from '@/lib/database/connection';
import type { ImportProgress } from '@/components/onboarding/lib/types';
import type { FetchLike } from './shipstation';

/** Pages of 100 products per POST. Keeps a slice comfortably under any
 *  serverless limit while still making visible progress. */
export const MAX_PAGES_PER_SLICE = 3;

/** Wall-clock budget for one slice. */
export const SLICE_BUDGET_MS = 8_000;

/** ShipStation's page size. */
export const PAGE_SIZE = 100;

const PRODUCTS_URL = 'https://api.shipstation.com/v2/products';
const INVENTORY_URL = 'https://api.shipstation.com/v2/inventory';
const WAREHOUSES_URL = 'https://api.shipstation.com/v2/warehouses';

interface ShipStationProduct {
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

export interface ImportSliceOptions {
  storeId: string;
  apiKey: string;
  /** Progress carried over from the previous slice. */
  progress: ImportProgress;
  fetchImpl?: FetchLike;
  /** Injected in tests so a slice can be forced to end after one page. */
  maxPages?: number;
  budgetMs?: number;
  /** Injected in tests. */
  now?: () => number;
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

/**
 * Find or create a category for the store.
 *
 * @param name - Category name from ShipStation
 * @param storeId - Owning store
 * @returns The category id
 */
async function categoryId(name: string, storeId: string): Promise<string> {
  const clean = name.trim() || 'Other';
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1 AND store_id = $2',
    [clean, storeId]
  );
  if (existing.rows.length > 0) return String(existing.rows[0].id);

  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
  const created = await db.query<{ id: string }>(
    `INSERT INTO categories (id, store_id, name, slug, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
     RETURNING id`,
    [storeId, clean, slug]
  );
  return String(created.rows[0].id);
}

/**
 * Write one ShipStation product into `products`, updating when we have seen it
 * before. Match on the ShipStation id first, then on SKU, so a catalog that was
 * previously imported by SKU alone does not duplicate.
 *
 * @param product - The product from ShipStation
 * @param storeId - Owning store
 * @param stock - Stock level for the SKU, if we have one
 * @returns Whether a row was written
 */
export async function upsertProduct(
  product: ShipStationProduct,
  storeId: string,
  stock: number
): Promise<boolean> {
  const sku = (product.sku ?? '').trim();
  const name = (product.name ?? '').trim() || sku;
  if (!sku || !name) return false;

  const shipstationId = product.product_id ? String(product.product_id) : null;
  const price = Number(product.customs_value?.amount ?? 0) || 0;
  const active = product.active !== false;
  const category = await categoryId(
    product.product_category?.name || product.category || 'Other',
    storeId
  );
  const slug = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || sku;

  const existing = await db.query<{ id: string }>(
    `SELECT id FROM products
      WHERE store_id = $1
        AND ((($2::text IS NOT NULL) AND shipstation_product_id = $2) OR sku = $3)
      ORDER BY (shipstation_product_id = $2) DESC NULLS LAST
      LIMIT 1`,
    [storeId, shipstationId, sku]
  );

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE products
          SET shipstation_product_id = COALESCE($2, shipstation_product_id),
              sku = $3, name = $4, short_description = $5, base_price = $6,
              featured_image_url = $7, is_active = $8, stock_quantity = $9,
              category_id = $10, updated_at = NOW()
        WHERE id = $1`,
      [
        existing.rows[0].id,
        shipstationId,
        sku,
        name,
        product.description ?? null,
        price,
        product.thumbnail_url ?? null,
        active,
        stock,
        category,
      ]
    );
    return true;
  }

  await db.query(
    `INSERT INTO products (
        id, store_id, shipstation_product_id, sku, name, slug, short_description,
        base_price, featured_image_url, is_active, stock_quantity, category_id,
        created_at, updated_at
     ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
     )`,
    [
      storeId,
      shipstationId,
      sku,
      name,
      slug,
      product.description ?? null,
      price,
      product.thumbnail_url ?? null,
      active,
      stock,
      category,
    ]
  );
  return true;
}

/**
 * GET one ShipStation collection page.
 *
 * @param url - Endpoint
 * @param apiKey - Merchant's key
 * @param fetchImpl - Injected fetch
 * @param page - 1-based page number
 * @returns Parsed JSON body
 * @throws When the transport fails or ShipStation returns a non-2xx
 */
async function getPage(
  url: string,
  apiKey: string,
  fetchImpl: FetchLike,
  page: number
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${url}?page=${page}&page_size=${PAGE_SIZE}`, {
    method: 'GET',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = new Error(`ShipStation returned HTTP ${response.status}`) as Error & {
      httpStatus?: number;
    };
    error.httpStatus = response.status;
    throw error;
  }
  return (await response.json()) as Record<string, unknown>;
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
    maxPages = MAX_PAGES_PER_SLICE,
    budgetMs = SLICE_BUDGET_MS,
    now = Date.now,
  } = options;

  let progress: ImportProgress = { ...options.progress, status: 'running', error: null };
  const deadline = now() + budgetMs;

  try {
    // Warehouse count is cheap and only worth reading once, on the first slice.
    if (progress.page === 1 && progress.warehouses === 0) {
      const warehouses = await getPage(WAREHOUSES_URL, apiKey, fetchImpl, 1);
      const list = warehouses.warehouses;
      progress = { ...progress, warehouses: Array.isArray(list) ? list.length : 0 };
    }

    // Stock levels, read once on the first slice and applied to every page.
    // Kept in memory only for the duration of a slice; re-read on resume.
    const stockBySku = new Map<string, number>();
    try {
      const inventory = await getPage(INVENTORY_URL, apiKey, fetchImpl, 1);
      const list = Array.isArray(inventory.inventory) ? inventory.inventory : [];
      for (const raw of list) {
        const item = raw as { sku?: string; available?: number };
        if (item.sku) stockBySku.set(item.sku, Number(item.available ?? 0) || 0);
      }
      progress = { ...progress, skus: Math.max(progress.skus, stockBySku.size) };
    } catch {
      // Inventory is a nice-to-have. A catalog with no stock levels still beats
      // no catalog, so this failure is swallowed deliberately.
    }

    let pagesThisSlice = 0;
    while (progress.hasMore && pagesThisSlice < maxPages && now() < deadline) {
      const body = await getPage(PRODUCTS_URL, apiKey, fetchImpl, progress.page);
      const products = (Array.isArray(body.products) ? body.products : []) as ShipStationProduct[];

      let imported = progress.imported;
      let failed = progress.failed;
      for (const product of products) {
        try {
          const written = await upsertProduct(product, storeId, stockBySku.get(product.sku ?? '') ?? 0);
          if (written) imported += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }

      progress = {
        ...progress,
        found: progress.found + products.length,
        imported,
        failed,
        page: progress.page + 1,
        hasMore: products.length === PAGE_SIZE,
      };
      pagesThisSlice += 1;
    }

    return progress.hasMore ? progress : finishProgress(progress);
  } catch (error) {
    const described = describeImportError(error);
    return failProgress(progress, described.message, described.action);
  }
}
