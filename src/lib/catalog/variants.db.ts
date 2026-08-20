/**
 * Persistence for product options and variants.
 *
 * Every query here carries `store_id`. Variants are addressed by ids that
 * travel through the cart and the checkout payload, so a lookup keyed on
 * variant id alone would let a shopper on one shop add another merchant's
 * variant to their basket — and the price would come from that merchant's row.
 *
 * The database stores money as `DECIMAL(10,2)` dollars; the application works
 * in integer cents. That conversion happens here and nowhere else, through
 * `toCents` / `centsToDecimalString` in `billing/money.ts`.
 */

import { db } from '@/lib/database';
import { centsToDecimalString, toCents } from '@/lib/billing/money';

import type { ProductOption, ProductVariant } from './variants';

interface OptionRow extends Record<string, unknown> {
  id: string;
  name: string;
  position: number | string;
  values: unknown;
  value_meta: unknown;
}

interface VariantRow extends Record<string, unknown> {
  id: string;
  sku: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: string | null;
  sale_price: string | null;
  stock_quantity: number | string;
  track_inventory: boolean | null;
  allow_backorder: boolean | null;
  image_url: string | null;
  position: number | string;
  is_active: boolean;
}

const OPTION_COLUMNS = 'id, name, position, values, value_meta';
const VARIANT_COLUMNS =
  'id, sku, option1, option2, option3, price, sale_price, stock_quantity, ' +
  'track_inventory, allow_backorder, image_url, position, is_active';

/**
 * Parse a JSONB column that may arrive as an object or a string.
 * @param value - Raw column value
 * @returns The parsed value, or undefined
 */
function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Convert an option row.
 * @param row - Raw row
 * @returns A typed option
 */
function toOption(row: OptionRow): ProductOption {
  return {
    id: row.id,
    name: row.name,
    position: Number(row.position) || 1,
    values: Array.isArray(row.values)
      ? row.values.filter((value): value is string => typeof value === 'string')
      : [],
    valueMeta: (parseJson(row.value_meta) ?? {}) as ProductOption['valueMeta'],
  };
}

/**
 * Convert a variant row, moving money into integer cents.
 *
 * `price` and `sale_price` stay `null` when the column is null — that is the
 * inheritance signal, and collapsing it to 0 through `toCents` would silently
 * make every inheriting variant free.
 *
 * @param row - Raw row
 * @returns A typed variant
 */
function toVariant(row: VariantRow): ProductVariant {
  return {
    id: row.id,
    sku: row.sku,
    options: [row.option1, row.option2, row.option3],
    priceCents: row.price === null ? null : toCents(row.price),
    salePriceCents: row.sale_price === null ? null : toCents(row.sale_price),
    stockQuantity: Number(row.stock_quantity) || 0,
    trackInventory: row.track_inventory,
    allowBackorder: row.allow_backorder,
    imageUrl: row.image_url,
    position: Number(row.position) || 1,
    isActive: row.is_active,
  };
}

/**
 * Read a product's option axes, in position order.
 * @param storeId - Store UUID
 * @param productId - Product UUID
 * @returns The option axes, empty when the product is a single SKU
 */
export async function getProductOptions(
  storeId: string,
  productId: string,
): Promise<ProductOption[]> {
  if (!storeId || !productId) return [];
  const result = await db.query<OptionRow>(
    `SELECT ${OPTION_COLUMNS}
       FROM product_options
      WHERE store_id = $1 AND product_id = $2
      ORDER BY position ASC`,
    [storeId, productId],
  );
  return result.rows.map(toOption);
}

/**
 * Read a product's variants, in display order.
 * @param storeId - Store UUID
 * @param productId - Product UUID
 * @param includeInactive - Whether to include variants the merchant has hidden
 * @returns The variants
 */
export async function getProductVariants(
  storeId: string,
  productId: string,
  includeInactive = false,
): Promise<ProductVariant[]> {
  if (!storeId || !productId) return [];
  const result = await db.query<VariantRow>(
    `SELECT ${VARIANT_COLUMNS}
       FROM product_variants
      WHERE store_id = $1 AND product_id = $2
        ${includeInactive ? '' : 'AND is_active'}
      ORDER BY position ASC, sku ASC`,
    [storeId, productId],
  );
  return result.rows.map(toVariant);
}

/**
 * Read one variant by id, scoped to a store.
 *
 * This is the checkout's lookup, and the `store_id` predicate is what stops a
 * variant id from another merchant's catalogue pricing a line in this cart.
 *
 * @param storeId - Store UUID
 * @param variantId - Variant UUID
 * @returns The variant with its product id, or null
 */
export async function getVariantById(
  storeId: string,
  variantId: string,
): Promise<(ProductVariant & { productId: string }) | null> {
  if (!storeId || !variantId) return null;
  const result = await db.query<VariantRow & { product_id: string }>(
    `SELECT ${VARIANT_COLUMNS}, product_id
       FROM product_variants
      WHERE store_id = $1 AND id = $2
      LIMIT 1`,
    [storeId, variantId],
  );
  const row = result.rows[0];
  return row ? { ...toVariant(row), productId: row.product_id } : null;
}

/**
 * Read the variants for several products at once, keyed by product id.
 *
 * The catalogue grid needs a price range per card. Asking per card is the N+1
 * the listing query exists to avoid, so this takes the whole page of product
 * ids and returns one map.
 *
 * @param storeId - Store UUID
 * @param productIds - Product UUIDs on the current page
 * @returns Active variants grouped by product id
 */
export async function getVariantsForProducts(
  storeId: string,
  productIds: readonly string[],
): Promise<Map<string, ProductVariant[]>> {
  const out = new Map<string, ProductVariant[]>();
  if (!storeId || productIds.length === 0) return out;

  const result = await db.query<VariantRow & { product_id: string }>(
    `SELECT ${VARIANT_COLUMNS}, product_id
       FROM product_variants
      WHERE store_id = $1 AND product_id = ANY($2::uuid[]) AND is_active
      ORDER BY position ASC, sku ASC`,
    [storeId, [...productIds]],
  );

  for (const row of result.rows) {
    const list = out.get(row.product_id) ?? [];
    list.push(toVariant(row));
    out.set(row.product_id, list);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** An option axis as the admin editor sends it. */
export interface OptionInput {
  name: string;
  position: number;
  values: string[];
  valueMeta?: ProductOption['valueMeta'];
}

/** A variant as the admin editor sends it. */
export interface VariantInput {
  /** Present when updating an existing variant; absent when creating one. */
  id?: string;
  sku: string;
  options: (string | null)[];
  priceCents: number | null;
  salePriceCents: number | null;
  stockQuantity: number;
  trackInventory: boolean | null;
  allowBackorder: boolean | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
}

/**
 * Replace a product's options and variants in one transaction.
 *
 * The editor sends the whole set rather than a diff, because a variant grid is
 * edited as a grid: a merchant adds a size, renames a colour and deletes two
 * rows in one sitting, and reconstructing that as a patch stream is more ways
 * to be wrong for no benefit.
 *
 * Variants absent from the payload are deleted, but **only those the payload
 * could have named**: rows are matched by id, so a variant created by another
 * session between this editor's load and its save is deleted too. That is the
 * accepted cost of last-write-wins on a grid, and it is why the whole thing is
 * one transaction — a half-applied grid is worse than a stale one.
 *
 * @param storeId - Store UUID
 * @param productId - Product UUID
 * @param options - The option axes, or an empty array for a single-SKU product
 * @param variants - The variants, or an empty array
 * @returns The stored options and variants
 */
export async function replaceProductVariants(
  storeId: string,
  productId: string,
  options: readonly OptionInput[],
  variants: readonly VariantInput[],
): Promise<{ options: ProductOption[]; variants: ProductVariant[] }> {
  if (!storeId) throw new Error('replaceProductVariants requires a storeId');
  if (!productId) throw new Error('replaceProductVariants requires a productId');

  return db.transaction(async (client) => {
    // Confirm the product is this store's before writing anything hanging off
    // it. Without this a caller could attach variants to another tenant's
    // product, and every later read would be correctly store-scoped and
    // correctly return somebody else's rows.
    const owned = await client.query<{ id: string }>(
      'SELECT id FROM products WHERE id = $1 AND store_id = $2 LIMIT 1',
      [productId, storeId],
    );
    if (owned.rows.length === 0) {
      throw new Error('Product not found in this store');
    }

    await client.query(
      'DELETE FROM product_options WHERE store_id = $1 AND product_id = $2',
      [storeId, productId],
    );

    for (const option of options) {
      await client.query(
        `INSERT INTO product_options (store_id, product_id, name, position, values, value_meta)
         VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb)`,
        [
          storeId,
          productId,
          option.name,
          option.position,
          option.values,
          JSON.stringify(option.valueMeta ?? {}),
        ],
      );
    }

    const keptIds = variants
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    await client.query(
      `DELETE FROM product_variants
        WHERE store_id = $1 AND product_id = $2
          AND NOT (id = ANY($3::uuid[]))`,
      [storeId, productId, keptIds],
    );

    for (const entry of variants) {
      const values = [
        storeId,
        productId,
        entry.sku,
        entry.options[0] ?? null,
        entry.options[1] ?? null,
        entry.options[2] ?? null,
        entry.priceCents === null ? null : centsToDecimalString(entry.priceCents),
        entry.salePriceCents === null ? null : centsToDecimalString(entry.salePriceCents),
        entry.stockQuantity,
        entry.trackInventory,
        entry.allowBackorder,
        entry.imageUrl,
        entry.position,
        entry.isActive,
      ];

      if (entry.id) {
        await client.query(
          `UPDATE product_variants
              SET sku = $3, option1 = $4, option2 = $5, option3 = $6,
                  price = $7::numeric, sale_price = $8::numeric,
                  stock_quantity = $9, track_inventory = $10, allow_backorder = $11,
                  image_url = $12, position = $13, is_active = $14,
                  updated_at = NOW()
            WHERE store_id = $1 AND product_id = $2 AND id = $15`,
          [...values, entry.id],
        );
      } else {
        await client.query(
          `INSERT INTO product_variants (
             store_id, product_id, sku, option1, option2, option3,
             price, sale_price, stock_quantity, track_inventory, allow_backorder,
             image_url, position, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9, $10, $11, $12, $13, $14)`,
          values,
        );
      }
    }

    const [storedOptions, storedVariants] = await Promise.all([
      client.query<OptionRow>(
        `SELECT ${OPTION_COLUMNS} FROM product_options
          WHERE store_id = $1 AND product_id = $2 ORDER BY position ASC`,
        [storeId, productId],
      ),
      client.query<VariantRow>(
        `SELECT ${VARIANT_COLUMNS} FROM product_variants
          WHERE store_id = $1 AND product_id = $2 ORDER BY position ASC, sku ASC`,
        [storeId, productId],
      ),
    ]);

    return {
      options: storedOptions.rows.map(toOption),
      variants: storedVariants.rows.map(toVariant),
    };
  });
}
