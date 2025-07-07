import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { BlogPost, BlogAPIResponse } from '@/types/blog';

// GET /api/blog/by-slug/[storeSlug]/[slug] - Get a single published blog post by slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeSlug: string; slug: string }> }
) {
  try {
    const { storeSlug, slug } = await params;
    
    if (!storeSlug || !slug) {
      return NextResponse.json(
        { success: false, error: 'Store slug and blog slug are required' },
        { status: 400 }
      );
    }
    
    // Get the blog post by slug and store slug (public access - only published posts)
    const result = await db.query(`
      SELECT 
        bp.id,
        bp.store_id,
        bp.title,
        bp.slug,
        bp.content,
        bp.excerpt,
        bp.meta_title,
        bp.meta_description,
        bp.featured_image_url,
        bp.status,
        bp.published_at,
        bp.scheduled_for,
        bp.tags,
        bp.category,
        bp.view_count,
        bp.created_at,
        bp.updated_at,
        s.store_name,
        s.store_slug,
        s.theme_name
      FROM blog_posts bp
      JOIN stores s ON bp.store_id = s.id
      WHERE bp.slug = $1 
        AND s.store_slug = $2 
        AND bp.status = 'published'
        AND s.is_active = true
        AND s.is_public = true
    `, [slug, storeSlug]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Blog post not found' },
        { status: 404 }
      );
    }
    
    const post = result.rows[0];
    
    // Increment view count
    await db.query(`
      UPDATE blog_posts 
      SET view_count = view_count + 1 
      WHERE id = $1
    `, [post.id]);
    
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
      viewCount: post.view_count + 1, // Include the incremented view count
      createdAt: post.created_at,
      updatedAt: post.updated_at
    };
    
    const response: BlogAPIResponse<BlogPost> = {
      success: true,
      data: blogPost
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog post by slug:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}