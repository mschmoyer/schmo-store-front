/**
 * ShipStation Authentication Service
 * Handles authentication for ShipStation Custom Store API
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/database';

/**
 * Simple decryption functions (should match the encryption in integrations route)
 */
function decryptApiKey(encryptedKey: string): string {
  return Buffer.from(encryptedKey, 'base64').toString('utf-8');
}

function decryptApiSecret(encryptedSecret: string): string {
  return Buffer.from(encryptedSecret, 'base64').toString('utf-8');
}

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
    
    // Look up credentials in database - support both API key/secret AND username/password authentication
    const result = await db.query(
      `SELECT 
        i.id,
        i.store_id,
        i.is_active,
        i.configuration,
        i.api_key_encrypted,
        i.api_secret_encrypted,
        i.shipstation_username,
        i.shipstation_password_hash,
        i.shipstation_auth_enabled
      FROM store_integrations i
      WHERE i.integration_type = 'shipstation' 
        AND i.is_active = true`,
      []
    );
    
    // Check each integration to find matching credentials
    for (const integration of result.rows) {
      try {
        // Method 1: Try ShipStation username/password authentication (preferred)
        if (integration.shipstation_auth_enabled && integration.shipstation_username && integration.shipstation_password_hash) {
          if (username === integration.shipstation_username) {
            // For now, we'll use simple comparison - in production, use proper password hashing (bcrypt)
            const hashedPassword = Buffer.from(password).toString('base64');
            if (hashedPassword === integration.shipstation_password_hash) {
              const decryptedApiKey = decryptApiKey(integration.api_key_encrypted);
              const decryptedApiSecret = decryptApiSecret(integration.api_secret_encrypted);
              
              return {
                success: true,
                storeId: integration.store_id,
                credentials: {
                  username,
                  password,
                  apiKey: decryptedApiKey,
                  apiSecret: decryptedApiSecret,
                  storeId: integration.store_id,
                  isActive: integration.is_active
                }
              };
            }
          }
        }
        
        // Method 2: Fall back to API key/secret as username/password (legacy)
        if (integration.api_key_encrypted && integration.api_secret_encrypted) {
          const decryptedApiKey = decryptApiKey(integration.api_key_encrypted);
          const decryptedApiSecret = decryptApiSecret(integration.api_secret_encrypted);
          
          if (username === decryptedApiKey && password === decryptedApiSecret) {
            return {
              success: true,
              storeId: integration.store_id,
              credentials: {
                username,
                password,
                apiKey: decryptedApiKey,
                apiSecret: decryptedApiSecret,
                storeId: integration.store_id,
                isActive: integration.is_active
              }
            };
          }
        }
      } catch (decryptError) {
        // Skip this integration if decryption fails
        console.error('Failed to decrypt credentials for integration:', integration.id, decryptError);
        continue;
      }
    }
    
    return {
      success: false,
      error: 'Invalid credentials'
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
        i.configuration,
        i.api_key_encrypted,
        i.api_secret_encrypted
      FROM store_integrations i
      WHERE i.integration_type = 'shipstation' 
        AND i.is_active = true`,
      []
    );
    
    // Check each integration to find matching API credentials
    for (const integration of result.rows) {
      try {
        const decryptedApiKey = decryptApiKey(integration.api_key_encrypted);
        const decryptedApiSecret = decryptApiSecret(integration.api_secret_encrypted);
        
        if (apiKey === decryptedApiKey && apiSecret === decryptedApiSecret) {
          return {
            success: true,
            storeId: integration.store_id,
            credentials: {
              username: decryptedApiKey, // Use API key as username
              password: decryptedApiSecret, // Use API secret as password
              apiKey: decryptedApiKey,
              apiSecret: decryptedApiSecret,
              storeId: integration.store_id,
              isActive: integration.is_active
            }
          };
        }
      } catch (decryptError) {
        // Skip this integration if decryption fails
        console.error('Failed to decrypt API credentials for integration:', integration.id, decryptError);
        continue;
      }
    }
    
    return {
      success: false,
      error: 'Invalid API credentials'
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
        i.configuration,
        i.api_key_encrypted,
        i.api_secret_encrypted
      FROM store_integrations i
      WHERE i.store_id = $1 
        AND i.integration_type = 'shipstation' 
        AND i.is_active = true`,
      [storeId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const integration = result.rows[0];
    
    try {
      const decryptedApiKey = decryptApiKey(integration.api_key_encrypted);
      const decryptedApiSecret = decryptApiSecret(integration.api_secret_encrypted);
      
      return {
        username: decryptedApiKey, // API key as username
        password: decryptedApiSecret, // API secret as password
        apiKey: decryptedApiKey,
        apiSecret: decryptedApiSecret,
        storeId: integration.store_id,
        isActive: integration.is_active
      };
    } catch (error) {
      console.error('Failed to decrypt ShipStation credentials:', error);
      return null;
    }
    
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
    
    // For verification, we'll just validate the format - actual authentication happens during requests
    return {
      success: true // Allow credentials to be saved, they'll be tested during authentication
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
    // Skip logging if we don't have a store_id (authentication failures)
    if (!result.storeId) {
      console.log(`Authentication failed: ${result.error || 'Unknown error'}`);
      return;
    }

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
        result.storeId,
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