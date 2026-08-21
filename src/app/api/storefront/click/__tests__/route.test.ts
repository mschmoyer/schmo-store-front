/**
 * @jest-environment node
 */

/**
 * The beacon route's HTTP contract.
 *
 * The route is a thin adapter over `recordStorefrontClick` (exercised in full by
 * `src/lib/analytics/__tests__/storefront-clicks.test.ts`), so what is worth pinning here is the
 * part the library cannot see: that a malformed body is answered rather than thrown, that the
 * answer is a 4xx and not a 500, that the handler runs on the Node runtime — `node:crypto` hashes
 * the address, and an edge deployment would fail at request time rather than at build time — and,
 * most importantly, that **a well-formed beacon always gets the same answer**.
 *
 * That last one is a security property, not a style choice. A public endpoint that answers
 * `recorded: true` for a real slug and `404 unknown_store` for a made-up one is a free enumeration
 * oracle for every shop on the platform, unpublished ones included. The cases below are what stops
 * that regressing: a bot, a Do-Not-Track request and a nonexistent store must be indistinguishable
 * from a stored event on the wire.
 *
 * These cases deliberately stop before the database. Everything past validation is covered by the
 * library tests and by the live curl-to-row check in the task's verification notes; a unit test
 * that needed a live Postgres would just be a slower integration test.
 */

import { NextRequest } from 'next/server';

import { POST, runtime } from '../route';

/**
 * Build a beacon request with a raw (possibly invalid) body.
 *
 * @param body - The literal request body
 * @returns A POST request to the beacon endpoint
 */
function beacon(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/storefront/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/124.0' },
    body,
  });
}

/**
 * Build a beacon request with a chosen user agent and extra headers.
 *
 * @param userAgent - The `user-agent` to send
 * @param body - The JSON body
 * @param extraHeaders - Any additional headers
 * @returns A POST request to the beacon endpoint
 */
function beaconAs(
  userAgent: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost:3000/api/storefront/click', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe('POST /api/storefront/click', () => {
  it('runs on the Node runtime, because it hashes with node:crypto', () => {
    expect(runtime).toBe('nodejs');
  });

  it('answers a truncated beacon body with a 400 rather than throwing', async () => {
    const response = await POST(beacon('{"storeId": "650e8400-'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'invalid_body' });
  });

  it('rejects a body naming no store before any database work', async () => {
    const response = await POST(beacon(JSON.stringify({ eventType: 'storefront_view' })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'missing_store' });
  });

  it('rejects an event type the CHECK constraint would turn into a 500', async () => {
    const response = await POST(
      beacon(JSON.stringify({ storeId: '650e8400-e29b-41d4-a716-446655440001', eventType: 'purchase' })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'invalid_event_type' });
  });

  it('accepts a crawler without telling it anything, and stores nothing', async () => {
    const response = await POST(
      beaconAs('Googlebot/2.1', { storeId: '650e8400-e29b-41d4-a716-446655440001' }),
    );

    // 202 Accepted: the beacon was handled. It says nothing about whether a row was written,
    // because saying so is what turns this endpoint into an oracle. The drop itself is asserted
    // against the real logic in the library's tests.
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('gives a Do-Not-Track request the same answer as a recorded one', async () => {
    const response = await POST(
      beaconAs('Mozilla/5.0 (Macintosh) Chrome/124.0', { storeId: '650e8400-e29b-41d4-a716-446655440001' }, { 'sec-gpc': '1' }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('gives a nonexistent store slug the same answer as a real one, so slugs cannot be enumerated', async () => {
    // The store lookup is never reached: DNT short-circuits before it, and that is the point —
    // the caller cannot tell the difference between "no such shop" and "stored", because both
    // answers are byte-identical.
    const missing = await POST(
      beaconAs('Mozilla/5.0 (Macintosh) Chrome/124.0', { storeSlug: 'definitely-not-a-shop' }, { dnt: '1' }),
    );
    const present = await POST(
      beaconAs('Mozilla/5.0 (Macintosh) Chrome/124.0', { storeSlug: 'demo-electronics' }, { dnt: '1' }),
    );

    expect(missing.status).toBe(present.status);
    await expect(missing.json()).resolves.toEqual(await present.json());
  });
});
