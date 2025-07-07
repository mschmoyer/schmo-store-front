import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    
    // Get inventory data for this store
    const inventoryResult = await db.query(`
      SELECT 
        id,
        sku,
        available,
        on_hand,
        allocated,
        warehouse_id,
        warehouse_name,
        created_at,
        updated_at
      FROM inventory 
      WHERE store_id = $1
      ORDER BY sku
    `, [storeId]);
    
    return NextResponse.json({
      success: true,
      data: {
        inventory: inventoryResult.rows
      },
      inventory: inventoryResult.rows // For backward compatibility
    });
    
  } catch (error) {
    console.error('Error fetching store inventory:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch inventory'
    }, { status: 500 });
  }
}