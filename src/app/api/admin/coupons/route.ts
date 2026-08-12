import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

/**
 * A coupon, exactly as the `coupons` table stores it.
 *
 * There is no `Discount` type here any more, and no nested `discount` object
 * on the response.
 *
 * Someone began splitting coupons into a `discounts` parent and a `coupons`
 * child, wrote two migrations for it into `src/lib/database/migrations/` — a
 * directory the migration runner has never read; it reads
 * `database/migrations/` — and then stopped. What shipped was an API querying
 * `JOIN discounts d ON c.discount_id = d.id` against a database where no
 * `discounts` table is ever created and `coupons` has no `discount_id` column.
 * `GET /api/admin/coupons` returned
 * `relation "discounts" does not exist` with a 500, the UI caught it and
 * rendered "No coupon codes yet", and the merchant was told their two live
 * storefront promotions did not exist. They would have created duplicates.
 *
 * The refactor is abandoned rather than completed: `coupons` already carries
 * `discount_type`, `discount_value`, `minimum_order_amount`,
 * `maximum_discount_amount`, `usage_limit`, `valid_from`/`valid_until` and the
 * targeting arrays inline. It is self-sufficient, and a second table would buy
 * nothing a single-store merchant needs.
 */
export interface Coupon {
  id: string;
  store_id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  minimum_order_amount: number | null;
  maximum_discount_amount: number | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  used_count: number;
  valid_from: Date | null;
  valid_until: Date | null;
  is_active: boolean;
  applies_to: 'entire_order' | 'specific_products' | 'specific_categories';
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/** The projection the list and the editor both read. */
const COUPON_SELECT = `
  SELECT
    c.id,
    c.store_id,
    c.code,
    c.name,
    c.description,
    c.discount_type,
    c.discount_value,
    c.minimum_order_amount,
    c.maximum_discount_amount,
    c.usage_limit,
    c.usage_limit_per_customer,
    c.used_count,
    c.valid_from,
    c.valid_until,
    c.is_active,
    c.applies_to,
    c.applicable_product_ids,
    c.applicable_category_ids,
    c.created_at,
    c.updated_at,
    -- Redemptions counted from the ledger rather than trusting the
    -- denormalised counter, and the money actually given away.
    COALESCE(u.redemptions, 0)     AS redemption_count,
    COALESCE(u.discount_total, 0)  AS discount_total
  FROM coupons c
  LEFT JOIN (
    SELECT coupon_id,
           COUNT(*)              AS redemptions,
           SUM(discount_amount)  AS discount_total
      FROM coupon_usage
     GROUP BY coupon_id
  ) u ON u.coupon_id = c.id
`;

/**
 * GET /api/admin/coupons
 *
 * List the store's coupons.
 *
 * The `?type=discounts` branch is gone along with the table it queried.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @returns `{ success, data: { coupons, total, stats } }`.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    const [couponsResult, statsResult] = await Promise.all([
      db.query(
        `${COUPON_SELECT}
         WHERE c.store_id = $1
         ORDER BY c.is_active DESC, c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [user.storeId, limit, offset]
      ),

      /*
       * Header stats. Verified:
       *   SELECT code, is_active, valid_until FROM coupons
       *    WHERE store_id = '650e8400-…0001';
       *   -> FREESHIP (fixed_amount 9.99, active, valid to 2026-10-11)
       *      WELCOME10 (percentage 10.00, active, valid to 2026-10-11)
       * The page reported "Active coupons 0" for these two.
       *
       * "Active" means the merchant's switch is on AND the coupon is inside its
       * validity window — a coupon that expired last month is not active, and
       * showing it as such is how a merchant concludes a promotion is still
       * running when it stopped.
       */
      db.query<{
        total: string;
        active: string;
        expired: string;
        redemptions: string;
        discount_total: string;
      }>(
        `SELECT
           COUNT(*)                                                        AS total,
           COUNT(*) FILTER (
             WHERE c.is_active
               AND (c.valid_from IS NULL OR c.valid_from <= CURRENT_TIMESTAMP)
               AND (c.valid_until IS NULL OR c.valid_until >= CURRENT_TIMESTAMP)
           )                                                               AS active,
           COUNT(*) FILTER (WHERE c.valid_until IS NOT NULL AND c.valid_until < CURRENT_TIMESTAMP)
                                                                           AS expired,
           COALESCE((SELECT COUNT(*) FROM coupon_usage cu WHERE cu.store_id = $1), 0)
                                                                           AS redemptions,
           COALESCE((SELECT SUM(discount_amount) FROM coupon_usage cu WHERE cu.store_id = $1), 0)
                                                                           AS discount_total
         FROM coupons c
         WHERE c.store_id = $1`,
        [user.storeId]
      ),
    ]);

    const s = statsResult.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        coupons: couponsResult.rows,
        total: couponsResult.rows.length,
        stats: {
          total: parseInt(s?.total || '0', 10),
          active: parseInt(s?.active || '0', 10),
          expired: parseInt(s?.expired || '0', 10),
          redemptions: parseInt(s?.redemptions || '0', 10),
          discountTotal: parseFloat(s?.discount_total || '0'),
        },
      },
    });
  } catch (error) {
    console.error('Admin coupons GET error:', error);

    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/coupons
 *
 * Create a coupon. The `type: 'discount'` branch, which inserted into a table
 * that does not exist, is removed; `type: 'coupon'` is accepted and ignored so
 * an older client does not break.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @returns `{ success, data: { coupon } }`.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      code,
      name,
      description = null,
      discount_type,
      discount_value,
      minimum_order_amount = null,
      maximum_discount_amount = null,
      usage_limit = null,
      usage_limit_per_customer = 1,
      valid_from = null,
      valid_until = null,
      is_active = true,
      applies_to = 'entire_order',
      applicable_product_ids = null,
      applicable_category_ids = null,
    } = body;

    if (!code || !discount_type || discount_value === undefined || discount_value === null) {
      return NextResponse.json(
        { success: false, error: 'code, discount_type and discount_value are required' },
        { status: 400 }
      );
    }

    if (!['percentage', 'fixed_amount'].includes(discount_type)) {
      return NextResponse.json(
        { success: false, error: 'discount_type must be "percentage" or "fixed_amount"' },
        { status: 400 }
      );
    }

    const normalisedCode = String(code).trim().toUpperCase();

    const existing = await db.query('SELECT id FROM coupons WHERE store_id = $1 AND code = $2', [
      user.storeId,
      normalisedCode,
    ]);

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Coupon code already exists' },
        { status: 409 }
      );
    }

    const result = await db.query(
      `INSERT INTO coupons (
         store_id, code, name, description, discount_type, discount_value,
         minimum_order_amount, maximum_discount_amount, usage_limit,
         usage_limit_per_customer, valid_from, valid_until, is_active,
         applies_to, applicable_product_ids, applicable_category_ids
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        user.storeId,
        normalisedCode,
        name || normalisedCode,
        description,
        discount_type,
        discount_value,
        minimum_order_amount,
        maximum_discount_amount,
        usage_limit,
        usage_limit_per_customer,
        valid_from,
        valid_until,
        is_active,
        applies_to,
        applicable_product_ids,
        applicable_category_ids,
      ]
    );

    return NextResponse.json({ success: true, data: { coupon: result.rows[0] } }, { status: 201 });
  } catch (error) {
    console.error('Admin coupons POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/coupons?id=…
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @returns `{ success, message }`.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    const result = await db.query(
      'DELETE FROM coupons WHERE id = $1 AND store_id = $2 RETURNING id',
      [id, user.storeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Admin coupons DELETE error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
