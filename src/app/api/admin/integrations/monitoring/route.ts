import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/services/monitoringService';
import { jobQueueService } from '@/lib/services/jobQueueService';
import { inventoryService } from '@/lib/services/inventoryService';

/**
 * Integration Monitoring API
 * 
 * Provides monitoring and metrics endpoints for integration health:
 * - GET: Retrieve integration metrics and health status
 * - POST: Trigger manual health checks or operations
 * 
 * Requires admin authentication
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const action = searchParams.get('action');
    const integrationType = searchParams.get('integration') || 'shipstation';
    const storeId = searchParams.get('store_id');
    const hoursBack = parseInt(searchParams.get('hours') || '24');

    switch (action) {
      case 'metrics':
        return await getIntegrationMetrics(integrationType, hoursBack, storeId || undefined);
      
      case 'health':
        return await getIntegrationHealth(integrationType, storeId || undefined);
      
      case 'alerts':
        return await getRecentAlerts(storeId || undefined, hoursBack);
      
      case 'trends':
        const daysBack = parseInt(searchParams.get('days') || '7');
        return await getPerformanceTrends(integrationType, daysBack, storeId || undefined);
      
      case 'job-stats':
        return await getJobStats(hoursBack);
      
      case 'inventory-summary':
        if (!storeId) {
          return NextResponse.json(
            { error: 'store_id is required for inventory summary' },
            { status: 400 }
          );
        }
        return await getInventorySummary(storeId);
      
      default:
        return await getOverallStatus(integrationType, storeId || undefined);
    }

  } catch (error) {
    console.error('Error in integration monitoring API:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for manual operations
 */
export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json();

    switch (action) {
      case 'trigger-health-check':
        return await triggerHealthCheck(data);
      
      case 'retry-failed-jobs':
        return await retryFailedJobs(data);
      
      case 'cleanup-old-jobs':
        return await cleanupOldJobs(data);
      
      case 'test-notification':
        return await testNotification(data);
      
      case 'sync-inventory':
        return await triggerInventorySync(data);
      
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in integration monitoring POST:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get integration metrics
 */
async function getIntegrationMetrics(
  integrationType: string,
  hoursBack: number,
  storeId?: string
) {
  try {
    const metrics = await monitoringService.getIntegrationMetrics(
      integrationType,
      hoursBack,
      storeId
    );

    return NextResponse.json({
      success: true,
      data: metrics,
      metadata: {
        integration_type: integrationType,
        time_range_hours: hoursBack,
        store_id: storeId,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get integration health status
 */
async function getIntegrationHealth(integrationType: string, storeId?: string) {
  try {
    const health = await monitoringService.getIntegrationHealth(integrationType, storeId);

    return NextResponse.json({
      success: true,
      data: health,
      metadata: {
        integration_type: integrationType,
        store_id: storeId,
        checked_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get recent alerts
 */
async function getRecentAlerts(storeId?: string, hoursBack: number = 24) {
  try {
    const alerts = await monitoringService.getRecentAlerts(storeId, hoursBack);

    return NextResponse.json({
      success: true,
      data: alerts,
      metadata: {
        store_id: storeId,
        time_range_hours: hoursBack,
        alert_count: alerts.length,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get performance trends
 */
async function getPerformanceTrends(
  integrationType: string,
  daysBack: number,
  storeId?: string
) {
  try {
    const trends = await monitoringService.getPerformanceTrends(
      integrationType,
      daysBack,
      storeId
    );

    return NextResponse.json({
      success: true,
      data: trends,
      metadata: {
        integration_type: integrationType,
        time_range_days: daysBack,
        store_id: storeId,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get job queue statistics
 */
async function getJobStats(hoursBack: number) {
  try {
    const stats = await jobQueueService.getJobStats(hoursBack);
    const failedJobs = await jobQueueService.getFailedJobs(20);

    return NextResponse.json({
      success: true,
      data: {
        statistics: stats,
        recent_failed_jobs: failedJobs
      },
      metadata: {
        time_range_hours: hoursBack,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get inventory summary
 */
async function getInventorySummary(storeId: string) {
  try {
    const summary = await inventoryService.getInventorySummary(storeId);
    const lowStockProducts = await inventoryService.getLowStockProducts(storeId, 10);

    return NextResponse.json({
      success: true,
      data: {
        summary,
        low_stock_products: lowStockProducts
      },
      metadata: {
        store_id: storeId,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Get overall integration status
 */
async function getOverallStatus(integrationType: string, storeId?: string) {
  try {
    const [metrics, health, jobStats] = await Promise.all([
      monitoringService.getIntegrationMetrics(integrationType, 24, storeId),
      monitoringService.getIntegrationHealth(integrationType, storeId),
      jobQueueService.getJobStats(24)
    ]);

    const overallStatus = health.status === 'healthy' && metrics.error_rate < 0.05 
      ? 'healthy' 
      : health.status === 'critical' || metrics.error_rate > 0.25
      ? 'critical'
      : 'warning';

    return NextResponse.json({
      success: true,
      data: {
        overall_status: overallStatus,
        integration_health: health,
        metrics_24h: {
          total_operations: metrics.total_operations,
          success_rate: metrics.success_rate,
          error_rate: metrics.error_rate,
          avg_execution_time: metrics.avg_execution_time
        },
        job_queue: {
          pending: jobStats.pending,
          processing: jobStats.processing,
          failed: jobStats.failed,
          completed_24h: jobStats.completed
        }
      },
      metadata: {
        integration_type: integrationType,
        store_id: storeId,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Trigger health check
 */
async function triggerHealthCheck(data: { integration_type?: string; store_id?: string }) {
  try {
    const { integration_type = 'shipstation', store_id } = data;
    
    const health = await monitoringService.getIntegrationHealth(integration_type, store_id);
    const metrics = await monitoringService.getIntegrationMetrics(integration_type, 1, store_id);

    // Log the health check
    await monitoringService.logIntegrationEvent(
      'webhook_processing',
      'success',
      {
        request: { body: JSON.stringify({ action: 'manual_health_check' }) },
        response: { body: JSON.stringify({ health_status: health.status, operations_last_hour: metrics.total_operations }) }
      },
      store_id || 'system',
      integration_type as 'shipstation' | 'shipengine' | 'stripe' | 'other'
    );

    return NextResponse.json({
      success: true,
      data: {
        health_status: health.status,
        issues_found: health.issues.length,
        recommendations: health.recommendations.length,
        operations_last_hour: metrics.total_operations
      },
      message: 'Health check completed'
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Retry failed jobs
 */
async function retryFailedJobs(data: { job_ids?: string[]; retry_all?: boolean; maxRetries?: number; batchSize?: number }) {
  try {
    const { job_ids, retry_all = false } = data;
    
    let retriedCount = 0;
    
    if (retry_all) {
      const failedJobs = await jobQueueService.getFailedJobs(100);
      for (const job of failedJobs) {
        const success = await jobQueueService.retryJob(job.id);
        if (success) retriedCount++;
      }
    } else if (job_ids && Array.isArray(job_ids)) {
      for (const jobId of job_ids) {
        const success = await jobQueueService.retryJob(jobId);
        if (success) retriedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        retried_count: retriedCount
      },
      message: `${retriedCount} jobs have been queued for retry`
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Cleanup old jobs
 */
async function cleanupOldJobs(data: { older_than_days?: number; daysOld?: number }) {
  try {
    const { older_than_days = 30 } = data;
    
    const deletedCount = await jobQueueService.cleanupOldJobs(older_than_days);

    return NextResponse.json({
      success: true,
      data: {
        deleted_count: deletedCount
      },
      message: `Cleaned up ${deletedCount} old jobs`
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Test notification system
 */
async function testNotification(data: { order_id?: string; notification_type?: string; orderId?: string; notificationType?: string }) {
  try {
    const { order_id, notification_type = 'shipped' } = data;
    
    if (!order_id) {
      return NextResponse.json(
        { error: 'order_id is required for notification test' },
        { status: 400 }
      );
    }

    // Queue test notification
    const jobId = await jobQueueService.addJob(
      'order_notification',
      {
        order_id,
        notification_type,
        test_mode: true,
        tracking_number: 'TEST123456789',
        carrier: 'TEST_CARRIER'
      },
      'high'
    );

    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        order_id,
        notification_type
      },
      message: 'Test notification queued successfully'
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Trigger inventory sync
 */
async function triggerInventorySync(data: { store_id?: string; products?: string[]; storeId?: string }) {
  try {
    const { store_id, products } = data;
    
    if (!store_id) {
      return NextResponse.json(
        { error: 'store_id is required for inventory sync' },
        { status: 400 }
      );
    }

    let result;
    
    if (products && Array.isArray(products)) {
      // Convert product SKUs to expected format for sync
      const productData = products.map(sku => ({
        sku,
        available_quantity: 0, // Will be updated during sync
      }));
      result = await inventoryService.syncInventoryWithExternalSystem(store_id, productData);
    } else {
      // Trigger full inventory sync job
      const jobId = await jobQueueService.addJob(
        'inventory_update',
        {
          store_id,
          sync_type: 'full_sync',
          triggered_by: 'manual'
        },
        'medium'
      );
      
      result = { success: true, job_id: jobId };
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Inventory sync initiated'
    });

  } catch (error) {
    throw error;
  }
}