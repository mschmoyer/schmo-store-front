/**
 * Sync Status API Endpoint
 * Provides sync status and monitoring information
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import BackgroundSyncService from '@/lib/services/backgroundSyncService';
import { db } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const syncService = new BackgroundSyncService();
    
    // Get sync history
    const history = await syncService.getSyncHistory(10);
    
    // Get sync statistics
    const stats = await getSyncStatistics();
    
    // Get active integrations
    const activeStores = await syncService.getActiveStores();
    
    // Get recent errors
    const recentErrors = await getRecentErrors();
    
    return NextResponse.json({
      success: true,
      data: {
        lastSync: history[0] || null,
        recentSyncs: history,
        statistics: stats,
        activeIntegrations: activeStores.length,
        activeStores: activeStores,
        recentErrors: recentErrors,
        systemStatus: {
          healthy: stats.success_rate >= 0.8,
          lastSuccessfulSync: history.find(h => h.successfulOperations > 0)?.timestamp || null,
          averageDuration: stats.avg_duration
        }
      }
    });
    
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sync status'
    }, { 
      status: 500 
    });
  }
}

async function getSyncStatistics() {
  try {
    const query = `
      WITH recent_syncs AS (
        SELECT *
        FROM sync_logs
        WHERE timestamp >= NOW() - INTERVAL '7 days'
      ),
      success_stats AS (
        SELECT 
          COUNT(*) as total_syncs,
          SUM(CASE WHEN failed_operations = 0 THEN 1 ELSE 0 END) as successful_syncs,
          AVG(total_duration) as avg_duration,
          MAX(timestamp) as last_sync,
          SUM(total_operations) as total_operations,
          SUM(successful_operations) as total_successful_operations,
          SUM(failed_operations) as total_failed_operations
        FROM recent_syncs
      )
      SELECT 
        *,
        CASE 
          WHEN total_syncs > 0 THEN 
            ROUND((successful_syncs::decimal / total_syncs::decimal), 3)
          ELSE 0 
        END as success_rate,
        CASE 
          WHEN total_operations > 0 THEN 
            ROUND((total_successful_operations::decimal / total_operations::decimal), 3)
          ELSE 0 
        END as operation_success_rate
      FROM success_stats
    `;
    
    const result = await db.query(query);
    
    if (result.rows.length === 0) {
      return {
        total_syncs: 0,
        successful_syncs: 0,
        success_rate: 0,
        avg_duration: 0,
        last_sync: null,
        total_operations: 0,
        total_successful_operations: 0,
        total_failed_operations: 0,
        operation_success_rate: 0
      };
    }
    
    return result.rows[0];
    
  } catch (error) {
    console.error('Failed to get sync statistics:', error);
    return {
      total_syncs: 0,
      successful_syncs: 0,
      success_rate: 0,
      avg_duration: 0,
      last_sync: null,
      total_operations: 0,
      total_successful_operations: 0,
      total_failed_operations: 0,
      operation_success_rate: 0
    };
  }
}

async function getRecentErrors() {
  try {
    const query = `
      SELECT 
        timestamp,
        results
      FROM sync_logs
      WHERE failed_operations > 0
      ORDER BY timestamp DESC
      LIMIT 5
    `;
    
    const result = await db.query(query);
    
    return result.rows.map(row => {
      const results = JSON.parse(row.results) as Array<{
        operation: string;
        success: boolean;
        error?: string;
        duration: number;
      }>;
      const failedOperations = results.filter(r => !r.success);
      
      return {
        timestamp: row.timestamp,
        failedOperations: failedOperations.map(op => ({
          operation: op.operation,
          error: op.error,
          duration: op.duration
        }))
      };
    });
    
  } catch (error) {
    console.error('Failed to get recent errors:', error);
    return [];
  }
}

// Trigger manual sync
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    console.log('🔄 Manual sync triggered by admin');
    
    // Parse request body for any options
    const body = await request.json();
    const { storeId = null } = body;
    
    const syncService = new BackgroundSyncService();
    
    if (storeId) {
      // Sync specific store
      const store = { id: storeId, name: `Store ${storeId}` };
      const results = await syncService.syncStore(store);
      
      return NextResponse.json({
        success: true,
        message: `Manual sync completed for store ${storeId}`,
        results: results
      });
    } else {
      // Full sync
      const summary = await syncService.runFullSync();
      
      return NextResponse.json({
        success: true,
        message: 'Manual sync completed',
        summary: summary
      });
    }
    
  } catch (error) {
    console.error('Manual sync failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Manual sync failed'
    }, { 
      status: 500 
    });
  }
}