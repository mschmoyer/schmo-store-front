/**
 * "Test Connection" for the ShipStation setup screen — now a real one.
 *
 * Every check in the previous version of this file was a local regex or length test. The comments
 * said so outright ("we'll simulate"), and an API key of thirty-two letter `a`s passed as
 * "ready for integration" (audit P0-2). The first time a merchant's invalid or revoked key was
 * actually exercised was a live customer checkout.
 *
 * This version calls ShipStation. It uses `GET /v2/warehouses`, the same probe as the working
 * generic test at `/api/admin/integrations/test`, routed through {@link shipStationFetch} so it
 * inherits the retry and rate-limit handling every other call has.
 *
 * The key tested is whichever the merchant is about to save: the one in the request body when
 * supplied, otherwise the one already stored. That closes the other half of the old gap, where the
 * screen could report success for a key that was never the one in use.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database/connection';
import { shipStationFetch, type ShipStationFetchOptions } from '@/lib/shipstation/client';
import { ShipStationKeyError } from '@/lib/shipstation/crypto';
import { getIntegration, maskApiKey } from '@/lib/shipstation/credentials';

/** Node runtime: encryption and Postgres. */
export const runtime = 'nodejs';

/** Shape returned to the client. */
export interface ConnectionTestResult {
  success: boolean;
  /** Short, merchant-readable summary. */
  message: string;
  /** What to do about it, when the test failed. */
  suggestion?: string;
  details: {
    endpoint: string;
    apiKeyUsed: string | null;
    status?: number;
    warehousesFound?: number;
    attempts?: number;
  };
}

/**
 * Interpret a ShipStation response into merchant-readable advice.
 *
 * The 401-because-of-billing case is worth keeping: ShipStation returns 401 for a *valid* key on a
 * plan without warehouse access, and reporting that as "your key is wrong" sends merchants hunting
 * for a problem they do not have.
 *
 * @param status - HTTP status returned by ShipStation.
 * @param body - Response body, when available.
 * @returns Message and suggestion.
 */
export function interpretTestFailure(
  status: number,
  body?: string
): { message: string; suggestion: string; treatAsSuccess: boolean } {
  const mentionsBilling = /billing|upgrade|plan/i.test(body ?? '');

  if (status === 401 && mentionsBilling) {
    return {
      message:
        'API key is valid. ShipStation authenticated it but this plan does not include warehouse ' +
        'access.',
      suggestion: 'Upgrade the ShipStation plan for full API access. Order push will still work.',
      treatAsSuccess: true
    };
  }

  switch (status) {
    case 401:
      return {
        message: 'ShipStation rejected the API key.',
        suggestion:
          'Check the key in ShipStation under Settings → Account → API Settings, and make sure it ' +
          'has not been revoked or regenerated.',
        treatAsSuccess: false
      };
    case 403:
      return {
        message: 'The API key is valid but not permitted to read warehouses.',
        suggestion: 'Grant the key read access, or use a key with full API scope.',
        treatAsSuccess: false
      };
    case 404:
      return {
        message: 'ShipStation returned 404 for /v2/warehouses.',
        suggestion:
          'This usually means the account is on the legacy V1 API. RebelShops integrates with V2 only.',
        treatAsSuccess: false
      };
    case 429:
      return {
        message: 'ShipStation is rate-limiting this account.',
        suggestion: 'Wait a minute and test again. Sync retries automatically when this happens.',
        treatAsSuccess: false
      };
    case 0:
      return {
        message: 'Could not reach ShipStation.',
        suggestion:
          'This is a network problem between RebelShops and api.shipstation.com, not a problem ' +
          'with the key. Try again shortly.',
        treatAsSuccess: false
      };
    default:
      return {
        message: `ShipStation returned HTTP ${status}.`,
        suggestion: 'If this persists, check status.shipstation.com before changing the key.',
        treatAsSuccess: false
      };
  }
}

/**
 * Run a live credential check.
 *
 * Exported so tests can drive every branch with an injected fetch.
 *
 * @param apiKey - Key to test.
 * @param network - Injected network primitives.
 * @returns The test result.
 */
export async function runConnectionTest(
  apiKey: string,
  network: Pick<ShipStationFetchOptions, 'fetchImpl' | 'sleepImpl' | 'maxAttempts' | 'timeoutMs'> = {}
): Promise<ConnectionTestResult> {
  const endpoint = 'https://api.shipstation.com/v2/warehouses';

  if (!apiKey) {
    return {
      success: false,
      message: 'No ShipStation API key to test.',
      suggestion: 'Paste your ShipStation V2 API key and try again.',
      details: { endpoint, apiKeyUsed: null }
    };
  }

  const response = await shipStationFetch<{ warehouses?: unknown[] }>('/v2/warehouses', {
    apiKey,
    operation: 'connection test',
    // A merchant is watching this spinner: fail fast rather than grinding through four attempts.
    maxAttempts: 2,
    timeoutMs: 10_000,
    ...network
  });

  if (response.ok) {
    const count = response.data.warehouses?.length ?? 0;
    return {
      success: true,
      message:
        count > 0
          ? `Connected. ShipStation returned ${count} warehouse${count === 1 ? '' : 's'}.`
          : 'Connected. ShipStation accepted the key; this account has no warehouses yet.',
      details: {
        endpoint,
        apiKeyUsed: maskApiKey(apiKey),
        status: response.status,
        warehousesFound: count,
        attempts: response.attempts
      }
    };
  }

  const verdict = interpretTestFailure(response.status, response.body);

  return {
    success: verdict.treatAsSuccess,
    message: verdict.message,
    suggestion: verdict.treatAsSuccess ? undefined : verdict.suggestion,
    details: {
      endpoint,
      apiKeyUsed: maskApiKey(apiKey),
      status: response.status,
      attempts: response.attempts
    }
  };
}

/**
 * POST — test the merchant's ShipStation credentials against the live API.
 *
 * @param request - Incoming request. Optional `apiKey` in the body tests an unsaved key.
 * @returns The test result.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth(request);

    const storeResult = await db.query<{ id: string }>(
      'SELECT id FROM stores WHERE owner_id = $1 LIMIT 1',
      [user.userId]
    );
    const storeId = storeResult.rows[0]?.id;

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { apiKey?: string };

    let apiKey = body.apiKey?.trim() ?? '';
    if (!apiKey) {
      const integration = await getIntegration(storeId);
      apiKey = integration?.apiKey ?? '';
    }

    const result = await runConnectionTest(apiKey);

    return NextResponse.json({ success: result.success, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof ShipStationKeyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }

    console.error('ShipStation connection test failed:', error);
    return NextResponse.json(
      { success: false, error: 'Connection test failed' },
      { status: 500 }
    );
  }
}
