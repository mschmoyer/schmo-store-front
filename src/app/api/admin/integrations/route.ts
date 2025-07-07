import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { IntegrationUpdateSchema } from '@/lib/db/schema';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Simple encryption for API keys (in production, use proper encryption)
function encryptApiKey(apiKey: string): string {
  return Buffer.from(apiKey).toString('base64');
}

// function decryptApiKey(encryptedKey: string): string {
//   return Buffer.from(encryptedKey, 'base64').toString('utf-8');
// }

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get all integrations for the store
    const result = await db.query(`
      SELECT id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, api_key_encrypted, created_at, updated_at
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
    
    if (!integrationType || !['shipengine', 'stripe'].includes(integrationType)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid integration type'
      }, { status: 400 });
    }
    
    // Transform camelCase to snake_case for schema validation
    const transformedData = {
      api_key: updateData.apiKey,
      configuration: updateData.configuration,
      is_active: updateData.isActive,
      auto_sync_enabled: updateData.autoSyncEnabled,
      auto_sync_interval: updateData.autoSyncInterval
    };
    
    // Validate request body
    const validatedData = IntegrationUpdateSchema.parse(transformedData);
    
    // Encrypt API key
    const encryptedApiKey = encryptApiKey(validatedData.api_key);
    
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
          configuration = $2,
          is_active = $3,
          auto_sync_enabled = $4,
          auto_sync_interval = $5,
          updated_at = NOW()
        WHERE store_id = $6 AND integration_type = $7
        RETURNING id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, created_at, updated_at
      `, [
        encryptedApiKey,
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
        INSERT INTO store_integrations (id, store_id, integration_type, api_key_encrypted, configuration, is_active, auto_sync_enabled, auto_sync_interval)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, integration_type, is_active, configuration, auto_sync_enabled, auto_sync_interval, created_at, updated_at
      `, [
        uuidv4(),
        user.storeId,
        integrationType,
        encryptedApiKey,
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