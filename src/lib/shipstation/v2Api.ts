/**
 * ShipStation V2 Platform API Service
 * Handles shipment creation using the new V2 API
 */

import { db } from '@/lib/database/connection';

/**
 * V2 API credentials interface
 */
interface ShipStationV2Credentials {
  apiKey: string;
  storeId: string;
  isActive: boolean;
  shipFromAddress?: ShipFromAddress;
}

/**
 * Ship from address interface
 */
interface ShipFromAddress {
  name: string;
  phone: string;
  email?: string;
  company_name?: string;
  address_line1: string;
  address_line2?: string;
  address_line3?: string;
  city_locality: string;
  state_province: string;
  postal_code: string;
  country_code: string;
  address_residential_indicator: 'yes' | 'no' | 'unknown';
  instructions?: string;
}

/**
 * Shipment item interface for V2 API
 */
interface ShipmentItem {
  name: string;
  sku?: string;
  quantity: number;
  unit_price?: number;
  external_order_item_id?: string;
}


/**
 * V2 Shipment request interface (simplified)
 */
interface CreateShipmentRequest {
  shipments: [{
    external_shipment_id: string;
    ship_to: {
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
    };
    ship_from: ShipFromAddress;
    items?: ShipmentItem[];
    amount_paid?: {
      currency: string;
      amount: number;
    };
    shipping_paid?: {
      currency: string;
      amount: number;
    };
  }];
}

/**
 * V2 Shipment response interface
 */
interface CreateShipmentResponse {
  has_errors: boolean;
  shipments: [{
    shipment_id: string;
    external_shipment_id: string;
    shipment_status: string;
    created_at: string;
    modified_at: string;
    errors?: string[];
  }];
}

/**
 * Order data input interface (from existing order flow)
 */
interface OrderDataInput {
  items: Array<{
    product_id: string | number;
    name: string;
    price: number;
    quantity: number;
    thumbnail_url: string;
  }>;
  shippingAddress: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  shippingMethod: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  storeId?: string;
}

/**
 * Get default warehouse from database
 */
async function getDefaultWarehouse(storeId: string): Promise<ShipFromAddress | null> {
  try {
    // First try to get the warehouse marked as default
    const result = await db.query(
      `SELECT 
        name, phone, email, company_name,
        origin_address_line1, origin_address_line2, origin_address_line3,
        origin_city_locality, origin_state_province, origin_postal_code, 
        origin_country_code, origin_residential_indicator,
        instructions
      FROM shipfroms 
      WHERE store_id = $1 AND is_default = true
      LIMIT 1`,
      [storeId]
    );

    if (result.rows.length === 0) {
      // If no default warehouse, get the first one
      const fallbackResult = await db.query(
        `SELECT 
          name, phone, email, company_name,
          origin_address_line1, origin_address_line2, origin_address_line3,
          origin_city_locality, origin_state_province, origin_postal_code, 
          origin_country_code, origin_residential_indicator,
          instructions
        FROM shipfroms 
        WHERE store_id = $1
        ORDER BY created_at ASC
        LIMIT 1`,
        [storeId]
      );
      
      if (fallbackResult.rows.length === 0) {
        return null;
      }
      
      const warehouse = fallbackResult.rows[0];
      return {
        name: warehouse.name || 'Warehouse',
        phone: warehouse.phone || '',
        email: warehouse.email || '',
        company_name: warehouse.company_name || '',
        address_line1: warehouse.origin_address_line1 || '',
        address_line2: warehouse.origin_address_line2 || '',
        address_line3: warehouse.origin_address_line3 || '',
        city_locality: warehouse.origin_city_locality || '',
        state_province: warehouse.origin_state_province || '',
        postal_code: warehouse.origin_postal_code || '',
        country_code: warehouse.origin_country_code || 'US',
        address_residential_indicator: warehouse.origin_residential_indicator as 'yes' | 'no' | 'unknown' || 'unknown',
        instructions: warehouse.instructions || ''
      };
    }

    const warehouse = result.rows[0];
    return {
      name: warehouse.name || 'Warehouse',
      phone: warehouse.phone || '',
      email: warehouse.email || '',
      company_name: warehouse.company_name || '',
      address_line1: warehouse.origin_address_line1 || '',
      address_line2: warehouse.origin_address_line2 || '',
      address_line3: warehouse.origin_address_line3 || '',
      city_locality: warehouse.origin_city_locality || '',
      state_province: warehouse.origin_state_province || '',
      postal_code: warehouse.origin_postal_code || '',
      country_code: warehouse.origin_country_code || 'US',
      address_residential_indicator: warehouse.origin_residential_indicator as 'yes' | 'no' | 'unknown' || 'unknown',
      instructions: warehouse.instructions || ''
    };
  } catch (error) {
    console.error('Error getting default warehouse:', error);
    return null;
  }
}

/**
 * Get ShipStation V2 credentials for a store
 */
export async function getShipStationV2Credentials(storeId: string): Promise<ShipStationV2Credentials | null> {
  try {
    const result = await db.query(
      `SELECT 
        api_key_encrypted,
        configuration,
        is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipstation' AND is_active = true`,
      [storeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const integration = result.rows[0];
    
    // Decrypt API key (using same method as current system)
    const apiKey = Buffer.from(integration.api_key_encrypted, 'base64').toString('utf-8');
    
    // Debug logging for API key
    console.log('ShipStation V2 API Key Debug:', {
      encrypted_length: integration.api_key_encrypted.length,
      decrypted_length: apiKey.length,
      first_6_chars: apiKey.substring(0, 6),
      last_4_chars: apiKey.substring(apiKey.length - 4)
    });
    
    // Parse configuration for ship_from address and other settings
    const config = integration.configuration as Record<string, unknown> || {};
    
    return {
      apiKey,
      storeId,
      isActive: integration.is_active,
      shipFromAddress: config.shipFromAddress as ShipFromAddress
    };
  } catch (error) {
    console.error('Error getting ShipStation V2 credentials:', error);
    return null;
  }
}

/**
 * Transform order data to V2 shipment format
 */
export async function transformToV2Shipment(
  orderData: OrderDataInput,
  orderNumber: string,
  credentials: ShipStationV2Credentials
): Promise<CreateShipmentRequest> {
  // Create shipment items (simplified - no packages needed)
  const items: ShipmentItem[] = orderData.items.map(item => ({
    name: item.name,
    sku: String(item.product_id),
    quantity: item.quantity,
    unit_price: item.price,
    external_order_item_id: `${orderNumber}-${item.product_id}`
  }));

  // Get stored warehouse data or use configured shipFromAddress
  let shipFromAddress = credentials.shipFromAddress;
  
  if (!shipFromAddress && orderData.storeId) {
    shipFromAddress = await getDefaultWarehouse(orderData.storeId);
  }
  
  // Default ship_from address if not configured and no warehouse found
  const defaultShipFrom: ShipFromAddress = {
    name: 'Fulfillment Center',
    phone: '000-000-0000', // Placeholder - should be configured in ShipStation
    email: 'fulfillment@example.com',
    company_name: 'Your Company',
    address_line1: '123 Warehouse St',
    city_locality: 'Anytown',
    state_province: 'CA',
    postal_code: '12345',
    country_code: 'US',
    address_residential_indicator: 'no'
  };

  const finalShipFrom = shipFromAddress || defaultShipFrom;
  
  console.log('ShipStation V2 ShipFrom Debug:', {
    shipFromAddress: shipFromAddress ? 'loaded from DB' : 'null',
    finalShipFrom: {
      name: finalShipFrom.name,
      phone: finalShipFrom.phone,
      address: finalShipFrom.address_line1
    }
  });

  console.log('ShipStation V2 ShipTo Debug:', {
    phone: orderData.shippingAddress.phone,
    name: `${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}`
  });

  return {
    shipments: [{
      external_shipment_id: orderNumber,
      ship_to: {
        name: `${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}`,
        phone: orderData.shippingAddress.phone,
        email: orderData.shippingAddress.email,
        address_line1: orderData.shippingAddress.address,
        city_locality: orderData.shippingAddress.city,
        state_province: orderData.shippingAddress.state,
        postal_code: orderData.shippingAddress.zipCode,
        country_code: 'US',
        address_residential_indicator: 'unknown'
      },
      ship_from: finalShipFrom,
      items,
      amount_paid: {
        currency: 'USD',
        amount: orderData.total
      },
      shipping_paid: {
        currency: 'USD',
        amount: orderData.shippingCost
      }
    }]
  };
}

/**
 * Create shipment using V2 API
 */
export async function createShipment(
  credentials: ShipStationV2Credentials,
  shipmentData: CreateShipmentRequest
): Promise<{ success: boolean; data?: CreateShipmentResponse['shipments'][0]; error?: string }> {
  try {
    console.log('Creating shipment with V2 API:', {
      external_shipment_id: shipmentData.shipments[0].external_shipment_id,
      ship_to_name: shipmentData.shipments[0].ship_to.name,
      items_count: shipmentData.shipments[0].items?.length || 0
    });

    console.log('ShipStation V2 Full Payload:', JSON.stringify(shipmentData, null, 2));

    // Debug API key being sent
    console.log('ShipStation V2 API Request Debug:', {
      api_key_length: credentials.apiKey.length,
      api_key_first_6: credentials.apiKey.substring(0, 6),
      api_key_last_4: credentials.apiKey.substring(credentials.apiKey.length - 4),
      headers_sent: {
        'Content-Type': 'application/json',
        'api-key': credentials.apiKey.substring(0, 6) + '...' + credentials.apiKey.substring(credentials.apiKey.length - 4)
      }
    });

    const response = await fetch('https://api.shipstation.com/v2/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': credentials.apiKey
      },
      body: JSON.stringify(shipmentData)
    });

    const responseText = await response.text();
    console.log('ShipStation V2 API response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      console.error(`ShipStation V2 API error: ${response.status} - ${responseText}`);
      return {
        success: false,
        error: `ShipStation V2 API error: ${response.status} - ${responseText}`
      };
    }

    const responseData: CreateShipmentResponse = JSON.parse(responseText);

    // Check for errors in response
    if (responseData.has_errors || (responseData.shipments[0].errors && responseData.shipments[0].errors.length > 0)) {
      const errors = responseData.shipments[0].errors || ['Unknown error'];
      console.error('ShipStation V2 shipment creation failed:', errors);
      return {
        success: false,
        error: `Shipment creation failed: ${errors.join(', ')}`
      };
    }

    console.log('ShipStation V2 shipment created successfully:', {
      shipment_id: responseData.shipments[0].shipment_id,
      external_shipment_id: responseData.shipments[0].external_shipment_id,
      status: responseData.shipments[0].shipment_status
    });

    return {
      success: true,
      data: {
        shipment_id: responseData.shipments[0].shipment_id,
        external_shipment_id: responseData.shipments[0].external_shipment_id,
        shipment_status: responseData.shipments[0].shipment_status,
        created_at: responseData.shipments[0].created_at
      }
    };

  } catch (error) {
    console.error('Error creating ShipStation V2 shipment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Test ShipStation V2 API credentials
 */
export async function testShipStationV2Credentials(credentials: ShipStationV2Credentials): Promise<{ success: boolean; error?: string }> {
  try {
    // Test with a simple GET request to verify credentials
    const response = await fetch('https://api.shipstation.com/v2/carriers', {
      method: 'GET',
      headers: {
        'api-key': credentials.apiKey
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Invalid API credentials: ${response.status} ${response.statusText}`
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error testing ShipStation V2 credentials:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}