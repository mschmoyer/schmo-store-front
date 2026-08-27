/**
 * `nextChargeCents` and `describePendingOffer` — the decisions behind `GET /api/billing/status`.
 *
 * `nextChargeCents` covers staff-review finding 3: a subscription mirror where `introAmountCents`
 * is known but `introEndsAt` is `null` means a *forever* discount, not "no discount" — the two must
 * not collapse into the same "charge full price" answer.
 *
 * `describePendingOffer` covers findings 1 and 2 for the not-yet-subscribed quote, mirroring
 * `checkout/decide.ts`'s `resolvePlatformCouponDiscount` tests: a `redeemed` claim is never quoted
 * again, and a claim's coupon is re-checked for redeemability before being quoted.
 *
 * No database, no Next.js request, no `jose`: every dependency is injected.
 */

// `decide.ts` imports `CLAIM_STATUS_ATTRIBUTED` from `coupon-claims.ts`, which imports
// `@/lib/database/connection` at module scope - that pulls in `pg`, which touches `TextEncoder` at
// import time and crashes under this repo's jsdom test environment. Nothing here ever calls the
// stub; every database-backed function this test exercises is injected instead. The path must be
// relative - `next/jest` does not map the `@/...` alias for `jest.mock`.
jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import {
  nextChargeCents,
  describePendingOffer,
  type NextChargeInput,
  type DescribePendingOfferDeps,
} from '../decide';
import type { PlatformCouponClaimRecord } from '@/lib/billing/coupon-claims';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import { PLATFORM_LIST_AMOUNT_CENTS } from '@/lib/billing/intro-offer';

/** A subscription mirror's `nextChargeCents` inputs, full price with no discount unless overridden. */
function subscription(overrides: Partial<NextChargeInput> = {}): NextChargeInput {
  return {
    unitAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
    introAmountCents: null,
    introEndsAt: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

describe('nextChargeCents', () => {
  it('charges list price when there has never been a discount', () => {
    expect(nextChargeCents(subscription())).toBe(PLATFORM_LIST_AMOUNT_CENTS);
  });

  it('Finding 3: charges the discounted amount for a forever coupon (introEndsAt null, ' +
    'introAmountCents known) - the exact comp-account bug from the review', () => {
    const result = nextChargeCents(
      subscription({ introAmountCents: 0, introEndsAt: null })
    );

    // Before the fix, this returned PLATFORM_LIST_AMOUNT_CENTS ($19.99) for a 100%-off-forever
    // coupon, because `introEndsAt === null` was read as "no discount" instead of "never ends".
    expect(result).toBe(0);
  });

  it('charges a non-zero forever discount correctly too (not just the 100%-off case)', () => {
    const result = nextChargeCents(
      subscription({ introAmountCents: 1500, introEndsAt: null })
    );

    expect(result).toBe(1500);
  });

  it('charges the discounted amount while a dated window is still open', () => {
    const result = nextChargeCents(
      subscription({
        introAmountCents: 999,
        introEndsAt: new Date('2027-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      })
    );

    expect(result).toBe(999);
  });

  it('reverts to list price once a dated window has closed', () => {
    const result = nextChargeCents(
      subscription({
        introAmountCents: 999,
        introEndsAt: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      })
    );

    expect(result).toBe(PLATFORM_LIST_AMOUNT_CENTS);
  });

  it('charges the discounted amount when the next period end is not yet known', () => {
    const result = nextChargeCents(
      subscription({ introAmountCents: 999, introEndsAt: new Date('2027-01-01T00:00:00Z'), currentPeriodEnd: null })
    );

    expect(result).toBe(999);
  });

  it('falls back to PLATFORM_LIST_AMOUNT_CENTS when unitAmountCents is unknown', () => {
    expect(nextChargeCents(subscription({ unitAmountCents: null }))).toBe(PLATFORM_LIST_AMOUNT_CENTS);
  });
});

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
 * A `jest.fn()` mock pre-configured to resolve to `value` — see the identical helper (and its doc
 * comment explaining the `@types/jest`-less typing workaround) in `checkout/__tests__/decide.test.ts`.
 */
function mockResolving<T>(value: T): ReturnType<typeof jest.fn> {
  const fn: ReturnType<typeof jest.fn> = jest.fn();
  fn.mockResolvedValue(value);
  return fn;
}

type FakeDeps = DescribePendingOfferDeps & {
  resolveActiveClaim: ReturnType<typeof jest.fn>;
  getPlatformCouponById: ReturnType<typeof jest.fn>;
};

function fakeDeps(overrides: Partial<Record<keyof FakeDeps, ReturnType<typeof jest.fn>>> = {}): FakeDeps {
  return {
    resolveActiveClaim: mockResolving(null),
    getPlatformCouponById: mockResolving(null),
    ...overrides,
  } as unknown as FakeDeps;
}

describe('describePendingOffer', () => {
  it('quotes the intro offer when the merchant holds no claim', async () => {
    const deps = fakeDeps();

    const result = await describePendingOffer('user-1', deps);

    expect(result.kind).toBe('intro');
  });

  it('quotes an attributed claim`s coupon', async () => {
    const theCoupon = coupon();
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(theCoupon),
    });

    const result = await describePendingOffer('user-1', deps);

    expect(result.kind).toBe('platform_coupon');
    expect(result.code).toBe('FRIENDS12');
    expect(result.amountDueTodayCents).toBe(0);
  });

  it('Finding 1: never quotes a redeemed claim - it already paid out on an earlier subscription', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'redeemed' })),
    });

    const result = await describePendingOffer('user-1', deps);

    expect(result.kind).toBe('intro');
    expect(deps.getPlatformCouponById).not.toHaveBeenCalled();
  });

  it('Finding 2: falls through to the intro offer for an attributed claim whose coupon was ' +
    'deactivated since', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(coupon({ isActive: false })),
    });

    const result = await describePendingOffer('user-1', deps);

    expect(result.kind).toBe('intro');
  });

  it('Finding 2: falls through to the intro offer for an attributed claim whose coupon passed redeem_by', async () => {
    const deps = fakeDeps({
      resolveActiveClaim: mockResolving(claim({ status: 'attributed' })),
      getPlatformCouponById: mockResolving(coupon({ redeemBy: new Date('2020-01-01T00:00:00Z') })),
    });

    const result = await describePendingOffer('user-1', deps);

    expect(result.kind).toBe('intro');
  });
});
