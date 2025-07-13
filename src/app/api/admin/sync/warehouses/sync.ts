import { db } from '@/lib/database/connection';

interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * Sync warehouses from ShipStation V2 API
 */
export async function syncWarehouses(apiKey: string, storeId: string): Promise<SyncResult> {
  const result: SyncResult = { totalCount: 0, addedCount: 0, updatedCount: 0 };

  try {
    console.log('Fetching warehouses from ShipStation V2 API...');
    
    // Get warehouses from ShipStation API
    const response = await fetch('https://api.shipstation.com/v2/warehouses', {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('ShipStation V2 warehouses response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      throw new Error(`ShipStation API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const warehouses = data.warehouses || [];
    result.totalCount = warehouses.length;

    console.log(`Found ${warehouses.length} warehouses from ShipStation`);

    // Sync each warehouse to database
    for (const warehouse of warehouses) {
      try {
        // Check if warehouse already exists
        const existingResult = await db.query(
          'SELECT id FROM shipfroms WHERE store_id = $1 AND warehouse_id = $2',
          [storeId, warehouse.warehouse_id]
        );

        if (existingResult.rows.length > 0) {
          // Update existing warehouse
          await db.query(`
            UPDATE shipfroms SET
              name = $3,
              company_name = $4,
              phone = $5,
              email = $6,
              is_default = $7,
              origin_address_line1 = $8,
              origin_address_line2 = $9,
              origin_address_line3 = $10,
              origin_city_locality = $11,
              origin_state_province = $12,
              origin_postal_code = $13,
              origin_country_code = $14,
              origin_residential_indicator = $15,
              return_address_line1 = $16,
              return_address_line2 = $17,
              return_address_line3 = $18,
              return_city_locality = $19,
              return_state_province = $20,
              return_postal_code = $21,
              return_country_code = $22,
              return_residential_indicator = $23,
              instructions = $24,
              updated_at = CURRENT_TIMESTAMP
            WHERE store_id = $1 AND warehouse_id = $2
          `, [
            storeId, warehouse.warehouse_id, warehouse.name, warehouse.company_name, warehouse.origin_address?.phone || '', warehouse.email, warehouse.is_default || false,
            warehouse.origin_address?.address_line1, warehouse.origin_address?.address_line2, warehouse.origin_address?.address_line3,
            warehouse.origin_address?.city_locality, warehouse.origin_address?.state_province, warehouse.origin_address?.postal_code,
            warehouse.origin_address?.country_code, warehouse.origin_address?.address_residential_indicator,
            warehouse.return_address?.address_line1, warehouse.return_address?.address_line2, warehouse.return_address?.address_line3,
            warehouse.return_address?.city_locality, warehouse.return_address?.state_province, warehouse.return_address?.postal_code,
            warehouse.return_address?.country_code, warehouse.return_address?.address_residential_indicator,
            warehouse.instructions
          ]);
          result.updatedCount++;
        } else {
          // Insert new warehouse
          await db.query(`
            INSERT INTO shipfroms (
              store_id, warehouse_id, name, company_name, phone, email, is_default,
              origin_address_line1, origin_address_line2, origin_address_line3,
              origin_city_locality, origin_state_province, origin_postal_code, origin_country_code, origin_residential_indicator,
              return_address_line1, return_address_line2, return_address_line3,
              return_city_locality, return_state_province, return_postal_code, return_country_code, return_residential_indicator,
              instructions, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `, [
            storeId, warehouse.warehouse_id, warehouse.name, warehouse.company_name, warehouse.origin_address?.phone || '', warehouse.email, warehouse.is_default || false,
            warehouse.origin_address?.address_line1, warehouse.origin_address?.address_line2, warehouse.origin_address?.address_line3,
            warehouse.origin_address?.city_locality, warehouse.origin_address?.state_province, warehouse.origin_address?.postal_code,
            warehouse.origin_address?.country_code, warehouse.origin_address?.address_residential_indicator,
            warehouse.return_address?.address_line1, warehouse.return_address?.address_line2, warehouse.return_address?.address_line3,
            warehouse.return_address?.city_locality, warehouse.return_address?.state_province, warehouse.return_address?.postal_code,
            warehouse.return_address?.country_code, warehouse.return_address?.address_residential_indicator,
            warehouse.instructions
          ]);
          result.addedCount++;
        }
      } catch (error) {
        console.error(`Error syncing warehouse ${warehouse.warehouse_id}:`, error);
        // Continue with next warehouse
      }
    }

    console.log(`Warehouse sync completed: ${result.totalCount} total, ${result.addedCount} added, ${result.updatedCount} updated`);

  } catch (error) {
    console.error('Error fetching warehouses from ShipStation:', error);
    throw error;
  }

  return result;
}