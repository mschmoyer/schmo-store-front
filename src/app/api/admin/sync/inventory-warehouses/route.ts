import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * POST /api/admin/sync/inventory-warehouses
 * Sync inventory warehouses from ShipStation V2 API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const storeId = user.storeId;

    // Get ShipStation integration
    const integrationResult = await db.query(
      `SELECT 
        api_key_encrypted,
        configuration,
        is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipstation' AND is_active = true`,
      [storeId]
    );

    if (integrationResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ShipStation integration not found or not active' },
        { status: 400 }
      );
    }

    const integration = integrationResult.rows[0];
    const apiKey = Buffer.from(integration.api_key_encrypted, 'base64').toString('utf-8');

    // Sync inventory warehouses
    const result = await syncInventoryWarehouses(apiKey, storeId);

    return NextResponse.json({
      success: true,
      message: 'Inventory warehouses synced successfully',
      data: result
    });

  } catch (error) {
    console.error('Error syncing inventory warehouses:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Sync inventory warehouses from ShipStation V2 API
 */
async function syncInventoryWarehouses(apiKey: string, storeId: string): Promise<SyncResult> {
  const result: SyncResult = { totalCount: 0, addedCount: 0, updatedCount: 0 };

  try {
    console.log('Fetching inventory warehouses from ShipStation V2 API...');
    
    // Get inventory warehouses from ShipStation API
    const response = await fetch('https://api.shipstation.com/v2/inventory_warehouses', {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('ShipStation V2 inventory warehouses response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      throw new Error(`ShipStation API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const warehouses = data.inventory_warehouses || [];
    result.totalCount = warehouses.length;

    console.log(`Found ${warehouses.length} inventory warehouses from ShipStation`);

    // Sync each inventory warehouse to database
    for (const warehouse of warehouses) {
      try {
        // Check if inventory warehouse already exists
        const existingResult = await db.query(
          'SELECT id FROM shipstation_inventory_warehouses WHERE store_id = $1 AND inventory_warehouse_id = $2',
          [storeId, warehouse.inventory_warehouse_id]
        );

        if (existingResult.rows.length > 0) {
          // Update existing inventory warehouse
          await db.query(`
            UPDATE shipstation_inventory_warehouses SET
              name = $3,
              updated_at = CURRENT_TIMESTAMP
            WHERE store_id = $1 AND inventory_warehouse_id = $2
          `, [storeId, warehouse.inventory_warehouse_id, warehouse.name]);
          result.updatedCount++;
        } else {
          // Insert new inventory warehouse
          await db.query(`
            INSERT INTO shipstation_inventory_warehouses (
              store_id, inventory_warehouse_id, name, created_at, updated_at
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [storeId, warehouse.inventory_warehouse_id, warehouse.name]);
          result.addedCount++;
        }
      } catch (error) {
        console.error(`Error syncing inventory warehouse ${warehouse.inventory_warehouse_id}:`, error);
        // Continue with next warehouse
      }
    }

    console.log(`Inventory warehouse sync completed: ${result.totalCount} total, ${result.addedCount} added, ${result.updatedCount} updated`);

  } catch (error) {
    console.error('Error fetching inventory warehouses from ShipStation:', error);
    throw error;
  }

  return result;
}