/**
 * ShipStation Custom Store endpoint.
 *
 * One URL serving the two operations the Custom Store contract defines, keyed
 * off the `action` query parameter:
 *
 *   GET  ?action=export&start_date=&end_date=&page=  → order XML for the window
 *   POST ?action=shipnotify                          → a <ShipNotice> to record
 *
 * The wire format is specified in `docs/shipstation-custom-store.md`. Points
 * that bit before and are now load-bearing:
 *
 * - **The window is on `updated_at`, and carries every status.** The spec says
 *   to return any order modified between the dates *regardless of status*. This
 *   query used to exclude `cancelled` and `refunded`, which meant an order
 *   cancelled after import never reappeared and ShipStation was never told.
 *   Status mapping is what the merchant configures in the connection form.
 * - **Errors are XML.** ShipStation parses the response as XML, so a JSON error
 *   body reaches the merchant as an opaque parse failure rather than a reason.
 * - **Paging must be deterministic.** `ORDER BY updated_at DESC` alone is not a
 *   total order; ties can shuffle between page requests and drop orders. The
 *   `id` tiebreaker makes the sequence stable across the pages ShipStation walks.
 *
 * Everything is store-scoped: the Basic-auth credential resolves to exactly one
 * `store_id` and every query below carries it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { authenticateShipStationMulti, logAuthAttempt } from '@/lib/shipstation/auth';
import {
  CustomStoreOrderRow,
  exportOrdersToXML,
  validateOrderForExport
} from '@/lib/shipstation/xmlBuilder';
import { parseShipmentNotification, validateShipmentNotification } from '@/lib/shipstation/xmlParser';
import {
  createPaginationParams,
  formatShipStationError,
  formatShipStationXmlError,
  mapShipStationStatusToInternal,
  parseShipStationDate
} from '@/lib/shipstation/utils';
import { OrderStatusUpdateData } from '@/lib/types/database';

/** Orders returned per page when ShipStation does not ask for a size. */
const DEFAULT_PAGE_SIZE = 50;

/** Largest ShipNotice body accepted, matching the webhook receiver's cap. */
const MAX_BODY_BYTES = 512 * 1024;

/** Matches a canonical UUID, so a non-UUID OrderID never reaches a `uuid` column. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Headers on every XML reply; ShipStation must never serve a cached window. */
const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0'
} as const;

/**
 * Render a UTC instant as the naive timestamp literal Postgres expects.
 *
 * `orders.updated_at` is `TIMESTAMP` (no time zone) holding UTC wall-clock
 * values. Binding a JS Date makes Postgres cast it through the *session* time
 * zone, so the window silently shifts wherever that session is not UTC. Passing
 * the literal keeps the comparison in the same wall-clock space as the column,
 * and `to_char` on the way out keeps the rendered dates there too — neither the
 * Node host's zone nor the database session's zone can move them.
 *
 * @param date - Instant to render
 * @returns `YYYY-MM-DD HH:MM:SS` in UTC
 */
function toNaiveTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Build an XML error reply.
 *
 * @param message - Reason to surface to the merchant in ShipStation
 * @param status - HTTP status code
 * @returns Response carrying an `<Error>` document
 */
function xmlError(message: string, status: number): NextResponse {
  // A 401 without a challenge is not a well-formed Basic-auth rejection, and
  // ShipStation's "Test Connection" reports it less clearly.
  const headers =
    status === 401
      ? { ...XML_HEADERS, 'WWW-Authenticate': 'Basic realm="ShipStation Custom Store"' }
      : XML_HEADERS;

  return new NextResponse(formatShipStationXmlError(message), { status, headers });
}

/**
 * Record one call against the integration log, never throwing into the request.
 *
 * @param storeId - Store the call authenticated as, if any
 * @param operation - Log operation name
 * @param status - `success` or `failure`
 * @param requestData - Request metadata (never payload bodies)
 * @param responseData - Response metadata (never payload bodies)
 * @param elapsedMs - Wall time for the call
 * @param errorMessage - Failure reason, when failing
 */
async function logIntegrationCall(
  storeId: string | null,
  operation: string,
  status: 'success' | 'failure',
  requestData: Record<string, unknown>,
  responseData: Record<string, unknown>,
  elapsedMs: number,
  errorMessage?: string
): Promise<void> {
  if (!storeId) {
    return;
  }

  try {
    await db.query(
      `INSERT INTO integration_logs (
        store_id,
        integration_type,
        operation,
        status,
        request_data,
        response_data,
        error_message,
        execution_time_ms,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        storeId,
        'shipstation',
        operation,
        status,
        JSON.stringify(requestData),
        JSON.stringify(responseData),
        errorMessage ?? null,
        elapsedMs
      ]
    );
  } catch (logError) {
    console.error('Failed to write ShipStation integration log:', logError);
  }
}

/**
 * GET — export orders modified within the requested window.
 *
 * @param request - Incoming request carrying `action`, `start_date`, `end_date`, `page`
 * @returns Order XML for the page, or an `<Error>` document
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let authenticatedStoreId: string | null = null;

  try {
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'GET');

    if (!authResult.success) {
      return xmlError(authResult.error || 'Authentication failed', 401);
    }

    const { storeId } = authResult;
    if (!storeId) {
      return xmlError('Store not found', 404);
    }
    authenticatedStoreId = storeId;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action?.toLowerCase() !== 'export') {
      return xmlError('Invalid action. Use action=export', 400);
    }

    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');

    if (!startDateStr || !endDateStr) {
      return xmlError('start_date and end_date are required', 400);
    }

    let startDate: Date;
    let endDate: Date;

    try {
      startDate = parseShipStationDate(startDateStr);
      endDate = parseShipStationDate(endDateStr);
    } catch (error) {
      return xmlError(
        error instanceof Error ? error.message : 'Invalid date format. Use MM/dd/yyyy HH:mm',
        400
      );
    }

    if (startDate > endDate) {
      return xmlError('start_date must not be after end_date', 400);
    }

    const { page, pageSize } = createPaginationParams(
      parseInt(searchParams.get('page') || '1', 10),
      parseInt(searchParams.get('page_size') || String(DEFAULT_PAGE_SIZE), 10)
    );
    const offset = (page - 1) * pageSize;

    // Every order modified in the window, whatever its status — the spec is
    // explicit about this, and it is how a cancellation reaches ShipStation.
    const ordersResult = await db.query(
      `SELECT
        o.id,
        o.order_number,
        o.status,
        to_char(o.created_at, 'MM/DD/YYYY HH24:MI') AS order_date,
        to_char(o.updated_at, 'MM/DD/YYYY HH24:MI') AS last_modified,
        o.customer_email,
        o.customer_first_name,
        o.customer_last_name,
        o.customer_phone,
        o.shipping_first_name,
        o.shipping_last_name,
        o.shipping_address_line1,
        o.shipping_address_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country,
        o.billing_first_name,
        o.billing_last_name,
        o.billing_address_line1,
        o.billing_address_line2,
        o.billing_city,
        o.billing_state,
        o.billing_postal_code,
        o.billing_country,
        o.tax_amount,
        o.shipping_amount,
        o.discount_amount,
        o.total_amount,
        o.payment_method,
        o.shipping_method,
        o.notes,
        s.currency,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', oi.id,
                'product_sku', oi.product_sku,
                'product_name', oi.product_name,
                'product_image_url', oi.product_image_url,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'total_price', oi.total_price
              )
              ORDER BY oi.created_at, oi.id
            )
            FROM order_items oi
            WHERE oi.order_id = o.id
              AND oi.store_id = o.store_id
          ),
          '[]'::json
        ) AS items
      FROM orders o
      JOIN stores s ON s.id = o.store_id
      WHERE o.store_id = $1
        AND o.updated_at >= $2::timestamp
        AND o.updated_at <= $3::timestamp
      ORDER BY o.updated_at DESC, o.id
      LIMIT $4 OFFSET $5`,
      [storeId, toNaiveTimestamp(startDate), toNaiveTimestamp(endDate), pageSize, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) AS total
      FROM orders o
      WHERE o.store_id = $1
        AND o.updated_at >= $2::timestamp
        AND o.updated_at <= $3::timestamp`,
      [storeId, toNaiveTimestamp(startDate), toNaiveTimestamp(endDate)]
    );

    const totalOrders = parseInt(String(countResult.rows[0].total), 10);
    const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));

    const rows = ordersResult.rows as unknown as CustomStoreOrderRow[];
    const validOrders: CustomStoreOrderRow[] = [];
    const skipped: string[] = [];

    for (const order of rows) {
      const validation = validateOrderForExport(order);
      if (validation.isValid) {
        validOrders.push(order);
      } else {
        skipped.push(`${order.order_number}: ${validation.errors.join(', ')}`);
      }
    }

    // An order that cannot be rendered is an order ShipStation will never see.
    // Say so loudly rather than letting the page quietly come back short.
    if (skipped.length > 0) {
      console.warn(
        `ShipStation export skipped ${skipped.length} order(s) for store ${storeId}:`,
        skipped
      );
    }

    const xml = exportOrdersToXML(validOrders, totalPages);

    await logIntegrationCall(
      storeId,
      'order_export',
      'success',
      { start_date: startDateStr, end_date: endDateStr, page, page_size: pageSize },
      {
        total_orders: totalOrders,
        exported_orders: validOrders.length,
        skipped_orders: skipped.length,
        total_pages: totalPages
      },
      Date.now() - startTime
    );

    return new NextResponse(xml, { headers: XML_HEADERS });
  } catch (error) {
    console.error('ShipStation order export error:', error);

    await logIntegrationCall(
      authenticatedStoreId,
      'order_export',
      'failure',
      {},
      {},
      Date.now() - startTime,
      error instanceof Error ? error.message : 'Unknown error'
    );

    return xmlError('Internal server error', 500);
  }
}

/**
 * POST — record a shipment notification for an order.
 *
 * ShipStation treats any 2xx as "received"; a non-2xx makes it retry, so the
 * only failures reported here are ones a retry could plausibly resolve.
 *
 * @param request - Incoming request carrying a `<ShipNotice>` body
 * @returns A 2xx acknowledgement, or an `<Error>` document
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  let authenticatedStoreId: string | null = null;

  try {
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'POST');

    if (!authResult.success) {
      return xmlError(authResult.error || 'Authentication failed', 401);
    }

    const { storeId } = authResult;
    if (!storeId) {
      return xmlError('Store not found', 404);
    }
    authenticatedStoreId = storeId;

    // `action=shipnotify` is required, not merely honoured when present. An
    // unlabelled POST is ambiguous, and this handler marks orders shipped — so
    // it must not act on a request that never said it was a ship notice.
    const action = new URL(request.url).searchParams.get('action');
    if (action?.toLowerCase() !== 'shipnotify') {
      return xmlError('Invalid action. Use action=shipnotify', 400);
    }

    const xmlData = await request.text();

    if (!xmlData.trim()) {
      return xmlError('No shipment data provided', 400);
    }

    if (xmlData.length > MAX_BODY_BYTES) {
      return xmlError('Shipment notification body too large', 413);
    }

    let shipmentData;
    try {
      shipmentData = await parseShipmentNotification(xmlData);
    } catch (error) {
      return xmlError(
        `XML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        400
      );
    }

    const validation = validateShipmentNotification(shipmentData);
    if (!validation.isValid) {
      return xmlError(`Validation error: ${validation.errors.join(', ')}`, 400);
    }

    // `orders.id` is a uuid column: comparing it against a non-UUID OrderID
    // makes Postgres raise `invalid input syntax for type uuid` and turns a
    // routine lookup miss into a 500. Only match on id when it can be one.
    const orderId = shipmentData.orderId && UUID_PATTERN.test(shipmentData.orderId)
      ? shipmentData.orderId
      : null;

    const orderResult = await db.query(
      `SELECT id, order_number, status
      FROM orders
      WHERE store_id = $1
        AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR order_number = $3)
      LIMIT 1`,
      [storeId, orderId, shipmentData.orderNumber ?? null]
    );

    if (orderResult.rows.length === 0) {
      return xmlError('Order not found', 404);
    }

    const order = orderResult.rows[0];

    const updateData: OrderStatusUpdateData = {
      order_id: String(order.id),
      status: 'shipped',
      tracking_number: shipmentData.trackingNumber,
      carrier: shipmentData.carrierCode,
      carrier_code: shipmentData.carrierCode,
      service_code: shipmentData.serviceCode,
      shipped_at: shipmentData.shipDate || new Date(),
      estimated_delivery_date: shipmentData.estimatedDeliveryDate,
      actual_delivery_date: shipmentData.actualDeliveryDate,
      shipment_cost: shipmentData.shipmentCost,
      label_url: shipmentData.labelUrl,
      form_url: shipmentData.formUrl,
      updated_by: 'shipstation'
    };

    await db.query(
      `UPDATE orders
      SET
        status = $1,
        tracking_number = COALESCE($2, tracking_number),
        carrier = COALESCE($3, carrier),
        carrier_code = COALESCE($4, carrier_code),
        service_code = COALESCE($5, service_code),
        shipped_at = COALESCE($6, shipped_at),
        estimated_delivery_date = COALESCE($7, estimated_delivery_date),
        actual_delivery_date = COALESCE($8, actual_delivery_date),
        shipment_cost = COALESCE($9, shipment_cost),
        label_url = COALESCE($10, label_url),
        form_url = COALESCE($11, form_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
        AND store_id = $13`,
      [
        updateData.status,
        updateData.tracking_number ?? null,
        updateData.carrier ?? null,
        updateData.carrier_code ?? null,
        updateData.service_code ?? null,
        updateData.shipped_at ?? null,
        updateData.estimated_delivery_date ?? null,
        updateData.actual_delivery_date ?? null,
        updateData.shipment_cost ?? null,
        updateData.label_url ?? null,
        updateData.form_url ?? null,
        order.id,
        storeId
      ]
    );

    await db.query(
      `INSERT INTO shipment_notifications (
        order_id,
        notification_type,
        tracking_number,
        carrier,
        tracking_url,
        message,
        sent_at,
        email_sent,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        order.id,
        'shipped',
        updateData.tracking_number ?? null,
        updateData.carrier ?? null,
        updateData.label_url ?? null,
        updateData.tracking_number
          ? `Shipment created with tracking number: ${updateData.tracking_number}`
          : 'Shipment created',
        updateData.shipped_at ?? null,
        false
      ]
    );

    await logIntegrationCall(
      storeId,
      'shipment_notification',
      'success',
      {
        order_id: order.id,
        order_number: order.order_number,
        carrier: updateData.carrier
      },
      { order_updated: true, notification_created: true },
      Date.now() - startTime
    );

    return new NextResponse(
      `<?xml version="1.0" encoding="utf-8"?>\n<Success>Shipment notification recorded</Success>`,
      { status: 200, headers: XML_HEADERS }
    );
  } catch (error) {
    console.error('ShipStation shipment notification error:', error);

    await logIntegrationCall(
      authenticatedStoreId,
      'shipment_notification',
      'failure',
      {},
      {},
      Date.now() - startTime,
      error instanceof Error ? error.message : 'Unknown error'
    );

    return xmlError('Internal server error', 500);
  }
}

/**
 * PUT — update an order's status directly.
 *
 * Not part of the Custom Store contract; ShipStation never calls it. Retained
 * as an operator hatch, and so kept on the JSON shape its callers expect.
 *
 * @param request - Incoming request carrying `{ order_id | order_number, status, ... }`
 * @returns JSON result
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'PUT');

    if (!authResult.success) {
      return new NextResponse(formatShipStationError(authResult.error || 'Authentication failed'), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { storeId } = authResult;
    if (!storeId) {
      return new NextResponse(formatShipStationError('Store not found'), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { order_id, order_number, status, tracking_number, carrier } = body ?? {};

    if (!order_id && !order_number) {
      return new NextResponse(formatShipStationError('order_id or order_number is required'), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!status) {
      return new NextResponse(formatShipStationError('status is required'), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const lookupId = typeof order_id === 'string' && UUID_PATTERN.test(order_id) ? order_id : null;

    const orderResult = await db.query(
      `SELECT id, order_number
      FROM orders
      WHERE store_id = $1
        AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR order_number = $3)
      LIMIT 1`,
      [storeId, lookupId, order_number ?? null]
    );

    if (orderResult.rows.length === 0) {
      return new NextResponse(formatShipStationError('Order not found'), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const order = orderResult.rows[0];
    const internalStatus = mapShipStationStatusToInternal(String(status));

    await db.query(
      `UPDATE orders
      SET
        status = $1,
        tracking_number = COALESCE($2, tracking_number),
        carrier = COALESCE($3, carrier),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
        AND store_id = $5`,
      [internalStatus, tracking_number ?? null, carrier ?? null, order.id, storeId]
    );

    await logIntegrationCall(
      storeId,
      'order_update',
      'success',
      { order_id: order.id, order_number: order.order_number, status: internalStatus },
      { order_updated: true },
      Date.now() - startTime
    );

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Order updated successfully',
        order_id: order.id,
        status: internalStatus
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('ShipStation order update error:', error);

    return new NextResponse(formatShipStationError('Internal server error'), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
