import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { BlogPost, BlogAPIResponse } from '@/types/blog';

// GET /api/blog/admin/[id] - Get a single blog post for admin editing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication for admin access
    const user = await requireAuth(request);
    const storeId = user.storeId;
    const { id: blogId } = await params;
    
    console.log('Admin blog fetch - Store ID:', storeId);
    console.log('Admin blog fetch - Blog ID:', blogId);
    
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'No store associated with user account' },
        { status: 400 }
      );
    }
    
    if (!blogId) {
      return NextResponse.json(
        { success: false, error: 'Blog post ID is required' },
        { status: 400 }
      );
    }
    
    // Get the blog post (admin can see all statuses)
    const result = await db.query(`
      SELECT 
        id,
        store_id,
        title,
        slug,
        content,
        excerpt,
        meta_title,
        meta_description,
        featured_image_url,
        status,
        published_at,
        scheduled_for,
        tags,
        category,
        view_count,
        created_at,
        updated_at
      FROM blog_posts 
      WHERE id = $1 AND store_id = $2
    `, [blogId, storeId]);
    
    if (result.rows.length === 0) {
      console.log('Blog post not found for Store ID:', storeId, 'Blog ID:', blogId);
      return NextResponse.json(
        { success: false, error: 'Blog post not found' },
        { status: 404 }
      );
    }
    
    const post = result.rows[0];
    console.log('Blog post found:', post.title, '(ID:', post.id, ')');
    
    // Transform the data to match BlogPost interface
    const blogPost: BlogPost = {
      id: post.id,
      storeId: post.store_id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      metaTitle: post.meta_title,
      metaDescription: post.meta_description,
      featuredImageUrl: post.featured_image_url,
      status: post.status,
      publishedAt: post.published_at,
      scheduledAt: post.scheduled_for,
      tags: Array.isArray(post.tags) ? post.tags : [],
      category: post.category,
      viewCount: post.view_count,
      createdAt: post.created_at,
      updatedAt: post.updated_at
    };
    
    const response: BlogAPIResponse<BlogPost> = {
      success: true,
      data: blogPost
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching admin blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT /api/blog/admin/[id] - Update a blog post (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication for admin access
    const user = await requireAuth(request);
    const storeId = user.storeId;
    const { id: blogId } = await params;
    
    console.log('Admin blog update - Store ID:', storeId);
    console.log('Admin blog update - Blog ID:', blogId);
    
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'No store associated with user account' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    console.log('Admin blog update - Request body keys:', Object.keys(body));
    
    // Update the blog post
    const result = await db.query(`
      UPDATE blog_posts 
      SET 
        title = $1,
        slug = $2,
        content = $3,
        excerpt = $4,
        meta_title = $5,
        meta_description = $6,
        featured_image_url = $7,
        status = $8,
        published_at = $9,
        scheduled_for = $10,
        tags = $11,
        category = $12,
        updated_at = NOW()
      WHERE id = $13 AND store_id = $14
      RETURNING id, title, slug, status
    `, [
      body.title,
      body.slug,
      body.content,
      body.excerpt,
      body.metaTitle,
      body.metaDescription,
      body.featuredImageUrl,
      body.status,
      body.publishedAt,
      body.scheduledAt,
      body.tags || [],
      body.category,
      blogId,
      storeId
    ]);
    
    if (result.rows.length === 0) {
      console.log('Blog post not found for update - Store ID:', storeId, 'Blog ID:', blogId);
      return NextResponse.json(
        { success: false, error: 'Blog post not found or unauthorized' },
        { status: 404 }
      );
    }
    
    const updatedPost = result.rows[0];
    console.log('Blog post updated successfully:', updatedPost.title, '(ID:', updatedPost.id, ')');
    
    const response: BlogAPIResponse<{ id: string; title: string; slug: string; status: string }> = {
      success: true,
      data: updatedPost
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating admin blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to update blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}