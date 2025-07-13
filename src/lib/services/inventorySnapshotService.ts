import { db } from '@/lib/database/connection';

export class InventorySnapshotService {
  /**
   * Create a daily snapshot for a store
   */
  async createDailySnapshot(storeId: string, snapshotDate: Date = new Date()): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      // Call the database function to create snapshot
      const result = await db.query(
        'SELECT create_inventory_snapshot($1, $2::date) as snapshot_id',
        [storeId, snapshotDate]
      );

      const snapshotId = result.rows[0]?.snapshot_id;

      if (!snapshotId) {
        return { success: false, error: 'Failed to create snapshot' };
      }

      // Calculate additional metrics not handled by the function
      await this.updateTurnoverMetrics(snapshotId, storeId, snapshotDate);
      await this.updateSupplierBreakdown(snapshotId, storeId);
      await this.updateWarehouseBreakdown(snapshotId, storeId);

      return { success: true, snapshotId };
    } catch (error) {
      console.error('Error creating inventory snapshot:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Update turnover metrics for a snapshot
   */
  private async updateTurnoverMetrics(snapshotId: string, storeId: string, snapshotDate: Date): Promise<void> {
    try {
      // Calculate average turnover ratio and days to sell
      const turnoverQuery = `
        WITH sales_data AS (
          SELECT 
            p.id,
            p.stock_quantity,
            p.cost_price,
            COALESCE(SUM(oi.quantity), 0) as units_sold_90_days
          FROM products p
          LEFT JOIN order_items oi ON p.id = oi.product_id
          LEFT JOIN orders o ON oi.order_id = o.id
          WHERE p.store_id = $1
            AND p.is_active = true
            AND (o.created_at >= $2::date - INTERVAL '90 days' OR o.created_at IS NULL)
            AND (o.status IN ('completed', 'processing') OR o.status IS NULL)
          GROUP BY p.id, p.stock_quantity, p.cost_price
        ),
        turnover_metrics AS (
          SELECT 
            AVG(CASE 
              WHEN stock_quantity > 0 THEN (units_sold_90_days * 4.0) / stock_quantity 
              ELSE 0 
            END) as avg_turnover_ratio,
            AVG(CASE 
              WHEN units_sold_90_days > 0 THEN (stock_quantity * 90.0) / units_sold_90_days
              ELSE 365 
            END) as avg_days_to_sell,
            COUNT(CASE WHEN (units_sold_90_days * 4.0) / NULLIF(stock_quantity, 0) > 6 THEN 1 END) as fast_moving_count,
            COUNT(CASE WHEN units_sold_90_days = 0 AND stock_quantity > 0 THEN 1 END) as no_movement_count,
            COUNT(CASE WHEN units_sold_90_days > 0 AND units_sold_90_days < 5 AND stock_quantity > 0 THEN 1 END) as slow_moving_count,
            SUM(CASE WHEN units_sold_90_days > 0 AND units_sold_90_days < 5 THEN stock_quantity * cost_price ELSE 0 END) as slow_moving_value
          FROM sales_data
        )
        UPDATE inventory_snapshots
        SET 
          avg_turnover_ratio = tm.avg_turnover_ratio,
          avg_days_to_sell = tm.avg_days_to_sell,
          fast_moving_count = tm.fast_moving_count,
          slow_moving_count = tm.slow_moving_count,
          slow_moving_value = tm.slow_moving_value
        FROM turnover_metrics tm
        WHERE inventory_snapshots.id = $3
      `;

      await db.query(turnoverQuery, [storeId, snapshotDate, snapshotId]);
    } catch (error) {
      console.error('Error updating turnover metrics:', error);
    }
  }

  /**
   * Update supplier breakdown for a snapshot
   */
  private async updateSupplierBreakdown(snapshotId: string, storeId: string): Promise<void> {
    try {
      // For now, we'll use a simplified supplier breakdown
      // In a real system, this would link to actual supplier data
      const supplierQuery = `
        UPDATE inventory_snapshots
        SET value_by_supplier = (
          SELECT jsonb_build_object(
            'ShipStation', SUM(CASE WHEN i.warehouse_name IS NOT NULL THEN p.stock_quantity * p.cost_price ELSE 0 END),
            'Direct', SUM(CASE WHEN i.warehouse_name IS NULL THEN p.stock_quantity * p.cost_price ELSE 0 END)
          )
          FROM products p
          LEFT JOIN inventory i ON p.sku = i.sku AND p.store_id = i.store_id
          WHERE p.store_id = $1
            AND p.is_active = true
        )
        WHERE id = $2
      `;

      await db.query(supplierQuery, [storeId, snapshotId]);
    } catch (error) {
      console.error('Error updating supplier breakdown:', error);
    }
  }

  /**
   * Update warehouse breakdown for a snapshot
   */
  private async updateWarehouseBreakdown(snapshotId: string, storeId: string): Promise<void> {
    try {
      const warehouseQuery = `
        UPDATE inventory_snapshots
        SET value_by_warehouse = (
          SELECT jsonb_object_agg(
            COALESCE(warehouse_name, 'Main'),
            total_value
          )
          FROM (
            SELECT 
              i.warehouse_name,
              SUM(p.stock_quantity * p.cost_price) as total_value
            FROM products p
            LEFT JOIN inventory i ON p.sku = i.sku AND p.store_id = i.store_id
            WHERE p.store_id = $1
              AND p.is_active = true
            GROUP BY i.warehouse_name
          ) warehouse_totals
        )
        WHERE id = $2
      `;

      await db.query(warehouseQuery, [storeId, snapshotId]);
    } catch (error) {
      console.error('Error updating warehouse breakdown:', error);
    }
  }

  /**
   * Get snapshot history for a store
   */
  async getSnapshotHistory(
    storeId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<unknown[]> {
    try {
      const query = `
        SELECT * FROM inventory_snapshots
        WHERE store_id = $1
          AND snapshot_date >= $2
          AND snapshot_date <= $3
        ORDER BY snapshot_date DESC
      `;

      const result = await db.query(query, [storeId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching snapshot history:', error);
      return [];
    }
  }

  /**
   * Backfill historical snapshots
   */
  async backfillSnapshots(
    storeId: string, 
    startDate: Date, 
    endDate: Date = new Date()
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const result = await db.query(
        'SELECT backfill_inventory_snapshots($1, $2::date, $3::date) as count',
        [storeId, startDate, endDate]
      );

      const count = result.rows[0]?.count || 0;

      return { success: true, count };
    } catch (error) {
      console.error('Error backfilling snapshots:', error);
      return { 
        success: false, 
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get latest snapshot for a store
   */
  async getLatestSnapshot(storeId: string): Promise<unknown | null> {
    try {
      const query = `
        SELECT * FROM inventory_snapshots
        WHERE store_id = $1
        ORDER BY snapshot_date DESC
        LIMIT 1
      `;

      const result = await db.query(query, [storeId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      return null;
    }
  }

  /**
   * Check if snapshot exists for a date
   */
  async snapshotExists(storeId: string, date: Date): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM inventory_snapshots
          WHERE store_id = $1 AND snapshot_date = $2::date
        ) as exists
      `;

      const result = await db.query(query, [storeId, date]);
      return result.rows[0]?.exists || false;
    } catch (error) {
      console.error('Error checking snapshot existence:', error);
      return false;
    }
  }
}

export const inventorySnapshotService = new InventorySnapshotService();