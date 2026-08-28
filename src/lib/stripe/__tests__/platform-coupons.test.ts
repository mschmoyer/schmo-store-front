// `platform/coupons.ts` is imported here for its types and for `setStripeCouponId`, and it pulls in
// `pg` through the connection module. The Node driver needs Web Crypto globals that jsdom does not
// provide, so the connection module is stubbed — nothing below calls it, since every function under
// test takes an injected `Queryable`. (The path must be relative: `next/jest` does not map the `@/`
// alias for `jest.mock` specifiers, only for imports.) Same note as
// `src/lib/billing/__tests__/coupons.test.ts`.
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import type Stripe from 'stripe';
import {
  deriveStripeCouponId,
  deriveSubscriptionParams,
  describeStripeCouponFor,
  ensureStripeCouponFor,
} from '../platform-coupons';
import type { PlatformCouponRecord, Queryable } from '@/lib/platform/coupons';

/**
 * Build a fake `platform_coupons` row, defaulting to a 100%-off, forever, no-card-required coupon
 * and overridden per test.
 *
 * @param overrides - Fields that matter to the case under test.
 * @returns A fully-populated {@link PlatformCouponRecord}.
 */
function buildCoupon(overrides: Partial<PlatformCouponRecord> = {}): PlatformCouponRecord {
  return {
    id: 'coupon-uuid-1',
    code: 'FRIENDS12',
    codeNormalized: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    notes: null,
    percentOff: 100,
    durationMonths: 12,
    collectPaymentMethod: false,
    maxRedemptions: null,
    redeemedCount: 0,
    redeemBy: null,
    isActive: true,
    stripeCouponId: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * A minimal Stripe coupon fixture, shaped like what `coupons.retrieve` / `coupons.create` return.
 *
 * @param overrides - Fields that matter to the case under test.
 * @returns An object shaped like `Stripe.Coupon`.
 */
function stripeCoupon(overrides: Partial<Stripe.Coupon> = {}): Stripe.Coupon {
  return {
    id: 'rebelshops-platform-coupon-coupon-uuid-1',
    object: 'coupon',
    percent_off: 100,
    duration: 'repeating',
    duration_in_months: 12,
    name: 'Launch friends, 1 year',
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Coupon;
}

/**
 * A Stripe double whose `coupons.retrieve` / `coupons.create` behavior is supplied per test, plus a
 * record of every call made — the injected-boundary pattern `connect.test.ts` already uses in this
 * directory, so the real resolve-or-create logic runs rather than a mocked module.
 */
function stripeDouble(config: {
  retrieve?: (id: string) => Promise<Stripe.Coupon>;
  create?: (params: Stripe.CouponCreateParams) => Promise<Stripe.Coupon>;
}): {
  stripe: Stripe;
  createCalls: Stripe.CouponCreateParams[];
  retrieveCalls: string[];
} {
  const createCalls: Stripe.CouponCreateParams[] = [];
  const retrieveCalls: string[] = [];

  const stripe = {
    coupons: {
      retrieve: async (id: string) => {
        retrieveCalls.push(id);
        if (config.retrieve) {
          return config.retrieve(id);
        }
        throw Object.assign(new Error('No default retrieve configured'), {
          code: 'resource_missing',
        });
      },
      create: async (params: Stripe.CouponCreateParams) => {
        createCalls.push(params);
        if (config.create) {
          return config.create(params);
        }
        return stripeCoupon({ id: params.id ?? 'generated-id' });
      },
    },
  } as unknown as Stripe;

  return { stripe, createCalls, retrieveCalls };
}

/** A fake `Queryable` that records every `setStripeCouponId` UPDATE it sees. */
function fakeExecutor(): { executor: Queryable; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const executor: Queryable = {
    query: async <T extends Record<string, unknown> = Record<string, unknown>>(
      _text: string,
      params: unknown[] = []
    ) => {
      calls.push(params);
      // Mirrors setStripeCouponId's RETURNING shape closely enough for toRecord() to succeed.
      const row = {
        id: params[0],
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
        stripe_coupon_id: params[1],
        created_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      return { rows: [row as unknown as T], rowCount: 1 };
    },
  };
  return { executor, calls };
}

describe('describeStripeCouponFor', () => {
  it('shapes a forever coupon (durationMonths: null) with duration "forever" and no duration_in_months', () => {
    const params = describeStripeCouponFor(buildCoupon({ durationMonths: null }));

    expect(params.duration).toBe('forever');
    expect(params.duration_in_months).toBeUndefined();
    expect(params.percent_off).toBe(100);
  });

  it('shapes a repeating coupon with duration_in_months set', () => {
    const params = describeStripeCouponFor(buildCoupon({ durationMonths: 6, percentOff: 50 }));

    expect(params.duration).toBe('repeating');
    expect(params.duration_in_months).toBe(6);
    expect(params.percent_off).toBe(50);
  });

  it('uses the deterministic id derived from the platform coupon uuid', () => {
    const coupon = buildCoupon({ id: 'abc-123' });
    expect(describeStripeCouponFor(coupon).id).toBe(deriveStripeCouponId('abc-123'));
    // Calling it twice must produce the same id -- that is what makes a retry safe.
    expect(describeStripeCouponFor(coupon).id).toBe(describeStripeCouponFor(coupon).id);
  });

  it('carries metadata naming the platform coupon', () => {
    const coupon = buildCoupon({ id: 'abc-123', code: 'FRIENDS12' });
    const params = describeStripeCouponFor(coupon);

    expect(params.metadata).toEqual({
      managed_by: 'rebelshops',
      scope: 'platform_signup',
      platform_coupon_id: 'abc-123',
      code: 'FRIENDS12',
    });
  });

  it('never sets max_redemptions, for a one-time coupon or otherwise', () => {
    const oneTime = buildCoupon({ maxRedemptions: 1 });
    const capped = buildCoupon({ maxRedemptions: 50 });
    const uncapped = buildCoupon({ maxRedemptions: null });

    for (const coupon of [oneTime, capped, uncapped]) {
      const params = describeStripeCouponFor(coupon);
      expect(params).not.toHaveProperty('max_redemptions');
      expect((params as Record<string, unknown>).max_redemptions).toBeUndefined();
    }
  });
});

describe('ensureStripeCouponFor', () => {
  it('creates a coupon and persists the id when none is stored yet', async () => {
    const coupon = buildCoupon({ stripeCouponId: null });
    const { stripe, createCalls } = stripeDouble({});
    const { executor, calls } = fakeExecutor();

    const result = await ensureStripeCouponFor(coupon, stripe, executor);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].id).toBe(deriveStripeCouponId(coupon.id));
    expect(createCalls[0]).not.toHaveProperty('max_redemptions');
    expect(result.id).toBe(deriveStripeCouponId(coupon.id));

    // Persisted via setStripeCouponId(coupon.id, created.id, executor).
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([coupon.id, deriveStripeCouponId(coupon.id)]);
  });

  it('retrieves and returns the existing coupon when its economics agree with the row', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'existing-id', percentOff: 100, durationMonths: 12 });
    const { stripe, retrieveCalls, createCalls } = stripeDouble({
      retrieve: async () => stripeCoupon({ id: 'existing-id', percent_off: 100, duration: 'repeating', duration_in_months: 12 }),
    });
    const { executor, calls } = fakeExecutor();

    const result = await ensureStripeCouponFor(coupon, stripe, executor);

    expect(retrieveCalls).toEqual(['existing-id']);
    expect(createCalls).toHaveLength(0);
    expect(calls).toHaveLength(0); // nothing new to persist
    expect(result.id).toBe('existing-id');
  });

  it('recreates and persists a replacement when the stored coupon is resource_missing', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'deleted-id' });
    const { stripe, retrieveCalls, createCalls } = stripeDouble({
      retrieve: async () => {
        throw Object.assign(new Error('No such coupon'), { code: 'resource_missing' });
      },
    });
    const { executor, calls } = fakeExecutor();

    const result = await ensureStripeCouponFor(coupon, stripe, executor);

    expect(retrieveCalls).toEqual(['deleted-id']);
    expect(createCalls).toHaveLength(1);
    expect(result.id).toBe(deriveStripeCouponId(coupon.id));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([coupon.id, deriveStripeCouponId(coupon.id)]);
  });

  it('propagates a non-resource_missing retrieve error rather than recreating', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'existing-id' });
    const { stripe, createCalls } = stripeDouble({
      retrieve: async () => {
        throw Object.assign(new Error('rate limited'), { code: 'rate_limit' });
      },
    });
    const { executor } = fakeExecutor();

    await expect(ensureStripeCouponFor(coupon, stripe, executor)).rejects.toThrow('rate limited');
    expect(createCalls).toHaveLength(0);
  });

  it('throws, naming both sides, when the retrieved coupon disagrees on percent_off', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'existing-id', percentOff: 100, durationMonths: 12 });
    const { stripe } = stripeDouble({
      retrieve: async () =>
        stripeCoupon({ id: 'existing-id', percent_off: 50, duration: 'repeating', duration_in_months: 12 }),
    });
    const { executor } = fakeExecutor();

    await expect(ensureStripeCouponFor(coupon, stripe, executor)).rejects.toThrow(
      /percent_off=100[\s\S]*percent_off=50/
    );
  });

  it('throws, naming both sides, when the retrieved coupon disagrees on duration', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'existing-id', percentOff: 100, durationMonths: null });
    const { stripe } = stripeDouble({
      retrieve: async () =>
        stripeCoupon({ id: 'existing-id', percent_off: 100, duration: 'repeating', duration_in_months: 12 }),
    });
    const { executor } = fakeExecutor();

    await expect(ensureStripeCouponFor(coupon, stripe, executor)).rejects.toThrow(
      /duration=forever[\s\S]*duration=repeating/
    );
  });

  it('throws when duration matches but duration_in_months disagrees', async () => {
    const coupon = buildCoupon({ stripeCouponId: 'existing-id', percentOff: 100, durationMonths: 6 });
    const { stripe } = stripeDouble({
      retrieve: async () =>
        stripeCoupon({ id: 'existing-id', percent_off: 100, duration: 'repeating', duration_in_months: 12 }),
    });
    const { executor } = fakeExecutor();

    await expect(ensureStripeCouponFor(coupon, stripe, executor)).rejects.toThrow('Coupons are immutable');
  });
});

describe('deriveSubscriptionParams', () => {
  it('sets payment_method_collection: if_required only at percent_off 100 with collectPaymentMethod false', () => {
    const coupon = buildCoupon({
      stripeCouponId: 'stripe-id-1',
      percentOff: 100,
      collectPaymentMethod: false,
    });

    const params = deriveSubscriptionParams(coupon);

    expect(params.discounts).toEqual([{ coupon: 'stripe-id-1' }]);
    expect(params.paymentMethodCollection).toBe('if_required');
  });

  it('does not set payment_method_collection for a partial discount even with collectPaymentMethod false', () => {
    // The schema forbids this combination, but requiresPaymentMethod() computes the honest answer
    // regardless -- deriveSubscriptionParams must defer to it rather than trusting the flag alone.
    const coupon = buildCoupon({
      stripeCouponId: 'stripe-id-2',
      percentOff: 50,
      collectPaymentMethod: false,
    });

    const params = deriveSubscriptionParams(coupon);

    expect(params.discounts).toEqual([{ coupon: 'stripe-id-2' }]);
    expect(params.paymentMethodCollection).toBeUndefined();
  });

  it('does not set payment_method_collection when collectPaymentMethod is true, even at 100% off', () => {
    const coupon = buildCoupon({
      stripeCouponId: 'stripe-id-3',
      percentOff: 100,
      collectPaymentMethod: true,
    });

    const params = deriveSubscriptionParams(coupon);

    expect(params.paymentMethodCollection).toBeUndefined();
  });

  it('throws when the coupon has not been resolved to a Stripe coupon yet', () => {
    const coupon = buildCoupon({ stripeCouponId: null });

    expect(() => deriveSubscriptionParams(coupon)).toThrow('stripeCouponId');
  });
});
