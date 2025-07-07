import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { OpenAIService } from '@/lib/services/openai';
import { 
  buildBlogPostPrompt, 
  BLOG_POST_SYSTEM_PROMPT, 
  BLOG_POST_FUNCTION_SCHEMA,
  type BlogPostPromptData,
  type GeneratedBlogPost
} from '@/lib/prompts/blog-post';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user first
    const user = await requireAuth(request);
    const { userPrompt } = await request.json();

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return NextResponse.json(
        { error: 'Blog post prompt is required' },
        { status: 400 }
      );
    }

    // Get store information using authenticated user's store ID
    const storeResult = await db.query(`
      SELECT store_name, store_description, hero_title, hero_description 
      FROM stores 
      WHERE id = $1
    `, [user.storeId]);

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    const store = storeResult.rows[0];

    // Get product information for context
    const productsResult = await db.query(`
      SELECT 
        p.name,
        p.short_description,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
      LIMIT 50
    `, [user.storeId]);

    const products = productsResult.rows;

    // Get existing blog post titles to avoid duplicates
    const existingBlogsResult = await db.query(`
      SELECT title 
      FROM blog_posts 
      WHERE store_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `, [user.storeId]);

    const existingBlogTitles = existingBlogsResult.rows.map(row => String(row.title));

    // Analyze product categories and names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = [...new Set(products.map(p => (p as any).category_name).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productNames = products.map(p => (p as any).name).filter(Boolean);

    // Prepare prompt data
    const promptData: BlogPostPromptData = {
      userPrompt: userPrompt.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storeName: (store as any).store_name || 'Your Store',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storeDescription: (store as any).store_description || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      heroTitle: (store as any).hero_title || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      heroDescription: (store as any).hero_description || '',
      productNames,
      categories,
      existingBlogTitles
    };

    // Generate AI-powered blog post
    const openAIService = OpenAIService.getInstance();
    const userPromptText = buildBlogPostPrompt(promptData);
    
    const generatedBlogPost = await openAIService.generateWithFunctionCalling<GeneratedBlogPost>(
      BLOG_POST_SYSTEM_PROMPT,
      userPromptText,
      BLOG_POST_FUNCTION_SCHEMA,
      'generate_blog_post'
    );

    // Save blog post as draft to database
    const insertResult = await db.query(`
      INSERT INTO blog_posts (
        store_id, 
        title, 
        slug, 
        content, 
        excerpt, 
        meta_title, 
        meta_description, 
        tags, 
        status, 
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), NOW())
      RETURNING id, slug
    `, [
      user.storeId,
      generatedBlogPost.title,
      generatedBlogPost.slug,
      generatedBlogPost.content,
      generatedBlogPost.excerpt,
      generatedBlogPost.metaTitle,
      generatedBlogPost.metaDescription,
      generatedBlogPost.tags
    ]);

    const newBlogPost = insertResult.rows[0];
    
    console.log('Blog post generator - Store ID:', user.storeId);
    console.log('Blog post generator - Generated blog ID:', newBlogPost.id);
    console.log('Blog post generator - Title:', generatedBlogPost.title);
    console.log('Blog post generator - Slug:', generatedBlogPost.slug);
    
    return NextResponse.json({
      success: true,
      data: {
        ...generatedBlogPost,
        id: newBlogPost.id,
        storeId: user.storeId
      },
      analytics: {
        productsAnalyzed: products.length,
        categoriesFound: categories.length,
        existingBlogTitles: existingBlogTitles.length
      },
      redirectUrl: `/admin/blog/edit/${newBlogPost.id}`
    });

  } catch (error) {
    console.error('Error generating blog post:', error);
    return NextResponse.json(
      { error: 'Failed to generate blog post' },
      { status: 500 }
    );
  }
}

