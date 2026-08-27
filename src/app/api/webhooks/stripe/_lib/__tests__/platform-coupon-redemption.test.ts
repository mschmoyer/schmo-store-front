/**
 * Redemption close-out: `attributed -> redeemed` off a subscription's discount.
 *
 * `coupon-claims.ts` imports `@/lib/database/connection` at module scope, which pulls in `pg` and
 * crashes under jsdom ("TextEncoder is not defined") unless stubbed — see the note in
 * `coupon-claims.test.ts`. `stripe/client.ts` is stubbed too, since `closeOutPlatformCouponRedemption`
 * only reaches it through the *default* `retrieveCoupon`, which none of these cases exercise (every
 * test injects its own `retrieveCoupon`). Both `jest.mock` specifiers are relative, not `@/...` -
 * `next/jest` does not map that alias for `jest.mock` calls.
 *
 * Per `CLAUDE.md`'s "Mocks" rule, `markRedeemed`'s real logic is exercised through an injected fake
 * `Queryable` (the same pattern `coupon-claims.test.ts` uses), not by mocking `coupon-claims.ts`
 * itself - so what is under test here includes the real `attributed -> redeemed` transition, not a
 * stand-in for it.
 */
jest.mock('../../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));
jest.mock('../../../../../../lib/stripe/client', () => ({
  getStripe: jest.fn(() => {
    throw new Error('getStripe should not be called - every test injects retrieveCoupon');
  }),
}));

import type Stripe from 'stripe';
import { closeOutPlatformCouponRedemption } from '../platform-coupon-redemption';
import type { Queryable } from '@/lib/billing/coupon-claims';

/** A minimal `platform_coupon_redemptions` row, matching `coupon-claims.test.ts`'s fixture shape. */
function claimRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'claim-1',
    coupon_id: 'coupon-1',
    user_id: 'user-1',
    store_id: 'store-1',
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

/** A fake `Queryable` whose `query` resolves in the order configured. */
function fakeExecutor(): { executor: Queryable; query: ReturnType<typeof jest.fn> } {
  const query = jest.fn();
  return { executor: { query } as unknown as Queryable, query };
}

/**
 * A fake coupon retriever, typed to the shape `closeOutPlatformCouponRedemption` expects.
 *
 * `@types/jest` is not a dependency of this repo, so `jest.fn()`'s inferred `Mock<UnknownFunction>`
 * does not structurally satisfy a concrete function type without a cast - the same reason
 * `coupon-claims.test.ts`'s `fakeExecutor` casts through `unknown`.
 */
function fakeRetriever(): {
  retrieveCoupon: (couponId: string) => Promise<Stripe.Coupon>;
  mock: ReturnType<typeof jest.fn>;
} {
  const mock = jest.fn();
  return { retrieveCoupon: mock as unknown as (couponId: string) => Promise<Stripe.Coupon>, mock };
}

/** A Stripe coupon carrying our own platform-signup metadata, as `describeStripeCouponFor` builds it. */
function platformCoupon(overrides: Partial<Stripe.Coupon> = {}): Stripe.Coupon {
  return {
    id: 'rebelshops-platform-coupon-coupon-1',
    object: 'coupon',
    percent_off: 100,
    duration: 'repeating',
    duration_in_months: 12,
    metadata: { managed_by: 'rebelshops', scope: 'platform_signup', platform_coupon_id: 'coupon-1', code: 'FRIENDS12' },
    ...overrides,
  } as Stripe.Coupon;
}

/** A minimal subscription carrying one expanded discount around the given coupon. */
function subscriptionWithCoupon(
  coupon: Stripe.Coupon | string | null,
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  const discounts = coupon
    ? [
        {
          id: 'di_1',
          object: 'discount',
          source: { type: 'coupon', coupon },
        },
      ]
    : [];

  return {
    id: 'sub_123',
    object: 'subscription',
    start_date: Math.floor(new Date('2026-08-27T00:00:00Z').getTime() / 1000),
    discounts,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('closeOutPlatformCouponRedemption', () => {
  it('redeems the live claim when the subscription carries a platform signup coupon', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] }) // markRedeemed: find live claim
      .mockResolvedValueOnce({
        rows: [
          claimRow({
            status: 'redeemed',
            stripe_subscription_id: 'sub_123',
            stripe_coupon_id: 'rebelshops-platform-coupon-coupon-1',
            discount_ends_at: new Date('2027-08-27T00:00:00Z'),
          }),
        ],
      }); // markRedeemed: UPDATE

    const subscription = subscriptionWithCoupon(platformCoupon());
    const result = await closeOutPlatformCouponRedemption(
      { ownerId: 'user-1', subscription },
      { executor }
    );

    expect(result).toEqual({ outcome: 'redeemed' });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE platform_coupon_redemptions'),
      ['claim-1', 'sub_123', 'rebelshops-platform-coupon-coupon-1', new Date('2027-08-27T00:00:00Z')]
    );
  });

  it('computes discountEndsAt from the subscription start date and the coupon duration', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const subscription = subscriptionWithCoupon(
      platformCoupon({ duration_in_months: 6 }),
      { start_date: Math.floor(new Date('2026-03-15T00:00:00Z').getTime() / 1000) }
    );

    await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    const [, params] = query.mock.calls[1] as [string, unknown[]];
    expect(params[3]).toEqual(new Date('2026-09-15T00:00:00Z'));
  });

  it('records a null discountEndsAt for a forever coupon - meaningful, not missing', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const subscription = subscriptionWithCoupon(
      platformCoupon({ duration: 'forever', duration_in_months: null })
    );

    await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    const [, params] = query.mock.calls[1] as [string, unknown[]];
    expect(params[3]).toBeNull();
  });

  it('resolves an unexpanded (string) coupon id via the injected retriever', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] });

    const { retrieveCoupon, mock: retrieveCouponMock } = fakeRetriever();
    retrieveCouponMock.mockResolvedValue(platformCoupon());
    const subscription = subscriptionWithCoupon('rebelshops-platform-coupon-coupon-1');

    const result = await closeOutPlatformCouponRedemption(
      { ownerId: 'user-1', subscription },
      { executor, retrieveCoupon }
    );

    expect(retrieveCouponMock).toHaveBeenCalledWith('rebelshops-platform-coupon-coupon-1');
    expect(result).toEqual({ outcome: 'redeemed' });
  });

  it('is idempotent: redelivering the webhook for an already-redeemed claim is a no-op', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] }); // already redeemed

    const subscription = subscriptionWithCoupon(platformCoupon());
    const result = await closeOutPlatformCouponRedemption(
      { ownerId: 'user-1', subscription },
      { executor }
    );

    expect(result).toEqual({ outcome: 'already_redeemed' });
    // Only the lookup ran - no second write for a repeat delivery.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('two calls for the same redelivered event settle on exactly one redeemed claim', async () => {
    const { executor, query } = fakeExecutor();
    query
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'attributed' })] })
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] }) // first delivery redeems
      .mockResolvedValueOnce({ rows: [claimRow({ status: 'redeemed' })] }); // second delivery's lookup

    const subscription = subscriptionWithCoupon(platformCoupon());

    const first = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });
    const second = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    expect(first).toEqual({ outcome: 'redeemed' });
    expect(second).toEqual({ outcome: 'already_redeemed' });
    expect(query).toHaveBeenCalledTimes(3); // find+update, then find only
  });

  it('returns no_owner without touching the database when there is nothing to attribute to', async () => {
    const { executor, query } = fakeExecutor();
    const subscription = subscriptionWithCoupon(platformCoupon());

    const result = await closeOutPlatformCouponRedemption({ ownerId: null, subscription }, { executor });

    expect(result).toEqual({ outcome: 'no_owner' });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns no_platform_coupon for a subscription with no discount at all', async () => {
    const { executor, query } = fakeExecutor();
    const subscription = subscriptionWithCoupon(null);

    const result = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    expect(result).toEqual({ outcome: 'no_platform_coupon' });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns no_platform_coupon for a discount that is not one of ours (e.g. the intro coupon)', async () => {
    const { executor, query } = fakeExecutor();
    const introCoupon = {
      id: 'rebelshops-intro-3mo',
      object: 'coupon',
      percent_off: null,
      duration: 'repeating',
      duration_in_months: 3,
      metadata: {},
    } as unknown as Stripe.Coupon;

    const subscription = subscriptionWithCoupon(introCoupon);
    const result = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    expect(result).toEqual({ outcome: 'no_platform_coupon' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports no_active_claim without throwing when the user holds no live claim', async () => {
    const { executor, query } = fakeExecutor();
    query.mockResolvedValueOnce({ rows: [] });

    const subscription = subscriptionWithCoupon(platformCoupon());
    const result = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    expect(result).toEqual({ outcome: 'no_active_claim' });
  });

  it('never throws: a coupon-resolution failure is caught and reported as a typed error outcome', async () => {
    const { executor } = fakeExecutor();
    const { retrieveCoupon, mock: retrieveCouponMock } = fakeRetriever();
    retrieveCouponMock.mockRejectedValue(new Error('Stripe is down'));
    const subscription = subscriptionWithCoupon('some-unexpanded-id');

    const result = await closeOutPlatformCouponRedemption(
      { ownerId: 'user-1', subscription },
      { executor, retrieveCoupon }
    );

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toBe('Stripe is down');
  });

  it('never throws: a markRedeemed failure is caught and reported as a typed error outcome, ' +
    'so the caller can log and continue', async () => {
    const { executor, query } = fakeExecutor();
    query.mockRejectedValueOnce(new Error('connection terminated'));

    const subscription = subscriptionWithCoupon(platformCoupon());
    const result = await closeOutPlatformCouponRedemption({ ownerId: 'user-1', subscription }, { executor });

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toBe('connection terminated');
  });
});
