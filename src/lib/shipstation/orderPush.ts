/**
 * Pushing a paid order to ShipStation, off the checkout critical path.
 *
 * Before: `POST /api/orders` tested credentials live, built a shipment, POSTed it, and only then
 * wrote the local order — so a slow response or a momentary 5xx from ShipStation returned
 * `SHIPMENT_CREATION_FAILED` and **lost the sale** (audit "order-push gap", P2). The customer had
 * paid; the merchant got nothing.
 *
 * After: the local order is written first and authoritatively, then a `job_queue` job pushes it to
 * ShipStation with the queue's retry and backoff. `orders.fulfillment_sync_status` carries
 * `pending → queued → pushed | failed`, so a push that never succeeds is a visible, retriable row
 * in the merchant's order list rather than a customer-facing checkout error.
 *
 * Note on semantics, carried over from the audit: `create_sales_order: true` means this call
 * creates a *shipment* that also creates the underlying sales order. There is no separate
 * order-creation resource in the V2 contract, so "push an order for the merchant to process later"
 * is not something the API offers. That limitation is documented in `docs/shipstation.md`; nothing
 * here buys a label.
 */

import { db } from '@/lib/database/connection';
import { jobQueueService } from '@/lib/services/jobQueueService';
import { shipStationFetch, type ShipStationFetchOptions } from './client';
import { getIntegration } from './credentials';

/** Fulfilment push states stored on `orders.fulfillment_sync_status`. */
export type FulfillmentSyncStatus = 'pending' | 'queued' | 'pushed' | 'failed' | 'not_applicable';

/** Payload of a `shipstation_order_push` job. */
export interface OrderPushJobPayload extends Record<string, unknown> {
  order_id: string;
  store_id: string;
}

/** Injected network primitives, so every branch is testable without hitting the network. */
export type OrderPushNetworkOptions = Pick<
  ShipStationFetchOptions,
  'fetchImpl' | 'sleepImpl' | 'randomImpl' | 'maxAttempts' | 'baseDelayMs' | 'timeoutMs'
>;

/** The order fields needed to build a shipment. */
type OrderRowForPush = {
  id: string;
  store_id: string;
  order_number: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_first_name: string;
  shipping_last_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string | null;
  shipping_amount: string | null;
  total_amount: string;
  fulfillment_sync_status: string;
  shipstation_shipment_id: string | null;
};

/** A line item on the order. */
type OrderItemRowForPush = {
  product_sku: string | null;
  product_name: string;
  quantity: number;
  unit_price: string;
  product_id: string | null;
};

/** A ship-from address in V2 shape. */
interface ShipFrom {
  name: string;
  phone: string;
  email?: string;
  company_name?: string;
  address_line1: string;
  address_line2?: string;
  city_locality: string;
  state_province: string;
  postal_code: string;
  country_code: string;
  address_residential_indicator: 'yes' | 'no' | 'unknown';
}

/** Result of one push attempt. */
export interface OrderPushResult {
  ok: boolean;
  /** ShipStation's shipment id, when the push succeeded. */
  shipmentId?: string;
  error?: string;
  /** True when another attempt could plausibly succeed. */
  retryable?: boolean;
}

/**
 * Record the fulfilment push state on an order.
 *
 * @param orderId - Order UUID.
 * @param status - New state.
 * @param options - Shipment id on success, error text on failure.
 * @returns Nothing.
 */
export async function setFulfillmentSyncStatus(
  orderId: string,
  status: FulfillmentSyncStatus,
  options: { shipmentId?: string | null; error?: string | null; incrementAttempts?: boolean } = {}
): Promise<void> {
  await db.query(
    `UPDATE orders
        SET fulfillment_sync_status = $2,
            fulfillment_sync_error = $3,
            shipstation_shipment_id = COALESCE($4, shipstation_shipment_id),
            shipstation_order_id = COALESCE($4, shipstation_order_id),
            fulfillment_pushed_at = CASE WHEN $2 = 'pushed' THEN NOW() ELSE fulfillment_pushed_at END,
            fulfillment_sync_attempts = fulfillment_sync_attempts + CASE WHEN $5 THEN 1 ELSE 0 END,
            updated_at = NOW()
      WHERE id = $1`,
    [
      orderId,
      status,
      options.error ?? null,
      options.shipmentId ?? null,
      options.incrementAttempts ?? false
    ]
  );
}

/**
 * Queue a paid order for delivery to ShipStation.
 *
 * **This is the function the Stripe webhook should call.** It is safe to call unconditionally: a
 * store with no active ShipStation integration marks the order `not_applicable` and enqueues
 * nothing, and a duplicate webhook delivery is absorbed by the job dedupe key. It never throws for
 * integration reasons, because losing a paid order to a fulfilment problem is exactly the failure
 * mode this whole change exists to remove.
 *
 * @param input - The order to push.
 * @returns Whether a job was enqueued, and why not when it was not.
 */
export async function enqueueOrderPush(input: {
  orderId: string;
  storeId: string;
}): Promise<{ enqueued: boolean; reason?: string }> {
  const { orderId, storeId } = input;

  try {
    const integration = await getIntegration(storeId, { activeOnly: true });

    if (!integration?.apiKey) {
      await setFulfillmentSyncStatus(orderId, 'not_applicable', {
        error: 'No active ShipStation integration for this store'
      });
      return { enqueued: false, reason: 'no_integration' };
    }

    const jobId = await jobQueueService.addJob(
      'shipstation_order_push',
      { order_id: orderId, store_id: storeId } satisfies OrderPushJobPayload,
      'high',
      undefined,
      { storeId, dedupeKey: `order_push:${orderId}` }
    );

    await setFulfillmentSyncStatus(orderId, 'queued', { error: null });

    return { enqueued: jobId !== null, reason: jobId === null ? 'already_queued' : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to enqueue ShipStation push for order ${orderId}:`, message);

    // Leave the order visible as needing attention rather than swallowing the problem.
    await setFulfillmentSyncStatus(orderId, 'failed', { error: message }).catch(() => undefined);
    return { enqueued: false, reason: 'enqueue_failed' };
  }
}

/**
 * Resolve the ship-from address for a store.
 *
 * Prefers the integration's configured address, then the default `shipfroms` row, then any
 * `shipfroms` row. Returns null when the merchant has configured none — which is a real
 * configuration error and is reported as such, rather than being papered over with the
 * `123 Warehouse St, Anytown CA` placeholder the old code shipped to ShipStation.
 *
 * @param storeId - Store UUID.
 * @param configured - Ship-from stored on the integration configuration, if any.
 * @returns The address, or null.
 */
export async function resolveShipFrom(
  storeId: string,
  configured?: unknown
): Promise<ShipFrom | null> {
  if (isShipFrom(configured)) {
    return configured;
  }

  const result = await db.query<{
    name: string | null;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    origin_address_line1: string | null;
    origin_address_line2: string | null;
    origin_city_locality: string | null;
    origin_state_province: string | null;
    origin_postal_code: string | null;
    origin_country_code: string | null;
    origin_residential_indicator: string | null;
  }>(
    `SELECT name, phone, email, company_name,
            origin_address_line1, origin_address_line2, origin_city_locality,
            origin_state_province, origin_postal_code, origin_country_code,
            origin_residential_indicator
       FROM shipfroms
      WHERE store_id = $1
      ORDER BY is_default DESC NULLS LAST, created_at ASC
      LIMIT 1`,
    [storeId]
  );

  const row = result.rows[0];
  if (!row?.origin_address_line1 || !row.origin_postal_code) {
    return null;
  }

  const indicator = row.origin_residential_indicator;

  return {
    name: row.name ?? 'Warehouse',
    phone: row.phone ?? '',
    email: row.email ?? undefined,
    company_name: row.company_name ?? undefined,
    address_line1: row.origin_address_line1,
    address_line2: row.origin_address_line2 ?? undefined,
    city_locality: row.origin_city_locality ?? '',
    state_province: row.origin_state_province ?? '',
    postal_code: row.origin_postal_code,
    country_code: row.origin_country_code ?? 'US',
    address_residential_indicator:
      indicator === 'yes' || indicator === 'no' ? indicator : 'unknown'
  };
}

/**
 * Type guard for a configured ship-from address.
 *
 * @param value - Untyped value from the integration configuration.
 * @returns True when it has the required fields.
 */
function isShipFrom(value: unknown): value is ShipFrom {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.address_line1 === 'string' &&
    typeof candidate.postal_code === 'string' &&
    typeof candidate.country_code === 'string'
  );
}

/**
 * Push one order to ShipStation.
 *
 * Exported separately from the job handler so it can be exercised directly in tests with an
 * injected fetch, covering every branch (success, 4xx, 429-then-success, body-level errors)
 * without mocking out the logic under test.
 *
 * @param orderId - Order UUID.
 * @param storeId - Store UUID; every query is scoped to it.
 * @param network - Injected network primitives.
 * @returns The outcome of the attempt.
 */
export async function pushOrderToShipStation(
  orderId: string,
  storeId: string,
  network: OrderPushNetworkOptions = {}
): Promise<OrderPushResult> {
  const orderResult = await db.query<OrderRowForPush>(
    `SELECT id, store_id, order_number, customer_email, customer_phone,
            shipping_first_name, shipping_last_name, shipping_address_line1,
            shipping_address_line2, shipping_city, shipping_state, shipping_postal_code,
            shipping_country, shipping_amount, total_amount,
            fulfillment_sync_status, shipstation_shipment_id
       FROM orders
      WHERE id = $1 AND store_id = $2`,
    [orderId, storeId]
  );

  const order = orderResult.rows[0];
  if (!order) {
    return { ok: false, error: 'Order not found for this store', retryable: false };
  }

  if (order.shipstation_shipment_id) {
    // Already pushed by an earlier delivery of the same job. Idempotent by construction.
    return { ok: true, shipmentId: order.shipstation_shipment_id };
  }

  const integration = await getIntegration(storeId, { activeOnly: true });
  if (!integration?.apiKey) {
    return { ok: false, error: 'No active ShipStation integration', retryable: false };
  }

  const shipFrom = await resolveShipFrom(storeId, integration.configuration.shipFromAddress);
  if (!shipFrom) {
    return {
      ok: false,
      error:
        'No ship-from address configured. Add a warehouse in ShipStation and run a warehouse sync, ' +
        'or set a ship-from address on the integration.',
      retryable: false
    };
  }

  const itemsResult = await db.query<OrderItemRowForPush>(
    `SELECT product_sku, product_name, quantity, unit_price, product_id
       FROM order_items
      WHERE order_id = $1 AND store_id = $2
      ORDER BY created_at ASC`,
    [orderId, storeId]
  );

  const payload = {
    shipments: [
      {
        external_shipment_id: order.order_number,
        ship_to: {
          name: `${order.shipping_first_name} ${order.shipping_last_name}`.trim(),
          phone: order.customer_phone ?? '',
          email: order.customer_email,
          address_line1: order.shipping_address_line1,
          ...(order.shipping_address_line2
            ? { address_line2: order.shipping_address_line2 }
            : {}),
          city_locality: order.shipping_city,
          state_province: order.shipping_state,
          postal_code: order.shipping_postal_code,
          country_code: order.shipping_country ?? 'US',
          address_residential_indicator: 'unknown' as const
        },
        ship_from: shipFrom,
        items: itemsResult.rows.map((item) => ({
          name: item.product_name,
          sku: item.product_sku ?? item.product_id ?? undefined,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          external_order_item_id: `${order.order_number}-${item.product_sku ?? item.product_id ?? 'item'}`
        })),
        // V2 money fields are decimal dollars, which is how this database stores them. No /100
        // conversion here — that bug is specific to the legacy XML feed (P1-6).
        amount_paid: { currency: 'USD', amount: Number(order.total_amount) },
        shipping_paid: { currency: 'USD', amount: Number(order.shipping_amount ?? 0) },
        create_sales_order: true
      }
    ]
  };

  const response = await shipStationFetch<{
    has_errors?: boolean;
    shipments?: Array<{ shipment_id?: string; errors?: string[] }>;
  }>('/v2/shipments', {
    apiKey: integration.apiKey,
    method: 'POST',
    body: payload,
    operation: `create shipment ${order.order_number}`,
    ...network
  });

  if (!response.ok) {
    return { ok: false, error: response.error, retryable: response.retryable };
  }

  const shipment = response.data.shipments?.[0];
  const bodyErrors = shipment?.errors ?? [];

  if (response.data.has_errors || bodyErrors.length > 0) {
    return {
      ok: false,
      error: `ShipStation rejected the shipment: ${bodyErrors.join(', ') || 'unspecified error'}`,
      // A body-level rejection is about the payload, not the weather. Retrying will not help.
      retryable: false
    };
  }

  if (!shipment?.shipment_id) {
    return {
      ok: false,
      error: 'ShipStation accepted the request but returned no shipment id',
      retryable: false
    };
  }

  return { ok: true, shipmentId: shipment.shipment_id };
}

/**
 * Execute a `shipstation_order_push` job.
 *
 * @param payload - Job payload.
 * @param network - Injected network primitives, for tests.
 * @returns True when the order is pushed (or permanently un-pushable and marked as such); false to
 *   hand the job back to the queue for retry.
 */
export async function processOrderPushJob(
  payload: OrderPushJobPayload,
  network: OrderPushNetworkOptions = {}
): Promise<boolean> {
  const { order_id: orderId, store_id: storeId } = payload;

  if (!orderId || !storeId) {
    console.error('shipstation_order_push job missing order_id/store_id');
    return false;
  }

  const result = await pushOrderToShipStation(orderId, storeId, network);

  if (result.ok) {
    await setFulfillmentSyncStatus(orderId, 'pushed', {
      shipmentId: result.shipmentId ?? null,
      error: null,
      incrementAttempts: true
    });
    return true;
  }

  await setFulfillmentSyncStatus(orderId, 'failed', {
    error: result.error ?? 'Unknown push failure',
    incrementAttempts: true
  });

  // A permanent failure is already recorded on the order and visible to the merchant; telling the
  // queue it succeeded stops it burning retries on something that cannot improve.
  return result.retryable === false;
}
