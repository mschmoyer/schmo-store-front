/**
 * The cron-shaped wrapper around `coupon-claims.ts`'s `releaseExpiredClaims`.
 *
 * `coupon-claims.ts` imports `@/lib/database/connection` at module scope, which pulls in `pg` and
 * crashes under jsdom unless stubbed - see the note in `coupon-claims.test.ts` and this repo's test
 * notes. The `jest.mock` specifier is relative, not `@/...`, because `next/jest` does not map that
 * alias for `jest.mock` calls.
 *
 * `releaseExpiredClaims` itself is exercised in `coupon-claims.test.ts`; what is worth pinning here
 * is only the shape this module reports it in - the honest zero, the window actually used, and the
 * coupon ids surfaced for the run log.
 */
jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { db } from '@/lib/database/connection';
import { asQueryMock } from '@/lib/billing/test-support/query-mock';
import { PLATFORM_CLAIM_RESERVATION_DAYS, RELEASE_REASON_RESERVATION_EXPIRED } from '@/lib/billing/coupon-claims';
import { runCouponSweepJob } from '../coupon-sweep-job';

const query = asQueryMock(db.query);

/** A released `platform_coupon_redemptions` row, as `releaseExpiredClaims`'s UPDATE returns it. */
function releasedRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'claim-1',
    coupon_id: 'coupon-1',
    user_id: 'user-1',
    store_id: null,
    status: 'released',
    source: 'link',
    attributed_at: new Date('2026-01-01T00:00:00Z'),
    redeemed_at: null,
    released_at: new Date('2026-08-27T00:00:00Z'),
    release_reason: RELEASE_REASON_RESERVATION_EXPIRED,
    stripe_subscription_id: null,
    stripe_coupon_id: null,
    discount_ends_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-08-27T00:00:00Z'),
    ...overrides,
  };
}

describe('runCouponSweepJob', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('reports the real released count, including the coupon ids, using the default window', async () => {
    query.mockResolvedValueOnce({
      rows: [releasedRow(), releasedRow({ id: 'claim-2', coupon_id: 'coupon-2' })],
    });

    const result = await runCouponSweepJob();

    expect(result).toEqual({
      windowDays: PLATFORM_CLAIM_RESERVATION_DAYS,
      releasedCount: 2,
      couponIds: ['coupon-1', 'coupon-2'],
      timestamp: expect.any(String),
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'attributed'"),
      [RELEASE_REASON_RESERVATION_EXPIRED, PLATFORM_CLAIM_RESERVATION_DAYS]
    );
  });

  it('honestly reports zero when nothing was due - never a false success', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await runCouponSweepJob();

    expect(result.releasedCount).toBe(0);
    expect(result.couponIds).toEqual([]);
  });

  it('honours an explicit window', async () => {
    query.mockResolvedValueOnce({ rows: [releasedRow()] });

    const result = await runCouponSweepJob(7);

    expect(result.windowDays).toBe(7);
    expect(query).toHaveBeenCalledWith(expect.any(String), [RELEASE_REASON_RESERVATION_EXPIRED, 7]);
  });

  it('propagates a database failure so the route can 500 and an operator can see it', async () => {
    query.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(runCouponSweepJob()).rejects.toThrow('connection terminated');
  });
});
