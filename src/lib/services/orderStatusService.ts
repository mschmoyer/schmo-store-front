import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  Order,
  OrderStatusUpdateData,
  ShipmentData,
  ShipStationWebhookPayload,
  ShipmentNotification,
  IntegrationLog,
  InventoryAdjustment
} from '@/lib/types/database';

/**
 * Order Status Service - Handle ShipStation order processing and integration
 * 
 * This service manages:
 * - Processing shipment notifications from ShipStation
 * - Updating order status and tracking information
 * - Storing shipment data and tracking info
 * - Integration with existing order management system
 * 
 * @example
 * ```typescript
 * const orderService = new OrderStatusService();
 * await orderService.processShipmentNotification(webhookPayload);
 * ```
 */
export class OrderStatusService {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 1000;

  /**
   * Process incoming shipment notification from ShipStation
   * @param payload - ShipStation webhook payload
   * @returns Promise<boolean> - Success status
   */
  async processShipmentNotification(payload: ShipStationWebhookPayload): Promise<boolean> {
    const startTime = Date.now();
    let integrationLog: IntegrationLog | null = null;

    try {
      // Log the incoming webhook
      integrationLog = await this.logIntegration(
        payload.order_id || 'unknown',
        'shipstation',
        'webhook_processing',
        'success',
        { webhook_payload: payload }
      );

      // Process based on resource type
      switch (payload.resource_type) {
        case 'ITEM_SHIP_NOTIFY':
          await this.handleShipmentNotification(payload);
          break;
        case 'ITEM_DELIVERED_NOTIFY':
          await this.handleDeliveryNotification(payload);
          break;
        case 'ITEM_ORDER_NOTIFY':
          await this.handleOrderNotification(payload);
          break;
        default:
          console.warn(`Unhandled resource type: ${payload.resource_type}`);
      }

      // Update integration log with success
      if (integrationLog) {
        await this.updateIntegrationLog(
          integrationLog.id,
          'success',
          { processed_successfully: true },
          Date.now() - startTime
        );
      }

      return true;
    } catch (error) {
      console.error('Error processing shipment notification:', error);
      
      // Update integration log with error
      if (integrationLog) {
        await this.updateIntegrationLog(
          integrationLog.id,
          'failure',
          null,
          Date.now() - startTime,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      return false;
    }
  }

  /**
   * Handle shipped notification
   * @param payload - ShipStation webhook payload
   */
  private async handleShipmentNotification(payload: ShipStationWebhookPayload): Promise<void> {
    if (!payload.order_id) {
      throw new Error('Order ID is required for shipment notification');
    }

    // Find the order by ShipStation order ID or order number
    const order = await this.findOrderByShipStationId(payload.order_id);
    if (!order) {
      throw new Error(`Order not found for ShipStation order ID: ${payload.order_id}`);
    }

    // Update order status and tracking info
    const updateData: OrderStatusUpdateData = {
      order_id: order.id,
      shipstation_order_id: payload.order_id,
      status: 'shipped',
      tracking_number: payload.tracking_number,
      carrier: payload.carrier_code,
      carrier_code: payload.carrier_code,
      service_code: payload.service_code,
      shipped_at: payload.ship_date ? new Date(payload.ship_date) : new Date(),
      estimated_delivery_date: payload.estimated_delivery_date ? new Date(payload.estimated_delivery_date) : undefined,
      shipment_cost: payload.shipment_cost,
      label_url: payload.label_url,
      form_url: payload.form_url,
      updated_by: 'shipstation_webhook'
    };

    await this.updateOrderStatus(updateData);

    // Store detailed shipment data
    await this.storeTrackingInfo(order.id, payload);

    // Process inventory adjustments if needed
    if (order.status !== 'shipped') {
      await this.processInventoryAdjustments(order.id, 'shipment');
    }

    // Queue customer notification
    await this.queueCustomerNotification(order.id, 'shipped', {
      tracking_number: payload.tracking_number,
      carrier: payload.carrier_code,
      tracking_url: this.generateTrackingUrl(payload.tracking_number, payload.carrier_code),
      estimated_delivery: payload.estimated_delivery_date
    });
  }

  /**
   * Handle delivered notification
   * @param payload - ShipStation webhook payload
   */
  private async handleDeliveryNotification(payload: ShipStationWebhookPayload): Promise<void> {
    if (!payload.order_id) {
      throw new Error('Order ID is required for delivery notification');
    }

    const order = await this.findOrderByShipStationId(payload.order_id);
    if (!order) {
      throw new Error(`Order not found for ShipStation order ID: ${payload.order_id}`);
    }

    const updateData: OrderStatusUpdateData = {
      order_id: order.id,
      status: 'delivered',
      delivered_at: payload.delivered_date ? new Date(payload.delivered_date) : new Date(),
      actual_delivery_date: payload.delivered_date ? new Date(payload.delivered_date) : new Date(),
      updated_by: 'shipstation_webhook'
    };

    await this.updateOrderStatus(updateData);

    // Queue delivery confirmation notification
    await this.queueCustomerNotification(order.id, 'delivered', {
      delivered_date: payload.delivered_date,
      tracking_number: payload.tracking_number
    });
  }

  /**
   * Handle order notification
   * @param payload - ShipStation webhook payload
   */
  private async handleOrderNotification(payload: ShipStationWebhookPayload): Promise<void> {
    // This could be used for order status updates from ShipStation
    // For now, we'll just log it
    console.log('Order notification received:', payload);
  }

  /**
   * Update order status and tracking information
   * @param updateData - Order status update data
   * @returns Promise<void>
   */
  async updateOrderStatus(updateData: OrderStatusUpdateData): Promise<void> {
    const {
      order_id,
      shipstation_order_id,
      status,
      tracking_number,
      tracking_url,
      carrier,
      carrier_code,
      service_code,
      shipped_at,
      delivered_at,
      estimated_delivery_date,
      actual_delivery_date,
      shipment_cost,
      label_url,
      form_url,
      notes,
      updated_by
    } = updateData;

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Add fields to update
    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (shipstation_order_id) {
      updateFields.push(`shipstation_order_id = $${paramIndex++}`);
      values.push(shipstation_order_id);
    }

    if (tracking_number) {
      updateFields.push(`tracking_number = $${paramIndex++}`);
      values.push(tracking_number);
    }

    if (tracking_url) {
      updateFields.push(`tracking_url = $${paramIndex++}`);
      values.push(tracking_url);
    }

    if (carrier) {
      updateFields.push(`carrier = $${paramIndex++}`);
      values.push(carrier);
    }

    if (carrier_code) {
      updateFields.push(`carrier_code = $${paramIndex++}`);
      values.push(carrier_code);
    }

    if (service_code) {
      updateFields.push(`service_code = $${paramIndex++}`);
      values.push(service_code);
    }

    if (shipped_at) {
      updateFields.push(`shipped_at = $${paramIndex++}`);
      values.push(shipped_at);
    }

    if (delivered_at) {
      updateFields.push(`delivered_at = $${paramIndex++}`);
      values.push(delivered_at);
    }

    if (estimated_delivery_date) {
      updateFields.push(`estimated_delivery_date = $${paramIndex++}`);
      values.push(estimated_delivery_date);
    }

    if (actual_delivery_date) {
      updateFields.push(`actual_delivery_date = $${paramIndex++}`);
      values.push(actual_delivery_date);
    }

    if (shipment_cost !== undefined) {
      updateFields.push(`shipment_cost = $${paramIndex++}`);
      values.push(shipment_cost);
    }

    if (label_url) {
      updateFields.push(`label_url = $${paramIndex++}`);
      values.push(label_url);
    }

    if (form_url) {
      updateFields.push(`form_url = $${paramIndex++}`);
      values.push(form_url);
    }

    if (notes) {
      updateFields.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    // Always update the timestamp
    updateFields.push(`updated_at = $${paramIndex++}`);
    values.push(new Date());

    // Add the order ID as the last parameter
    values.push(order_id);

    const query = `
      UPDATE orders 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `;

    await db.query(query, values);
    
    console.log(`Order ${order_id} updated successfully by ${updated_by || 'system'}`);
  }

  /**
   * Store tracking information and shipment details
   * @param orderId - Order UUID
   * @param payload - ShipStation webhook payload
   * @returns Promise<void>
   */
  async storeTrackingInfo(orderId: UUID, payload: ShipStationWebhookPayload): Promise<void> {
    const shipmentData: ShipmentData = {
      shipment_id: payload.shipment_id || uuidv4(),
      order_id: payload.order_id || 'unknown',
      order_number: payload.order_id || 'unknown',
      create_date: payload.created_at || new Date().toISOString(),
      ship_date: payload.ship_date,
      shipment_cost: payload.shipment_cost,
      tracking_number: payload.tracking_number,
      carrier_code: payload.carrier_code,
      service_code: payload.service_code,
      package_code: payload.package_code,
      confirmation: payload.delivery_confirmation,
      weight: payload.weight ? { value: payload.weight, units: 'lb' } : undefined,
      dimensions: payload.dimensions,
      ship_to: payload.ship_to,
      label_data: payload.label_url,
      form_data: payload.form_url
    };

    // Store shipment data in a JSON column or separate table
    await db.query(`
      UPDATE orders 
      SET 
        shipment_data = $1,
        tracking_url = $2,
        updated_at = $3
      WHERE id = $4
    `, [
      JSON.stringify(shipmentData),
      this.generateTrackingUrl(payload.tracking_number, payload.carrier_code),
      new Date(),
      orderId
    ]);

    // Create shipment notification record
    if (payload.tracking_number) {
      await this.createShipmentNotification(orderId, {
        notification_type: 'shipped',
        tracking_number: payload.tracking_number,
        carrier: payload.carrier_code,
        tracking_url: this.generateTrackingUrl(payload.tracking_number, payload.carrier_code),
        message: `Order shipped via ${payload.carrier_code} - Tracking: ${payload.tracking_number}`
      });
    }
  }

  /**
   * Find order by ShipStation order ID
   * @param shipstationOrderId - ShipStation order ID
   * @returns Promise<Order | null>
   */
  private async findOrderByShipStationId(shipstationOrderId: string): Promise<Order | null> {
    try {
      // First try to find by shipstation_order_id
      let result = await db.query(`
        SELECT * FROM orders 
        WHERE shipstation_order_id = $1
      `, [shipstationOrderId]);

      if (result.rows.length > 0) {
        return result.rows[0] as Order;
      }

      // If not found, try to find by order_number (ShipStation might use order number as ID)
      result = await db.query(`
        SELECT * FROM orders 
        WHERE order_number = $1
      `, [shipstationOrderId]);

      if (result.rows.length > 0) {
        return result.rows[0] as Order;
      }

      return null;
    } catch (error) {
      console.error('Error finding order by ShipStation ID:', error);
      return null;
    }
  }

  /**
   * Generate tracking URL based on carrier
   * @param trackingNumber - Tracking number
   * @param carrierCode - Carrier code
   * @returns string - Tracking URL
   */
  private generateTrackingUrl(trackingNumber?: string, carrierCode?: string): string {
    if (!trackingNumber) return '';

    const carrier = carrierCode?.toLowerCase() || '';
    
    // Common carrier tracking URLs
    const carrierUrls: Record<string, string> = {
      'ups': `https://wwwapps.ups.com/tracking/tracking.cgi?tracknum=${trackingNumber}`,
      'fedex': `https://www.fedex.com/apps/fedextrack/?tracknumbers=${trackingNumber}`,
      'usps': `https://tools.usps.com/go/TrackConfirmAction.action?tLabels=${trackingNumber}`,
      'dhl': `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`,
      'ontrac': `https://www.ontrac.com/trackingres.asp?tracking_number=${trackingNumber}`
    };

    return carrierUrls[carrier] || `https://www.packagetrackr.com/track/${trackingNumber}`;
  }

  /**
   * Create shipment notification record
   * @param orderId - Order UUID
   * @param notification - Notification data
   * @returns Promise<UUID>
   */
  private async createShipmentNotification(
    orderId: UUID,
    notification: Partial<ShipmentNotification>
  ): Promise<UUID> {
    const notificationId = uuidv4();
    
    await db.query(`
      INSERT INTO shipment_notifications (
        id, order_id, notification_type, tracking_number, carrier, 
        tracking_url, message, sent_at, email_sent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      notificationId,
      orderId,
      notification.notification_type || 'shipped',
      notification.tracking_number,
      notification.carrier,
      notification.tracking_url,
      notification.message,
      new Date(),
      false,
      new Date()
    ]);

    return notificationId;
  }

  /**
   * Queue customer notification
   * @param orderId - Order UUID
   * @param notificationType - Type of notification
   * @param data - Additional data for notification
   * @returns Promise<void>
   */
  private async queueCustomerNotification(
    orderId: UUID,
    notificationType: 'shipped' | 'delivered' | 'exception',
    data: Record<string, any>
  ): Promise<void> {
    const jobId = uuidv4();
    
    await db.query(`
      INSERT INTO job_queue (
        id, job_type, payload, status, priority, attempts, max_attempts, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      jobId,
      'order_notification',
      JSON.stringify({
        order_id: orderId,
        notification_type: notificationType,
        ...data
      }),
      'pending',
      'medium',
      0,
      3,
      new Date(),
      new Date()
    ]);

    console.log(`Queued ${notificationType} notification for order ${orderId}`);
  }

  /**
   * Process inventory adjustments after shipment
   * @param orderId - Order UUID
   * @param reason - Reason for inventory adjustment
   * @returns Promise<void>
   */
  private async processInventoryAdjustments(orderId: UUID, reason: string): Promise<void> {
    // Get order items
    const orderItems = await db.query(`
      SELECT oi.product_id, oi.product_sku, oi.quantity, p.track_inventory
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 AND p.track_inventory = true
    `, [orderId]);

    // Process each item
    for (const item of orderItems.rows) {
      const adjustment: InventoryAdjustment = {
        product_id: item.product_id,
        sku: item.product_sku,
        quantity_change: -item.quantity,
        reason: reason as any,
        reference_id: orderId,
        reference_type: 'order',
        notes: `Inventory adjustment for shipped order - ${reason}`
      };

      await this.processInventoryAdjustment(adjustment);
    }
  }

  /**
   * Process single inventory adjustment
   * @param adjustment - Inventory adjustment data
   * @returns Promise<void>
   */
  private async processInventoryAdjustment(adjustment: InventoryAdjustment): Promise<void> {
    const {
      product_id,
      sku,
      quantity_change,
      reason,
      reference_id,
      reference_type,
      notes
    } = adjustment;

    // Update product inventory
    const result = await db.query(`
      UPDATE products 
      SET 
        stock_quantity = stock_quantity + $1,
        updated_at = $2
      WHERE id = $3
      RETURNING stock_quantity
    `, [quantity_change, new Date(), product_id]);

    if (result.rows.length === 0) {
      throw new Error(`Product not found: ${product_id}`);
    }

    const newQuantity = result.rows[0].stock_quantity;

    // Log the inventory change
    await db.query(`
      INSERT INTO inventory_logs (
        id, product_id, change_type, quantity_change, quantity_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      uuidv4(),
      product_id,
      reason,
      quantity_change,
      newQuantity,
      reference_type,
      reference_id,
      notes,
      new Date()
    ]);

    console.log(`Inventory adjusted for ${sku}: ${quantity_change} (new total: ${newQuantity})`);
  }

  /**
   * Log integration operation
   * @param storeId - Store ID
   * @param integrationType - Integration type
   * @param operation - Operation type
   * @param status - Status
   * @param requestData - Request data
   * @param responseData - Response data
   * @param errorMessage - Error message
   * @returns Promise<IntegrationLog>
   */
  private async logIntegration(
    storeId: string,
    integrationType: 'shipstation' | 'shipengine' | 'stripe' | 'other',
    operation: 'order_export' | 'shipment_import' | 'inventory_sync' | 'webhook_processing',
    status: 'success' | 'failure' | 'warning',
    requestData?: Record<string, any>,
    responseData?: Record<string, any>,
    errorMessage?: string
  ): Promise<IntegrationLog> {
    const logId = uuidv4();
    
    const result = await db.query(`
      INSERT INTO integration_logs (
        id, store_id, integration_type, operation, status, 
        request_data, response_data, error_message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      logId,
      storeId,
      integrationType,
      operation,
      status,
      requestData ? JSON.stringify(requestData) : null,
      responseData ? JSON.stringify(responseData) : null,
      errorMessage,
      new Date()
    ]);

    return result.rows[0] as IntegrationLog;
  }

  /**
   * Update integration log
   * @param logId - Log ID
   * @param status - Status
   * @param responseData - Response data
   * @param executionTimeMs - Execution time in milliseconds
   * @param errorMessage - Error message
   * @returns Promise<void>
   */
  private async updateIntegrationLog(
    logId: UUID,
    status: 'success' | 'failure' | 'warning',
    responseData?: Record<string, any>,
    executionTimeMs?: number,
    errorMessage?: string
  ): Promise<void> {
    await db.query(`
      UPDATE integration_logs 
      SET 
        status = $1,
        response_data = $2,
        execution_time_ms = $3,
        error_message = $4
      WHERE id = $5
    `, [
      status,
      responseData ? JSON.stringify(responseData) : null,
      executionTimeMs,
      errorMessage,
      logId
    ]);
  }

  /**
   * Get order tracking information
   * @param orderId - Order UUID
   * @returns Promise<Order | null>
   */
  async getOrderTrackingInfo(orderId: UUID): Promise<Order | null> {
    try {
      const result = await db.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      return result.rows.length > 0 ? result.rows[0] as Order : null;
    } catch (error) {
      console.error('Error getting order tracking info:', error);
      return null;
    }
  }

  /**
   * Get shipment notifications for an order
   * @param orderId - Order UUID
   * @returns Promise<ShipmentNotification[]>
   */
  async getShipmentNotifications(orderId: UUID): Promise<ShipmentNotification[]> {
    try {
      const result = await db.query(`
        SELECT * FROM shipment_notifications 
        WHERE order_id = $1 
        ORDER BY created_at DESC
      `, [orderId]);

      return result.rows as ShipmentNotification[];
    } catch (error) {
      console.error('Error getting shipment notifications:', error);
      return [];
    }
  }
}

// Export singleton instance
export const orderStatusService = new OrderStatusService();