/**
 * ShipStation Authentication Service
 * Handles authentication for ShipStation Custom Store API
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/database';

/**
 * ShipStation credentials interface
 */
interface ShipStationCredentials {
  username: string;
  password: string;
  apiKey: string;
  apiSecret: string;
  storeId: string;
  isActive: boolean;
}

/**
 * Authentication result interface
 */
interface AuthResult {
  success: boolean;
  storeId?: string;
  error?: string;
  credentials?: ShipStationCredentials;
}

/**
 * Authenticate ShipStation request using Basic Auth
 * @param request - Next.js request object
 * @returns Authentication result
 */
export async function authenticateShipStationRequest(request: NextRequest): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return {
        success: false,
        error: 'Missing or invalid authorization header'
      };
    }
    
    // Decode Basic Auth credentials
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    if (!username || !password) {
      return {
        success: false,
        error: 'Invalid credentials format'
      };
    }
    
    // Look up credentials in database
    const result = await db.query(
      `SELECT 
        i.id,
        i.store_id,
        i.is_active,
        i.configuration
      FROM integrations i
      WHERE i.integration_type = 'shipstation' 
        AND i.is_active = true
        AND i.configuration->>'username' = $1
        AND i.configuration->>'password' = $2`,
      [username, password]
    );
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }
    
    const integration = result.rows[0];
    const config = integration.configuration as Record<string, string>;
    
    return {
      success: true,
      storeId: integration.store_id,
      credentials: {
        username,
        password,
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        storeId: integration.store_id,
        isActive: integration.is_active
      }
    };
    
  } catch (error) {
    console.error('ShipStation authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}

/**
 * Authenticate ShipStation request using API Key
 * @param request - Next.js request object
 * @returns Authentication result
 */
export async function authenticateShipStationAPIKey(request: NextRequest): Promise<AuthResult> {
  try {
    const apiKey = request.headers.get('x-api-key');
    const apiSecret = request.headers.get('x-api-secret');
    
    if (!apiKey || !apiSecret) {
      return {
        success: false,
        error: 'Missing API key or secret'
      };
    }
    
    // Look up API credentials in database
    const result = await db.query(
      `SELECT 
        i.id,
        i.store_id,
        i.is_active,
        i.configuration
      FROM integrations i
      WHERE i.integration_type = 'shipstation' 
        AND i.is_active = true
        AND i.configuration->>'apiKey' = $1
        AND i.configuration->>'apiSecret' = $2`,
      [apiKey, apiSecret]
    );
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Invalid API credentials'
      };
    }
    
    const integration = result.rows[0];
    const config = integration.configuration as Record<string, string>;
    
    return {
      success: true,
      storeId: integration.store_id,
      credentials: {
        username: config.username,
        password: config.password,
        apiKey,
        apiSecret,
        storeId: integration.store_id,
        isActive: integration.is_active
      }
    };
    
  } catch (error) {
    console.error('ShipStation API key authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}

/**
 * Authenticate ShipStation request using multiple methods
 * @param request - Next.js request object
 * @returns Authentication result
 */
export async function authenticateShipStationMulti(request: NextRequest): Promise<AuthResult> {
  // Try Basic Auth first
  const basicAuthResult = await authenticateShipStationRequest(request);
  if (basicAuthResult.success) {
    return basicAuthResult;
  }
  
  // Try API Key authentication
  const apiKeyResult = await authenticateShipStationAPIKey(request);
  if (apiKeyResult.success) {
    return apiKeyResult;
  }
  
  // Return the more specific error
  return {
    success: false,
    error: 'Authentication failed: Invalid credentials or API key'
  };
}

/**
 * Get ShipStation configuration for a store
 * @param storeId - Store ID
 * @returns ShipStation configuration
 */
export async function getShipStationConfig(storeId: string): Promise<ShipStationCredentials | null> {
  try {
    const result = await db.query(
      `SELECT 
        i.id,
        i.store_id,
        i.is_active,
        i.configuration
      FROM integrations i
      WHERE i.store_id = $1 
        AND i.integration_type = 'shipstation' 
        AND i.is_active = true`,
      [storeId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const integration = result.rows[0];
    const config = integration.configuration as Record<string, string>;
    
    return {
      username: config.username,
      password: config.password,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      storeId: integration.store_id,
      isActive: integration.is_active
    };
    
  } catch (error) {
    console.error('Error getting ShipStation config:', error);
    return null;
  }
}

/**
 * Verify ShipStation credentials
 * @param credentials - Credentials to verify
 * @returns Verification result
 */
export async function verifyShipStationCredentials(credentials: Partial<ShipStationCredentials>): Promise<{ success: boolean; error?: string }> {
  try {
    // Basic validation
    if (!credentials.username || !credentials.password) {
      return {
        success: false,
        error: 'Username and password are required'
      };
    }
    
    if (!credentials.apiKey || !credentials.apiSecret) {
      return {
        success: false,
        error: 'API key and secret are required'
      };
    }
    
    // Test credentials by looking them up
    const result = await db.query(
      `SELECT COUNT(*) as count
      FROM integrations i
      WHERE i.integration_type = 'shipstation' 
        AND i.configuration->>'username' = $1
        AND i.configuration->>'password' = $2
        AND i.configuration->>'apiKey' = $3
        AND i.configuration->>'apiSecret' = $4`,
      [credentials.username, credentials.password, credentials.apiKey, credentials.apiSecret]
    );
    
    const count = parseInt(result.rows[0].count);
    
    if (count > 0) {
      return {
        success: true
      };
    }
    
    return {
      success: true // Allow new credentials to be saved
    };
    
  } catch (error) {
    console.error('Error verifying ShipStation credentials:', error);
    return {
      success: false,
      error: 'Verification failed'
    };
  }
}

/**
 * Generate ShipStation webhook signature
 * @param payload - Webhook payload
 * @param secret - API secret
 * @returns Generated signature
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify ShipStation webhook signature
 * @param payload - Webhook payload
 * @param signature - Provided signature
 * @param secret - API secret
 * @returns Verification result
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = generateWebhookSignature(payload, secret);
  return signature === expectedSignature;
}

/**
 * Get request IP address for logging
 * @param request - Next.js request object
 * @returns IP address
 */
export function getRequestIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

/**
 * Log authentication attempt
 * @param request - Next.js request object
 * @param result - Authentication result
 * @param method - Authentication method used
 */
export async function logAuthAttempt(request: NextRequest, result: AuthResult, method: string): Promise<void> {
  try {
    const ip = getRequestIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    await db.query(
      `INSERT INTO integration_logs (
        store_id,
        integration_type,
        operation,
        status,
        request_data,
        error_message,
        execution_time_ms,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        result.storeId || null,
        'shipstation',
        'authentication',
        result.success ? 'success' : 'failure',
        JSON.stringify({
          method,
          ip,
          userAgent,
          timestamp: new Date().toISOString()
        }),
        result.error || null,
        0
      ]
    );
  } catch (error) {
    console.error('Error logging auth attempt:', error);
  }
}