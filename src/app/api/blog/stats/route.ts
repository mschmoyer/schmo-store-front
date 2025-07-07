import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse, BlogStats } from '@/types/blog';
import { getSessionFromRequest } from '@/lib/auth/session';

// GET /api/blog/stats - Get blog statistics
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
    
    const stats = await blogUtils.getBlogStats(storeId);
    
    const response: BlogAPIResponse<BlogStats> = {
      success: true,
      data: stats
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog statistics:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}