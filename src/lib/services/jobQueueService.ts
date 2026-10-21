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

/** Every kind of work the queue knows how to run. */
export type JobType =
  | 'order_notification'
  | 'inventory_update'
  | 'shipment_processing'
  | 'webhook_processing'
  | 'shipstation_sync_page'
  | 'shipstation_order_push';

/** Optional metadata attached to a queued job. */
export interface AddJobOptions {
  /** Owning tenant. Lets the operator see, and the platform scope, work per store. */
  storeId?: string;
  /**
   * Idempotency key. While a job with this key is pending/processing/retrying, enqueuing the same
   * key is a no-op. Enforced by a partial unique index, so it holds across concurrent invocations.
   */
  dedupeKey?: string;
}

/** What one drain pass accomplished. */
export interface DrainSummary {
  claimed: number;
  completed: number;
  failed: number;
  /** True when the pass stopped on its time budget with work still waiting. */
  budgetExhausted: boolean;
  /**
   * True when an unscoped pass did nothing because another unscoped pass was already running in
   * this process. Distinguishes "nothing to do" from "did not look".
   */
  skippedBusy: boolean;
  /** Set when the pass itself failed (e.g. the claim query threw), as opposed to a job failing. */
  error?: string;
  durationMs: number;
}

/** Options for one drain pass. */
export interface ProcessJobsOptions {
  /** Maximum rows claimed. */
  batchSize?: number;
  /** Stop starting new jobs once this much wall-clock time has passed. */
  budgetMs?: number;
  /**
   * Only claim this store's jobs. Omit to drain every tenant's work (the cron path).
   *
   * Jobs enqueued with a NULL `store_id` never match a scoped pass, so they are drained only by an
   * unscoped one. Every production enqueue path tags its store; the exception is the operator's
   * test notification in `/api/admin/integrations/monitoring` (plus any row that predates
   * migration 022).
   */
  storeId?: string;
}

/**
 * Build the `SELECT ... FOR UPDATE SKIP LOCKED` that picks due jobs to claim.
 *
 * Exported so the store-scoping predicate can be tested as the SQL that actually runs, without a
 * database. `store_id` is a UUID column (migration 022), so the parameter is cast `::uuid`
 * explicitly rather than left for Postgres to deduce.
 *
 * @param batchSize - Maximum rows to claim.
 * @param storeId - When given, only that store's jobs are eligible.
 * @returns Query text and positional values.
 */
export function buildClaimJobsQuery(
  batchSize: number,
  storeId?: string
): { text: string; values: Array<number | string> } {
  const storeFilter = storeId !== undefined ? 'AND store_id = $2::uuid' : '';
  const text = `SELECT id FROM job_queue
          WHERE status IN ('pending', 'retrying')
            AND (scheduled_at IS NULL OR scheduled_at <= NOW())
            ${storeFilter}
          ORDER BY
            CASE priority
              WHEN 'urgent' THEN 1
              WHEN 'high' THEN 2
              WHEN 'medium' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END,
            created_at ASC
          LIMIT $1::int
          FOR UPDATE SKIP LOCKED`;

  return { text, values: storeId !== undefined ? [batchSize, storeId] : [batchSize] };
}

/**
 * How long a job may sit in `processing` before a drain treats its invocation as dead.
 *
 * A claimed job is marked `processing` before it runs. If Vercel kills the invocation at
 * `maxDuration` — likelier now that drains also run in `after()` on storefront and webhook
 * requests — nothing ever moves the row on, and the partial unique index on `dedupe_key` then
 * blocks re-enqueueing the same sync page or order push forever. The longest `maxDuration` in
 * `vercel.json` is 300 s, so 15 minutes cannot reclaim a job that is still genuinely running.
 */
export const STALE_PROCESSING_MINUTES = 15;

/**
 * Build the statement that returns jobs abandoned in `processing` to the pool.
 *
 * The killed run counts as an attempt: the job goes to `retrying` if it has attempts left, else to
 * `failed`, so a job that reliably outlives its function cannot loop forever.
 *
 * @param staleMinutes - Age of `started_at` after which a `processing` row is abandoned.
 * @param storeId - When given, only that store's jobs are recovered.
 * @returns Query text and positional values.
 */
export function buildRecoverStaleJobsQuery(
  staleMinutes: number,
  storeId?: string
): { text: string; values: Array<number | string> } {
  const storeFilter = storeId !== undefined ? 'AND store_id = $2::uuid' : '';
  const text = `UPDATE job_queue
          SET status = CASE
                WHEN COALESCE(attempts, 0) + 1 >= COALESCE(max_attempts, 3) THEN 'failed'
                ELSE 'retrying'
              END,
              attempts = COALESCE(attempts, 0) + 1,
              error_message = 'Abandoned in processing: the invocation running it did not finish',
              scheduled_at = NOW(),
              completed_at = CASE
                WHEN COALESCE(attempts, 0) + 1 >= COALESCE(max_attempts, 3) THEN NOW()
                ELSE completed_at
              END,
              updated_at = NOW()
          WHERE status = 'processing'
            AND started_at < NOW() - make_interval(mins => $1::int)
            ${storeFilter}`;

  return { text, values: storeId !== undefined ? [staleMinutes, storeId] : [staleMinutes] };
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
    jobType: JobType,
    payload: Record<string, unknown>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    scheduledAt?: Date,
    options: AddJobOptions = {}
  ): Promise<UUID | null> {
    const jobId = uuidv4();

    try {
      const result = await db.query(`
        INSERT INTO job_queue (
          id, job_type, payload, status, priority, attempts, max_attempts,
          scheduled_at, store_id, dedupe_key, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        jobId,
        jobType,
        JSON.stringify(payload),
        'pending',
        priority,
        0,
        this.MAX_RETRY_ATTEMPTS,
        scheduledAt || new Date(),
        options.storeId ?? null,
        options.dedupeKey ?? null,
        new Date(),
        new Date()
      ]);

      // The partial unique index on `dedupe_key` (migration 022) covers only outstanding jobs, so
      // a no-op insert means an identical unit of work is already queued or running. That is a
      // success for the caller, not an error — hence null rather than a throw.
      if (result.rows.length === 0) {
        console.log(`Job de-duplicated: ${jobType} (${options.dedupeKey ?? 'no key'})`);
        return null;
      }

      console.log(`Job queued: ${jobType} (${priority}) - ${jobId}`);
      return jobId;

    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw error;
    }
  }

  /**
   * Claim and run a bounded batch of due jobs.
   *
   * Claiming happens inside a transaction with `FOR UPDATE SKIP LOCKED`, so two concurrent cron
   * invocations (which Vercel makes easy to arrange) take disjoint work instead of both running the
   * same job. Without it, a redelivered webhook notification could be emailed to a customer twice.
   *
   * A `storeId` scopes the claim to one tenant's jobs — the visit-driven refresh and webhooks use
   * that to drain only the store they are serving. Scoped passes skip the in-process `isProcessing`
   * guard: on Fluid compute concurrent requests share this singleton, and a storefront refresh for
   * store A must not turn a webhook drain for store B into a silent no-op. `SKIP LOCKED` already
   * guarantees concurrent passes claim disjoint rows, so the guard only exists to stop the legacy
   * `startProcessing` interval from overlapping itself, and is kept for unscoped passes.
   *
   * @param options - `batchSize` caps rows claimed; `budgetMs` stops the pass before a serverless
   *   invocation is killed mid-job, leaving the remainder for the next cron tick; `storeId` limits
   *   the pass to one store (jobs with a NULL `store_id` are only drained by unscoped passes).
   * @returns What the pass accomplished.
   */
  async processJobs(options: ProcessJobsOptions = {}): Promise<DrainSummary> {
    const started = Date.now();
    const batchSize = options.batchSize ?? this.BATCH_SIZE;
    const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
    const scoped = options.storeId !== undefined;

    const summary: DrainSummary = {
      claimed: 0,
      completed: 0,
      failed: 0,
      budgetExhausted: false,
      skippedBusy: false,
      durationMs: 0
    };

    if (!scoped && this.isProcessing) {
      summary.skippedBusy = true;
      summary.durationMs = Date.now() - started;
      return summary;
    }

    if (!scoped) {
      this.isProcessing = true;
    }

    try {
      await this.recoverStaleJobs(options.storeId);
      const jobs = await this.claimJobs(batchSize, options.storeId);
      summary.claimed = jobs.length;

      if (jobs.length === 0) {
        return summary;
      }

      console.log(`Processing ${jobs.length} jobs from queue`);

      for (const job of jobs) {
        if (Date.now() - started > budgetMs) {
          // Hand the unstarted remainder back so the next tick picks them up promptly.
          await this.releaseJob(job.id);
          summary.budgetExhausted = true;
          summary.claimed--;
          continue;
        }

        const ok = await this.processJob(job);
        if (ok) {
          summary.completed++;
        } else {
          summary.failed++;
        }
      }

      return summary;
    } catch (error) {
      console.error('Error processing job queue:', error);
      summary.error = error instanceof Error ? error.message : 'Unknown error';
      return summary;
    } finally {
      if (!scoped) {
        this.isProcessing = false;
      }
      summary.durationMs = Date.now() - started;
    }
  }

  /**
   * Return jobs abandoned in `processing` to the pool before claiming. Runs on every drain, so the
   * visit, webhook and daily paths all heal what a killed invocation left behind. Best-effort: a
   * failure here is logged and must not stop the drain.
   *
   * @param storeId - When given, only that store's jobs are recovered.
   * @returns Number of rows recovered.
   */
  private async recoverStaleJobs(storeId?: string): Promise<number> {
    try {
      const { text, values } = buildRecoverStaleJobsQuery(STALE_PROCESSING_MINUTES, storeId);
      const result = await db.query(text, values);
      const recovered = result.rowCount ?? 0;
      if (recovered > 0) {
        console.warn(`Recovered ${recovered} job(s) abandoned in processing`);
      }
      return recovered;
    } catch (error) {
      console.error('Error recovering stale jobs:', error);
      return 0;
    }
  }

  /**
   * Atomically claim due jobs, marking them `processing`.
   *
   * @param batchSize - Maximum rows to claim.
   * @param storeId - When given, only that store's jobs are claimed.
   * @returns The claimed jobs.
   */
  private async claimJobs(batchSize: number, storeId?: string): Promise<JobQueueRow[]> {
    const claim = buildClaimJobsQuery(batchSize, storeId);
    return db.transaction(async (client) => {
      const due = await client.query<{ id: string }>(claim.text, claim.values);

      const ids = due.rows.map((row) => row.id);
      if (ids.length === 0) {
        return [];
      }

      const claimed = await client.query<JobQueueRow>(
        `UPDATE job_queue
            SET status = 'processing', started_at = NOW(), updated_at = NOW()
          WHERE id = ANY($1::uuid[])
          RETURNING *`,
        [ids]
      );

      return claimed.rows;
    });
  }

  /**
   * Return a claimed-but-unstarted job to the pending pool.
   *
   * @param jobId - Job UUID.
   * @returns Nothing.
   */
  private async releaseJob(jobId: UUID): Promise<void> {
    await db.query(
      `UPDATE job_queue SET status = 'pending', started_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [jobId]
    );
  }

  /**
   * Process a single already-claimed job.
   *
   * @param job - Job to process.
   * @returns True when the job completed; false when it was failed or scheduled for retry.
   */
  private async processJob(job: JobQueueRow): Promise<boolean> {
    const startTime = Date.now();

    try {
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
        case 'shipstation_sync_page':
          result = await this.processShipStationSyncPageJob(job.payload);
          break;
        case 'shipstation_order_push':
          result = await this.processShipStationOrderPushJob(job.payload);
          break;
        default:
          console.warn(`Unknown job type: ${job.job_type}`);
          result = false;
      }

      if (result) {
        await this.updateJobStatus(job.id, 'completed', null, null, new Date());
        console.log(`Job completed: ${job.job_type} - ${job.id} (${Date.now() - startTime}ms)`);
        return true;
      }

      await this.handleJobFailure(job, 'Job processing returned false');
      return false;
    } catch (error) {
      console.error(`Error processing job ${job.id} (${job.job_type}):`, error);
      await this.handleJobFailure(job, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Run one page of a ShipStation sync.
   *
   * Imported dynamically because the orchestrator enqueues through this service; a static import
   * would close a cycle.
   *
   * @param payload - Job payload.
   * @returns Success status.
   */
  private async processShipStationSyncPageJob(
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const { processSyncPageJob } = await import('@/lib/shipstation/syncOrchestrator');
    const storeId = payloadString(payload, 'store_id');
    const operation = payloadString(payload, 'operation');
    const runId = payloadString(payload, 'run_id');
    const page = payloadNumber(payload, 'page');

    if (!storeId || !operation || !runId || page === undefined) {
      throw new Error('Missing required fields: store_id, operation, run_id, page');
    }

    return processSyncPageJob({
      store_id: storeId,
      operation: operation as Parameters<typeof processSyncPageJob>[0]['operation'],
      run_id: runId,
      page
    });
  }

  /**
   * Push one paid order to ShipStation.
   *
   * @param payload - Job payload.
   * @returns Success status.
   */
  private async processShipStationOrderPushJob(
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const { processOrderPushJob } = await import('@/lib/shipstation/orderPush');
    const orderId = payloadString(payload, 'order_id');
    const storeId = payloadString(payload, 'store_id');

    if (!orderId || !storeId) {
      throw new Error('Missing required fields: order_id, store_id');
    }

    return processOrderPushJob({ order_id: orderId, store_id: storeId });
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

      // The store is recorded at enqueue time from the authenticated webhook URL. A job that
      // predates that, or one whose payload was tampered with, has no tenant and must not run.
      const storeId = payloadString(payload, 'store_id') ?? payloadString(webhookPayload, 'store_id');
      if (!storeId) {
        throw new Error('Missing required field: store_id');
      }

      const parsedPayload = parseShipStationWebhookPayload(webhookPayload);
      if (!parsedPayload) {
        throw new Error('Invalid ShipStation webhook payload in job');
      }

      return await orderStatusService.processShipmentNotification(parsedPayload, storeId);

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
      const storeId = payloadString(payload, 'store_id');

      if (!webhookType || !webhookData) {
        throw new Error('Missing required fields: webhook_type, webhook_data');
      }

      if (!storeId) {
        throw new Error('Missing required field: store_id');
      }

      // Process different webhook types
      switch (webhookType) {
        case 'shipstation_webhook': {
          const parsedWebhook = parseShipStationWebhookPayload(webhookData);
          if (!parsedWebhook) {
            throw new Error('Invalid ShipStation webhook payload in job');
          }
          return await orderStatusService.processShipmentNotification(parsedWebhook, storeId);
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