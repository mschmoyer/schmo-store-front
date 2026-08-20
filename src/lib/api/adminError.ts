/**
 * The single failure path for admin API routes.
 *
 * Sixty-odd routes had grown the same handler by copy-paste, and every one of them ended with
 * `message: error instanceof Error ? error.message : 'Unknown error'`. That line is why an
 * injection in the catalogue list was *exploitable* rather than merely present: Postgres puts the
 * offending value in its error text, so `invalid input syntax for type integer:
 * "demo@schmostore.com"` travelled all the way back to the attacker's browser. A database error
 * message is server-side diagnostic output. It does not belong in a response body.
 *
 * What the caller gets instead is a stable, human-readable sentence and — for the failures a user
 * can actually do something about, like a duplicate SKU — a specific one. What the operator gets
 * is the full error in the server log, tagged with the route that raised it.
 */

import { NextResponse } from 'next/server';

/** Postgres error codes worth translating into something a merchant can act on. */
const PG_MESSAGES: Record<string, { status: number; message: string }> = {
  /* unique_violation */
  '23505': { status: 409, message: 'That value is already used by another record.' },
  /* foreign_key_violation */
  '23503': { status: 400, message: 'That reference points at a record that no longer exists.' },
  /* not_null_violation */
  '23502': { status: 400, message: 'A required field was missing.' },
  /* check_violation */
  '23514': { status: 400, message: 'One of the values is outside the range this field allows.' },
  /* numeric_value_out_of_range */
  '22003': { status: 400, message: 'A number was too large for the field it was going into.' },
  /* invalid_text_representation — a malformed uuid or number reaching a typed column */
  '22P02': { status: 400, message: 'One of the values was not in the format this field expects.' },
  /* serialization_failure and deadlock_detected: transient, worth retrying */
  '40001': { status: 409, message: 'That change collided with another one. Try again.' },
  '40P01': { status: 409, message: 'That change collided with another one. Try again.' }
};

/*
 * `AdminApiError` itself lives in `./AdminApiError`, which has no framework import, so validation
 * code can throw one without dragging `next/server` along. Re-exported here for callers that need
 * both it and the response builder.
 */
export { AdminApiError } from './AdminApiError';

import { AdminApiError } from './AdminApiError';

/**
 * Turn a thrown value into a response, logging the detail rather than sending it.
 *
 * @param error - Whatever was caught. Anything at all; this never throws.
 * @param context - A dotted route identifier such as `products.list`, used to tag the log line.
 * @returns A JSON error response with a status matched to the failure where one is known.
 */
export function adminErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === 'Authentication required') {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (error instanceof AdminApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }

  /* `pg` puts the SQLSTATE on `.code`. Reading it is how a duplicate SKU becomes a 409 rather
   * than an opaque 500, without the response quoting the row that clashed. */
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;

  const known = code ? PG_MESSAGES[code] : undefined;

  console.error(`[api:${context}]`, error);

  if (known) {
    return NextResponse.json({ success: false, error: known.message }, { status: known.status });
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Something went wrong on our end. The details have been logged.'
    },
    { status: 500 }
  );
}
