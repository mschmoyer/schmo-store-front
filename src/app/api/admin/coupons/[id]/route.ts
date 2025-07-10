import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/coupons/[id]
 * Update a coupon or discount
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, ...data } = body;

    if (type === 'discount') {
      // Update discount (no longer has targeting fields)
      const {
        name,
        description,
        discount_type,
        discount_value,
        minimum_order_amount = 0,
        maximum_discount_amount,
        start_date,
        end_date,
        max_uses,
        max_uses_per_customer = 1
      } = data;

      const updateQuery = `
        UPDATE discounts SET
          name = $2,
          description = $3,
          discount_type = $4,
          discount_value = $5,
          minimum_order_amount = $6,
          maximum_discount_amount = $7,
          start_date = $8,
          end_date = $9,
          max_uses = $10,
          max_uses_per_customer = $11,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND store_id = $12
        RETURNING *
      `;

      const result = await db.query(updateQuery, [
        id, name, description, discount_type, discount_value,
        minimum_order_amount, maximum_discount_amount, start_date, end_date,
        max_uses, max_uses_per_customer, user.storeId
      ]);

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Discount not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: { discount: result.rows[0] }
      });

    } else if (type === 'coupon') {
      // Update coupon (now with targeting)
      const {
        discount_id,
        code,
        description,
        start_date,
        end_date,
        max_uses,
        max_uses_per_customer = 1,
        applies_to = 'entire_order',
        applicable_product_ids,
        applicable_category_ids
      } = data;

      // Check if coupon code already exists for this store (excluding current coupon)
      const existingCoupon = await db.query(
        'SELECT id FROM coupons WHERE store_id = $1 AND code = $2 AND id != $3',
        [user.storeId, code, id]
      );

      if (existingCoupon.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Coupon code already exists'
        }, { status: 409 });
      }

      const updateQuery = `
        UPDATE coupons SET
          discount_id = $2,
          code = $3,
          description = $4,
          start_date = $5,
          end_date = $6,
          max_uses = $7,
          max_uses_per_customer = $8,
          applies_to = $9,
          applicable_product_ids = $10,
          applicable_category_ids = $11,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND store_id = $12
        RETURNING *
      `;

      const result = await db.query(updateQuery, [
        id, discount_id, code, description, start_date, end_date,
        max_uses, max_uses_per_customer, applies_to, applicable_product_ids,
        applicable_category_ids, user.storeId
      ]);

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Coupon not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: { coupon: result.rows[0] }
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid type. Must be "discount" or "coupon"'
    }, { status: 400 });

  } catch (error) {
    console.error('Admin coupons PUT error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/coupons/[id]
 * Delete a coupon or discount by ID
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'coupon' or 'discount'

    if (!type) {
      return NextResponse.json({
        success: false,
        error: 'Type is required'
      }, { status: 400 });
    }

    if (type === 'coupon') {
      // Delete coupon
      const result = await db.query(
        'DELETE FROM coupons WHERE id = $1 AND store_id = $2 RETURNING *',
        [id, user.storeId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Coupon not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: 'Coupon deleted successfully'
      });
    } else if (type === 'discount') {
      // Check if discount has associated coupons
      const couponsCheck = await db.query(
        'SELECT COUNT(*) as count FROM coupons WHERE discount_id = $1',
        [id]
      );

      if (parseInt(couponsCheck.rows[0].count) > 0) {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete discount with associated coupons. Delete the coupons first.'
        }, { status: 400 });
      }

      // Delete discount
      const result = await db.query(
        'DELETE FROM discounts WHERE id = $1 AND store_id = $2 RETURNING *',
        [id, user.storeId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Discount not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: 'Discount deleted successfully'
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid type. Must be "coupon" or "discount"'
    }, { status: 400 });

  } catch (error) {
    console.error('Admin coupons DELETE error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}