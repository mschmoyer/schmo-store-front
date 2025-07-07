import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    // Initialize database connection
    await db.initialize();
    
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    
    if (slug) {
      // Get specific store by slug
      const result = await db.query(
        `SELECT id, store_name, store_slug, store_description, hero_title, hero_description, 
                theme_name, currency, is_active, is_public, meta_title, meta_description
         FROM stores 
         WHERE store_slug = $1 AND is_active = true AND is_public = true`,
        [slug]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Store not found or not public'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: result.rows[0]
      });
    } else {
      // Get all public stores
      const result = await db.query(
        `SELECT id, store_name, store_slug, store_description, theme_name, is_active, is_public, meta_description
         FROM stores 
         WHERE is_active = true AND is_public = true
         ORDER BY created_at DESC`
      );

      return NextResponse.json({
        success: true,
        data: result.rows,
        stores: result.rows, // For backward compatibility
        count: result.rows.length
      });
    }

  } catch (error) {
    console.error('Error fetching public stores:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}