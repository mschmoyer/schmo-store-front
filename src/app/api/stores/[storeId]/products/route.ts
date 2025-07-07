import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('page_size') || '50');
    const activeOnly = searchParams.get('active_only') === 'true';
    const offset = (page - 1) * pageSize;
    
    // Build the WHERE clause
    let whereClause = 'WHERE store_id = $1';
    const queryParams: (string | boolean)[] = [storeId];
    
    if (activeOnly) {
      whereClause += ' AND is_active = true';
    }
    
    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM products 
      ${whereClause}
    `, queryParams);
    
    const total = parseInt(String(countResult.rows[0]?.total || '0'));
    const totalPages = Math.ceil(total / pageSize);
    
    // Get products with pagination
    const productsResult = await db.query(`
      SELECT 
        id,
        shipstation_product_id as product_id,
        sku,
        name,
        slug,
        short_description as description,
        base_price,
        sale_price,
        featured_image_url,
        category_id,
        tags,
        is_active,
        is_featured,
        created_at,
        updated_at
      FROM products 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, pageSize, offset]);
    
    // Transform products to include category name
    const products = await Promise.all(
      productsResult.rows.map(async (product) => {
        let categoryName = 'Other';
        
        if (product.category_id) {
          try {
            const categoryResult = await db.query(
              'SELECT name FROM categories WHERE id = $1',
              [product.category_id]
            );
            if (categoryResult.rows.length > 0) {
              categoryName = String(categoryResult.rows[0].name);
            }
          } catch (error) {
            console.error('Error fetching category:', error);
          }
        }
        
        return {
          ...product,
          category: categoryName,
          thumbnail_url: product.featured_image_url,
          price: product.sale_price || product.base_price,
          active: product.is_active
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      },
      products, // For backward compatibility
      page,
      pages: totalPages,
      total,
      page_size: pageSize
    });
    
  } catch (error) {
    console.error('Error fetching store products:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch products'
    }, { status: 500 });
  }
}