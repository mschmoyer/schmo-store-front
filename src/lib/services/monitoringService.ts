import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  IntegrationLog,
  LogRequestData,
  LogResponseData
} from '@/lib/types/database';

export interface MonitoringEventData {
  request?: LogRequestData;
  response?: LogResponseData;
  metrics?: {
    records_processed?: number;
    success_count?: number;
    error_count?: number;
    bytes_transferred?: number;
  };
  context?: {
    user_id?: UUID;
    session_id?: string;
    correlation_id?: string;
    operation_context?: string;
  };
}

/**
 * Monitoring and Logging Service
 * 
 * Provides comprehensive monitoring and logging for ShipStation integration:
 * - Integration success/failure tracking
 * - Performance metrics collection
 * - Error alerting system
 * - Health check monitoring
 * - Integration analytics and reporting
 * 
 * @example
 * ```typescript
 * const monitoring = new MonitoringService();
 * await monitoring.logIntegrationEvent('order_export', 'success', data);
 * const metrics = await monitoring.getIntegrationMetrics('shipstation', 24);
 * ```
 */
export class MonitoringService {
  private readonly ALERT_THRESHOLDS = {
    ERROR_RATE: 0.1, // 10% error rate
    RESPONSE_TIME: 5000, // 5 seconds
    FAILED_JOBS: 50, // 50 failed jobs
    SUCCESS_RATE: 0.95 // 95% success rate
  };

  /**
   * Log integration event
   * @param operation - Operation type
   * @param status - Operation status
   * @param data - Operation data
   * @param storeId - Store UUID
   * @param integrationType - Integration type
   * @param executionTimeMs - Execution time in milliseconds
   * @param errorMessage - Error message if failed
   * @returns Promise<UUID> - Log entry ID
   */
  async logIntegrationEvent(
    operation: 'order_export' | 'shipment_import' | 'inventory_sync' | 'webhook_processing',
    status: 'success' | 'failure' | 'warning',
    data: MonitoringEventData,
    storeId: UUID = 'system',
    integrationType: 'shipstation' | 'shipengine' | 'stripe' | 'other' = 'shipstation',
    executionTimeMs?: number,
    errorMessage?: string
  ): Promise<UUID> {
    const logId = uuidv4();

    try {
      await db.query(`
        INSERT INTO integration_logs (
          id, store_id, integration_type, operation, status,
          request_data, response_data, execution_time_ms, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        logId,
        storeId,
        integrationType,
        operation,
        status,
        JSON.stringify(data.request || {}),
        JSON.stringify(data.response || {}),
        executionTimeMs,
        errorMessage,
        new Date()
      ]);

      // Check for alert conditions
      if (status === 'failure') {
        await this.checkAlertConditions(storeId, integrationType, operation);
      }

      return logId;

    } catch (error) {
      console.error('Error logging integration event:', error);
      throw error;
    }
  }

  /**
   * Get integration metrics for specified time period
   * @param integrationType - Integration type
   * @param hoursBack - Hours to look back
   * @param storeId - Optional store filter
   * @returns Promise<IntegrationMetrics>
   */
  async getIntegrationMetrics(
    integrationType: string,
    hoursBack: number = 24,
    storeId?: UUID
  ): Promise<{
    total_operations: number;
    successful_operations: number;
    failed_operations: number;
    warning_operations: number;
    success_rate: number;
    error_rate: number;
    avg_execution_time: number;
    max_execution_time: number;
    min_execution_time: number;
    operations_by_type: Record<string, number>;
    operations_by_hour: Array<{
      hour: string;
      total: number;
      success: number;
      failure: number;
      warning: number;
    }>;
    recent_errors: Array<{
      id: UUID;
      operation: string;
      error_message: string;
      created_at: Date;
      execution_time_ms: number;
    }>;
  }> {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      // Base query conditions
      const whereClause = storeId 
        ? 'WHERE integration_type = $1 AND created_at >= $2 AND store_id = $3'
        : 'WHERE integration_type = $1 AND created_at >= $2';
      
      const params = storeId 
        ? [integrationType, cutoffTime, storeId]
        : [integrationType, cutoffTime];

      // Get overall metrics
      const metricsResult = await db.query(`
        SELECT 
          COUNT(*) as total_operations,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_operations,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_operations,
          COUNT(CASE WHEN status = 'warning' THEN 1 END) as warning_operations,
          AVG(execution_time_ms) as avg_execution_time,
          MAX(execution_time_ms) as max_execution_time,
          MIN(execution_time_ms) as min_execution_time
        FROM integration_logs 
        ${whereClause}
      `, params);

      const metrics = metricsResult.rows[0];
      const total = parseInt(metrics.total_operations);
      const successful = parseInt(metrics.successful_operations);
      const failed = parseInt(metrics.failed_operations);

      // Get operations by type
      const operationTypesResult = await db.query(`
        SELECT operation, COUNT(*) as count
        FROM integration_logs 
        ${whereClause}
        GROUP BY operation
        ORDER BY count DESC
      `, params);

      const operationsByType = operationTypesResult.rows.reduce((acc: Record<string, number>, row) => {
        acc[row.operation] = parseInt(row.count);
        return acc;
      }, {});

      // Get hourly breakdown
      const hourlyResult = await db.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as success,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as failure,
          COUNT(CASE WHEN status = 'warning' THEN 1 END) as warning
        FROM integration_logs 
        ${whereClause}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
        LIMIT 24
      `, params);

      const operationsByHour = hourlyResult.rows.map(row => ({
        hour: row.hour.toISOString(),
        total: parseInt(row.total),
        success: parseInt(row.success),
        failure: parseInt(row.failure),
        warning: parseInt(row.warning)
      }));

      // Get recent errors
      const errorsResult = await db.query(`
        SELECT id, operation, error_message, created_at, execution_time_ms
        FROM integration_logs 
        ${whereClause} AND status = 'failure'
        ORDER BY created_at DESC
        LIMIT 10
      `, params);

      const recentErrors = errorsResult.rows.map(row => ({
        id: row.id,
        operation: row.operation,
        error_message: row.error_message,
        created_at: row.created_at,
        execution_time_ms: row.execution_time_ms
      }));

      return {
        total_operations: total,
        successful_operations: successful,
        failed_operations: failed,
        warning_operations: parseInt(metrics.warning_operations),
        success_rate: total > 0 ? successful / total : 0,
        error_rate: total > 0 ? failed / total : 0,
        avg_execution_time: parseFloat(metrics.avg_execution_time) || 0,
        max_execution_time: parseInt(metrics.max_execution_time) || 0,
        min_execution_time: parseInt(metrics.min_execution_time) || 0,
        operations_by_type: operationsByType,
        operations_by_hour: operationsByHour,
        recent_errors: recentErrors
      };

    } catch (error) {
      console.error('Error getting integration metrics:', error);
      throw error;
    }
  }

  /**
   * Get integration health status
   * @param integrationType - Integration type
   * @param storeId - Optional store filter
   * @returns Promise<HealthStatus>
   */
  async getIntegrationHealth(
    integrationType: string,
    storeId?: UUID
  ): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    metrics: {
      success_rate_24h: number;
      error_rate_24h: number;
      avg_response_time_24h: number;
      failed_jobs_24h: number;
      last_successful_operation: Date | null;
      last_failed_operation: Date | null;
    };
    recommendations: string[];
  }> {
    try {
      const metrics = await this.getIntegrationMetrics(integrationType, 24, storeId);
      const issues: string[] = [];
      const recommendations: string[] = [];
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      // Check error rate
      if (metrics.error_rate > this.ALERT_THRESHOLDS.ERROR_RATE) {
        issues.push(`High error rate: ${(metrics.error_rate * 100).toFixed(1)}%`);
        status = 'warning';
        
        if (metrics.error_rate > 0.25) {
          status = 'critical';
        }
        
        recommendations.push('Investigate recent errors and fix underlying issues');
      }

      // Check response time
      if (metrics.avg_execution_time > this.ALERT_THRESHOLDS.RESPONSE_TIME) {
        issues.push(`Slow response time: ${metrics.avg_execution_time.toFixed(0)}ms`);
        status = status === 'critical' ? 'critical' : 'warning';
        recommendations.push('Review integration performance and optimize API calls');
      }

      // Check success rate
      if (metrics.success_rate < this.ALERT_THRESHOLDS.SUCCESS_RATE) {
        issues.push(`Low success rate: ${(metrics.success_rate * 100).toFixed(1)}%`);
        status = 'critical';
        recommendations.push('Immediate attention required - multiple operations failing');
      }

      // Check for no recent activity
      const cutoffTime = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours
      const recentActivityResult = await db.query(`
        SELECT MAX(created_at) as last_activity
        FROM integration_logs 
        WHERE integration_type = $1 
          AND created_at >= $2
          ${storeId ? 'AND store_id = $3' : ''}
      `, storeId ? [integrationType, cutoffTime, storeId] : [integrationType, cutoffTime]);

      const lastActivity = recentActivityResult.rows[0]?.last_activity;
      
      if (!lastActivity) {
        issues.push('No recent integration activity detected');
        status = 'warning';
        recommendations.push('Verify integration is active and configured correctly');
      }

      // Get last successful and failed operations
      const lastOpsResult = await db.query(`
        SELECT 
          MAX(CASE WHEN status = 'success' THEN created_at END) as last_success,
          MAX(CASE WHEN status = 'failure' THEN created_at END) as last_failure
        FROM integration_logs 
        WHERE integration_type = $1
          ${storeId ? 'AND store_id = $2' : ''}
      `, storeId ? [integrationType, storeId] : [integrationType]);

      const lastOps = lastOpsResult.rows[0];

      return {
        status,
        issues,
        metrics: {
          success_rate_24h: metrics.success_rate,
          error_rate_24h: metrics.error_rate,
          avg_response_time_24h: metrics.avg_execution_time,
          failed_jobs_24h: metrics.failed_operations,
          last_successful_operation: lastOps.last_success,
          last_failed_operation: lastOps.last_failure
        },
        recommendations
      };

    } catch (error) {
      console.error('Error getting integration health:', error);
      return {
        status: 'critical',
        issues: ['Unable to retrieve health status'],
        metrics: {
          success_rate_24h: 0,
          error_rate_24h: 1,
          avg_response_time_24h: 0,
          failed_jobs_24h: 0,
          last_successful_operation: null,
          last_failed_operation: null
        },
        recommendations: ['Check database connectivity and service health']
      };
    }
  }

  /**
   * Check alert conditions and trigger alerts if necessary
   * @param storeId - Store UUID
   * @param integrationType - Integration type
   * @param operation - Operation type
   * @returns Promise<void>
   */
  private async checkAlertConditions(
    storeId: UUID,
    integrationType: string,
    operation: string
  ): Promise<void> {
    try {
      // Check recent error rate (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const recentErrorsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as failures
        FROM integration_logs 
        WHERE store_id = $1 
          AND integration_type = $2 
          AND created_at >= $3
      `, [storeId, integrationType, oneHourAgo]);

      const recentStats = recentErrorsResult.rows[0];
      const total = parseInt(recentStats.total);
      const failures = parseInt(recentStats.failures);
      const errorRate = total > 0 ? failures / total : 0;

      // Trigger alerts based on conditions
      if (errorRate > this.ALERT_THRESHOLDS.ERROR_RATE && total >= 5) {
        await this.triggerAlert({
          level: 'warning',
          type: 'high_error_rate',
          store_id: storeId,
          integration_type: integrationType,
          operation: operation,
          message: `High error rate detected: ${(errorRate * 100).toFixed(1)}% (${failures}/${total}) in the last hour`,
          metadata: {
            error_rate: errorRate,
            total_operations: total,
            failed_operations: failures,
            time_window: '1 hour'
          }
        });
      }

      // Check for consecutive failures
      const consecutiveFailuresResult = await db.query(`
        SELECT COUNT(*) as consecutive_failures
        FROM (
          SELECT status,
                 ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
          FROM integration_logs 
          WHERE store_id = $1 
            AND integration_type = $2 
            AND operation = $3
            AND created_at >= $4
          ORDER BY created_at DESC
          LIMIT 10
        ) recent
        WHERE status = 'failure' AND rn <= (
          SELECT MIN(rn) - 1
          FROM (
            SELECT status,
                   ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
            FROM integration_logs 
            WHERE store_id = $1 
              AND integration_type = $2 
              AND operation = $3
              AND created_at >= $4
            ORDER BY created_at DESC
            LIMIT 10
          ) sub
          WHERE status = 'success'
          UNION ALL
          SELECT 11
        )
      `, [storeId, integrationType, operation, oneHourAgo]);

      const consecutiveFailures = parseInt(consecutiveFailuresResult.rows[0]?.consecutive_failures || 0);

      if (consecutiveFailures >= 5) {
        await this.triggerAlert({
          level: 'critical',
          type: 'consecutive_failures',
          store_id: storeId,
          integration_type: integrationType,
          operation: operation,
          message: `${consecutiveFailures} consecutive failures detected for ${operation}`,
          metadata: {
            consecutive_failures: consecutiveFailures,
            operation: operation
          }
        });
      }

    } catch (error) {
      console.error('Error checking alert conditions:', error);
    }
  }

  /**
   * Trigger an alert
   * @param alert - Alert data
   * @returns Promise<void>
   */
  private async triggerAlert(alert: {
    level: 'info' | 'warning' | 'critical';
    type: string;
    store_id: UUID;
    integration_type: string;
    operation: string;
    message: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Log the alert
      console[alert.level === 'critical' ? 'error' : 'warn'](`ALERT [${alert.level.toUpperCase()}]: ${alert.message}`, alert.metadata);

      // Store alert in database
      await db.query(`
        INSERT INTO integration_alerts (
          id, store_id, integration_type, operation, level, type, message, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        uuidv4(),
        alert.store_id,
        alert.integration_type,
        alert.operation,
        alert.level,
        alert.type,
        alert.message,
        JSON.stringify(alert.metadata),
        new Date()
      ]);

      // TODO: Implement external alerting (email, Slack, PagerDuty, etc.)
      // await this.sendExternalAlert(alert);

    } catch (error) {
      console.error('Error triggering alert:', error);
    }
  }

  /**
   * Get recent alerts
   * @param storeId - Store UUID
   * @param hoursBack - Hours to look back
   * @param level - Alert level filter
   * @returns Promise<Alert[]>
   */
  async getRecentAlerts(
    storeId?: UUID,
    hoursBack: number = 24,
    level?: 'info' | 'warning' | 'critical'
  ): Promise<Array<{
    id: UUID;
    store_id: UUID;
    integration_type: string;
    operation: string;
    level: string;
    type: string;
    message: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>> {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      let whereClause = 'WHERE created_at >= $1';
      const params: (Date | string)[] = [cutoffTime];
      let paramIndex = 2;

      if (storeId) {
        whereClause += ` AND store_id = $${paramIndex++}`;
        params.push(storeId);
      }

      if (level) {
        whereClause += ` AND level = $${paramIndex++}`;
        params.push(level);
      }

      const result = await db.query(`
        SELECT * FROM integration_alerts 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 100
      `, params);

      return result.rows.map(row => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      }));

    } catch (error) {
      console.error('Error getting recent alerts:', error);
      return [];
    }
  }

  /**
   * Get integration performance trends
   * @param integrationType - Integration type
   * @param daysBack - Days to analyze
   * @param storeId - Optional store filter
   * @returns Promise<PerformanceTrends>
   */
  async getPerformanceTrends(
    integrationType: string,
    daysBack: number = 7,
    storeId?: UUID
  ): Promise<{
    daily_stats: Array<{
      date: string;
      total_operations: number;
      success_rate: number;
      avg_execution_time: number;
      error_count: number;
    }>;
    trends: {
      success_rate_trend: 'improving' | 'stable' | 'declining';
      response_time_trend: 'improving' | 'stable' | 'declining';
      volume_trend: 'increasing' | 'stable' | 'decreasing';
    };
  }> {
    try {
      const cutoffTime = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      
      const whereClause = storeId 
        ? 'WHERE integration_type = $1 AND created_at >= $2 AND store_id = $3'
        : 'WHERE integration_type = $1 AND created_at >= $2';
      
      const params = storeId 
        ? [integrationType, cutoffTime, storeId]
        : [integrationType, cutoffTime];

      const dailyStatsResult = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_operations,
          COUNT(CASE WHEN status = 'success' THEN 1 END)::float / COUNT(*) as success_rate,
          AVG(execution_time_ms) as avg_execution_time,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as error_count
        FROM integration_logs 
        ${whereClause}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, params);

      const dailyStats = dailyStatsResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        total_operations: parseInt(row.total_operations),
        success_rate: parseFloat(row.success_rate) || 0,
        avg_execution_time: parseFloat(row.avg_execution_time) || 0,
        error_count: parseInt(row.error_count)
      }));

      // Calculate trends
      const trends = this.calculateTrends(dailyStats);

      return {
        daily_stats: dailyStats.reverse(), // Return in chronological order
        trends
      };

    } catch (error) {
      console.error('Error getting performance trends:', error);
      throw error;
    }
  }

  /**
   * Calculate performance trends
   * @param dailyStats - Daily statistics
   * @returns Trend analysis
   */
  private calculateTrends(dailyStats: Array<{
    date: string;
    success_count: number;
    failure_count: number;
    total_count: number;
    avg_execution_time: number;
    success_rate: number;
  }>): {
    success_rate_trend: 'improving' | 'stable' | 'declining';
    response_time_trend: 'improving' | 'stable' | 'declining';
    volume_trend: 'increasing' | 'stable' | 'decreasing';
  } {
    if (dailyStats.length < 3) {
      return {
        success_rate_trend: 'stable',
        response_time_trend: 'stable',
        volume_trend: 'stable'
      };
    }

    // Simple trend calculation using linear regression slope
    const calculateSlope = (values: number[]): number => {
      const n = values.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = values;
      
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
      const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
      
      return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    };

    const successRates = dailyStats.map(d => d.success_rate);
    const responseTimes = dailyStats.map(d => d.avg_execution_time);
    const volumes = dailyStats.map(d => d.total_operations);

    const successRateSlope = calculateSlope(successRates);
    const responseTimeSlope = calculateSlope(responseTimes);
    const volumeSlope = calculateSlope(volumes);

    const TREND_THRESHOLD = 0.01; // 1% threshold for significance

    return {
      success_rate_trend: 
        successRateSlope > TREND_THRESHOLD ? 'improving' :
        successRateSlope < -TREND_THRESHOLD ? 'declining' : 'stable',
      response_time_trend:
        responseTimeSlope < -100 ? 'improving' :
        responseTimeSlope > 100 ? 'declining' : 'stable',
      volume_trend:
        volumeSlope > 1 ? 'increasing' :
        volumeSlope < -1 ? 'decreasing' : 'stable'
    };
  }

  /**
   * Export integration logs for analysis
   * @param storeId - Store UUID
   * @param integrationType - Integration type
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Promise<IntegrationLog[]>
   */
  async exportIntegrationLogs(
    storeId: UUID,
    integrationType: string,
    startDate: Date,
    endDate: Date
  ): Promise<IntegrationLog[]> {
    try {
      const result = await db.query(`
        SELECT * FROM integration_logs 
        WHERE store_id = $1 
          AND integration_type = $2 
          AND created_at BETWEEN $3 AND $4
        ORDER BY created_at DESC
      `, [storeId, integrationType, startDate, endDate]);

      return result.rows as IntegrationLog[];

    } catch (error) {
      console.error('Error exporting integration logs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();