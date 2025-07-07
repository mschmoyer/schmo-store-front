import { NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse, BlogStats } from '@/types/blog';

// GET /api/blog/stats - Get blog statistics
export async function GET() {
  try {
    // TODO: Add authentication middleware to verify admin access
    // For now, we'll allow access without authentication
    
    // TODO: Extract storeId from request context or authentication
    const storeId = 'placeholder-store-id';
    
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