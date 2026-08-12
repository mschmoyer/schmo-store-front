import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/*
 * Both handlers previously carried a `type: 'discount'` branch that read and
 * wrote a `discounts` table which no migration in `database/migrations/` ever
 * creates, and a `type: 'coupon'` branch that set `coupons.discount_id`, a
 * column `coupons` does not have. Both were left over from an abandoned
 * refactor. See `../route.ts` for the full account.
 *
 * `coupons` carries its discount inline and is written directly.
 */

/**
 * GET /api/admin/coupons/[id]
 *
 * One coupon, with its redemption history. Added because the editor had no way
 * to load a coupon it was about to edit.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @param context - Route params carrying the coupon id.
 * @returns `{ success, data: { coupon, redemptions } }`.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;

    const result = await db.query('SELECT * FROM coupons WHERE id = $1 AND store_id = $2', [
      id,
      user.storeId,
    ]);

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const redemptions = await db.query(
      `SELECT cu.customer_email, cu.discount_amount, cu.used_at, o.order_number
         FROM coupon_usage cu
         LEFT JOIN orders o ON o.id = cu.order_id
        WHERE cu.coupon_id = $1
        ORDER BY cu.used_at DESC
        LIMIT 50`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: { coupon: result.rows[0], redemptions: redemptions.rows },
    });
  } catch (error) {
    console.error('Admin coupon GET error:', error);

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
 * PUT /api/admin/coupons/[id]
 *
 * Update a coupon. Only the fields present in the body are written, so a
 * partial update (flipping `is_active` from the list, say) does not blank
 * everything else.
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @param context - Route params carrying the coupon id.
 * @returns `{ success, data: { coupon } }`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();

    const UPDATABLE = [
      'code',
      'name',
      'description',
      'discount_type',
      'discount_value',
      'minimum_order_amount',
      'maximum_discount_amount',
      'usage_limit',
      'usage_limit_per_customer',
      'valid_from',
      'valid_until',
      'is_active',
      'applies_to',
      'applicable_product_ids',
      'applicable_category_ids',
    ] as const;

    const assignments: string[] = [];
    const values: unknown[] = [id, user.storeId];
    let i = 3;

    for (const field of UPDATABLE) {
      if (!(field in body)) continue;
      assignments.push(`${field} = $${i}`);
      values.push(field === 'code' ? String(body[field]).trim().toUpperCase() : body[field]);
      i++;
    }

    if (assignments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No updatable fields supplied' },
        { status: 400 }
      );
    }

    if (typeof body.code === 'string') {
      const clash = await db.query(
        'SELECT id FROM coupons WHERE store_id = $1 AND code = $2 AND id <> $3',
        [user.storeId, body.code.trim().toUpperCase(), id]
      );
      if (clash.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: 'Coupon code already exists' },
          { status: 409 }
        );
      }
    }

    const result = await db.query(
      `UPDATE coupons
          SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND store_id = $2
        RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { coupon: result.rows[0] } });
  } catch (error) {
    console.error('Admin coupon PUT error:', error);

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
 * DELETE /api/admin/coupons/[id]
 *
 * @param request - Next.js request; requires an authenticated admin session.
 * @param context - Route params carrying the coupon id.
 * @returns `{ success, message }`.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const { id } = await params;

    const result = await db.query(
      'DELETE FROM coupons WHERE id = $1 AND store_id = $2 RETURNING id',
      [id, user.storeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Admin coupon DELETE error:', error);

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
