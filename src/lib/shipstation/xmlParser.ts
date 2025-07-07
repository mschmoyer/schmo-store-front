/**
 * XML Parser service for ShipStation integration
 * Parses incoming XML from ShipStation webhooks and notifications
 */

import { parseString } from 'xml2js';
import { parseShipStationDate, mapShipStationStatusToInternal } from './utils';
import { Address, Order } from '@/lib/types/database';

/**
 * Interface for ShipStation shipment notification data
 */
export interface ShipmentNotificationData {
  orderId: string;
  orderNumber: string;
  shipmentId?: string;
  trackingNumber?: string;
  carrierCode?: string;
  serviceCode?: string;
  packageCode?: string;
  shipDate?: Date;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  shipmentCost?: number;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    units: string;
  };
  shipTo?: Address;
  labelUrl?: string;
  formUrl?: string;
  deliveryConfirmation?: string;
  signatureRequired?: boolean;
  adultSignature?: boolean;
  insuranceCost?: number;
  voidIndicator?: boolean;
  voidDate?: Date;
  createDate?: Date;
  notifyErrorMessage?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  internalNotes?: string;
  customerNotes?: string;
  giftNotes?: string;
  giftMessage?: boolean;
  requestedShippingService?: string;
  holdUntilDate?: Date;
}

/**
 * Interface for parsed ShipStation order data
 */
export interface ParsedOrderData {
  orderNumber: string;
  orderDate: Date;
  orderStatus: Order['status'];
  lastModified: Date;
  shippingMethod?: string;
  paymentMethod?: string;
  orderTotal: number;
  taxAmount?: number;
  shippingAmount?: number;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customerCode?: string;
  customerEmail?: string;
  billTo?: Address;
  shipTo?: Address;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productId?: string;
    imageUrl?: string;
    weight?: number;
    weightUnits?: string;
    location?: string;
    warehouseLocation?: string;
    options?: string;
    fulfillmentSku?: string;
  }>;
  notes?: string;
  source?: string;
}

/**
 * Parse ShipStation shipment notification XML
 * @param xmlData - XML string from ShipStation
 * @returns Promise<ShipmentNotificationData>
 */
export async function parseShipmentNotification(xmlData: string): Promise<ShipmentNotificationData> {
  return new Promise((resolve, reject) => {
    parseString(xmlData, { explicitArray: false, ignoreAttrs: false }, (err, result) => {
      if (err) {
        reject(new Error(`XML parsing error: ${err.message}`));
        return;
      }
      
      try {
        const notification = extractShipmentData(result);
        resolve(notification);
      } catch (parseError) {
        reject(new Error(`Data extraction error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
      }
    });
  });
}

/**
 * Parse ShipStation order XML
 * @param xmlData - XML string from ShipStation
 * @returns Promise<ParsedOrderData[]>
 */
export async function parseOrderXML(xmlData: string): Promise<ParsedOrderData[]> {
  return new Promise((resolve, reject) => {
    parseString(xmlData, { explicitArray: false, ignoreAttrs: false }, (err, result) => {
      if (err) {
        reject(new Error(`XML parsing error: ${err.message}`));
        return;
      }
      
      try {
        const orders = extractOrdersData(result);
        resolve(orders);
      } catch (parseError) {
        reject(new Error(`Data extraction error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
      }
    });
  });
}

/**
 * Extract shipment data from parsed XML
 * @param parsedXML - Parsed XML object
 * @returns ShipmentNotificationData
 */
function extractShipmentData(parsedXML: Record<string, unknown>): ShipmentNotificationData {
  const shipment = parsedXML.ShipmentNotification || parsedXML.ShipmentUpdate || parsedXML.Shipment;
  
  if (!shipment) {
    throw new Error('No shipment data found in XML');
  }
  
  const notification: ShipmentNotificationData = {
    orderId: safeGetString(shipment.OrderId) || safeGetString(shipment.OrderNumber),
    orderNumber: safeGetString(shipment.OrderNumber),
    shipmentId: safeGetString(shipment.ShipmentId),
    trackingNumber: safeGetString(shipment.TrackingNumber),
    carrierCode: safeGetString(shipment.CarrierCode),
    serviceCode: safeGetString(shipment.ServiceCode),
    packageCode: safeGetString(shipment.PackageCode),
    labelUrl: safeGetString(shipment.LabelUrl),
    formUrl: safeGetString(shipment.FormUrl),
    deliveryConfirmation: safeGetString(shipment.DeliveryConfirmation),
    signatureRequired: safeGetBoolean(shipment.SignatureRequired),
    adultSignature: safeGetBoolean(shipment.AdultSignature),
    voidIndicator: safeGetBoolean(shipment.VoidIndicator),
    giftMessage: safeGetBoolean(shipment.GiftMessage),
    customField1: safeGetString(shipment.CustomField1),
    customField2: safeGetString(shipment.CustomField2),
    customField3: safeGetString(shipment.CustomField3),
    internalNotes: safeGetString(shipment.InternalNotes),
    customerNotes: safeGetString(shipment.CustomerNotes),
    giftNotes: safeGetString(shipment.GiftNotes),
    requestedShippingService: safeGetString(shipment.RequestedShippingService),
    notifyErrorMessage: safeGetString(shipment.NotifyErrorMessage)
  };
  
  // Parse dates
  if (shipment.ShipDate) {
    notification.shipDate = parseShipStationDate(safeGetString(shipment.ShipDate));
  }
  
  if (shipment.CreateDate) {
    notification.createDate = parseShipStationDate(safeGetString(shipment.CreateDate));
  }
  
  if (shipment.EstimatedDeliveryDate) {
    notification.estimatedDeliveryDate = parseShipStationDate(safeGetString(shipment.EstimatedDeliveryDate));
  }
  
  if (shipment.ActualDeliveryDate) {
    notification.actualDeliveryDate = parseShipStationDate(safeGetString(shipment.ActualDeliveryDate));
  }
  
  if (shipment.VoidDate) {
    notification.voidDate = parseShipStationDate(safeGetString(shipment.VoidDate));
  }
  
  if (shipment.HoldUntilDate) {
    notification.holdUntilDate = parseShipStationDate(safeGetString(shipment.HoldUntilDate));
  }
  
  // Parse numeric values
  if (shipment.ShipmentCost) {
    notification.shipmentCost = parseFloat(safeGetString(shipment.ShipmentCost)) * 100; // Convert to cents
  }
  
  if (shipment.InsuranceCost) {
    notification.insuranceCost = parseFloat(safeGetString(shipment.InsuranceCost)) * 100; // Convert to cents
  }
  
  if (shipment.Weight) {
    notification.weight = parseFloat(safeGetString(shipment.Weight));
  }
  
  // Parse dimensions
  if (shipment.Dimensions) {
    const dims = shipment.Dimensions;
    notification.dimensions = {
      length: parseFloat(safeGetString(dims.Length)) || 0,
      width: parseFloat(safeGetString(dims.Width)) || 0,
      height: parseFloat(safeGetString(dims.Height)) || 0,
      units: safeGetString(dims.Units) || 'inches'
    };
  }
  
  // Parse shipping address
  if (shipment.ShipTo) {
    notification.shipTo = parseAddress(shipment.ShipTo);
  }
  
  return notification;
}

/**
 * Extract orders data from parsed XML
 * @param parsedXML - Parsed XML object
 * @returns ParsedOrderData[]
 */
function extractOrdersData(parsedXML: Record<string, unknown>): ParsedOrderData[] {
  const ordersRoot = parsedXML.Orders || parsedXML.Order || parsedXML;
  let orders: Record<string, unknown>[] = [];
  
  if (ordersRoot.Order) {
    orders = Array.isArray(ordersRoot.Order) ? ordersRoot.Order : [ordersRoot.Order];
  } else if (Array.isArray(ordersRoot)) {
    orders = ordersRoot;
  } else if (ordersRoot.OrderNumber) {
    orders = [ordersRoot];
  }
  
  return orders.map(order => extractOrderData(order));
}

/**
 * Extract single order data from parsed XML
 * @param orderXML - Single order XML object
 * @returns ParsedOrderData
 */
function extractOrderData(orderXML: Record<string, unknown>): ParsedOrderData {
  const order: ParsedOrderData = {
    orderNumber: safeGetString(orderXML.OrderNumber),
    orderDate: parseShipStationDate(safeGetString(orderXML.OrderDate)),
    orderStatus: mapShipStationStatusToInternal(safeGetString(orderXML.OrderStatus)),
    lastModified: parseShipStationDate(safeGetString(orderXML.LastModified)),
    shippingMethod: safeGetString(orderXML.ShippingMethod),
    paymentMethod: safeGetString(orderXML.PaymentMethod),
    orderTotal: parseFloat(safeGetString(orderXML.OrderTotal)) * 100, // Convert to cents
    taxAmount: parseFloat(safeGetString(orderXML.TaxAmount)) * 100,
    shippingAmount: parseFloat(safeGetString(orderXML.ShippingAmount)) * 100,
    customField1: safeGetString(orderXML.CustomField1),
    customField2: safeGetString(orderXML.CustomField2),
    customField3: safeGetString(orderXML.CustomField3),
    notes: safeGetString(orderXML.Notes),
    source: safeGetString(orderXML.Source),
    items: []
  };
  
  // Parse customer data
  if (orderXML.Customer) {
    const customer = orderXML.Customer;
    order.customerCode = safeGetString(customer.CustomerCode);
    order.customerEmail = safeGetString(customer.CustomerCode); // Usually the email
    
    if (customer.BillTo) {
      order.billTo = parseAddress(customer.BillTo);
    }
    
    if (customer.ShipTo) {
      order.shipTo = parseAddress(customer.ShipTo);
    }
  }
  
  // Parse items
  if (orderXML.Items && orderXML.Items.Item) {
    const items = Array.isArray(orderXML.Items.Item) ? orderXML.Items.Item : [orderXML.Items.Item];
    order.items = items.map(parseOrderItem);
  }
  
  return order;
}

/**
 * Parse order item from XML
 * @param itemXML - Item XML object
 * @returns Parsed item object
 */
function parseOrderItem(itemXML: Record<string, unknown>): Record<string, unknown> {
  return {
    sku: safeGetString(itemXML.SKU),
    name: safeGetString(itemXML.Name),
    quantity: parseInt(safeGetString(itemXML.Quantity)) || 1,
    unitPrice: parseFloat(safeGetString(itemXML.UnitPrice)) * 100, // Convert to cents
    totalPrice: parseFloat(safeGetString(itemXML.TotalPrice)) * 100, // Convert to cents
    productId: safeGetString(itemXML.ProductId),
    imageUrl: safeGetString(itemXML.ImageUrl),
    weight: parseFloat(safeGetString(itemXML.Weight)) || 0,
    weightUnits: safeGetString(itemXML.WeightUnits),
    location: safeGetString(itemXML.Location),
    warehouseLocation: safeGetString(itemXML.WarehouseLocation),
    options: safeGetString(itemXML.Options),
    fulfillmentSku: safeGetString(itemXML.FulfillmentSku)
  };
}

/**
 * Parse address from XML
 * @param addressXML - Address XML object
 * @returns Address object
 */
function parseAddress(addressXML: Record<string, unknown>): Address {
  return {
    street: safeGetString(addressXML.Address1),
    city: safeGetString(addressXML.City),
    state: safeGetString(addressXML.State),
    postal_code: safeGetString(addressXML.PostalCode),
    country: safeGetString(addressXML.Country),
    company: safeGetString(addressXML.Company),
    phone: safeGetString(addressXML.Phone)
  };
}

/**
 * Safely get string value from XML node
 * @param node - XML node
 * @returns String value or empty string
 */
function safeGetString(node: unknown): string {
  if (node === null || node === undefined) {
    return '';
  }
  
  if (typeof node === 'string') {
    return node.trim();
  }
  
  if (typeof node === 'object' && node._) {
    return String(node._).trim();
  }
  
  return String(node).trim();
}

/**
 * Safely get boolean value from XML node
 * @param node - XML node
 * @returns Boolean value or false
 */
function safeGetBoolean(node: unknown): boolean {
  const value = safeGetString(node).toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Validate parsed shipment notification data
 * @param notification - Parsed notification data
 * @returns Validation result
 */
export function validateShipmentNotification(notification: ShipmentNotificationData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!notification.orderId && !notification.orderNumber) {
    errors.push('Order ID or Order Number is required');
  }
  
  if (!notification.trackingNumber && !notification.shipmentId) {
    errors.push('Tracking Number or Shipment ID is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Parse ShipStation webhook payload
 * @param payload - JSON webhook payload
 * @returns Parsed webhook data
 */
export function parseWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    resourceUrl: payload.resource_url,
    resourceType: payload.resource_type,
    resourceId: payload.resource_id,
    orderId: payload.order_id,
    shipmentId: payload.shipment_id,
    trackingNumber: payload.tracking_number,
    carrierCode: payload.carrier_code,
    serviceCode: payload.service_code,
    packageCode: payload.package_code,
    shipDate: payload.ship_date ? new Date(payload.ship_date) : undefined,
    deliveredDate: payload.delivered_date ? new Date(payload.delivered_date) : undefined,
    trackingStatus: payload.tracking_status,
    estimatedDeliveryDate: payload.estimated_delivery_date ? new Date(payload.estimated_delivery_date) : undefined,
    actualDeliveryDate: payload.actual_delivery_date ? new Date(payload.actual_delivery_date) : undefined,
    shipmentCost: payload.shipment_cost ? parseFloat(payload.shipment_cost) * 100 : undefined,
    weight: payload.weight ? parseFloat(payload.weight) : undefined,
    dimensions: payload.dimensions,
    labelUrl: payload.label_url,
    formUrl: payload.form_url,
    deliveryConfirmation: payload.delivery_confirmation,
    signatureRequired: payload.signature_required,
    adultSignature: payload.adult_signature,
    shipTo: payload.ship_to,
    createdAt: payload.created_at ? new Date(payload.created_at) : new Date()
  };
}