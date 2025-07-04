import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Check if API key is configured
    const apiKey = process.env.SHIPSTATION_API_KEY;
    if (!apiKey || apiKey === 'your_shipstation_api_key_here') {
      return NextResponse.json(
        { 
          error: 'ShipStation API key not configured', 
          message: 'Please set SHIPSTATION_API_KEY in your environment variables',
          code: 'MISSING_API_KEY'
        }, 
        { status: 400 }
      );
    }
    
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