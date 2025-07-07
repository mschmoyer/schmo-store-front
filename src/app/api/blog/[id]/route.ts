import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse } from '@/types/blog';
import { getSessionFromRequest } from '@/lib/auth/session';

// GET /api/blog/[id] - Get a single blog post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    
    const post = await blogUtils.getBlogPostById(storeId, id);
    
    if (!post) {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: `No blog post found with ID: ${id}`
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    // Only return published posts for public API, unless it's an admin request
    // TODO: Add admin authentication check here
    if (post.status !== 'published') {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: 'This blog post is not published'
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    const response: BlogAPIResponse<typeof post> = {
      success: true,
      data: post
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT /api/blog/[id] - Update a blog post (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // TODO: Add authentication middleware to verify admin access
    // For now, we'll allow updates without authentication
    
    const updatedPost = await blogUtils.updateBlogPost(id, body);
    
    if (!updatedPost) {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: `No blog post found with ID: ${id}`
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    const response: BlogAPIResponse<typeof updatedPost> = {
      success: true,
      data: updatedPost,
      message: 'Blog post updated successfully'
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to update blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}

// DELETE /api/blog/[id] - Delete a blog post (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // TODO: Add authentication middleware to verify admin access
    // For now, we'll allow deletion without authentication
    
    const success = await blogUtils.deleteBlogPost(id);
    
    if (!success) {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: `No blog post found with ID: ${id}`
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    const response: BlogAPIResponse<null> = {
      success: true,
      message: 'Blog post deleted successfully'
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error deleting blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to delete blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}