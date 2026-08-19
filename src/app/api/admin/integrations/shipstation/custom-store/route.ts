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
import {
  resolveCustomStoreEndpointUrl,
  statusMappingForForm
} from '@/lib/shipstation/customStoreConnection';

/** Node runtime: encryption and Postgres. */
export const runtime = 'nodejs';

/** Never cached — this response carries a credential. */
export const dynamic = 'force-dynamic';

/**
 * When ShipStation last successfully authenticated against this store's feed.
 *
 * This is the only honest evidence the integration is working. ShipStation's polling cadence is not
 * a fixed interval a merchant can predict — the spec (§4, "Importing orders") says auto-update
 * frequency depends on their usage history and "is not a fixed interval you can rely on" — so a
 * screen that claims "connected" from configuration alone is claiming something it cannot know.
 * A timestamp is a fact.
 *
 * @param storeId - Store UUID.
 * @returns ISO timestamp of the last successful poll, or null if ShipStation has never called.
 */
async function lastPollAt(storeId: string): Promise<string | null> {
  const result = await db.query<{ created_at: Date }>(
    `SELECT created_at
       FROM integration_logs
      WHERE store_id = $1
        AND integration_type = 'shipstation'
        AND status = 'success'
        AND operation LIKE 'custom\\_store\\_%'
      ORDER BY created_at DESC
      LIMIT 1`,
    [storeId]
  );
  return result.rows[0]?.created_at?.toISOString() ?? null;
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
 * Shape the response body shared by GET and POST.
 *
 * @param request - Incoming request, for URL resolution.
 * @param credentials - Stored credentials, or null when none are issued yet.
 * @returns The payload the setup screen renders.
 */
function connectionPayload(
  request: NextRequest,
  credentials: { username: string; password: string; enabled: boolean } | null,
  lastPoll: string | null = null
) {
  return {
    configured: credentials !== null,
    lastPollAt: lastPoll,
    endpointUrl: resolveCustomStoreEndpointUrl(request.url),
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

    const [credentials, lastPoll] = await Promise.all([
      getCustomStoreCredentials(storeId),
      lastPollAt(storeId)
    ]);
    return NextResponse.json({ success: true, data: connectionPayload(request, credentials, lastPoll) });
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
      const [credentials, lastPoll] = await Promise.all([
        getCustomStoreCredentials(storeId),
        lastPollAt(storeId)
      ]);
      return NextResponse.json({ success: true, data: connectionPayload(request, credentials, lastPoll) });
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
