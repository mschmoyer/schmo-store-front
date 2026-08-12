/**
 * Retired: the unscoped ShipStation webhook endpoint.
 *
 * This path used to accept any POST from anyone, read `x-shipstation-signature` without verifying
 * it, and resolve the target order with no `store_id` predicate — so a stranger could mark any
 * store's order shipped with tracking data of their choosing (audit P0-7).
 *
 * It is kept as a hard refusal rather than deleted for two reasons: a merchant who configured the
 * old URL in ShipStation gets a clear, actionable error instead of a 404 that reads as a transient
 * outage, and anything still probing this path is told nothing about the tenants behind it.
 *
 * The live endpoint is `/api/shipstation/webhook/<store-token>`; the merchant's exact URL is shown
 * on `/admin/integrations`.
 */

import { NextResponse } from 'next/server';

/** Node runtime, matching the rest of the ShipStation surface. */
export const runtime = 'nodejs';

/** Never cached. */
export const dynamic = 'force-dynamic';

/** Body returned to every caller of the retired endpoint. */
const RETIRED = {
  success: false,
  error: 'endpoint_retired',
  message:
    'This webhook endpoint has been retired because it could not identify which store an event ' +
    'belonged to. Use the per-store webhook URL shown on /admin/integrations ' +
    '(/api/shipstation/webhook/<store-token>), which authenticates the sender and scopes every ' +
    'update to one store.'
} as const;

/**
 * Refuse a webhook delivery to the retired path.
 *
 * @returns 410 Gone. Not 401: there is no credential that makes this path work again, and 410
 *   stops ShipStation retrying a delivery that can never succeed.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(RETIRED, { status: 410 });
}

/**
 * Explain the retirement to anyone probing the old URL.
 *
 * @returns 410 Gone with the same guidance.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(RETIRED, { status: 410 });
}
