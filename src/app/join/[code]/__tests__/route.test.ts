/**
 * @jest-environment node
 */

/**
 * `/join/<code>`'s decision table: valid / unknown / expired / exhausted / inactive → cookie set (or
 * not) and redirect target — plan `docs/plans/platform-coupons.md` §4A/§9/§12.
 *
 * `decideJoin` takes its coupon lookup as a parameter, so every row below is exercised by injecting
 * a fake lookup rather than mocking `getPlatformCouponByCode` or touching a database — per
 * `CLAUDE.md`'s "Mocks" rule, the real decision logic runs, only the network/database boundary is
 * substituted.
 *
 * The `node` environment (matching `storefront/click/__tests__/route.test.ts`) is required to import
 * `next/server` at all: `NextRequest`/`NextResponse` extend the platform `Request`/`Response`
 * globals, which the default jsdom environment does not provide. `route.ts` names its cookie from
 * `../../../../api/onboarding/_lib/coupon-cookie` rather than the onboarding state module
 * specifically so this import stays cheap — see that module's own note.
 *
 * `../../../../lib/database/connection` is still stubbed below, the same way `coupon-claims.test.ts`
 * and `coupons.test.ts` stub it: importing `route.ts` pulls in `getPlatformCouponByCode`
 * (`src/lib/platform/coupons.ts`), which imports the real connection module. Nothing here ever calls
 * the stub — every `decideJoin` call below is given a fake lookup instead of the real one — this only
 * exists so the two `GET` wiring tests below (which do go through the real `getPlatformCouponByCode`)
 * hit a predictable "no such row" failure instead of attempting a live database connection. (The path
 * must be relative: `next/jest` does not map the `@/` alias for `jest.mock` specifiers, only for
 * imports.)
 */
jest.mock('../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { NextRequest } from 'next/server';
import {
  GET,
  PLATFORM_COUPON_COOKIE,
  decideJoin,
  type PlatformCouponLookup,
} from '../route';
import type { PlatformCoupon } from '@/lib/billing/platform-coupons';

/** A redeemable coupon, with sane defaults, for building fixtures. */
function coupon(overrides: Partial<PlatformCoupon> = {}): PlatformCoupon {
  return {
    code: 'FRIENDS12',
    name: 'Launch friends, 1 year',
    percentOff: 100,
    durationMonths: 12,
    collectPaymentMethod: false,
    maxRedemptions: null,
    redeemedCount: 0,
    redeemBy: null,
    isActive: true,
    ...overrides,
  };
}

/** A lookup that resolves to a fixed coupon (or `null`), ignoring the code it is called with. */
function lookupReturning(result: PlatformCoupon | null): PlatformCouponLookup {
  return async () => result;
}

const NOW = new Date('2026-08-27T00:00:00Z');

describe('decideJoin: the decision table', () => {
  it('valid: sets the cookie and redirects with the confirmation query param', async () => {
    const decision = await decideJoin('friends12', lookupReturning(coupon()), NOW);

    expect(decision).toEqual({ cookieCode: 'FRIENDS12', redirectPath: '/create-store?coupon=FRIENDS12' });
  });

  it('unknown: no matching coupon sets no cookie and redirects with coupon_error=unknown', async () => {
    const decision = await decideJoin('NOSUCHCODE', lookupReturning(null), NOW);

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=unknown' });
  });

  it('unknown: an empty code segment never reaches the lookup', async () => {
    const lookup = jest.fn();
    const decision = await decideJoin('   ', lookup as unknown as PlatformCouponLookup, NOW);

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=unknown' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('unknown: a lookup failure degrades to unknown rather than throwing', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: PlatformCouponLookup = async () => {
      throw new Error('connection terminated');
    };

    const decision = await decideJoin('FRIENDS12', failing, NOW);

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=unknown' });
    spy.mockRestore();
  });

  it('expired: past redeem_by sets no cookie and redirects with coupon_error=expired', async () => {
    const decision = await decideJoin(
      'FRIENDS12',
      lookupReturning(coupon({ redeemBy: new Date('2020-01-01T00:00:00Z') })),
      NOW
    );

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=expired' });
  });

  it('exhausted: at capacity sets no cookie and redirects with coupon_error=exhausted', async () => {
    const decision = await decideJoin(
      'FRIENDS12',
      lookupReturning(coupon({ maxRedemptions: 1, redeemedCount: 1 })),
      NOW
    );

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=exhausted' });
  });

  it('inactive: a deactivated coupon sets no cookie and redirects with coupon_error=inactive', async () => {
    const decision = await decideJoin('FRIENDS12', lookupReturning(coupon({ isActive: false })), NOW);

    expect(decision).toEqual({ cookieCode: null, redirectPath: '/create-store?coupon_error=inactive' });
  });

  it('inactive takes priority over expired, matching isRedeemable\'s own ordering', async () => {
    const decision = await decideJoin(
      'FRIENDS12',
      lookupReturning(coupon({ isActive: false, redeemBy: new Date('2020-01-01T00:00:00Z') })),
      NOW
    );

    expect(decision.redirectPath).toBe('/create-store?coupon_error=inactive');
  });

  it('uses the coupon\'s issued code, not whatever case the URL used', async () => {
    const decision = await decideJoin(
      'friends12',
      lookupReturning(coupon({ code: 'Friends12' })),
      NOW
    );

    expect(decision).toEqual({ cookieCode: 'Friends12', redirectPath: '/create-store?coupon=Friends12' });
  });
});

describe('GET /join/[code]: wiring the decision into a response', () => {
  /**
   * Build a request for a given code, with a lookup swapped in via `jest.mock` isolation would be
   * overkill — instead the handler is exercised end to end but through cases that either short
   * circuit before the lookup (empty/blank code) or that the fixed test data resolves predictably;
   * everything else is covered by `decideJoin` above.
   */
  function request(url: string): NextRequest {
    return new NextRequest(url);
  }

  it('never 404s and never throws for a code the stubbed database cannot resolve', async () => {
    // The stubbed `db.query` from the module-level mock returns `undefined`, so
    // `getPlatformCouponByCode`'s real code throws reading `.rows` off it — this exercises the real
    // GET handler's wiring end-to-end against exactly that failure, without needing a live Postgres.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await GET(request('http://localhost:3000/join/DOES-NOT-EXIST'), {
      params: Promise.resolve({ code: 'DOES-NOT-EXIST' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/create-store?coupon_error=unknown');
    expect(response.cookies.get(PLATFORM_COUPON_COOKIE)).toBeUndefined();
    spy.mockRestore();
  });

  it('is a 302, never a 404, for an empty code segment', async () => {
    const response = await GET(request('http://localhost:3000/join/'), {
      params: Promise.resolve({ code: '' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/create-store?coupon_error=unknown');
  });
});
