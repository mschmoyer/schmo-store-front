/**
 * ShipStation Custom Store API - Orders Endpoint
 * Handles order export (GET) and shipment notifications (POST)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { authenticateShipStationMulti, logAuthAttempt } from '@/lib/shipstation/auth';
import { exportOrdersToXML } from '@/lib/shipstation/xmlBuilder';
import { parseShipmentNotification, validateShipmentNotification } from '@/lib/shipstation/xmlParser';
import { 
  formatShipStationError, 
  parseShipStationDate, 
  createPaginationParams,
  validateOrderForExport,
  mapShipStationStatusToInternal
} from '@/lib/shipstation/utils';
import { Order, OrderItem, OrderStatusUpdateData } from '@/lib/types/database';

interface OrderWithItems extends Order {
  items: OrderItem[];
}

/**
 * GET - Export orders to ShipStation
 * Parameters: action=export, start_date, end_date, page, page_size
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate request
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'GET');
    
    if (!authResult.success) {
      return new NextResponse(
        formatShipStationError(authResult.error || 'Authentication failed'),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { storeId } = authResult;
    if (!storeId) {
      return new NextResponse(
        formatShipStationError('Store not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action !== 'export') {
      return new NextResponse(
        formatShipStationError('Invalid action. Use action=export'),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');
    const pageStr = searchParams.get('page') || '1';
    const pageSizeStr = searchParams.get('page_size') || '50';
    
    // Validate and parse dates
    if (!startDateStr || !endDateStr) {
      return new NextResponse(
        formatShipStationError('start_date and end_date are required'),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    let startDate: Date;
    let endDate: Date;
    
    try {
      startDate = parseShipStationDate(startDateStr);
      endDate = parseShipStationDate(endDateStr);
    } catch {
      return new NextResponse(
        formatShipStationError('Invalid date format. Use MM/dd/yyyy HH:mm'),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Parse pagination
    const { page, pageSize } = createPaginationParams(
      parseInt(pageStr),
      parseInt(pageSizeStr)
    );
    
    const offset = (page - 1) * pageSize;
    
    // Get orders with items
    const ordersResult = await db.query(
      `SELECT 
        o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'order_id', oi.order_id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'quantity', oi.quantity,
            'price', oi.price,
            'total', oi.total,
            'created_at', oi.created_at
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.store_id = $1
        AND o.updated_at >= $2
        AND o.updated_at <= $3
        AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY o.id
      ORDER BY o.updated_at DESC
      LIMIT $4 OFFSET $5`,
      [storeId, startDate, endDate, pageSize, offset]
    );
    
    // Get total count for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) as total
      FROM orders o
      WHERE o.store_id = $1
        AND o.updated_at >= $2
        AND o.updated_at <= $3
        AND o.status NOT IN ('cancelled', 'refunded')`,
      [storeId, startDate, endDate]
    );
    
    const totalOrders = parseInt(String(countResult.rows[0].total));
    const totalPages = Math.ceil(totalOrders / pageSize);
    
    // Convert to orders with items
    const orders: OrderWithItems[] = ordersResult.rows.map((row: Record<string, unknown>) => ({
      ...(row as unknown as OrderWithItems),
      items: (row.items as unknown as OrderItem[]) || []
    }));
    
    // Validate orders for export
    const validOrders: OrderWithItems[] = [];
    const invalidOrders: string[] = [];
    
    for (const order of orders) {
      const validation = validateOrderForExport(order);
      if (validation.isValid) {
        validOrders.push(order);
      } else {
        invalidOrders.push(`Order ${order.order_number}: ${validation.errors.join(', ')}`);
      }
    }
    
    // Log invalid orders
    if (invalidOrders.length > 0) {
      console.warn('Invalid orders excluded from export:', invalidOrders);
    }
    
    // Generate XML
    const xml = exportOrdersToXML(validOrders, page, totalPages);
    
    // Log successful export
    await db.query(
      `INSERT INTO integration_logs (
        store_id,
        integration_type,
        operation,
        status,
        request_data,
        response_data,
        execution_time_ms,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        storeId,
        'shipstation',
        'order_export',
        'success',
        JSON.stringify({
          start_date: startDateStr,
          end_date: endDateStr,
          page,
          page_size: pageSize
        }),
        JSON.stringify({
          total_orders: totalOrders,
          valid_orders: validOrders.length,
          invalid_orders: invalidOrders.length,
          total_pages: totalPages
        }),
        Date.now() - startTime
      ]
    );
    
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('ShipStation order export error:', error);
    
    // Log error
    if (request.url) {
      const { searchParams } = new URL(request.url);
      const storeId = searchParams.get('store_id');
      
      await db.query(
        `INSERT INTO integration_logs (
          store_id,
          integration_type,
          operation,
          status,
          error_message,
          execution_time_ms,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          storeId,
          'shipstation',
          'order_export',
          'failure',
          error instanceof Error ? error.message : 'Unknown error',
          Date.now() - startTime
        ]
      );
    }
    
    return new NextResponse(
      formatShipStationError('Internal server error'),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * POST - Receive shipment notifications from ShipStation
 * Body: XML shipment notification data
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate request
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'POST');
    
    if (!authResult.success) {
      return new NextResponse(
        formatShipStationError(authResult.error || 'Authentication failed'),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { storeId } = authResult;
    if (!storeId) {
      return new NextResponse(
        formatShipStationError('Store not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Get request body
    const xmlData = await request.text();
    
    if (!xmlData) {
      return new NextResponse(
        formatShipStationError('No shipment data provided'),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Parse shipment notification
    let shipmentData;
    try {
      shipmentData = await parseShipmentNotification(xmlData);
    } catch (error) {
      return new NextResponse(
        formatShipStationError(
          `XML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
        ),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Validate shipment data
    const validation = validateShipmentNotification(shipmentData);
    if (!validation.isValid) {
      return new NextResponse(
        formatShipStationError(
          `Validation error: ${validation.errors.join(', ')}`
        ),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Find the order
    const orderResult = await db.query(
      `SELECT id, order_number, status, store_id
      FROM orders
      WHERE store_id = $1
        AND (id = $2 OR order_number = $3)`,
      [storeId, shipmentData.orderId, shipmentData.orderNumber]
    );
    
    if (orderResult.rows.length === 0) {
      return new NextResponse(
        formatShipStationError('Order not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const order = orderResult.rows[0];
    
    // Update order with shipment information
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
      notes: shipmentData.customerNotes || shipmentData.internalNotes,
      updated_by: 'shipstation'
    };
    
    // Update order in database
    await db.query(
      `UPDATE orders 
      SET 
        status = $1,
        tracking_number = $2,
        carrier = $3,
        carrier_code = $4,
        service_code = $5,
        shipped_at = $6,
        estimated_delivery_date = $7,
        actual_delivery_date = $8,
        shipment_cost = $9,
        label_url = $10,
        form_url = $11,
        notes = COALESCE($12, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13`,
      [
        updateData.status,
        updateData.tracking_number,
        updateData.carrier,
        updateData.carrier_code,
        updateData.service_code,
        updateData.shipped_at,
        updateData.estimated_delivery_date,
        updateData.actual_delivery_date,
        updateData.shipment_cost,
        updateData.label_url,
        updateData.form_url,
        updateData.notes,
        order.id
      ]
    );
    
    // Create shipment notification record
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
        updateData.tracking_number,
        updateData.carrier,
        shipmentData.labelUrl,
        `Shipment created with tracking number: ${updateData.tracking_number}`,
        updateData.shipped_at,
        false
      ]
    );
    
    // Log successful shipment notification
    await db.query(
      `INSERT INTO integration_logs (
        store_id,
        integration_type,
        operation,
        status,
        request_data,
        response_data,
        execution_time_ms,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        storeId,
        'shipstation',
        'shipment_notification',
        'success',
        JSON.stringify({
          order_id: order.id,
          order_number: order.order_number,
          tracking_number: updateData.tracking_number,
          carrier: updateData.carrier
        }),
        JSON.stringify({
          order_updated: true,
          notification_created: true
        }),
        Date.now() - startTime
      ]
    );
    
    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Shipment notification processed successfully',
        order_id: order.id,
        tracking_number: updateData.tracking_number
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
    
  } catch (error) {
    console.error('ShipStation shipment notification error:', error);
    
    // Log error
    try {
      const authResult = await authenticateShipStationMulti(request);
      if (authResult.success && authResult.storeId) {
        await db.query(
          `INSERT INTO integration_logs (
            store_id,
            integration_type,
            operation,
            status,
            error_message,
            execution_time_ms,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            authResult.storeId,
            'shipstation',
            'shipment_notification',
            'failure',
            error instanceof Error ? error.message : 'Unknown error',
            Date.now() - startTime
          ]
        );
      }
    } catch (logError) {
      console.error('Error logging shipment notification error:', logError);
    }
    
    return new NextResponse(
      formatShipStationError('Internal server error'),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * PUT - Update order status (optional endpoint for ShipStation)
 */
export async function PUT(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate request
    const authResult = await authenticateShipStationMulti(request);
    await logAuthAttempt(request, authResult, 'PUT');
    
    if (!authResult.success) {
      return new NextResponse(
        formatShipStationError(authResult.error || 'Authentication failed'),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { storeId } = authResult;
    if (!storeId) {
      return new NextResponse(
        formatShipStationError('Store not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { order_id, order_number, status, tracking_number, carrier } = body;
    
    if (!order_id && !order_number) {
      return new NextResponse(
        formatShipStationError('order_id or order_number is required'),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Find the order
    const orderResult = await db.query(
      `SELECT id, order_number, status, store_id
      FROM orders
      WHERE store_id = $1
        AND (id = $2 OR order_number = $3)`,
      [storeId, order_id, order_number]
    );
    
    if (orderResult.rows.length === 0) {
      return new NextResponse(
        formatShipStationError('Order not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const order = orderResult.rows[0];
    
    // Update order status
    const internalStatus = status ? mapShipStationStatusToInternal(status) : order.status;
    
    await db.query(
      `UPDATE orders 
      SET 
        status = $1,
        tracking_number = COALESCE($2, tracking_number),
        carrier = COALESCE($3, carrier),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4`,
      [internalStatus, tracking_number, carrier, order.id]
    );
    
    // Log successful update
    await db.query(
      `INSERT INTO integration_logs (
        store_id,
        integration_type,
        operation,
        status,
        request_data,
        response_data,
        execution_time_ms,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        storeId,
        'shipstation',
        'order_update',
        'success',
        JSON.stringify({
          order_id: order.id,
          order_number: order.order_number,
          status: internalStatus,
          tracking_number,
          carrier
        }),
        JSON.stringify({
          order_updated: true
        }),
        Date.now() - startTime
      ]
    );
    
    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Order updated successfully',
        order_id: order.id,
        status: internalStatus
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
  } catch (error) {
    console.error('ShipStation order update error:', error);
    
    return new NextResponse(
      formatShipStationError('Internal server error'),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}