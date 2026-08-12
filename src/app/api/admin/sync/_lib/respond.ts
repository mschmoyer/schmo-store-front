/**
 * Shared request plumbing for the operator-triggered `/api/admin/sync/*` routes.
 *
 * Each of those routes used to repeat the same three things — resolve the caller's store, read and
 * base64-decode the API key, map failures to a status code — and each did it slightly differently.
 * The credential read now lives behind `manualSync`, and what remains is collected here so every
 * sync route answers the same way.
 */

import { NextResponse } from 'next/server';
import { ShipStationKeyError } from '@/lib/shipstation/crypto';
import {
  ShipStationNotConnectedError,
  collectErrors,
  type ManualSyncResult
} from '@/lib/shipstation/manualSync';

/**
 * Map a thrown value to the response the admin UI should see.
 *
 * The distinctions matter to whoever is looking at the toast: a missing encryption key is an
 * operator problem (503), a disconnected integration is a setup problem (400), and neither should
 * read as "ShipStation is broken".
 *
 * @param error - Value thrown while handling the request.
 * @param context - Short label used in the server-side log line.
 * @returns The response to return.
 */
export function syncErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === 'Authentication required') {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (error instanceof ShipStationNotConnectedError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  if (error instanceof ShipStationKeyError) {
    // Surfaced verbatim: it names the missing variable and how to generate one, and contains no
    // secret material.
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[${context}] ${message}`);

  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

/**
 * Decide the HTTP status for a finished run.
 *
 * A run that failed every operation is a server error; one that failed some is reported as a 200
 * carrying `success: false` and the per-operation detail, because partial results were still
 * written and the UI should be able to show them.
 *
 * @param result - A completed run.
 * @returns The status code to answer with.
 */
export function statusForResult(result: ManualSyncResult): number {
  if (result.success) {
    return 200;
  }

  return collectErrors(result).length === result.operations.length ? 500 : 200;
}
