import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Define schema inline since we removed the schema file
const IntegrationUpdateSchema = z.object({
  api_key: z.string().min(1, 'API key is required'),
  api_secret: z.string().optional(), // Required for ShipStation Legacy API
  configuration: z.object({}).optional(),
  is_active: z.boolean().optional(),
  auto_sync_enabled: z.boolean().optional(),
  auto_sync_interval: z.enum(['15min', '30min', '1hour', '4hour', '24hour']).optional()
});

// Simple encryption for API keys and secrets (in production, use proper encryption)
function encryptApiKey(apiKey: string): string {
  return Buffer.from(apiKey).toString('base64');
}

function encryptApiSecret(apiSecret: string): string {
  return Buffer.from(apiSecret).toString('base64');
}

// function decryptApiKey(encryptedKey: string): string {
//   return Buffer.from(encryptedKey, 'base64').toString('utf-8');
// }

// function decryptApiSecret(encryptedSecret: string): string {
//   return Buffer.from(encryptedSecret, 'base64').toString('utf-8');
// }

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get all integrations for the store
    const result = await db.query(`
      SELECT id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, api_key_encrypted, api_secret_encrypted, created_at, updated_at
      FROM store_integrations 
      WHERE store_id = $1
      ORDER BY integration_type
    `, [user.storeId]);
    
    const integrations = result.rows.map(row => ({
      id: row.id,
      integrationType: row.integration_type,
      isActive: row.is_active,
      configuration: row.configuration || {},
      hasApiKey: !!row.api_key_encrypted,
      hasApiSecret: !!row.api_secret_encrypted,
      autoSyncEnabled: row.auto_sync_enabled || false,
      autoSyncInterval: row.auto_sync_interval || '1hour',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    return NextResponse.json({
      success: true,
      data: { integrations }
    });
    
  } catch (error) {
    console.error('Get integrations error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    
    const { integrationType, ...updateData } = body;
    
    if (!integrationType || !['shipengine', 'shipstation', 'stripe', 'square', 'paypal'].includes(integrationType)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid integration type'
      }, { status: 400 });
    }
    
    // Transform camelCase to snake_case for schema validation
    const transformedData = {
      api_key: updateData.apiKey,
      api_secret: updateData.apiSecret,
      configuration: updateData.configuration,
      is_active: updateData.isActive,
      auto_sync_enabled: updateData.autoSyncEnabled,
      auto_sync_interval: updateData.autoSyncInterval
    };
    
    // Validate request body
    const validatedData = IntegrationUpdateSchema.parse(transformedData);
    
    // Special validation for ShipStation Legacy API
    if (integrationType === 'shipstation' && !validatedData.api_secret) {
      return NextResponse.json({
        success: false,
        error: 'API Secret is required for ShipStation Legacy API'
      }, { status: 400 });
    }
    
    // Encrypt API key and secret
    const encryptedApiKey = encryptApiKey(validatedData.api_key);
    const encryptedApiSecret = validatedData.api_secret ? encryptApiSecret(validatedData.api_secret) : null;
    
    // Check if integration already exists
    const existingResult = await db.query(`
      SELECT id FROM store_integrations 
      WHERE store_id = $1 AND integration_type = $2
    `, [user.storeId, integrationType]);
    
    let result;
    
    if (existingResult.rows.length > 0) {
      // Update existing integration
      result = await db.query(`
        UPDATE store_integrations 
        SET 
          api_key_encrypted = $1,
          api_secret_encrypted = $2,
          configuration = $3,
          is_active = $4,
          auto_sync_enabled = $5,
          auto_sync_interval = $6,
          updated_at = NOW()
        WHERE store_id = $7 AND integration_type = $8
        RETURNING id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, created_at, updated_at
      `, [
        encryptedApiKey,
        encryptedApiSecret,
        JSON.stringify(validatedData.configuration || {}),
        validatedData.is_active,
        validatedData.auto_sync_enabled || false,
        validatedData.auto_sync_interval || '1hour',
        user.storeId,
        integrationType
      ]);
    } else {
      // Create new integration
      result = await db.query(`
        INSERT INTO store_integrations (id, store_id, integration_type, api_key_encrypted, api_secret_encrypted, configuration, is_active, auto_sync_enabled, auto_sync_interval)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, created_at, updated_at
      `, [
        uuidv4(),
        user.storeId,
        integrationType,
        encryptedApiKey,
        encryptedApiSecret,
        JSON.stringify(validatedData.configuration || {}),
        validatedData.is_active,
        validatedData.auto_sync_enabled || false,
        validatedData.auto_sync_interval || '1hour'
      ]);
    }
    
    const integration = result.rows[0];
    
    return NextResponse.json({
      success: true,
      data: {
        integration: {
          id: integration.id,
          integrationType: integration.integration_type,
          isActive: integration.is_active,
          configuration: integration.configuration || {},
          hasApiKey: true,
          hasApiSecret: !!encryptedApiSecret,
          autoSyncEnabled: integration.auto_sync_enabled || false,
          autoSyncInterval: integration.auto_sync_interval || '1hour',
          createdAt: integration.created_at,
          updatedAt: integration.updated_at
        }
      },
      message: `${integrationType} integration updated successfully`
    });
    
  } catch (error) {
    console.error('Update integration error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}