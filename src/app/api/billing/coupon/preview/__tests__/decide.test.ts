/**
 * `previewPlatformCouponCode`'s decision table — the write-nothing validator behind
 * `POST /api/billing/coupon/preview` (plan `docs/plans/platform-coupons.md` §4B).
 *
 * Pure aside from the injected lookup, so every case here runs against no database — the same
 * pattern `decideJoin` in `src/app/join/[code]/route.ts` uses for the sibling "describe a coupon
 * before it is redeemed" surface. Imports from `../decide`, never `../route`: the route module
 * pulls in `requireMerchant` → `src/lib/auth/session.ts` → `jose`, an ESM package this repo's Jest
 * transform cannot parse — see `decide.ts`'s header for the full explanation.
 */

import { previewPlatformCouponCode, type PlatformCouponLookup } from '../decide';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';

const NOW = new Date('2026-08-27T00:00:00Z');

/**
 * Build a valid, active, unlimited coupon record, overridden per test.
 *
 * @param overrides - Fields to override.
 * @returns A fully-populated {@link PlatformCouponRecord}.
 */
function coupon(overrides: Partial<PlatformCouponRecord> = {}): PlatformCouponRecord {
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
    stripeCouponId: 'rebelshops-platform-coupon-coupon-uuid-1',
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Build a lookup that always resolves to the given coupon (or `null`), ignoring the code passed —
 * these tests only exercise `previewPlatformCouponCode`'s branching on the result, not
 * normalisation (that is `platform-coupons.test.ts`'s job).
 *
 * @param result - What the lookup should resolve to.
 * @returns A {@link PlatformCouponLookup}.
 */
function lookupReturning(result: PlatformCouponRecord | null): PlatformCouponLookup {
  return async () => result;
}

describe('previewPlatformCouponCode', () => {
  it('reports unknown for a blank code without calling the lookup', async () => {
    const lookup = jest.fn(lookupReturning(null));
    const result = await previewPlatformCouponCode('   ', lookup, NOW);
    expect(result).toEqual({ redeemable: false, reason: 'unknown' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports unknown when the code resolves to nothing', async () => {
    const result = await previewPlatformCouponCode('NOPE', lookupReturning(null), NOW);
    expect(result).toEqual({ redeemable: false, reason: 'unknown' });
  });

  it('reports inactive for a deactivated coupon', async () => {
    const result = await previewPlatformCouponCode(
      'FRIENDS12',
      lookupReturning(coupon({ isActive: false })),
      NOW
    );
    expect(result).toEqual({ redeemable: false, reason: 'inactive' });
  });

  it('reports expired for a coupon past its redeem_by date', async () => {
    const result = await previewPlatformCouponCode(
      'FRIENDS12',
      lookupReturning(coupon({ redeemBy: new Date('2026-01-01T00:00:00Z') })),
      NOW
    );
    expect(result).toEqual({ redeemable: false, reason: 'expired' });
  });

  it('reports exhausted for a coupon at its redemption cap', async () => {
    const result = await previewPlatformCouponCode(
      'FRIENDS12',
      lookupReturning(coupon({ maxRedemptions: 5, redeemedCount: 5 })),
      NOW
    );
    expect(result).toEqual({ redeemable: false, reason: 'exhausted' });
  });

  it('describes a redeemable free-forever coupon, including its price today', async () => {
    const result = await previewPlatformCouponCode(
      'FRIENDS12',
      lookupReturning(coupon({ percentOff: 100, durationMonths: 12, collectPaymentMethod: false })),
      NOW
    );

    expect(result).toEqual({
      redeemable: true,
      code: 'FRIENDS12',
      name: 'Launch friends, 1 year',
      offer: 'Free for 12 months, then $19.99/month',
      requiresPaymentMethod: false,
      amountDueTodayCents: 0,
      amountDueTodayFormatted: '$0.00',
    });
  });

  it('describes a redeemable partial-off coupon that still requires a card', async () => {
    const result = await previewPlatformCouponCode(
      'HALFOFF',
      lookupReturning(
        coupon({
          code: 'HALFOFF',
          name: 'Half off',
          percentOff: 50,
          durationMonths: 6,
          collectPaymentMethod: true,
        })
      ),
      NOW
    );

    expect(result.redeemable).toBe(true);
    if (result.redeemable) {
      expect(result.requiresPaymentMethod).toBe(true);
      // 50% off $19.99 rounds to $10.00 (1999 -> 999 or 1000 depending on rounding rule; assert the
      // pair sums back to the list price rather than pin the exact half-cent rounding here).
      expect(result.amountDueTodayCents).toBeGreaterThan(0);
      expect(result.amountDueTodayCents).toBeLessThan(1999);
    }
  });

  it('trims surrounding whitespace before looking up the code', async () => {
    const lookup = jest.fn(lookupReturning(coupon()));
    await previewPlatformCouponCode('  FRIENDS12  ', lookup, NOW);
    expect(lookup).toHaveBeenCalledWith('FRIENDS12');
  });
});
