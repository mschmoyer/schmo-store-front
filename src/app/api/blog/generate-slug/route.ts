import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse, BlogSlugResponse } from '@/types/blog';

// POST /api/blog/generate-slug - Generate URL slug from title
export async function POST(request: NextRequest) {
  try {
    const { title, excludeId } = await request.json();
    
    if (!title) {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Title is required',
        message: 'Please provide a title to generate a slug'
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Generate initial slug
    let slug = blogUtils.generateSlug(title);
    
    // Check if slug is unique
    let isUnique = await blogUtils.isSlugUnique(slug, excludeId);
    let counter = 1;
    
    // If not unique, append a number
    while (!isUnique) {
      const newSlug = `${slug}-${counter}`;
      isUnique = await blogUtils.isSlugUnique(newSlug, excludeId);
      if (isUnique) {
        slug = newSlug;
      }
      counter++;
      
      // Prevent infinite loop
      if (counter > 100) {
        slug = `${slug}-${Date.now()}`;
        break;
      }
    }
    
    const response: BlogSlugResponse = {
      success: true,
      slug
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating slug:', error);
    
    const response: BlogSlugResponse = {
      success: false,
      error: 'Failed to generate slug',
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}