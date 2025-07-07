import { NextRequest, NextResponse } from 'next/server';
import { Product, EnhancedProduct, ProductOverride } from '@/types/product';
import { ReviewSummary } from '@/types/review';
import { transformToEnhancedProduct } from '@/lib/product-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    
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

    // Fetch product from ShipStation API
    const productResponse = await fetch(
      `https://api.shipstation.com/v2/products/${productId}`,
      {
        method: 'GET',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!productResponse.ok) {
      if (productResponse.status === 404) {
        return NextResponse.json(
          { 
            error: 'Product not found',
            message: `Product with ID ${productId} does not exist`,
            code: 'PRODUCT_NOT_FOUND'
          }, 
          { status: 404 }
        );
      }
      
      const errorText = await productResponse.text();
      console.error(`ShipStation API error: ${productResponse.status} - ${errorText}`);
      
      return NextResponse.json(
        { 
          error: `ShipStation API error: ${productResponse.status}`,
          message: productResponse.status === 401 ? 'Invalid API key' : 
                   productResponse.status === 403 ? 'Access denied - check API key permissions' :
                   productResponse.status === 429 ? 'Rate limit exceeded - please try again later' :
                   `API returned ${productResponse.status}: ${productResponse.statusText}`,
          code: 'API_ERROR',
          status: productResponse.status
        }, 
        { status: productResponse.status }
      );
    }

    const shipstationProduct: Product = await productResponse.json();

    // Fetch inventory for this specific product
    let inventoryLevel = 0;
    try {
      const inventoryResponse = await fetch(
        `https://api.shipstation.com/v2/inventory?sku=${encodeURIComponent(shipstationProduct.sku)}`,
        {
          method: 'GET',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (inventoryResponse.ok) {
        const inventoryData = await inventoryResponse.json();
        if (inventoryData.inventory && Array.isArray(inventoryData.inventory)) {
          // Sum available inventory across all warehouses
          inventoryLevel = inventoryData.inventory.reduce((total: number, item: { available?: number }) => {
            return total + (item.available || 0);
          }, 0);
        }
      }
    } catch (inventoryError) {
      console.warn('Failed to fetch inventory for product:', inventoryError);
      // Continue without inventory data
    }

    // TODO: Fetch product overrides from database
    // For now, we'll use null as there's no database setup yet
    const productOverride: ProductOverride | null = null;

    // TODO: Fetch reviews summary from database
    // For now, we'll create a mock reviews summary
    const reviewsSummary: ReviewSummary = {
      product_id: productId,
      total_reviews: 0,
      average_rating: 0,
      rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      verified_purchase_count: 0,
      recent_reviews: [],
      featured_reviews: [],
      last_updated: new Date().toISOString()
    };

    // Transform to enhanced product
    const enhancedProduct: EnhancedProduct = transformToEnhancedProduct(
      shipstationProduct,
      productOverride || undefined,
      inventoryLevel
    );

    // TODO: Track product view analytics
    // This would be implemented when the database is set up

    return NextResponse.json({
      success: true,
      data: {
        product: enhancedProduct,
        reviews: reviewsSummary,
        inventory: {
          available: inventoryLevel,
          last_updated: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error fetching product:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch product',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'FETCH_ERROR'
      }, 
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    await params; // TODO: Implement product metadata updates (admin only)
    
    // TODO: Implement product metadata updates (admin only)
    // This would require authentication and database setup
    
    return NextResponse.json(
      { 
        error: 'Product updates not implemented',
        message: 'Product metadata updates require database setup',
        code: 'NOT_IMPLEMENTED'
      }, 
      { status: 501 }
    );

  } catch (error) {
    console.error('Error updating product:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to update product',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'UPDATE_ERROR'
      }, 
      { status: 500 }
    );
  }
}

// Helper function to fetch related/recommended products
export async function getRecommendedProducts(
  productId: string,
  category?: string,
  limit: number = 4
): Promise<Product[]> {
  try {
    const apiKey = process.env.SHIPSTATION_API_KEY;
    if (!apiKey) return [];

    // Fetch products from the same category
    const query = new URLSearchParams({
      page: '1',
      page_size: (limit * 2).toString(), // Fetch more to filter
      sort_dir: 'ASC',
      sort_by: 'SKU',
      show_inactive: 'false'
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
      return [];
    }

    const data = await response.json();
    
    if (!data.products || !Array.isArray(data.products)) {
      return [];
    }

    // Filter out the current product and products without images
    const filteredProducts = data.products
      .filter((product: Product) => 
        product.product_id !== productId && 
        product.thumbnail_url &&
        product.active !== false
      )
      .slice(0, limit);

    return filteredProducts;

  } catch (error) {
    console.error('Error fetching recommended products:', error);
    return [];
  }
}