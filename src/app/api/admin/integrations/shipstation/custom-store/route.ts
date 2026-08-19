/**
 * Custom Store connection details for the signed-in merchant's store.
 *
 * @channel custom-store
 *
 * This is the credential path a merchant actually takes, and the only one. The screen it backs
 * shows three values to paste into ShipStation's Custom Store form — endpoint URL, username,
 * password — and every one of them is read back from what the server persisted.
 *
 * That last point is the whole design constraint. The previous ShipStation setup screen generated
 * a username and password in the browser with `Math.random()`, told the merchant to paste them
 * into ShipStation, and never sent them anywhere; the server derived a different pair and rejected
 * every request that followed (audit P0-1). Nothing here may display a credential the server will
 * not honour, so `GET` returns the stored secret rather than a freshly generated one, and `POST`
 * returns exactly what it just wrote.
 *
 * Rotation is destructive by nature: issuing a new secret invalidates the old one immediately and
 * the merchant's ShipStation connection stays broken until they paste the new value. The response
 * says so explicitly rather than leaving the UI to guess.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';
import { ShipStationKeyError, isEncryptionConfigured } from '@/lib/shipstation/crypto';
import {
  getCustomStoreCredentials,
  issueCustomStoreCredentials,
  setCustomStoreEnabled
} from '@/lib/shipstation/customStoreAuth';
import { mapOrderStatusToShipStation } from '@/lib/shipstation/utils';

/** Node runtime: encryption and Postgres. */
export const runtime = 'nodejs';

/** Never cached — this response carries a credential. */
export const dynamic = 'force-dynamic';

/**
 * The status strings ShipStation's connection form must be given, keyed by its own field labels.
 *
 * ShipStation maps *our* `<OrderStatus>` values onto its internal statuses, and the spec (§4,
 * "Connection form fields") notes the fields are **case-sensitive**. A merchant cannot guess these,
 * and a typo produces orders that import into the wrong ShipStation bucket with no error anywhere.
 * Deriving them from {@link mapOrderStatusToShipStation} rather than hardcoding keeps the screen
 * honest if the mapping ever changes.
 */
function statusMappingForForm(): Record<string, string> {
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
 * Resolve the store owned by the signed-in user.
 *
 * @param userId - Authenticated user id.
 * @returns The store UUID, or null when the user owns none.
 */
async function resolveStoreId(userId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM stores WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Build the absolute endpoint URL the merchant pastes into ShipStation.
 *
 * @param request - Incoming request, used as a last resort in local development.
 * @returns Absolute URL of the Custom Store endpoint.
 */
function resolveEndpointUrl(request: NextRequest): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  const origin = (configured ?? new URL(request.url).origin).replace(/\/+$/, '');
  return `${origin}/api/shipstation/orders`;
}

/**
 * Shape the response body shared by GET and POST.
 *
 * @param request - Incoming request, for URL resolution.
 * @param credentials - Stored credentials, or null when none are issued yet.
 * @returns The payload the setup screen renders.
 */
function connectionPayload(
  request: NextRequest,
  credentials: { username: string; password: string; enabled: boolean } | null
) {
  return {
    configured: credentials !== null,
    endpointUrl: resolveEndpointUrl(request),
    username: credentials?.username ?? null,
    password: credentials?.password ?? null,
    enabled: credentials?.enabled ?? false,
    statusMapping: statusMappingForForm(),
    encryptionConfigured: isEncryptionConfigured()
  };
}

/**
 * Translate a thrown error into a response without leaking internals.
 *
 * @param error - Whatever was thrown.
 * @param fallback - Message used when the error is not one we model.
 * @returns An error response.
 */
function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof ShipStationKeyError) {
    // Actionable and safe to show: it names a missing environment variable, never a secret.
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[custom-store] request failed:', error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

/**
 * GET — read the store's Custom Store connection details.
 *
 * @param request - Incoming request.
 * @returns The endpoint URL, credentials when issued, and the status strings for ShipStation's form.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    const storeId = await resolveStoreId(user.userId);
    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const credentials = await getCustomStoreCredentials(storeId);
    return NextResponse.json({ success: true, data: connectionPayload(request, credentials) });
  } catch (error) {
    return errorResponse(error, 'Failed to load Custom Store connection details');
  }
}

/**
 * POST — issue or rotate the store's Custom Store credentials.
 *
 * @param request - Incoming request. Body may carry `{ enabled: boolean }` to toggle the feed
 *   without rotating the secret.
 * @returns The credentials exactly as persisted.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    const storeId = await resolveStoreId(user.userId);
    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Toggling is not rotating. A merchant pausing the feed must not lose the credential they
    // already pasted into ShipStation.
    if (typeof body?.enabled === 'boolean' && body.rotate !== true) {
      await setCustomStoreEnabled(storeId, body.enabled);
      const credentials = await getCustomStoreCredentials(storeId);
      return NextResponse.json({ success: true, data: connectionPayload(request, credentials) });
    }

    const credentials = await issueCustomStoreCredentials(storeId);
    return NextResponse.json({
      success: true,
      rotated: true,
      message:
        'New credentials issued. The previous secret stopped working immediately — paste these ' +
        'into ShipStation to restore the connection.',
      data: connectionPayload(request, credentials)
    });
  } catch (error) {
    return errorResponse(error, 'Failed to issue Custom Store credentials');
  }
}
