/**
 * The claim lifecycle's pure logic: the state-machine transition table and the Postgres-error →
 * typed-reason mapping.
 *
 * Per `CLAUDE.md`'s "Mocks" rule, the database boundary is injected rather than mocked at the
 * module level — every call below builds a fake `Queryable` and passes it as the `executor`
 * argument, so what is under test is the real transition logic in `coupon-claims.ts`, including the
 * exact SQL it decides to run, not a stand-in for it.
 *
 * `../../database/connection` is still stubbed below, the same way `webhook-events.test.ts` stubs
 * it: importing the real module drags in `pg`, which touches `TextEncoder` at import time and
 * crashes under the jsdom test environment. Nothing here ever calls the stub — every function under
 * test is given the fake `Queryable` above instead of its `db` default — so this is working around
 * an unrelated import-time crash, not a mock of anything this suite exercises.
 */
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import {
  attributeCoupon,
  backfillStoreId,
  CLAIM_STATUS_ATTRIBUTED,
  isLiveClaim,
  markRedeemed,
  PLATFORM_CLAIM_RESERVATION_DAYS,
  RELEASE_REASON_RESERVATION_EXPIRED,
  releaseClaim,
  releaseExpiredClaims,
  resolveActiveClaim,
  type Queryable,
} from '../coupon-claims';

/** A minimal `platform_coupon_redemptions` row, with sane defaults, for building fixtures. */
function claimRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'claim-1',
    coupon_id: 'coupon-1',
    user_id: 'user-1',
    store_id: null,
    status: 'attributed',
    source: 'link',
    attributed_at: new Date('2026-01-01T00:00:00Z'),
    redeemed_at: null,
    released_at: null,
    release_reason: null,
    stripe_subscription_id: null,
    stripe_coupon_id: null,
    discount_ends_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** A `platform_coupons` gate row, active and with room, unless overridden. */
function gateRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    is_active: true,
    redeem_by: null,
    max_redemptions: null,
    redeemed_count: 0,
    ...overrides,
  };
}

/**
 * Build a fake `Queryable` whose `query` resolves/rejects in the order configured.
 *
 * Typed as `ReturnType<typeof jest.fn>` rather than `jest.Mock`: this repo has no `@types/jest`, so
 * the `jest` *namespace* does not exist at type level even though the global value does. This also
 * needs `mockRejectedValueOnce`, which `test-support/query-mock.ts`'s `QueryMock` does not declare
 * (its callers never simulate a thrown database error) — so a plain `jest.fn()` is used directly
 * rather than that narrower, resolve-only surface.
 */
function fakeExecutor(): { executor: Queryable; query: ReturnType<typeof jest.fn> } {
  const query = jest.fn();
  return { executor: { query } as unknown as Queryable, query };
}

/** A Postgres-shaped error carrying a SQLSTATE, the way `pg` attaches one. */
function pgError(code: string, message = ''): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

describe('isLiveClaim', () => {
  it('is true for attributed and redeemed, false for released', () => {
    expect(isLiveClaim('attributed')).toBe(true);
    expect(isLiveClaim('redeemed')).toBe(true);
    expect(isLiveClaim('released')).toBe(false);
  });
});

describe('attributeCoupon: the (none) -> attributed transition', () => {
  it('reserves a claim when the coupon is active, not expired, and has room', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] }) // gate check
      .mockResolvedValueOnce({ rows: [] }) // no existing live claim
      .mockResolvedValueOnce({ rows: [claimRow()] }); // insert

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({
      reason: 'ok',
      claim: expect.objectContaining({ id: 'claim-1', status: CLAIM_STATUS_ATTRIBUTED }),
    });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO platform_coupon_redemptions'),
      ['coupon-1', 'user-1', null, 'link']
    );
  });

  it('refuses when the coupon does not exist', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    const result = await attributeCoupon(
      { couponId: 'missing', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'inactive' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses an inactive coupon before touching the redemption table', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [gateRow({ is_active: false })] });

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'inactive' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a coupon past its redeem_by date', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({
      rows: [gateRow({ redeem_by: new Date('2020-01-01T00:00:00Z') })],
    });

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'expired' });
  });

  it('refuses a coupon at capacity', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({
      rows: [gateRow({ max_redemptions: 1, redeemed_count: 1 })],
    });

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'exhausted' });
  });

  it('refuses a user who already holds a live claim, without attempting the insert', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-claim' }] });

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'already_claimed' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('maps a lost race (unique violation) on insert to already_claimed', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(pgError('23505', 'duplicate key value violates unique constraint'));

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'already_claimed' });
  });

  it('maps the trigger\'s platform_coupon_expired RAISE to the expired reason', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        pgError('P0001', 'platform_coupon_expired: coupon "FRIENDS12" (coupon-1) expired at 2020-01-01')
      );

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'expired' });
  });

  it('maps the trigger\'s platform_coupon_inactive RAISE to the inactive reason', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        pgError('P0001', 'platform_coupon_inactive: coupon "FRIENDS12" (coupon-1) is not active')
      );

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'inactive' });
  });

  it("maps the trigger's platform_coupon_not_found RAISE to the inactive reason", async () => {
    // Unreachable in practice, given the FK on coupon_id, but the trigger raises this tag
    // defensively (migration 042's comment says so) and this function must still route it somewhere
    // sane rather than falling through to the generic default.
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(pgError('P0001', 'platform_coupon_not_found: coupon coupon-1 does not exist'));

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'inactive' });
  });

  it("maps the trigger's platform_coupon_exhausted RAISE to the exhausted reason", async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        pgError('P0001', 'platform_coupon_exhausted: coupon "FRIENDS12" (coupon-1) has reached its limit of 1 redemption(s)')
      );

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'exhausted' });
  });

  it('degrades an unrecognised trigger RAISE to exhausted, and never leaks the raw message', async () => {
    const { executor, query } = fakeExecutor();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(pgError('P0001', 'Some future trigger message with no recognised tag'));

    const result = await attributeCoupon(
      { couponId: 'coupon-1', userId: 'user-1', source: 'link' },
      executor
    );

    expect(result).toEqual({ reason: 'exhausted' });
    expect(JSON.stringify(result)).not.toContain('recognised tag');
    spy.mockRestore();
  });

  it('rethrows an error it does not recognise as part of the state machine', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [gateRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(pgError('08006', 'connection terminated'));

    await expect(
      attributeCoupon({ couponId: 'coupon-1', userId: 'user-1', source: 'link' }, executor)
    ).rejects.toThrow('connection terminated');
  });
});

describe('resolveActiveClaim', () => {
  it('returns the live claim for a user', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow()] });

    const claim = await resolveActiveClaim('user-1', executor);

    expect(claim).toEqual(expect.objectContaining({ id: 'claim-1' }));
  });

  it('returns null when the user holds no live claim', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    expect(await resolveActiveClaim('user-1', executor)).toBeNull();
  });
});

describe('markRedeemed: the attributed -> redeemed transition', () => {
  const input = {
    userId: 'user-1',
    stripeSubscriptionId: 'sub_123',
    stripeCouponId: 'coupon_stripe_1',
    discountEndsAt: new Date('2027-01-01T00:00:00Z'),
  };

  it('redeems an attributed claim', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] }) // find live claim
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] }); // update

    const result = await markRedeemed(input, executor);

    expect(result.reason).toBe('ok');
    if (result.reason === 'ok') {
      expect(result.claim.status).toBe('redeemed');
    }
  });

  it('is idempotent: redelivering the webhook for an already-redeemed claim is a no-op, not an error', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const result = await markRedeemed(input, executor);

    expect(result.reason).toBe('already_redeemed');
    // Only the lookup ran; nothing was written a second time.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports no_active_claim when the user holds no live claim at all', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    const result = await markRedeemed(input, executor);

    expect(result).toEqual({ reason: 'no_active_claim' });
  });

  it('treats a lost race on the UPDATE as already_redeemed rather than a failure', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE ... WHERE status = 'attributed' matched nothing
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] }); // re-read

    const result = await markRedeemed(input, executor);

    expect(result.reason).toBe('already_redeemed');
  });

  describe('Finding 14: expectedCouponId cross-checks the live claim, not just user_id', () => {
    it('redeems normally when expectedCouponId matches the live claim', async () => {
      const { executor, query } = fakeExecutor();
      query
        .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed', coupon_id: 'coupon-1' })] })
        .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

      const result = await markRedeemed({ ...input, expectedCouponId: 'coupon-1' }, executor);

      expect(result.reason).toBe('ok');
    });

    it('refuses as coupon_mismatch, without writing, when the live claim is for a different coupon', async () => {
      const { executor, query } = fakeExecutor();
      query.mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed', coupon_id: 'coupon-1' })] });

      const result = await markRedeemed({ ...input, expectedCouponId: 'coupon-999' }, executor);

      expect(result).toEqual({
        reason: 'coupon_mismatch',
        claim: expect.objectContaining({ couponId: 'coupon-1' }),
      });
      // Only the lookup ran - the mismatched claim was never touched.
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('refuses as coupon_mismatch even for an already-redeemed claim on a different coupon', async () => {
      const { executor, query } = fakeExecutor();
      query.mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed', coupon_id: 'coupon-1' })] });

      const result = await markRedeemed({ ...input, expectedCouponId: 'coupon-999' }, executor);

      expect(result.reason).toBe('coupon_mismatch');
    });

    it('skips the cross-check entirely when the caller has no expectedCouponId to give', async () => {
      const { executor, query } = fakeExecutor();
      query
        .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed', coupon_id: 'coupon-1' })] })
        .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

      const result = await markRedeemed(input, executor);

      expect(result.reason).toBe('ok');
    });
  });
});

describe('releaseClaim: attributed -> released, and the illegal transitions', () => {
  it('releases an attributed claim', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'released', release_reason: 'operator' })] });

    const result = await releaseClaim('claim-1', 'operator', executor);

    expect(result.reason).toBe('ok');
  });

  it('refuses to release an already-redeemed claim (the illegal transition)', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const result = await releaseClaim('claim-1', 'operator', executor);

    expect(result).toEqual({ reason: 'illegal_transition' });
    // No UPDATE was attempted - the refusal happens before any write.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when the claim is already released', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ status: 'released' })] });

    const result = await releaseClaim('claim-1', 'operator', executor);

    expect(result.reason).toBe('already_released');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports not_found for an unknown id', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    const result = await releaseClaim('missing', 'operator', executor);

    expect(result).toEqual({ reason: 'not_found' });
  });

  it('re-reads on a lost UPDATE race and still refuses if the row turned out redeemed', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [] }) // lost the race
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const result = await releaseClaim('claim-1', 'operator', executor);

    expect(result).toEqual({ reason: 'illegal_transition' });
  });
});

describe('releaseExpiredClaims: the cron sweep', () => {
  it('defaults to the 30-day reservation window and the named release reason', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ status: 'released' })] });

    const result = await releaseExpiredClaims(undefined, executor);

    expect(PLATFORM_CLAIM_RESERVATION_DAYS).toBe(30);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'attributed'"),
      [RELEASE_REASON_RESERVATION_EXPIRED, PLATFORM_CLAIM_RESERVATION_DAYS]
    );
    expect(result).toEqual({
      releasedCount: 1,
      claims: [expect.objectContaining({ status: 'released' })],
    });
  });

  it('honours an explicit window', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    await releaseExpiredClaims(7, executor);

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      RELEASE_REASON_RESERVATION_EXPIRED,
      7,
    ]);
  });
});

describe('backfillStoreId', () => {
  it('fills a still-empty store_id on the live claim', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ store_id: 'store-1' })] });

    const claim = await backfillStoreId('user-1', 'store-1', executor);

    expect(claim).toEqual(expect.objectContaining({ storeId: 'store-1' }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('store_id IS NULL'), [
      'user-1',
      'store-1',
    ]);
  });

  it('is a no-op when there is nothing to backfill', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    expect(await backfillStoreId('user-1', 'store-1', executor)).toBeNull();
  });
});
