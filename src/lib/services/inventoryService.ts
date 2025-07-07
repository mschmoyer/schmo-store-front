import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  Product,
  Order,
  OrderItem,
  InventoryAdjustment
} from '@/lib/types/database';

/**
 * Inventory Management Service
 * 
 * Handles inventory tracking and management for ShipStation integration:
 * - Updates inventory after shipment
 * - Syncs with existing inventory system
 * - Handles stock level adjustments
 * - Manages low stock alerts
 * - Provides inventory reconciliation
 * 
 * @example
 * ```typescript
 * const inventoryService = new InventoryService();
 * await inventoryService.updateInventoryAfterShipment(orderId);
 * ```
 */
export class InventoryService {
  private readonly LOW_STOCK_THRESHOLD = 5;
  private readonly CRITICAL_STOCK_THRESHOLD = 1;

  /**
   * Update inventory after shipment
   * @param orderId - Order UUID
   * @param shipmentData - Shipment information
   * @returns Promise<boolean> - Success status
   */
  async updateInventoryAfterShipment(
    orderId: UUID,
    shipmentData?: {
      tracking_number?: string;
      carrier?: string;
      shipment_date?: Date;
      items_shipped?: Array<{
        product_id: UUID;
        sku: string;
        quantity_shipped: number;
      }>;
    }
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      console.log(`Updating inventory for order ${orderId} after shipment`);

      // Get order details
      const order = await this.getOrderDetails(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Get order items
      const orderItems = await this.getOrderItems(orderId);
      if (orderItems.length === 0) {
        throw new Error(`No items found for order: ${orderId}`);
      }

      // Start database transaction
      await db.query('BEGIN');

      try {
        // Process each order item
        for (const item of orderItems) {
          await this.processInventoryAdjustment({
            product_id: item.product_id,
            sku: item.product_sku,
            quantity_change: -item.quantity,
            reason: 'shipment',
            reference_id: orderId,
            reference_type: 'order',
            notes: `Inventory reduced due to shipment - Order #${order.order_number}${shipmentData?.tracking_number ? ` (Tracking: ${shipmentData.tracking_number})` : ''}`
          });

          // Check for low stock alerts
          await this.checkLowStockAlert(item.product_id, order.store_id);
        }

        // Update order fulfillment status
        await this.updateOrderFulfillmentStatus(orderId, 'shipped');

        // Commit transaction
        await db.query('COMMIT');

        // Log successful inventory update
        await this.logInventoryOperation(
          order.store_id,
          'inventory_sync',
          'success',
          { order_id: orderId, items_processed: orderItems.length },
          { inventory_updated: true },
          Date.now() - startTime
        );

        console.log(`Successfully updated inventory for order ${orderId}`);
        return true;

      } catch (error) {
        // Rollback transaction on error
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error updating inventory after shipment:', error);

      // Log failed inventory update
      await this.logInventoryOperation(
        'unknown',
        'inventory_sync',
        'failure',
        { order_id: orderId },
        null,
        Date.now() - startTime,
        error instanceof Error ? error.message : 'Unknown error'
      );

      return false;
    }
  }

  /**
   * Process individual inventory adjustment
   * @param adjustment - Inventory adjustment data
   * @returns Promise<void>
   */
  async processInventoryAdjustment(adjustment: InventoryAdjustment): Promise<void> {
    const {
      product_id,
      sku,
      quantity_change,
      reason,
      reference_id,
      reference_type,
      notes
    } = adjustment;

    // Get current product inventory
    const productResult = await db.query(`
      SELECT id, store_id, sku, stock_quantity, track_inventory, low_stock_threshold
      FROM products 
      WHERE id = $1
    `, [product_id]);

    if (productResult.rows.length === 0) {
      throw new Error(`Product not found: ${product_id}`);
    }

    const product = productResult.rows[0];

    // Skip if inventory tracking is disabled
    if (!product.track_inventory) {
      console.log(`Inventory tracking disabled for product ${sku}, skipping adjustment`);
      return;
    }

    const currentQuantity = product.stock_quantity;
    const newQuantity = currentQuantity + quantity_change;

    // Prevent negative inventory (optional - can be configured per store)
    if (newQuantity < 0) {
      console.warn(`Adjustment would result in negative inventory for ${sku}: ${newQuantity}`);
      // Optionally throw error or set to 0
      // throw new Error(`Insufficient inventory for ${sku}. Current: ${currentQuantity}, Requested: ${Math.abs(quantity_change)}`);
    }

    // Update product inventory
    await db.query(`
      UPDATE products 
      SET 
        stock_quantity = $1,
        updated_at = $2
      WHERE id = $3
    `, [Math.max(0, newQuantity), new Date(), product_id]);

    // Log the inventory change
    await db.query(`
      INSERT INTO inventory_logs (
        id, store_id, product_id, change_type, quantity_change, quantity_after,
        reference_type, reference_id, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      uuidv4(),
      product.store_id,
      product_id,
      reason,
      quantity_change,
      Math.max(0, newQuantity),
      reference_type,
      reference_id,
      notes,
      new Date()
    ]);

    console.log(`Inventory adjusted for ${sku}: ${quantity_change} (${currentQuantity} → ${Math.max(0, newQuantity)})`);
  }

  /**
   * Sync inventory with existing system
   * @param storeId - Store UUID
   * @param inventoryData - Inventory data from external system
   * @returns Promise<{ success: boolean; synced: number; errors: string[] }>
   */
  async syncInventoryWithExternalSystem(
    storeId: UUID,
    inventoryData: Array<{
      sku: string;
      available_quantity: number;
      allocated_quantity?: number;
      warehouse_id?: string;
      last_updated?: Date;
    }>
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let syncedCount = 0;

    try {
      console.log(`Starting inventory sync for store ${storeId} with ${inventoryData.length} items`);

      // Start transaction
      await db.query('BEGIN');

      try {
        for (const item of inventoryData) {
          try {
            // Find product by SKU
            const productResult = await db.query(`
              SELECT id, stock_quantity, track_inventory 
              FROM products 
              WHERE store_id = $1 AND sku = $2
            `, [storeId, item.sku]);

            if (productResult.rows.length === 0) {
              errors.push(`Product not found for SKU: ${item.sku}`);
              continue;
            }

            const product = productResult.rows[0];

            // Skip if inventory tracking is disabled
            if (!product.track_inventory) {
              continue;
            }

            const currentQuantity = product.stock_quantity;
            const newQuantity = item.available_quantity;
            const quantityChange = newQuantity - currentQuantity;

            // Update inventory if changed
            if (quantityChange !== 0) {
              await this.processInventoryAdjustment({
                product_id: product.id,
                sku: item.sku,
                quantity_change: quantityChange,
                reason: 'adjustment',
                reference_type: 'manual',
                notes: `External system sync - Updated from ${currentQuantity} to ${newQuantity}`
              });

              syncedCount++;
            }

            // Update warehouse inventory if provided
            if (item.warehouse_id) {
              await this.updateWarehouseInventory(
                storeId,
                item.sku,
                item.warehouse_id,
                item.available_quantity,
                item.allocated_quantity || 0
              );
            }

          } catch (itemError) {
            const errorMsg = `Error syncing ${item.sku}: ${itemError instanceof Error ? itemError.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // Commit transaction
        await db.query('COMMIT');

        // Log successful sync
        await this.logInventoryOperation(
          storeId,
          'inventory_sync',
          errors.length === 0 ? 'success' : 'warning',
          { items_requested: inventoryData.length },
          { items_synced: syncedCount, errors_count: errors.length },
          Date.now() - startTime,
          errors.length > 0 ? `${errors.length} errors occurred` : undefined
        );

        console.log(`Inventory sync completed for store ${storeId}: ${syncedCount} items synced, ${errors.length} errors`);

        return {
          success: errors.length === 0,
          synced: syncedCount,
          errors
        };

      } catch (error) {
        // Rollback transaction on error
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);

      // Log failed sync
      await this.logInventoryOperation(
        storeId,
        'inventory_sync',
        'failure',
        { items_requested: inventoryData.length },
        null,
        Date.now() - startTime,
        errorMsg
      );

      return {
        success: false,
        synced: syncedCount,
        errors
      };
    }
  }

  /**
   * Handle stock level adjustments
   * @param adjustments - Array of inventory adjustments
   * @returns Promise<{ success: boolean; processed: number; errors: string[] }>
   */
  async handleStockLevelAdjustments(
    adjustments: Array<{
      product_id: UUID;
      sku: string;
      adjustment_type: 'increase' | 'decrease' | 'set';
      quantity: number;
      reason: string;
      notes?: string;
    }>
  ): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processedCount = 0;

    try {
      // Start transaction
      await db.query('BEGIN');

      try {
        for (const adj of adjustments) {
          try {
            let quantityChange: number;

            if (adj.adjustment_type === 'set') {
              // Get current quantity to calculate change
              const productResult = await db.query(`
                SELECT stock_quantity FROM products WHERE id = $1
              `, [adj.product_id]);

              if (productResult.rows.length === 0) {
                throw new Error(`Product not found: ${adj.product_id}`);
              }

              const currentQuantity = productResult.rows[0].stock_quantity;
              quantityChange = adj.quantity - currentQuantity;
            } else {
              quantityChange = adj.adjustment_type === 'increase' ? adj.quantity : -adj.quantity;
            }

            await this.processInventoryAdjustment({
              product_id: adj.product_id,
              sku: adj.sku,
              quantity_change: quantityChange,
              reason: adj.reason as 'sale' | 'return' | 'damage' | 'theft' | 'found' | 'adjustment' | 'shipment',
              reference_type: 'manual',
              notes: adj.notes || `Manual adjustment: ${adj.adjustment_type} ${adj.quantity}`
            });

            processedCount++;

          } catch (itemError) {
            const errorMsg = `Error adjusting ${adj.sku}: ${itemError instanceof Error ? itemError.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // Commit transaction
        await db.query('COMMIT');

        console.log(`Stock adjustments completed: ${processedCount} processed, ${errors.length} errors`);

        return {
          success: errors.length === 0,
          processed: processedCount,
          errors
        };

      } catch (error) {
        // Rollback transaction on error
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);

      return {
        success: false,
        processed: processedCount,
        errors
      };
    }
  }

  /**
   * Check for low stock alerts
   * @param productId - Product UUID
   * @param storeId - Store UUID
   * @returns Promise<void>
   */
  private async checkLowStockAlert(productId: UUID, storeId: UUID): Promise<void> {
    try {
      const productResult = await db.query(`
        SELECT sku, name, stock_quantity, low_stock_threshold 
        FROM products 
        WHERE id = $1 AND store_id = $2
      `, [productId, storeId]);

      if (productResult.rows.length === 0) {
        return;
      }

      const product = productResult.rows[0];
      const threshold = product.low_stock_threshold || this.LOW_STOCK_THRESHOLD;

      if (product.stock_quantity <= threshold) {
        const alertLevel = product.stock_quantity <= this.CRITICAL_STOCK_THRESHOLD ? 'critical' : 'warning';
        
        // Log low stock alert
        console.warn(`${alertLevel.toUpperCase()} STOCK ALERT: ${product.sku} (${product.name}) - Quantity: ${product.stock_quantity}, Threshold: ${threshold}`);

        // TODO: Implement alert notification system
        // await this.sendLowStockAlert(storeId, product, alertLevel);
      }

    } catch (error) {
      console.error('Error checking low stock alert:', error);
    }
  }

  /**
   * Update warehouse inventory
   * @param storeId - Store UUID
   * @param sku - Product SKU
   * @param warehouseId - Warehouse ID
   * @param available - Available quantity
   * @param allocated - Allocated quantity
   * @returns Promise<void>
   */
  private async updateWarehouseInventory(
    storeId: UUID,
    sku: string,
    warehouseId: string,
    available: number,
    allocated: number
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO inventory (
          id, store_id, sku, available, on_hand, allocated, warehouse_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (store_id, sku, warehouse_id) 
        DO UPDATE SET 
          available = EXCLUDED.available,
          allocated = EXCLUDED.allocated,
          on_hand = EXCLUDED.available + EXCLUDED.allocated,
          updated_at = EXCLUDED.updated_at
      `, [
        uuidv4(),
        storeId,
        sku,
        available,
        available + allocated,
        allocated,
        warehouseId,
        new Date(),
        new Date()
      ]);

    } catch (error) {
      console.error('Error updating warehouse inventory:', error);
      throw error;
    }
  }

  /**
   * Update order fulfillment status
   * @param orderId - Order UUID
   * @param status - Fulfillment status
   * @returns Promise<void>
   */
  private async updateOrderFulfillmentStatus(
    orderId: UUID,
    status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  ): Promise<void> {
    try {
      await db.query(`
        UPDATE orders 
        SET 
          fulfillment_status = $1,
          updated_at = $2
        WHERE id = $3
      `, [status, new Date(), orderId]);

    } catch (error) {
      console.error('Error updating order fulfillment status:', error);
      throw error;
    }
  }

  /**
   * Get order details
   * @param orderId - Order UUID
   * @returns Promise<Order | null>
   */
  private async getOrderDetails(orderId: UUID): Promise<Order | null> {
    try {
      const result = await db.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      return result.rows.length > 0 ? result.rows[0] as Order : null;
    } catch (error) {
      console.error('Error getting order details:', error);
      return null;
    }
  }

  /**
   * Get order items
   * @param orderId - Order UUID
   * @returns Promise<OrderItem[]>
   */
  private async getOrderItems(orderId: UUID): Promise<OrderItem[]> {
    try {
      const result = await db.query(`
        SELECT * FROM order_items WHERE order_id = $1
      `, [orderId]);

      return result.rows as OrderItem[];
    } catch (error) {
      console.error('Error getting order items:', error);
      return [];
    }
  }

  /**
   * Log inventory operation
   * @param storeId - Store UUID
   * @param operation - Operation type
   * @param status - Status
   * @param requestData - Request data
   * @param responseData - Response data
   * @param executionTimeMs - Execution time in milliseconds
   * @param errorMessage - Error message
   * @returns Promise<void>
   */
  private async logInventoryOperation(
    storeId: string,
    operation: 'inventory_sync' | 'stock_adjustment' | 'low_stock_alert',
    status: 'success' | 'failure' | 'warning',
    requestData?: Record<string, unknown>,
    responseData?: Record<string, unknown>,
    executionTimeMs?: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO integration_logs (
          id, store_id, integration_type, operation, status, 
          request_data, response_data, execution_time_ms, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        uuidv4(),
        storeId,
        'shipstation',
        operation,
        status,
        requestData ? JSON.stringify(requestData) : null,
        responseData ? JSON.stringify(responseData) : null,
        executionTimeMs,
        errorMessage,
        new Date()
      ]);
    } catch (error) {
      console.error('Error logging inventory operation:', error);
    }
  }

  /**
   * Get inventory summary for store
   * @param storeId - Store UUID
   * @returns Promise<InventorySummary>
   */
  async getInventorySummary(storeId: UUID): Promise<{
    total_products: number;
    in_stock_products: number;
    low_stock_products: number;
    out_of_stock_products: number;
    total_inventory_value: number;
    last_updated: Date;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_products,
          COUNT(CASE WHEN stock_quantity > 0 THEN 1 END) as in_stock_products,
          COUNT(CASE WHEN stock_quantity <= COALESCE(low_stock_threshold, $2) AND stock_quantity > 0 THEN 1 END) as low_stock_products,
          COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_products,
          COALESCE(SUM(stock_quantity * base_price), 0) as total_inventory_value,
          MAX(updated_at) as last_updated
        FROM products 
        WHERE store_id = $1 AND track_inventory = true
      `, [storeId, this.LOW_STOCK_THRESHOLD]);

      return result.rows[0];
    } catch (error) {
      console.error('Error getting inventory summary:', error);
      throw error;
    }
  }

  /**
   * Get low stock products
   * @param storeId - Store UUID
   * @param limit - Maximum number of products to return
   * @returns Promise<Product[]>
   */
  async getLowStockProducts(storeId: UUID, limit: number = 50): Promise<Product[]> {
    try {
      const result = await db.query(`
        SELECT * FROM products 
        WHERE store_id = $1 
          AND track_inventory = true 
          AND stock_quantity <= COALESCE(low_stock_threshold, $2)
        ORDER BY stock_quantity ASC, updated_at DESC
        LIMIT $3
      `, [storeId, this.LOW_STOCK_THRESHOLD, limit]);

      return result.rows as Product[];
    } catch (error) {
      console.error('Error getting low stock products:', error);
      return [];
    }
  }
}

// Export singleton instance
export const inventoryService = new InventoryService();