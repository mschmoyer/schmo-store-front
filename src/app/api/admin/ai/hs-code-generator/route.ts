import { NextRequest, NextResponse } from 'next/server';
import { OpenAIService } from '@/lib/services/openai';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';

interface HSCodeRequest {
  productIds?: string[];  // For bulk generation
  productId?: string;     // For single product
}

export async function POST(request: NextRequest) {
  try {
    // Validate admin authentication
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { productIds, productId }: HSCodeRequest = body;

    const openaiService = OpenAIService.getInstance();

    // Determine which products to process
    let targetProductIds = productIds || (productId ? [productId] : []);
    
    // If no specific products specified, get all products for the store
    if (targetProductIds.length === 0) {
      const allProductsQuery = `
        SELECT id FROM products 
        WHERE store_id = $1 AND is_active = true
        ORDER BY created_at ASC
      `;
      const allProductsResult = await db.query(allProductsQuery, [user.storeId]);
      targetProductIds = allProductsResult.rows.map(row => row.id);
      
      if (targetProductIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No active products found for this store' },
          { status: 400 }
        );
      }
    }

    const results: Array<{
      productId: string;
      success: boolean;
      hsCode?: string;
      description?: string;
      confidence?: number;
      error?: string;
    }> = [];

    // Process each product
    for (const prodId of targetProductIds) {
      try {
        // Get product details
        const productQuery = `
          SELECT id, name, short_description, long_description
          FROM products 
          WHERE id = $1 AND store_id = $2
        `;
        
        const productResult = await db.query(productQuery, [prodId, user.storeId]);
        
        if (productResult.rows.length === 0) {
          results.push({
            productId: prodId,
            success: false,
            error: 'Product not found'
          });
          continue;
        }

        const product = productResult.rows[0];
        
        // Generate HS code using OpenAI
        const systemPrompt = `You are an expert in HS (Harmonized System) codes used for international trade classification. Your task is to analyze product information and provide the most accurate HS code.

HS codes are 6-digit codes used globally for classifying traded products. They are structured hierarchically:
- First 2 digits: Chapter (broad category)
- Next 2 digits: Heading (more specific category)  
- Last 2 digits: Subheading (specific product type)

Be conservative with confidence levels - only use 90+ for very clear cases.`;

        const userPrompt = `Please classify this product and provide the appropriate HS code:

Product Name: ${product.name}
${product.long_description || product.short_description ? `Product Description: ${product.long_description || product.short_description}` : ''}

Analyze the product details and provide the most appropriate 6-digit HS code.`;

        const functionSchema = {
          type: "object",
          properties: {
            hsCode: {
              type: "string",
              description: "6-digit HS code for the product",
              pattern: "^\\d{6}$"
            },
            description: {
              type: "string",
              description: "Clear explanation of what this HS code covers"
            },
            confidence: {
              type: "integer",
              description: "Confidence level in this classification (0-100)",
              minimum: 0,
              maximum: 100
            }
          },
          required: ["hsCode", "description", "confidence"]
        };

        const hsCodeResult = await openaiService.generateWithFunctionCalling<{
          hsCode: string;
          description: string;
          confidence: number;
        }>(systemPrompt, userPrompt, functionSchema, "generate_hs_code");

        // Update the product with the generated HS code
        const updateQuery = `
          UPDATE products 
          SET 
            hs_code = $1,
            hs_code_description = $2,
            hs_code_confidence = $3,
            hs_code_generated_at = NOW(),
            updated_at = NOW()
          WHERE id = $4 AND store_id = $5
        `;

        await db.query(updateQuery, [
          hsCodeResult.hsCode,
          hsCodeResult.description,
          hsCodeResult.confidence,
          prodId,
          user.storeId
        ]);

        results.push({
          productId: prodId,
          success: true,
          hsCode: hsCodeResult.hsCode,
          description: hsCodeResult.description,
          confidence: hsCodeResult.confidence
        });

      } catch (error) {
        console.error(`Error generating HS code for product ${prodId}:`, error);
        results.push({
          productId: prodId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Return results
    const successCount = results.filter(r => r.success).length;
    
    return NextResponse.json({
      success: true,
      message: `Generated HS codes for ${successCount} of ${results.length} products`,
      results,
      stats: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount
      }
    });

  } catch (error) {
    console.error('HS Code generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}