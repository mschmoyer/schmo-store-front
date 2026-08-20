/**
 * Categories: the store's own product taxonomy.
 *
 * This route returned a hardcoded empty array with the comment "categories aren't fully
 * implemented" — while the table has existed since the first migration, the ShipStation sync
 * creates rows in it on every import, and `/api/admin/categories/simple` next door runs the real
 * query. So the catalogue's category filter and the edit form's category picker were both
 * permanently empty, and a merchant could neither see the categories they had nor make new ones.
 *
 * There was also no way to create, rename, nest or delete one anywhere in the application.
 * Categories appeared only as a side effect of syncing, which meant a merchant's taxonomy was
 * whatever their warehouse happened to call things.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { slugify } from '@/lib/catalog/slug';

/**
 * GET /api/admin/categories
 *
 * The store's categories with product counts, ordered for display as a tree.
 *
 * Query parameters: `include_empty` (default true), `active_only`.
 *
 * @param request - The incoming request.
 * @returns The categories, each with its product count and depth.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') === 'true';
    const includeEmpty = searchParams.get('include_empty') !== 'false';

    /*
     * A recursive walk so parents and children come back in tree order with a depth, rather than a
     * flat alphabetical list the client has to reassemble. `parent_id` has been on this table since
     * the first migration and nothing has ever read it.
     *
     * The product count is of *live* products, which is the number a merchant is asking about when
     * they look at a category — and it is counted per category with a store predicate on both
     * sides, because `categories.id` is a global primary key and an unscoped join here would count
     * another tenant's rows.
     */
    const result = await db.query(
      `WITH RECURSIVE tree AS (
         SELECT c.id, c.name, c.slug, c.description, c.image_url, c.parent_id,
                c.sort_order, c.is_active, c.meta_title, c.meta_description,
                0 AS depth,
                ARRAY[LPAD(c.sort_order::text, 6, '0'), c.name] AS path
           FROM categories c
          WHERE c.store_id = $1 AND c.parent_id IS NULL
          UNION ALL
         SELECT c.id, c.name, c.slug, c.description, c.image_url, c.parent_id,
                c.sort_order, c.is_active, c.meta_title, c.meta_description,
                t.depth + 1,
                t.path || ARRAY[LPAD(c.sort_order::text, 6, '0'), c.name]
           FROM categories c
           JOIN tree t ON t.id = c.parent_id
          WHERE c.store_id = $1
            /* Depth guard: a cycle in parent_id would otherwise spin forever. The store-scoped
             * foreign key added in migration 026 makes one hard to create, but a recursive query
             * without a bound is a denial of service waiting for a data error. */
            AND t.depth < 10
       )
       SELECT t.*,
              COALESCE(pc.total, 0)::int  AS product_count,
              COALESCE(pc.live, 0)::int   AS live_product_count
         FROM tree t
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE p.status = 'active') AS live
             FROM products p
            WHERE p.category_id = t.id AND p.store_id = $1
         ) pc ON TRUE
        WHERE ($2::bool = false OR t.is_active)
          AND ($3::bool = true OR COALESCE(pc.total, 0) > 0)
        ORDER BY t.path`,
      [user.storeId, activeOnly, includeEmpty]
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
      /* The flat shape the pickers want, so a `<Select>` does not have to walk the tree. Indented
       * by depth, which is how a nested taxonomy reads in a dropdown. */
      options: result.rows.map((row) => ({
        value: row.id,
        label: `${'— '.repeat(Number(row.depth))}${row.name}`,
        count: row.product_count
      }))
    });
  } catch (error) {
    return adminErrorResponse(error, 'categories.list');
  }
}

/**
 * POST /api/admin/categories
 *
 * Create a category.
 *
 * @param request - The incoming request.
 * @returns The created category.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new AdminApiError('Give the category a name', 400);
    }

    if (body.parent_id) {
      const parent = await db.query('SELECT id FROM categories WHERE id = $1 AND store_id = $2', [
        body.parent_id,
        user.storeId
      ]);
      if (parent.rows.length === 0) {
        throw new AdminApiError('That parent category is not in this store', 400);
      }
    }

    const slug = await uniqueCategorySlug(user.storeId, body.slug || name);

    const created = await db.query(
      `INSERT INTO categories (
         store_id, name, slug, description, image_url, parent_id, sort_order,
         is_active, meta_title, meta_description
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user.storeId,
        name,
        slug,
        body.description?.trim() || null,
        body.image_url?.trim() || null,
        body.parent_id || null,
        Number.parseInt(String(body.sort_order ?? 0), 10) || 0,
        body.is_active ?? true,
        body.meta_title?.trim() || null,
        body.meta_description?.trim() || null
      ]
    );

    return NextResponse.json({ success: true, data: created.rows[0] }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, 'categories.create');
  }
}

/**
 * Find a category slug that is free within a store.
 *
 * @param storeId - The tenant.
 * @param desired - The preferred slug or text to derive one from.
 * @param excludeId - A category allowed to keep its own slug, when renaming.
 * @returns A slug free in this store.
 */
async function uniqueCategorySlug(
  storeId: string,
  desired: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desired) || 'category';

  const taken = await db.query<{ slug: string }>(
    `SELECT slug FROM categories
      WHERE store_id = $1 AND (slug = $2 OR slug LIKE $2 || '-%')
        AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [storeId, base, excludeId ?? null]
  );

  const used = new Set(taken.rows.map((r) => r.slug));
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix++) {
    if (!used.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
