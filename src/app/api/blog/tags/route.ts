import { NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse } from '@/types/blog';

// GET /api/blog/tags - Get all blog tags
export async function GET() {
  try {
    // TODO: Extract storeId from request context or authentication
    const storeId = 'placeholder-store-id';
    
    const tags = await blogUtils.getBlogTags(storeId);
    
    const response: BlogAPIResponse<string[]> = {
      success: true,
      data: tags
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog tags:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog tags',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}