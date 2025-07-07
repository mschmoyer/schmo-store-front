import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';
import { OpenAIService } from '@/lib/services/openai';
import { 
  buildStoreDetailsPrompt, 
  STORE_DETAILS_SYSTEM_PROMPT, 
  STORE_DETAILS_FUNCTION_SCHEMA,
  type StoreDetailsPromptData,
  type GeneratedStoreDetails
} from '@/lib/prompts/store-details';
import { getThemeNames } from '@/lib/themes';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user first
    const user = await requireAuth(request);
    const { businessDescription } = await request.json();

    if (!businessDescription) {
      return NextResponse.json(
        { error: 'Business description is required' },
        { status: 400 }
      );
    }

    // Get store information using authenticated user's store ID
    const storeResult = await db.query(`
      SELECT * FROM stores WHERE id = $1
    `, [user.storeId]);

    if (storeResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    const store = storeResult.rows[0];

    // Get product categories and sample products
    const productsResult = await db.query(`
      SELECT 
        p.name,
        p.short_description,
        p.base_price,
        c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.store_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC
      LIMIT 30
    `, [user.storeId]);

    const products = productsResult.rows;

    // Analyze product categories and names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = [...new Set(products.map(p => (p as any).category_name).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productNames = products.map(p => (p as any).name).filter(Boolean);
    const availableThemes = getThemeNames();

    // Prepare prompt data
    const promptData: StoreDetailsPromptData = {
      businessDescription,
      availableThemes,
      productNames,
      categories,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storeSlug: (store as any).store_slug,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingStoreName: (store as any).store_name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingDescription: (store as any).store_description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingHeroTitle: (store as any).hero_title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingHeroDescription: (store as any).hero_description,
    };

    // Generate AI-powered store details
    const openAIService = OpenAIService.getInstance();
    const userPrompt = buildStoreDetailsPrompt(promptData);
    
    const generatedDetails = await openAIService.generateWithFunctionCalling<GeneratedStoreDetails>(
      STORE_DETAILS_SYSTEM_PROMPT,
      userPrompt,
      STORE_DETAILS_FUNCTION_SCHEMA,
      'generate_store_details'
    );

    
    return NextResponse.json({
      success: true,
      data: {
        ...generatedDetails,
        storeId: user.storeId  // Include the authenticated user's store ID
      },
      analytics: {
        productsAnalyzed: products.length,
        categoriesFound: categories.length,
        themesAvailable: availableThemes.length
      }
    });

  } catch (error) {
    console.error('Error generating store details:', error);
    return NextResponse.json(
      { error: 'Failed to generate store details' },
      { status: 500 }
    );
  }
}

