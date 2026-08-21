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
 * **It must not answer questions it was not asked.** An earlier revision of this file reported
 * each outcome precisely — `recorded: true`, or `404 unknown_store` — and a security review
 * pointed out what that turns into on a public endpoint: a free store-slug oracle. `POST
 * {storeSlug:"acme"}` answering differently from `POST {storeSlug:"acmf"}` lets anyone enumerate
 * every shop on the platform, *including unpublished ones whose slug has not been shared yet*.
 * Nothing legitimate depends on the distinction, because `navigator.sendBeacon` cannot read a
 * response body at all. So every well-formed beacon now gets one uniform answer:
 *
 * | Outcome                                                          | Status | Body                                  |
 * |------------------------------------------------------------------|--------|---------------------------------------|
 * | Well-formed: stored, or dropped as bot / DNT / rate-limited / no such store | 202 | `{ success: true }`         |
 * | Malformed: bad JSON, unknown `eventType`, no store named          | 400    | `{ success: false, error }`            |
 * | Storage unavailable                                               | 503    | `{ success: false, error: 'not_recorded' }` |
 *
 * The 4xx cases are kept distinct on purpose: they describe the *caller's own body*, reveal
 * nothing about which stores exist, and are what a developer wiring up a new surface needs to see.
 *
 * **`202` and `success: true` mean "accepted", not "stored".** That is the honest reading, and it
 * is why the field is not called `recorded`: this route deliberately declines to say whether a row
 * was written. What actually happened is decided — and asserted in tests — inside
 * `recordStorefrontClick`, whose return value distinguishes `recorded`, `skipped` (with a reason)
 * and `rejected` in full.
 *
 * **It must not be a free write amplifier.** The endpoint is unauthenticated, so anyone can post
 * events for a store they do not own; left unthrottled, a competitor could inflate a merchant's
 * traffic or bend their conversion funnel by posting `add_to_cart` and `checkout_start`. A
 * two-window in-process rate limit runs *before* the store lookup, so an abusive client costs no
 * database work. Its limits — and the fact that it is per-instance rather than global — are
 * documented on `createClickRateLimiter`.
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

    /*
     * One answer for every well-formed beacon. `unknown_store` is folded in here with the bots and
     * the rate-limited: telling the caller a slug does not exist is exactly the enumeration oracle
     * this endpoint must not be. Only complaints about the caller's own body get a distinct reply.
     */
    if (outcome.status === 'rejected' && outcome.reason !== 'unknown_store') {
      return NextResponse.json({ success: false, error: outcome.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true }, { status: 202 });
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
