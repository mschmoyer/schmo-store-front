import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get ShipEngine integration from database
    const integrationResult = await db.query(`
      SELECT api_key_encrypted, is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipstation'
    `, [user.storeId]);
    
    if (integrationResult.rows.length === 0 || !integrationResult.rows[0].is_active) {
      return NextResponse.json({
        error: 'ShipEngine integration not found or inactive',
        message: 'Please configure ShipEngine integration in your store settings',
        code: 'MISSING_INTEGRATION'
      }, { status: 400 });
    }
    
    const encryptedApiKey = integrationResult.rows[0].api_key_encrypted;
    const apiKey = Buffer.from(String(encryptedApiKey), 'base64').toString('utf-8');
    
    const url = 'https://api.shipstation.com/v2/warehouses';
    
    console.log('Warehouses API: Making request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ShipStation Warehouses API error: ${response.status} - ${errorText}`);
      
      return NextResponse.json(
        { 
          error: `ShipStation Warehouses API error: ${response.status}`,
          message: response.status === 401 ? 'Invalid API key' : 
                   response.status === 403 ? 'Access denied - check API key permissions' :
                   response.status === 429 ? 'Rate limit exceeded - please try again later' :
                   `API returned ${response.status}: ${response.statusText}`,
          code: 'API_ERROR',
          status: response.status
        }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Warehouses API response:', data);
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch warehouses',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'FETCH_ERROR'
      }, 
      { status: 500 }
    );
  }
}