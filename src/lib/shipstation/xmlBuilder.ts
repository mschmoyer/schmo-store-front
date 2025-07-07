/**
 * XML Builder service for ShipStation integration
 * Converts orders to ShipStation XML format
 */

import { Order, OrderItem, Address } from '@/lib/types/database';
import { 
  formatDateForShipStation, 
  mapOrderStatusToShipStation, 
  createCDATA, 
  escapeXML, 
  formatMoney,
  convertWeightToOunces
} from './utils';

interface OrderWithItems extends Order {
  items: OrderItem[];
}

/**
 * Export orders to ShipStation XML format
 * @param orders - Array of orders with items
 * @param page - Current page number
 * @param totalPages - Total number of pages
 * @returns XML string
 */
export function exportOrdersToXML(orders: OrderWithItems[], page: number = 1, totalPages: number = 1): string {
  const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>';
  
  const ordersXML = orders.map(order => buildOrderXML(order)).join('\n');
  
  return `${xmlHeader}
<Orders pages="${totalPages}" page="${page}">
${ordersXML}
</Orders>`;
}

/**
 * Build XML for a single order
 * @param order - Order with items
 * @returns XML string for the order
 */
function buildOrderXML(order: OrderWithItems): string {
  const orderDate = formatDateForShipStation(order.created_at);
  const status = mapOrderStatusToShipStation(order.status);
  
  const customerXML = buildCustomerXML(order);
  const itemsXML = buildItemsXML(order.items);
  
  return `  <Order>
    <OrderNumber>${escapeXML(order.order_number)}</OrderNumber>
    <OrderDate>${orderDate}</OrderDate>
    <OrderStatus>${status}</OrderStatus>
    <LastModified>${formatDateForShipStation(order.updated_at)}</LastModified>
    <ShippingMethod>${escapeXML(order.shipping_method || 'Standard')}</ShippingMethod>
    <PaymentMethod>${escapeXML(order.payment_method || 'Credit Card')}</PaymentMethod>
    <OrderTotal>${formatMoney(order.total_amount)}</OrderTotal>
    <TaxAmount>${formatMoney(order.tax_amount || 0)}</TaxAmount>
    <ShippingAmount>${formatMoney(order.shipping_amount || 0)}</ShippingAmount>
    <CustomField1>${escapeXML(order.id)}</CustomField1>
    <CustomField2>${escapeXML(order.store_id)}</CustomField2>
    <CustomField3>${escapeXML(order.currency)}</CustomField3>
    <Source>Store</Source>
    ${customerXML}
    ${itemsXML}
    <Notes>${createCDATA(order.notes || '')}</Notes>
  </Order>`;
}

/**
 * Build customer and address XML
 * @param order - Order object
 * @returns Customer XML string
 */
export function buildCustomerXML(order: Order): string {
  const billingAddress = order.billing_address || order.shipping_address;
  const shippingAddress = order.shipping_address;
  
  if (!shippingAddress) {
    throw new Error('Shipping address is required for ShipStation export');
  }
  
  const customerName = extractCustomerName(order.customer_email, shippingAddress);
  
  return `    <Customer>
      <CustomerCode>${escapeXML(order.customer_email)}</CustomerCode>
      <BillTo>
        <Name>${escapeXML(customerName)}</Name>
        <Company>${escapeXML(billingAddress?.company || '')}</Company>
        <Phone>${escapeXML(billingAddress?.phone || order.customer_phone || '')}</Phone>
        <Email>${escapeXML(order.customer_email)}</Email>
      </BillTo>
      <ShipTo>
        <Name>${escapeXML(customerName)}</Name>
        <Company>${escapeXML(shippingAddress.company || '')}</Company>
        <Address1>${escapeXML(shippingAddress.street)}</Address1>
        <Address2></Address2>
        <City>${escapeXML(shippingAddress.city)}</City>
        <State>${escapeXML(shippingAddress.state)}</State>
        <PostalCode>${escapeXML(shippingAddress.postal_code)}</PostalCode>
        <Country>${escapeXML(shippingAddress.country)}</Country>
        <Phone>${escapeXML(shippingAddress.phone || order.customer_phone || '')}</Phone>
      </ShipTo>
    </Customer>`;
}

/**
 * Build items XML
 * @param items - Array of order items
 * @returns Items XML string
 */
export function buildItemsXML(items: OrderItem[]): string {
  const itemsXML = items.map(item => buildItemXML(item)).join('\n');
  
  return `    <Items>
${itemsXML}
    </Items>`;
}

/**
 * Build XML for a single item
 * @param item - Order item
 * @returns Item XML string
 */
function buildItemXML(item: OrderItem): string {
  const unitPrice = formatMoney(item.price);
  const totalPrice = formatMoney(item.total);
  
  return `      <Item>
        <SKU>${escapeXML(item.product_sku || item.product_id)}</SKU>
        <Name>${createCDATA(item.product_name)}</Name>
        <ImageUrl></ImageUrl>
        <Weight>0</Weight>
        <WeightUnits>Ounces</WeightUnits>
        <Quantity>${item.quantity}</Quantity>
        <UnitPrice>${unitPrice}</UnitPrice>
        <TotalPrice>${totalPrice}</TotalPrice>
        <Location></Location>
        <WarehouseLocation></WarehouseLocation>
        <Options></Options>
        <ProductId>${escapeXML(item.product_id)}</ProductId>
        <FulfillmentSku>${escapeXML(item.product_sku || item.product_id)}</FulfillmentSku>
      </Item>`;
}

/**
 * Extract customer name from email and address
 * @param email - Customer email
 * @param address - Shipping address
 * @returns Customer name
 */
function extractCustomerName(email: string, address: Address): string {
  // Try to use company name if available
  if (address.company) {
    return address.company;
  }
  
  // Otherwise, use email username as fallback
  const emailUsername = email.split('@')[0];
  return emailUsername.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Build advanced order XML with additional ShipStation fields
 * @param order - Order with items
 * @returns Advanced XML string
 */
export function buildAdvancedOrderXML(order: OrderWithItems): string {
  const basicXML = buildOrderXML(order);
  
  // Add advanced fields if available
  let advancedFields = '';
  
  if (order.shipstation_order_id) {
    advancedFields += `    <ShipStationOrderId>${escapeXML(order.shipstation_order_id)}</ShipStationOrderId>\n`;
  }
  
  if (order.tracking_number) {
    advancedFields += `    <TrackingNumber>${escapeXML(order.tracking_number)}</TrackingNumber>\n`;
  }
  
  if (order.carrier) {
    advancedFields += `    <Carrier>${escapeXML(order.carrier)}</Carrier>\n`;
  }
  
  if (order.service_code) {
    advancedFields += `    <ServiceCode>${escapeXML(order.service_code)}</ServiceCode>\n`;
  }
  
  if (order.package_code) {
    advancedFields += `    <PackageCode>${escapeXML(order.package_code)}</PackageCode>\n`;
  }
  
  if (order.confirmation_delivery) {
    advancedFields += `    <Confirmation>${escapeXML(order.confirmation_delivery)}</Confirmation>\n`;
  }
  
  if (order.shipment_weight) {
    advancedFields += `    <Weight>${convertWeightToOunces(order.shipment_weight)}</Weight>\n`;
    advancedFields += `    <WeightUnits>Ounces</WeightUnits>\n`;
  }
  
  if (order.shipment_dimensions) {
    const dims = order.shipment_dimensions;
    advancedFields += `    <Dimensions>\n`;
    advancedFields += `      <Length>${dims.length}</Length>\n`;
    advancedFields += `      <Width>${dims.width}</Width>\n`;
    advancedFields += `      <Height>${dims.height}</Height>\n`;
    advancedFields += `      <Units>${escapeXML(dims.units)}</Units>\n`;
    advancedFields += `    </Dimensions>\n`;
  }
  
  if (order.international_options) {
    advancedFields += buildInternationalOptionsXML(order.international_options);
  }
  
  if (order.advanced_options) {
    advancedFields += buildAdvancedOptionsXML(order.advanced_options);
  }
  
  // Insert advanced fields before the closing </Order> tag
  return basicXML.replace('  </Order>', `${advancedFields}  </Order>`);
}

/**
 * Build international options XML
 * @param options - International options
 * @returns International options XML string
 */
function buildInternationalOptionsXML(options: Record<string, unknown>): string {
  let xml = '    <InternationalOptions>\n';
  
  if (options.contents) {
    xml += `      <Contents>${escapeXML(options.contents)}</Contents>\n`;
  }
  
  if (options.non_delivery) {
    xml += `      <NonDelivery>${escapeXML(options.non_delivery)}</NonDelivery>\n`;
  }
  
  if (options.customs_items && Array.isArray(options.customs_items) && options.customs_items.length > 0) {
    xml += '      <CustomsItems>\n';
    options.customs_items.forEach((item: Record<string, unknown>) => {
      xml += '        <CustomsItem>\n';
      xml += `          <Description>${createCDATA(item.description)}</Description>\n`;
      xml += `          <Quantity>${item.quantity}</Quantity>\n`;
      xml += `          <Value>${formatMoney(item.value)}</Value>\n`;
      if (item.harmonized_tariff_code) {
        xml += `          <HarmonizedTariffCode>${escapeXML(item.harmonized_tariff_code)}</HarmonizedTariffCode>\n`;
      }
      if (item.country_of_origin) {
        xml += `          <CountryOfOrigin>${escapeXML(item.country_of_origin)}</CountryOfOrigin>\n`;
      }
      xml += '        </CustomsItem>\n';
    });
    xml += '      </CustomsItems>\n';
  }
  
  xml += '    </InternationalOptions>\n';
  
  return xml;
}

/**
 * Build advanced options XML
 * @param options - Advanced options
 * @returns Advanced options XML string
 */
function buildAdvancedOptionsXML(options: Record<string, unknown>): string {
  let xml = '    <AdvancedOptions>\n';
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      const xmlKey = key.replace(/_/g, '').replace(/([A-Z])/g, (match, letter) => letter.toUpperCase());
      xml += `      <${xmlKey}>${escapeXML(String(value))}</${xmlKey}>\n`;
    }
  });
  
  xml += '    </AdvancedOptions>\n';
  
  return xml;
}

/**
 * Build minimal order XML for testing
 * @param order - Order with items
 * @returns Minimal XML string
 */
export function buildMinimalOrderXML(order: OrderWithItems): string {
  const orderDate = formatDateForShipStation(order.created_at);
  const status = mapOrderStatusToShipStation(order.status);
  const shippingAddress = order.shipping_address;
  
  if (!shippingAddress) {
    throw new Error('Shipping address is required');
  }
  
  const customerName = extractCustomerName(order.customer_email, shippingAddress);
  
  return `  <Order>
    <OrderNumber>${escapeXML(order.order_number)}</OrderNumber>
    <OrderDate>${orderDate}</OrderDate>
    <OrderStatus>${status}</OrderStatus>
    <OrderTotal>${formatMoney(order.total_amount)}</OrderTotal>
    <Customer>
      <CustomerCode>${escapeXML(order.customer_email)}</CustomerCode>
      <ShipTo>
        <Name>${escapeXML(customerName)}</Name>
        <Address1>${escapeXML(shippingAddress.street)}</Address1>
        <City>${escapeXML(shippingAddress.city)}</City>
        <State>${escapeXML(shippingAddress.state)}</State>
        <PostalCode>${escapeXML(shippingAddress.postal_code)}</PostalCode>
        <Country>${escapeXML(shippingAddress.country)}</Country>
      </ShipTo>
    </Customer>
    <Items>
      ${order.items.map(item => `<Item>
        <SKU>${escapeXML(item.product_sku || item.product_id)}</SKU>
        <Name>${createCDATA(item.product_name)}</Name>
        <Quantity>${item.quantity}</Quantity>
        <UnitPrice>${formatMoney(item.price)}</UnitPrice>
      </Item>`).join('\n      ')}
    </Items>
  </Order>`;
}