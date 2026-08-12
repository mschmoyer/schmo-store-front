/**
 * The merchant-facing ShipStation integration API.
 *
 * This route used to display credentials the server would not accept. The screen generated a
 * username and password client-side with `Math.random()`, told the merchant to paste them into
 * ShipStation, and then never sent them anywhere — the server derived a *different*,
 * deterministic pair and authenticated against that (audit P0-1). Anyone who followed the
 * instructions got 401s on their first order export.
 *
 * The fix is not "show the deterministic pair instead". It is to stop having two credential systems
 * at all. The V2 API key the merchant pastes in from ShipStation is the only credential now: it is
 * what sync uses, what order push uses, and what webhook registration uses. The legacy Custom-Store
 * Basic-Auth pair is no longer generated or displayed here. What the merchant gets back is exactly
 * what the server will honour: their masked key, and their per-store webhook URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';
import { ShipStationKeyError, isEncryptionConfigured } from '@/lib/shipstation/crypto';
import {
  deleteIntegration,
  getIntegrationSummary,
  saveCredentials
} from '@/lib/shipstation/credentials';
import { getOrCreateWebhookSecret } from '@/lib/shipstation/webhookSecurity';
import { registerStoreWebhook, unregisterStoreWebhook } from '@/lib/shipstation/webhookRegistration';

/** Node runtime: encryption and Postgres. */
export const runtime = 'nodejs';

/**
 * Resolve the public origin for building webhook URLs.
 *
 * @param request - Incoming request, used as a last resort in local development.
 * @returns Absolute origin with no trailing slash.
 */
function resolveBaseUrl(request: NextRequest): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  return (configured ?? request.nextUrl.origin).replace(/\/+$/, '');
}

/**
 * Resolve the store the authenticated user administers.
 *
 * Reads ownership from the database rather than trusting the session claim, so a stale token
 * cannot address a store the user no longer owns.
 *
 * @param userId - Authenticated user id.
 * @returns The store id, or null.
 */
async function resolveStoreId(userId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM stores WHERE owner_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Translate a thrown error into the right HTTP response.
 *
 * @param error - Caught error.
 * @param fallback - Message used for unrecognised errors.
 * @returns The response to send.
 */
function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof Error && error.message === 'Authentication required') {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (error instanceof ShipStationKeyError) {
    // 503, not 500: the deployment is misconfigured, and the message says exactly how to fix it.
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }

  console.error(`${fallback}:`, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

/**
 * GET — the merchant's current ShipStation configuration.
 *
 * Returns no secrets: a masked key, the webhook URL, and sync state.
 *
 * @param request - Incoming request.
 * @returns The configuration summary.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    const storeId = await resolveStoreId(user.userId);

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const summary = await getIntegrationSummary(storeId, resolveBaseUrl(request));

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        encryptionConfigured: isEncryptionConfigured()
      }
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load ShipStation configuration');
  }
}

/**
 * POST — save the merchant's ShipStation API key and settings.
 *
 * Optionally registers the webhook with ShipStation in the same call (`registerWebhook: true`),
 * which is what finally makes tracking updates arrive instead of the endpoint sitting unsubscribed
 * (P0-8). Registration failure does not fail the save: the credentials are still stored, and the
 * merchant is told the subscription needs a retry.
 *
 * @param request - Incoming request.
 * @returns The updated configuration summary.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    const storeId = await resolveStoreId(user.userId);

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const body = (await request.json()) as {
      apiKey?: string;
      isActive?: boolean;
      autoSyncEnabled?: boolean;
      autoSyncInterval?: string;
      registerWebhook?: boolean;
      shipFromAddress?: Record<string, unknown> | null;
    };

    const summaryBefore = await getIntegrationSummary(storeId, resolveBaseUrl(request));

    if (!body.apiKey && !summaryBefore.connected) {
      return NextResponse.json(
        { success: false, error: 'A ShipStation API key is required to connect.' },
        { status: 400 }
      );
    }

    await saveCredentials({
      storeId,
      apiKey: body.apiKey,
      isActive: body.isActive ?? true,
      autoSyncEnabled: body.autoSyncEnabled,
      autoSyncInterval: body.autoSyncInterval,
      configuration: body.shipFromAddress ? { shipFromAddress: body.shipFromAddress } : undefined
    });

    // Provision the webhook secret eagerly so the merchant's URL is usable the moment it is shown.
    await getOrCreateWebhookSecret(storeId);

    let webhookRegistration: { ok: boolean; error?: string; reused?: boolean } | null = null;
    if (body.registerWebhook) {
      webhookRegistration = await registerStoreWebhook(storeId, resolveBaseUrl(request));
    }

    const summary = await getIntegrationSummary(storeId, resolveBaseUrl(request));

    return NextResponse.json({
      success: true,
      data: { ...summary, encryptionConfigured: true, webhookRegistration },
      message: 'ShipStation settings saved.'
    });
  } catch (error) {
    return errorResponse(error, 'Failed to save ShipStation configuration');
  }
}

/**
 * DELETE — disconnect ShipStation.
 *
 * Best-effort unsubscribes the webhook first, so ShipStation stops delivering to an endpoint that
 * will no longer authenticate it.
 *
 * @param request - Incoming request.
 * @returns Confirmation.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);
    const storeId = await resolveStoreId(user.userId);

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    try {
      await unregisterStoreWebhook(storeId);
    } catch (error) {
      console.warn('Could not unregister ShipStation webhook during disconnect:', error);
    }

    await deleteIntegration(storeId);

    return NextResponse.json({ success: true, message: 'ShipStation integration removed.' });
  } catch (error) {
    return errorResponse(error, 'Failed to remove ShipStation configuration');
  }
}
