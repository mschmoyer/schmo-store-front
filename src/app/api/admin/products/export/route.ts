/**
 * Catalogue CSV export.
 *
 * The admin has offered "Export Products" with a CSV/JSON/XLSX picker since the catalogue page was
 * written. The route it called had never existed, so the modal's only outcome was a red toast.
 *
 * Two things make this useful rather than merely present. It exports *the view the merchant is
 * looking at* — same filters, same sort — because "export" almost always means "export these", and
 * a button that silently gives you all 8,000 rows when you had filtered to 40 is a worse answer
 * than an error. And it streams, so a large catalogue starts downloading immediately instead of
 * being assembled in memory first, which is what makes the difference between a working export and
 * a serverless timeout at a few thousand products.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse } from '@/lib/api/adminError';
import {
  buildOrderBy,
  buildProductWhere,
  resolveIssue,
  resolveSortDirection,
  resolveSortKey,
  resolveStockStatus,
  type ProductListFilters
} from '../_lib/query';
import { EXPORT_CSV_COLUMNS, csvRow, shopifyPricePair, weightToGrams } from '@/lib/catalog/csv';

/** Rows fetched per round trip while streaming. Large enough to be efficient, small enough to
 * keep memory flat regardless of catalogue size. */
const BATCH = 500;

/**
 * GET /api/admin/products/export
 *
 * Stream the current catalogue view as CSV.
 *
 * Accepts the same query parameters as the list route, so the export matches what is on screen.
 *
 * @param request - The incoming request.
 * @returns A streaming CSV download.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }
    const storeId = user.storeId;

    const { searchParams } = new URL(request.url);

    const boolParam = (name: string): boolean | undefined => {
      const raw = searchParams.get(name);
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    };
    const numParam = (name: string): number | undefined => {
      const raw = searchParams.get(name);
      if (!raw?.trim()) return undefined;
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const filters: ProductListFilters = {
      search: searchParams.get('search')?.trim() || undefined,
      categoryId: searchParams.get('category_id') || undefined,
      isActive: boolParam('is_active'),
      isFeatured: boolParam('is_featured'),
      minPrice: numParam('min_price'),
      maxPrice: numParam('max_price'),
      stockStatus: resolveStockStatus(searchParams.get('stock_status')),
      issue: resolveIssue(searchParams.get('issue')),
      tags: searchParams.get('tags')?.split(',').map((t) => t.trim()).filter(Boolean) || undefined,
      vendor: searchParams.get('vendor') || undefined
    };

    /* An explicit selection wins over the filters, so "export selected" works from the grid. */
    const selected = searchParams
      .get('ids')
      ?.split(',')
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

    /* An explicit selection replaces the filters outright rather than narrowing them further: the
     * merchant ticked those rows, and intersecting with a filter they may have changed since would
     * quietly drop some of what they chose. */
    const { sql: whereSql, params } = selected?.length
      ? { sql: 'WHERE p.store_id = $1 AND p.id = ANY($2::uuid[])', params: [storeId, selected] }
      : buildProductWhere(storeId, filters);

    const orderBy = buildOrderBy(
      resolveSortKey(searchParams.get('sort_by'), 'sku'),
      resolveSortDirection(searchParams.get('sort_order'), 'ASC')
    );

    const sql = `
      SELECT
        p.*,
        c.name AS category_name,
        sup.name AS supplier_name,
        COALESCE(lv.available, 0)   AS available,
        COALESCE(lv.committed, 0)   AS committed,
        COALESCE(inc.incoming, 0)   AS incoming,
        COALESCE(sv.units_90d, 0)   AS units_90d,
        p.stock_quantity * COALESCE(p.cost_price, 0) AS value_at_cost
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.store_id = p.store_id
      LEFT JOIN LATERAL (
        SELECT SUM(available) AS available, SUM(committed) AS committed
          FROM inventory_levels l WHERE l.product_id = p.id AND l.store_id = p.store_id
      ) lv ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(poi.quantity_pending)::int AS incoming
          FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
         WHERE po.store_id = p.store_id AND poi.product_sku = p.sku
           AND po.status NOT IN ('cancelled', 'closed', 'draft')
      ) inc ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '90 days')::int AS units_90d
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
      ) sv ON TRUE
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`${csvRow(EXPORT_CSV_COLUMNS.map((c) => c.header))}\n`)
          );

          let offset = 0;
          for (;;) {
            const page = await db.query(sql, [...params, BATCH, offset]);
            if (page.rows.length === 0) break;

            const lines = page.rows.map((row) => csvRow(cellsFor(row))).join('\n');
            controller.enqueue(encoder.encode(`${lines}\n`));

            if (page.rows.length < BATCH) break;
            offset += BATCH;
          }

          controller.close();
        } catch (error) {
          /*
           * A failure part-way through cannot become a 500 — the response has already begun and
           * the browser is writing a file. Logging it and closing leaves the merchant with a
           * truncated download, so the last line says so rather than letting a short file pass for
           * a complete one.
           */
          console.error('[api:products.export] stream failed', error);
          controller.enqueue(
            encoder.encode('\n"EXPORT INCOMPLETE — this file was truncated by an error. Do not import it."\n')
          );
          controller.close();
        }
      }
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="products-${stamp}.csv"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'products.export');
  }
}

/**
 * Build one CSV record from a product row.
 *
 * @param row - A row from the export query.
 * @returns Cell values in column order.
 */
function cellsFor(row: Record<string, unknown>): unknown[] {
  const price = Number(row.sale_price ?? row.base_price) || 0;
  const cost = row.cost_price === null ? null : Number(row.cost_price);
  const units90d = Number(row.units_90d) || 0;
  const available = Number(row.available) || 0;

  const computed: Record<string, unknown> = {
    Category: row.category_name,
    Supplier: row.supplier_name,
    Available: available,
    Committed: Number(row.committed) || 0,
    Incoming: Number(row.incoming) || 0,
    'Stock Value At Cost': Number(row.value_at_cost) || 0,
    'Units Sold 90d': units90d,
    /* Blank rather than a sentinel when nothing has sold. A spreadsheet full of 999999 sorts
     * wrongly and reads as data. */
    'Days Of Cover': units90d > 0 ? Math.round((available / (units90d / 90)) * 10) / 10 : '',
    'Margin %': cost !== null && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : '',
    'Listing Completeness': row.completeness_score,
    'Variant Inventory Qty': row.stock_quantity
  };

  /* Written in Shopify's terms: `Variant Price` is what the shopper pays and
   * `Variant Compare At Price` is the struck-through comparison. Writing our `base_price` and
   * `sale_price` straight into those two headers inverted every discounted product — a file that
   * said "was 199, now 249" — and, re-imported anywhere, sold it at the higher price. */
  const { price: shopifyPrice, compareAt } = shopifyPricePair(
    (row.base_price ?? null) as number | string | null,
    (row.sale_price ?? null) as number | string | null
  );

  return EXPORT_CSV_COLUMNS.map((col) => {
    if (col.header === 'Variant Price') return shopifyPrice ?? '';
    if (col.header === 'Variant Compare At Price') return compareAt ?? '';

    /* The category's *name*, not its id. The column is writable now — the import resolves a name
     * back to an id, creating it when new — but a merchant editing a spreadsheet types "Audio",
     * not a UUID, and a file full of UUIDs is not one they can work with. */
    if (col.type === 'category') return row.category_name ?? '';

    if (col.column === null) return computed[col.header] ?? '';

    const value = row[col.column];

    /*
     * A column whose header names a unit has to be written in that unit.
     *
     * This wrote the raw `weight` column — pounds — under a header reading `Variant Grams`, while
     * the importer correctly divided that header by 453.59237 on the way back in. So exporting a
     * catalogue and re-importing it unchanged, the round trip both modules document as supported,
     * turned every 2.50 lb product into 0.01 lb. Twelve of twelve seeded products lost their weight
     * in one pass, under a green "12 updated" — and weight is what carriers quote against and what
     * a customs declaration values.
     */
    if (col.type === 'grams') {
      return weightToGrams(value as number | string | null, row.weight_unit as string | null);
    }

    if (col.type === 'boolean') return value ? 'TRUE' : 'FALSE';
    return value ?? '';
  });
}
