/**
 * `POST /api/onboarding/shipstation` — step 3, the order connection.
 *
 * Two shapes:
 *   `{}`             — issue (or re-read) this store's Custom Store credentials
 *                      and return everything the merchant pastes into ShipStation.
 *   `{ skip: true }` — take the honest skip path.
 *
 * **This step sets up orders, not the catalogue.** ShipStation has two surfaces
 * and they do different jobs: the Custom Store XML feed carries orders out and
 * ship notices back, and the V2 REST API carries products and stock in. Neither
 * can do the other's work — the feed has no catalogue capability and V2 has no
 * real order-creation resource. The API key therefore moved to the import step
 * (`/api/onboarding/catalog-key`), where it is the thing standing between the
 * merchant and their products, rather than being collected here under a heading
 * about connecting ShipStation generally.
 *
 * Audit alignment:
 *   - **P0-1**: credentials shown here are exactly what was persisted. The secret
 *     is generated server-side and stored encrypted; we never show a value the
 *     server will not accept.
 *   - **P1-7**: no credential, or fragment of one, is logged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';
import { issueCustomStoreCredentials, getCustomStoreCredentials } from '@/lib/shipstation/customStoreAuth';
import { ShipStationKeyError } from '@/lib/shipstation/crypto';
import {
  resolveCustomStoreEndpointUrl,
  SHIPSTATION_SETUP_STEPS,
  statusMappingForForm
} from '@/lib/shipstation/customStoreConnection';

interface ShipStationRequest {
  skip?: boolean;
  /** Sent by Continue: the merchant has seen the details and is moving on. */
  confirm?: boolean;
}

/**
 * Issue the store's Custom Store credentials, or record a deliberate skip.
 *
 * @param request - JSON body: `{}` or `{ skip: true }`
 * @returns 200 with the connection details, or the skip acknowledgement
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

    const body = (await request.json().catch(() => ({}))) as ShipStationRequest;

    if (body.skip === true) {
      const row = await persist(context.row, {
        complete: 'shipstation',
        data: {
          shipstationSkipped: true,
          shipstationMaskedKey: null,
          shipstationWarehouses: null,
          shipstationPlanLimited: false,
          shipstationCheckedAt: null,
        },
        importState: {
          status: 'skipped',
          found: 0,
          total: null,
          imported: 0,
          failed: 0,
          skus: 0,
          warehouses: 0,
          page: 1,
          hasMore: false,
          error: null,
          errorAction: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      return NextResponse.json({
        skipped: true,
        state: await buildState({ session: context.session, row }, originOf(request)),
      });
    }

    // Reuse the existing secret when there is one. Re-issuing on every visit
    // would silently invalidate a connection the merchant had already pasted
    // into ShipStation — going back a step must not break a working store.
    const credentials =
      (await getCustomStoreCredentials(context.row.store_id)) ??
      (await issueCustomStoreCredentials(context.row.store_id));

    // Completion is a separate, explicit call. The step issues credentials as
    // soon as it opens so the merchant can see what to paste without clicking
    // first — but marking the step done there advanced the wizard past it on
    // arrival, so the one screen whose entire job is to show these values was
    // never actually seen.
    const row = body.confirm === true
      ? await persist(context.row, {
          complete: 'shipstation',
          goTo: 'import',
          data: {
            shipstationSkipped: false,
            shipstationCheckedAt: new Date().toISOString(),
          },
        })
      : context.row;

    return NextResponse.json({
      connection: {
        endpointUrl: resolveCustomStoreEndpointUrl(request.url),
        username: credentials.username,
        password: credentials.password,
        statusMapping: statusMappingForForm(),
        setupSteps: SHIPSTATION_SETUP_STEPS,
      },
      message: 'Custom Store credentials ready.',
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    if (error instanceof ShipStationKeyError) {
      // Names a missing environment variable, never a secret. Actionable and safe.
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    console.error('[onboarding/shipstation] failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}
