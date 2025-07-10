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

    // 1. Sync warehouses (delegate to existing endpoint)
    try {
      console.log('Syncing warehouses...');
      const warehousesResponse = await fetch(`${request.nextUrl.origin}/api/admin/sync/warehouses`, {
        method: 'POST',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        }
      });

      if (warehousesResponse.ok) {
        const warehousesData = await warehousesResponse.json();
        if (warehousesData.success) {
          syncResults.warehouses = warehousesData.data;
          console.log(`Warehouses synced: ${warehousesData.data.totalCount} total`);
        }
      } else {
        console.error('Warehouses sync failed:', warehousesResponse.status, warehousesResponse.statusText);
      }
    } catch (error) {
      console.error('Error syncing warehouses:', error);
      // Continue with other syncs even if warehouses fail
    }

    // 2. Sync inventory warehouses (delegate to existing endpoint)
    try {
      console.log('Syncing inventory warehouses...');
      const inventoryWarehousesResponse = await fetch(`${request.nextUrl.origin}/api/admin/sync/inventory-warehouses`, {
        method: 'POST',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        }
      });

      if (inventoryWarehousesResponse.ok) {
        const inventoryWarehousesData = await inventoryWarehousesResponse.json();
        if (inventoryWarehousesData.success) {
          // Add to locations count since they're related
          syncResults.locations.totalCount += inventoryWarehousesData.data.totalCount;
          syncResults.locations.addedCount += inventoryWarehousesData.data.addedCount;
          syncResults.locations.updatedCount += inventoryWarehousesData.data.updatedCount;
          console.log(`Inventory warehouses synced: ${inventoryWarehousesData.data.totalCount} total`);
        }
      } else {
        console.error('Inventory warehouses sync failed:', inventoryWarehousesResponse.status, inventoryWarehousesResponse.statusText);
      }
    } catch (error) {
      console.error('Error syncing inventory warehouses:', error);
      // Continue with other syncs
    }

    // 3. Sync inventory locations (delegate to existing endpoint)
    try {
      console.log('Syncing inventory locations...');
      const inventoryLocationsResponse = await fetch(`${request.nextUrl.origin}/api/admin/sync/inventory-locations`, {
        method: 'POST',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        }
      });

      if (inventoryLocationsResponse.ok) {
        const inventoryLocationsData = await inventoryLocationsResponse.json();
        if (inventoryLocationsData.success) {
          // Add to locations count
          syncResults.locations.totalCount += inventoryLocationsData.data.totalCount;
          syncResults.locations.addedCount += inventoryLocationsData.data.addedCount;
          syncResults.locations.updatedCount += inventoryLocationsData.data.updatedCount;
          console.log(`Inventory locations synced: ${inventoryLocationsData.data.totalCount} total`);
        }
      } else {
        console.error('Inventory locations sync failed:', inventoryLocationsResponse.status, inventoryLocationsResponse.statusText);
      }
    } catch (error) {
      console.error('Error syncing inventory locations:', error);
      // Continue with other syncs
    }

    // 4. Sync products (delegate to existing endpoint)
    try {
      console.log('Syncing products...');
      const productsResponse = await fetch(`${request.nextUrl.origin}/api/admin/sync/products`, {
        method: 'POST',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        }
      });

      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        if (productsData.success) {
          syncResults.products = productsData.data;
          console.log(`Products synced: ${productsData.data.totalCount} total`);
        }
      }
    } catch (error) {
      console.error('Error syncing products:', error);
      // Continue with other syncs
    }

    // 5. Sync inventory (delegate to existing endpoint)
    try {
      console.log('Syncing inventory...');
      const inventoryResponse = await fetch(`${request.nextUrl.origin}/api/admin/sync/inventory`, {
        method: 'POST',
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        }
      });

      if (inventoryResponse.ok) {
        const inventoryData = await inventoryResponse.json();
        if (inventoryData.success) {
          syncResults.inventory = inventoryData.data;
          console.log(`Inventory synced: ${inventoryData.data.totalCount} total`);
        }
      }
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

