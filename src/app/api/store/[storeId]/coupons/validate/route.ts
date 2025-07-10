import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  discount?: {
    type: 'percentage' | 'fixed_amount';
    value: number;
    description: string;
    minimum_order_amount: number;
    maximum_discount_amount?: number;
  };
  error?: string;
  discountAmount?: number;
}

/**
 * POST /api/store/[storeId]/coupons/validate
 * Validate a coupon code and calculate discount
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    await db.initialize();
    const { storeId } = await params;
    const body = await request.json();
    const { couponCode, cartItems, orderTotal } = body;
    
    // Type the cartItems properly
    const typedCartItems = cartItems as CartItem[];

    if (!couponCode || !cartItems || !Array.isArray(cartItems) || orderTotal === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: couponCode, cartItems (array), orderTotal'
      }, { status: 400 });
    }

    // Get coupon with its associated discount (targeting now on coupon)
    const couponQuery = `
      SELECT 
        c.*,
        d.name as discount_name,
        d.description as discount_description,
        d.discount_type,
        d.discount_value,
        d.minimum_order_amount,
        d.maximum_discount_amount,
        d.is_active as discount_active,
        d.start_date as discount_start_date,
        d.end_date as discount_end_date,
        d.max_uses as discount_max_uses,
        d.current_uses as discount_current_uses
      FROM coupons c
      JOIN discounts d ON c.discount_id = d.id
      WHERE c.store_id = $1 AND UPPER(c.code) = UPPER($2) AND c.is_active = true
    `;

    const couponResult = await db.query(couponQuery, [storeId, couponCode]);

    if (couponResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'Invalid coupon code'
        } as CouponValidationResult
      });
    }

    const coupon = couponResult.rows[0];

    // Check if discount is active
    if (!coupon.discount_active) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon is no longer active'
        } as CouponValidationResult
      });
    }

    // Check date validity
    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon is not yet active'
        } as CouponValidationResult
      });
    }

    if (coupon.end_date && new Date(coupon.end_date) < now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon has expired'
        } as CouponValidationResult
      });
    }

    if (coupon.discount_start_date && new Date(coupon.discount_start_date) > now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This discount is not yet active'
        } as CouponValidationResult
      });
    }

    if (coupon.discount_end_date && new Date(coupon.discount_end_date) < now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This discount has expired'
        } as CouponValidationResult
      });
    }

    // Check usage limits
    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon has reached its usage limit'
        } as CouponValidationResult
      });
    }

    if (coupon.discount_max_uses && coupon.discount_current_uses >= coupon.discount_max_uses) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This discount has reached its usage limit'
        } as CouponValidationResult
      });
    }

    // Check minimum order amount
    if (orderTotal < coupon.minimum_order_amount) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: `Minimum order amount is $${coupon.minimum_order_amount.toFixed(2)}`
        } as CouponValidationResult
      });
    }

    // Check targeting criteria and calculate eligible total
    let eligibleTotal = 0;
    const appliesTo = coupon.applies_to || 'entire_order';

    if (appliesTo === 'entire_order') {
      eligibleTotal = orderTotal;
    } else if (appliesTo === 'specific_products') {
      // Check if cart has any products matching the coupon's product targeting
      const applicableProductIds = coupon.applicable_product_ids || [];
      
      if (applicableProductIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            valid: false,
            error: 'This coupon is not configured for any products'
          } as CouponValidationResult
        });
      }

      // Calculate total for matching products
      for (const item of typedCartItems) {
        if (applicableProductIds.includes(item.product_id)) {
          eligibleTotal += item.price * item.quantity;
        }
      }

      if (eligibleTotal === 0) {
        return NextResponse.json({
          success: true,
          data: {
            valid: false,
            error: 'This coupon does not apply to any items in your cart'
          } as CouponValidationResult
        });
      }
    } else if (appliesTo === 'specific_categories') {
      // Check if cart has any products from matching categories
      const applicableCategoryIds = coupon.applicable_category_ids || [];
      
      if (applicableCategoryIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            valid: false,
            error: 'This coupon is not configured for any categories'
          } as CouponValidationResult
        });
      }

      // Get category IDs for cart items
      const productIds = typedCartItems.map(item => item.product_id);
      const productsQuery = `
        SELECT id, category_id 
        FROM products 
        WHERE id = ANY($1) AND store_id = $2
      `;
      
      const productsResult = await db.query(productsQuery, [productIds, storeId]);
      const productCategoryMap = new Map(
        productsResult.rows.map(row => [row.id, row.category_id])
      );

      // Calculate total for matching categories
      for (const item of typedCartItems) {
        const categoryId = productCategoryMap.get(item.product_id);
        if (categoryId && applicableCategoryIds.includes(categoryId)) {
          eligibleTotal += item.price * item.quantity;
        }
      }

      if (eligibleTotal === 0) {
        return NextResponse.json({
          success: true,
          data: {
            valid: false,
            error: 'This coupon does not apply to any items in your cart'
          } as CouponValidationResult
        });
      }
    }

    // Calculate discount amount based on eligible total
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (eligibleTotal * coupon.discount_value) / 100;
      
      // Apply maximum discount limit if set
      if (coupon.maximum_discount_amount && discountAmount > coupon.maximum_discount_amount) {
        discountAmount = coupon.maximum_discount_amount;
      }
    } else if (coupon.discount_type === 'fixed_amount') {
      discountAmount = Math.min(coupon.discount_value, eligibleTotal);
    }

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        couponId: coupon.id,
        discount: {
          type: coupon.discount_type,
          value: coupon.discount_value,
          description: coupon.discount_description || coupon.description,
          minimum_order_amount: coupon.minimum_order_amount,
          maximum_discount_amount: coupon.maximum_discount_amount
        },
        discountAmount
      } as CouponValidationResult
    });

  } catch (error) {
    console.error('Coupon validation error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}