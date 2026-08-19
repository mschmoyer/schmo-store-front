/**
 * `POST /api/onboarding/catalog-key` — the ShipStation V2 key, asked for at the
 * import step because that is the only thing it does.
 *
 * This logic used to live in step 3, under a heading about connecting ShipStation
 * generally. That was misleading in both directions: the key cannot send an order
 * (V2 has no order-creation resource), and the Custom Store feed that does send
 * orders cannot read a catalogue. Step 3 now sets up the order feed, and the key
 * is collected here, where the merchant can see it is what stands between them
 * and their products.
 *
 * Audit alignment, carried over unchanged from the old step-3 route:
 *   - **P0-2**: the test is a real `GET https://api.shipstation.com/v2/warehouses`
 *     (see `../_lib/shipstation.ts`). There is no branch that returns success
 *     without a live response.
 *   - **P0-1**: nothing is written until that call succeeds, and the key is never
 *     echoed back — the merchant only ever sees `••••••••2f9c`.
 *   - **P1-7**: the key is not logged, not even a fragment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';
import { maskKey, validateShipStationKey, type FetchLike } from '../_lib/shipstation';

interface CatalogKeyRequest {
  apiKey?: string;
}

/**
 * Test-seam: routes cannot take constructor arguments, so the injectable fetch
 * hangs off the module. `validateShipStationKey` is unit-tested directly; this
 * hook exists for route-level integration tests.
 */
export const __testHooks: { fetchImpl?: FetchLike } = {};

/**
 * Validate the merchant's ShipStation V2 key against ShipStation, then store it.
 *
 * @param request - JSON body: `{ apiKey }`
 * @returns 200 once the key is verified and saved, 400/502 with a specific reason otherwise
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireOnboarding(request);
    if (!context) {
      return NextResponse.json(
        { message: 'You’ve been signed out. Sign in to pick up where you left off.' },
        { status: 401 }
      );
    }
    if (!context.row.store_id) {
      return NextResponse.json({ message: 'Name your store first.' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as CatalogKeyRequest;
    const apiKey = (body.apiKey ?? '').trim();
    const result = await validateShipStationKey(apiKey, { fetchImpl: __testHooks.fetchImpl });

    if (!result.ok) {
      // Nothing is written. The merchant's previous connection, if any, is
      // untouched — a failed test must never disconnect a working store.
      return NextResponse.json(
        { check: result, message: result.message },
        {
          status:
            result.status === 'network_error' ||
            result.status === 'timeout' ||
            result.status === 'blocked_upstream'
              ? 502
              : 400,
        }
      );
    }

    // TODO(audit P0-9): `api_key_encrypted` is base64, not encryption. Every
    // existing reader (every sync route) does
    // `Buffer.from(value, 'base64')`, so writing anything else here would break
    // the sync that this step exists to enable. Fixing the storage format is a
    // cross-cutting change that has to land in `src/lib/shipstation/**` and all
    // its readers at once; encoding it differently only here would be worse.
    const encoded = Buffer.from(apiKey, 'utf-8').toString('base64');
    const masked = maskKey(apiKey);
    const checkedAt = new Date().toISOString();

    // The Custom Store credentials live on this same row, so the update must not
    // clobber them — hence a targeted column list rather than a wholesale write.
    await db.query(
      `INSERT INTO store_integrations (
          store_id, integration_type, api_key_encrypted, configuration,
          is_active, auto_sync_enabled, auto_sync_interval, sync_status
       ) VALUES ($1, 'shipstation', $2, $3::jsonb, true, true, '1hour', 'pending')
       ON CONFLICT (store_id, integration_type) DO UPDATE
          SET api_key_encrypted = EXCLUDED.api_key_encrypted,
              configuration     = store_integrations.configuration || EXCLUDED.configuration,
              is_active         = true,
              sync_error_message = NULL,
              updated_at        = NOW()`,
      [
        context.row.store_id,
        encoded,
        JSON.stringify({
          apiKeyMasked: masked,
          connectedVia: 'onboarding',
          verifiedAt: checkedAt,
          verifiedAgainst: 'GET https://api.shipstation.com/v2/warehouses',
          planLimited: result.status === 'plan_limited',
          warehouseCount: result.warehouseCount ?? null,
        }),
      ]
    );

    const row = await persist(context.row, {
      data: {
        shipstationMaskedKey: masked,
        shipstationWarehouses: result.warehouseCount ?? null,
        shipstationPlanLimited: result.status === 'plan_limited',
        shipstationCheckedAt: checkedAt,
      },
    });

    return NextResponse.json({
      check: result,
      message: 'ShipStation catalogue connected.',
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    console.error('[onboarding/catalog-key] failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}
