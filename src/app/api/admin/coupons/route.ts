import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

interface Discount {
  id: string;
  store_id: string;
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  minimum_order_amount: number;
  maximum_discount_amount?: number;
  start_date?: Date;
  end_date?: Date;
  max_uses?: number;
  max_uses_per_customer: number;
  current_uses: number;
  is_active: boolean;
  applies_to: 'entire_order' | 'specific_products' | 'specific_categories';
  applicable_product_ids?: string[];
  applicable_category_ids?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Coupon {
  id: string;
  store_id: string;
  discount_id: string;
  code: string;
  description: string;
  is_active: boolean;
  start_date?: Date;
  end_date?: Date;
  max_uses?: number;
  max_uses_per_customer: number;
  current_uses: number;
  created_at: Date;
  updated_at: Date;
  discount?: Discount;
}

/**
 * GET /api/admin/coupons
 * Get all coupons and discounts for the store
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const type = searchParams.get('type'); // 'coupons' or 'discounts'

    if (type === 'discounts') {
      // Get discounts only
      const discountsQuery = `
        SELECT 
          d.*,
          COUNT(c.id) as coupon_count
        FROM discounts d
        LEFT JOIN coupons c ON d.id = c.discount_id AND c.is_active = true
        WHERE d.store_id = $1
        GROUP BY d.id
        ORDER BY d.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const discountsResult = await db.query(discountsQuery, [user.storeId, limit, offset]);
      
      return NextResponse.json({
        success: true,
        data: {
          discounts: discountsResult.rows,
          total: discountsResult.rows.length
        }
      });
    } else {
      // Get coupons with their associated discounts
      const couponsQuery = `
        SELECT 
          c.*,
          d.name as discount_name,
          d.description as discount_description,
          d.discount_type,
          d.discount_value,
          d.minimum_order_amount,
          d.maximum_discount_amount
        FROM coupons c
        JOIN discounts d ON c.discount_id = d.id
        WHERE c.store_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const couponsResult = await db.query(couponsQuery, [user.storeId, limit, offset]);
      
      const coupons = couponsResult.rows.map(row => ({
        id: row.id,
        store_id: row.store_id,
        discount_id: row.discount_id,
        code: row.code,
        description: row.description,
        is_active: row.is_active,
        start_date: row.start_date,
        end_date: row.end_date,
        max_uses: row.max_uses,
        max_uses_per_customer: row.max_uses_per_customer,
        current_uses: row.current_uses,
        created_at: row.created_at,
        updated_at: row.updated_at,
        discount: {
          name: row.discount_name,
          description: row.discount_description,
          discount_type: row.discount_type,
          discount_value: row.discount_value,
          minimum_order_amount: row.minimum_order_amount,
          maximum_discount_amount: row.maximum_discount_amount
        }
      }));

      return NextResponse.json({
        success: true,
        data: {
          coupons,
          total: coupons.length
        }
      });
    }

  } catch (error) {
    console.error('Admin coupons GET error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/coupons
 * Create a new coupon or discount
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const body = await request.json();
    const { type, ...data } = body;

    if (type === 'discount') {
      // Create a new discount
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

      const discountQuery = `
        INSERT INTO discounts (
          store_id, name, description, discount_type, discount_value,
          minimum_order_amount, maximum_discount_amount, start_date, end_date,
          max_uses, max_uses_per_customer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await db.query(discountQuery, [
        user.storeId, name, description, discount_type, discount_value,
        minimum_order_amount, maximum_discount_amount, start_date, end_date,
        max_uses, max_uses_per_customer
      ]);

      return NextResponse.json({
        success: true,
        data: { discount: result.rows[0] }
      });

    } else if (type === 'coupon') {
      // Create a new coupon (now with targeting)
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

      // Check if coupon code already exists for this store
      const existingCoupon = await db.query(
        'SELECT id FROM coupons WHERE store_id = $1 AND code = $2',
        [user.storeId, code]
      );

      if (existingCoupon.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Coupon code already exists'
        }, { status: 409 });
      }

      const couponQuery = `
        INSERT INTO coupons (
          store_id, discount_id, code, description, start_date, end_date,
          max_uses, max_uses_per_customer, applies_to, applicable_product_ids,
          applicable_category_ids
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await db.query(couponQuery, [
        user.storeId, discount_id, code, description, start_date, end_date,
        max_uses, max_uses_per_customer, applies_to, applicable_product_ids,
        applicable_category_ids
      ]);

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
    console.error('Admin coupons POST error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/coupons
 * Delete a coupon or discount by ID (query parameter)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type'); // 'coupon' or 'discount'

    if (!id || !type) {
      return NextResponse.json({
        success: false,
        error: 'ID and type are required'
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