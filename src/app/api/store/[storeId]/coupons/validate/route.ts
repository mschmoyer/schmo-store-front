import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { CouponRow, ProductRow } from '@/lib/types/db-rows';

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

    // Look up the coupon. Discount configuration lives on the coupon row itself.
    const couponQuery = `
      SELECT *
      FROM coupons c
      WHERE c.store_id = $1 AND UPPER(c.code) = UPPER($2) AND c.is_active = true
    `;

    const couponResult = await db.query<CouponRow>(couponQuery, [storeId, couponCode]);

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

    // Check date validity
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon is not yet active'
        } as CouponValidationResult
      });
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon has expired'
        } as CouponValidationResult
      });
    }

    // Check usage limits
    if (coupon.usage_limit !== null && (coupon.used_count ?? 0) >= coupon.usage_limit) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: 'This coupon has reached its usage limit'
        } as CouponValidationResult
      });
    }

    // Check minimum order amount. `numeric` columns arrive from pg as strings.
    const minimumOrderAmount = coupon.minimum_order_amount === null
      ? 0
      : Number(coupon.minimum_order_amount);
    const maximumDiscountAmount = coupon.maximum_discount_amount === null
      ? undefined
      : Number(coupon.maximum_discount_amount);
    const discountValue = Number(coupon.discount_value);

    if (orderTotal < minimumOrderAmount) {
      return NextResponse.json({
        success: true,
        data: {
          valid: false,
          error: `Minimum order amount is $${minimumOrderAmount.toFixed(2)}`
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
      
      const productsResult = await db.query<Pick<ProductRow, 'id' | 'category_id'>>(
        productsQuery,
        [productIds, storeId]
      );
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
      discountAmount = (eligibleTotal * discountValue) / 100;

      // Apply maximum discount limit if set
      if (maximumDiscountAmount !== undefined && discountAmount > maximumDiscountAmount) {
        discountAmount = maximumDiscountAmount;
      }
    } else if (coupon.discount_type === 'fixed_amount') {
      discountAmount = Math.min(discountValue, eligibleTotal);
    }

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        couponId: coupon.id,
        discount: {
          type: coupon.discount_type === 'percentage' ? 'percentage' : 'fixed_amount',
          value: discountValue,
          description: coupon.description ?? coupon.name,
          minimum_order_amount: minimumOrderAmount,
          maximum_discount_amount: maximumDiscountAmount
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