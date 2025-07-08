import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';

/**
 * POST - Generate new ShipStation username/password credentials
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

    // Check if ShipStation integration exists
    const integrationResult = await db.query(
      `SELECT id, shipstation_username, shipstation_auth_enabled 
       FROM store_integrations 
       WHERE store_id = $1 AND integration_type = 'shipstation'`,
      [storeId]
    );

    if (integrationResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ShipStation integration not found. Please configure ShipStation API credentials first.' },
        { status: 404 }
      );
    }

    const integration = integrationResult.rows[0];

    // Generate new credentials
    const generateUsernameResult = await db.query(
      'SELECT generate_shipstation_username($1) as username',
      [storeId]
    );
    
    const generatePasswordResult = await db.query(
      'SELECT generate_shipstation_password() as password'
    );

    const newUsername = generateUsernameResult.rows[0].username;
    const newPassword = generatePasswordResult.rows[0].password;
    
    // Hash the password (simple base64 for now - use bcrypt in production)
    const hashedPassword = Buffer.from(newPassword).toString('base64');

    // Update the integration with new credentials
    await db.query(
      `UPDATE store_integrations 
       SET shipstation_username = $1, 
           shipstation_password_hash = $2, 
           shipstation_auth_enabled = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newUsername, hashedPassword, integration.id]
    );

    // Return the credentials (password in plain text for user to copy)
    return NextResponse.json({
      success: true,
      data: {
        username: newUsername,
        password: newPassword,
        message: 'ShipStation credentials generated successfully. Please save these credentials as they will not be shown again.',
        previousUsername: integration.shipstation_username || null,
        wasEnabled: integration.shipstation_auth_enabled || false
      }
    });

  } catch (error) {
    console.error('Error generating ShipStation credentials:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Disable ShipStation username/password authentication
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

    // Disable ShipStation username/password authentication
    const result = await db.query(
      `UPDATE store_integrations 
       SET shipstation_username = NULL, 
           shipstation_password_hash = NULL, 
           shipstation_auth_enabled = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE store_id = $1 AND integration_type = 'shipstation'
       RETURNING id`,
      [storeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ShipStation integration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ShipStation username/password authentication disabled. API key/secret authentication is still available.'
    });

  } catch (error) {
    console.error('Error disabling ShipStation credentials:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}