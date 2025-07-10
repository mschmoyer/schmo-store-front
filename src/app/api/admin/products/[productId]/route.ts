import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';


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
    const productResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );
    
    if (productResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }
    
    const product = productResult.rows[0];

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

      // Product analytics (views, cart adds, etc.) - TODO: Implement analytics
      Promise.resolve({ rows: [] }),

      // Category information if exists
      product.category_id ? db.query(`
        SELECT name, slug, description
        FROM categories
        WHERE id = $1 AND store_id = $2
      `, [product.category_id, user.storeId]) : null
    ]);

    // Get related products - TODO: Implement related products logic
    const relatedProducts: Array<{
      id: string;
      name: string;
      slug: string;
      base_price: number;
      featured_image_url: string;
      stock_quantity: number;
    }> = [];

    // Calculate stock status
    const stockQuantity = Number(product.stock_quantity) || 0;
    const lowStockThreshold = Number(product.low_stock_threshold) || 0;
    const stockStatus = Boolean(product.track_inventory) ? 
      (stockQuantity > lowStockThreshold ? 'in_stock' : 
       stockQuantity > 0 ? 'low_stock' : 'out_of_stock') : 
      'not_tracked';

    // Check if product needs attention (low stock, no sales, etc.)
    const needsAttention: string[] = [];
    if (Boolean(product.track_inventory) && stockQuantity <= lowStockThreshold) {
      needsAttention.push('low_stock');
    }
    if (!Boolean(product.is_active)) {
      needsAttention.push('inactive');
    }
    if (!product.featured_image_url) {
      needsAttention.push('no_image');
    }
    if (!product.short_description) {
      needsAttention.push('no_description');
    }

    const sales = salesData.rows[0] || {};
    const enhancedProduct = {
      ...product,
      stock_status: stockStatus,
      needs_attention: needsAttention,
      sales_data: {
        total_sales: parseInt(String(sales.total_sales || '0')),
        total_revenue: parseFloat(String(sales.total_revenue || '0')),
        total_orders: parseInt(String(sales.total_orders || '0')),
        avg_sale_price: parseFloat(String(sales.avg_sale_price || '0')),
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
    const existingProductResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );
    
    if (existingProductResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }
    
    const existingProduct = existingProductResult.rows[0];

    // If updating SKU, check for conflicts
    if (body.sku && body.sku !== existingProduct.sku) {
      const skuConflictResult = await db.query(
        'SELECT id FROM products WHERE sku = $1 AND store_id = $2 AND id != $3',
        [body.sku, user.storeId, productId]
      );
      if (skuConflictResult.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'A product with this SKU already exists'
        }, { status: 409 });
      }
    }

    // If updating slug, check for conflicts
    if (body.slug && body.slug !== existingProduct.slug) {
      const slugConflictResult = await db.query(
        'SELECT id FROM products WHERE slug = $1 AND store_id = $2 AND id != $3',
        [body.slug, user.storeId, productId]
      );
      if (slugConflictResult.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'A product with this slug already exists'
        }, { status: 409 });
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramCount = 1;

    // Build dynamic update fields and values
    if (body.sku !== undefined) {
      updateFields.push(`sku = $${paramCount}`);
      updateValues.push(body.sku);
      paramCount++;
    }
    if (body.name !== undefined) {
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(body.name);
      paramCount++;
    }
    if (body.slug !== undefined) {
      updateFields.push(`slug = $${paramCount}`);
      updateValues.push(body.slug);
      paramCount++;
    }
    if (body.short_description !== undefined) {
      updateFields.push(`short_description = $${paramCount}`);
      updateValues.push(body.short_description);
      paramCount++;
    }
    if (body.description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(body.description);
      paramCount++;
    }
    if (body.long_description !== undefined) {
      updateFields.push(`long_description = $${paramCount}`);
      updateValues.push(body.long_description);
      paramCount++;
    }
    if (body.description_html !== undefined) {
      updateFields.push(`description_html = $${paramCount}`);
      updateValues.push(body.description_html);
      paramCount++;
    }
    if (body.base_price !== undefined) {
      updateFields.push(`base_price = $${paramCount}`);
      updateValues.push(body.base_price ? parseFloat(body.base_price) : null);
      paramCount++;
    }
    if (body.sale_price !== undefined) {
      updateFields.push(`sale_price = $${paramCount}`);
      updateValues.push(body.sale_price ? parseFloat(body.sale_price) : null);
      paramCount++;
    }
    if (body.override_price !== undefined) {
      updateFields.push(`override_price = $${paramCount}`);
      updateValues.push(body.override_price ? parseFloat(body.override_price) : null);
      paramCount++;
    }
    if (body.cost_price !== undefined) {
      updateFields.push(`cost_price = $${paramCount}`);
      updateValues.push(body.cost_price ? parseFloat(body.cost_price) : null);
      paramCount++;
    }
    if (body.track_inventory !== undefined) {
      updateFields.push(`track_inventory = $${paramCount}`);
      updateValues.push(body.track_inventory);
      paramCount++;
    }
    if (body.inventory_quantity !== undefined) {
      updateFields.push(`stock_quantity = $${paramCount}`);
      updateValues.push(parseInt(body.inventory_quantity));
      paramCount++;
    }
    if (body.weight !== undefined) {
      updateFields.push(`weight = $${paramCount}`);
      updateValues.push(body.weight ? parseFloat(body.weight) : null);
      paramCount++;
    }
    if (body.category_id !== undefined) {
      updateFields.push(`category_id = $${paramCount}`);
      updateValues.push(body.category_id);
      paramCount++;
    }
    if (body.tags !== undefined) {
      updateFields.push(`tags = $${paramCount}`);
      updateValues.push(body.tags);
      paramCount++;
    }
    if (body.meta_title !== undefined) {
      updateFields.push(`meta_title = $${paramCount}`);
      updateValues.push(body.meta_title);
      paramCount++;
    }
    if (body.meta_description !== undefined) {
      updateFields.push(`meta_description = $${paramCount}`);
      updateValues.push(body.meta_description);
      paramCount++;
    }
    if (body.images !== undefined) {
      updateFields.push(`gallery_images = $${paramCount}`);
      updateValues.push(body.images);
      paramCount++;
    }
    if (body.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount}`);
      updateValues.push(body.is_active);
      paramCount++;
    }
    if (body.is_featured !== undefined) {
      updateFields.push(`is_featured = $${paramCount}`);
      updateValues.push(body.is_featured);
      paramCount++;
    }

    // Handle stock quantity changes with inventory logging
    const existingStockQuantity = Number(existingProduct.stock_quantity) || 0;
    if (body.inventory_quantity !== undefined && body.inventory_quantity !== existingStockQuantity) {
      const quantityChange = parseInt(body.inventory_quantity) - existingStockQuantity;
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
        parseInt(body.inventory_quantity),
        notes
      ]);
    }

    // Handle listing/unlisting with published_at timestamp
    if (body.is_active !== undefined) {
      const existingIsActive = Boolean(existingProduct.is_active);
      if (body.is_active && !existingIsActive) {
        // Product is being listed
        updateFields.push(`published_at = $${paramCount}`);
        updateValues.push(new Date());
        paramCount++;
      } else if (!body.is_active && existingIsActive) {
        // Product is being unlisted
        updateFields.push(`published_at = $${paramCount}`);
        updateValues.push(null);
        paramCount++;
      }
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date());
    paramCount++;

    // Add WHERE clause values
    updateValues.push(productId);
    updateValues.push(user.storeId);

    // Execute the update
    const updateQuery = `
      UPDATE products 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND store_id = $${paramCount + 1}
      RETURNING *
    `;
    
    const updateResult = await db.query(updateQuery, updateValues);
    const updatedProduct = updateResult.rows[0];

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
    const existingProductResult = await db.query(
      'SELECT * FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );
    
    if (existingProductResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found'
      }, { status: 404 });
    }
    
    const existingProduct = existingProductResult.rows[0];

    // Check if product has any orders (safety check)
    const orderCheck = await db.query(`
      SELECT COUNT(*) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = $1 AND o.store_id = $2
    `, [productId, user.storeId]);

    const orderCount = parseInt(String(orderCheck.rows[0]?.order_count || '0'));
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
    await db.query(
      'DELETE FROM products WHERE id = $1 AND store_id = $2',
      [productId, user.storeId]
    );

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