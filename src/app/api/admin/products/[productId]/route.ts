/**
 * One product: reading it, editing it, retiring it.
 *
 * The write half of this route was a ladder of twenty `if (body.x !== undefined)` branches, and the
 * defect it produced is the reason it is now a table. The edit form collects roughly thirty fields;
 * the ladder had branches for about half of them. Toggling "digital product", reordering the
 * gallery, choosing a featured image, setting dimensions, a barcode, a low-stock threshold — all
 * were sent, none were written, and the response said "Product updated successfully" regardless.
 * One branch wrote a `description` column that does not exist, so a client sending an obvious field
 * name got a 500 that discarded every other field in the same request.
 *
 * A declarative map fixes the class rather than the instances: a field cannot be accepted without
 * naming the column it lands in, and the response echoes what was applied so a client can tell when
 * something it sent was ignored.
 *
 * Editing a field also *locks* it, so the hourly ShipStation sync stops reverting the merchant's
 * work. See migration 032 for the ownership model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { recordSlugChange, uniqueProductSlug } from '@/lib/catalog/slug';

/**
 * A product id is a uuid. Anything else is a bad route, not a database error.
 *
 * Passing a non-uuid straight into `WHERE id = $1` made Postgres raise `invalid input syntax for
 * type uuid`, which surfaced as a 500 — and the catalogue's "Add product" button navigated to
 * `/admin/products/new`, so the most ordinary action on the page produced a stack trace.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How a request field is coerced before it reaches its column. */
type Coercion = 'text' | 'html' | 'number' | 'integer' | 'boolean' | 'array' | 'country';

/** One editable field: which column it writes, how it is coerced, and who owns it. */
interface FieldSpec {
  column: string;
  coerce: Coercion;
  /**
   * Whether editing this field takes it out of ShipStation's control. False for fields ShipStation
   * has no equivalent of — locking those would be noise, since nothing upstream can overwrite them.
   */
  locks?: boolean;
}

/**
 * Every field this route accepts.
 *
 * Adding a field to the edit form means adding it here. That is the point: the form and the writer
 * cannot drift, because there is only one list.
 */
const FIELDS: Record<string, FieldSpec> = {
  sku: { column: 'sku', coerce: 'text', locks: true },
  name: { column: 'name', coerce: 'text', locks: true },
  barcode: { column: 'barcode', coerce: 'text' },
  vendor: { column: 'vendor', coerce: 'text' },
  product_type: { column: 'product_type', coerce: 'text' },

  short_description: { column: 'short_description', coerce: 'text', locks: true },
  long_description: { column: 'long_description', coerce: 'text' },
  description_html: { column: 'description_html', coerce: 'html' },

  base_price: { column: 'base_price', coerce: 'number', locks: true },
  sale_price: { column: 'sale_price', coerce: 'number' },
  cost_price: { column: 'cost_price', coerce: 'number' },
  override_price: { column: 'override_price', coerce: 'number' },

  track_inventory: { column: 'track_inventory', coerce: 'boolean' },
  low_stock_threshold: { column: 'low_stock_threshold', coerce: 'integer' },
  allow_backorder: { column: 'allow_backorder', coerce: 'boolean' },
  reorder_point: { column: 'reorder_point', coerce: 'integer' },
  reorder_quantity: { column: 'reorder_quantity', coerce: 'integer' },
  lead_time_days: { column: 'lead_time_days', coerce: 'integer' },
  safety_stock: { column: 'safety_stock', coerce: 'integer' },

  weight: { column: 'weight', coerce: 'number' },
  weight_unit: { column: 'weight_unit', coerce: 'text' },
  length: { column: 'length', coerce: 'number' },
  width: { column: 'width', coerce: 'number' },
  height: { column: 'height', coerce: 'number' },
  dimension_unit: { column: 'dimension_unit', coerce: 'text' },
  requires_shipping: { column: 'requires_shipping', coerce: 'boolean' },
  shipping_class: { column: 'shipping_class', coerce: 'text' },
  is_digital: { column: 'is_digital', coerce: 'boolean' },
  hs_code: { column: 'hs_code', coerce: 'text' },
  country_of_origin: { column: 'country_of_origin', coerce: 'country' },

  category_id: { column: 'category_id', coerce: 'text', locks: true },
  supplier_id: { column: 'supplier_id', coerce: 'text' },
  tags: { column: 'tags', coerce: 'array' },

  featured_image_url: { column: 'featured_image_url', coerce: 'text', locks: true },
  gallery_images: { column: 'gallery_images', coerce: 'array' },

  meta_title: { column: 'meta_title', coerce: 'text' },
  meta_description: { column: 'meta_description', coerce: 'text' },

  is_featured: { column: 'is_featured', coerce: 'boolean' }
};

/** Aliases a client may send instead of the canonical name. */
const ALIASES: Record<string, string> = {
  /* The edit form has always sent `images` while the column is `gallery_images`. */
  images: 'gallery_images',
  /* `description` matched no column at all and 500'd the whole request. */
  description: 'long_description',
  inventory_quantity: '__stock',
  stock_quantity: '__stock',
  price: 'base_price',
  unit_cost: 'cost_price'
};

/**
 * Coerce a request value for its column, rejecting what cannot be stored.
 *
 * @param value - The raw value from the request body.
 * @param coerce - How this field is handled.
 * @param field - The field name, for error messages a merchant will read.
 * @returns The value to bind.
 * @throws AdminApiError when the value cannot be stored in this column.
 */
function coerceValue(value: unknown, coerce: Coercion, field: string): unknown {
  const label = field.replace(/_/g, ' ');

  if (value === null || value === '') {
    /* Arrays clear to empty rather than null: a `text[]` column with no tags is `{}`, and NULL
     * there makes every `array_length` check downstream have to special-case it. */
    return coerce === 'array' ? [] : null;
  }

  switch (coerce) {
    case 'number': {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new AdminApiError(`${label} must be a number of 0 or more`, 400);
      }
      return parsed;
    }
    case 'integer': {
      const parsed = Math.trunc(Number(value));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new AdminApiError(`${label} must be a whole number of 0 or more`, 400);
      }
      return parsed;
    }
    case 'boolean':
      return Boolean(value);
    case 'array':
      if (!Array.isArray(value)) {
        throw new AdminApiError(`${label} must be a list`, 400);
      }
      /* Passed as a JS array. An earlier version `JSON.stringify`d these into `text[]` columns,
       * which Postgres rejects as a malformed array literal. */
      return value.map((v) => String(v).trim()).filter(Boolean);
    case 'country':
      return String(value).trim().toUpperCase().slice(0, 2) || null;
    case 'html':
      return String(value);
    case 'text':
    default:
      return String(value).trim() || null;
  }
}

/**
 * GET /api/admin/products/[productId]
 *
 * A product with the figures the detail page shows: lifetime and recent sales, margin, stock
 * position, movement history, and what is still missing from the listing.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The product, or 404 when it is not in this store.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { productId } = await params;
    if (!UUID.test(productId)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    /*
     * Sales count everything not cancelled, keyed off the order's date.
     *
     * This query previously filtered `o.status = 'completed'` and took `MAX(oi.created_at)` — the
     * line item's insert timestamp — so a shipped order was not a sale and "last sold" was the
     * import date for every product in a seeded catalogue. The catalogue list was fixed for both
     * and this one was not, so the two screens disagreed about the same SKU.
     */
    const result = await db.query(
      `SELECT
         p.*,
         c.name AS category_name, c.slug AS category_slug,
         sup.name AS supplier_name,
         COALESCE(lv.on_hand, 0)     AS on_hand,
         COALESCE(lv.committed, 0)   AS committed,
         COALESCE(lv.available, 0)   AS available,
         COALESCE(s.units, 0)        AS units_sold,
         COALESCE(s.revenue, 0)      AS total_revenue,
         COALESCE(s.orders, 0)       AS total_orders,
         s.first_sale_date, s.last_sale_date, s.avg_sale_price,
         COALESCE(w.units_30d, 0)    AS units_30d,
         COALESCE(w.units_90d, 0)    AS units_90d,
         /* Margin against cost at the time of each sale, which order_items snapshots. Computing it
          * against today's cost price would restate history every time a price changed. */
         COALESCE(s.gross_profit, 0) AS gross_profit
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
       LEFT JOIN suppliers sup ON sup.id = p.supplier_id AND sup.store_id = p.store_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(on_hand), 0) AS on_hand,
                COALESCE(SUM(committed), 0) AS committed,
                COALESCE(SUM(available), 0) AS available
           FROM inventory_levels l WHERE l.product_id = p.id AND l.store_id = p.store_id
       ) lv ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(oi.quantity)::int AS units,
                SUM(oi.total_price)   AS revenue,
                COUNT(DISTINCT oi.order_id)::int AS orders,
                AVG(oi.unit_price)    AS avg_sale_price,
                MIN(o.created_at)     AS first_sale_date,
                MAX(o.created_at)     AS last_sale_date,
                SUM(oi.quantity * (oi.unit_price - COALESCE(oi.unit_cost, 0))) AS gross_profit
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
       ) s ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')::int AS units_30d,
                SUM(oi.quantity) FILTER (WHERE o.created_at >= NOW() - INTERVAL '90 days')::int AS units_90d
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id AND o.store_id = p.store_id AND o.status <> 'cancelled'
       ) w ON TRUE
       WHERE p.id = $1 AND p.store_id = $2`,
      [productId, user.storeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const product = result.rows[0];

    const movements = await db.query(
      `SELECT t.id, t.reason, t.delta, t.balance_after, t.note, t.created_at,
              l.name AS location_name,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS actor_name
         FROM inventory_transactions t
         JOIN inventory_locations l ON l.id = t.location_id
         LEFT JOIN users u ON u.id = t.actor_user_id
        WHERE t.store_id = $1 AND t.product_id = $2
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 20`,
      [user.storeId, productId]
    );

    /*
     * What is missing from this listing, as specific items rather than a score.
     *
     * The old version of this list omitted the most consequential check of all — a product with no
     * price. `base_price` is NOT NULL and the sync defaults it to 0 when ShipStation sends nothing,
     * and the cart treats zero as a deliberate giveaway, so an unpriced import became a live,
     * buyable £0.00 listing with nothing flagging it.
     */
    const needsAttention: string[] = [];
    if (!Number(product.base_price)) needsAttention.push('no_price');
    if (!product.featured_image_url) needsAttention.push('no_image');
    if (!product.long_description && !product.short_description) needsAttention.push('no_description');
    if (!product.category_id) needsAttention.push('no_category');
    if (product.cost_price === null) needsAttention.push('no_cost');
    if (!product.meta_title && !product.meta_description) needsAttention.push('no_seo');
    if (product.track_inventory && Number(product.available) <= 0) needsAttention.push('out_of_stock');
    if (
      product.cost_price !== null &&
      Number(product.sale_price ?? product.base_price) <= Number(product.cost_price)
    ) {
      needsAttention.push('negative_margin');
    }

    const effectivePrice = Number(product.sale_price ?? product.base_price) || 0;
    const cost = product.cost_price === null ? null : Number(product.cost_price);

    return NextResponse.json({
      success: true,
      data: {
        product: {
          ...product,
          base_price: Number(product.base_price) || 0,
          sale_price: product.sale_price === null ? null : Number(product.sale_price),
          cost_price: cost,
          effective_price: effectivePrice,
          margin_percent:
            cost !== null && effectivePrice > 0
              ? Math.round(((effectivePrice - cost) / effectivePrice) * 1000) / 10
              : null,
          needs_attention: needsAttention,
          /* Which fields the merchant owns, so the form can show it rather than leaving them to
           * discover it when the next sync reverts something. */
          field_locks: product.field_locks ?? [],
          sales_data: {
            total_sales: Number(product.units_sold) || 0,
            total_revenue: Number(product.total_revenue) || 0,
            total_orders: Number(product.total_orders) || 0,
            gross_profit: Number(product.gross_profit) || 0,
            avg_sale_price: Number(product.avg_sale_price) || 0,
            units_30d: Number(product.units_30d) || 0,
            units_90d: Number(product.units_90d) || 0,
            first_sale_date: product.first_sale_date,
            last_sale_date: product.last_sale_date
          },
          movements: movements.rows
        }
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'products.detail');
  }
}

/**
 * Apply a partial update to a product.
 *
 * Shared by PUT and PATCH, which differ only in what a client means by them — this route treats
 * both as "change the fields I sent". PATCH exists because the catalogue list has always used it
 * for the publish toggle against a route that had no PATCH handler, so the most common action on
 * the busiest screen returned 405.
 *
 * @param request - The incoming request.
 * @param productId - The product to change.
 * @returns The updated product and the list of fields actually applied.
 */
async function applyUpdate(request: NextRequest, productId: string): Promise<NextResponse> {
  const user = await requireAuth(request);
  if (!user.storeId) {
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
  }
  const storeId = user.storeId;

  if (!UUID.test(productId)) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  const existing = await db.query<{
    id: string;
    sku: string;
    slug: string;
    name: string;
    status: string;
    base_price: string;
    cost_price: string | null;
    field_locks: string[];
  }>(
    'SELECT id, sku, slug, name, status, base_price, cost_price, field_locks FROM products WHERE id = $1 AND store_id = $2',
    [productId, storeId]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
  }
  const before = existing.rows[0];

  const assignments: string[] = [];
  const values: unknown[] = [];
  const applied: string[] = [];
  const ignored: string[] = [];
  const locks: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(body)) {
    const key = ALIASES[rawKey] ?? rawKey;

    /* Stock is not editable here. It moves through the ledger with a reason attached, and a route
     * that quietly accepted a new quantity would put the projection ahead of the ledger. */
    if (key === '__stock') {
      ignored.push(rawKey);
      continue;
    }

    const spec = FIELDS[key];
    if (!spec) {
      /* Reported rather than silently dropped — being told a field was ignored is the difference
       * between noticing a mistake and shipping a broken form for a year. */
      if (!['id', 'store_id', 'created_at', 'updated_at', 'slug', 'status'].includes(key)) {
        ignored.push(rawKey);
      }
      continue;
    }

    values.push(coerceValue(rawValue, spec.coerce, key));
    assignments.push(`${spec.column} = $${values.length}`);
    applied.push(spec.column);
    if (spec.locks) locks.push(spec.column);
  }

  /* Lifecycle is its own field because it carries side effects: a publish stamps `published_at`,
   * and taking a product down must survive the next sync. */
  if (body.status !== undefined || body.is_active !== undefined) {
    const nextStatus =
      typeof body.status === 'string' && ['draft', 'active', 'archived'].includes(body.status)
        ? body.status
        : body.is_active
          ? 'active'
          : 'draft';

    if (nextStatus === 'active' && !Number(body.base_price ?? before.base_price)) {
      throw new AdminApiError('Set a price before publishing this product', 400);
    }

    values.push(nextStatus);
    assignments.push(`status = $${values.length}`);
    applied.push('status');
    locks.push('status');

    if (nextStatus === 'active' && before.status !== 'active') {
      assignments.push('published_at = COALESCE(published_at, NOW())');
    }
  }

  /* A slug change retires the old one so the storefront can redirect instead of 404ing every link
   * and search result that pointed at it. */
  let retiredSlug: string | null = null;
  if (typeof body.slug === 'string' && body.slug.trim()) {
    const slug = await uniqueProductSlug(storeId, body.slug, productId);
    if (slug !== before.slug) {
      values.push(slug);
      assignments.push(`slug = $${values.length}`);
      applied.push('slug');
      retiredSlug = before.slug;
    }
  }

  if (assignments.length === 0) {
    throw new AdminApiError(
      ignored.length > 0
        ? `Nothing was updated. This product has no ${ignored.join(', ')} field.`
        : 'Nothing to update',
      400
    );
  }

  /* A referenced category or supplier must be in this store. The composite foreign keys from
   * migration 026 would refuse a cross-tenant one anyway; checking here turns a constraint
   * violation into a sentence a merchant can act on. */
  for (const [field, table] of [
    ['category_id', 'categories'],
    ['supplier_id', 'suppliers']
  ] as const) {
    const value = body[field];
    if (typeof value === 'string' && value) {
      const owned = await db.query(`SELECT id FROM ${table} WHERE id = $1 AND store_id = $2`, [
        value,
        storeId
      ]);
      if (owned.rows.length === 0) {
        throw new AdminApiError(`That ${field.replace('_id', '')} is not in this store`, 400);
      }
    }
  }

  const updated = await db.transaction(async (tx) => {
    values.push(productId, storeId);
    const result = await tx.query(
      `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length - 1} AND store_id = $${values.length}
        RETURNING *`,
      values
    );

    /*
     * Editing a field claims it from ShipStation.
     *
     * Without this the sync overwrites `name`, `short_description`, `base_price`,
     * `featured_image_url` and `category_id` on its next pass — so a merchant's edits survive
     * until the top of the hour and then quietly revert. See migration 032.
     */
    if (locks.length > 0) {
      await tx.query('SELECT lock_product_fields($1, $2, $3::text[])', [storeId, productId, locks]);
    }

    if (retiredSlug) {
      await recordSlugChange(storeId, productId, retiredSlug, result.rows[0].slug);
    }

    return result.rows[0];
  });

  return NextResponse.json({
    success: true,
    data: {
      product: updated,
      /* Both lists are returned so a client can verify what happened rather than trusting a
       * blanket success message over a silent drop. */
      applied,
      ignored,
      locked: locks,
      message:
        ignored.length > 0
          ? `Saved. ${ignored.length} field${ignored.length === 1 ? '' : 's'} could not be stored: ${ignored.join(', ')}.`
          : 'Saved.'
    }
  });
}

/**
 * PUT /api/admin/products/[productId]
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The updated product.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    return await applyUpdate(request, productId);
  } catch (error) {
    return adminErrorResponse(error, 'products.update');
  }
}

/**
 * PATCH /api/admin/products/[productId]
 *
 * The catalogue list's publish toggle has always used PATCH against a route that exported only
 * GET, PUT and DELETE, so every list/unlist from the grid returned 405.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns The updated product.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    return await applyUpdate(request, productId);
  } catch (error) {
    return adminErrorResponse(error, 'products.patch');
  }
}

/**
 * DELETE /api/admin/products/[productId]
 *
 * Archive a product, or delete it outright when nothing references it.
 *
 * A product that appears on an order is never deleted. The old route refused those with a 400 and
 * told the merchant to deactivate instead, then offered a `?force=true` escape hatch that was
 * unreachable — the guard returned before the check that read it. Forcing it would have been worse
 * than the dead code: `order_items.product_id` has no `ON DELETE` clause, so the delete either
 * fails or takes the record of what a customer bought with it.
 *
 * Archiving is the right answer and is now what happens, rather than an instruction the merchant
 * has to follow by hand.
 *
 * @param request - The incoming request.
 * @param context - Route params carrying the product id.
 * @returns What happened, and why, in terms a merchant can act on.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { productId } = await params;
    if (!UUID.test(productId)) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const outcome = await db.transaction(async (tx) => {
      const existing = await tx.query<{ id: string; name: string; sku: string; stock_quantity: number }>(
        'SELECT id, name, sku, stock_quantity FROM products WHERE id = $1 AND store_id = $2 FOR UPDATE',
        [productId, user.storeId]
      );
      if (existing.rows.length === 0) return null;
      const product = existing.rows[0];

      const orders = await tx.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = $1 AND o.store_id = $2`,
        [productId, user.storeId]
      );
      const orderCount = Number.parseInt(orders.rows[0]?.count ?? '0', 10);

      if (orderCount > 0) {
        await tx.query(
          `UPDATE products SET status = 'archived', updated_at = NOW()
            WHERE id = $1 AND store_id = $2`,
          [productId, user.storeId]
        );
        return { product, orderCount, archived: true };
      }

      /* No order history: a genuine delete. The ledger rows cascade with it, which migration 031
       * permits precisely because a movement record for a product that no longer exists audits
       * nothing. */
      await tx.query('DELETE FROM inventory_logs WHERE store_id = $1 AND product_id = $2', [
        user.storeId,
        productId
      ]);
      await tx.query('DELETE FROM products WHERE id = $1 AND store_id = $2', [
        productId,
        user.storeId
      ]);
      return { product, orderCount, archived: false };
    });

    if (!outcome) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        product: { id: outcome.product.id, name: outcome.product.name, sku: outcome.product.sku },
        archived: outcome.archived,
        order_count: outcome.orderCount,
        message: outcome.archived
          ? `${outcome.product.name} appears on ${outcome.orderCount} order${
              outcome.orderCount === 1 ? '' : 's'
            }, so it has been archived rather than deleted. It is off the storefront and its order history is intact.`
          : `${outcome.product.name} has been deleted.`
      }
    });
  } catch (error) {
    return adminErrorResponse(error, 'products.delete');
  }
}
