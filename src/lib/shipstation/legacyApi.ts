import { db } from '@/lib/database/connection';

interface ShipStationCredentials {
  apiKey: string;
  apiSecret: string;
}

interface ShipStationOrderItem {
  lineItemKey?: string;
  sku: string;
  name: string;
  imageUrl?: string;
  weight: {
    value: number;
    units: string;
  };
  quantity: number;
  unitPrice: number;
  taxAmount?: number;
  shippingAmount?: number;
  warehouseLocation?: string;
  options?: Array<{
    name: string;
    value: string;
  }>;
  productId?: number;
  fulfillmentSku?: string;
  adjustment: boolean;
  upc?: string;
}

interface ShipStationOrder {
  orderNumber: string;
  orderKey: string;
  orderDate: string;
  paymentDate: string;
  shipByDate?: string;
  orderStatus: string;
  customerId?: number;
  customerUsername: string;
  customerEmail: string;
  billTo?: {
    name: string;
    company?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    residential?: boolean;
  };
  shipTo: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    street3?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone?: string;
    residential: boolean;
  };
  items: ShipStationOrderItem[];
  amountPaid: number;
  taxAmount: number;
  shippingAmount: number;
  customerNotes?: string;
  internalNotes?: string;
  gift?: boolean;
  giftMessage?: string;
  paymentMethod?: string;
  requestedShippingService?: string;
  carrierCode?: string;
  serviceCode?: string;
  packageCode?: string;
  confirmation?: string;
  shipDate?: string;
  weight?: {
    value: number;
    units: string;
  };
  dimensions?: {
    units: string;
    length: number;
    width: number;
    height: number;
  };
  insuranceOptions?: {
    provider: string;
    insureShipment: boolean;
    insuredValue: number;
  };
  internationalOptions?: {
    contents?: string;
    customsItems?: Record<string, unknown>[];
  };
  advancedOptions?: {
    warehouseId?: number;
    nonMachinable?: boolean;
    saturdayDelivery?: boolean;
    containsAlcohol?: boolean;
    mergedOrSplit?: boolean;
    mergedIds?: string[];
    parentId?: number;
    storeId?: number;
    customField1?: string;
    customField2?: string;
    customField3?: string;
    source?: string;
    billToParty?: string;
    billToAccount?: string;
    billToPostalCode?: string;
    billToCountryCode?: string;
  };
  tagIds?: number[];
}

/**
 * Get ShipStation Legacy API credentials for a store
 */
export async function getShipStationCredentials(storeId: string): Promise<ShipStationCredentials | null> {
  try {
    const result = await db.query(`
      SELECT api_key_encrypted, api_secret_encrypted, is_active
      FROM store_integrations 
      WHERE store_id = $1 AND integration_type = 'shipstation' AND is_active = true
    `, [storeId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const integration = result.rows[0];
    
    // Decrypt credentials (using base64 for now, should use proper encryption in production)
    const apiKey = Buffer.from(integration.api_key_encrypted, 'base64').toString('utf-8');
    const apiSecret = Buffer.from(integration.api_secret_encrypted, 'base64').toString('utf-8');
    
    return { apiKey, apiSecret };
  } catch (error) {
    console.error('Error retrieving ShipStation credentials:', error);
    return null;
  }
}

/**
 * Create Basic Auth header for ShipStation Legacy API
 */
export function createShipStationAuthHeader(apiKey: string, apiSecret: string): string {
  const credentials = `${apiKey}:${apiSecret}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
}

/**
 * Create an order in ShipStation Legacy API
 */
export async function createShipStationOrder(
  credentials: ShipStationCredentials,
  orderData: ShipStationOrder
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const authHeader = createShipStationAuthHeader(credentials.apiKey, credentials.apiSecret);
    
    console.log('Creating ShipStation Legacy API order:', {
      orderNumber: orderData.orderNumber,
      customerEmail: orderData.customerEmail,
      itemCount: orderData.items.length,
      total: orderData.amountPaid
    });
    
    const response = await fetch('https://ssapi.shipstation.com/orders/createorder', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });
    
    console.log(`ShipStation Legacy API response: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('ShipStation Legacy API order created successfully:', data);
      return { success: true, data };
    } else {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: await response.text() };
      }
      
      console.error('ShipStation Legacy API error:', errorData);
      
      return {
        success: false,
        error: errorData?.message || errorData?.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }
  } catch (error) {
    console.error('ShipStation Legacy API request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

interface OrderDataInput {
  items: Array<{
    product_id: string | number;
    name: string;
    price: number;
    quantity: number;
    thumbnail_url?: string;
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
  shippingMethod?: string;
  shippingCost?: number;
  total: number;
}

/**
 * Transform order data from our format to ShipStation format
 */
export function transformToShipStationOrder(
  orderData: OrderDataInput,
  orderNumber: string,
  storeId: string
): ShipStationOrder {
  const orderDate = new Date().toISOString();
  const shipByDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now
  
  // Calculate total weight (estimate based on item count)
  const totalWeight = orderData.items.reduce((total: number, item) => total + (item.quantity * 0.5), 0); // 0.5 lb per item estimate
  
  return {
    orderNumber,
    orderKey: `${orderNumber}-${Date.now()}`,
    orderDate,
    paymentDate: orderDate,
    shipByDate,
    orderStatus: 'awaiting_shipment',
    customerUsername: orderData.shippingAddress.email,
    customerEmail: orderData.shippingAddress.email,
    billTo: {
      name: `${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}`,
      street1: orderData.shippingAddress.address,
      city: orderData.shippingAddress.city,
      state: orderData.shippingAddress.state,
      postalCode: orderData.shippingAddress.zipCode,
      country: 'US',
      phone: orderData.shippingAddress.phone,
      residential: true
    },
    shipTo: {
      name: `${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}`,
      street1: orderData.shippingAddress.address,
      city: orderData.shippingAddress.city,
      state: orderData.shippingAddress.state,
      postalCode: orderData.shippingAddress.zipCode,
      country: 'US',
      phone: orderData.shippingAddress.phone,
      residential: true
    },
    items: orderData.items.map((item, index: number) => ({
      lineItemKey: `${orderNumber}-item-${index + 1}`,
      sku: item.product_id.toString(),
      name: item.name,
      imageUrl: item.thumbnail_url || null,
      weight: {
        value: 0.5 * item.quantity, // Estimate 0.5 lb per item
        units: 'pounds'
      },
      quantity: item.quantity,
      unitPrice: item.price,
      taxAmount: 0,
      shippingAmount: 0,
      productId: typeof item.product_id === 'number' ? item.product_id : parseInt(item.product_id) || undefined,
      adjustment: false
    })),
    amountPaid: orderData.total,
    taxAmount: 0,
    shippingAmount: orderData.shippingCost || 0,
    customerNotes: '',
    internalNotes: `Order created via Schmo Store (Store ID: ${storeId})`,
    gift: false,
    paymentMethod: 'Online Payment',
    requestedShippingService: orderData.shippingMethod || 'Standard',
    packageCode: 'package',
    weight: {
      value: Math.max(totalWeight, 0.1), // Minimum 0.1 lb
      units: 'pounds'
    },
    dimensions: {
      units: 'inches',
      length: 12,
      width: 9,
      height: 3
    },
    advancedOptions: {
      source: 'Schmo Store',
      customField1: `Store ID: ${storeId}`,
      customField2: `Order Date: ${new Date().toLocaleDateString()}`,
      customField3: 'Created via Schmo Store Legacy API Integration'
    }
  };
}