import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { z } from 'zod';

// Define schema inline since we removed the schema file
const StoreConfigUpdateSchema = z.object({
  store_name: z.string().min(1, 'Store name is required').optional(),
  store_slug: z.string().min(1, 'Store slug is required').optional(),
  store_description: z.string().optional(),
  hero_title: z.string().optional(),
  hero_description: z.string().optional(),
  theme_name: z.string().optional()
});

const AIStoreDetailsSchema = z.object({
  storeId: z.string(),
  storeName: z.string(),
  storeDescription: z.string(),
  heroTitle: z.string(),
  heroDescription: z.string(),
  theme: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string()
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get store configuration
    const storeResult = await db.query(`
      SELECT id, store_name, store_slug, store_description, hero_title, hero_description, theme_name, created_at, updated_at
      FROM stores 
      WHERE id = $1
    `, [user.storeId]);
    
    if (storeResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }
    
    const store = storeResult.rows[0];
    
    // Get store integrations
    const integrationsResult = await db.query(`
      SELECT id, integration_type, is_active, configuration, created_at, updated_at
      FROM store_integrations 
      WHERE store_id = $1
    `, [user.storeId]);
    
    // Get store categories
    const categoriesResult = await db.query(`
      SELECT id, name as category_name, is_active as is_visible, sort_order, created_at, updated_at
      FROM categories 
      WHERE store_id = $1
      ORDER BY sort_order ASC
    `, [user.storeId]);
    
    return NextResponse.json({
      success: true,
      data: {
        store: {
          id: store.id,
          name: store.store_name,
          slug: store.store_slug,
          description: store.store_description,
          heroTitle: store.hero_title,
          heroDescription: store.hero_description,
          themeId: store.theme_name,
          createdAt: store.created_at,
          updatedAt: store.updated_at
        },
        integrations: integrationsResult.rows.map(row => ({
          id: row.id,
          integrationType: row.integration_type,
          isActive: row.is_active,
          configuration: row.configuration,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        categories: categoriesResult.rows.map(row => ({
          id: row.id,
          categoryName: row.category_name,
          isVisible: row.is_visible,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      }
    });
    
  } catch (error) {
    console.error('Get store config error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    
    // Validate request body
    const updateData = StoreConfigUpdateSchema.parse(body);
    
    // Update store configuration
    const result = await db.query(`
      UPDATE stores 
      SET 
        store_name = $1, 
        store_description = $2, 
        hero_title = $3, 
        hero_description = $4, 
        theme_name = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, store_name, store_slug, store_description, hero_title, hero_description, theme_name, created_at, updated_at
    `, [
      updateData.name,
      updateData.description,
      updateData.hero_title,
      updateData.hero_description,
      updateData.theme_id,
      user.storeId
    ]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }
    
    const store = result.rows[0];
    
    return NextResponse.json({
      success: true,
      data: {
        store: {
          id: store.id,
          name: store.store_name,
          slug: store.store_slug,
          description: store.store_description,
          heroTitle: store.hero_title,
          heroDescription: store.hero_description,
          themeId: store.theme_name,
          createdAt: store.created_at,
          updatedAt: store.updated_at
        }
      },
      message: 'Store configuration updated successfully'
    });
    
  } catch (error) {
    console.error('Update store config error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    
    // Validate request body for AI-generated store details
    const aiData = AIStoreDetailsSchema.parse(body);
    
    // Ensure the user can only update their own store
    if (aiData.storeId !== user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 403 });
    }
    
    // Update store with AI-generated details
    const result = await db.query(`
      UPDATE stores 
      SET 
        store_name = $1, 
        store_description = $2, 
        hero_title = $3, 
        hero_description = $4, 
        theme_name = $5,
        meta_title = $6,
        meta_description = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING id, store_name, store_slug, store_description, hero_title, hero_description, theme_name, meta_title, meta_description, created_at, updated_at
    `, [
      aiData.storeName,
      aiData.storeDescription,
      aiData.heroTitle,
      aiData.heroDescription,
      aiData.theme,
      aiData.metaTitle,
      aiData.metaDescription,
      user.storeId
    ]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }
    
    const store = result.rows[0];
    
    return NextResponse.json({
      success: true,
      data: {
        store: {
          id: store.id,
          name: store.store_name,
          slug: store.store_slug,
          description: store.store_description,
          heroTitle: store.hero_title,
          heroDescription: store.hero_description,
          themeId: store.theme_name,
          metaTitle: store.meta_title,
          metaDescription: store.meta_description,
          createdAt: store.created_at,
          updatedAt: store.updated_at
        }
      },
      message: 'Store details applied successfully'
    });
    
  } catch (error) {
    console.error('Apply AI store details error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}