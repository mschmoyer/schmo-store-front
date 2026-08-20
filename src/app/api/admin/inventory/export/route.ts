/**
 * Inventory CSV export.
 *
 * Shares the grid's query builder, so the file a merchant downloads is the view they were looking
 * at. The previous version ran its own copy of the query, which had already drifted from the
 * grid's — different columns, a different definition of a sale, and its own fan-out bug from
 * joining `inventory` on SKU with no location predicate, which put a product held in three
 * warehouses into the file three times.
 *
 * The columns are chosen for what a merchant does with the file: a stocktake sheet to print, a
 * reorder list to send to a buyer, and a valuation to hand an accountant. Products with no cost on
 * file carry an empty value column rather than a zero — a zero would silently understate the
 * valuation, which is the class of quiet error this whole change set exists to remove.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse } from '@/lib/api/adminError';
import {
  INVENTORY_SELECT,
  buildInventoryOrderBy,
  buildInventoryWhere,
  inventoryFrom,
  resolveDirection,
  resolveInventorySort,
  resolveInventoryState,
  type InventoryFilters
} from '../_lib/query';
import { csvRow } from '@/lib/catalog/csv';

/** Rows per round trip while streaming. */
const BATCH = 500;

/** The exported columns, in order. */
const COLUMNS = [
  'SKU',
  'Product',
  'Category',
  'Supplier',
  'Location count',
  'On hand',
  'Committed',
  'Reserved',
  'Unavailable',
  'Available',
  'On order',
  'Unit cost',
  'Stock value at cost',
  'Retail price',
  'Stock value at retail',
  'Units sold 30d',
  'Units sold 90d',
  'Daily demand',
  'Days of cover',
  'Reorder point',
  'Suggested reorder point',
  'Low stock threshold',
  'Lead time days',
  'State',
  'Last sold',
  'Last movement'
] as const;

/** Lead time assumed when neither the product nor its supplier records one. */
const DEFAULT_LEAD_TIME_DAYS = 14;

/**
 * GET /api/admin/inventory/export
 *
 * Stream the current inventory view as CSV. Accepts the same query parameters as the grid.
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

    const { searchParams } = new URL(request.url);

    const filters: InventoryFilters = {
      search: searchParams.get('search')?.trim() || undefined,
      state: resolveInventoryState(searchParams.get('state')),
      categoryId: searchParams.get('category_id') || undefined,
      supplierId: searchParams.get('supplier_id') || undefined,
      locationId: searchParams.get('location_id') || undefined,
      vendor: searchParams.get('vendor') || undefined
    };

    const where = buildInventoryWhere(user.storeId, filters);
    const from = inventoryFrom(where.locationParam);
    const orderBy = buildInventoryOrderBy(
      resolveInventorySort(searchParams.get('sort_by'), 'sku'),
      resolveDirection(searchParams.get('sort_order'), 'ASC')
    );

    const sql = `
      SELECT ${INVENTORY_SELECT}
      ${from}
      ${where.sql}
      ${orderBy}
      LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
    `;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`${csvRow([...COLUMNS])}\n`));

          let offset = 0;
          for (;;) {
            const page = await db.query(sql, [...where.params, BATCH, offset]);
            if (page.rows.length === 0) break;

            controller.enqueue(
              encoder.encode(`${page.rows.map((row) => csvRow(cellsFor(row))).join('\n')}\n`)
            );

            if (page.rows.length < BATCH) break;
            offset += BATCH;
          }
          controller.close();
        } catch (error) {
          /* The response has already begun and the browser is writing a file, so this cannot become
           * a 500. Saying the file is truncated is the only honest ending available. */
          console.error('[api:inventory.export] stream failed', error);
          controller.enqueue(
            encoder.encode('\n"EXPORT INCOMPLETE — this file was truncated by an error."\n')
          );
          controller.close();
        }
      }
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inventory-${stamp}.csv"`,
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'inventory.export');
  }
}

/**
 * Build one CSV record from an inventory row.
 *
 * @param row - A row from the export query.
 * @returns Cell values in column order.
 */
function cellsFor(row: Record<string, unknown>): unknown[] {
  const unitCost = row.unit_cost === null ? null : Number(row.unit_cost);
  const onHand = Number(row.on_hand) || 0;
  const dailyDemand = Number(row.daily_demand) || 0;

  const suggested =
    dailyDemand > 0
      ? Math.ceil(
          dailyDemand * (Number(row.lead_time_days) || DEFAULT_LEAD_TIME_DAYS) +
            (Number(row.safety_stock) || Math.ceil(dailyDemand * 7))
        )
      : '';

  const date = (value: unknown): string =>
    value ? new Date(String(value)).toISOString().slice(0, 10) : '';

  return [
    row.sku,
    row.name,
    row.category_name ?? '',
    row.supplier_name ?? '',
    row.location_count,
    onHand,
    row.committed,
    row.reserved,
    row.unavailable,
    row.available,
    row.incoming,
    /* Blank, not zero. A zero cost reads as free and would understate a valuation a merchant may
     * be handing to an insurer. */
    unitCost ?? '',
    unitCost === null ? '' : Number(row.value_at_cost) || 0,
    Number(row.sale_price ?? row.base_price) || 0,
    Number(row.value_at_retail) || 0,
    row.units_30d,
    row.units_90d,
    dailyDemand,
    row.days_of_cover ?? '',
    row.reorder_point ?? '',
    suggested,
    row.low_stock_threshold ?? '',
    row.lead_time_days ?? '',
    row.state,
    date(row.last_sale_date),
    date(row.last_movement_at)
  ];
}
