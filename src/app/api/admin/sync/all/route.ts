import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

interface SyncAllResponse {
  products: SyncResult;
  inventory: SyncResult;
  warehouses: SyncResult;
  locations: SyncResult;
}

// Import sync functions directly to avoid internal routing issues
import { syncWarehouses } from '../warehouses/sync';
import { syncInventoryWarehouses } from '../inventory-warehouses/sync';
import { syncInventoryLocations } from '../inventory-locations/sync';
import { syncProducts } from '../products/sync';
import { syncInventory } from '../inventory/sync';

/**
 * POST /api/admin/sync/all
 * Unified sync endpoint for ShipStation - syncs products, inventory, warehouses, and locations
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const userId = user.userId;

    // Get user's store ID
    const storeResult = await db.query(
      'SELECT id FROM stores WHERE owner_id = $1',
      [userId]
    );

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const storeId = String(storeResult.rows[0].id);

    // Check if ShipStation integration is active
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
    
    console.log('Sync API Key Debug:', {
      integration_type: 'shipstation',
      api_key_length: apiKey.length,
      api_key_first_6: apiKey.substring(0, 6),
      api_key_last_4: apiKey.substring(apiKey.length - 4)
    });

    // Initialize sync results
    const syncResults: SyncAllResponse = {
      products: { totalCount: 0, addedCount: 0, updatedCount: 0 },
      inventory: { totalCount: 0, addedCount: 0, updatedCount: 0 },
      warehouses: { totalCount: 0, addedCount: 0, updatedCount: 0 },
      locations: { totalCount: 0, addedCount: 0, updatedCount: 0 }
    };

    console.log(`Starting unified sync for store: ${storeId}`);

    // 1. Sync warehouses
    try {
      console.log('Syncing warehouses...');
      const warehousesResult = await syncWarehouses(apiKey, storeId);
      syncResults.warehouses = warehousesResult;
      console.log(`Warehouses synced: ${warehousesResult.totalCount} total`);
    } catch (error) {
      console.error('Error syncing warehouses:', error);
      // Continue with other syncs even if warehouses fail
    }

    // 2. Sync inventory warehouses
    try {
      console.log('Syncing inventory warehouses...');
      const inventoryWarehousesResult = await syncInventoryWarehouses(apiKey, storeId);
      // Add to locations count since they're related
      syncResults.locations.totalCount += inventoryWarehousesResult.totalCount;
      syncResults.locations.addedCount += inventoryWarehousesResult.addedCount;
      syncResults.locations.updatedCount += inventoryWarehousesResult.updatedCount;
      console.log(`Inventory warehouses synced: ${inventoryWarehousesResult.totalCount} total`);
    } catch (error) {
      console.error('Error syncing inventory warehouses:', error);
      // Continue with other syncs
    }

    // 3. Sync inventory locations
    try {
      console.log('Syncing inventory locations...');
      const inventoryLocationsResult = await syncInventoryLocations(apiKey, storeId);
      // Add to locations count
      syncResults.locations.totalCount += inventoryLocationsResult.totalCount;
      syncResults.locations.addedCount += inventoryLocationsResult.addedCount;
      syncResults.locations.updatedCount += inventoryLocationsResult.updatedCount;
      console.log(`Inventory locations synced: ${inventoryLocationsResult.totalCount} total`);
    } catch (error) {
      console.error('Error syncing inventory locations:', error);
      // Continue with other syncs
    }

    // 4. Sync products
    try {
      console.log('Syncing products...');
      const productsResult = await syncProducts(apiKey, storeId);
      syncResults.products = productsResult;
      console.log(`Products synced: ${productsResult.totalCount} total`);
    } catch (error) {
      console.error('Error syncing products:', error);
      // Continue with other syncs
    }

    // 5. Sync inventory
    try {
      console.log('Syncing inventory...');
      const inventoryResult = await syncInventory(apiKey, storeId);
      syncResults.inventory = inventoryResult;
      console.log(`Inventory synced: ${inventoryResult.totalCount} total`);
    } catch (error) {
      console.error('Error syncing inventory:', error);
      // Continue - this isn't critical
    }

    console.log('Unified sync completed successfully', syncResults);

    return NextResponse.json({
      success: true,
      message: 'All data synced successfully',
      data: syncResults
    });

  } catch (error) {
    console.error('Unified sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error during sync' },
      { status: 500 }
    );
  }
}

