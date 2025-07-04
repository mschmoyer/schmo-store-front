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