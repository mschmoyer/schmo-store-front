import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogFilters, BlogAPIResponse, BlogPostResponse } from '@/types/blog';

// GET /api/blog/admin - List all blog posts for admin (including drafts and scheduled)
export async function GET(request: NextRequest) {
  try {
    // TODO: Add authentication middleware to verify admin access
    // For now, we'll allow access without authentication
    
    const { searchParams } = new URL(request.url);
    
    // Extract pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Extract filter parameters
    const filters: BlogFilters = {
      status: searchParams.get('status') as 'draft' | 'published' | 'scheduled' || undefined,
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      search: searchParams.get('search') || undefined,
    };
    
    // Get blog posts (including all statuses for admin)
    const result = await blogUtils.getBlogPosts(filters, { page, limit });
    
    const response: BlogAPIResponse<BlogPostResponse> = {
      success: true,
      data: result
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching admin blog posts:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog posts',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}