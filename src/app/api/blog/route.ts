import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogFilters, BlogAPIResponse, BlogPostResponse } from '@/types/blog';
import { requireAuth, getSessionFromRequest } from '@/lib/auth/session';

// GET /api/blog - List published blog posts with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Extract filter parameters
    const filters: BlogFilters = {
      status: 'published', // Only return published posts for public API
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      search: searchParams.get('search') || undefined,
    };
    
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
    
    // Get blog posts
    const result = await blogUtils.getBlogPosts(storeId, filters, { page, limit });
    
    const response: BlogAPIResponse<BlogPostResponse> = {
      success: true,
      data: result
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog posts',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}

// POST /api/blog - Create a new blog post (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Require authentication for creating blog posts
    const user = await requireAuth(request);
    const storeId = user.storeId;
    
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'No store associated with user account' },
        { status: 400 }
      );
    }
    
    const newPost = await blogUtils.createBlogPost(storeId, body);
    
    const response: BlogAPIResponse<typeof newPost> = {
      success: true,
      data: newPost,
      message: 'Blog post created successfully'
    };
    
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to create blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}