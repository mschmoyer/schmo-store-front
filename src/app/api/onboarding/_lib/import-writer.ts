/**
 * The database half of the catalog import.
 *
 * Kept in its own module so `./import.ts` — the slicing, cursor and error
 * classification logic — can be unit-tested without dragging the Postgres
 * driver into the test environment. The route wires the two together; tests
 * inject a stub writer and exercise the real slicing logic.
 */

import { db } from '@/lib/database/connection';
import type { ShipStationProduct, ProductWriter } from './import';

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
 * before.
 *
 * Matching prefers the ShipStation product id and falls back to SKU, so a
 * catalog previously imported by an older code path does not duplicate. This is
 * what makes re-running a slice safe — the import is idempotent by row identity,
 * not by having been run exactly once.
 *
 * @param product - The product from ShipStation
 * @param storeId - Owning store
 * @param stock - Stock level for the SKU, if we have one
 * @returns Whether a row was written
 */
export const upsertProduct: ProductWriter = async (product, storeId, stock) => {
  const typed = product as ShipStationProduct;
  const sku = (typed.sku ?? '').trim();
  const name = (typed.name ?? '').trim() || sku;
  if (!sku || !name) return false;

  const shipstationId = typed.product_id ? String(typed.product_id) : null;
  const price = Number(typed.customs_value?.amount ?? 0) || 0;
  const active = typed.active !== false;
  const category = await categoryId(
    typed.product_category?.name || typed.category || 'Other',
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
        typed.description ?? null,
        price,
        typed.thumbnail_url ?? null,
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
      typed.description ?? null,
      price,
      typed.thumbnail_url ?? null,
      active,
      stock,
      category,
    ]
  );
  return true;
};
