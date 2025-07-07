/**
 * ShipStation Database Service Functions
 * Handles database operations for ShipStation Custom Store integration
 */

import { db } from '@/lib/database';
import { Order } from '@/lib/types/database';
import { parseShipStationDate } from '@/lib/shipstation/utils';

export interface ShipStationConfig {
  id: string;
  store_id: string;
  username: string;
  password_hash: string;
  endpoint_url: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ShipmentNotification {
  id?: string;
  order_id: string;
  tracking_number: string;
  carrier: string;
  service: string;
  ship_date: string;
  shipping_cost?: number;
  notification_data?: Record<string, unknown>;
  status?: string;
  received_at?: Date;
  processed_at?: Date;
}

export interface OrderExportData {
  orders: Order[];
  totalPages: number;
  currentPage: number;
}

/**
 * Get ShipStation configuration for a specific store
 * @param storeId - Store ID
 * @returns ShipStation configuration or null
 */
export async function getShipStationConfig(storeId: string): Promise<ShipStationConfig | null> {
  try {
    const result = await db.query(
      'SELECT * FROM shipstation_config WHERE store_id = $1',
      [storeId]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching ShipStation config:', error);
    throw new Error('Failed to fetch ShipStation configuration');
  }
}

/**
 * Get ShipStation configuration by username (for authentication)
 * @param username - Username
 * @returns ShipStation configuration or null
 */
export async function getShipStationConfigByUsername(username: string): Promise<ShipStationConfig | null> {
  try {
    const result = await db.query(
      'SELECT * FROM shipstation_config WHERE username = $1 AND is_active = true',
      [username]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching ShipStation config by username:', error);
    throw new Error('Failed to fetch ShipStation configuration');
  }
}

/**
 * Save or update ShipStation configuration
 * @param config - ShipStation configuration data
 */
export async function saveShipStationConfig(config: Omit<ShipStationConfig, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  try {
    await db.query(
      `INSERT INTO shipstation_config (store_id, username, password_hash, endpoint_url, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE SET
         username = $2,
         password_hash = $3,
         endpoint_url = $4,
         is_active = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [config.store_id, config.username, config.password_hash, config.endpoint_url, config.is_active]
    );
  } catch (error) {
    console.error('Error saving ShipStation config:', error);
    throw new Error('Failed to save ShipStation configuration');
  }
}

/**
 * Store a shipment notification from ShipStation
 * @param notification - Shipment notification data
 */
export async function storeShipmentNotification(notification: Omit<ShipmentNotification, 'id' | 'received_at'>): Promise<void> {
  try {
    await db.query(
      `INSERT INTO shipment_notifications 
       (order_id, tracking_number, carrier, service, ship_date, shipping_cost, notification_data, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        notification.order_id,
        notification.tracking_number,
        notification.carrier,
        notification.service,
        notification.ship_date,
        notification.shipping_cost || null,
        notification.notification_data ? JSON.stringify(notification.notification_data) : null,
        notification.status || 'received'
      ]
    );
  } catch (error) {
    console.error('Error storing shipment notification:', error);
    throw new Error('Failed to store shipment notification');
  }
}

/**
 * Get orders for export to ShipStation
 * @param storeId - Store ID
 * @param startDate - Start date in MM/dd/yyyy HH:mm format
 * @param endDate - End date in MM/dd/yyyy HH:mm format
 * @param page - Page number (1-based)
 * @param pageSize - Number of items per page
 * @returns Order export data
 */
export async function getOrdersForExport(
  storeId: string,
  startDate: string,
  endDate: string,
  page: number,
  pageSize: number = 50
): Promise<OrderExportData> {
  try {
    const offset = (page - 1) * pageSize;
    
    // Convert ShipStation date format to ISO format
    const startDateISO = parseShipStationDate(startDate).toISOString();
    const endDateISO = parseShipStationDate(endDate).toISOString();
    
    // First, get the total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total_count
       FROM orders
       WHERE store_id = $1
         AND updated_at >= $2
         AND updated_at <= $3`,
      [storeId, startDateISO, endDateISO]
    );
    
    const totalCount = parseInt(countResult.rows[0]?.total_count || '0');
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Get orders with customer and order items
    const ordersResult = await db.query(
      `SELECT 
         o.*,
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_sku', oi.product_sku,
             'product_name', oi.product_name,
             'product_image_url', oi.product_image_url,
             'unit_price', oi.unit_price,
             'quantity', oi.quantity,
             'total_price', oi.total_price,
             'discount_type', oi.discount_type,
             'discount_value', oi.discount_value,
             'discount_amount', oi.discount_amount,
             'upc', oi.upc,
             'location', oi.location,
             'item_options', oi.item_options
           )
         ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.store_id = $1
         AND o.updated_at >= $2
         AND o.updated_at <= $3
       GROUP BY o.id
       ORDER BY o.updated_at DESC
       LIMIT $4 OFFSET $5`,
      [storeId, startDateISO, endDateISO, pageSize, offset]
    );
    
    // Process the orders to include customer and shipping address data
    const orders = ordersResult.rows.map(row => ({
      ...row,
      customer: {
        email: row.customer_email,
        first_name: row.customer_first_name,
        last_name: row.customer_last_name,
        phone: row.customer_phone,
        billing_address: {
          name: `${row.billing_first_name || row.customer_first_name} ${row.billing_last_name || row.customer_last_name}`,
          company: '', // Not stored in current schema
          address1: row.billing_address_line1 || row.shipping_address_line1,
          address2: row.billing_address_line2 || row.shipping_address_line2,
          city: row.billing_city || row.shipping_city,
          state: row.billing_state || row.shipping_state,
          postal_code: row.billing_postal_code || row.shipping_postal_code,
          country: row.billing_country || row.shipping_country,
          phone: row.customer_phone
        }
      },
      shipping_address: {
        name: `${row.shipping_first_name} ${row.shipping_last_name}`,
        company: '', // Not stored in current schema
        address1: row.shipping_address_line1,
        address2: row.shipping_address_line2,
        city: row.shipping_city,
        state: row.shipping_state,
        postal_code: row.shipping_postal_code,
        country: row.shipping_country,
        phone: row.customer_phone
      },
      items: row.items.filter((item: { id: string | null }) => item.id !== null) // Remove null items from LEFT JOIN
    }));
    
    return {
      orders,
      totalPages,
      currentPage: page
    };
  } catch (error) {
    console.error('Error getting orders for export:', error);
    throw new Error('Failed to get orders for export');
  }
}

/**
 * Mark a shipment notification as processed
 * @param orderId - Order ID
 */
export async function markShipmentNotificationProcessed(orderId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE shipment_notifications 
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP 
       WHERE order_id = $1 AND status = 'received'`,
      [orderId]
    );
  } catch (error) {
    console.error('Error marking shipment notification as processed:', error);
    throw new Error('Failed to mark shipment notification as processed');
  }
}

/**
 * Get shipment notifications for an order
 * @param orderId - Order ID
 * @returns Array of shipment notifications
 */
export async function getShipmentNotifications(orderId: string): Promise<ShipmentNotification[]> {
  try {
    const result = await db.query(
      'SELECT * FROM shipment_notifications WHERE order_id = $1 ORDER BY received_at DESC',
      [orderId]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting shipment notifications:', error);
    throw new Error('Failed to get shipment notifications');
  }
}

/**
 * Get all ShipStation configurations for a store (should only be one)
 * @param storeId - Store ID
 * @returns Array of ShipStation configurations
 */
export async function getAllShipStationConfigs(storeId: string): Promise<ShipStationConfig[]> {
  try {
    const result = await db.query(
      'SELECT * FROM shipstation_config WHERE store_id = $1',
      [storeId]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting all ShipStation configs:', error);
    throw new Error('Failed to get ShipStation configurations');
  }
}

/**
 * Delete ShipStation configuration for a store
 * @param storeId - Store ID
 */
export async function deleteShipStationConfig(storeId: string): Promise<void> {
  try {
    await db.query(
      'DELETE FROM shipstation_config WHERE store_id = $1',
      [storeId]
    );
  } catch (error) {
    console.error('Error deleting ShipStation config:', error);
    throw new Error('Failed to delete ShipStation configuration');
  }
}

/**
 * Update order status after shipment notification
 * @param orderId - Order ID
 * @param status - New status
 * @param trackingNumber - Tracking number
 * @param shippedAt - Shipped date
 */
export async function updateOrderShipmentStatus(
  orderId: string, 
  status: string, 
  trackingNumber: string, 
  shippedAt?: Date
): Promise<void> {
  try {
    await db.query(
      `UPDATE orders 
       SET status = $2, fulfillment_status = 'fulfilled', tracking_number = $3, shipped_at = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, status, trackingNumber, shippedAt || new Date()]
    );
  } catch (error) {
    console.error('Error updating order shipment status:', error);
    throw new Error('Failed to update order shipment status');
  }
}

/**
 * Get order by order number for a specific store
 * @param storeId - Store ID
 * @param orderNumber - Order number
 * @returns Order data or null
 */
export async function getOrderByNumber(storeId: string, orderNumber: string): Promise<Order | null> {
  try {
    const result = await db.query(
      'SELECT * FROM orders WHERE store_id = $1 AND order_number = $2',
      [storeId, orderNumber]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting order by number:', error);
    throw new Error('Failed to get order by number');
  }
}