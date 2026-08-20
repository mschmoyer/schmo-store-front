/**
 * Bulk catalogue operations.
 *
 * The admin has offered "Bulk Actions" since the catalogue page was written; the route it posts to
 * has never existed, so every bulk action 404'd and reported failure. This is that route.
 *
 * Two design decisions are worth stating because they are what separate a useful bulk endpoint
 * from a dangerous one.
 *
 * **It reports per-row outcomes, not a single boolean.** "183 updated, 2 skipped: SKU-991 would
 * drop below cost" is actionable; `{success: true}` over a partial failure is the kind of
 * confident lie this codebase has shipped before and explicitly bans.
 *
 * **It accepts a filter as well as an id list.** Selecting "all 3,417 products matching this
 * filter" cannot mean shipping 3,417 uuids through a query string. The same filter builder that
 * renders the grid resolves the selection server-side, so what the merchant saw is what changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { buildProductWhere, resolveIssue, resolveStockStatus, type ProductListFilters } from '../_lib/query';

/** How many products one call may touch. Beyond this the client should page the work. */
const MAX_AFFECTED = 5000;

/** The operations this route performs. */
type BulkAction =
  | 'publish'
  | 'unpublish'
  | 'archive'
  | 'unarchive'
  | 'feature'
  | 'unfeature'
  | 'add_tags'
  | 'remove_tags'
  | 'set_category'
  | 'set_vendor'
  | 'set_product_type'
  | 'set_supplier'
  | 'adjust_price'
  | 'set_sale_price'
  | 'clear_sale_price'
  | 'set_low_stock_threshold'
  | 'set_reorder_point'
  | 'set_track_inventory'
  | 'delete';

const ACTIONS: BulkAction[] = [
  'publish', 'unpublish', 'archive', 'unarchive', 'feature', 'unfeature',
  'add_tags', 'remove_tags', 'set_category', 'set_vendor', 'set_product_type',
  'set_supplier', 'adjust_price', 'set_sale_price', 'clear_sale_price',
  'set_low_stock_threshold', 'set_reorder_point', 'set_track_inventory', 'delete'
];

/** One product's outcome. `skipped` carries a reason the merchant can act on. */
interface RowResult {
  id: string;
  sku: string;
  status: 'updated' | 'skipped' | 'deleted';
  reason?: string;
}

/**
 * Resolve which products a bulk request targets.
 *
 * @param storeId - The tenant. Non-negotiable; a bulk write that missed it would be catastrophic.
 * @param body - The request body, carrying either `product_ids` or a `filter`.
 * @returns The ids and SKUs in scope.
 * @throws AdminApiError when the selection is empty or larger than {@link MAX_AFFECTED}.
 */
async function resolveTargets(
  storeId: string,
  body: Record<string, unknown>
): Promise<Array<{ id: string; sku: string }>> {
  const ids = Array.isArray(body.product_ids)
    ? body.product_ids.map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v))
    : [];

  if (ids.length > 0) {
    const result = await db.query<{ id: string; sku: string }>(
      'SELECT id, sku FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])',
      [storeId, ids]
    );
    if (result.rows.length === 0) {
      throw new AdminApiError('None of the selected products are in this store', 404);
    }
    return result.rows;
  }

  const rawFilter = (body.filter ?? {}) as Record<string, unknown>;
  const filter: ProductListFilters = {
    search: typeof rawFilter.search === 'string' ? rawFilter.search : undefined,
    categoryId: typeof rawFilter.category_id === 'string' ? rawFilter.category_id : undefined,
    isActive: typeof rawFilter.is_active === 'boolean' ? rawFilter.is_active : undefined,
    isFeatured: typeof rawFilter.is_featured === 'boolean' ? rawFilter.is_featured : undefined,
    minPrice: typeof rawFilter.min_price === 'number' ? rawFilter.min_price : undefined,
    maxPrice: typeof rawFilter.max_price === 'number' ? rawFilter.max_price : undefined,
    stockStatus: resolveStockStatus(rawFilter.stock_status as string),
    issue: resolveIssue(rawFilter.issue as string),
    tags: Array.isArray(rawFilter.tags) ? rawFilter.tags.map(String) : undefined,
    vendor: typeof rawFilter.vendor === 'string' ? rawFilter.vendor : undefined
  };

  /* An empty filter would select the entire catalogue, which is never what a mis-click meant.
   * Selecting everything on purpose requires saying so. */
  const hasNarrowing = Object.values(filter).some((v) => v !== undefined);
  if (!hasNarrowing && body.confirm_all !== true) {
    throw new AdminApiError(
      'Select products, or pass confirm_all to apply this to the entire catalogue',
      400
    );
  }

  const where = buildProductWhere(storeId, filter);
  const result = await db.query<{ id: string; sku: string }>(
    `SELECT p.id, p.sku FROM products p ${where.sql} LIMIT ${MAX_AFFECTED + 1}`,
    where.params
  );

  if (result.rows.length === 0) {
    throw new AdminApiError('No products match that selection', 404);
  }
  if (result.rows.length > MAX_AFFECTED) {
    throw new AdminApiError(
      `That selection covers more than ${MAX_AFFECTED} products. Narrow it and run it in batches.`,
      413
    );
  }

  return result.rows;
}

/**
 * POST /api/admin/products/bulk
 *
 * Apply one operation to many products in a single transaction.
 *
 * Body: `{ action, product_ids?, filter?, confirm_all?, value?, ...action-specific }`.
 *
 * @param request - The incoming request.
 * @returns Per-row outcomes and a summary count.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    /* Hoisted so the narrowing survives into the transaction callback below. */
    const storeId = user.storeId;

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action as BulkAction;

    if (!ACTIONS.includes(action)) {
      throw new AdminApiError(`"${String(action)}" is not a bulk action this store supports`, 400);
    }

    const targets = await resolveTargets(storeId, body);
    const ids = targets.map((t) => t.id);
    const skuById = new Map(targets.map((t) => [t.id, t.sku]));

    const results: RowResult[] = [];

    await db.transaction(async (tx) => {
      switch (action) {
        case 'delete': {
          /*
           * A product with order history is never deleted. Order lines reference it, and losing
           * the product means losing the record of what a customer bought — an accounting problem
           * dressed up as a catalogue action. Those are archived instead, and the response says so
           * rather than quietly doing something other than what was asked.
           */
          const withOrders = await tx.query<{ id: string }>(
            `SELECT DISTINCT oi.product_id AS id
               FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE o.store_id = $1 AND oi.product_id = ANY($2::uuid[])`,
            [storeId, ids]
          );
          const protectedIds = new Set(withOrders.rows.map((r) => r.id));
          const deletable = ids.filter((id) => !protectedIds.has(id));

          if (protectedIds.size > 0) {
            await tx.query(
              `UPDATE products SET status = 'archived', updated_at = NOW()
                WHERE store_id = $1 AND id = ANY($2::uuid[])`,
              [storeId, [...protectedIds]]
            );
            for (const id of protectedIds) {
              results.push({
                id,
                sku: skuById.get(id) ?? '',
                status: 'updated',
                reason: 'Archived instead of deleted — this product appears on past orders'
              });
            }
          }

          if (deletable.length > 0) {
            await tx.query('DELETE FROM inventory_logs WHERE store_id = $1 AND product_id = ANY($2::uuid[])', [
              storeId,
              deletable
            ]);
            await tx.query('DELETE FROM products WHERE store_id = $1 AND id = ANY($2::uuid[])', [
              storeId,
              deletable
            ]);
            for (const id of deletable) {
              results.push({ id, sku: skuById.get(id) ?? '', status: 'deleted' });
            }
          }
          return;
        }

        case 'adjust_price': {
          /*
           * Percentage and absolute price moves, the Black Friday operation. Rounding is to the
           * cent and happens in Postgres NUMERIC, never a JS float — a 3% rise applied to 300 SKUs
           * through binary floating point drifts, and drifted prices are refund tickets.
           */
          const mode = body.mode === 'absolute' ? 'absolute' : 'percent';
          const amount = Number(body.value);
          if (!Number.isFinite(amount)) {
            throw new AdminApiError('Provide the amount to change prices by', 400);
          }
          const target = body.target === 'sale_price' ? 'sale_price' : 'base_price';
          const floorAtCost = body.floor_at_cost !== false;

          const expression =
            mode === 'percent'
              ? `ROUND(COALESCE(${target}, base_price) * (1 + ($3::numeric / 100)), 2)`
              : `ROUND(COALESCE(${target}, base_price) + $3::numeric, 2)`;

          /* Never let a bulk move price a product below its own cost silently. Those rows are
           * skipped and named, so the merchant can decide rather than discover it in a P&L. */
          const guard = floorAtCost
            ? `AND (cost_price IS NULL OR ${expression} >= cost_price)`
            : '';

          const updated = await tx.query<{ id: string }>(
            `UPDATE products
                SET ${target} = GREATEST(${expression}, 0), updated_at = NOW()
              WHERE store_id = $1 AND id = ANY($2::uuid[]) ${guard}
              RETURNING id`,
            [storeId, ids, amount]
          );
          const changed = new Set(updated.rows.map((r) => r.id));
          for (const id of ids) {
            results.push(
              changed.has(id)
                ? { id, sku: skuById.get(id) ?? '', status: 'updated' }
                : {
                    id,
                    sku: skuById.get(id) ?? '',
                    status: 'skipped',
                    reason: 'That change would put the price at or below cost'
                  }
            );
          }
          return;
        }

        default: {
          const { sql, params } = updateForAction(action, body, storeId, ids);
          const updated = await tx.query<{ id: string }>(sql, params);
          const changed = new Set(updated.rows.map((r) => r.id));
          for (const id of ids) {
            results.push(
              changed.has(id)
                ? { id, sku: skuById.get(id) ?? '', status: 'updated' }
                : { id, sku: skuById.get(id) ?? '', status: 'skipped', reason: 'No change needed' }
            );
          }
        }
      }
    });

    const summary = {
      requested: targets.length,
      updated: results.filter((r) => r.status === 'updated').length,
      deleted: results.filter((r) => r.status === 'deleted').length,
      skipped: results.filter((r) => r.status === 'skipped').length
    };

    return NextResponse.json({ success: true, data: { action, summary, results } });
  } catch (error) {
    return adminErrorResponse(error, 'products.bulk');
  }
}

/**
 * Build the `UPDATE` for the actions that are a single statement.
 *
 * @param action - The operation, already validated against {@link ACTIONS}.
 * @param body - The request body, for the action's own parameters.
 * @param storeId - The tenant.
 * @param ids - The products in scope.
 * @returns Parameterised SQL returning the ids it actually changed.
 * @throws AdminApiError when the action's required parameter is missing.
 */
function updateForAction(
  action: BulkAction,
  body: Record<string, unknown>,
  storeId: string,
  ids: string[]
): { sql: string; params: unknown[] } {
  const scope = 'WHERE store_id = $1 AND id = ANY($2::uuid[])';
  const base = [storeId, ids];

  const requireString = (field: string): string => {
    const value = body[field] ?? body.value;
    if (typeof value !== 'string' || !value.trim()) {
      throw new AdminApiError(`Provide a value for ${field.replace(/_/g, ' ')}`, 400);
    }
    return value.trim();
  };

  const requireNumber = (field: string): number => {
    const value = Number(body[field] ?? body.value);
    if (!Number.isFinite(value)) {
      throw new AdminApiError(`Provide a number for ${field.replace(/_/g, ' ')}`, 400);
    }
    return value;
  };

  const requireTags = (): string[] => {
    const raw = body.tags ?? body.value;
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
    const tags = list.map((t) => String(t).trim()).filter(Boolean);
    if (tags.length === 0) throw new AdminApiError('Provide at least one tag', 400);
    return tags;
  };

  switch (action) {
    /* Only rows whose value actually differs are updated, so `RETURNING id` reports genuine
     * changes and a no-op run does not bump `updated_at` on the whole catalogue. */
    case 'publish':
      return {
        sql: `UPDATE products SET status = 'active', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
              ${scope} AND status <> 'active' RETURNING id`,
        params: base
      };
    case 'unpublish':
      return {
        sql: `UPDATE products SET status = 'draft', updated_at = NOW() ${scope} AND status <> 'draft' RETURNING id`,
        params: base
      };
    case 'archive':
      return {
        sql: `UPDATE products SET status = 'archived', updated_at = NOW() ${scope} AND status <> 'archived' RETURNING id`,
        params: base
      };
    case 'unarchive':
      return {
        sql: `UPDATE products SET status = 'draft', updated_at = NOW() ${scope} AND status = 'archived' RETURNING id`,
        params: base
      };
    case 'feature':
      return {
        sql: `UPDATE products SET is_featured = true, updated_at = NOW() ${scope} AND is_featured IS DISTINCT FROM true RETURNING id`,
        params: base
      };
    case 'unfeature':
      return {
        sql: `UPDATE products SET is_featured = false, updated_at = NOW() ${scope} AND is_featured IS DISTINCT FROM false RETURNING id`,
        params: base
      };
    case 'add_tags':
      return {
        /* Union without duplicates, order preserved by the array constructor's subquery. */
        sql: `UPDATE products
                 SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $3::text[])),
                     updated_at = NOW()
               ${scope} AND NOT (COALESCE(tags, '{}') @> $3::text[]) RETURNING id`,
        params: [...base, requireTags()]
      };
    case 'remove_tags':
      return {
        sql: `UPDATE products
                 SET tags = ARRAY(SELECT t FROM unnest(COALESCE(tags, '{}')) t WHERE NOT (t = ANY($3::text[]))),
                     updated_at = NOW()
               ${scope} AND COALESCE(tags, '{}') && $3::text[] RETURNING id`,
        params: [...base, requireTags()]
      };
    case 'set_category':
      return {
        sql: `UPDATE products SET category_id = $3::uuid, updated_at = NOW()
              ${scope} AND category_id IS DISTINCT FROM $3::uuid RETURNING id`,
        params: [...base, body.category_id ?? body.value ?? null]
      };
    case 'set_vendor':
      return {
        sql: `UPDATE products SET vendor = $3, updated_at = NOW() ${scope} AND vendor IS DISTINCT FROM $3 RETURNING id`,
        params: [...base, requireString('vendor')]
      };
    case 'set_product_type':
      return {
        sql: `UPDATE products SET product_type = $3, updated_at = NOW() ${scope} AND product_type IS DISTINCT FROM $3 RETURNING id`,
        params: [...base, requireString('product_type')]
      };
    case 'set_supplier':
      return {
        sql: `UPDATE products SET supplier_id = $3::uuid, updated_at = NOW()
              ${scope} AND supplier_id IS DISTINCT FROM $3::uuid RETURNING id`,
        params: [...base, body.supplier_id ?? body.value ?? null]
      };
    case 'set_sale_price':
      return {
        /* A sale price above the regular price is not a sale. Those rows fall out of the
         * predicate and are reported as skipped. */
        sql: `UPDATE products SET sale_price = $3::numeric, updated_at = NOW()
              ${scope} AND $3::numeric <= base_price RETURNING id`,
        params: [...base, requireNumber('sale_price')]
      };
    case 'clear_sale_price':
      return {
        sql: `UPDATE products SET sale_price = NULL, updated_at = NOW() ${scope} AND sale_price IS NOT NULL RETURNING id`,
        params: base
      };
    case 'set_low_stock_threshold':
      return {
        sql: `UPDATE products SET low_stock_threshold = $3::int, updated_at = NOW()
              ${scope} AND low_stock_threshold IS DISTINCT FROM $3::int RETURNING id`,
        params: [...base, Math.max(0, Math.round(requireNumber('low_stock_threshold')))]
      };
    case 'set_reorder_point':
      return {
        sql: `UPDATE products SET reorder_point = $3::int, updated_at = NOW()
              ${scope} AND reorder_point IS DISTINCT FROM $3::int RETURNING id`,
        params: [...base, Math.max(0, Math.round(requireNumber('reorder_point')))]
      };
    case 'set_track_inventory':
      return {
        sql: `UPDATE products SET track_inventory = $3, updated_at = NOW()
              ${scope} AND track_inventory IS DISTINCT FROM $3 RETURNING id`,
        params: [...base, body.track_inventory !== false]
      };
    default:
      throw new AdminApiError(`"${action}" has no update defined`, 500);
  }
}
