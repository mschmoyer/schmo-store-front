import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    
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
    
    const encryptedApiKey = String(integrationResult.rows[0].api_key_encrypted);
    const apiKey = Buffer.from(encryptedApiKey, 'base64').toString('utf-8');
    
    // Forward query parameters to ShipStation API
    const query = new URLSearchParams();
    
    const skuParam = searchParams.get('sku');
    if (skuParam) {
      query.set('sku', skuParam);
    }
    
    if (searchParams.get('inventory_warehouse_id')) {
      query.set('inventory_warehouse_id', searchParams.get('inventory_warehouse_id')!);
    }
    
    if (searchParams.get('inventory_location_id')) {
      query.set('inventory_location_id', searchParams.get('inventory_location_id')!);
    }
    
    query.set('group_by', searchParams.get('group_by') || 'warehouse');
    
    if (searchParams.get('limit')) {
      query.set('limit', searchParams.get('limit')!);
    }
    
    const queryString = query.toString();
    const url = `https://api.shipstation.com/v2/inventory?${queryString}`;
    
    console.log('Inventory API: Making request to:', url);
    console.log('Inventory API: Query params:', Object.fromEntries(query));

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ShipStation Inventory API error: ${response.status} - ${errorText}`);
      
      return NextResponse.json(
        { 
          error: `ShipStation Inventory API error: ${response.status}`,
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
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching inventory:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch inventory',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'FETCH_ERROR'
      }, 
      { status: 500 }
    );
  }
}