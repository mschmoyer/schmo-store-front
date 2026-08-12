/**
 * `POST /api/onboarding/import` — step 4, one bounded slice per call.
 * `GET  /api/onboarding/import` — current progress, for resume.
 *
 * The wizard posts, renders the real counters that come back, and posts again
 * while `hasMore` is true. That gives honest progress on a large catalog
 * without a request that runs until the platform kills it (audit P1-2), and it
 * makes the whole thing resumable: the page cursor lives in the database, so
 * closing the tab mid-import and returning continues from the same page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { buildState, originOf, persist, readImportProgress, requireOnboarding } from '../_lib/state';
import { runImportSlice, startedProgress } from '../_lib/import';
import { upsertProduct } from '../_lib/import-writer';
import type { FetchLike } from '../_lib/shipstation';

/** Test seam, mirroring the ShipStation route. */
export const __testHooks: { fetchImpl?: FetchLike } = {};

/**
 * Report where the import got to.
 *
 * @param request - Incoming request
 * @returns 200 with the onboarding state
 */
export async function GET(request: NextRequest) {
  const context = await requireOnboarding(request);
  if (!context) {
    return NextResponse.json(
      { message: 'You’ve been signed out. Sign in to pick up where you left off.' },
      { status: 401 }
    );
  }
  return NextResponse.json({ state: await buildState(context, originOf(request)) });
}

/**
 * Run one slice of the catalog import, resuming from the stored cursor.
 *
 * @param request - JSON body: `{ restart?: boolean, skip?: boolean }`
 * @returns 200 with the onboarding state after the slice
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

    const body = (await request.json().catch(() => ({}))) as {
      restart?: boolean;
      skip?: boolean;
    };

    if (body.skip === true) {
      const existing = readImportProgress(context.row.import_state);
      const row = await persist(context.row, {
        complete: 'import',
        importState: { ...existing, status: 'skipped', hasMore: false },
      });
      return NextResponse.json({
        state: await buildState({ session: context.session, row }, originOf(request)),
      });
    }

    const integration = await db.query<{ api_key_encrypted: string | null }>(
      `SELECT api_key_encrypted FROM store_integrations
        WHERE store_id = $1 AND integration_type = 'shipstation' AND is_active = true`,
      [context.row.store_id]
    );
    const encoded = integration.rows[0]?.api_key_encrypted;
    if (!encoded) {
      return NextResponse.json(
        {
          message:
            'Sync failed before it started. Your ShipStation connection may have been revoked.',
          action: 'Check connection',
        },
        { status: 409 }
      );
    }
    const apiKey = Buffer.from(encoded, 'base64').toString('utf-8');

    const stored = readImportProgress(context.row.import_state);
    const shouldRestart =
      body.restart === true || stored.status === 'idle' || stored.status === 'skipped';
    const progress = shouldRestart ? startedProgress() : { ...stored, status: 'running' as const };

    const next = await runImportSlice({
      storeId: context.row.store_id,
      apiKey,
      progress,
      writeProduct: upsertProduct,
      fetchImpl: __testHooks.fetchImpl,
    });

    const finished = next.status === 'complete' || next.status === 'partial';
    const row = await persist(context.row, {
      importState: next,
      ...(finished ? { complete: 'import' as const } : {}),
    });

    // Record the run so the merchant's sync history is not empty from day one.
    if (finished || next.status === 'failed') {
      await recordSyncHistory(context.row.store_id, next.status, next.imported, next.failed);
    }

    return NextResponse.json({
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    console.error('[onboarding/import] failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}

/**
 * Write a row into `sync_history` so the admin sync panel shows this import.
 * Best-effort: a logging failure must never fail the merchant's import.
 *
 * @param storeId - Owning store
 * @param status - Terminal status of the run
 * @param imported - Records written
 * @param failed - Records that failed
 */
async function recordSyncHistory(
  storeId: string,
  status: string,
  imported: number,
  failed: number
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sync_history (
          store_id, integration_type, sync_type, status,
          products_synced, products_updated, completed_at
       ) VALUES ($1, 'shipstation', 'products', $2, $3, $4, NOW())`,
      [storeId, status === 'failed' ? 'failed' : 'success', imported + failed, imported]
    );
  } catch {
    // Deliberately swallowed — see doc comment.
  }
}
