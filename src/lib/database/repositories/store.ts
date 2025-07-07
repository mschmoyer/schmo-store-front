// Store repository - handles store management and multi-tenancy

import { BaseRepository } from './base';
import { Store, CreateStoreInput, UpdateStoreInput, UUID, StoreIntegration } from '@/types/database';
import { query, transaction } from '../connection';
import { PoolClient } from 'pg';

export class StoreRepository extends BaseRepository<Store, CreateStoreInput, UpdateStoreInput> {
  constructor() {
    super('stores', false);
  }

  /**
   * Find store by slug
   */
  async findBySlug(slug: string): Promise<Store | null> {
    try {
      const result = await query<Store>(
        'SELECT * FROM stores WHERE store_slug = $1',
        [slug]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding store by slug:', error);
      throw error;
    }
  }

  /**
   * Find store by domain
   */
  async findByDomain(domain: string): Promise<Store | null> {
    try {
      const result = await query<Store>(
        'SELECT * FROM stores WHERE domain = $1 OR subdomain = $1',
        [domain]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding store by domain:', error);
      throw error;
    }
  }

  /**
   * Find stores by owner
   */
  async findByOwner(ownerId: UUID): Promise<Store[]> {
    try {
      const result = await query<Store>(
        'SELECT * FROM stores WHERE owner_id = $1 ORDER BY created_at DESC',
        [ownerId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding stores by owner:', error);
      throw error;
    }
  }

  /**
   * Create store with initialization
   */
  async createWithInitialization(storeData: CreateStoreInput): Promise<Store> {
    try {
      return await transaction(async (client: PoolClient) => {
        // Create the store
        const storeResult = await client.query<Store>(
          `INSERT INTO stores (
            owner_id, store_name, store_slug, store_description, hero_title, hero_description,
            domain, subdomain, theme_name, custom_css, logo_url, favicon_url,
            currency, timezone, is_public, allow_guest_checkout,
            meta_title, meta_description, google_analytics_id, facebook_pixel_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING *`,
          [
            storeData.owner_id,
            storeData.store_name,
            storeData.store_slug,
            storeData.store_description || null,
            storeData.hero_title || null,
            storeData.hero_description || null,
            storeData.domain || null,
            storeData.subdomain || null,
            storeData.theme_name || 'default',
            storeData.custom_css || null,
            storeData.logo_url || null,
            storeData.favicon_url || null,
            storeData.currency || 'USD',
            storeData.timezone || 'America/New_York',
            storeData.is_public || false,
            storeData.allow_guest_checkout !== false,
            storeData.meta_title || null,
            storeData.meta_description || null,
            storeData.google_analytics_id || null,
            storeData.facebook_pixel_id || null
          ]
        );

        const store = storeResult.rows[0];

        // Initialize store data is handled by trigger
        // But we can add any additional initialization here if needed

        return store;
      });
    } catch (error) {
      console.error('Error creating store with initialization:', error);
      throw error;
    }
  }

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string, excludeStoreId?: UUID): Promise<boolean> {
    try {
      let queryText = 'SELECT EXISTS(SELECT 1 FROM stores WHERE store_slug = $1)';
      const params = [slug];

      if (excludeStoreId) {
        queryText = 'SELECT EXISTS(SELECT 1 FROM stores WHERE store_slug = $1 AND id != $2)';
        params.push(excludeStoreId);
      }

      const result = await query<{ exists: boolean }>(queryText, params);
      return !result.rows[0].exists;
    } catch (error) {
      console.error('Error checking slug availability:', error);
      throw error;
    }
  }

  /**
   * Check if domain is available
   */
  async isDomainAvailable(domain: string, excludeStoreId?: UUID): Promise<boolean> {
    try {
      let queryText = 'SELECT EXISTS(SELECT 1 FROM stores WHERE domain = $1 OR subdomain = $1)';
      const params = [domain];

      if (excludeStoreId) {
        queryText = 'SELECT EXISTS(SELECT 1 FROM stores WHERE (domain = $1 OR subdomain = $1) AND id != $2)';
        params.push(excludeStoreId);
      }

      const result = await query<{ exists: boolean }>(queryText, params);
      return !result.rows[0].exists;
    } catch (error) {
      console.error('Error checking domain availability:', error);
      throw error;
    }
  }

  /**
   * Get store statistics
   */
  async getStoreStats(storeId: UUID): Promise<{
    total_products: number;
    active_products: number;
    total_orders: number;
    pending_orders: number;
    total_revenue: number;
    total_customers: number;
    blog_posts: number;
  }> {
    try {
      const result = await query<{
        total_products: string;
        active_products: string;
        total_orders: string;
        pending_orders: string;
        total_revenue: string;
        total_customers: string;
        blog_posts: string;
      }>(
        `SELECT 
           COUNT(DISTINCT p.id) as total_products,
           COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.id END) as active_products,
           COUNT(DISTINCT o.id) as total_orders,
           COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders,
           COALESCE(SUM(o.total_amount), 0) as total_revenue,
           COUNT(DISTINCT o.customer_email) as total_customers,
           COUNT(DISTINCT b.id) as blog_posts
         FROM stores s
         LEFT JOIN products p ON s.id = p.store_id
         LEFT JOIN orders o ON s.id = o.store_id
         LEFT JOIN blog_posts b ON s.id = b.store_id
         WHERE s.id = $1
         GROUP BY s.id`,
        [storeId]
      );

      const stats = result.rows[0];
      return {
        total_products: parseInt(stats?.total_products || '0', 10),
        active_products: parseInt(stats?.active_products || '0', 10),
        total_orders: parseInt(stats?.total_orders || '0', 10),
        pending_orders: parseInt(stats?.pending_orders || '0', 10),
        total_revenue: parseFloat(stats?.total_revenue || '0'),
        total_customers: parseInt(stats?.total_customers || '0', 10),
        blog_posts: parseInt(stats?.blog_posts || '0', 10),
      };
    } catch (error) {
      console.error('Error getting store stats:', error);
      throw error;
    }
  }

  /**
   * Get public stores
   */
  async getPublicStores(limit: number = 20): Promise<Store[]> {
    try {
      const result = await query<Store>(
        `SELECT * FROM stores 
         WHERE is_public = true AND is_active = true
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting public stores:', error);
      throw error;
    }
  }

  /**
   * Search stores
   */
  async searchStores(searchTerm: string, limit: number = 50): Promise<Store[]> {
    try {
      const result = await query<Store>(
        `SELECT * FROM stores 
         WHERE (store_name ILIKE $1 OR store_description ILIKE $1)
         AND is_active = true
         ORDER BY created_at DESC
         LIMIT $2`,
        [`%${searchTerm}%`, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error searching stores:', error);
      throw error;
    }
  }

  /**
   * Get store configuration
   */
  async getStoreConfig(storeId: UUID): Promise<Record<string, string | number | boolean | object>> {
    try {
      const result = await query<{
        config_key: string;
        config_value: string;
        config_type: string;
      }>(
        `SELECT config_key, config_value, config_type 
         FROM store_config 
         WHERE store_id = $1`,
        [storeId]
      );

      const config: Record<string, string | number | boolean | object> = {};
      for (const row of result.rows) {
        let value: string | number | boolean | object = row.config_value;
        
        // Parse value based on type
        switch (row.config_type) {
          case 'number':
            value = parseFloat(row.config_value);
            break;
          case 'boolean':
            value = row.config_value === 'true';
            break;
          case 'json':
            try {
              value = JSON.parse(row.config_value);
            } catch {
              value = row.config_value;
            }
            break;
          default:
            value = row.config_value;
        }
        
        config[row.config_key] = value;
      }

      return config;
    } catch (error) {
      console.error('Error getting store config:', error);
      throw error;
    }
  }

  /**
   * Update store configuration
   */
  async updateStoreConfig(
    storeId: UUID,
    configKey: string,
    configValue: string | number | boolean | object,
    configType: 'string' | 'number' | 'boolean' | 'json' = 'string'
  ): Promise<void> {
    try {
      let valueToStore = configValue;
      
      // Convert value based on type
      switch (configType) {
        case 'json':
          valueToStore = JSON.stringify(configValue);
          break;
        default:
          valueToStore = String(configValue);
      }

      await query(
        `INSERT INTO store_config (store_id, config_key, config_value, config_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (store_id, config_key)
         DO UPDATE SET config_value = EXCLUDED.config_value, config_type = EXCLUDED.config_type, updated_at = NOW()`,
        [storeId, configKey, valueToStore, configType]
      );
    } catch (error) {
      console.error('Error updating store config:', error);
      throw error;
    }
  }

  /**
   * Delete store configuration
   */
  async deleteStoreConfig(storeId: UUID, configKey: string): Promise<boolean> {
    try {
      const result = await query(
        'DELETE FROM store_config WHERE store_id = $1 AND config_key = $2',
        [storeId, configKey]
      );
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting store config:', error);
      throw error;
    }
  }

  /**
   * Get store analytics summary
   */
  async getAnalyticsSummary(
    storeId: UUID,
    startDate: Date,
    endDate: Date
  ): Promise<{
    total_orders: number;
    total_revenue: number;
    total_visitors: number;
    total_page_views: number;
    avg_order_value: number;
    conversion_rate: number;
  }> {
    try {
      const result = await query<{
        total_orders: string;
        total_revenue: string;
        total_visitors: string;
        total_page_views: string;
        avg_order_value: string;
        conversion_rate: string;
      }>(
        `SELECT * FROM get_store_analytics_summary($1, $2, $3)`,
        [storeId, startDate, endDate]
      );

      const summary = result.rows[0];
      return {
        total_orders: parseInt(summary?.total_orders || '0', 10),
        total_revenue: parseFloat(summary?.total_revenue || '0'),
        total_visitors: parseInt(summary?.total_visitors || '0', 10),
        total_page_views: parseInt(summary?.total_page_views || '0', 10),
        avg_order_value: parseFloat(summary?.avg_order_value || '0'),
        conversion_rate: parseFloat(summary?.conversion_rate || '0'),
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      throw error;
    }
  }

  /**
   * Update store theme
   */
  async updateTheme(
    storeId: UUID,
    themeName: string,
    customCss?: string
  ): Promise<Store | null> {
    try {
      const result = await query<Store>(
        `UPDATE stores 
         SET theme_name = $1, custom_css = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [themeName, customCss || null, storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating store theme:', error);
      throw error;
    }
  }

  /**
   * Toggle store public status
   */
  async togglePublicStatus(storeId: UUID): Promise<Store | null> {
    try {
      const result = await query<Store>(
        `UPDATE stores 
         SET is_public = NOT is_public, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error toggling store public status:', error);
      throw error;
    }
  }

  /**
   * Get recently created stores
   */
  async getRecentStores(limit: number = 10): Promise<Store[]> {
    try {
      const result = await query<Store>(
        `SELECT s.*, u.first_name, u.last_name, u.email
         FROM stores s
         JOIN users u ON s.owner_id = u.id
         WHERE s.is_active = true
         ORDER BY s.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting recent stores:', error);
      throw error;
    }
  }

  /**
   * Get store integrations
   */
  async getStoreIntegrations(storeId: UUID): Promise<StoreIntegration[]> {
    try {
      const result = await query<StoreIntegration>(
        `SELECT integration_type, is_active, last_sync_at, sync_status, auto_sync_enabled
         FROM store_integrations
         WHERE store_id = $1
         ORDER BY integration_type`,
        [storeId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting store integrations:', error);
      throw error;
    }
  }

  /**
   * Archive store (soft delete)
   */
  async archiveStore(storeId: UUID): Promise<Store | null> {
    try {
      const result = await query<Store>(
        `UPDATE stores 
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error archiving store:', error);
      throw error;
    }
  }

  /**
   * Restore archived store
   */
  async restoreStore(storeId: UUID): Promise<Store | null> {
    try {
      const result = await query<Store>(
        `UPDATE stores 
         SET is_active = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [storeId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error restoring store:', error);
      throw error;
    }
  }
}