import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
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