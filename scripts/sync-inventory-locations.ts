#!/usr/bin/env node
import { db } from '../src/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * Sync inventory locations from ShipStation V2 API
 */
async function syncInventoryLocations(apiKey: string, storeId: string): Promise<SyncResult> {
  const result: SyncResult = { totalCount: 0, addedCount: 0, updatedCount: 0 };

  try {
    console.log('Fetching inventory locations from ShipStation V2 API...');
    
    // Get inventory locations from ShipStation API
    const response = await fetch('https://api.shipstation.com/v2/inventory_locations', {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('ShipStation V2 inventory locations response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      throw new Error(`ShipStation API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const locations = data.inventory_locations || [];
    result.totalCount = locations.length;

    console.log(`Found ${locations.length} inventory locations from ShipStation`);

    // Sync each inventory location to database
    for (const location of locations) {
      try {
        // Check if inventory location already exists
        const existingResult = await db.query(
          'SELECT id FROM shipstation_inventory_locations WHERE store_id = $1 AND inventory_location_id = $2',
          [storeId, location.inventory_location_id]
        );

        if (existingResult.rows.length > 0) {
          // Update existing inventory location
          await db.query(`
            UPDATE shipstation_inventory_locations SET
              inventory_warehouse_id = $3,
              name = $4,
              updated_at = CURRENT_TIMESTAMP
            WHERE store_id = $1 AND inventory_location_id = $2
          `, [storeId, location.inventory_location_id, location.inventory_warehouse_id, location.name]);
          result.updatedCount++;
        } else {
          // Insert new inventory location
          await db.query(`
            INSERT INTO shipstation_inventory_locations (
              store_id, inventory_location_id, inventory_warehouse_id, name, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [storeId, location.inventory_location_id, location.inventory_warehouse_id, location.name]);
          result.addedCount++;
        }
      } catch (error) {
        console.error(`Error syncing inventory location ${location.inventory_location_id}:`, error);
        // Continue with next location
      }
    }

    console.log(`Inventory location sync completed: ${result.totalCount} total, ${result.addedCount} added, ${result.updatedCount} updated`);

  } catch (error) {
    console.error('Error fetching inventory locations from ShipStation:', error);
    throw error;
  }

  return result;
}

// Main execution
async function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run sync:inventory-locations <storeId> <apiKey>');
    process.exit(1);
  }

  const storeId = process.argv[2];
  const apiKey = process.argv[3];

  try {
    const result = await syncInventoryLocations(apiKey, storeId);
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

export { syncInventoryLocations };