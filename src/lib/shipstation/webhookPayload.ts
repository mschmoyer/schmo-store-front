import { Address, ShipStationWebhookPayload } from '@/lib/types/database';

/** Resource types ShipStation sends on its notification webhooks. */
const RESOURCE_TYPES: ReadonlyArray<ShipStationWebhookPayload['resource_type']> = [
  'ITEM_ORDER_NOTIFY',
  'ITEM_SHIP_NOTIFY',
  'ITEM_DELIVERED_NOTIFY'
];

/**
 * Read a string member from an untyped object.
 *
 * @param source - Untyped object
 * @param key - Member to read
 * @returns The value when it is a string, otherwise undefined
 */
function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read a number member from an untyped object.
 *
 * @param source - Untyped object
 * @param key - Member to read
 * @returns The value when it is a number, otherwise undefined
 */
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Read a boolean member from an untyped object.
 *
 * @param source - Untyped object
 * @param key - Member to read
 * @returns The value when it is a boolean, otherwise undefined
 */
function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Read a nested object member from an untyped object.
 *
 * @param source - Untyped object
 * @param key - Member to read
 * @returns The value when it is a plain object, otherwise undefined
 */
function readObject(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = source[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Narrow the `dimensions` member of a webhook payload.
 *
 * @param source - Untyped object holding a `dimensions` member
 * @returns The dimensions when every measurement is numeric, otherwise undefined
 */
function readDimensions(
  source: Record<string, unknown>
): ShipStationWebhookPayload['dimensions'] {
  const dimensions = readObject(source, 'dimensions');
  if (!dimensions) {
    return undefined;
  }

  const length = readNumber(dimensions, 'length');
  const width = readNumber(dimensions, 'width');
  const height = readNumber(dimensions, 'height');

  if (length === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  return { length, width, height, units: readString(dimensions, 'units') ?? 'inches' };
}

/**
 * Narrow the `ship_to` member of a webhook payload.
 *
 * @param source - Untyped object holding a `ship_to` member
 * @returns The address when present, otherwise undefined
 */
function readShipTo(source: Record<string, unknown>): Address | undefined {
  const shipTo = readObject(source, 'ship_to');
  if (!shipTo) {
    return undefined;
  }

  return {
    street: readString(shipTo, 'street') ?? '',
    city: readString(shipTo, 'city') ?? '',
    state: readString(shipTo, 'state') ?? '',
    postal_code: readString(shipTo, 'postal_code') ?? '',
    country: readString(shipTo, 'country') ?? '',
    company: readString(shipTo, 'company'),
    phone: readString(shipTo, 'phone')
  };
}

/**
 * Validate and narrow an untyped webhook body into a ShipStation payload.
 *
 * Job payloads are stored as JSONB, so their contents are unknown until they are
 * checked. Anything that does not carry the required identifying fields is
 * rejected rather than coerced.
 *
 * @param source - Untyped webhook body read from a job payload or request
 * @returns The narrowed payload, or null when the required fields are missing
 */
export function parseShipStationWebhookPayload(
  source: Record<string, unknown>
): ShipStationWebhookPayload | null {
  const resourceUrl = readString(source, 'resource_url');
  const resourceId = readString(source, 'resource_id');
  const resourceType = readString(source, 'resource_type');

  if (
    resourceUrl === undefined ||
    resourceId === undefined ||
    resourceType === undefined ||
    !RESOURCE_TYPES.includes(resourceType as ShipStationWebhookPayload['resource_type'])
  ) {
    return null;
  }

  return {
    resource_url: resourceUrl,
    resource_id: resourceId,
    resource_type: resourceType as ShipStationWebhookPayload['resource_type'],
    created_at: readString(source, 'created_at') ?? new Date().toISOString(),
    order_id: readString(source, 'order_id'),
    shipment_id: readString(source, 'shipment_id'),
    tracking_number: readString(source, 'tracking_number'),
    carrier_code: readString(source, 'carrier_code'),
    service_code: readString(source, 'service_code'),
    package_code: readString(source, 'package_code'),
    ship_date: readString(source, 'ship_date'),
    delivered_date: readString(source, 'delivered_date'),
    exception_date: readString(source, 'exception_date'),
    exception_description: readString(source, 'exception_description'),
    tracking_status: readString(source, 'tracking_status'),
    estimated_delivery_date: readString(source, 'estimated_delivery_date'),
    actual_delivery_date: readString(source, 'actual_delivery_date'),
    shipment_cost: readNumber(source, 'shipment_cost'),
    weight: readNumber(source, 'weight'),
    dimensions: readDimensions(source),
    label_url: readString(source, 'label_url'),
    form_url: readString(source, 'form_url'),
    delivery_confirmation: readString(source, 'delivery_confirmation'),
    signature_required: readBoolean(source, 'signature_required'),
    adult_signature: readBoolean(source, 'adult_signature'),
    ship_to: readShipTo(source)
  };
}
