import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    // Get ShipEngine integration
    const integrationResult = await db.query(`
      SELECT api_key_encrypted, is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipengine'
    `, [user.storeId]);
    
    if (integrationResult.rows.length === 0 || !integrationResult.rows[0].is_active) {
      return NextResponse.json({
        success: false,
        error: 'ShipEngine integration not found or inactive'
      }, { status: 400 });
    }
    
    const encryptedApiKey = integrationResult.rows[0].api_key_encrypted;
    const apiKey = Buffer.from(encryptedApiKey, 'base64').toString('utf-8');
    
    // Fetch all products from ShipStation (ShipEngine v2 API) with pagination
    let allProducts: Array<{
      product_id: string;
      sku: string;
      name: string;
      description: string;
      customs_value?: { amount: number };
      thumbnail_url?: string;
      active?: boolean;
      product_category?: { name: string };
      category?: string;
    }> = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const productsResponse = await fetch(`https://api.shipengine.com/v2/products?page=${page}&page_size=100`, {
        headers: {
          'API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!productsResponse.ok) {
        const errorData = await productsResponse.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errorData.message || 'Failed to fetch products from ShipEngine'
        }, { status: 500 });
      }
      
      const productsData = await productsResponse.json();
      allProducts = allProducts.concat(productsData.products || []);
      
      // Check if there are more pages
      hasMorePages = (productsData.products?.length || 0) === 100;
      page++;
    }
    let addedCount = 0;
    let updatedCount = 0;
    
    // Fetch all inventory to match SKUs for stock quantities
    let allInventory: Array<{
      sku: string;
      available: number;
    }> = [];
    page = 1;
    hasMorePages = true;
    
    while (hasMorePages) {
      const inventoryResponse = await fetch(`https://api.shipengine.com/v2/inventory?page=${page}&page_size=100`, {
        headers: {
          'API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (inventoryResponse.ok) {
        const inventoryData = await inventoryResponse.json();
        allInventory = allInventory.concat(inventoryData.inventory || []);
        hasMorePages = (inventoryData.inventory?.length || 0) === 100;
        page++;
      } else {
        hasMorePages = false;
      }
    }
    
    // Create a map of SKU to inventory for quick lookup
    const inventoryMap = new Map();
    allInventory.forEach(item => {
      inventoryMap.set(item.sku, item.available || 0);
    });
    
    // Helper function to get or create category
    async function getOrCreateCategory(categoryName: string, storeId: string): Promise<string> {
      const cleanCategoryName = categoryName?.trim() || 'Other';
      
      // Check if category exists
      const existingCategory = await db.query(
        'SELECT id FROM categories WHERE name = $1 AND store_id = $2',
        [cleanCategoryName, storeId]
      );
      
      if (existingCategory.rows.length > 0) {
        return existingCategory.rows[0].id;
      }
      
      // Create new category
      const newCategory = await db.query(
        'INSERT INTO categories (id, store_id, name, slug, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
        [storeId, cleanCategoryName, cleanCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '-')]
      );
      
      return newCategory.rows[0].id;
    }
    
    // Ensure "Other" category exists for this store
    await getOrCreateCategory('Other', user.storeId);
    
    // Save products to database
    for (const product of allProducts) {
      const existingProduct = await db.query(
        'SELECT id FROM products WHERE shipstation_product_id = $1 AND store_id = $2',
        [product.product_id, user.storeId]
      );
      
      // Get stock quantity from inventory map
      const stockQuantity = inventoryMap.get(product.sku) || 0;
      
      // Get category ID - check for category in ShipStation data
      const categoryName = product.product_category?.name || product.category || 'Other';
      const categoryId = await getOrCreateCategory(categoryName, user.storeId);
      
      if (existingProduct.rows.length > 0) {
        // Update existing product with inventory and category
        await db.query(`
          UPDATE products SET 
            sku = $1,
            name = $2,
            short_description = $3,
            base_price = $4,
            featured_image_url = $5,
            is_active = $6,
            stock_quantity = $7,
            category_id = $8,
            updated_at = NOW()
          WHERE shipstation_product_id = $9 AND store_id = $10
        `, [
          product.sku,
          product.name,
          product.description,
          product.customs_value?.amount || 0,
          product.thumbnail_url,
          product.active !== false,
          stockQuantity,
          categoryId,
          product.product_id,
          user.storeId
        ]);
        updatedCount++;
      } else {
        // Insert new product with inventory and category
        await db.query(`
          INSERT INTO products (
            id, store_id, shipstation_product_id, sku, name, slug, short_description, base_price, 
            featured_image_url, is_active, stock_quantity, category_id, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
          )
        `, [
          user.storeId,
          product.product_id,
          product.sku,
          product.name,
          product.sku.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Generate slug from SKU
          product.description,
          product.customs_value?.amount || 0,
          product.thumbnail_url,
          product.active !== false,
          stockQuantity,
          categoryId
        ]);
        addedCount++;
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: `Products synced successfully`,
        addedCount,
        updatedCount,
        totalCount: addedCount + updatedCount
      }
    });
    
  } catch (error) {
    console.error('Sync products error:', error);
    
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