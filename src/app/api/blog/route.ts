import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogFilters, BlogAPIResponse, BlogPostResponse } from '@/types/blog';

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
    
    // TODO: Extract storeId from request context or authentication
    // For now, using a placeholder - this route needs to be store-specific
    const storeId = 'placeholder-store-id';
    
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
    
    // TODO: Add authentication middleware to verify admin access
    // For now, we'll allow creation without authentication
    
    // TODO: Extract storeId from request context or authentication
    const storeId = 'placeholder-store-id';
    
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