/**
 * `POST /api/storefront/click` — the public buyer-click beacon.
 *
 * Public and unauthenticated by necessity: the callers are shoppers on a merchant's storefront,
 * who have no session with RebelShops at all. That shapes every decision in this file.
 *
 * **It must be cheap.** One `SELECT` (skipped entirely when the client already knows the store id)
 * and one `INSERT`. No joins, no transaction, no read-back. The `AFTER INSERT` trigger from
 * migration 040 maintains `storefront_click_daily`, so the rollup costs nothing here.
 *
 * **It must be unbreakable.** Nothing this handler can hit — malformed JSON, a slug that no longer
 * exists, a database that is down — is allowed to become an unhandled rejection or a stack trace
 * in the log. A storefront page renders whether or not this route answers, and the client ignores
 * the response body entirely (`navigator.sendBeacon` cannot read one).
 *
 * **It is still honest.** The repo rule is "never return `success: true` for work that wrote
 * nothing", and a beacon has three genuinely different outcomes, so the response distinguishes
 * them rather than flattening them to `{ success: true }`:
 *
 * | Outcome                                   | Status | Body                                                  |
 * |-------------------------------------------|--------|-------------------------------------------------------|
 * | Row written                               | 200    | `{ success: true, recorded: true }`                   |
 * | Deliberately not written (bot, DNT/GPC)   | 200    | `{ success: true, recorded: false, reason }`          |
 * | Rejected (bad type, no such store, …)     | 400/404| `{ success: false, error }`                           |
 * | Storage unavailable                       | 503    | `{ success: false, error: 'not_recorded' }`           |
 *
 * `success: true, recorded: false` is not a fudge: the request was processed correctly and the
 * decision not to store it was the *point*. `recorded` is the field that never lies.
 *
 * The interesting logic — validation, IP hashing, bot and device classification — lives in
 * `src/lib/analytics/storefront-clicks.ts` behind injected boundaries, so it is unit-tested for
 * real rather than through a mocked database. This file is the adapter that supplies those
 * boundaries and maps the outcome onto HTTP.
 *
 * Complementary to, not a replacement for, `POST /api/visitors`: that route keeps one row per IP
 * per day (unique visitors); this one keeps every event (clicks). See the library's header.
 */

import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/database/connection';
import {
  clientIpFromHeaders,
  hasPrivacySignal,
  recordStorefrontClick,
  type StorefrontClickInput,
  type StorefrontClickRecord,
} from '@/lib/analytics/storefront-clicks';

// `node:crypto` hashes the address, so this cannot run on the edge runtime.
export const runtime = 'nodejs';

/** Rejections that mean "no such store", separated from the rest so they can be a 404. */
const NOT_FOUND_REASONS = new Set(['unknown_store']);

/**
 * Confirm a store exists, by id or by slug, and return its id.
 *
 * Both lookups are single-row primary-key/unique-index reads. The slug path exists because the
 * storefront knows its own slug from the URL without a round trip, and a beacon that had to be
 * told the internal id first would need a page-blocking fetch to learn it.
 *
 * @param ref - Exactly one of `storeId` or `storeSlug`
 * @returns The store's id, or null when no store matches
 */
async function resolveStoreId(ref: { storeId?: string; storeSlug?: string }): Promise<string | null> {
  if (ref.storeId) {
    const result = await db.query<{ id: string }>(
      'SELECT id FROM stores WHERE id = $1 LIMIT 1',
      [ref.storeId],
    );
    return result.rows[0]?.id ?? null;
  }
  if (ref.storeSlug) {
    const result = await db.query<{ id: string }>(
      'SELECT id FROM stores WHERE store_slug = $1 LIMIT 1',
      [ref.storeSlug],
    );
    return result.rows[0]?.id ?? null;
  }
  return null;
}

/**
 * Write one validated event.
 *
 * `occurred_at` is left to the column default (`NOW()`, `timestamptz`) rather than taken from the
 * client: a beacon can be sent by a browser whose clock is wrong or whose tab was suspended for an
 * hour, and the daily rollup trigger keys off this value.
 *
 * @param record - The validated row
 * @returns Nothing
 */
async function insertEvent(record: StorefrontClickRecord): Promise<void> {
  await db.query(
    `INSERT INTO storefront_click_events
       (store_id, event_type, path, product_id, visitor_id, session_id, referrer_domain,
        utm_source, utm_medium, utm_campaign, country, device, ip_hash, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      record.storeId,
      record.eventType,
      record.path,
      record.productId,
      record.visitorId,
      record.sessionId,
      record.referrerDomain,
      record.utmSource,
      record.utmMedium,
      record.utmCampaign,
      record.country,
      record.device,
      record.ipHash,
      record.userAgent,
    ],
  );
}

/**
 * Record a buyer-side storefront event.
 *
 * @param request - The beacon request; body is {@link StorefrontClickInput}
 * @returns A JSON response whose `recorded` field states whether a row was written
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: StorefrontClickInput | null = null;
  try {
    body = (await request.json()) as StorefrontClickInput;
  } catch {
    // `sendBeacon` fires and forgets; a truncated body is a client-side fact, not an incident.
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  try {
    const outcome = await recordStorefrontClick(
      body,
      {
        ip: clientIpFromHeaders(request.headers),
        userAgent: request.headers.get('user-agent'),
        country: request.headers.get('x-vercel-ip-country'),
        privacySignal: hasPrivacySignal(request.headers),
      },
      { resolveStoreId, insertEvent },
    );

    if (outcome.status === 'recorded') {
      return NextResponse.json({ success: true, recorded: true });
    }
    if (outcome.status === 'skipped') {
      return NextResponse.json({ success: true, recorded: false, reason: outcome.reason });
    }
    return NextResponse.json(
      { success: false, error: outcome.reason },
      { status: NOT_FOUND_REASONS.has(outcome.reason) ? 404 : 400 },
    );
  } catch (error) {
    // The message only — never the payload, which carries a (hashed, but still) visitor identity,
    // and never the address, which is not in scope here at all.
    console.error(
      '[storefront-click] failed to record event:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json({ success: false, error: 'not_recorded' }, { status: 503 });
  }
}
