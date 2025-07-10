import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

/**
 * GET /api/admin/products/simple
 * Get simplified product list for selection purposes
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
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '100');

    let query = `
      SELECT 
        id,
        name,
        sku,
        base_price,
        featured_image_url,
        category_id,
        is_active
      FROM products 
      WHERE store_id = $1
    `;
    
    const params = [user.storeId];
    
    if (search) {
      query += ` AND (name ILIKE $2 OR sku ILIKE $2)`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY name ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);
    
    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Admin products simple GET error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}