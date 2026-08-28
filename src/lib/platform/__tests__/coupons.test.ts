/**
 * `platform/coupons.ts`'s pure logic: the status vocabulary, and the two typed refusals
 * (`duplicate_code`, `economics_immutable`). The database boundary is injected — see the note in
 * `billing/__tests__/coupon-claims.test.ts` — so what runs here is the real decision logic, not a
 * stand-in for it.
 *
 * `../../database/connection` is stubbed below purely to dodge an import-time crash: the real
 * module drags in `pg`, which touches `TextEncoder` and throws under the jsdom test environment.
 * Most functions under test get the fake `Queryable` below instead of the stub's `db` default —
 * `listRedemptions` is the exception, because it calls `platform/customers.ts`'s `describeScope`,
 * which reads the real (here, stubbed) `db` directly rather than through an injected executor.
 */
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { db } from '../../database/connection';
import {
  createPlatformCoupon,
  derivePlatformCouponStatus,
  listPlatformCoupons,
  listRedemptions,
  type PlatformCouponRecord,
  type Queryable,
  updatePlatformCoupon,
} from '../coupons';

/** A `platform_coupons` row, active and unredeemed unless overridden. */
function couponRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'coupon-1',
    code: 'FRIENDS12',
    code_normalized: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    notes: null,
    percent_off: 100,
    duration_months: 12,
    collect_payment_method: false,
    max_redemptions: null,
    redeemed_count: 0,
    redeem_by: null,
    is_active: true,
    stripe_coupon_id: null,
    created_by: 'admin-1',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const RECORD: Pick<PlatformCouponRecord, 'isActive' | 'redeemBy' | 'maxRedemptions' | 'redeemedCount'> = {
  isActive: true,
  redeemBy: null,
  maxRedemptions: null,
  redeemedCount: 0,
};

/**
 * Build a fake `Queryable` whose `query` resolves/rejects in the order configured.
 *
 * Typed as `ReturnType<typeof jest.fn>` rather than `jest.Mock`: this repo has no `@types/jest`, so
 * the `jest` *namespace* does not exist at type level even though the global value does.
 */
function fakeExecutor(): { executor: Queryable; query: ReturnType<typeof jest.fn> } {
  const query = jest.fn();
  return { executor: { query } as unknown as Queryable, query };
}

function pgError(code: string): Error & { code: string } {
  const error = new Error('boom') as Error & { code: string };
  error.code = code;
  return error;
}

describe('derivePlatformCouponStatus: the one status vocabulary', () => {
  const now = new Date('2026-08-27T00:00:00Z');

  it('is active with room and no expiry', () => {
    expect(derivePlatformCouponStatus(RECORD, now)).toBe('active');
  });

  it('is inactive whenever the switch is off, regardless of anything else', () => {
    expect(
      derivePlatformCouponStatus(
        { ...RECORD, isActive: false, redeemBy: new Date('2020-01-01'), maxRedemptions: 1, redeemedCount: 1 },
        now
      )
    ).toBe('inactive');
  });

  it('is expired once redeem_by has passed, for an active coupon', () => {
    expect(
      derivePlatformCouponStatus({ ...RECORD, redeemBy: new Date('2020-01-01') }, now)
    ).toBe('expired');
  });

  it('is not expired at the exact redeem_by instant boundary (uses <=)', () => {
    expect(derivePlatformCouponStatus({ ...RECORD, redeemBy: now }, now)).toBe('expired');
  });

  it('is exhausted once redeemed_count reaches max_redemptions', () => {
    expect(
      derivePlatformCouponStatus({ ...RECORD, maxRedemptions: 1, redeemedCount: 1 }, now)
    ).toBe('exhausted');
  });

  it('an uncapped coupon (max_redemptions null) is never exhausted', () => {
    expect(
      derivePlatformCouponStatus({ ...RECORD, maxRedemptions: null, redeemedCount: 1_000_000 }, now)
    ).toBe('active');
  });
});

describe('listPlatformCoupons: counts and filtering agree with derivePlatformCouponStatus', () => {
  it('counts every status across the full set and filters to the requested one', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({
      rows: [
        couponRow({ id: 'a', is_active: true }),
        couponRow({ id: 'b', is_active: false }),
        couponRow({ id: 'c', is_active: true, max_redemptions: 1, redeemed_count: 1 }),
      ],
    });

    const result = await listPlatformCoupons('active', executor);

    expect(result.counts).toEqual({ active: 1, inactive: 1, expired: 0, exhausted: 1 });
    expect(result.coupons).toHaveLength(1);
    expect(result.coupons[0].id).toBe('a');
  });

  it("'all' returns every coupon regardless of status", async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({
      rows: [couponRow({ id: 'a' }), couponRow({ id: 'b', is_active: false })],
    });

    const result = await listPlatformCoupons('all', executor);

    expect(result.coupons).toHaveLength(2);
  });
});

describe('createPlatformCoupon: the duplicate-code refusal', () => {
  it('surfaces a unique-index violation as a typed refusal, not a thrown error', async () => {
    const { executor, query } = fakeExecutor();
    query.mockRejectedValueOnce(pgError('23505'));

    const result = await createPlatformCoupon(
      { code: 'FRIENDS12', name: 'Friends', percentOff: 100 },
      'admin-1',
      executor
    );

    expect(result).toEqual({ reason: 'duplicate_code' });
  });

  it('rethrows an unrelated database error', async () => {
    const { executor, query } = fakeExecutor();
    query.mockRejectedValueOnce(pgError('23514'));

    await expect(
      createPlatformCoupon({ code: 'X', name: 'X', percentOff: 50 }, 'admin-1', executor)
    ).rejects.toThrow();
  });
});

describe('updatePlatformCoupon: economics are refused, never silently dropped', () => {
  it('refuses a patch touching percentOff, without querying the database at all', async () => {
    const { executor, query } = fakeExecutor();

    const result = await updatePlatformCoupon('coupon-1', { percentOff: 50 }, executor);

    expect(result).toEqual({ reason: 'economics_immutable', fields: ['percentOff'] });
    expect(query).not.toHaveBeenCalled();
  });

  it('names every offending field at once', async () => {
    const { executor } = fakeExecutor();

    const result = await updatePlatformCoupon(
      'coupon-1',
      { durationMonths: 6, collectPaymentMethod: true },
      executor
    );

    expect(result).toEqual({
      reason: 'economics_immutable',
      fields: ['durationMonths', 'collectPaymentMethod'],
    });
  });

  it('applies an allowed patch (name, notes, redeemBy, isActive)', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [couponRow({ name: 'Renamed', is_active: false })] });

    const result = await updatePlatformCoupon(
      'coupon-1',
      { name: 'Renamed', isActive: false },
      executor
    );

    expect(result.reason).toBe('ok');
    if (result.reason === 'ok') {
      expect(result.coupon.name).toBe('Renamed');
      expect(result.coupon.isActive).toBe(false);
    }
  });

  it('reports not_found when the id does not exist', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    const result = await updatePlatformCoupon('missing', { name: 'X' }, executor);

    expect(result).toEqual({ reason: 'not_found' });
  });
});

describe('listRedemptions: the subscription-status join (staff review finding 13)', () => {
  it('surfaces subscriptions.status from a LEFT JOIN, never dropping it', async () => {
    const { executor, query } = fakeExecutor();
    // listRedemptions' own two queries: the total count, then the page of rows.
    query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'redemption-1',
            status: 'redeemed',
            source: 'link',
            attributed_at: new Date('2026-08-01T00:00:00Z'),
            redeemed_at: new Date('2026-08-02T00:00:00Z'),
            released_at: null,
            release_reason: null,
            stripe_subscription_id: 'sub_123',
            stripe_coupon_id: 'coupon_stripe_1',
            discount_ends_at: new Date('2027-08-02T00:00:00Z'),
            coupon_id: 'coupon-1',
            coupon_code: 'FRIENDS12',
            coupon_name: 'Launch friends, 1 year',
            user_id: 'user-1',
            user_email: 'friend@example.com',
            user_first_name: 'Friend',
            user_last_name: 'Person',
            store_id: 'store-1',
            store_name: "Friend's Shop",
            store_is_demo: false,
            subscription_status: 'active',
          },
        ],
      });
    // `describeScope` reads the real `db` (not the injected executor) for its demo-store count —
    // see the module note on why this module duplicates `Queryable` rather than sharing it.
    (db.query as ReturnType<typeof jest.fn>).mockResolvedValueOnce({ rows: [{ demo_stores: '0' }] });

    const result = await listRedemptions({}, executor);

    expect(result.redemptions).toHaveLength(1);
    expect(result.redemptions[0].subscriptionStatus).toBe('active');

    // The row query must actually ask for it via a LEFT (never INNER) join, or an attributed claim
    // with no subscription yet would silently vanish from the page.
    const rowsQuerySql = query.mock.calls[1][0] as string;
    expect(rowsQuerySql).toMatch(/LEFT JOIN subscriptions sub ON sub\.stripe_subscription_id/);
    expect(rowsQuerySql).toMatch(/sub\.status AS subscription_status/);
  });

  it('is null when the claim has no subscription (attributed, or not yet synced)', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'redemption-2',
            status: 'attributed',
            source: 'link',
            attributed_at: new Date('2026-08-01T00:00:00Z'),
            redeemed_at: null,
            released_at: null,
            release_reason: null,
            stripe_subscription_id: null,
            stripe_coupon_id: null,
            discount_ends_at: null,
            coupon_id: 'coupon-1',
            coupon_code: 'FRIENDS12',
            coupon_name: 'Launch friends, 1 year',
            user_id: 'user-2',
            user_email: 'other@example.com',
            user_first_name: null,
            user_last_name: null,
            store_id: null,
            store_name: null,
            store_is_demo: null,
            subscription_status: null,
          },
        ],
      });
    (db.query as ReturnType<typeof jest.fn>).mockResolvedValueOnce({ rows: [{ demo_stores: '0' }] });

    const result = await listRedemptions({}, executor);

    expect(result.redemptions[0].subscriptionStatus).toBeNull();
  });
});
