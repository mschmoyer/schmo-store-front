/**
 * The values a merchant must copy into ShipStation's Custom Store form, and the
 * steps for finding that form.
 *
 * Two surfaces show this: the admin setup card (`CustomStoreCard`) and onboarding
 * step 3. They must agree exactly — a merchant who sets the integration up during
 * onboarding and later checks the admin screen has to see the same strings, and a
 * status value that differs by one character between the two screens produces
 * orders that import into the wrong ShipStation bucket with no error anywhere.
 * So the data lives here once rather than in each screen.
 *
 * @channel custom-store
 */

import { mapOrderStatusToShipStation } from './utils';

/**
 * The status strings ShipStation's connection form must be given, keyed by its own field labels.
 *
 * ShipStation maps *our* `<OrderStatus>` values onto its internal statuses, and the spec (§4,
 * "Connection form fields") notes the fields are **case-sensitive**. A merchant cannot guess these,
 * and a typo produces orders that import into the wrong ShipStation bucket with no error anywhere.
 * Deriving them from {@link mapOrderStatusToShipStation} rather than hardcoding keeps both screens
 * honest if the mapping ever changes.
 *
 * @returns Field label → the exact string to paste
 * @channel custom-store
 */
export function statusMappingForForm(): Record<string, string> {
  return {
    'Unpaid Status': mapOrderStatusToShipStation('pending'),
    'Paid Status': mapOrderStatusToShipStation('confirmed'),
    'Shipped Status': mapOrderStatusToShipStation('shipped'),
    'Cancelled Status': mapOrderStatusToShipStation('cancelled'),
    // We never emit an on-hold status, so the field is deliberately left blank rather than filled
    // with a value ShipStation would then wait for and never see.
    'On-Hold Status': ''
  };
}

/**
 * Where to find the Custom Store form inside ShipStation.
 *
 * Taken from the spec (§4, "Add a Custom Store as a Selling Channel"). Merchants
 * do this once and cannot be expected to know ShipStation's navigation, so the
 * path is spelled out rather than assumed.
 *
 * @channel custom-store
 */
export const SHIPSTATION_SETUP_STEPS: readonly string[] = [
  'Open ShipStation and go to Account Settings.',
  'Select Selling Channels, then Store Setup.',
  'Click Connect a Store or Marketplace.',
  'Choose Custom Store.',
  'Paste the URL, username and password, then the five status fields.',
  'Click Test Connection, then Connect. ShipStation runs its first import on its own schedule.'
];

/**
 * Build the absolute endpoint URL the merchant pastes into ShipStation.
 *
 * Prefers the configured public origin, because that is the URL ShipStation must
 * be able to reach from the outside. The request's own origin is a last resort
 * for local development, where no public origin is configured.
 *
 * @param requestUrl - URL of the incoming request, used only as a fallback
 * @returns Absolute URL of the Custom Store endpoint
 * @channel custom-store
 */
export function resolveCustomStoreEndpointUrl(requestUrl: string): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  const origin = (configured ?? new URL(requestUrl).origin).replace(/\/+$/, '');
  return `${origin}/api/shipstation/orders`;
}
