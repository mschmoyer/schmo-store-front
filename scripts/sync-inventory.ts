#!/usr/bin/env node
import { db } from '../src/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * Sync inventory from ShipStation V2 API
 */
async function syncInventory(apiKey: string, storeId: string): Promise<SyncResult> {
  const result: SyncResult = { totalCount: 0, addedCount: 0, updatedCount: 0 };

  try {
    // Fetch all inventory from ShipStation v2 API with pagination
    let allInventory: Array<{
      sku: string;
      available: number;
      on_hand: number;
      allocated: number;
    }> = [];
    let page = 1;
    let hasMorePages = true;
    
    console.log('Fetching inventory from ShipStation V2 API...');
    
    while (hasMorePages) {
      const inventoryResponse = await fetch(`https://api.shipstation.com/v2/inventory?page=${page}&page_size=100`, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!inventoryResponse.ok) {
        const errorData = await inventoryResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch inventory: ${inventoryResponse.status} ${inventoryResponse.statusText}`);
      }
      
      const inventoryData = await inventoryResponse.json();
      allInventory = allInventory.concat(inventoryData.inventory || []);
      
      // Check if there are more pages
      hasMorePages = (inventoryData.inventory?.length || 0) === 100;
      page++;
    }
    
    console.log(`Found ${allInventory.length} inventory items from ShipStation`);
    
    // Save inventory to database and update product stock quantities
    for (const item of allInventory) {
      try {
        const existingInventory = await db.query(
          'SELECT id FROM inventory WHERE sku = $1 AND store_id = $2',
          [item.sku, storeId]
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
            storeId
          ]);
          result.updatedCount++;
        } else {
          // Insert new inventory
          await db.query(`
            INSERT INTO inventory (
              id, store_id, sku, available, on_hand, allocated, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW()
            )
          `, [
            storeId,
            item.sku,
            item.available || 0,
            item.on_hand || 0,
            item.allocated || 0
          ]);
          result.addedCount++;
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
          storeId
        ]);
      } catch (error) {
        console.error(`Error syncing inventory for SKU ${item.sku}:`, error);
        // Continue with next item
      }
    }
    
    result.totalCount = result.addedCount + result.updatedCount;
    console.log(`Inventory sync completed: ${result.totalCount} total, ${result.addedCount} added, ${result.updatedCount} updated`);

  } catch (error) {
    console.error('Error syncing inventory from ShipStation:', error);
    throw error;
  }

  return result;
}

// Main execution
async function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run sync:inventory <storeId> <apiKey>');
    process.exit(1);
  }

  const storeId = process.argv[2];
  const apiKey = process.argv[3];

  try {
    const result = await syncInventory(apiKey, storeId);
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

export { syncInventory };