/**
 * Renaming, re-nesting and removing a category.
 *
 * None of these existed anywhere in the application: categories could only appear as a side effect
 * of a ShipStation sync, so a merchant's taxonomy was whatever their warehouse called things and
 * there was no way to correct it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { slugify } from '@/lib/catalog/slug';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields a category update may set. */
const FIELDS: Record<string, string> = {
  name: 'name',
  description: 'description',
  image_url: 'image_url',
  sort_order: 'sort_order',
  is_active: 'is_active',
  meta_title: 'meta_title',
  meta_description: 'meta_description'
};

/**
 * PUT /api/admin/categories/[id]
 *
 * Update a category.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the category id.
 * @returns The updated category.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const body = await request.json();

    const existing = await db.query<{ id: string; slug: string; name: string }>(
      'SELECT id, slug, name FROM categories WHERE id = $1 AND store_id = $2',
      [id, user.storeId]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const [key, column] of Object.entries(FIELDS)) {
      if (body[key] === undefined) continue;
      const raw = body[key];
      values.push(
        column === 'sort_order'
          ? Number.parseInt(String(raw ?? 0), 10) || 0
          : column === 'is_active'
            ? Boolean(raw)
            : typeof raw === 'string'
              ? raw.trim() || null
              : raw
      );
      assignments.push(`${column} = $${values.length}`);
    }

    if (body.parent_id !== undefined) {
      if (body.parent_id === null || body.parent_id === '') {
        assignments.push('parent_id = NULL');
      } else {
        if (body.parent_id === id) {
          throw new AdminApiError('A category cannot be its own parent', 400);
        }

        /*
         * Re-parenting has to refuse a cycle. Moving a category *under one of its own descendants*
         * would disconnect that whole branch from the tree — the recursive list query would never
         * reach it, so the categories would still exist and simply stop appearing anywhere.
         */
        const descendants = await db.query<{ id: string }>(
          `WITH RECURSIVE sub AS (
             SELECT id FROM categories WHERE id = $1 AND store_id = $2
             UNION ALL
             SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
              WHERE c.store_id = $2
           )
           SELECT id FROM sub`,
          [id, user.storeId]
        );

        if (descendants.rows.some((row) => row.id === body.parent_id)) {
          throw new AdminApiError(
            'That would put this category inside one of its own subcategories',
            400
          );
        }

        const parent = await db.query('SELECT id FROM categories WHERE id = $1 AND store_id = $2', [
          body.parent_id,
          user.storeId
        ]);
        if (parent.rows.length === 0) {
          throw new AdminApiError('That parent category is not in this store', 400);
        }

        values.push(body.parent_id);
        assignments.push(`parent_id = $${values.length}`);
      }
    }

    /* A rename regenerates the slug only when the merchant did not supply one, so a deliberate
     * URL is never overwritten by an editorial rename. */
    if (typeof body.slug === 'string' && body.slug.trim()) {
      values.push(await uniqueSlug(user.storeId, body.slug, id));
      assignments.push(`slug = $${values.length}`);
    }

    if (assignments.length === 0) {
      throw new AdminApiError('Nothing to update', 400);
    }

    values.push(id, user.storeId);
    const updated = await db.query(
      `UPDATE categories SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length - 1} AND store_id = $${values.length}
        RETURNING *`,
      values
    );

    return NextResponse.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    return adminErrorResponse(error, 'categories.update');
  }
}

/**
 * DELETE /api/admin/categories/[id]
 *
 * Remove a category, moving anything inside it somewhere sensible first.
 *
 * Products are never deleted with their category — they are uncategorised, or moved to a
 * replacement the caller names. Subcategories rise to the deleted category's parent rather than
 * being orphaned, which would strand them outside the tree.
 *
 * @param request - The incoming request. `?move_to=<uuid>` reassigns instead of uncategorising.
 * @param context - Route params carrying the category id.
 * @returns What was moved, so the merchant can see the consequences.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }
    const storeId = user.storeId;

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const moveTo = new URL(request.url).searchParams.get('move_to');
    if (moveTo && (!UUID.test(moveTo) || moveTo === id)) {
      throw new AdminApiError('Choose a different category to move these products to', 400);
    }

    const outcome = await db.transaction(async (tx) => {
      const existing = await tx.query<{ id: string; name: string; parent_id: string | null }>(
        'SELECT id, name, parent_id FROM categories WHERE id = $1 AND store_id = $2 FOR UPDATE',
        [id, storeId]
      );
      if (existing.rows.length === 0) return null;
      const category = existing.rows[0];

      if (moveTo) {
        const target = await tx.query('SELECT id FROM categories WHERE id = $1 AND store_id = $2', [
          moveTo,
          storeId
        ]);
        if (target.rows.length === 0) {
          throw new AdminApiError('That destination category is not in this store', 400);
        }
      }

      const moved = await tx.query(
        `UPDATE products SET category_id = $1, updated_at = NOW()
          WHERE category_id = $2 AND store_id = $3
          RETURNING id`,
        [moveTo || null, id, storeId]
      );

      /* Children rise to this category's parent. The alternative — deleting them, or leaving them
       * pointing at a row that no longer exists — loses a merchant's taxonomy on one click. */
      const promoted = await tx.query(
        `UPDATE categories SET parent_id = $1, updated_at = NOW()
          WHERE parent_id = $2 AND store_id = $3
          RETURNING id`,
        [category.parent_id, id, storeId]
      );

      await tx.query('DELETE FROM categories WHERE id = $1 AND store_id = $2', [id, storeId]);

      return { category, productsMoved: moved.rows.length, subcategoriesPromoted: promoted.rows.length };
    });

    if (!outcome) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const parts = [`"${outcome.category.name}" deleted.`];
    if (outcome.productsMoved > 0) {
      parts.push(
        moveTo
          ? `${outcome.productsMoved} product${outcome.productsMoved === 1 ? '' : 's'} moved.`
          : `${outcome.productsMoved} product${outcome.productsMoved === 1 ? '' : 's'} are now uncategorised.`
      );
    }
    if (outcome.subcategoriesPromoted > 0) {
      parts.push(
        `${outcome.subcategoriesPromoted} subcategor${
          outcome.subcategoriesPromoted === 1 ? 'y' : 'ies'
        } moved up a level.`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        products_moved: outcome.productsMoved,
        subcategories_promoted: outcome.subcategoriesPromoted,
        message: parts.join(' ')
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'categories.delete');
  }
}

/**
 * Find a category slug that is free within a store.
 *
 * @param storeId - The tenant.
 * @param desired - The preferred slug.
 * @param excludeId - The category allowed to keep its own slug.
 * @returns A free slug.
 */
async function uniqueSlug(storeId: string, desired: string, excludeId: string): Promise<string> {
  const base = slugify(desired) || 'category';
  const taken = await db.query<{ slug: string }>(
    `SELECT slug FROM categories
      WHERE store_id = $1 AND (slug = $2 OR slug LIKE $2 || '-%') AND id <> $3`,
    [storeId, base, excludeId]
  );
  const used = new Set(taken.rows.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}
