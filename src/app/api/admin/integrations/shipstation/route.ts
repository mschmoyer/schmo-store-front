import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
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
  shipFromAddress?: {
    name: string;
    phone: string;
    email?: string;
    company_name?: string;
    address_line1: string;
    address_line2?: string;
    address_line3?: string;
    city_locality: string;
    state_province: string;
    postal_code: string;
    country_code: string;
    address_residential_indicator: 'yes' | 'no' | 'unknown';
    instructions?: string;
  };
}

/**
 * GET - Retrieve ShipStation configuration
 */
export async function GET(request: NextRequest) {
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

    // Get ShipStation integration config
    const configResult = await db.query(
      `SELECT 
        id,
        is_active,
        configuration,
        auto_sync_enabled,
        auto_sync_interval,
        api_key_encrypted,
        api_secret_encrypted,
        shipstation_username,
        shipstation_password_hash,
        shipstation_auth_enabled,
        created_at,
        updated_at
      FROM store_integrations 
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

    // Decrypt API credentials if they exist
    let decryptedApiKey = '';
    let decryptedApiSecret = '';
    
    if (config.api_key_encrypted && config.api_secret_encrypted) {
      try {
        decryptedApiKey = Buffer.from(config.api_key_encrypted, 'base64').toString('utf-8');
        decryptedApiSecret = Buffer.from(config.api_secret_encrypted, 'base64').toString('utf-8');
      } catch (error) {
        console.error('Error decrypting API credentials:', error);
      }
    }

    // Generate current credentials for display (they should match stored ones)
    let displayUsername = config.shipstation_username || '';
    let displayPassword = '';
    
    if (decryptedApiKey && storeId) {
      try {
        const credentialsResult = await db.query(
          `SELECT 
            generate_shipstation_username_deterministic($1, $2) as username,
            generate_shipstation_password_deterministic($1, $2) as password`,
          [storeId, decryptedApiKey]
        );
        
        displayUsername = credentialsResult.rows[0].username;
        displayPassword = credentialsResult.rows[0].password;
      } catch (error) {
        console.error('Error generating display credentials:', error);
      }
    }

    const shipstationConfig: ShipStationConfig = {
      id: String(config.id),
      isActive: Boolean(config.is_active),
      username: displayUsername, // Generated custom store username
      password: displayPassword, // Generated custom store password
      apiKey: decryptedApiKey,
      apiSecret: decryptedApiSecret,
      endpointUrl: (configData.endpointUrl as string) || '',
      storeId: storeId,
      autoSyncEnabled: Boolean(config.auto_sync_enabled),
      autoSyncInterval: (config.auto_sync_interval as '1hour' | '10min' | '1day') || '1hour',
      shipFromAddress: configData.shipFromAddress as ShipStationConfig['shipFromAddress']
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
    const user = await requireAuth(request);
    const userId = user.userId;

    const body = await request.json();
    const {
      isActive,
      apiKey,
      apiSecret,
      endpointUrl,
      autoSyncEnabled,
      autoSyncInterval,
      shipFromAddress
    } = body as ShipStationConfig;

    // Validate required fields - only need API key/secret now
    if (!apiKey || !apiSecret || !endpointUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: apiKey, apiSecret, endpointUrl' },
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

    // Generate deterministic custom store credentials
    const credentialsResult = await db.query(
      `SELECT 
        generate_shipstation_username_deterministic($1, $2) as username,
        generate_shipstation_password_deterministic($1, $2) as password`,
      [storeId, apiKey]
    );

    const generatedUsername = credentialsResult.rows[0].username;
    const generatedPassword = credentialsResult.rows[0].password;
    const hashedPassword = Buffer.from(generatedPassword).toString('base64');

    // Simple encryption for API credentials (base64 for now)
    const encryptedApiKey = Buffer.from(apiKey).toString('base64');
    const encryptedApiSecret = Buffer.from(apiSecret).toString('base64');

    // Configuration object to store
    const configuration = {
      endpointUrl,
      customStoreUsername: generatedUsername,
      lastGenerated: new Date().toISOString(),
      shipFromAddress: shipFromAddress || null
    };

    // Check if configuration already exists
    const existingResult = await db.query(
      'SELECT id FROM store_integrations WHERE store_id = $1 AND integration_type = $2',
      [storeId, 'shipstation']
    );

    let configId: string;

    if (existingResult.rows.length > 0) {
      // Update existing configuration
      configId = String(existingResult.rows[0].id);
      
      await db.query(
        `UPDATE store_integrations 
         SET is_active = $1, 
             configuration = $2, 
             auto_sync_enabled = $3, 
             auto_sync_interval = $4,
             api_key_encrypted = $5,
             api_secret_encrypted = $6,
             shipstation_username = $7,
             shipstation_password_hash = $8,
             shipstation_auth_enabled = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [
          isActive,
          JSON.stringify(configuration),
          autoSyncEnabled,
          autoSyncInterval,
          encryptedApiKey,
          encryptedApiSecret,
          generatedUsername,
          hashedPassword,
          configId
        ]
      );
    } else {
      // Create new configuration
      const insertResult = await db.query(
        `INSERT INTO store_integrations (
          store_id, 
          integration_type, 
          is_active, 
          configuration, 
          auto_sync_enabled, 
          auto_sync_interval,
          api_key_encrypted,
          api_secret_encrypted,
          shipstation_username,
          shipstation_password_hash,
          shipstation_auth_enabled,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id`,
        [
          storeId,
          'shipstation',
          isActive,
          JSON.stringify(configuration),
          autoSyncEnabled,
          autoSyncInterval,
          encryptedApiKey,
          encryptedApiSecret,
          generatedUsername,
          hashedPassword
        ]
      );
      
      configId = String(insertResult.rows[0].id);
    }

    // Return the updated configuration with generated credentials
    const updatedConfig: ShipStationConfig = {
      id: configId,
      isActive,
      username: generatedUsername, // Generated custom store username
      password: generatedPassword, // Generated custom store password (plain text for display)
      apiKey,
      apiSecret,
      endpointUrl,
      storeId,
      autoSyncEnabled,
      autoSyncInterval,
      shipFromAddress
    };

    return NextResponse.json({
      success: true,
      data: updatedConfig,
      message: 'ShipStation configuration saved successfully. Custom store credentials have been automatically generated.'
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