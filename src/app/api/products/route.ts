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
      WHERE store_id = $1 AND integration_type = 'shipengine'
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
    const query = new URLSearchParams({
      page: searchParams.get('page') || '1',
      page_size: searchParams.get('page_size') || '25',
      sort_dir: searchParams.get('sort_dir') || 'ASC',
      sort_by: searchParams.get('sort_by') || 'SKU',
      show_inactive: searchParams.get('show_inactive') || 'false'
    }).toString();

    const response = await fetch(
      `https://api.shipstation.com/v2/products?${query}`,
      {
        method: 'GET',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ShipStation API error: ${response.status} - ${errorText}`);
      
      return NextResponse.json(
        { 
          error: `ShipStation API error: ${response.status}`,
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
    console.error('Error fetching products:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch products',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'FETCH_ERROR'
      }, 
      { status: 500 }
    );
  }
}