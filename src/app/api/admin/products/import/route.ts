/**
 * Catalogue import.
 *
 *   POST /api/admin/products/import   (multipart, field `file`)
 *
 * The products page has offered an import modal since before this route
 * existed. Until now the only door into `products` was a ShipStation sync,
 * which excluded every merchant who does not ship through ShipStation and
 * every merchant with a spreadsheet — a 4,000-SKU distributor, a bakery, a
 * digital seller.
 *
 * Upserts on `(store_id, sku)`, so re-importing an edited export updates rather
 * than duplicating. Bad rows are **reported, not fatal**: a merchant importing
 * 4,000 rows needs to know that rows 12 and 3,900 are wrong, not that "the
 * import failed".
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';
import { parseCsv, validateImport } from '@/lib/catalog/product-csv';

import { badRequest, resolveStoreId, unauthorized } from '../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/** Upper bound on the upload, before parsing. Roughly 20k rows of catalogue. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Upper bound on rows in one import. */
const MAX_ROWS = 20_000;

/**
 * Resolve category names to ids, creating any that do not exist.
 *
 * A CSV names a category in words; the database wants a foreign key. Creating
 * the missing ones is the behaviour a merchant expects — an import that
 * silently dropped every category because they had not pre-created them would
 * look like it worked and produce an uncategorised catalogue.
 *
 * @param storeId - Store UUID
 * @param names - Category names appearing in the file
 * @returns A lowercase-name to id map
 */
async function resolveCategories(
  storeId: string,
  names: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const wanted = [...new Set(names.filter(Boolean))];
  if (wanted.length === 0) return map;

  const existing = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE store_id = $1',
    [storeId],
  );
  for (const row of existing.rows) map.set(row.name.trim().toLowerCase(), row.id);

  for (const name of wanted) {
    const key = name.trim().toLowerCase();
    if (map.has(key)) continue;

    const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
    const created = await db.query<{ id: string }>(
      `INSERT INTO categories (store_id, name, slug, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (store_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [storeId, name.trim(), slug],
    );
    if (created.rows[0]) map.set(key, created.rows[0].id);
  }

  return map;
}

/**
 * Import a CSV catalogue.
 * @param request - Multipart request carrying a `file` field
 * @returns Counts of created, updated and skipped rows, with per-row problems
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  let text: string;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return badRequest('Attach a CSV file in the "file" field.');
    }
    if (file.size > MAX_BYTES) {
      return badRequest(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB — split it and import in parts.`,
      );
    }
    text = await file.text();
  } catch {
    return badRequest('Could not read the uploaded file.');
  }

  const records = parseCsv(text);
  if (records.length === 0) {
    return badRequest('That file has no data rows. The first row must be a header.');
  }
  if (records.length > MAX_ROWS) {
    return badRequest(`That file has ${records.length} rows. The limit is ${MAX_ROWS} per import.`);
  }

  const { rows, problems } = validateImport(records);
  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'No rows could be imported.',
        data: { created: 0, updated: 0, skipped: problems.length, problems: problems.slice(0, 50) },
      },
      { status: 400 },
    );
  }

  try {
    const categories = await resolveCategories(
      storeId,
      rows.map((row) => row.categoryName ?? '').filter(Boolean),
    );

    let created = 0;
    let updated = 0;

    // One transaction: a half-applied catalogue is worse than a rejected one,
    // and the merchant would have no way to tell which half landed.
    await db.transaction(async (client) => {
      for (const row of rows) {
        const categoryId = row.categoryName
          ? (categories.get(row.categoryName.trim().toLowerCase()) ?? null)
          : null;

        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO products (
             store_id, sku, name, slug, short_description, base_price, sale_price,
             stock_quantity, category_id, tags, featured_image_url, weight, is_active,
             published_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13 THEN NOW() END)
           ON CONFLICT (store_id, sku) DO UPDATE
              SET name              = EXCLUDED.name,
                  short_description = EXCLUDED.short_description,
                  base_price        = EXCLUDED.base_price,
                  sale_price        = EXCLUDED.sale_price,
                  stock_quantity    = EXCLUDED.stock_quantity,
                  category_id       = EXCLUDED.category_id,
                  tags              = EXCLUDED.tags,
                  featured_image_url = EXCLUDED.featured_image_url,
                  weight            = EXCLUDED.weight,
                  is_active         = EXCLUDED.is_active,
                  updated_at        = NOW()
           RETURNING (xmax = 0) AS inserted`,
          [
            storeId,
            row.sku,
            row.name,
            row.slug,
            row.shortDescription,
            row.basePrice,
            row.salePrice,
            row.stockQuantity,
            categoryId,
            row.tags,
            row.featuredImageUrl,
            row.weight,
            row.isActive,
          ] satisfies [string, ...unknown[]],
        );

        // `xmax = 0` is true only for a freshly inserted row, which is how an
        // upsert tells "created" from "updated" without a second query.
        if (result.rows[0]?.inserted) created += 1;
        else updated += 1;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        skipped: problems.length,
        // Capped: a file with 4,000 bad rows should not return 4,000 messages
        // the merchant will not read. The count above is the honest total.
        problems: problems.slice(0, 50),
        message:
          `${created} added, ${updated} updated` +
          (problems.length > 0 ? `, ${problems.length} skipped.` : '.'),
      },
    });
  } catch (error) {
    console.error('Failed to import products:', error);

    // A slug colliding with a product already in the catalogue is the
    // merchant's data, not a server fault, and the message should say which.
    if (error instanceof Error && /products_store_id_slug_key/.test(error.message)) {
      return badRequest(
        'One of these products has a URL slug already used by a different SKU in your catalogue. ' +
          'Set the `slug` column explicitly for it and import again.',
      );
    }

    return NextResponse.json(
      { success: false, error: 'The import failed and nothing was changed.' },
      { status: 500 },
    );
  }
}
