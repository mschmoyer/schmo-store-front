/**
 * The admin catalogue list and product creation.
 *
 * Two things about this route are worth knowing before changing it.
 *
 * It used to build `ORDER BY ${sortBy}` from the query string and echo `error.message` back to the
 * caller, which together formed an error-based SQL injection that read other tenants' rows. Sorting
 * now goes through the frozen map in `./_lib/query`, and failures return a generic message with the
 * detail confined to the server log. Nothing caller-supplied may be concatenated into SQL here.
 *
 * It also used to run two extra queries per product to attach sales figures — forty round trips to
 * render one page of twenty. Those are lateral joins now, so a page is three queries regardless of
 * page size: the rows, the unfiltered totals for the view tabs, and the filtered count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import {
  buildOrderBy,
  buildProductWhere,
  resolveIssue,
  resolveSortDirection,
  resolveSortKey,
  resolveStockStatus,
  type ProductListFilters
} from './_lib/query';
import { adminErrorResponse } from '@/lib/api/adminError';
import { slugify, uniqueProductSlug } from '@/lib/catalog/slug';

/** Hard ceiling on page size, so a caller cannot ask for the whole catalogue in one response. */
const MAX_LIMIT = 250;

/**
 * GET /api/admin/products
 *
 * The catalogue grid: one page of products with the sales, margin and stock figures the grid
 * displays, plus the counts that drive the saved-view tabs.
 *
 * Query parameters: `page`, `limit`, `search`, `category_id`, `is_active`, `is_featured`,
 * `min_price`, `max_price`, `stock_status`, `issue`, `tags`, `vendor`, `sort_by`, `sort_order`.
 *
 * @param request - The incoming request; the signed-in user's store scopes every query.
 * @returns The page of products, pagination metadata, and store-wide statistics.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '25', 10) || 25;
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
    const offset = (page - 1) * limit;

    const boolParam = (name: string): boolean | undefined => {
      const raw = searchParams.get(name);
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    };
    const numParam = (name: string): number | undefined => {
      const raw = searchParams.get(name);
      if (raw === null || raw.trim() === '') return undefined;
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

    const sortKey = resolveSortKey(searchParams.get('sort_by'));
    const sortDirection = resolveSortDirection(searchParams.get('sort_order'));

    const where = buildProductWhere(user.storeId, filters);

    /*
     * The lateral joins replace what used to be two queries per row.
     *
     * `s` is lifetime sales for the product. Cancelled orders are excluded and nothing else is —
     * a shipped order is a sale. The status predicate matches the dashboard's, because two screens
     * disagreeing about how many of a SKU sold is a bug this codebase has already shipped once.
     *
     * `w` is the last 30 and 90 days, which is what the grid's velocity column shows. Both windows
     * key off the *order's* date, never the line item's insert timestamp: for a seeded or imported
     * catalogue every line's `created_at` is the import date, which made every window return the
     * same number.
     */
    const rowsSql = `
      SELECT
        p.*,
        COALESCE(p.sale_price, p.base_price)                       AS effective_price,
        c.name                                                     AS category_name,
        sup.name                                                   AS supplier_name,
        COALESCE(s.total_sales, 0)::int                            AS units_sold,
        COALESCE(s.total_revenue, 0)::numeric                      AS total_revenue,
        COALESCE(s.total_orders, 0)::int                           AS total_orders,
        s.last_sale_date,
        COALESCE(w.units_30d, 0)::int                              AS units_30d,
        COALESCE(w.units_90d, 0)::int                              AS units_90d,
        p.stock_quantity * COALESCE(p.cost_price, 0)               AS inventory_value_at_cost,
        p.stock_quantity * COALESCE(p.sale_price, p.base_price)    AS inventory_value_at_retail,
        CASE
          WHEN p.track_inventory = false THEN 'not_tracked'
          WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
          WHEN p.stock_quantity <= COALESCE(p.low_stock_threshold, 0) THEN 'low_stock'
          ELSE 'in_stock'
        END                                                        AS stock_status,
        /* Days of cover: at the last 90 days' rate, how long the shelf lasts. NULL when nothing
         * has sold, because "infinite cover" and "no demand signal" are different answers. */
        CASE
          WHEN COALESCE(w.units_90d, 0) > 0
          THEN ROUND(p.stock_quantity / (w.units_90d / 90.0), 1)
          ELSE NULL
        END                                                        AS days_of_cover
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.store_id = p.store_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(oi.quantity)               AS total_sales,
          SUM(oi.total_price)            AS total_revenue,
          COUNT(DISTINCT oi.order_id)    AS total_orders,
          MAX(o.created_at)              AS last_sale_date
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '30 days' THEN oi.quantity ELSE 0 END) AS units_30d,
          SUM(CASE WHEN o.created_at >= NOW() - INTERVAL '90 days' THEN oi.quantity ELSE 0 END) AS units_90d
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
          AND o.created_at >= NOW() - INTERVAL '90 days'
      ) w ON TRUE
      ${where.sql}
      ${buildOrderBy(sortKey, sortDirection)}
      LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
    `;

    const countSql = `SELECT COUNT(*)::int AS total FROM products p ${where.sql}`;

    /*
     * View counts are deliberately *unfiltered* except by store. They label the tabs above the
     * grid ("Active 128 · Draft 14 · Low stock 9"), and a tab whose count changed depending on
     * which tab you were already looking at would be useless for navigation.
     */
    const statsSql = `
      SELECT
        COUNT(*)::int                                                              AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int                             AS active,
        COUNT(*) FILTER (WHERE status = 'draft')::int                              AS draft,
        COUNT(*) FILTER (WHERE status = 'archived')::int                           AS archived,
        COUNT(*) FILTER (WHERE track_inventory AND stock_quantity > COALESCE(low_stock_threshold, 0))::int AS in_stock,
        COUNT(*) FILTER (WHERE track_inventory AND stock_quantity > 0
                           AND stock_quantity <= COALESCE(low_stock_threshold, 0))::int AS low_stock,
        COUNT(*) FILTER (WHERE track_inventory AND stock_quantity <= 0)::int        AS out_of_stock,
        /* Counts exactly what the "Needs attention" view filters on — see ISSUE_SQL.incomplete.
         * A tab whose badge disagrees with the list it opens is worse than no badge. */
        COUNT(*) FILTER (WHERE featured_image_url IS NULL OR featured_image_url = ''
                           OR COALESCE(NULLIF(TRIM(long_description), ''),
                                       NULLIF(TRIM(short_description), '')) IS NULL
                           OR base_price IS NULL OR base_price <= 0)::int             AS incomplete,
        COUNT(*) FILTER (WHERE cost_price IS NULL OR cost_price <= 0)::int            AS uncosted,
        COUNT(*) FILTER (WHERE cost_price IS NOT NULL
                           AND COALESCE(sale_price, base_price) <= cost_price)::int AS negative_margin,
        COALESCE(SUM(CASE WHEN track_inventory THEN stock_quantity * COALESCE(cost_price, 0) END), 0)::numeric AS inventory_value_at_cost,
        COALESCE(SUM(CASE WHEN track_inventory THEN stock_quantity * COALESCE(sale_price, base_price) END), 0)::numeric AS inventory_value_at_retail
      FROM products
      WHERE store_id = $1
    `;

    const [rowsResult, countResult, statsResult] = await Promise.all([
      db.query(rowsSql, [...where.params, limit, offset]),
      db.query<{ total: number }>(countSql, where.params),
      db.query(statsSql, [user.storeId])
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const stats = statsResult.rows[0] ?? {};

    const products = rowsResult.rows.map((row) => {
      const effectivePrice = Number(row.effective_price) || 0;
      const cost = row.cost_price === null ? null : Number(row.cost_price);
      /* Margin is only meaningful once a cost is recorded; 100% margin on an unknown cost is a
       * lie the grid should not tell. */
      const marginPercent =
        cost !== null && effectivePrice > 0
          ? Math.round(((effectivePrice - cost) / effectivePrice) * 1000) / 10
          : null;

      /* `pg` returns NUMERIC as a string to protect precision it cannot guarantee in a JS float.
       * That is the right default for money at rest, but these values are display figures the grid
       * sorts and formats, so they are coerced once here rather than in every component. */
      return {
        ...row,
        base_price: Number(row.base_price) || 0,
        sale_price: row.sale_price === null ? null : Number(row.sale_price),
        cost_price: cost,
        effective_price: effectivePrice,
        margin_percent: marginPercent,
        days_of_cover: row.days_of_cover === null ? null : Number(row.days_of_cover),
        inventory_value_at_cost: Number(row.inventory_value_at_cost) || 0,
        inventory_value_at_retail: Number(row.inventory_value_at_retail) || 0,
        sales_data: {
          total_sales: Number(row.units_sold) || 0,
          total_revenue: Number(row.total_revenue) || 0,
          total_orders: Number(row.total_orders) || 0,
          units_30d: Number(row.units_30d) || 0,
          units_90d: Number(row.units_90d) || 0,
          last_sale_date: row.last_sale_date
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasNext: offset + products.length < total,
          hasPrev: page > 1
        },
        statistics: {
          total: Number(stats.total) || 0,
          active: Number(stats.active) || 0,
          draft: Number(stats.draft) || 0,
          archived: Number(stats.archived) || 0,
          inStock: Number(stats.in_stock) || 0,
          lowStock: Number(stats.low_stock) || 0,
          outOfStock: Number(stats.out_of_stock) || 0,
          incomplete: Number(stats.incomplete) || 0,
          uncosted: Number(stats.uncosted) || 0,
          negativeMargin: Number(stats.negative_margin) || 0,
          inventoryValueAtCost: Number(stats.inventory_value_at_cost) || 0,
          inventoryValueAtRetail: Number(stats.inventory_value_at_retail) || 0
        },
        sort: { by: sortKey, order: sortDirection.toLowerCase() }
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'products.list');
  }
}

/** Fields a create request may set, and how to coerce each one. */
const NUMERIC_FIELDS = ['base_price', 'sale_price', 'cost_price', 'weight', 'length', 'width', 'height'] as const;

/**
 * POST /api/admin/products
 *
 * Create a product that exists only here — the case ShipStation cannot serve, because a merchant
 * drafting a listing has nothing to sync from yet.
 *
 * Every failure mode this used to have was a 500: it validated `base_price` and then inserted
 * `body.price`, wrote a `compare_price` column that does not exist, and passed `JSON.stringify`d
 * arrays into `text[]` columns. It now validates what it inserts and inserts what it validated.
 *
 * @param request - The incoming request. Body fields are validated, never trusted.
 * @returns The created product, or a 400/409 explaining what to fix.
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
      return NextResponse.json(
        { success: false, error: 'A product name is required' },
        { status: 400 }
      );
    }

    /*
     * SKU and slug are both derivable. Requiring a merchant to invent a slug before they can save
     * a draft is friction for no benefit — they can refine it on the detail page. A SKU is
     * generated from the name only when one was not supplied, so imports keep their identifiers.
     */
    let sku =
      (typeof body.sku === 'string' && body.sku.trim()) ||
      `${slugify(name).toUpperCase().slice(0, 20) || 'SKU'}-${Date.now().toString(36).toUpperCase()}`;

    const numbers: Record<string, number | null> = {};
    for (const field of NUMERIC_FIELDS) {
      const raw = body[field];
      if (raw === undefined || raw === null || raw === '') {
        numbers[field] = null;
        continue;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { success: false, error: `${field.replace(/_/g, ' ')} must be a number of 0 or more` },
          { status: 400 }
        );
      }
      numbers[field] = parsed;
    }

    /* A draft may be priced later, but a product that is going live has to have a price. */
    const status = ['draft', 'active', 'archived'].includes(body.status) ? body.status : 'draft';
    if (status === 'active' && !numbers.base_price) {
      return NextResponse.json(
        { success: false, error: 'Set a price before publishing this product' },
        { status: 400 }
      );
    }

    if (
      numbers.sale_price !== null &&
      numbers.base_price !== null &&
      numbers.sale_price > numbers.base_price
    ) {
      return NextResponse.json(
        { success: false, error: 'The sale price cannot be higher than the regular price' },
        { status: 400 }
      );
    }

    /*
     * A SKU a merchant typed is theirs, and a collision is theirs to resolve — so this refuses
     * rather than quietly renaming. `unique_sku` is the one exception, sent by Duplicate: there is
     * no merchant intent behind "SKU-COPY" to protect, and without it duplicating the same product
     * twice always failed on the second attempt with a conflict on a SKU the merchant never chose.
     */
    if (body.unique_sku === true) {
      sku = await freeSku(user.storeId, sku);
    } else {
      const skuConflict = await db.query('SELECT id FROM products WHERE sku = $1 AND store_id = $2', [
        sku,
        user.storeId
      ]);
      if (skuConflict.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: `SKU "${sku}" is already used by another product` },
          { status: 409 }
        );
      }
    }

    const slug = await uniqueProductSlug(user.storeId, body.slug || name);

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];
    const galleryImages = Array.isArray(body.gallery_images ?? body.images)
      ? (body.gallery_images ?? body.images).map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];

    const inserted = await db.query(
      `
      INSERT INTO products (
        store_id, sku, name, slug, barcode, vendor, product_type,
        short_description, long_description, description_html,
        base_price, sale_price, cost_price,
        track_inventory, stock_quantity, low_stock_threshold, allow_backorder,
        weight, weight_unit, length, width, height, dimension_unit,
        category_id, supplier_id, tags, featured_image_url, gallery_images,
        meta_title, meta_description,
        requires_shipping, is_digital, is_featured, country_of_origin,
        status, published_at,
        /* Six columns the INSERT did not carry, so Duplicate silently dropped them from every copy
         * — under a green "Duplicated" toast — and none of them could be set at creation at all.
         * A copy of a product that loses its HS code, its shipping class and its whole reorder
         * policy is not a copy; a merchant duplicating their second-through-thousandth product had
         * to re-enter them by hand, if they noticed. */
        hs_code, shipping_class, reorder_point, reorder_quantity, lead_time_days, safety_stock
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28,
        $29, $30,
        $31, $32, $33, $34,
        $35, $36,
        $37, $38, $39, $40, $41, $42
      ) RETURNING *
      `,
      [
        user.storeId,
        sku,
        name,
        slug,
        body.barcode?.trim() || null,
        body.vendor?.trim() || null,
        body.product_type?.trim() || null,
        body.short_description?.trim() || null,
        (body.long_description ?? body.description)?.trim() || null,
        body.description_html || null,
        numbers.base_price ?? 0,
        numbers.sale_price,
        numbers.cost_price,
        body.track_inventory ?? true,
        Number.parseInt(String(body.stock_quantity ?? body.inventory_quantity ?? 0), 10) || 0,
        Number.parseInt(String(body.low_stock_threshold ?? 10), 10) || 0,
        body.allow_backorder ?? false,
        numbers.weight,
        body.weight_unit || 'lb',
        numbers.length,
        numbers.width,
        numbers.height,
        body.dimension_unit || 'in',
        body.category_id || null,
        body.supplier_id || null,
        tags,
        body.featured_image_url?.trim() || null,
        galleryImages,
        body.meta_title?.trim() || null,
        body.meta_description?.trim() || null,
        body.requires_shipping ?? true,
        body.is_digital ?? false,
        body.is_featured ?? false,
        body.country_of_origin?.trim()?.toUpperCase()?.slice(0, 2) || null,
        status,
        status === 'active' ? new Date() : null,
        body.hs_code?.trim()?.slice(0, 16) || null,
        body.shipping_class?.trim()?.slice(0, 100) || null,
        intOrNull(body.reorder_point),
        intOrNull(body.reorder_quantity),
        intOrNull(body.lead_time_days),
        intOrNull(body.safety_stock)
      ]
    );

    const product = inserted.rows[0];

    const openingStock = Number(product.stock_quantity) || 0;
    if (product.track_inventory && openingStock > 0) {
      await db.query(
        `INSERT INTO inventory_logs (store_id, product_id, change_type, quantity_change, quantity_after, reference_type, notes)
         VALUES ($1, $2, 'initial_stock', $3, $3, 'manual', 'Opening stock recorded when the product was created')`,
        [user.storeId, product.id, openingStock]
      );
    }

    return NextResponse.json({ success: true, data: { product } }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, 'products.create');
  }
}

/**
 * A non-negative integer, or null when the field was not supplied.
 *
 * Distinguishing "not supplied" from zero matters for the reorder policy: a reorder point of 0 is a
 * decision ("never reorder this"), and a missing one means the platform should suggest.
 *
 * @param value - The raw body field.
 * @returns The integer, or null.
 */
function intOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Find a SKU that is free in this store, appending `-2`, `-3`, … until one is.
 *
 * The whole family is fetched in one query and the suffix chosen in memory, the same shape
 * `uniqueProductSlug` uses — a probe per candidate is a round trip per candidate.
 *
 * @param storeId - The tenant.
 * @param desired - The preferred SKU.
 * @returns A SKU free in this store at the time of the call.
 */
async function freeSku(storeId: string, desired: string): Promise<string> {
  const taken = await db.query<{ sku: string }>(
    `SELECT sku FROM products
      WHERE store_id = $1 AND (sku = $2 OR sku LIKE $2 || '-%')`,
    [storeId, desired]
  );
  const used = new Set(taken.rows.map((r) => r.sku));
  if (!used.has(desired)) return desired;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${desired}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${desired}-${Date.now().toString(36)}`;
}
