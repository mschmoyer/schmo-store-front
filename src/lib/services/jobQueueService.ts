import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import { UUID } from '@/lib/types/database';
import { parseShipStationWebhookPayload } from '@/lib/shipstation/webhookPayload';
import { JobQueueRow } from '@/lib/types/db-rows';
import {
  DeliveryData,
  ExceptionData,
  ShipmentTrackingData,
  notificationService
} from './notificationService';
import { inventoryService } from './inventoryService';
import { orderStatusService } from './orderStatusService';

/** Aggregate job counts returned by the queue statistics query. */
type JobStatsRow = {
  total: string;
  pending: string;
  processing: string;
  completed: string;
  failed: string;
  retrying: string;
  by_type: Record<string, number> | null;
  by_priority: Record<string, number> | null;
};

/**
 * Read a string member from an untyped job payload.
 *
 * @param payload - JSONB payload stored on the job row
 * @param key - Member to read
 * @returns The value when it is a string, otherwise undefined
 */
function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read a number member from an untyped job payload.
 *
 * @param payload - JSONB payload stored on the job row
 * @param key - Member to read
 * @returns The value when it is a number, otherwise undefined
 */
function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Read a boolean member from an untyped job payload.
 *
 * @param payload - JSONB payload stored on the job row
 * @param key - Member to read
 * @returns The value when it is a boolean, otherwise undefined
 */
function payloadBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Read a nested object member from an untyped job payload.
 *
 * @param payload - JSONB payload stored on the job row
 * @param key - Member to read
 * @returns The value when it is a plain object, otherwise undefined
 */
function payloadObject(
  payload: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = payload[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Background Job Queue Service
 * 
 * Handles background processing of:
 * - Order notifications
 * - Inventory updates
 * - Shipment processing
 * - Webhook processing
 * 
 * Features:
 * - Retry logic for failed jobs
 * - Priority-based processing
 * - Error logging and monitoring
 * - Job scheduling and delays
 * 
 * @example
 * ```typescript
 * const jobQueue = new JobQueueService();
 * await jobQueue.addJob('order_notification', { order_id: '123' }, 'high');
 * await jobQueue.processJobs();
 * ```
 */
export class JobQueueService {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
  private readonly BATCH_SIZE = 10;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  /**
   * Add a job to the queue
   * @param jobType - Type of job
   * @param payload - Job payload
   * @param priority - Job priority
   * @param scheduledAt - Optional scheduled execution time
   * @returns Promise<UUID> - Job ID
   */
  async addJob(
    jobType: 'order_notification' | 'inventory_update' | 'shipment_processing' | 'webhook_processing',
    payload: Record<string, unknown>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    scheduledAt?: Date
  ): Promise<UUID> {
    const jobId = uuidv4();
    
    try {
      await db.query(`
        INSERT INTO job_queue (
          id, job_type, payload, status, priority, attempts, max_attempts,
          scheduled_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        jobId,
        jobType,
        JSON.stringify(payload),
        'pending',
        priority,
        0,
        this.MAX_RETRY_ATTEMPTS,
        scheduledAt || new Date(),
        new Date(),
        new Date()
      ]);

      console.log(`Job queued: ${jobType} (${priority}) - ${jobId}`);
      return jobId;

    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw error;
    }
  }

  /**
   * Process pending jobs from the queue
   * @returns Promise<void>
   */
  async processJobs(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending jobs ordered by priority and scheduled time
      const jobsResult = await db.query<JobQueueRow>(`
        SELECT * FROM job_queue 
        WHERE status IN ('pending', 'retrying') 
          AND (scheduled_at IS NULL OR scheduled_at <= NOW())
        ORDER BY 
          CASE priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            WHEN 'low' THEN 4 
          END,
          created_at ASC
        LIMIT $1
      `, [this.BATCH_SIZE]);

      const jobs = jobsResult.rows;

      if (jobs.length === 0) {
        return;
      }

      console.log(`Processing ${jobs.length} jobs from queue`);

      // Process each job
      for (const job of jobs) {
        await this.processJob(job);
      }

    } catch (error) {
      console.error('Error processing job queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   * @param job - Job to process
   * @returns Promise<void>
   */
  private async processJob(job: JobQueueRow): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark job as processing
      await this.updateJobStatus(job.id, 'processing', null, new Date());

      // Process based on job type
      let result: boolean = false;

      switch (job.job_type) {
        case 'order_notification':
          result = await this.processOrderNotificationJob(job.payload);
          break;
        case 'inventory_update':
          result = await this.processInventoryUpdateJob(job.payload);
          break;
        case 'shipment_processing':
          result = await this.processShipmentProcessingJob(job.payload);
          break;
        case 'webhook_processing':
          result = await this.processWebhookProcessingJob(job.payload);
          break;
        default:
          console.warn(`Unknown job type: ${job.job_type}`);
          result = false;
      }

      if (result) {
        // Mark job as completed
        await this.updateJobStatus(job.id, 'completed', null, null, new Date());
        console.log(`Job completed: ${job.job_type} - ${job.id} (${Date.now() - startTime}ms)`);
      } else {
        // Handle failure
        await this.handleJobFailure(job, 'Job processing returned false');
      }

    } catch (error) {
      console.error(`Error processing job ${job.id} (${job.job_type}):`, error);
      await this.handleJobFailure(job, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Process order notification job
   * @param payload - Job payload
   * @returns Promise<boolean> - Success status
   */
  private async processOrderNotificationJob(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const orderId = payloadString(payload, 'order_id');
      const notificationType = payloadString(payload, 'notification_type');

      if (!orderId || !notificationType) {
        throw new Error('Missing required fields: order_id, notification_type');
      }

      switch (notificationType) {
        case 'shipped': {
          const trackingData: ShipmentTrackingData = {
            tracking_number: payloadString(payload, 'tracking_number'),
            carrier: payloadString(payload, 'carrier'),
            tracking_url: payloadString(payload, 'tracking_url'),
            estimated_delivery: payloadString(payload, 'estimated_delivery'),
            shipment_cost: payloadNumber(payload, 'shipment_cost'),
            service_code: payloadString(payload, 'service_code')
          };
          return await notificationService.sendShipmentNotificationEmail(orderId, trackingData);
        }
        case 'delivered': {
          const deliveryData: DeliveryData = {
            delivered_date: payloadString(payload, 'delivered_date'),
            tracking_number: payloadString(payload, 'tracking_number'),
            carrier: payloadString(payload, 'carrier'),
            delivery_confirmation: payloadString(payload, 'delivery_confirmation'),
            signature_required: payloadBoolean(payload, 'signature_required')
          };
          return await notificationService.sendDeliveryNotificationEmail(orderId, deliveryData);
        }
        case 'exception': {
          const exceptionData: ExceptionData = {
            exception_description: payloadString(payload, 'exception_description'),
            tracking_number: payloadString(payload, 'tracking_number'),
            carrier: payloadString(payload, 'carrier'),
            exception_date: payloadString(payload, 'exception_date'),
            next_steps: payloadString(payload, 'next_steps')
          };
          return await notificationService.sendExceptionNotificationEmail(orderId, exceptionData);
        }
        default:
          throw new Error(`Unknown notification type: ${notificationType}`);
      }

    } catch (error) {
      console.error('Error processing order notification job:', error);
      return false;
    }
  }

  /**
   * Process inventory update job
   * @param payload - Job payload
   * @returns Promise<boolean> - Success status
   */
  private async processInventoryUpdateJob(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const orderId = payloadString(payload, 'order_id');

      if (!orderId) {
        throw new Error('Missing required field: order_id');
      }

      const shipmentData = payloadObject(payload, 'shipment_data');

      return await inventoryService.updateInventoryAfterShipment(orderId, {
        tracking_number: shipmentData ? payloadString(shipmentData, 'tracking_number') : undefined,
        carrier: shipmentData ? payloadString(shipmentData, 'carrier') : undefined
      });

    } catch (error) {
      console.error('Error processing inventory update job:', error);
      return false;
    }
  }

  /**
   * Process shipment processing job
   * @param payload - Job payload
   * @returns Promise<boolean> - Success status
   */
  private async processShipmentProcessingJob(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const webhookPayload = payloadObject(payload, 'webhook_payload');

      if (!webhookPayload) {
        throw new Error('Missing required field: webhook_payload');
      }

      const parsedPayload = parseShipStationWebhookPayload(webhookPayload);
      if (!parsedPayload) {
        throw new Error('Invalid ShipStation webhook payload in job');
      }

      return await orderStatusService.processShipmentNotification(parsedPayload);

    } catch (error) {
      console.error('Error processing shipment processing job:', error);
      return false;
    }
  }

  /**
   * Process webhook processing job
   * @param payload - Job payload
   * @returns Promise<boolean> - Success status
   */
  private async processWebhookProcessingJob(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const webhookType = payloadString(payload, 'webhook_type');
      const webhookData = payloadObject(payload, 'webhook_data');

      if (!webhookType || !webhookData) {
        throw new Error('Missing required fields: webhook_type, webhook_data');
      }

      // Process different webhook types
      switch (webhookType) {
        case 'shipstation_webhook': {
          const parsedWebhook = parseShipStationWebhookPayload(webhookData);
          if (!parsedWebhook) {
            throw new Error('Invalid ShipStation webhook payload in job');
          }
          return await orderStatusService.processShipmentNotification(parsedWebhook);
        }
        default:
          console.warn(`Unknown webhook type: ${webhookType}`);
          return false;
      }

    } catch (error) {
      console.error('Error processing webhook processing job:', error);
      return false;
    }
  }

  /**
   * Handle job failure
   * @param job - Failed job
   * @param errorMessage - Error message
   * @returns Promise<void>
   */
  private async handleJobFailure(job: JobQueueRow, errorMessage: string): Promise<void> {
    const newAttempts = (job.attempts ?? 0) + 1;
    const maxAttempts = job.max_attempts ?? this.MAX_RETRY_ATTEMPTS;

    if (newAttempts >= maxAttempts) {
      // Max attempts reached, mark as failed
      await this.updateJobStatus(job.id, 'failed', errorMessage);
      console.error(`Job failed permanently: ${job.job_type} - ${job.id} (${newAttempts} attempts)`);
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = this.RETRY_DELAYS[newAttempts - 1] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
      const scheduledAt = new Date(Date.now() + retryDelay);

      await db.query(`
        UPDATE job_queue 
        SET 
          status = 'retrying',
          attempts = $1,
          error_message = $2,
          scheduled_at = $3,
          updated_at = $4
        WHERE id = $5
      `, [newAttempts, errorMessage, scheduledAt, new Date(), job.id]);

      console.warn(`Job scheduled for retry: ${job.job_type} - ${job.id} (attempt ${newAttempts}/${job.max_attempts}) in ${retryDelay}ms`);
    }
  }

  /**
   * Update job status
   * @param jobId - Job UUID
   * @param status - New status
   * @param errorMessage - Error message
   * @param startedAt - Started timestamp
   * @param completedAt - Completed timestamp
   * @returns Promise<void>
   */
  private async updateJobStatus(
    jobId: UUID,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying',
    errorMessage?: string | null,
    startedAt?: Date | null,
    completedAt?: Date | null
  ): Promise<void> {
    try {
      const updateFields: string[] = ['status = $2', 'updated_at = $3'];
      const values: (string | Date | number | null)[] = [jobId, status, new Date()];
      let paramIndex = 4;

      if (errorMessage !== undefined) {
        updateFields.push(`error_message = $${paramIndex++}`);
        values.push(errorMessage);
      }

      if (startedAt !== undefined) {
        updateFields.push(`started_at = $${paramIndex++}`);
        values.push(startedAt);
      }

      if (completedAt !== undefined) {
        updateFields.push(`completed_at = $${paramIndex++}`);
        values.push(completedAt);
      }

      await db.query(`
        UPDATE job_queue 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, values);

    } catch (error) {
      console.error('Error updating job status:', error);
    }
  }

  /**
   * Start automatic job processing
   * @param intervalMs - Processing interval in milliseconds
   * @returns void
   */
  startProcessing(intervalMs: number = 30000): void {
    if (this.processingInterval) {
      this.stopProcessing();
    }

    console.log(`Starting job queue processing (interval: ${intervalMs}ms)`);
    
    this.processingInterval = setInterval(async () => {
      try {
        await this.processJobs();
      } catch (error) {
        console.error('Error in job processing interval:', error);
      }
    }, intervalMs);

    // Process jobs immediately
    this.processJobs().catch(error => {
      console.error('Error in initial job processing:', error);
    });
  }

  /**
   * Stop automatic job processing
   * @returns void
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Job queue processing stopped');
    }
  }

  /**
   * Get job statistics
   * @param timeRange - Time range in hours
   * @returns Promise<JobStats>
   */
  async getJobStats(timeRange: number = 24): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
  }> {
    try {
      const cutoffTime = new Date(Date.now() - timeRange * 60 * 60 * 1000);

      const result = await db.query<JobStatsRow>(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'retrying' THEN 1 END) as retrying,
          json_object_agg(job_type, type_count) as by_type,
          json_object_agg(priority, priority_count) as by_priority
        FROM (
          SELECT 
            status, job_type, priority,
            COUNT(*) OVER (PARTITION BY job_type) as type_count,
            COUNT(*) OVER (PARTITION BY priority) as priority_count
          FROM job_queue 
          WHERE created_at >= $1
        ) stats
      `, [cutoffTime]);

      const stats = result.rows[0];
      
      return {
        total: parseInt(stats.total, 10),
        pending: parseInt(stats.pending, 10),
        processing: parseInt(stats.processing, 10),
        completed: parseInt(stats.completed, 10),
        failed: parseInt(stats.failed, 10),
        retrying: parseInt(stats.retrying, 10),
        by_type: stats.by_type || {},
        by_priority: stats.by_priority || {}
      };

    } catch (error) {
      console.error('Error getting job stats:', error);
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retrying: 0,
        by_type: {},
        by_priority: {}
      };
    }
  }

  /**
   * Clean up old completed/failed jobs
   * @param olderThanDays - Remove jobs older than specified days
   * @returns Promise<number> - Number of jobs removed
   */
  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      const result = await db.query(`
        DELETE FROM job_queue 
        WHERE status IN ('completed', 'failed') 
          AND completed_at < $1
      `, [cutoffTime]);

      const deletedCount = result.rowCount || 0;
      console.log(`Cleaned up ${deletedCount} old jobs (older than ${olderThanDays} days)`);
      
      return deletedCount;

    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      return 0;
    }
  }

  /**
   * Get failed jobs for manual inspection
   * @param limit - Maximum number of jobs to return
   * @returns Promise<JobQueueRow[]>
   */
  async getFailedJobs(limit: number = 100): Promise<JobQueueRow[]> {
    try {
      const result = await db.query<JobQueueRow>(`
        SELECT * FROM job_queue 
        WHERE status = 'failed'
        ORDER BY updated_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;

    } catch (error) {
      console.error('Error getting failed jobs:', error);
      return [];
    }
  }

  /**
   * Retry a failed job
   * @param jobId - Job UUID
   * @returns Promise<boolean> - Success status
   */
  async retryJob(jobId: UUID): Promise<boolean> {
    try {
      const result = await db.query(`
        UPDATE job_queue 
        SET 
          status = 'pending',
          attempts = 0,
          error_message = NULL,
          scheduled_at = NOW(),
          updated_at = NOW()
        WHERE id = $1 AND status = 'failed'
      `, [jobId]);

      const updated = (result.rowCount || 0) > 0;
      
      if (updated) {
        console.log(`Job ${jobId} has been reset for retry`);
      } else {
        console.warn(`Job ${jobId} not found or not in failed status`);
      }

      return updated;

    } catch (error) {
      console.error('Error retrying job:', error);
      return false;
    }
  }
}

// Export singleton instance
export const jobQueueService = new JobQueueService();