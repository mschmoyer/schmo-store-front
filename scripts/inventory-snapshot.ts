#!/usr/bin/env node

/**
 * Inventory Snapshot Background Job
 * 
 * This script creates daily inventory snapshots for all active stores.
 * It's designed to be run by Heroku Scheduler or similar cron services.
 * 
 * Usage: npm run snapshot:inventory
 */

import { config } from 'dotenv';
import { db } from '../src/lib/database/connection';
import { inventorySnapshotService } from '../src/lib/services/inventorySnapshotService';

// Load environment variables
config();

interface Store {
  id: string;
  store_name: string;
  timezone: string;
}

async function createSnapshotsForAllStores() {
  console.log(`[${new Date().toISOString()}] Starting inventory snapshot job...`);

  try {
    // Get all active stores
    const storesResult = await db.query<Store>(
      'SELECT id, store_name, timezone FROM stores WHERE is_active = true'
    );

    const stores = storesResult.rows;
    console.log(`Found ${stores.length} active stores`);

    let successCount = 0;
    let errorCount = 0;

    // Process each store
    for (const store of stores) {
      try {
        console.log(`Processing store: ${store.store_name} (${store.id})`);

        // Check if snapshot already exists for today
        const today = new Date();
        const exists = await inventorySnapshotService.snapshotExists(store.id, today);

        if (exists) {
          console.log(`Snapshot already exists for ${store.store_name} on ${today.toISOString().split('T')[0]}`);
          successCount++;
          continue;
        }

        // Create snapshot
        const result = await inventorySnapshotService.createDailySnapshot(store.id, today);

        if (result.success) {
          console.log(`✓ Created snapshot for ${store.store_name}: ${result.snapshotId}`);
          successCount++;

          // Log to sync_logs table for monitoring
          await db.query(`
            INSERT INTO sync_logs (
              store_id,
              sync_type,
              status,
              items_synced,
              details,
              started_at,
              completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            store.id,
            'inventory_snapshot',
            'completed',
            1,
            JSON.stringify({ snapshotId: result.snapshotId, date: today.toISOString().split('T')[0] }),
            today,
            new Date()
          ]);
        } else {
          console.error(`✗ Failed to create snapshot for ${store.store_name}: ${result.error}`);
          errorCount++;

          // Log failure
          await db.query(`
            INSERT INTO sync_logs (
              store_id,
              sync_type,
              status,
              error_message,
              started_at,
              completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            store.id,
            'inventory_snapshot',
            'failed',
            result.error,
            today,
            new Date()
          ]);
        }
      } catch (error) {
        console.error(`Error processing store ${store.store_name}:`, error);
        errorCount++;
      }
    }

    console.log(`\n[${new Date().toISOString()}] Inventory snapshot job completed`);
    console.log(`Success: ${successCount}, Errors: ${errorCount}`);

    // Exit with appropriate code
    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('Fatal error in inventory snapshot job:', error);
    process.exit(1);
  }
}

// Run the job
createSnapshotsForAllStores().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});