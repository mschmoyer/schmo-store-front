import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/database';

interface ShipStationConfig {
  id?: string;
  isActive: boolean;
  username: string;
  password: string;
  apiKey: string;
  apiSecret: string;
  endpointUrl: string;
  storeId?: string;
  autoSyncEnabled: boolean;
  autoSyncInterval: '10min' | '1hour' | '1day';
}

/**
 * GET - Retrieve ShipStation configuration
 */
export async function GET(request: NextRequest) {
  try {
    const tokenResult = await verifyAdminToken(request);
    if (!tokenResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = tokenResult.decoded?.userId;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid user' },
        { status: 401 }
      );
    }

    // Get user's store ID
    const storeResult = await db.query(
      'SELECT id FROM stores WHERE user_id = $1',
      [userId]
    );

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const storeId = storeResult.rows[0].id;

    // Get ShipStation integration config
    const configResult = await db.query(
      `SELECT 
        id,
        is_active,
        configuration,
        auto_sync_enabled,
        auto_sync_interval,
        created_at,
        updated_at
      FROM integrations 
      WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [storeId]
    );

    if (configResult.rows.length === 0) {
      // Return default configuration if none exists
      const defaultConfig: ShipStationConfig = {
        isActive: false,
        username: '',
        password: '',
        apiKey: '',
        apiSecret: '',
        endpointUrl: '',
        storeId: storeId,
        autoSyncEnabled: false,
        autoSyncInterval: '1hour'
      };

      return NextResponse.json({
        success: true,
        data: defaultConfig
      });
    }

    const config = configResult.rows[0];
    const configData = config.configuration as Record<string, unknown>;

    const shipstationConfig: ShipStationConfig = {
      id: config.id,
      isActive: config.is_active,
      username: (configData.username as string) || '',
      password: (configData.password as string) || '',
      apiKey: (configData.apiKey as string) || '',
      apiSecret: (configData.apiSecret as string) || '',
      endpointUrl: (configData.endpointUrl as string) || '',
      storeId: storeId,
      autoSyncEnabled: config.auto_sync_enabled || false,
      autoSyncInterval: config.auto_sync_interval || '1hour'
    };

    return NextResponse.json({
      success: true,
      data: shipstationConfig
    });

  } catch (error) {
    console.error('Error fetching ShipStation config:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create or update ShipStation configuration
 */
export async function POST(request: NextRequest) {
  try {
    const tokenResult = await verifyAdminToken(request);
    if (!tokenResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = tokenResult.decoded?.userId;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid user' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      isActive,
      username,
      password,
      apiKey,
      apiSecret,
      endpointUrl,
      autoSyncEnabled,
      autoSyncInterval
    } = body as ShipStationConfig;

    // Validate required fields
    if (!username || !password || !apiKey || !apiSecret || !endpointUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate endpoint URL
    try {
      new URL(endpointUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid endpoint URL' },
        { status: 400 }
      );
    }

    // Get user's store ID
    const storeResult = await db.query(
      'SELECT id FROM stores WHERE user_id = $1',
      [userId]
    );

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const storeId = storeResult.rows[0].id;

    // Configuration object to store
    const configuration = {
      username,
      password,
      apiKey,
      apiSecret,
      endpointUrl
    };

    // Check if configuration already exists
    const existingResult = await db.query(
      'SELECT id FROM integrations WHERE store_id = $1 AND integration_type = $2',
      [storeId, 'shipstation']
    );

    let configId: string;

    if (existingResult.rows.length > 0) {
      // Update existing configuration
      configId = existingResult.rows[0].id;
      
      await db.query(
        `UPDATE integrations 
         SET is_active = $1, 
             configuration = $2, 
             auto_sync_enabled = $3, 
             auto_sync_interval = $4, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          isActive,
          JSON.stringify(configuration),
          autoSyncEnabled,
          autoSyncInterval,
          configId
        ]
      );
    } else {
      // Create new configuration
      const insertResult = await db.query(
        `INSERT INTO integrations (
          store_id, 
          integration_type, 
          is_active, 
          configuration, 
          auto_sync_enabled, 
          auto_sync_interval,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id`,
        [
          storeId,
          'shipstation',
          isActive,
          JSON.stringify(configuration),
          autoSyncEnabled,
          autoSyncInterval
        ]
      );
      
      configId = insertResult.rows[0].id;
    }

    // Return the updated configuration
    const updatedConfig: ShipStationConfig = {
      id: configId,
      isActive,
      username,
      password,
      apiKey,
      apiSecret,
      endpointUrl,
      storeId,
      autoSyncEnabled,
      autoSyncInterval
    };

    return NextResponse.json({
      success: true,
      data: updatedConfig,
      message: 'ShipStation configuration saved successfully'
    });

  } catch (error) {
    console.error('Error saving ShipStation config:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove ShipStation configuration
 */
export async function DELETE(request: NextRequest) {
  try {
    const tokenResult = await verifyAdminToken(request);
    if (!tokenResult.success) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = tokenResult.decoded?.userId;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid user' },
        { status: 401 }
      );
    }

    // Get user's store ID
    const storeResult = await db.query(
      'SELECT id FROM stores WHERE user_id = $1',
      [userId]
    );

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const storeId = storeResult.rows[0].id;

    // Delete ShipStation integration
    await db.query(
      'DELETE FROM integrations WHERE store_id = $1 AND integration_type = $2',
      [storeId, 'shipstation']
    );

    return NextResponse.json({
      success: true,
      message: 'ShipStation integration removed successfully'
    });

  } catch (error) {
    console.error('Error deleting ShipStation config:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}