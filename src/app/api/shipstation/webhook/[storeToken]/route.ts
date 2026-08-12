/**
 * Per-store ShipStation webhook receiver.
 *
 * Replaces the unauthenticated, untenanted `/api/shipstation/webhook`. See
 * `src/lib/shipstation/webhookSecurity.ts` for the three checks and why they are the ones
 * ShipStation's contract can actually satisfy.
 *
 * Two properties this route guarantees, which the old one did not:
 *
 * - **No unauthenticated write.** A request without the store's shared-secret header is 401 before
 *   the body is parsed or any order is touched.
 * - **No cross-tenant write.** The store comes from the authenticated URL token, never from the
 *   payload, and is threaded into every downstream lookup. A webhook authenticated for store A that
 *   names an order belonging to store B finds nothing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jobQueueService } from '@/lib/services/jobQueueService';
import { orderStatusService } from '@/lib/services/orderStatusService';
import { parseShipStationWebhookPayload } from '@/lib/shipstation/webhookPayload';
import { authenticateWebhook } from '@/lib/shipstation/webhookSecurity';

/** Node runtime: this route uses `crypto` and Postgres. */
export const runtime = 'nodejs';

/** Never cached. */
export const dynamic = 'force-dynamic';

/** Refuse absurd bodies before doing any work. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Receive one ShipStation webhook.
 *
 * @param request - Incoming request.
 * @param context - Route params carrying the per-store token.
 * @returns 200 on accepted, 401 on failed authentication, 400 on a malformed payload,
 *   500 when processing failed in a way ShipStation should retry.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeToken: string }> }
): Promise<NextResponse> {
  const { storeToken } = await context.params;

  const rawBody = await request.text();

  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Payload too large' }, { status: 413 });
  }

  const auth = await authenticateWebhook(storeToken, request.headers, rawBody);

  if (!auth.ok) {
    // Deliberately uniform: never reveal whether the token matched a real store.
    return NextResponse.json({ success: false, error: auth.reason }, { status: auth.status });
  }

  const { storeId } = auth;

  let parsedJson: Record<string, unknown>;
  try {
    const candidate: unknown = JSON.parse(rawBody);
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error('not an object');
    }
    parsedJson = candidate as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      // 400, not 500: ShipStation retrying will not fix our inability to parse this.
      { status: 400 }
    );
  }

  const payload = parseShipStationWebhookPayload(parsedJson);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: 'Missing required webhook fields' },
      { status: 400 }
    );
  }

  try {
    switch (payload.resource_type) {
      case 'ITEM_SHIP_NOTIFY':
      case 'ITEM_DELIVERED_NOTIFY':
      case 'ITEM_ORDER_NOTIFY': {
        const processed = await orderStatusService.processShipmentNotification(payload, storeId);

        if (!processed) {
          // Hand it to the queue rather than losing it. The queue retries with backoff, and the
          // dedupe key stops a ShipStation redelivery from stacking duplicates alongside it.
          await jobQueueService.addJob(
            'shipment_processing',
            {
              webhook_payload: { ...payload, store_id: storeId },
              webhook_type: 'shipstation_webhook',
              resource_type: payload.resource_type,
              store_id: storeId
            },
            'high',
            undefined,
            {
              storeId,
              dedupeKey: `webhook:${storeId}:${payload.resource_type}:${
                payload.resource_id ?? payload.order_id ?? 'unknown'
              }`
            }
          );
        }

        return NextResponse.json({
          success: true,
          processed,
          queued_for_retry: !processed,
          resource_type: payload.resource_type
        });
      }

      default:
        // Unknown event types are acknowledged, not retried forever.
        console.warn(`Unhandled ShipStation webhook resource type: ${payload.resource_type}`);
        return NextResponse.json({ success: true, ignored: true });
    }
  } catch (error) {
    console.error('Error processing ShipStation webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Webhook processing failed, will retry' },
      { status: 500 }
    );
  }
}

/**
 * Health probe for the per-store webhook endpoint.
 *
 * Answers only whether the route is alive. It does not confirm whether the token is valid, because
 * that would turn this into a token oracle.
 *
 * @returns Endpoint status.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'active',
    endpoint: 'shipstation_webhook',
    authentication: 'per-store URL token plus shared-secret header',
    supported_events: ['ITEM_SHIP_NOTIFY', 'ITEM_DELIVERED_NOTIFY', 'ITEM_ORDER_NOTIFY']
  });
}
