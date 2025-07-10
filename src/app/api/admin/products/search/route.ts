import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database/connection';
import { authenticateUser } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    if (!user.success) {
      return NextResponse.json({ error: user.error }, { status: 401 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // Search products by name, SKU, or barcode
    const searchQuery = `
      SELECT 
        id,
        name,
        slug,
        sku,
        barcode,
        base_price as price,
        cost_price,
        stock_quantity,
        track_inventory,
        is_active
      FROM products
      WHERE store_id = $1 
        AND is_active = true
        AND (
          name ILIKE $2 OR 
          sku ILIKE $2 OR 
          barcode ILIKE $2
        )
      ORDER BY name ASC
      LIMIT $3
    `;

    const result = await db.query(searchQuery, [
      user.storeId,
      `%${query}%`,
      limit
    ]);

    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error in product search API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}