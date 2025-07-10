import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    // Initialize database connection
    await db.initialize();
    
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const id = searchParams.get('id');
    
    if (slug || id) {
      // Get specific store by slug or ID
      let query = `SELECT id, store_name, store_slug, store_description, hero_title, hero_description, 
                          theme_name, currency, is_active, is_public, meta_title, meta_description
                   FROM stores 
                   WHERE is_active = true AND is_public = true`;
      let params: string[] = [];
      
      if (slug) {
        query += ` AND store_slug = $1`;
        params = [slug];
      } else if (id) {
        query += ` AND id = $1`;
        params = [id];
      }

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        console.error(`Failed to fetch store by ${slug ? 'slug' : 'id'}: ${slug || id}`);
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