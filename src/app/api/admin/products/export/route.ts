/**
 * Catalogue export.
 *
 *   GET /api/admin/products/export?format=csv
 *
 * The products page has offered this button since before the route existed —
 * it returned 404 and the UI reported "Failed to export products". A merchant
 * cannot get their own catalogue out of this platform without it, which is both
 * a real need and, for anyone evaluating whether to migrate *in*, the first
 * question they ask.
 *
 * The columns are the same ones the importer reads, so an export is a round
 * trip: pull the catalogue, edit it in a spreadsheet, push it back.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';
import { CSV_COLUMNS, toCsv } from '@/lib/catalog/product-csv';

import { badRequest, resolveStoreId, unauthorized } from '../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

interface ExportRow extends Record<string, unknown> {
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  base_price: string | null;
  sale_price: string | null;
  stock_quantity: number | null;
  category: string | null;
  tags: string[] | null;
  featured_image_url: string | null;
  weight: string | null;
  is_active: boolean | null;
}

/**
 * Export the authenticated store's catalogue.
 * @param request - Incoming request; `?format=csv` is the only format today
 * @returns A CSV attachment
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  let storeSlug = 'catalogue';
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
    storeSlug = user.storeSlug || storeSlug;
  } catch {
    return unauthorized();
  }

  const format = (new URL(request.url).searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv') {
    return badRequest(`Unsupported export format "${format}". Only csv is available.`);
  }

  try {
    const result = await db.query<ExportRow>(
      `SELECT p.sku,
              COALESCE(p.override_name, p.name) AS name,
              p.slug,
              p.short_description,
              p.base_price,
              p.sale_price,
              p.stock_quantity,
              c.name AS category,
              p.tags,
              p.featured_image_url,
              p.weight,
              p.is_active
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.store_id = $1
        ORDER BY p.sku ASC`,
      [storeId],
    );

    const rows = result.rows.map((row) => ({
      ...row,
      // A postgres text[] stringifies as `a,b`, which would then be split
      // across CSV columns. Semicolons match what the importer reads back.
      tags: Array.isArray(row.tags) ? row.tags.join('; ') : '',
      is_active: row.is_active ? 'true' : 'false',
    }));

    const csv = toCsv(rows, CSV_COLUMNS);
    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        // The BOM is what makes Excel read the file as UTF-8 rather than as
        // the local codepage, which otherwise mangles every accented name.
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${storeSlug}-products-${today}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to export products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export your catalogue.' },
      { status: 500 },
    );
  }
}
