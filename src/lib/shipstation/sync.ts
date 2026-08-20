/**
 * Page-at-a-time ShipStation sync operations.
 *
 * The old design was "one HTTP request loops every page and every row": ~100 sequential API calls
 * and 15,000-20,000 sequential DB round trips for a 5,000-product account, inside a single
 * serverless invocation with no `maxDuration` and no checkpoint (audit P1-2). It could not finish,
 * and when it died the merchant learned nothing about how far it got.
 *
 * Here each function does exactly **one page**: fetch it, write it in one transaction, report
 * whether another page exists. The caller (`syncOrchestrator`) turns that into a chain of
 * `job_queue` rows, so no single invocation can exceed a platform limit and a crash costs one page
 * rather than the whole catalogue.
 *
 * Every network call goes through {@link shipStationFetch}, which is what makes rate-limit handling
 * uniform: a 429 on the inventory page and a 429 on the product page now behave identically
 * (P1-1), and both are retried rather than either aborting the run or silently truncating it.
 */

import type { PoolClient } from 'pg';
import { db } from '@/lib/database/connection';
import { shipStationFetch, type ShipStationFetchOptions } from './client';

/** Result of syncing a single page. */
export interface PageSyncResult {
  /** Rows read from ShipStation on this page. */
  processed: number;
  /** Rows inserted locally. */
  added: number;
  /** Rows updated locally. */
  updated: number;
  /** True when another page should be fetched. */
  hasMore: boolean;
}

/** Sync operations the orchestrator knows how to chain. */
export type SyncOperation =
  | 'warehouses'
  | 'products'
  | 'inventory'
  | 'inventory-warehouses'
  | 'inventory-locations'
  | 'shipments';

/** Operations that page; `warehouses` returns everything in one call. */
export const PAGED_OPERATIONS: readonly SyncOperation[] = [
  'products',
  'inventory',
  'inventory-warehouses',
  'inventory-locations',
  'shipments'
];

/**
 * All operations the scheduled sync runs, in dependency order.
 *
 * `products` comes before `inventory` so stock levels land on rows that already exist.
 */
export const SYNC_OPERATIONS: readonly SyncOperation[] = [
  'warehouses',
  'inventory-warehouses',
  'inventory-locations',
  'products',
  'inventory',
  'shipments'
];

/**
 * Message shown when `/v2/products` 404s.
 *
 * Audit P0-5: this endpoint appears nowhere in `docs/shipstation-api-openapi.yaml`. We still call
 * it, because some ShipStation accounts do expose it and it is the only catalogue source the
 * product has — but when it is absent the merchant deserves to be told exactly that, rather than
 * being handed a bare 404 or, as before, a whole sync run that dies at page 1.
 */
export const PRODUCTS_ENDPOINT_UNAVAILABLE =
  'ShipStation returned 404 for /v2/products. This account does not expose a product catalogue ' +
  'endpoint on the V2 API (it is not part of the published V2 contract). Warehouses and inventory ' +
  'still sync; product names, descriptions and images must come from another source.';

/** How many records we ask ShipStation for per page. */
export const PAGE_SIZE = 100;

/** Shared network options threaded through from the caller, for testability. */
export type SyncNetworkOptions = Pick<
  ShipStationFetchOptions,
  'fetchImpl' | 'sleepImpl' | 'randomImpl' | 'maxAttempts' | 'baseDelayMs' | 'timeoutMs'
>;

/** A ShipStation warehouse address block. */
interface ShipStationAddress {
  address_line1?: string;
  address_line2?: string;
  address_line3?: string;
  city_locality?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  address_residential_indicator?: string;
  phone?: string;
}

/** A ShipStation warehouse. */
interface ShipStationWarehouse {
  warehouse_id: string;
  name?: string;
  company_name?: string;
  email?: string;
  is_default?: boolean;
  instructions?: string;
  origin_address?: ShipStationAddress;
  return_address?: ShipStationAddress;
}

/** A ShipStation inventory level. */
interface ShipStationInventoryLevel {
  sku: string;
  available?: number;
  on_hand?: number;
  allocated?: number;
}

/** A ShipStation inventory warehouse. */
interface ShipStationInventoryWarehouse {
  inventory_warehouse_id: string;
  name?: string;
}

/** A ShipStation inventory location. */
interface ShipStationInventoryLocation {
  inventory_location_id: string;
  inventory_warehouse_id?: string;
  name?: string;
}

/**
 * Sync every ShipStation warehouse into `shipfroms`.
 *
 * `GET /v2/warehouses` is not paginated in the contract, so this is a single call and always
 * reports `hasMore: false`.
 *
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID that owns the rows.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} When ShipStation refuses the call after retries.
 */
export async function syncWarehousesPage(
  apiKey: string,
  storeId: string,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const response = await shipStationFetch<{ warehouses?: ShipStationWarehouse[] }>(
    '/v2/warehouses',
    { apiKey, operation: 'list warehouses', ...network }
  );

  if (!response.ok) {
    throw new Error(response.error);
  }

  const warehouses = response.data.warehouses ?? [];

  const counts = await db.transaction(async (client) => {
    let added = 0;
    let updated = 0;

    for (const warehouse of warehouses) {
      const wasUpdated = await upsertWarehouse(client, storeId, warehouse);
      if (wasUpdated) {
        updated++;
      } else {
        added++;
      }
    }

    return { added, updated };
  });

  return {
    processed: warehouses.length,
    added: counts.added,
    updated: counts.updated,
    hasMore: false
  };
}

/**
 * Upsert one warehouse row.
 *
 * @param client - Transaction client.
 * @param storeId - Owning store.
 * @param warehouse - ShipStation warehouse.
 * @returns True when an existing row was updated.
 */
async function upsertWarehouse(
  client: PoolClient,
  storeId: string,
  warehouse: ShipStationWarehouse
): Promise<boolean> {
  const origin = warehouse.origin_address ?? {};
  const returnAddress = warehouse.return_address ?? {};

  const result = await client.query(
    `INSERT INTO shipfroms (
       store_id, warehouse_id, name, company_name, phone, email, is_default,
       origin_address_line1, origin_address_line2, origin_address_line3,
       origin_city_locality, origin_state_province, origin_postal_code,
       origin_country_code, origin_residential_indicator,
       return_address_line1, return_address_line2, return_address_line3,
       return_city_locality, return_state_province, return_postal_code,
       return_country_code, return_residential_indicator,
       instructions, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW()
     )
     ON CONFLICT (store_id, warehouse_id) DO UPDATE SET
       name = EXCLUDED.name,
       company_name = EXCLUDED.company_name,
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       is_default = EXCLUDED.is_default,
       origin_address_line1 = EXCLUDED.origin_address_line1,
       origin_address_line2 = EXCLUDED.origin_address_line2,
       origin_address_line3 = EXCLUDED.origin_address_line3,
       origin_city_locality = EXCLUDED.origin_city_locality,
       origin_state_province = EXCLUDED.origin_state_province,
       origin_postal_code = EXCLUDED.origin_postal_code,
       origin_country_code = EXCLUDED.origin_country_code,
       origin_residential_indicator = EXCLUDED.origin_residential_indicator,
       return_address_line1 = EXCLUDED.return_address_line1,
       return_address_line2 = EXCLUDED.return_address_line2,
       return_address_line3 = EXCLUDED.return_address_line3,
       return_city_locality = EXCLUDED.return_city_locality,
       return_state_province = EXCLUDED.return_state_province,
       return_postal_code = EXCLUDED.return_postal_code,
       return_country_code = EXCLUDED.return_country_code,
       return_residential_indicator = EXCLUDED.return_residential_indicator,
       instructions = EXCLUDED.instructions,
       updated_at = NOW()
     RETURNING (xmax <> 0) AS was_update`,
    [
      storeId,
      warehouse.warehouse_id,
      warehouse.name ?? null,
      warehouse.company_name ?? null,
      origin.phone ?? '',
      warehouse.email ?? null,
      warehouse.is_default ?? false,
      origin.address_line1 ?? null,
      origin.address_line2 ?? null,
      origin.address_line3 ?? null,
      origin.city_locality ?? null,
      origin.state_province ?? null,
      origin.postal_code ?? null,
      origin.country_code ?? null,
      origin.address_residential_indicator ?? null,
      returnAddress.address_line1 ?? null,
      returnAddress.address_line2 ?? null,
      returnAddress.address_line3 ?? null,
      returnAddress.city_locality ?? null,
      returnAddress.state_province ?? null,
      returnAddress.postal_code ?? null,
      returnAddress.country_code ?? null,
      returnAddress.address_residential_indicator ?? null,
      warehouse.instructions ?? null
    ]
  );

  return Boolean(result.rows[0]?.was_update);
}

/**
 * Sync one page of `GET /v2/inventory` into `inventory` and `products.stock_quantity`.
 *
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param page - 1-based page number.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} When ShipStation refuses the call after retries.
 */
export async function syncInventoryPage(
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const response = await shipStationFetch<{ inventory?: ShipStationInventoryLevel[] }>(
    `/v2/inventory?page=${page}&page_size=${PAGE_SIZE}`,
    { apiKey, operation: `list inventory page ${page}`, ...network }
  );

  if (!response.ok) {
    // Fail loud, always. The previous code treated a non-OK inventory response as "no more pages",
    // which turned a rate limit into silently wrong stock counts.
    throw new Error(response.error);
  }

  const levels = response.data.inventory ?? [];

  const counts = await db.transaction(async (client) => {
    let added = 0;
    let updated = 0;

    for (const level of levels) {
      if (!level.sku) {
        continue;
      }

      const result = await client.query(
        `INSERT INTO inventory (id, store_id, sku, available, on_hand, allocated, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (store_id, sku) WHERE warehouse_id IS NULL DO UPDATE SET
           available = EXCLUDED.available,
           on_hand = EXCLUDED.on_hand,
           allocated = EXCLUDED.allocated,
           updated_at = NOW()
         RETURNING (xmax <> 0) AS was_update`,
        [storeId, level.sku, level.available ?? 0, level.on_hand ?? 0, level.allocated ?? 0]
      );

      if (result.rows[0]?.was_update) {
        updated++;
      } else {
        added++;
      }

      /*
       * RECONCILING STOCK, RATHER THAN OVERWRITING IT.
       *
       * This used to be `UPDATE products SET stock_quantity = level.available`, which was wrong
       * twice over.
       *
       * ShipStation's `available` is already net of its own allocation, while `stock_quantity`
       * means *on hand* everywhere else in this codebase — the order trigger subtracts from it as
       * on-hand, a receipt adds to it as on-hand. Assigning one to the other subtracted allocation
       * a second time, so stock read low and reorder recommendations over-bought.
       *
       * And a blind overwrite left no trace. It was the single largest source of stock movement in
       * the system and the only one that wrote nothing to the ledger, so a merchant's manual
       * adjustment simply vanished at the next sync with nothing to explain it.
       *
       * On-hand is now reconciled against ShipStation's own `on_hand` through a `sync_correction`
       * movement, which records the drift instead of hiding it. Allocation lands in `committed`,
       * the column that means what ShipStation means by it, so `available` — a generated column —
       * comes out right without anything computing it twice.
       */
      const productRow = await client.query<{ id: string }>(
        'SELECT id FROM products WHERE sku = $1 AND store_id = $2',
        [level.sku, storeId]
      );

      const productId = productRow.rows[0]?.id;
      if (!productId) {
        /* A SKU ShipStation holds that this store does not carry. Not an error — the catalogue
         * sync may not have run yet, or the merchant may not list everything they warehouse. */
        continue;
      }

      const locationId = await resolveDefaultLocationId(client, storeId);

      /*
       * The comparison is against the product's total across every location, not the default
       * location's balance.
       *
       * ShipStation reports one on-hand figure per SKU for the whole account. This compared it
       * against a single location's balance and posted the difference as an authoritative-looking
       * `sync_correction`, so every unit a merchant had moved to a second location was invented
       * again on the next pass. Reproduced: 77 at Main plus 40 at Back Room, ShipStation correctly
       * reporting 117, produced a +40 correction and a total of 157.
       *
       * This was unreachable until multi-location became real, which is exactly why it is being
       * fixed in the same breath as building it.
       *
       * The correction still lands at the default location, because ShipStation does not tell us
       * which of our locations the units are in — `shipstation_warehouse_id` is never populated on
       * `inventory_locations`, so there is no mapping to reason with. Landing the whole drift on
       * one location is a known approximation and is stated in the movement's own note rather than
       * left for someone to infer.
       */
      const current = await client.query<{ on_hand: number }>(
        `SELECT COALESCE(SUM(on_hand), 0)::int AS on_hand
           FROM inventory_levels
          WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId]
      );

      /* The default location's row is what the correction is posted against, so it is the row that
       * has to be locked. */
      await client.query(
        `SELECT 1 FROM inventory_levels
          WHERE store_id = $1 AND product_id = $2 AND location_id = $3
          FOR UPDATE`,
        [storeId, productId, locationId]
      );

      const reportedOnHand = level.on_hand ?? level.available ?? 0;
      const drift = reportedOnHand - (current.rows[0]?.on_hand ?? 0);

      if (drift !== 0) {
        await client.query(
          `SELECT post_inventory_movement($1, $2, $3, 'sync_correction'::inventory_reason,
                                          $4, 'sync', NULL, NULL, $5)`,
          [
            storeId,
            productId,
            drift,
            locationId,
            `ShipStation reported ${reportedOnHand} on hand across the account; our balance across `
              + `all locations was ${current.rows[0]?.on_hand ?? 0}. Difference applied here, `
              + `because ShipStation does not say which location its units are in.`
          ]
        );
      }

      /*
       * Allocation is a fact about ShipStation's open orders, not a movement of stock, so it is
       * assigned rather than posted.
       *
       * It is account-wide, like the on-hand figure, so it is cleared from every other location
       * before being set here. Without that, moving stock to a second location left a stale
       * `committed` behind on the old one and the store counted the same allocation twice.
       */
      await client.query(
        `UPDATE inventory_levels SET committed = 0, updated_at = NOW()
          WHERE store_id = $1 AND product_id = $2 AND location_id <> $3 AND committed <> 0`,
        [storeId, productId, locationId]
      );
      await client.query(
        `INSERT INTO inventory_levels (store_id, product_id, location_id, committed)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (store_id, product_id, location_id)
         DO UPDATE SET committed = EXCLUDED.committed, updated_at = NOW()`,
        [storeId, productId, locationId, Math.max(0, level.allocated ?? 0)]
      );
    }

    return { added, updated };
  });

  return {
    processed: levels.length,
    added: counts.added,
    updated: counts.updated,
    hasMore: levels.length === PAGE_SIZE
  };
}

/**
 * Sync one page of `GET /v2/inventory_warehouses`.
 *
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param page - 1-based page number.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} When ShipStation refuses the call after retries.
 */
export async function syncInventoryWarehousesPage(
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const response = await shipStationFetch<{
    inventory_warehouses?: ShipStationInventoryWarehouse[];
  }>(`/v2/inventory_warehouses?page=${page}&page_size=${PAGE_SIZE}`, {
    apiKey,
    operation: `list inventory warehouses page ${page}`,
    ...network
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  const rows = response.data.inventory_warehouses ?? [];

  const counts = await db.transaction(async (client) => {
    let added = 0;
    let updated = 0;

    for (const row of rows) {
      const result = await client.query(
        `INSERT INTO shipstation_inventory_warehouses
           (store_id, inventory_warehouse_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (store_id, inventory_warehouse_id) DO UPDATE SET
           name = EXCLUDED.name,
           updated_at = NOW()
         RETURNING (xmax <> 0) AS was_update`,
        [storeId, row.inventory_warehouse_id, row.name ?? null]
      );

      if (result.rows[0]?.was_update) {
        updated++;
      } else {
        added++;
      }
    }

    return { added, updated };
  });

  return {
    processed: rows.length,
    added: counts.added,
    updated: counts.updated,
    hasMore: rows.length === PAGE_SIZE
  };
}

/**
 * Sync one page of `GET /v2/inventory_locations`.
 *
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param page - 1-based page number.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} When ShipStation refuses the call after retries.
 */
export async function syncInventoryLocationsPage(
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const response = await shipStationFetch<{
    inventory_locations?: ShipStationInventoryLocation[];
  }>(`/v2/inventory_locations?page=${page}&page_size=${PAGE_SIZE}`, {
    apiKey,
    operation: `list inventory locations page ${page}`,
    ...network
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  const rows = response.data.inventory_locations ?? [];

  const counts = await db.transaction(async (client) => {
    let added = 0;
    let updated = 0;

    for (const row of rows) {
      const result = await client.query(
        `INSERT INTO shipstation_inventory_locations
           (store_id, inventory_location_id, inventory_warehouse_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (store_id, inventory_location_id) DO UPDATE SET
           inventory_warehouse_id = EXCLUDED.inventory_warehouse_id,
           name = EXCLUDED.name,
           updated_at = NOW()
         RETURNING (xmax <> 0) AS was_update`,
        [storeId, row.inventory_location_id, row.inventory_warehouse_id ?? null, row.name ?? null]
      );

      if (result.rows[0]?.was_update) {
        updated++;
      } else {
        added++;
      }
    }

    return { added, updated };
  });

  return {
    processed: rows.length,
    added: counts.added,
    updated: counts.updated,
    hasMore: rows.length === PAGE_SIZE
  };
}

/** A ShipStation catalogue product, as the (undocumented) `/v2/products` feed returns it. */
interface ShipStationProduct {
  product_id: string;
  sku?: string;
  name?: string;
  description?: string;
  /** Sell price. This is the field the catalogue actually populates. */
  price?: { amount?: number };
  /**
   * Declared customs value. Optional and, on accounts that ship domestically, usually null — which
   * is why reading `base_price` from it alone imported every product at 0.00.
   */
  customs_value?: { amount?: number };
  thumbnail_url?: string;
  active?: boolean;
  product_category?: { name?: string };
  category?: string;
}

/**
 * Resolve a category id, memoised for the duration of a page.
 *
 * The old sync did a lookup-or-create round trip for *every* product with no caching (P1-2). A
 * per-page map collapses that to one round trip per distinct category.
 *
 * @param client - Transaction client.
 * @param storeId - Owning store.
 * @param name - Category name from ShipStation.
 * @param cache - Map reused across the page.
 * @returns The category UUID.
 */
/**
 * Find the store's default stock location, caching the lookup for the duration of a sync page.
 *
 * Every store has one — migration 030 creates it by trigger on store insert — so a missing result
 * is a genuine fault rather than a case to handle gracefully.
 *
 * @param client - The open transaction the sync page is running in.
 * @param storeId - The tenant.
 * @returns The default location's id.
 */
const defaultLocationCache = new Map<string, string>();

async function resolveDefaultLocationId(
  client: PoolClient,
  storeId: string
): Promise<string> {
  const cached = defaultLocationCache.get(storeId);
  if (cached) return cached;

  const result = await client.query<{ id: string }>(
    'SELECT id FROM inventory_locations WHERE store_id = $1 AND is_default LIMIT 1',
    [storeId]
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Store ${storeId} has no default inventory location`);
  }

  defaultLocationCache.set(storeId, id);
  return id;
}

async function resolveCategoryId(
  client: PoolClient,
  storeId: string,
  name: string,
  cache: Map<string, string>
): Promise<string> {
  const clean = name.trim() || 'Other';
  const cached = cache.get(clean);
  if (cached) {
    return cached;
  }

  const existing = await client.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1 AND store_id = $2 LIMIT 1',
    [clean, storeId]
  );

  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await client.query<{ id: string }>(
      `INSERT INTO categories (id, store_id, name, slug, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       RETURNING id`,
      [storeId, clean, clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]
    );
    id = created.rows[0].id;
  }

  cache.set(clean, id);
  return id;
}

/**
 * Sync one page of the ShipStation product catalogue.
 *
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param page - 1-based page number.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} When ShipStation refuses the call after retries. A 404 raises
 *   {@link PRODUCTS_ENDPOINT_UNAVAILABLE} so the merchant sees an explanation, not a status code.
 */
export async function syncProductsPage(
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const response = await shipStationFetch<{ products?: ShipStationProduct[] }>(
    `/v2/products?page=${page}&page_size=${PAGE_SIZE}`,
    { apiKey, operation: `list products page ${page}`, ...network }
  );

  if (!response.ok) {
    throw new Error(response.status === 404 ? PRODUCTS_ENDPOINT_UNAVAILABLE : response.error);
  }

  const products = response.data.products ?? [];

  const counts = await db.transaction(async (client) => {
    const categoryCache = new Map<string, string>();
    let added = 0;
    let updated = 0;

    for (const product of products) {
      const sku = product.sku ?? product.product_id;
      const categoryId = await resolveCategoryId(
        client,
        storeId,
        product.product_category?.name ?? product.category ?? 'Other',
        categoryCache
      );

      const slug = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      /*
       * FIELD OWNERSHIP.
       *
       * This upsert used to overwrite `name`, `short_description`, `base_price`,
       * `featured_image_url`, `is_active` and `category_id` on every pass. All six are editable in
       * the admin, so a merchant's afternoon of product copy and pricing was reverted at the top of
       * the next hour, silently, with nothing to show it had happened.
       *
       * Each is now conditional on `field_locks` — the columns the merchant has edited. A field
       * they have never touched still tracks upstream, which is what makes the integration useful
       * on the first import and when a warehouse corrects a name. A field they own stays theirs.
       *
       * `status` is not in this list at all. Whether a product is published is a merchandising
       * decision with no upstream equivalent; ShipStation's `active` flag seeds it on insert and is
       * never allowed to republish something a merchant took down.
       *
       * The conflict target is `(store_id, shipstation_product_id)`. It used to be the bare
       * product id, which was globally unique, so two merchants whose ShipStation accounts emitted
       * the same id could not both import it — the second was skipped with no error and no count.
       */
      const result = await client.query(
        `INSERT INTO products (
           id, store_id, shipstation_product_id, sku, name, slug, short_description,
           base_price, featured_image_url, is_active, category_id, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
         )
         ON CONFLICT (store_id, shipstation_product_id) DO UPDATE SET
           sku = CASE WHEN 'sku' = ANY(products.field_locks)
                      THEN products.sku ELSE EXCLUDED.sku END,
           name = CASE WHEN 'name' = ANY(products.field_locks)
                       THEN products.name ELSE EXCLUDED.name END,
           short_description = CASE WHEN 'short_description' = ANY(products.field_locks)
                                    THEN products.short_description
                                    ELSE EXCLUDED.short_description END,
           base_price = CASE WHEN 'base_price' = ANY(products.field_locks)
                             THEN products.base_price ELSE EXCLUDED.base_price END,
           featured_image_url = CASE WHEN 'featured_image_url' = ANY(products.field_locks)
                                     THEN products.featured_image_url
                                     ELSE EXCLUDED.featured_image_url END,
           category_id = CASE WHEN 'category_id' = ANY(products.field_locks)
                              THEN products.category_id ELSE EXCLUDED.category_id END,
           updated_at = NOW()
         WHERE products.store_id = $1
         RETURNING (xmax <> 0) AS was_update`,
        [
          storeId,
          product.product_id,
          sku,
          product.name ?? sku,
          slug,
          product.description ?? null,
          product.price?.amount ?? product.customs_value?.amount ?? 0,
          product.thumbnail_url ?? null,
          product.active !== false,
          categoryId
        ]
      );

      // The `WHERE products.store_id = $1` guard means a product_id owned by another tenant
      // updates nothing rather than being silently stolen.
      if (result.rows.length === 0) {
        continue;
      }

      if (result.rows[0]?.was_update) {
        updated++;
      } else {
        added++;
      }
    }

    return { added, updated };
  });

  return {
    processed: products.length,
    added: counts.added,
    updated: counts.updated,
    hasMore: products.length === PAGE_SIZE
  };
}

/**
 * Run one page of whichever operation was requested.
 *
 * @param operation - Sync operation.
 * @param apiKey - Decrypted ShipStation API key.
 * @param storeId - Store UUID.
 * @param page - 1-based page number.
 * @param network - Injected network primitives, for tests.
 * @returns Counts for this page.
 * @throws {Error} On an unknown operation or a ShipStation failure.
 */
/** How far back a shipments sync looks when it has never run for a store. */
const SHIPMENT_LOOKBACK_DAYS = 30;

/** One shipment as returned by `GET /v2/shipments`. */
interface ShipStationShipment {
  shipment_id?: string;
  external_shipment_id?: string | null;
  shipment_status?: string | null;
  carrier_code?: string | null;
  service_code?: string | null;
  tracking_number?: string | null;
  ship_date?: string | null;
  shipment_cost?: { amount?: number } | null;
}

/**
 * Pull shipments back from ShipStation and write their tracking onto our orders.
 *
 * This is the inbound half of the V2 order flow. `orderPush` sets
 * `external_shipment_id` to our `order_number` when it creates the shipment, so a
 * shipment can be matched back to the order that produced it without storing a
 * second identifier — and orders that did not originate here simply do not match.
 *
 * The window is `modified_at_start`, not `created_at`, because a shipment that was
 * created days ago and shipped this morning is exactly the row we need; filtering
 * on creation would miss it. There is no stored cursor yet, so each run re-reads a
 * fixed lookback. That is deliberately idempotent: every write below is an update
 * to the same columns with the same values, so re-reading a shipment costs a query
 * and changes nothing.
 *
 * Money is decimal dollars on the V2 wire and `orders.shipment_cost` is a
 * `DECIMAL(10,2)` dollars column, so the value passes through unscaled.
 *
 * @param apiKey - Merchant's V2 API key
 * @param storeId - Store UUID; every write below is scoped to it
 * @param page - 1-based page number
 * @param network - Injectable network seam for tests
 * @returns Page result for the orchestrator
 * @channel api-v2
 */
export async function syncShipmentsPage(
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  const since = new Date(Date.now() - SHIPMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const response = await shipStationFetch<{ shipments?: ShipStationShipment[] }>(
    `/v2/shipments?page=${page}&page_size=${PAGE_SIZE}` +
      `&modified_at_start=${encodeURIComponent(since)}&sort_by=modified_at&sort_dir=asc`,
    { apiKey, operation: `list shipments page ${page}`, ...network }
  );

  if (!response.ok) {
    // Same rule as every other operation here: a non-OK response is an error, not
    // an empty page. Treating it as "no more" turns a rate limit into orders that
    // silently never receive their tracking.
    throw new Error(response.error);
  }

  const shipments = response.data.shipments ?? [];

  const counts = await db.transaction(async (client) => {
    let updated = 0;

    for (const shipment of shipments) {
      const orderNumber = shipment.external_shipment_id?.trim();
      if (!orderNumber) {
        // Not one of ours — the merchant's own shipments live in the same account.
        continue;
      }

      const shipped = shipment.shipment_status === 'shipped' || Boolean(shipment.tracking_number);

      const result = await client.query(
        `UPDATE orders
            SET tracking_number = COALESCE($3, tracking_number),
                carrier         = COALESCE($4, carrier),
                carrier_code    = COALESCE($4, carrier_code),
                service_code    = COALESCE($5, service_code),
                shipment_cost   = COALESCE($6, shipment_cost),
                shipstation_shipment_id = COALESCE($7, shipstation_shipment_id),
                shipped_at      = CASE WHEN $8 THEN COALESCE($9::timestamp, shipped_at, NOW())
                                       ELSE shipped_at END,
                status          = CASE WHEN $8 AND status NOT IN ('cancelled', 'refunded')
                                       THEN 'shipped' ELSE status END,
                updated_at      = CURRENT_TIMESTAMP
          WHERE store_id = $1
            AND order_number = $2`,
        [
          storeId,
          orderNumber,
          shipment.tracking_number ?? null,
          shipment.carrier_code ?? null,
          shipment.service_code ?? null,
          shipment.shipment_cost?.amount ?? null,
          shipment.shipment_id ?? null,
          shipped,
          shipment.ship_date ?? null
        ]
      );

      updated += result.rowCount ?? 0;
    }

    return { updated };
  });

  return {
    processed: shipments.length,
    added: 0,
    updated: counts.updated,
    hasMore: shipments.length === PAGE_SIZE
  };
}

export async function runSyncPage(
  operation: SyncOperation,
  apiKey: string,
  storeId: string,
  page: number,
  network: SyncNetworkOptions = {}
): Promise<PageSyncResult> {
  switch (operation) {
    case 'warehouses':
      return syncWarehousesPage(apiKey, storeId, network);
    case 'products':
      return syncProductsPage(apiKey, storeId, page, network);
    case 'inventory':
      return syncInventoryPage(apiKey, storeId, page, network);
    case 'inventory-warehouses':
      return syncInventoryWarehousesPage(apiKey, storeId, page, network);
    case 'inventory-locations':
      return syncInventoryLocationsPage(apiKey, storeId, page, network);
    case 'shipments':
      return syncShipmentsPage(apiKey, storeId, page, network);
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unknown sync operation: ${String(exhaustive)}`);
    }
  }
}
