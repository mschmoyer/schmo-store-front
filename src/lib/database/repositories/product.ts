// Product repository - handles product management with store-specific features

import { BaseRepository } from './base';
import { Product, CreateProductInput, UpdateProductInput, UUID, ProductFilters, InventoryLog } from '@/types/database';
import { query, transaction } from '../connection';
import { PoolClient } from 'pg';

export class ProductRepository extends BaseRepository<Product, CreateProductInput, UpdateProductInput> {
  constructor() {
    super('products', true);
  }

  /**
   * Find product by SKU within a store
   */
  async findBySku(sku: string, storeId: UUID): Promise<Product | null> {
    try {
      const result = await query<Product>(
        'SELECT * FROM products WHERE sku = $1 AND store_id = $2',
        [sku, storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding product by SKU:', error);
      throw error;
    }
  }

  /**
   * Find product by slug within a store
   */
  async findBySlug(slug: string, storeId: UUID): Promise<Product | null> {
    try {
      const result = await query<Product>(
        'SELECT * FROM products WHERE slug = $1 AND store_id = $2',
        [slug, storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding product by slug:', error);
      throw error;
    }
  }

  /**
   * Find products with advanced filtering
   */
  async findWithFilters(
    storeId: UUID,
    filters: ProductFilters
  ): Promise<{ products: Product[]; total: number }> {
    try {
      const whereConditions = ['store_id = $1'];
      const params: (string | number | boolean | string[])[] = [storeId];
      let paramCount = 1;

      // Build WHERE conditions
      if (filters.category_id) {
        whereConditions.push(`category_id = $${++paramCount}`);
        params.push(filters.category_id);
      }

      if (filters.is_active !== undefined) {
        whereConditions.push(`is_active = $${++paramCount}`);
        params.push(filters.is_active);
      }

      if (filters.is_featured !== undefined) {
        whereConditions.push(`is_featured = $${++paramCount}`);
        params.push(filters.is_featured);
      }

      if (filters.min_price) {
        whereConditions.push(`base_price >= $${++paramCount}`);
        params.push(filters.min_price);
      }

      if (filters.max_price) {
        whereConditions.push(`base_price <= $${++paramCount}`);
        params.push(filters.max_price);
      }

      if (filters.in_stock) {
        whereConditions.push(`(track_inventory = false OR stock_quantity > 0)`);
      }

      if (filters.tags && filters.tags.length > 0) {
        whereConditions.push(`tags && $${++paramCount}`);
        params.push(filters.tags);
      }

      if (filters.search) {
        whereConditions.push(`(
          name ILIKE $${++paramCount} OR 
          short_description ILIKE $${paramCount} OR 
          long_description ILIKE $${paramCount} OR
          sku ILIKE $${paramCount}
        )`);
        params.push(`%${filters.search}%`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Build ORDER BY clause
      let orderClause = 'ORDER BY ';
      switch (filters.sort_by) {
        case 'name':
          orderClause += 'name';
          break;
        case 'price':
          orderClause += 'base_price';
          break;
        case 'created_at':
          orderClause += 'created_at';
          break;
        case 'updated_at':
          orderClause += 'updated_at';
          break;
        default:
          orderClause += 'created_at';
      }
      
      orderClause += filters.sort_order === 'asc' ? ' ASC' : ' DESC';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM products WHERE ${whereClause}`;
      const countResult = await query<{ count: string }>(countQuery, params);
      const total = parseInt(countResult.rows[0].count, 10);

      // Get paginated results
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      
      const productsQuery = `
        SELECT * FROM products 
        WHERE ${whereClause} 
        ${orderClause}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;
      params.push(limit, offset);

      const productsResult = await query<Product>(productsQuery, params);

      return {
        products: productsResult.rows,
        total
      };
    } catch (error) {
      console.error('Error finding products with filters:', error);
      throw error;
    }
  }

  /**
   * Get featured products
   */
  async getFeaturedProducts(storeId: UUID, limit: number = 12): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT * FROM products 
         WHERE store_id = $1 AND is_active = true AND is_featured = true
         ORDER BY created_at DESC
         LIMIT $2`,
        [storeId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting featured products:', error);
      throw error;
    }
  }

  /**
   * Get products by category
   */
  async getByCategory(
    storeId: UUID,
    categoryId: UUID,
    limit: number = 20,
    offset: number = 0
  ): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT * FROM products 
         WHERE store_id = $1 AND category_id = $2 AND is_active = true
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [storeId, categoryId, limit, offset]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting products by category:', error);
      throw error;
    }
  }

  /**
   * Search products by text
   */
  async searchProducts(
    storeId: UUID,
    searchTerm: string,
    limit: number = 20
  ): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT *, 
         ts_rank(to_tsvector('english', name || ' ' || COALESCE(long_description, '')), plainto_tsquery('english', $2)) as rank
         FROM products 
         WHERE store_id = $1 
         AND is_active = true
         AND (
           to_tsvector('english', name || ' ' || COALESCE(long_description, '')) @@ plainto_tsquery('english', $2)
           OR name ILIKE $3
           OR sku ILIKE $3
         )
         ORDER BY rank DESC, created_at DESC
         LIMIT $4`,
        [storeId, searchTerm, `%${searchTerm}%`, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  /**
   * Get related products
   */
  async getRelatedProducts(
    storeId: UUID,
    productId: UUID,
    limit: number = 6
  ): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT p2.* FROM products p1
         JOIN products p2 ON p1.store_id = p2.store_id 
         AND (p1.category_id = p2.category_id OR p1.tags && p2.tags)
         WHERE p1.id = $1 AND p1.store_id = $2 
         AND p2.id != p1.id AND p2.is_active = true
         ORDER BY RANDOM()
         LIMIT $3`,
        [productId, storeId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting related products:', error);
      throw error;
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(storeId: UUID): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT * FROM products 
         WHERE store_id = $1 AND track_inventory = true 
         AND stock_quantity <= low_stock_threshold
         AND is_active = true
         ORDER BY stock_quantity ASC`,
        [storeId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting low stock products:', error);
      throw error;
    }
  }

  /**
   * Update product stock
   */
  async updateStock(
    productId: UUID,
    storeId: UUID,
    newQuantity: number,
    changeType: string = 'adjustment',
    notes?: string
  ): Promise<Product | null> {
    try {
      return await transaction(async (client: PoolClient) => {
        // Get current stock
        const currentResult = await client.query<{ stock_quantity: number }>(
          'SELECT stock_quantity FROM products WHERE id = $1 AND store_id = $2',
          [productId, storeId]
        );

        if (currentResult.rows.length === 0) {
          throw new Error('Product not found');
        }

        const currentStock = currentResult.rows[0].stock_quantity;
        const quantityChange = newQuantity - currentStock;

        // Update product stock
        const updateResult = await client.query<Product>(
          `UPDATE products 
           SET stock_quantity = $1, updated_at = NOW()
           WHERE id = $2 AND store_id = $3
           RETURNING *`,
          [newQuantity, productId, storeId]
        );

        // Log inventory change
        await client.query(
          `INSERT INTO inventory_logs (
            store_id, product_id, change_type, quantity_change, quantity_after, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [storeId, productId, changeType, quantityChange, newQuantity, notes]
        );

        return updateResult.rows[0];
      });
    } catch (error) {
      console.error('Error updating product stock:', error);
      throw error;
    }
  }

  /**
   * Bulk update stock
   */
  async bulkUpdateStock(
    storeId: UUID,
    updates: Array<{ productId: UUID; quantity: number; notes?: string }>
  ): Promise<void> {
    try {
      await transaction(async () => {
        for (const update of updates) {
          await this.updateStock(
            update.productId,
            storeId,
            update.quantity,
            'bulk_update',
            update.notes
          );
        }
      });
    } catch (error) {
      console.error('Error bulk updating stock:', error);
      throw error;
    }
  }

  /**
   * Get product inventory history
   */
  async getInventoryHistory(
    productId: UUID,
    storeId: UUID,
    limit: number = 50
  ): Promise<InventoryLog[]> {
    try {
      const result = await query<InventoryLog>(
        `SELECT * FROM inventory_logs 
         WHERE product_id = $1 AND store_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [productId, storeId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting inventory history:', error);
      throw error;
    }
  }

  /**
   * Get product display price (considering overrides and discounts)
   */
  async getDisplayPrice(productId: UUID): Promise<number> {
    try {
      const result = await query<{ price: number }>(
        'SELECT get_product_display_price($1) as price',
        [productId]
      );
      return result.rows[0].price;
    } catch (error) {
      console.error('Error getting product display price:', error);
      throw error;
    }
  }

  /**
   * Check product availability
   */
  async checkAvailability(
    productId: UUID,
    storeId: UUID,
    quantity: number
  ): Promise<{ available: boolean; current_stock: number; allows_backorder: boolean }> {
    try {
      const result = await query<{
        available: boolean;
        stock_quantity: number;
        track_inventory: boolean;
        allow_backorder: boolean;
      }>(
        `SELECT 
           check_product_stock($1, $2) as available,
           stock_quantity,
           track_inventory,
           allow_backorder
         FROM products 
         WHERE id = $1 AND store_id = $3`,
        [productId, quantity, storeId]
      );

      const product = result.rows[0];
      return {
        available: product.available,
        current_stock: product.stock_quantity,
        allows_backorder: product.allow_backorder
      };
    } catch (error) {
      console.error('Error checking product availability:', error);
      throw error;
    }
  }

  /**
   * Get products needing restock
   */
  async getProductsNeedingRestock(storeId: UUID): Promise<Product[]> {
    try {
      const result = await query<Product>(
        `SELECT * FROM products 
         WHERE store_id = $1 
         AND track_inventory = true 
         AND is_active = true
         AND stock_quantity <= low_stock_threshold
         AND allow_backorder = false
         ORDER BY stock_quantity ASC`,
        [storeId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting products needing restock:', error);
      throw error;
    }
  }

  /**
   * Update product visibility
   */
  async updateVisibility(
    productId: UUID,
    storeId: UUID,
    isActive: boolean,
    publishedAt?: Date
  ): Promise<Product | null> {
    try {
      const result = await query<Product>(
        `UPDATE products 
         SET is_active = $1, published_at = $2, updated_at = NOW()
         WHERE id = $3 AND store_id = $4
         RETURNING *`,
        [isActive, publishedAt || null, productId, storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating product visibility:', error);
      throw error;
    }
  }

  /**
   * Toggle featured status
   */
  async toggleFeatured(productId: UUID, storeId: UUID): Promise<Product | null> {
    try {
      const result = await query<Product>(
        `UPDATE products 
         SET is_featured = NOT is_featured, updated_at = NOW()
         WHERE id = $1 AND store_id = $2
         RETURNING *`,
        [productId, storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error toggling featured status:', error);
      throw error;
    }
  }

  /**
   * Get product analytics
   */
  async getProductAnalytics(
    productId: UUID,
    storeId: UUID,
    days: number = 30
  ): Promise<{
    views: number;
    cart_adds: number;
    purchases: number;
    revenue: number;
  }> {
    try {
      const result = await query<{
        views: string;
        cart_adds: string;
        purchases: string;
        revenue: string;
      }>(
        `SELECT 
           COUNT(CASE WHEN pa.event_type = 'product_view' THEN 1 END) as views,
           COUNT(CASE WHEN pa.event_type = 'add_to_cart' THEN 1 END) as cart_adds,
           COUNT(DISTINCT oi.order_id) as purchases,
           COALESCE(SUM(oi.total_price), 0) as revenue
         FROM products p
         LEFT JOIN page_analytics pa ON p.id = pa.product_id 
           AND pa.created_at >= NOW() - INTERVAL '${days} days'
         LEFT JOIN order_items oi ON p.id = oi.product_id 
           AND oi.created_at >= NOW() - INTERVAL '${days} days'
         WHERE p.id = $1 AND p.store_id = $2
         GROUP BY p.id`,
        [productId, storeId]
      );

      const analytics = result.rows[0];
      return {
        views: parseInt(analytics?.views || '0', 10),
        cart_adds: parseInt(analytics?.cart_adds || '0', 10),
        purchases: parseInt(analytics?.purchases || '0', 10),
        revenue: parseFloat(analytics?.revenue || '0'),
      };
    } catch (error) {
      console.error('Error getting product analytics:', error);
      throw error;
    }
  }

  /**
   * Duplicate product
   */
  async duplicateProduct(
    productId: UUID,
    storeId: UUID,
    newSku: string,
    newSlug: string
  ): Promise<Product> {
    try {
      return await transaction(async (client: PoolClient) => {
        // Get original product
        const originalResult = await client.query<Product>(
          'SELECT * FROM products WHERE id = $1 AND store_id = $2',
          [productId, storeId]
        );

        if (originalResult.rows.length === 0) {
          throw new Error('Original product not found');
        }

        const original = originalResult.rows[0];

        // Create duplicate
        const duplicateResult = await client.query<Product>(
          `INSERT INTO products (
            store_id, sku, name, slug, short_description, long_description,
            description_html, base_price, sale_price, cost_price,
            track_inventory, stock_quantity, low_stock_threshold, allow_backorder,
            weight, weight_unit, length, width, height, dimension_unit,
            category_id, tags, featured_image_url, gallery_images,
            meta_title, meta_description, requires_shipping, shipping_class,
            is_active, is_featured, is_digital
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
            $27, $28, $29, $30, $31
          ) RETURNING *`,
          [
            storeId, newSku, `${original.name} (Copy)`, newSlug,
            original.short_description, original.long_description,
            original.description_html, original.base_price, original.sale_price,
            original.cost_price, original.track_inventory, 0, // Start with 0 stock
            original.low_stock_threshold, original.allow_backorder,
            original.weight, original.weight_unit, original.length,
            original.width, original.height, original.dimension_unit,
            original.category_id, original.tags, original.featured_image_url,
            original.gallery_images, original.meta_title, original.meta_description,
            original.requires_shipping, original.shipping_class,
            false, // Start as inactive
            false, // Not featured
            original.is_digital
          ]
        );

        return duplicateResult.rows[0];
      });
    } catch (error) {
      console.error('Error duplicating product:', error);
      throw error;
    }
  }
}