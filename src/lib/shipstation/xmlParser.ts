/**
 * XML Parser service for ShipStation integration
 * Parses incoming XML from ShipStation webhooks and notifications
 */

import { parseString } from 'xml2js';
import { parseShipStationDate, mapShipStationStatusToInternal } from './utils';
import { Address, Order } from '@/lib/types/database';
import {
  XmlNode,
  getXmlChild,
  toXmlNodeArray,
  safeGetString,
  safeGetBoolean,
} from './xmlTypes';

/** A single line item on a parsed ShipStation order. */
export type ParsedOrderItem = ParsedOrderData['items'][number];

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
function extractShipmentData(parsedXML: XmlNode): ShipmentNotificationData {
  // `<ShipNotice>` is the root the Custom Store spec defines and the one real
  // ShipStation shipnotify calls send. The others are shapes this parser has
  // accepted historically and are kept so nothing that already worked breaks.
  const shipment =
    getXmlChild(parsedXML, 'ShipNotice') ??
    getXmlChild(parsedXML, 'ShipmentNotification') ??
    getXmlChild(parsedXML, 'ShipmentUpdate') ??
    getXmlChild(parsedXML, 'Shipment');

  if (!shipment) {
    throw new Error('No shipment data found in XML. Expected a <ShipNotice> root element.');
  }

  // The spec spells these `OrderID`, `Carrier` and `Service`; the legacy names
  // are read as fallbacks so both payload dialects parse.
  const notification: ShipmentNotificationData = {
    orderId:
      safeGetString(shipment.OrderID) ||
      safeGetString(shipment.OrderId) ||
      safeGetString(shipment.OrderNumber),
    orderNumber: safeGetString(shipment.OrderNumber),
    shipmentId: safeGetString(shipment.ShipmentId),
    trackingNumber: safeGetString(shipment.TrackingNumber),
    carrierCode: safeGetString(shipment.Carrier) || safeGetString(shipment.CarrierCode),
    serviceCode: safeGetString(shipment.Service) || safeGetString(shipment.ServiceCode),
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
  
  // The spec calls this `LabelCreateDate`; `CreateDate` is the legacy spelling.
  if (shipment.LabelCreateDate) {
    notification.createDate = parseShipStationDate(safeGetString(shipment.LabelCreateDate));
  } else if (shipment.CreateDate) {
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
  // `<ShippingCost>` is the spec's name; `<ShipmentCost>` is the legacy one.
  // These stay in decimal dollars: they are written to `orders.shipment_cost`,
  // a DECIMAL(10,2) dollars column, so scaling to cents stored 4.95 as 495.00.
  const shippingCost = shipment.ShippingCost ?? shipment.ShipmentCost;
  if (shippingCost !== undefined) {
    const parsed = parseFloat(safeGetString(shippingCost));
    if (Number.isFinite(parsed)) {
      notification.shipmentCost = parsed;
    }
  }

  if (shipment.InsuranceCost) {
    const parsed = parseFloat(safeGetString(shipment.InsuranceCost));
    if (Number.isFinite(parsed)) {
      notification.insuranceCost = parsed;
    }
  }
  
  if (shipment.Weight) {
    notification.weight = parseFloat(safeGetString(shipment.Weight));
  }
  
  // Parse dimensions
  const dims = getXmlChild(shipment, 'Dimensions');
  if (dims) {
    notification.dimensions = {
      length: parseFloat(safeGetString(dims.Length)) || 0,
      width: parseFloat(safeGetString(dims.Width)) || 0,
      height: parseFloat(safeGetString(dims.Height)) || 0,
      units: safeGetString(dims.Units) || 'inches'
    };
  }
  
  // Parse shipping address
  // The spec names the destination `<Recipient>`; `<ShipTo>` is the legacy name.
  const shipTo = getXmlChild(shipment, 'Recipient') ?? getXmlChild(shipment, 'ShipTo');
  if (shipTo) {
    notification.shipTo = parseAddress(shipTo);
  }
  
  return notification;
}

/**
 * Extract orders data from parsed XML
 * @param parsedXML - Parsed XML object
 * @returns ParsedOrderData[]
 */
function extractOrdersData(parsedXML: XmlNode): ParsedOrderData[] {
  const ordersRoot = getXmlChild(parsedXML, 'Orders') ?? getXmlChild(parsedXML, 'Order') ?? parsedXML;
  let orders: XmlNode[] = [];

  if (ordersRoot.Order !== undefined) {
    orders = toXmlNodeArray(ordersRoot.Order);
  } else if (ordersRoot.OrderNumber !== undefined) {
    orders = [ordersRoot];
  }

  return orders.map(order => extractOrderData(order));
}

/**
 * Extract single order data from parsed XML
 * @param orderXML - Single order XML object
 * @returns ParsedOrderData
 */
function extractOrderData(orderXML: XmlNode): ParsedOrderData {
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
  const customer = getXmlChild(orderXML, 'Customer');
  if (customer) {
    order.customerCode = safeGetString(customer.CustomerCode);
    order.customerEmail = safeGetString(customer.CustomerCode); // Usually the email

    const billTo = getXmlChild(customer, 'BillTo');
    if (billTo) {
      order.billTo = parseAddress(billTo);
    }

    const shipTo = getXmlChild(customer, 'ShipTo');
    if (shipTo) {
      order.shipTo = parseAddress(shipTo);
    }
  }
  
  // Parse items
  const itemsNode = getXmlChild(orderXML, 'Items');
  if (itemsNode && itemsNode.Item !== undefined) {
    order.items = toXmlNodeArray(itemsNode.Item).map(parseOrderItem);
  }
  
  return order;
}

/**
 * Parse order item from XML
 * @param itemXML - Item XML object
 * @returns Parsed item object
 */
function parseOrderItem(itemXML: XmlNode): ParsedOrderItem {
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
function parseAddress(addressXML: XmlNode): Address {
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
 * Validate parsed shipment notification data
 * @param notification - Parsed notification data
 * @returns Validation result
 */
export function validateShipmentNotification(notification: ShipmentNotificationData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!notification.orderId && !notification.orderNumber) {
    errors.push('Order ID or Order Number is required');
  }

  // A tracking number is deliberately NOT required. "Mark as Shipped" in
  // ShipStation, and carriers that supply no tracking, both send a ShipNotice
  // without one. Rejecting those returned a non-2xx, which ShipStation reads as
  // a delivery failure and retries indefinitely for a notice that will never
  // change. Identifying the order is the only thing this handler truly needs.
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Raw JSON body delivered by a ShipStation webhook.
 *
 * Every field is optional because ShipStation only sends the members relevant
 * to the event that fired.
 */
export interface ShipStationWebhookPayload {
  resource_url?: string;
  resource_type?: string;
  resource_id?: string;
  order_id?: string;
  shipment_id?: string;
  tracking_number?: string;
  carrier_code?: string;
  service_code?: string;
  package_code?: string;
  ship_date?: string;
  delivered_date?: string;
  tracking_status?: string;
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  shipment_cost?: string | number;
  weight?: string | number;
  dimensions?: ShipmentDimensions;
  label_url?: string;
  form_url?: string;
  delivery_confirmation?: string;
  signature_required?: boolean;
  adult_signature?: boolean;
  ship_to?: Address;
  created_at?: string;
}

/** Physical dimensions reported for a shipment. */
export interface ShipmentDimensions {
  length: number;
  width: number;
  height: number;
  units: string;
}

/** Normalized, camel-cased view of a ShipStation webhook payload. */
export interface ParsedWebhookData {
  resourceUrl?: string;
  resourceType?: string;
  resourceId?: string;
  orderId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  carrierCode?: string;
  serviceCode?: string;
  packageCode?: string;
  shipDate?: Date;
  deliveredDate?: Date;
  trackingStatus?: string;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  shipmentCost?: number;
  weight?: number;
  dimensions?: ShipmentDimensions;
  labelUrl?: string;
  formUrl?: string;
  deliveryConfirmation?: string;
  signatureRequired?: boolean;
  adultSignature?: boolean;
  shipTo?: Address;
  createdAt: Date;
}

/**
 * Parse ShipStation webhook payload
 * @param payload - JSON webhook payload
 * @returns Parsed webhook data
 */
export function parseWebhookPayload(payload: ShipStationWebhookPayload): ParsedWebhookData {
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
    shipmentCost: payload.shipment_cost ? parseFloat(String(payload.shipment_cost)) * 100 : undefined,
    weight: payload.weight ? parseFloat(String(payload.weight)) : undefined,
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
