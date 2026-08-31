/**
 * @jest-environment node
 */

/**
 * `POST /api/platform/coupons/redemptions/[id]/release` — the operator kill switch this route adds
 * (staff review finding 2: `releaseClaim` was exported and unit-tested but reachable from no
 * route). Exercises the route's own wiring — auth gating, id validation, and how each of
 * `releaseClaim`'s typed outcomes becomes an HTTP status — rather than re-testing `releaseClaim`
 * itself, which `coupon-claims.test.ts` already covers.
 *
 * `@/lib/auth/session` and `@/lib/database/connection` are stubbed so `requirePlatformAdmin`'s real
 * logic runs (the admin-flag re-read, the 401-vs-403 split) against fakes rather than a live
 * database. Paths are relative — `next/jest` does not map the `@/` alias for `jest.mock`
 * specifiers, only for imports (see `join/[code]/__tests__/route.test.ts`).
 */
jest.mock('../../../../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
  validateUUID: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
// `platform-admin` resolves the caller through session.ts's shared `resolveSession` — Clerk first,
// the legacy JWT only while native login is enabled. Mocking that one function stands in for every
// transport, which is the point of there being one.
jest.mock('../../../../../../../../lib/auth/session', () => ({
  resolveSession: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { db, validateUUID } from '@/lib/database/connection';
import { resolveSession } from '@/lib/auth/session';
import { POST } from '../route';

const REDEMPTION_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_SESSION = {
  userId: 'admin-1',
  email: 'admin@rebelshops.com',
  firstName: 'Ada',
  lastName: 'Min',
};

/** A `platform_coupon_redemptions` row, `attributed` unless overridden. */
function claimRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: REDEMPTION_ID,
    coupon_id: 'coupon-1',
    user_id: 'user-1',
    store_id: null,
    status: 'attributed',
    source: 'link',
    attributed_at: new Date('2026-08-01T00:00:00Z'),
    redeemed_at: null,
    released_at: null,
    release_reason: null,
    stripe_subscription_id: null,
    stripe_coupon_id: null,
    discount_ends_at: null,
    created_at: new Date('2026-08-01T00:00:00Z'),
    updated_at: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

/** A fake transaction client whose `query` resolves in the order configured. */
function fakeClient(): { query: ReturnType<typeof jest.fn> } {
  return { query: jest.fn() };
}

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/platform/coupons/redemptions/${REDEMPTION_ID}/release`, {
    method: 'POST',
  });
}

function params(id: string = REDEMPTION_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// `jest.mocked` rather than a `jest.MockedFunction<...>` cast: this repo has no `@types/jest`, so
// the `jest` *namespace* does not exist at type level even though the global value does.
const mockedGetSession = jest.mocked(resolveSession);
const mockedDb = db as unknown as { query: ReturnType<typeof jest.fn>; transaction: ReturnType<typeof jest.fn> };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth gating, exactly like the sibling coupon routes', () => {
  it('401s an anonymous caller', async () => {
    mockedGetSession.mockResolvedValueOnce(null);

    const response = await POST(request(), params());

    expect(response.status).toBe(401);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('403s a signed-in caller who is not a platform admin', async () => {
    mockedGetSession.mockResolvedValueOnce({ ...ADMIN_SESSION });
    mockedDb.query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const response = await POST(request(), params());

    expect(response.status).toBe(403);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});

describe('as a platform admin', () => {
  beforeEach(() => {
    mockedGetSession.mockResolvedValue({ ...ADMIN_SESSION });
    mockedDb.query.mockResolvedValue({ rows: [{ is_admin: true }] });
  });

  it('400s a malformed id before touching the database', async () => {
    expect(validateUUID('not-a-uuid')).toBe(false);

    const response = await POST(request(), params('not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('releases an attributed claim, auditing on the same transaction', async () => {
    const client = fakeClient();
    client.query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] }) // releaseClaim's SELECT
      .mockResolvedValueOnce({
        rows: [claimRow({ status: 'released', released_at: new Date('2026-08-27T00:00:00Z'), release_reason: 'operator_released' })],
      }) // releaseClaim's UPDATE
      .mockResolvedValueOnce({ rows: [] }); // the audit insert
    mockedDb.transaction.mockImplementationOnce((callback: (c: unknown) => unknown) => callback(client));

    const response = await POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        redemption: {
          id: REDEMPTION_ID,
          status: 'released',
          releasedAt: '2026-08-27T00:00:00.000Z',
          releaseReason: 'operator_released',
        },
      },
    });

    // The audit row is the transaction's third query, on the same client as the update — never a
    // separate best-effort call.
    expect(client.query).toHaveBeenCalledTimes(3);
    const auditCall = client.query.mock.calls[2];
    expect(auditCall[0]).toMatch(/INSERT INTO platform_admin_audit/);
    expect(auditCall[1]).toEqual([
      ADMIN_SESSION.userId,
      'release_coupon_claim',
      'platform_coupon_redemption',
      REDEMPTION_ID,
      JSON.stringify({ releaseReason: 'operator_released' }),
    ]);
  });

  it('is idempotent on an already-released claim: 200, no audit write', async () => {
    const client = fakeClient();
    client.query.mockResolvedValueOnce({ rows: [claimRow({ status: 'released', release_reason: 'reservation_expired' })] });
    mockedDb.transaction.mockImplementationOnce((callback: (c: unknown) => unknown) => callback(client));

    const response = await POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.redemption.status).toBe('released');
    expect(client.query).toHaveBeenCalledTimes(1); // just the SELECT — no UPDATE, no audit
  });

  it('refuses to release a redeemed claim as a 409, never a 500', async () => {
    const client = fakeClient();
    client.query.mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });
    mockedDb.transaction.mockImplementationOnce((callback: (c: unknown) => unknown) => callback(client));

    const response = await POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1); // no audit write for a refused mutation
  });

  it('404s an id that does not exist', async () => {
    const client = fakeClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    mockedDb.transaction.mockImplementationOnce((callback: (c: unknown) => unknown) => callback(client));

    const response = await POST(request(), params());

    expect(response.status).toBe(404);
  });
});
