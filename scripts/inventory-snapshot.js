#!/usr/bin/env node

/**
 * Inventory Snapshot Background Job
 * 
 * This script creates daily inventory snapshots for all active stores.
 * It's designed to be run by Heroku Scheduler or similar cron services.
 * 
 * Usage: npm run snapshot:inventory
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createSnapshotForStore(storeId, storeName) {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    // Check if snapshot already exists
    const existsResult = await pool.query(
      'SELECT EXISTS(SELECT 1 FROM inventory_snapshots WHERE store_id = $1 AND snapshot_date = $2::date) as exists',
      [storeId, today]
    );
    
    if (existsResult.rows[0].exists) {
      console.log(`Snapshot already exists for ${storeName} on ${dateStr}`);
      return { success: true, skipped: true };
    }
    
    // Create snapshot using the database function
    const result = await pool.query(
      'SELECT create_inventory_snapshot($1, $2::date) as snapshot_id',
      [storeId, today]
    );
    
    const snapshotId = result.rows[0]?.snapshot_id;
    
    if (snapshotId) {
      console.log(`✓ Created snapshot for ${storeName}: ${snapshotId}`);
      
      // Log to sync_logs table
      await pool.query(`
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
        storeId,
        'inventory_snapshot',
        'completed',
        1,
        JSON.stringify({ snapshotId, date: dateStr }),
        today,
        new Date()
      ]);
      
      return { success: true, snapshotId };
    } else {
      throw new Error('Failed to create snapshot - no snapshot ID returned');
    }
  } catch (error) {
    console.error(`✗ Failed to create snapshot for ${storeName}:`, error.message);
    
    // Log failure
    await pool.query(`
      INSERT INTO sync_logs (
        store_id,
        sync_type,
        status,
        error_message,
        started_at,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      storeId,
      'inventory_snapshot',
      'failed',
      error.message,
      new Date(),
      new Date()
    ]).catch(console.error);
    
    return { success: false, error: error.message };
  }
}

async function createSnapshotsForAllStores() {
  console.log(`[${new Date().toISOString()}] Starting inventory snapshot job...`);
  
  try {
    // Get all active stores
    const storesResult = await pool.query(
      'SELECT id, store_name, timezone FROM stores WHERE is_active = true'
    );
    
    const stores = storesResult.rows;
    console.log(`Found ${stores.length} active stores`);
    
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process each store
    for (const store of stores) {
      const result = await createSnapshotForStore(store.id, store.store_name);
      
      if (result.success) {
        if (result.skipped) {
          skippedCount++;
        } else {
          successCount++;
        }
      } else {
        errorCount++;
      }
    }
    
    console.log(`\n[${new Date().toISOString()}] Inventory snapshot job completed`);
    console.log(`Success: ${successCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    
    // Close database connection
    await pool.end();
    
    // Exit with appropriate code
    process.exit(errorCount > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('Fatal error in inventory snapshot job:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the job
createSnapshotsForAllStores().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});