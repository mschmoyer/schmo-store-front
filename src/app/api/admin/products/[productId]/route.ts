import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { ProductRepository } from '@/lib/database/repositories/product';
import { UpdateProductInput } from '@/types/database';

const productRepository = new ProductRepository();

/**
 * GET /api/admin/products/[productId]
 * Get detailed product information including all editable fields
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { productId } = await params;
    
    // Get the product with validation that it belongs to the user's store
    const product = await productRepository.findById(productId);
    if (!product || product.store_id !== user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // Get enhanced product data with sales analytics, inventory history, and related data
    const [salesData, inventoryHistory, productAnalytics, categoryInfo] = await Promise.all([
      // Sales data
      db.query(`
        SELECT 
          COALESCE(SUM(oi.quantity), 0) as total_sales,
          COALESCE(SUM(oi.total_price), 0) as total_revenue,
          COUNT(DISTINCT oi.order_id) as total_orders,
          MAX(oi.created_at) as last_sale_date,
          AVG(oi.unit_price) as avg_sale_price,
          MIN(oi.created_at) as first_sale_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.product_id = $1 AND o.store_id = $2 AND o.status = 'completed'
      `, [productId, user.storeId]),

      // Inventory history
      db.query(`
        SELECT 
          change_type,
          quantity_change,
          quantity_after,
          reference_type,
          reference_id,
          notes,
          created_at
        FROM inventory_logs
        WHERE product_id = $1 AND store_id = $2
        ORDER BY created_at DESC
        LIMIT 20
      `, [productId, user.storeId]),

      // Product analytics (views, cart adds, etc.)
      productRepository.getProductAnalytics(productId, user.storeId, 30),

      // Category information if exists
      product.category_id ? db.query(`
        SELECT name, slug, description
        FROM categories
        WHERE id = $1 AND store_id = $2
      `, [product.category_id, user.storeId]) : null
    ]);

    // Get related products
    const relatedProducts = await productRepository.getRelatedProducts(user.storeId, productId, 6);

    // Calculate stock status
    const stockStatus = product.track_inventory ? 
      (product.stock_quantity > product.low_stock_threshold ? 'in_stock' : 
       product.stock_quantity > 0 ? 'low_stock' : 'out_of_stock') : 
      'not_tracked';

    // Check if product needs attention (low stock, no sales, etc.)
    const needsAttention = [];
    if (product.track_inventory && product.stock_quantity <= product.low_stock_threshold) {
      needsAttention.push('low_stock');
    }
    if (!product.is_active) {
      needsAttention.push('inactive');
    }
    if (!product.featured_image_url) {
      needsAttention.push('no_image');
    }
    if (!product.short_description) {
      needsAttention.push('no_description');
    }

    const sales = salesData.rows[0];
    const enhancedProduct = {
      ...product,
      stock_status: stockStatus,
      needs_attention: needsAttention,
      sales_data: {
        total_sales: parseInt(sales.total_sales || '0'),
        total_revenue: parseFloat(sales.total_revenue || '0'),
        total_orders: parseInt(sales.total_orders || '0'),
        avg_sale_price: parseFloat(sales.avg_sale_price || '0'),
        first_sale_date: sales.first_sale_date,
        last_sale_date: sales.last_sale_date
      },
      analytics: productAnalytics,
      inventory_history: inventoryHistory.rows,
      category_info: categoryInfo?.rows[0] || null,
      related_products: relatedProducts.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        base_price: p.base_price,
        featured_image_url: p.featured_image_url,
        stock_quantity: p.stock_quantity
      }))
    };

    return NextResponse.json({
      success: true,
      data: {
        product: enhancedProduct
      }
    });

  } catch (error) {
    console.error('Admin product GET error:', error);
    
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
 * PUT /api/admin/products/[productId]
 * Update product information (title, description, listing status, etc.)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { productId } = await params;
    const body = await request.json();
    
    // Verify product exists and belongs to user's store
    const existingProduct = await productRepository.findById(productId);
    if (!existingProduct || existingProduct.store_id !== user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // If updating SKU, check for conflicts
    if (body.sku && body.sku !== existingProduct.sku) {
      const skuConflict = await productRepository.findBySku(body.sku, user.storeId);
      if (skuConflict) {
        return NextResponse.json({
          success: false,
          error: 'A product with this SKU already exists'
        }, { status: 409 });
      }
    }

    // If updating slug, check for conflicts
    if (body.slug && body.slug !== existingProduct.slug) {
      const slugConflict = await productRepository.findBySlug(body.slug, user.storeId);
      if (slugConflict) {
        return NextResponse.json({
          success: false,
          error: 'A product with this slug already exists'
        }, { status: 409 });
      }
    }

    // Prepare update data, only including fields that are provided
    const updateData: UpdateProductInput = {
      id: productId,
      store_id: user.storeId // Required for the interface
    };

    // Only add fields that are provided in the request
    if (body.sku !== undefined) updateData.sku = body.sku;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.short_description !== undefined) updateData.short_description = body.short_description;
    if (body.long_description !== undefined) updateData.long_description = body.long_description;
    if (body.description_html !== undefined) updateData.description_html = body.description_html;
    if (body.base_price !== undefined) updateData.base_price = parseFloat(body.base_price);
    if (body.sale_price !== undefined) updateData.sale_price = body.sale_price ? parseFloat(body.sale_price) : null;
    if (body.cost_price !== undefined) updateData.cost_price = body.cost_price ? parseFloat(body.cost_price) : null;
    if (body.track_inventory !== undefined) updateData.track_inventory = body.track_inventory;
    if (body.stock_quantity !== undefined) updateData.stock_quantity = parseInt(body.stock_quantity);
    if (body.low_stock_threshold !== undefined) updateData.low_stock_threshold = parseInt(body.low_stock_threshold);
    if (body.allow_backorder !== undefined) updateData.allow_backorder = body.allow_backorder;
    if (body.weight !== undefined) updateData.weight = body.weight ? parseFloat(body.weight) : null;
    if (body.weight_unit !== undefined) updateData.weight_unit = body.weight_unit;
    if (body.length !== undefined) updateData.length = body.length ? parseFloat(body.length) : null;
    if (body.width !== undefined) updateData.width = body.width ? parseFloat(body.width) : null;
    if (body.height !== undefined) updateData.height = body.height ? parseFloat(body.height) : null;
    if (body.dimension_unit !== undefined) updateData.dimension_unit = body.dimension_unit;
    if (body.category_id !== undefined) updateData.category_id = body.category_id;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.featured_image_url !== undefined) updateData.featured_image_url = body.featured_image_url;
    if (body.gallery_images !== undefined) updateData.gallery_images = body.gallery_images;
    if (body.meta_title !== undefined) updateData.meta_title = body.meta_title;
    if (body.meta_description !== undefined) updateData.meta_description = body.meta_description;
    if (body.requires_shipping !== undefined) updateData.requires_shipping = body.requires_shipping;
    if (body.shipping_class !== undefined) updateData.shipping_class = body.shipping_class;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.is_featured !== undefined) updateData.is_featured = body.is_featured;
    if (body.is_digital !== undefined) updateData.is_digital = body.is_digital;
    if (body.override_name !== undefined) updateData.override_name = body.override_name;
    if (body.override_description !== undefined) updateData.override_description = body.override_description;
    if (body.override_price !== undefined) updateData.override_price = body.override_price ? parseFloat(body.override_price) : null;
    if (body.override_images !== undefined) updateData.override_images = body.override_images;
    if (body.discount_type !== undefined) updateData.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updateData.discount_value = body.discount_value ? parseFloat(body.discount_value) : null;

    // Handle stock quantity changes with inventory logging
    if (body.stock_quantity !== undefined && body.stock_quantity !== existingProduct.stock_quantity) {
      const quantityChange = parseInt(body.stock_quantity) - existingProduct.stock_quantity;
      const changeType = quantityChange > 0 ? 'adjustment' : 'adjustment';
      const notes = body.stock_change_notes || `Stock updated via admin panel`;

      // Log the inventory change
      await db.query(`
        INSERT INTO inventory_logs (
          store_id, product_id, change_type, quantity_change, quantity_after, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user.storeId,
        productId,
        changeType,
        quantityChange,
        parseInt(body.stock_quantity),
        notes
      ]);
    }

    // Handle listing/unlisting with published_at timestamp
    if (body.is_active !== undefined) {
      if (body.is_active && !existingProduct.is_active) {
        // Product is being listed
        updateData.published_at = new Date();
      } else if (!body.is_active && existingProduct.is_active) {
        // Product is being unlisted
        updateData.published_at = null;
      }
    }

    // Update the product
    const updatedProduct = await productRepository.update(updateData);

    return NextResponse.json({
      success: true,
      data: {
        product: updatedProduct,
        message: 'Product updated successfully'
      }
    });

  } catch (error) {
    console.error('Admin product PUT error:', error);
    
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
 * DELETE /api/admin/products/[productId]
 * Remove product (with safety checks)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { productId } = await params;
    
    // Verify product exists and belongs to user's store
    const existingProduct = await productRepository.findById(productId);
    if (!existingProduct || existingProduct.store_id !== user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }

    // Check if product has any orders (safety check)
    const orderCheck = await db.query(`
      SELECT COUNT(*) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = $1 AND o.store_id = $2
    `, [productId, user.storeId]);

    const orderCount = parseInt(orderCheck.rows[0].order_count || '0');
    if (orderCount > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete product with existing orders. Consider deactivating it instead.',
        details: {
          order_count: orderCount,
          suggestion: 'Use PUT /api/admin/products/' + productId + ' with is_active: false to deactivate'
        }
      }, { status: 400 });
    }

    // Optional: Check query parameter for force delete
    const { searchParams } = new URL(request.url);
    const forceDelete = searchParams.get('force') === 'true';
    
    if (orderCount > 0 && !forceDelete) {
      return NextResponse.json({
        success: false,
        error: 'Product has order history. Use ?force=true to delete anyway.',
        details: {
          order_count: orderCount
        }
      }, { status: 400 });
    }

    // Delete the product (will cascade to inventory_logs due to foreign key constraints)
    await productRepository.delete(productId);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Product deleted successfully',
        deleted_product: {
          id: productId,
          name: existingProduct.name,
          sku: existingProduct.sku
        }
      }
    });

  } catch (error) {
    console.error('Admin product DELETE error:', error);
    
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