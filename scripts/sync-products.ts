#!/usr/bin/env node
import { db } from '../src/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * Helper function to get or create category
 */
async function getOrCreateCategory(categoryName: string, storeId: string): Promise<string> {
  const cleanCategoryName = categoryName?.trim() || 'Other';
  
  // Check if category exists
  const existingCategory = await db.query(
    'SELECT id FROM categories WHERE name = $1 AND store_id = $2',
    [cleanCategoryName, storeId]
  );
  
  if (existingCategory.rows.length > 0) {
    return String(existingCategory.rows[0].id);
  }
  
  // Create new category
  const newCategory = await db.query(
    'INSERT INTO categories (id, store_id, name, slug, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
    [storeId, cleanCategoryName, cleanCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '-')]
  );
  
  return String(newCategory.rows[0].id);
}

/**
 * Sync products from ShipStation V2 API
 */
async function syncProducts(apiKey: string, storeId: string): Promise<SyncResult> {
  const result: SyncResult = { totalCount: 0, addedCount: 0, updatedCount: 0 };

  try {
    // Fetch all products from ShipStation v2 API with pagination
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
    
    console.log('Fetching products from ShipStation V2 API...');
    
    while (hasMorePages) {
      const productsResponse = await fetch(`https://api.shipstation.com/v2/products?page=${page}&page_size=100`, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!productsResponse.ok) {
        const errorData = await productsResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch products: ${productsResponse.status} ${productsResponse.statusText}`);
      }
      
      const productsData = await productsResponse.json();
      allProducts = allProducts.concat(productsData.products || []);
      
      // Check if there are more pages
      hasMorePages = (productsData.products?.length || 0) === 100;
      page++;
    }
    
    console.log(`Found ${allProducts.length} products from ShipStation`);
    
    // Fetch all inventory to match SKUs for stock quantities
    let allInventory: Array<{
      sku: string;
      available: number;
    }> = [];
    page = 1;
    hasMorePages = true;
    
    console.log('Fetching inventory from ShipStation V2 API...');
    
    while (hasMorePages) {
      const inventoryResponse = await fetch(`https://api.shipstation.com/v2/inventory?page=${page}&page_size=100`, {
        headers: {
          'api-key': apiKey,
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
    
    console.log(`Found ${allInventory.length} inventory items from ShipStation`);
    
    // Create a map of SKU to inventory for quick lookup
    const inventoryMap = new Map();
    allInventory.forEach(item => {
      inventoryMap.set(item.sku, item.available || 0);
    });
    
    // Ensure "Other" category exists for this store
    await getOrCreateCategory('Other', storeId);
    
    // Save products to database
    for (const product of allProducts) {
      try {
        const existingProduct = await db.query(
          'SELECT id FROM products WHERE shipstation_product_id = $1 AND store_id = $2',
          [product.product_id, storeId]
        );
        
        // Get stock quantity from inventory map
        const stockQuantity = inventoryMap.get(product.sku) || 0;
        
        // Get category ID - check for category in ShipStation data
        const categoryName = product.product_category?.name || product.category || 'Other';
        const categoryId = await getOrCreateCategory(categoryName, storeId);
        
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
            storeId
          ]);
          result.updatedCount++;
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
            storeId,
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
          result.addedCount++;
        }
      } catch (error) {
        console.error(`Error syncing product ${product.product_id}:`, error);
        // Continue with next product
      }
    }
    
    result.totalCount = result.addedCount + result.updatedCount;
    console.log(`Product sync completed: ${result.totalCount} total, ${result.addedCount} added, ${result.updatedCount} updated`);

  } catch (error) {
    console.error('Error syncing products from ShipStation:', error);
    throw error;
  }

  return result;
}

// Main execution
async function main() {
  if (process.argv.length < 4) {
    console.error('Usage: npm run sync:products <storeId> <apiKey>');
    process.exit(1);
  }

  const storeId = process.argv[2];
  const apiKey = process.argv[3];

  try {
    const result = await syncProducts(apiKey, storeId);
    console.log('Sync completed:', result);
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  main();
}

export { syncProducts };