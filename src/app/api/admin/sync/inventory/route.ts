import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get ShipEngine integration
    const integrationResult = await db.query(`
      SELECT api_key_encrypted, is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipengine'
    `, [user.storeId]);
    
    if (integrationResult.rows.length === 0 || !integrationResult.rows[0].is_active) {
      return NextResponse.json({
        success: false,
        error: 'ShipEngine integration not found or inactive'
      }, { status: 400 });
    }
    
    const encryptedApiKey = integrationResult.rows[0].api_key_encrypted;
    const apiKey = Buffer.from(String(encryptedApiKey), 'base64').toString('utf-8');
    
    // Fetch all inventory from ShipStation (ShipEngine v2 API) with pagination
    let allInventory: Array<{
      sku: string;
      available: number;
      on_hand: number;
      allocated: number;
    }> = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const inventoryResponse = await fetch(`https://api.shipengine.com/v2/inventory?page=${page}&page_size=100`, {
        headers: {
          'API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!inventoryResponse.ok) {
        const errorData = await inventoryResponse.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errorData.message || 'Failed to fetch inventory from ShipEngine'
        }, { status: 500 });
      }
      
      const inventoryData = await inventoryResponse.json();
      allInventory = allInventory.concat(inventoryData.inventory || []);
      
      // Check if there are more pages
      hasMorePages = (inventoryData.inventory?.length || 0) === 100;
      page++;
    }
    let addedCount = 0;
    let updatedCount = 0;
    
    // Save inventory to database and update product stock quantities
    for (const item of allInventory) {
      const existingInventory = await db.query(
        'SELECT id FROM inventory WHERE sku = $1 AND store_id = $2',
        [item.sku, user.storeId]
      );
      
      if (existingInventory.rows.length > 0) {
        // Update existing inventory
        await db.query(`
          UPDATE inventory SET 
            available = $1,
            on_hand = $2,
            allocated = $3,
            updated_at = NOW()
          WHERE sku = $4 AND store_id = $5
        `, [
          item.available || 0,
          item.on_hand || 0,
          item.allocated || 0,
          item.sku,
          user.storeId
        ]);
        updatedCount++;
      } else {
        // Insert new inventory
        await db.query(`
          INSERT INTO inventory (
            id, store_id, sku, available, on_hand, allocated, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW()
          )
        `, [
          user.storeId,
          item.sku,
          item.available || 0,
          item.on_hand || 0,
          item.allocated || 0
        ]);
        addedCount++;
      }
      
      // Update product stock quantity to match inventory
      await db.query(`
        UPDATE products SET 
          stock_quantity = $1,
          updated_at = NOW()
        WHERE sku = $2 AND store_id = $3
      `, [
        item.available || 0,
        item.sku,
        user.storeId
      ]);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: `Inventory synced successfully`,
        addedCount,
        updatedCount,
        totalCount: addedCount + updatedCount
      }
    });
    
  } catch (error) {
    console.error('Sync inventory error:', error);
    
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