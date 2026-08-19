/**
 * XML builder for the ShipStation Custom Store order export.
 *
 * The wire format is specified in `docs/shipstation-custom-store.md`; this file
 * is the only place that produces it. Two things about it are easy to get wrong
 * and were wrong before:
 *
 * 1. **The row shape.** `orders` stores the customer and both addresses as flat
 *    columns (`shipping_first_name`, `shipping_address_line1`, …), not as the
 *    nested `Address` object the `Order` domain type describes. The builder
 *    previously read `order.shipping_address.street`, which is `undefined` for
 *    every row `SELECT o.* FROM orders` returns, so the export validated every
 *    order as unshippable and emitted an empty `<Orders>` document. The input
 *    type here mirrors the table instead of the domain type.
 *
 * 2. **Money units.** `orders` and `order_items` hold `DECIMAL(10,2)` dollars,
 *    which node-postgres returns as strings. They must go through
 *    `formatDecimalMoney`, never `formatMoney` (which divides integer cents by
 *    100 and would report every amount at a hundredth of its value).
 *
 * Free text is emitted inside CDATA sections as the spec requires, and optional
 * elements are omitted entirely rather than emitted empty — an empty element is
 * a claim that the field is blank, which is not the same as not knowing it.
 */

import { createCDATA, formatDecimalMoney, mapOrderStatusToShipStation } from './utils';
import { Order } from '@/lib/types/database';

/** Money as it comes back from a `DECIMAL(10,2)` column. */
type DecimalMoney = string | number | null | undefined;

/**
 * One `order_items` row, as selected by the Custom Store export.
 *
 * Field names match the table, not the `OrderItem` domain type, so no aliasing
 * happens between the query and the XML.
 */
export interface CustomStoreItemRow {
  id: string;
  product_sku: string | null;
  product_name: string;
  product_image_url: string | null;
  unit_price: DecimalMoney;
  quantity: number;
  total_price: DecimalMoney;
}

/**
 * One `orders` row joined to its store's currency, as selected by the export.
 */
export interface CustomStoreOrderRow {
  id: string;
  order_number: string;
  status: Order['status'];

  /**
   * `MM/dd/yyyy HH:mm`, rendered by Postgres `to_char`.
   *
   * These arrive pre-formatted rather than as Dates because `orders.created_at`
   * and `updated_at` are `TIMESTAMP` (no time zone): node-postgres reads them
   * as *local* time, so formatting them in JS shifts every exported date by the
   * host's offset. Formatting in SQL keeps them in the column's own wall-clock.
   */
  order_date: string;
  last_modified: string;

  customer_email: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;

  shipping_first_name: string | null;
  shipping_last_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;

  billing_first_name: string | null;
  billing_last_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;

  tax_amount: DecimalMoney;
  shipping_amount: DecimalMoney;
  discount_amount: DecimalMoney;
  total_amount: DecimalMoney;

  payment_method: string | null;
  shipping_method: string | null;
  notes: string | null;

  /** From `stores.currency`; ISO 4217. */
  currency: string | null;

  items: CustomStoreItemRow[];
}

/** Currency used when a store has none set, matching the column default. */
const DEFAULT_CURRENCY = 'USD';

/**
 * Render one element containing free text, wrapped in CDATA.
 *
 * @param name - Element name
 * @param value - Text content; the element is omitted when this is empty
 * @param indent - Leading whitespace for the line
 * @returns The element line, or an empty string when there is nothing to say
 */
function textElement(name: string, value: string | null | undefined, indent: string): string {
  const text = (value ?? '').trim();
  return text === '' ? '' : `${indent}<${name}>${createCDATA(text)}</${name}>\n`;
}

/**
 * Render one element containing a value that needs no escaping (dates, decimals,
 * enumerations we generate ourselves).
 *
 * @param name - Element name
 * @param value - Literal content; the element is omitted when this is empty
 * @param indent - Leading whitespace for the line
 * @returns The element line, or an empty string
 */
function literalElement(name: string, value: string | null | undefined, indent: string): string {
  const text = (value ?? '').trim();
  return text === '' ? '' : `${indent}<${name}>${text}</${name}>\n`;
}

/**
 * Join a first and last name into the single `Name` field the spec defines.
 *
 * @param first - First name column
 * @param last - Last name column
 * @returns Trimmed full name, empty when neither part is present
 */
function joinName(first: string | null | undefined, last: string | null | undefined): string {
  return [first ?? '', last ?? ''].map(part => part.trim()).filter(Boolean).join(' ');
}

/**
 * Read a decimal-dollar column as a number for comparisons.
 *
 * @param amount - Value from a `DECIMAL` column
 * @returns The numeric value, or 0 when absent or unparseable
 */
function toNumber(amount: DecimalMoney): number {
  if (amount === null || amount === undefined || amount === '') {
    return 0;
  }
  const value = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reduce a stored currency to a bare ISO 4217 code.
 *
 * The value comes from `stores.currency`, which merchants can set. Stripping to
 * letters means it is emitted without escaping without risking a malformed
 * document, and anything unusable falls back to the column's own default.
 *
 * @param currency - Raw column value
 * @returns Three-letter uppercase code
 */
function normaliseCurrency(currency: string | null | undefined): string {
  const code = (currency ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return code.length === 3 ? code : DEFAULT_CURRENCY;
}

/**
 * Build the `<Customer>` element, including both addresses.
 *
 * `BillTo` falls back to the shipping name and the order's contact details when
 * no separate billing address was captured, because `BillTo/Name` is required.
 *
 * @param order - Order row
 * @returns Customer XML block
 */
export function buildCustomerXML(order: CustomStoreOrderRow): string {
  const shipName = joinName(order.shipping_first_name, order.shipping_last_name);
  const billName = joinName(order.billing_first_name, order.billing_last_name);
  const contactName = joinName(order.customer_first_name, order.customer_last_name);

  let xml = '    <Customer>\n';
  xml += textElement('CustomerCode', order.customer_email, '      ');

  xml += '      <BillTo>\n';
  xml += textElement('Name', billName || contactName || shipName, '        ');
  xml += textElement('Phone', order.customer_phone, '        ');
  xml += textElement('Email', order.customer_email, '        ');
  xml += textElement('Address1', order.billing_address_line1, '        ');
  xml += textElement('Address2', order.billing_address_line2, '        ');
  xml += textElement('City', order.billing_city, '        ');
  xml += textElement('State', order.billing_state, '        ');
  xml += textElement('PostalCode', order.billing_postal_code, '        ');
  xml += textElement('Country', order.billing_country, '        ');
  xml += '      </BillTo>\n';

  xml += '      <ShipTo>\n';
  xml += textElement('Name', shipName || contactName, '        ');
  xml += textElement('Address1', order.shipping_address_line1, '        ');
  xml += textElement('Address2', order.shipping_address_line2, '        ');
  xml += textElement('City', order.shipping_city, '        ');
  xml += textElement('State', order.shipping_state, '        ');
  xml += textElement('PostalCode', order.shipping_postal_code, '        ');
  xml += textElement('Country', order.shipping_country, '        ');
  xml += textElement('Phone', order.customer_phone, '        ');
  xml += '      </ShipTo>\n';

  xml += '    </Customer>';

  return xml;
}

/**
 * Build one `<Item>` element.
 *
 * @param item - Order item row
 * @returns Item XML block
 */
function buildItemXML(item: CustomStoreItemRow): string {
  let xml = '      <Item>\n';
  xml += textElement('LineItemID', item.id, '        ');
  xml += textElement('SKU', item.product_sku, '        ');
  xml += textElement('Name', item.product_name, '        ');
  xml += textElement('ImageUrl', item.product_image_url, '        ');
  xml += literalElement('Quantity', String(item.quantity), '        ');
  xml += literalElement('UnitPrice', formatDecimalMoney(item.unit_price), '        ');
  xml += '      </Item>';

  return xml;
}

/**
 * Build the order-level discount as an adjustment line item.
 *
 * The spec models discounts as a line item carrying a negative `UnitPrice` and
 * `<Adjustment>true</Adjustment>`. Without it the item lines sum to more than
 * `OrderTotal` and the order looks mispriced in ShipStation.
 *
 * @param discount - Positive discount amount in decimal dollars
 * @returns Adjustment item XML block
 */
function buildDiscountItemXML(discount: number): string {
  let xml = '      <Item>\n';
  xml += textElement('SKU', 'DISCOUNT', '        ');
  xml += textElement('Name', 'Order discount', '        ');
  xml += literalElement('Quantity', '1', '        ');
  xml += literalElement('UnitPrice', (-Math.abs(discount)).toFixed(2), '        ');
  xml += literalElement('Adjustment', 'true', '        ');
  xml += '      </Item>';

  return xml;
}

/**
 * Build the `<Items>` element for an order.
 *
 * @param order - Order row whose items to render
 * @returns Items XML block
 */
export function buildItemsXML(order: CustomStoreOrderRow): string {
  const lines = order.items.map(buildItemXML);
  const discount = toNumber(order.discount_amount);

  if (discount > 0) {
    lines.push(buildDiscountItemXML(discount));
  }

  if (lines.length === 0) {
    return '    <Items></Items>';
  }

  return `    <Items>\n${lines.join('\n')}\n    </Items>`;
}

/**
 * Build a single `<Order>` element.
 *
 * @param order - Order row with its items
 * @returns Order XML block
 */
function buildOrderXML(order: CustomStoreOrderRow): string {
  let xml = '  <Order>\n';

  xml += textElement('OrderID', order.id, '    ');
  xml += textElement('OrderNumber', order.order_number, '    ');
  xml += literalElement('OrderDate', order.order_date, '    ');
  xml += textElement('OrderStatus', mapOrderStatusToShipStation(order.status), '    ');
  xml += literalElement('LastModified', order.last_modified, '    ');
  xml += textElement('ShippingMethod', order.shipping_method, '    ');
  xml += textElement('PaymentMethod', order.payment_method, '    ');
  xml += literalElement('CurrencyCode', normaliseCurrency(order.currency), '    ');
  xml += literalElement('OrderTotal', formatDecimalMoney(order.total_amount), '    ');
  xml += literalElement('TaxAmount', formatDecimalMoney(order.tax_amount), '    ');
  xml += literalElement('ShippingAmount', formatDecimalMoney(order.shipping_amount), '    ');
  xml += textElement('InternalNotes', order.notes, '    ');
  xml += `${buildCustomerXML(order)}\n`;
  xml += `${buildItemsXML(order)}\n`;
  xml += '  </Order>';

  return xml;
}

/**
 * Render the Custom Store export document.
 *
 * The root carries only the `pages` attribute the spec defines — ShipStation
 * walks pages by re-requesting with `&page=N`, and a non-standard `page`
 * attribute is not part of the contract.
 *
 * @param orders - Orders to include on this page, with their items
 * @param totalPages - Total number of pages available for the requested window
 * @returns Complete XML document
 */
export function exportOrdersToXML(orders: CustomStoreOrderRow[], totalPages: number = 1): string {
  const pages = Math.max(1, Math.floor(totalPages));
  const body = orders.map(buildOrderXML).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<Orders pages="${pages}">
${body}${body === '' ? '' : '\n'}</Orders>`;
}

/**
 * Check that an order carries everything the spec marks required.
 *
 * ShipStation rejects the whole document if one order is malformed, so the
 * export skips individual offenders rather than failing the page. The caller is
 * responsible for reporting what was skipped — silently dropping orders is how
 * a store ends up permanently missing shipments with nothing in the logs.
 *
 * @param order - Order row to check
 * @returns Whether the order can be exported, and why not when it cannot
 */
export function validateOrderForExport(
  order: CustomStoreOrderRow
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!order.order_number) {
    errors.push('OrderNumber is required');
  }

  if (!order.customer_email) {
    errors.push('CustomerCode (customer email) is required');
  }

  if (!joinName(order.shipping_first_name, order.shipping_last_name) &&
      !joinName(order.customer_first_name, order.customer_last_name)) {
    errors.push('ShipTo/Name is required');
  }

  if (!order.shipping_address_line1) {
    errors.push('ShipTo/Address1 is required');
  }

  if (!order.shipping_city) {
    errors.push('ShipTo/City is required');
  }

  if (!order.shipping_postal_code) {
    errors.push('ShipTo/PostalCode is required');
  }

  if (!order.shipping_country) {
    errors.push('ShipTo/Country is required');
  }

  return { isValid: errors.length === 0, errors };
}
