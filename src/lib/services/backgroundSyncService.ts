/**
 * Background Sync Service
 * Handles automatic synchronization of ShipStation data
 */

import { db } from '@/lib/database/connection';

interface SyncResult {
  operation: string;
  success: boolean;
  duration: number;
  recordsProcessed?: number;
  error?: string;
}

interface SyncSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalDuration: number;
  results: SyncResult[];
  timestamp: string;
}

export class BackgroundSyncService {
  private baseUrl: string;
  private authToken: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.authToken = process.env.SYNC_AUTH_TOKEN || '';
  }

  /**
   * Run full sync for all active ShipStation integrations
   */
  async runFullSync(): Promise<SyncSummary> {
    console.log('🔄 Starting background sync job...');
    const startTime = Date.now();
    
    try {
      // Get all active ShipStation integrations
      const stores = await this.getActiveStores();
      
      if (stores.length === 0) {
        console.log('ℹ️  No active ShipStation integrations found');
        return this.createSummary([], startTime);
      }

      console.log(`📊 Found ${stores.length} active ShipStation integration(s)`);
      
      // Process each store's sync
      const allResults: SyncResult[] = [];
      
      for (const store of stores) {
        console.log(`🏪 Processing sync for store: ${store.name} (${store.id})`);
        const storeResults = await this.syncStore(store);
        allResults.push(...storeResults);
      }

      const summary = this.createSummary(allResults, startTime);
      await this.logSyncResults(summary);
      
      console.log('✅ Background sync job completed');
      return summary;
      
    } catch (error) {
      console.error('❌ Background sync job failed:', error);
      const errorResult: SyncResult = {
        operation: 'background_sync',
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      const summary = this.createSummary([errorResult], startTime);
      await this.logSyncResults(summary);
      throw error;
    }
  }

  /**
   * Run sync for a specific store with parallel processing where possible
   */
  async syncStore(store: { id: string; name: string }): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    try {
      // Phase 1: Foundation sync (must be done sequentially)
      console.log(`📋 Phase 1: Foundation sync for store ${store.name}`);
      const foundationOps = [
        'warehouses',
        'inventory-warehouses', 
        'inventory-locations'
      ];

      for (const operation of foundationOps) {
        const result = await this.runSyncOperation(store.id, operation);
        results.push(result);
        
        if (!result.success) {
          console.warn(`⚠️  Foundation sync failed for ${operation}, continuing with remaining operations`);
        }
      }

      // Phase 2: Content sync (can be done in parallel)
      console.log(`📦 Phase 2: Content sync for store ${store.name}`);
      const contentOps = [
        'products',
        'inventory'
      ];

      const contentResults = await Promise.allSettled(
        contentOps.map(operation => this.runSyncOperation(store.id, operation))
      );

      contentResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            operation: contentOps[index],
            success: false,
            duration: 0,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });

      console.log(`✅ Store sync completed for ${store.name}`);
      return results;
      
    } catch (error) {
      console.error(`❌ Store sync failed for ${store.name}:`, error);
      results.push({
        operation: `store_sync_${store.id}`,
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return results;
    }
  }

  /**
   * Run a single sync operation
   */
  async runSyncOperation(storeId: string, operation: string): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔧 Running ${operation} sync for store ${storeId}`);
      
      const response = await fetch(`${this.baseUrl}/api/admin/sync/${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
          'X-Store-ID': storeId
        },
        body: JSON.stringify({ storeId })
      });

      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      return {
        operation,
        success: result.success || false,
        duration,
        recordsProcessed: result.recordsProcessed || result.synced_count || 0,
        error: result.error
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ ${operation} sync failed:`, error);
      
      return {
        operation,
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all stores with active ShipStation integrations
   */
  async getActiveStores(): Promise<Array<{ id: string; name: string }>> {
    try {
      const query = `
        SELECT DISTINCT s.id, s.name
        FROM stores s
        JOIN integrations i ON s.id = i.store_id
        WHERE i.integration_type = 'shipstation'
        AND i.is_active = true
        AND i.settings IS NOT NULL
        AND i.settings != '{}'
      `;
      
      const result = await db.query(query);
      return result.rows;
      
    } catch (error) {
      console.error('Failed to get active stores:', error);
      return [];
    }
  }

  /**
   * Create sync summary
   */
  createSummary(results: SyncResult[], startTime: number): SyncSummary {
    const totalDuration = Date.now() - startTime;
    const successfulOperations = results.filter(r => r.success).length;
    const failedOperations = results.filter(r => !r.success).length;
    
    return {
      totalOperations: results.length,
      successfulOperations,
      failedOperations,
      totalDuration,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log sync results to database
   */
  async logSyncResults(summary: SyncSummary): Promise<void> {
    try {
      const query = `
        INSERT INTO sync_logs (
          timestamp,
          total_operations,
          successful_operations,
          failed_operations,
          total_duration,
          results
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      await db.query(query, [
        summary.timestamp,
        summary.totalOperations,
        summary.successfulOperations,
        summary.failedOperations,
        summary.totalDuration,
        JSON.stringify(summary.results)
      ]);
      
      console.log('📊 Sync results logged to database');
      
    } catch (error) {
      console.error('Failed to log sync results:', error);
      // Don't throw - logging failure shouldn't break the sync
    }
  }

  /**
   * Get sync history from database
   */
  async getSyncHistory(limit: number = 50): Promise<SyncSummary[]> {
    try {
      const query = `
        SELECT *
        FROM sync_logs
        ORDER BY timestamp DESC
        LIMIT $1
      `;
      
      const result = await db.query(query, [limit]);
      
      return result.rows.map(row => ({
        totalOperations: row.total_operations,
        successfulOperations: row.successful_operations,
        failedOperations: row.failed_operations,
        totalDuration: row.total_duration,
        results: JSON.parse(row.results),
        timestamp: row.timestamp
      }));
      
    } catch (error) {
      console.error('Failed to get sync history:', error);
      return [];
    }
  }
}

export default BackgroundSyncService;