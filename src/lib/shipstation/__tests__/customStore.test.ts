/**
 * Tests for the ShipStation Custom Store wire format.
 *
 * Everything here is a pure function over data, so the real logic runs — the
 * generated XML is parsed back with the same xml2js the inbound path uses,
 * rather than asserted against with substring matching that would pass on
 * malformed documents.
 *
 * The contract under test is `docs/shipstation-custom-store.md`.
 */

import { parseStringPromise } from 'xml2js';
import {
  CustomStoreOrderRow,
  exportOrdersToXML,
  validateOrderForExport
} from '../xmlBuilder';
import { parseShipmentNotification, validateShipmentNotification } from '../xmlParser';
import { createPaginationParams, formatDecimalMoney, parseShipStationDate } from '../utils';

/**
 * Build an exportable order row, overridable per test.
 *
 * @param overrides - Fields to replace on the default row
 * @returns A complete order row
 */
function makeOrder(overrides: Partial<CustomStoreOrderRow> = {}): CustomStoreOrderRow {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    order_number: 'ABC123',
    status: 'confirmed',
    order_date: '10/18/2019 21:56',
    last_modified: '10/19/2019 12:56',

    customer_email: 'customer@mystore.com',
    customer_first_name: 'Ada',
    customer_last_name: 'Lovelace',
    customer_phone: '512-555-5555',

    shipping_first_name: 'Ada',
    shipping_last_name: 'Lovelace',
    shipping_address_line1: '1600 Pennsylvania Ave',
    shipping_address_line2: 'Suite 2',
    shipping_city: 'Washington',
    shipping_state: 'DC',
    shipping_postal_code: '20500',
    shipping_country: 'US',

    billing_first_name: null,
    billing_last_name: null,
    billing_address_line1: null,
    billing_address_line2: null,
    billing_city: null,
    billing_state: null,
    billing_postal_code: null,
    billing_country: null,

    tax_amount: '0.00',
    shipping_amount: '4.50',
    discount_amount: '0.00',
    total_amount: '123.45',

    payment_method: 'Credit Card',
    shipping_method: 'USPSPriorityMail',
    notes: null,
    currency: 'USD',

    items: [
      {
        id: '99999999-8888-4777-8666-555555555555',
        product_sku: 'FD88821',
        product_name: 'My Product Name',
        product_image_url: 'https://www.mystore.com/products/12345.jpg',
        unit_price: '13.99',
        quantity: 2,
        total_price: '27.98'
      }
    ],
    ...overrides
  };
}

describe('parseShipStationDate', () => {
  it('reads the window as UTC', () => {
    expect(parseShipStationDate('01/23/2012 17:28').toISOString()).toBe('2012-01-23T17:28:00.000Z');
  });

  it('accepts 12-hour notation with a meridiem', () => {
    expect(parseShipStationDate('10/18/2019 09:56 PM').toISOString()).toBe(
      '2019-10-18T21:56:00.000Z'
    );
    expect(parseShipStationDate('10/18/2019 12:30 AM').toISOString()).toBe(
      '2019-10-18T00:30:00.000Z'
    );
  });

  it('accepts a date with no time, as ShipDate sends', () => {
    expect(parseShipStationDate('10/19/2019').toISOString()).toBe('2019-10-19T00:00:00.000Z');
  });

  it('rejects malformed input rather than yielding an Invalid Date', () => {
    expect(() => parseShipStationDate('garbage')).toThrow(/Invalid ShipStation date/);
    expect(() => parseShipStationDate('')).toThrow(/Invalid ShipStation date/);
  });

  it('rejects a calendar day that does not exist instead of rolling it forward', () => {
    expect(() => parseShipStationDate('02/31/2012 10:00')).toThrow(/does not exist/);
  });
});

describe('formatDecimalMoney', () => {
  it('passes decimal dollars through without rescaling', () => {
    // The regression this guards: dividing by 100 reported 123.45 as 1.23.
    expect(formatDecimalMoney('123.45')).toBe('123.45');
    expect(formatDecimalMoney(4.5)).toBe('4.50');
  });

  it('treats absent amounts as zero', () => {
    expect(formatDecimalMoney(null)).toBe('0.00');
    expect(formatDecimalMoney(undefined)).toBe('0.00');
    expect(formatDecimalMoney('')).toBe('0.00');
  });
});

describe('exportOrdersToXML', () => {
  it('produces a document matching the spec structure', async () => {
    const xml = exportOrdersToXML([makeOrder()], 3);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.$.pages).toBe('3');
    // `page` is not part of the contract; only `pages` is.
    expect(parsed.Orders.$.page).toBeUndefined();

    const order = parsed.Orders.Order;
    expect(order.OrderID).toBe('11111111-2222-4333-8444-555555555555');
    expect(order.OrderNumber).toBe('ABC123');
    expect(order.OrderDate).toBe('10/18/2019 21:56');
    expect(order.LastModified).toBe('10/19/2019 12:56');
    expect(order.CurrencyCode).toBe('USD');
    expect(order.OrderTotal).toBe('123.45');
    expect(order.TaxAmount).toBe('0.00');
    expect(order.ShippingAmount).toBe('4.50');
  });

  it('emits the recipient from the flat address columns', async () => {
    const xml = exportOrdersToXML([makeOrder()], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const shipTo = parsed.Orders.Order.Customer.ShipTo;

    expect(shipTo.Name).toBe('Ada Lovelace');
    expect(shipTo.Address1).toBe('1600 Pennsylvania Ave');
    expect(shipTo.Address2).toBe('Suite 2');
    expect(shipTo.City).toBe('Washington');
    expect(shipTo.PostalCode).toBe('20500');
    expect(shipTo.Country).toBe('US');
  });

  it('falls back to the contact name for BillTo when no billing name was captured', async () => {
    const xml = exportOrdersToXML([makeOrder()], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.Customer.BillTo.Name).toBe('Ada Lovelace');
  });

  it('omits optional elements rather than emitting them empty', async () => {
    const xml = exportOrdersToXML([makeOrder({ shipping_method: null, notes: null })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.ShippingMethod).toBeUndefined();
    expect(parsed.Orders.Order.InternalNotes).toBeUndefined();
  });

  it('does not emit elements outside the spec', () => {
    const xml = exportOrdersToXML([makeOrder()], 1);

    for (const stray of [
      '<Notes>',
      '<TotalPrice>',
      '<WarehouseLocation>',
      '<ProductId>',
      '<FulfillmentSku>'
    ]) {
      expect(xml).not.toContain(stray);
    }
  });

  it('renders an order discount as a negative adjustment line', async () => {
    const xml = exportOrdersToXML([makeOrder({ discount_amount: '10.00' })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const items = parsed.Orders.Order.Items.Item;

    expect(Array.isArray(items)).toBe(true);
    const adjustment = items[items.length - 1];
    expect(adjustment.Adjustment).toBe('true');
    expect(adjustment.UnitPrice).toBe('-10.00');
  });

  it('leaves free text intact through CDATA, including a CDATA terminator', async () => {
    const hostile = 'Deliver ]]> before <b>Friday</b> & ring twice';
    const xml = exportOrdersToXML([makeOrder({ notes: hostile })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.InternalNotes).toBe(hostile);
  });

  it('renders an empty but well-formed document when the page has no orders', async () => {
    const parsed = await parseStringPromise(exportOrdersToXML([], 1), { explicitArray: false });

    expect(parsed.Orders.$.pages).toBe('1');
    expect(parsed.Orders.Order).toBeUndefined();
  });

  it('exports a cancelled order, since the spec returns every status', async () => {
    const xml = exportOrdersToXML([makeOrder({ status: 'cancelled' })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.OrderStatus).toBe('cancelled');
  });
});

describe('validateOrderForExport', () => {
  it('accepts a complete order', () => {
    expect(validateOrderForExport(makeOrder()).isValid).toBe(true);
  });

  it('rejects an order with no shipping street', () => {
    const result = validateOrderForExport(makeOrder({ shipping_address_line1: null }));

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('ShipTo/Address1 is required');
  });

  it('accepts an order whose recipient name comes only from the contact columns', () => {
    const result = validateOrderForExport(
      makeOrder({ shipping_first_name: null, shipping_last_name: null })
    );

    expect(result.isValid).toBe(true);
  });
});

describe('parseShipmentNotification', () => {
  /** The ShipNotice from the published spec, trimmed to the fields we read. */
  const SHIP_NOTICE = `<?xml version="1.0" encoding="utf-8"?>
<ShipNotice>
  <OrderNumber>ABC123</OrderNumber>
  <OrderID>123456</OrderID>
  <CustomerCode>customer@mystore.com</CustomerCode>
  <LabelCreateDate>10/19/2019 12:56</LabelCreateDate>
  <ShipDate>10/19/2019</ShipDate>
  <Carrier>USPS</Carrier>
  <Service>Priority Mail</Service>
  <TrackingNumber>1Z909084330298430820</TrackingNumber>
  <ShippingCost>4.95</ShippingCost>
  <Recipient>
    <Name>The President</Name>
    <Company>US Govt</Company>
    <Address1>1600 Pennsylvania Ave</Address1>
    <City>Washington</City>
    <State>DC</State>
    <PostalCode>20500</PostalCode>
    <Country>US</Country>
  </Recipient>
</ShipNotice>`;

  it('parses the spec ShipNotice root and field names', async () => {
    const parsed = await parseShipmentNotification(SHIP_NOTICE);

    expect(parsed.orderId).toBe('123456');
    expect(parsed.orderNumber).toBe('ABC123');
    expect(parsed.trackingNumber).toBe('1Z909084330298430820');
    expect(parsed.carrierCode).toBe('USPS');
    expect(parsed.serviceCode).toBe('Priority Mail');
  });

  it('keeps ShippingCost in decimal dollars', async () => {
    const parsed = await parseShipmentNotification(SHIP_NOTICE);

    // orders.shipment_cost is DECIMAL(10,2) dollars; scaling to cents here
    // stored $4.95 as 495.00.
    expect(parsed.shipmentCost).toBe(4.95);
  });

  it('reads the Recipient block as the destination address', async () => {
    const parsed = await parseShipmentNotification(SHIP_NOTICE);

    expect(parsed.shipTo?.street).toBe('1600 Pennsylvania Ave');
    expect(parsed.shipTo?.postal_code).toBe('20500');
  });

  it('parses the label and ship dates as UTC', async () => {
    const parsed = await parseShipmentNotification(SHIP_NOTICE);

    expect(parsed.createDate?.toISOString()).toBe('2019-10-19T12:56:00.000Z');
    expect(parsed.shipDate?.toISOString()).toBe('2019-10-19T00:00:00.000Z');
  });

  it('still parses the legacy ShipmentNotification root', async () => {
    const parsed = await parseShipmentNotification(
      `<ShipmentNotification><OrderNumber>X1</OrderNumber><CarrierCode>UPS</CarrierCode></ShipmentNotification>`
    );

    expect(parsed.orderNumber).toBe('X1');
    expect(parsed.carrierCode).toBe('UPS');
  });

  it('reports an unrecognised root rather than silently returning nothing', async () => {
    await expect(parseShipmentNotification('<Nope><A>1</A></Nope>')).rejects.toThrow(/ShipNotice/);
  });
});

describe('validateShipmentNotification', () => {
  it('accepts a notice that carries no tracking number', () => {
    // "Mark as Shipped" sends one of these; rejecting it made ShipStation retry
    // a notice that would never change.
    const result = validateShipmentNotification({ orderId: '', orderNumber: 'ABC123' });

    expect(result.isValid).toBe(true);
  });

  it('rejects a notice that identifies no order', () => {
    const result = validateShipmentNotification({ orderId: '', orderNumber: '' });

    expect(result.isValid).toBe(false);
  });
});

describe('createPaginationParams', () => {
  it('falls back to defaults when the query string is not a number', () => {
    // `?page=abc` used to yield NaN and reach the query as `LIMIT NaN`, which
    // failed the export with a 500.
    expect(createPaginationParams(NaN, NaN)).toEqual({ page: 1, pageSize: 50 });
  });

  it('clamps out-of-range values instead of trusting them', () => {
    expect(createPaginationParams(0, 10_000)).toEqual({ page: 1, pageSize: 500 });
    expect(createPaginationParams(-5, 0)).toEqual({ page: 1, pageSize: 1 });
  });

  it('keeps a normal page request intact', () => {
    expect(createPaginationParams(3, 50)).toEqual({ page: 3, pageSize: 50 });
  });
});

describe('currency handling', () => {
  it('falls back to USD when the store currency is unusable', async () => {
    const xml = exportOrdersToXML([makeOrder({ currency: null })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.CurrencyCode).toBe('USD');
  });

  it('keeps the document well-formed if a stored currency contains markup', async () => {
    const xml = exportOrdersToXML([makeOrder({ currency: '<&>' })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.CurrencyCode).toBe('USD');
  });

  it('normalises a lowercase code', async () => {
    const xml = exportOrdersToXML([makeOrder({ currency: 'eur' })], 1);
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    expect(parsed.Orders.Order.CurrencyCode).toBe('EUR');
  });
});
