#!/usr/bin/env node
import { db } from '../src/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
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

// Main execution
async function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run sync:inventory-warehouses <storeId> <apiKey>');
    process.exit(1);
  }

  const storeId = process.argv[2];
  const apiKey = process.argv[3];

  try {
    const result = await syncInventoryWarehouses(apiKey, storeId);
    console.log('Sync completed:', result);
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  main();
}

export { syncInventoryWarehouses };