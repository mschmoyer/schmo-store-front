/**
 * GET /api/admin/storefront-theme/catalog
 *
 * The merchant's real collections and products, shaped for the customizer's
 * `collection` and `product-list` controls.
 *
 * This exists because those two schema field types are meaningless without live
 * catalogue data — a picker that asks someone to type a product UUID is exactly
 * the settings form this feature replaces. Read-only, session-scoped, and the
 * store comes from the session rather than the query string, like every other
 * route in this folder.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';

import { badRequest, resolveStoreId, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

/** Upper bound on the product list handed to the picker in one go. */
const PRODUCT_LIMIT = 250;

interface CollectionRow extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  product_count: string | number | null;
}

interface ProductRow extends Record<string, unknown> {
  id: string;
  name: string;
  sku: string;
  base_price: string | number | null;
  featured_image_url: string | null;
}

/**
 * Read the authenticated store's catalogue.
 * @param request - Incoming request
 * @returns Collections and products for the picker controls
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  try {
    const collections = await db.query<CollectionRow>(
      `SELECT c.id,
              c.name,
              c.slug,
              COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        WHERE c.store_id = $1
          AND c.is_active = true
        GROUP BY c.id, c.name, c.slug, c.sort_order
        ORDER BY c.sort_order ASC, c.name ASC`,
      [storeId],
    );

    const products = await db.query<ProductRow>(
      `SELECT id, name, sku, base_price, featured_image_url
         FROM products
        WHERE store_id = $1
          AND is_active = true
        ORDER BY name ASC
        LIMIT $2`,
      [storeId, PRODUCT_LIMIT],
    );

    return NextResponse.json({
      success: true,
      data: {
        collections: collections.rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          productCount: Number(row.product_count ?? 0),
        })),
        products: products.rows.map((row) => ({
          id: row.id,
          name: row.name,
          sku: row.sku,
          price: row.base_price === null ? null : Number(row.base_price),
          imageUrl: row.featured_image_url,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to read the storefront catalog:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load your products and collections.' },
      { status: 500 },
    );
  }
}
