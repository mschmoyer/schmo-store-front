import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse } from '@/types/blog';
import { getSessionFromRequest } from '@/lib/auth/session';

// GET /api/blog/categories - Get all blog categories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Try to get storeId from query params first (for public access)
    let storeId = searchParams.get('storeId');
    
    // If no storeId in params, try to get from authenticated user session
    if (!storeId) {
      const user = await getSessionFromRequest(request);
      if (user?.storeId) {
        storeId = user.storeId;
      } else {
        return NextResponse.json(
          { success: false, error: 'Store ID required. Provide storeId parameter or authenticate.' },
          { status: 400 }
        );
      }
    }
    
    const categories = await blogUtils.getBlogCategories(storeId);
    
    const response: BlogAPIResponse<string[]> = {
      success: true,
      data: categories
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog categories:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog categories',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}