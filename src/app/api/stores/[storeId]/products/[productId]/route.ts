import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string; productId: string }> }
) {
  try {
    const { storeId, productId } = await params;
    
    // Get the product by ID or SKU
    let productQuery = '';
    let queryParams = [];
    
    // Check if productId is a UUID or SKU/shipstation_product_id
    if (productId.includes('-') && productId.length === 36) {
      // Looks like a UUID
      productQuery = `
        SELECT 
          p.*,
          c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1 AND p.store_id = $2 AND p.is_active = true
      `;
      queryParams = [productId, storeId];
    } else {
      // Treat as SKU or shipstation_product_id
      productQuery = `
        SELECT 
          p.*,
          c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE (p.sku = $1 OR p.shipstation_product_id = $1) 
        AND p.store_id = $2 AND p.is_active = true
      `;
      queryParams = [productId, storeId];
    }
    
    const productResult = await db.query(productQuery, queryParams);
    
    if (productResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Product not found',
        code: 'PRODUCT_NOT_FOUND'
      }, { status: 404 });
    }
    
    const product = productResult.rows[0];
    
    // Get inventory level from our inventory table
    let inventoryLevel = product.stock_quantity || 0;
    
    try {
      const inventoryResult = await db.query(`
        SELECT SUM(available) as total_available
        FROM inventory 
        WHERE sku = $1 AND store_id = $2
      `, [product.sku, storeId]);
      
      if (inventoryResult.rows.length > 0 && inventoryResult.rows[0].total_available !== null) {
        inventoryLevel = parseInt(inventoryResult.rows[0].total_available);
      }
    } catch (inventoryError) {
      console.warn('Failed to fetch inventory for product:', inventoryError);
      // Use product stock_quantity as fallback
    }
    
    // Transform product to match expected format
    const enhancedProduct = {
      product_id: product.shipstation_product_id || product.id,
      sku: product.sku,
      name: product.name,
      description: product.short_description || product.long_description,
      customs_description: product.long_description,
      customs_value: {
        amount: parseFloat(product.sale_price || product.base_price || '0'),
        currency: 'USD'
      },
      weight: product.weight ? {
        value: parseFloat(product.weight),
        unit: product.weight_unit || 'lb'
      } : null,
      dimensions: (product.length && product.width && product.height) ? {
        length: parseFloat(product.length),
        width: parseFloat(product.width),
        height: parseFloat(product.height),
        unit: product.dimension_unit || 'in'
      } : null,
      thumbnail_url: product.featured_image_url,
      active: product.is_active,
      product_category: product.category_name ? {
        name: product.category_name
      } : null,
      // Additional fields for better UX
      slug: product.slug,
      price: parseFloat(product.sale_price || product.base_price || '0'),
      base_price: parseFloat(product.base_price || '0'),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      inventory_level: inventoryLevel,
      is_featured: product.is_featured,
      gallery_images: product.gallery_images || [],
      meta_title: product.meta_title,
      meta_description: product.meta_description
    };
    
    // Mock reviews summary for now
    const reviewsSummary = {
      product_id: product.shipstation_product_id || product.id,
      total_reviews: 0,
      average_rating: 0,
      rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      verified_purchase_count: 0,
      recent_reviews: [],
      featured_reviews: [],
      last_updated: new Date().toISOString()
    };
    
    // Track product view analytics
    try {
      await db.query(`
        INSERT INTO page_analytics (
          id, store_id, page_path, page_title, event_type, product_id, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 'product_view', $4, NOW()
        )
      `, [
        storeId, 
        `/store/${storeId}/product/${productId}`,
        product.name,
        product.id
      ]);
    } catch (analyticsError) {
      console.warn('Failed to track product view:', analyticsError);
      // Continue without analytics
    }
    
    return NextResponse.json({
      success: true,
      data: {
        product: enhancedProduct,
        reviews: reviewsSummary,
        inventory: {
          available: inventoryLevel,
          last_updated: new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'FETCH_ERROR'
    }, { status: 500 });
  }
}