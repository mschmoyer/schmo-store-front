/**
 * `resolvePlatformCouponDiscount` — the precedence decision behind `POST /api/billing/checkout`.
 *
 * Staff review finding 8a: this function had no test of any kind before this file. It covers:
 *
 * - Precedence: a request code beats an attributed claim, which beats the intro offer.
 * - Finding 1: a `redeemed` claim is never honoured as a live reservation.
 * - Finding 2: a deactivated or expired coupon is refused on every claim-driven path, not just for
 *   a fresh code nobody has claimed yet — and the fallback is always the intro offer, never a
 *   silent full-price signup with no explanation.
 * - Exactly one discount is ever returned (the return type is a discriminated union of exactly one
 *   choice, so "two discounts" is not representable — these tests confirm which *one* is chosen).
 *
 * No database, no Next.js request, no `jose`: every dependency is injected, per this module's own
 * doc comment on why it exists apart from `route.ts`.
 */

// `decide.ts` imports `CLAIM_STATUS_ATTRIBUTED` from `coupon-claims.ts`, which imports
// `@/lib/database/connection` at module scope - that pulls in `pg`, which touches `TextEncoder` at
// import time and crashes under this repo's jsdom test environment. Nothing here ever calls the
// stub; every database-backed function this test exercises is injected instead (see `fakeDeps`
// below). The path must be relative - `next/jest` does not map the `@/...` alias for `jest.mock`.
jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { resolvePlatformCouponDiscount, type ResolvePlatformCouponDiscountDeps } from '../decide';
import type { PlatformCouponClaimRecord } from '@/lib/billing/coupon-claims';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';

/** A redeemable `platform_coupons` record, with sane defaults, for building fixtures. */
function coupon(overrides: Partial<PlatformCouponRecord> = {}): PlatformCouponRecord {
  return {
    id: 'coupon-1',
    code: 'FRIENDS12',
    codeNormalized: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    notes: null,
    percentOff: 100,
    durationMonths: 12,
    collectPaymentMethod: false,
    maxRedemptions: null,
    redeemedCount: 1,
    redeemBy: null,
    isActive: true,
    stripeCouponId: 'stripe-coupon-1',
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** A `platform_coupon_redemptions` claim record, with sane defaults, for building fixtures. */
function claim(overrides: Partial<PlatformCouponClaimRecord> = {}): PlatformCouponClaimRecord {
  return {
    id: 'claim-1',
    couponId: 'coupon-1',
    userId: 'user-1',
    storeId: 'store-1',
    status: 'attributed',
    source: 'link',
    attributedAt: new Date('2026-01-01T00:00:00Z'),
    redeemedAt: null,
    releasedAt: null,
    releaseReason: null,
    stripeSubscriptionId: null,
    stripeCouponId: null,
    discountEndsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * A `jest.fn()` mock pre-configured to resolve to `value`.
 *
 * `@types/jest` is not a dependency of this repo, so a bare `jest.fn().mockResolvedValue(x)`
 * concretely infers `Mock<UnknownFunction>`, whose `mockResolvedValue` then demands `never` (there is
 * no declared return type to resolve). Declaring the mock's type as `ReturnType<typeof jest.fn>`
 * first — the type-level alias, not a called instance — widens it to the permissive `Mock<FunctionLike>`
 * jest's own helpers (`coupon-claims.test.ts`'s `fakeExecutor`, etc.) rely on, before configuring it.
 */
function mockResolving<T>(value: T): ReturnType<typeof jest.fn> {
  const fn: ReturnType<typeof jest.fn> = jest.fn();
  fn.mockResolvedValue(value);
  return fn;
}

/**
 * A fully-mocked deps object, typed both as the real dependency shape (what
 * `resolvePlatformCouponDiscount` consumes) and as its underlying `jest.fn()` mocks (what a test
 * asserts against).
 */
type FakeDeps = ResolvePlatformCouponDiscountDeps & {
  resolveActiveClaim: ReturnType<typeof jest.fn>;
  getPlatformCouponByCode: ReturnType<typeof jest.fn>;
  getPlatformCouponById: ReturnType<typeof jest.fn>;
  attributeCoupon: ReturnType<typeof jest.fn>;
};

/**
 * Build a fully-mocked deps object. Every function defaults to "found nothing" / "refused", so a
 * test only has to override the boundaries it actually exercises.
 */
function fakeDeps(
  overrides: Partial<Record<keyof FakeDeps, ReturnType<typeof jest.fn>>> = {}
): FakeDeps {
  return {
    resolveActiveClaim: mockResolving(null),
    getPlatformCouponByCode: mockResolving(null),
    getPlatformCouponById: mockResolving(null),
    attributeCoupon: mockResolving({ reason: 'exhausted' }),
    ...overrides,
  } as unknown as FakeDeps;
}

describe('resolvePlatformCouponDiscount: precedence', () => {
  it('falls to the intro offer when there is no code and no claim', async () => {
    const deps = fakeDeps();

    const result = await resolvePlatformCouponDiscount(undefined, 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: true, discount: { kind: 'intro' } });
    expect(deps.getPlatformCouponByCode).not.toHaveBeenCalled();
  });

  it('honours an attributed claim over the intro offer when no code is supplied', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(theCoupon),
    });

    const result = await resolvePlatformCouponDiscount(undefined, 'user-1', 'store-1', deps);

    expect(result).toEqual({
      ok: true,
      discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: theCoupon },
    });
  });

  it('lets a request code take precedence over an attributed claim on a different coupon', async () => {
    const requested = coupon({ id: 'coupon-2', code: 'OTHER10' });
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ couponId: 'coupon-1', status: 'attributed' })),
      getPlatformCouponByCode: mockResolving(null),
    });
    // The request code resolves to a *different* coupon than the live claim, so the "reuse the
    // existing claim" shortcut must not fire — the mismatch instead falls to `attributeCoupon`,
    // which the real database refuses as `already_claimed` (one live claim per user).
    deps.getPlatformCouponByCode.mockResolvedValue(requested);

    const result = await resolvePlatformCouponDiscount('OTHER10', 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: false, reason: 'exhausted' });
    expect(deps.attributeCoupon).toHaveBeenCalledWith({
      couponId: 'coupon-2',
      userId: 'user-1',
      storeId: 'store-1',
      source: 'billing_form',
    });
  });

  it('reuses the existing attributed claim, without a redundant attributeCoupon call, when the ' +
    'request code matches it', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ couponId: 'coupon-1', status: 'attributed' })),
      getPlatformCouponByCode: mockResolving(theCoupon),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(result).toEqual({
      ok: true,
      discount: { kind: 'platform_coupon', source: 'coupon_claim', coupon: theCoupon },
    });
    expect(deps.attributeCoupon).not.toHaveBeenCalled();
  });

  it('reserves a fresh code via attributeCoupon when the merchant holds no claim at all', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      getPlatformCouponByCode: mockResolving(theCoupon),
      attributeCoupon: mockResolving({ reason: 'ok' }),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(result).toEqual({
      ok: true,
      discount: { kind: 'platform_coupon', source: 'coupon_request', coupon: theCoupon },
    });
    expect(deps.attributeCoupon).toHaveBeenCalledTimes(1);
  });

  it('reports unknown for a code that resolves to nothing, without touching attributeCoupon', async () => {
    const deps = fakeDeps();

    const result = await resolvePlatformCouponDiscount('NOPE', 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: false, reason: 'unknown' });
    expect(deps.attributeCoupon).not.toHaveBeenCalled();
  });
});

describe('resolvePlatformCouponDiscount: Finding 1 - a redeemed claim is never honoured', () => {
  it('treats a redeemed claim exactly like no claim at all when no code is supplied', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'redeemed' })),
    });

    const result = await resolvePlatformCouponDiscount(undefined, 'user-1', 'store-1', deps);

    // This is the exploit from the review: without this fix, the merchant's second subscription
    // would get a fresh discount window from the very coupon that already paid out once.
    expect(result).toEqual({ ok: true, discount: { kind: 'intro' } });
    expect(deps.getPlatformCouponById).not.toHaveBeenCalled();
  });

  it('does not take the "reuse the existing claim" shortcut for a redeemed claim, even when the ' +
    'request code matches it', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ couponId: 'coupon-1', status: 'redeemed' })),
      getPlatformCouponByCode: mockResolving(theCoupon),
      // The real `attributeCoupon` would refuse this: the schema counts a `redeemed` claim as live
      // for `idx_pcr_one_live_per_user`, so a second attribution attempt is rejected as
      // `already_claimed` — never a second free discount window on the same coupon.
      attributeCoupon: mockResolving({ reason: 'already_claimed' }),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(deps.attributeCoupon).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: 'already_claimed' });
  });
});

describe('resolvePlatformCouponDiscount: Finding 2 - deactivated/expired coupons are refused', () => {
  it('falls through to the intro offer, not the dead coupon, for an attributed claim whose ' +
    'coupon was deactivated since', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(coupon({ isActive: false })),
    });

    const result = await resolvePlatformCouponDiscount(undefined, 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: true, discount: { kind: 'intro' } });
  });

  it('falls through to the intro offer for an attributed claim whose coupon has passed redeem_by', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(
        coupon({ redeemBy: new Date('2020-01-01T00:00:00Z') })
      ),
    });

    const result = await resolvePlatformCouponDiscount(undefined, 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: true, discount: { kind: 'intro' } });
  });

  it('refuses a request code that matches the held claim once the coupon is deactivated, rather ' +
    'than silently reusing it', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ couponId: 'coupon-1', status: 'attributed' })),
      getPlatformCouponByCode: mockResolving(coupon({ isActive: false })),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: false, reason: 'inactive' });
    expect(deps.attributeCoupon).not.toHaveBeenCalled();
  });

  it('refuses a fresh, never-claimed request code that is exhausted, before attempting to attribute it', async () => {
    const deps = fakeDeps({
      getPlatformCouponByCode: mockResolving(
        coupon({ maxRedemptions: 1, redeemedCount: 1 })
      ),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(result).toEqual({ ok: false, reason: 'exhausted' });
    expect(deps.attributeCoupon).not.toHaveBeenCalled();
  });
});

describe('resolvePlatformCouponDiscount: exactly one discount is ever chosen', () => {
  it('a request code that succeeds never carries the intro offer alongside it', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      getPlatformCouponByCode: mockResolving(theCoupon),
      attributeCoupon: mockResolving({ reason: 'ok' }),
    });

    const result = await resolvePlatformCouponDiscount('FRIENDS12', 'user-1', 'store-1', deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discount.kind).toBe('platform_coupon');
    }
  });
});
