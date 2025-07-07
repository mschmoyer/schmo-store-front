import { NextRequest, NextResponse } from 'next/server';
import { orderStatusService } from '@/lib/services/orderStatusService';
import { jobQueueService } from '@/lib/services/jobQueueService';
import { monitoringService } from '@/lib/services/monitoringService';
import { ShipStationWebhookPayload } from '@/lib/types/database';

/**
 * ShipStation Webhook Handler
 * 
 * Handles incoming webhooks from ShipStation for:
 * - Order notifications
 * - Shipment notifications  
 * - Delivery notifications
 * - Exception notifications
 * 
 * Processes webhooks asynchronously through job queue for reliability
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let webhookPayload: ShipStationWebhookPayload | null = null;

  try {
    // Verify webhook source (optional - implement based on ShipStation webhook security)
    const userAgent = request.headers.get('user-agent');
    const shipStationSignature = request.headers.get('x-shipstation-signature');
    
    // Log webhook received
    console.log('ShipStation webhook received:', {
      userAgent,
      hasSignature: !!shipStationSignature,
      contentType: request.headers.get('content-type')
    });

    // Parse webhook payload
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      webhookPayload = await request.json();
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const payloadString = formData.get('payload') as string;
      if (payloadString) {
        webhookPayload = JSON.parse(payloadString);
      }
    } else {
      // Try to parse as JSON by default
      webhookPayload = await request.json();
    }

    if (!webhookPayload) {
      throw new Error('Invalid webhook payload');
    }

    // Validate required fields
    if (!webhookPayload.resource_type || !webhookPayload.resource_url) {
      throw new Error('Missing required webhook fields: resource_type, resource_url');
    }

    console.log('Processing ShipStation webhook:', {
      resource_type: webhookPayload.resource_type,
      resource_id: webhookPayload.resource_id,
      order_id: webhookPayload.order_id,
      shipment_id: webhookPayload.shipment_id
    });

    // Log webhook processing start
    await monitoringService.logIntegrationEvent(
      'webhook_processing',
      'success',
      {
        request: {
          body: JSON.stringify({
            resource_type: webhookPayload.resource_type,
            resource_id: webhookPayload.resource_id,
            user_agent: userAgent
          })
        }
      },
      'system',
      'shipstation'
    );

    // Process webhook based on resource type
    let processedSuccessfully = false;

    switch (webhookPayload.resource_type) {
      case 'ITEM_SHIP_NOTIFY':
        // Handle shipment notification
        processedSuccessfully = await handleShipmentWebhook(webhookPayload);
        break;

      case 'ITEM_DELIVERED_NOTIFY':
        // Handle delivery notification
        processedSuccessfully = await handleDeliveryWebhook(webhookPayload);
        break;

      case 'ITEM_ORDER_NOTIFY':
        // Handle order notification
        processedSuccessfully = await handleOrderWebhook(webhookPayload);
        break;

      default:
        console.warn(`Unhandled webhook resource type: ${webhookPayload.resource_type}`);
        processedSuccessfully = true; // Don't fail for unknown types
    }

    if (processedSuccessfully) {
      // Log successful webhook processing
      await monitoringService.logIntegrationEvent(
        'webhook_processing',
        'success',
        {
          request: { body: JSON.stringify(webhookPayload) },
          response: { body: JSON.stringify({ processed: true }) }
        },
        'system',
        'shipstation',
        Date.now() - startTime
      );

      return NextResponse.json(
        { 
          success: true, 
          message: 'Webhook processed successfully',
          resource_type: webhookPayload.resource_type,
          processed_at: new Date().toISOString()
        }, 
        { status: 200 }
      );
    } else {
      throw new Error('Webhook processing failed');
    }

  } catch (error) {
    console.error('Error processing ShipStation webhook:', error);

    // Log webhook processing error
    await monitoringService.logIntegrationEvent(
      'webhook_processing',
      'failure',
      {
        request: { body: JSON.stringify(webhookPayload || {}) },
        response: undefined
      },
      'system',
      'shipstation',
      Date.now() - startTime,
      error instanceof Error ? error.message : 'Unknown error'
    );

    // Still return 200 to prevent webhook retries for client errors
    if (error instanceof SyntaxError || (error instanceof Error && error.message.includes('Missing required'))) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid webhook payload',
          message: error.message
        }, 
        { status: 200 } // Return 200 to prevent retries
      );
    }

    // Return 500 for server errors to trigger webhook retries
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: 'Webhook processing failed, will retry'
      }, 
      { status: 500 }
    );
  }
}

/**
 * Handle shipment webhook
 * @param payload - Webhook payload
 * @returns Promise<boolean>
 */
async function handleShipmentWebhook(payload: ShipStationWebhookPayload): Promise<boolean> {
  try {
    // Add shipment processing job to queue for asynchronous processing
    await jobQueueService.addJob(
      'shipment_processing',
      {
        webhook_payload: payload,
        webhook_type: 'shipstation_webhook',
        resource_type: payload.resource_type
      },
      'high' // High priority for shipment notifications
    );

    // Also trigger immediate processing for critical updates
    const immediateResult = await orderStatusService.processShipmentNotification(payload);
    
    console.log(`Shipment webhook processed: ${payload.resource_id}`, {
      immediate_result: immediateResult,
      job_queued: true
    });

    return immediateResult;

  } catch (error) {
    console.error('Error handling shipment webhook:', error);
    
    // Still queue the job even if immediate processing fails
    try {
      await jobQueueService.addJob(
        'shipment_processing',
        {
          webhook_payload: payload,
          webhook_type: 'shipstation_webhook',
          resource_type: payload.resource_type,
          retry_reason: 'immediate_processing_failed'
        },
        'urgent' // Urgent priority for failed immediate processing
      );
    } catch (queueError) {
      console.error('Error queuing shipment webhook job:', queueError);
    }

    return false;
  }
}

/**
 * Handle delivery webhook
 * @param payload - Webhook payload
 * @returns Promise<boolean>
 */
async function handleDeliveryWebhook(payload: ShipStationWebhookPayload): Promise<boolean> {
  try {
    // Process delivery notification
    const result = await orderStatusService.processShipmentNotification(payload);
    
    // Also queue notification job
    if (payload.order_id) {
      await jobQueueService.addJob(
        'order_notification',
        {
          order_id: payload.order_id,
          notification_type: 'delivered',
          delivered_date: payload.delivered_date,
          tracking_number: payload.tracking_number,
          carrier: payload.carrier_code
        },
        'medium'
      );
    }

    console.log(`Delivery webhook processed: ${payload.resource_id}`, {
      result,
      notification_queued: !!payload.order_id
    });

    return result;

  } catch (error) {
    console.error('Error handling delivery webhook:', error);
    return false;
  }
}

/**
 * Handle order webhook
 * @param payload - Webhook payload
 * @returns Promise<boolean>
 */
async function handleOrderWebhook(payload: ShipStationWebhookPayload): Promise<boolean> {
  try {
    // Process order notification
    const result = await orderStatusService.processShipmentNotification(payload);
    
    console.log(`Order webhook processed: ${payload.resource_id}`, {
      result
    });

    return result;

  } catch (error) {
    console.error('Error handling order webhook:', error);
    return false;
  }
}

/**
 * GET handler for webhook verification/testing
 */
export async function GET(request: NextRequest) {
  try {
    // This endpoint can be used for webhook verification or health checks
    const challenge = request.nextUrl.searchParams.get('challenge');
    
    if (challenge) {
      // Webhook verification challenge
      return NextResponse.json({ challenge }, { status: 200 });
    }

    // Health check response
    return NextResponse.json({
      status: 'active',
      endpoint: 'shipstation_webhook',
      timestamp: new Date().toISOString(),
      supported_events: [
        'ITEM_SHIP_NOTIFY',
        'ITEM_DELIVERED_NOTIFY', 
        'ITEM_ORDER_NOTIFY'
      ]
    }, { status: 200 });

  } catch (error) {
    console.error('Error in webhook GET handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-shipstation-signature',
    },
  });
}