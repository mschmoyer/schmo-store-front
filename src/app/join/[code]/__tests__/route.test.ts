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
import { db } from '@/lib/database/connection';
import { resetRateLimits } from '@/lib/ai/rate-limit';
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

// The rate limiter (`src/lib/ai/rate-limit.ts`) keeps its counts in a module-level `Map` that
// outlives any one `it()`. Resetting before every test keeps this file's tests independent of each
// other and of run order, rather than relying on distinct IPs alone.
beforeEach(() => {
  resetRateLimits();
});

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

describe('GET /join/[code]: rate limiting by IP (staff review finding 4)', () => {
  const VALID_ROW = {
    id: 'coupon-1',
    code: 'VALIDCODE',
    code_normalized: 'VALIDCODE',
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
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };

  /** A request carrying an `x-forwarded-for` header, the way Vercel and most proxies set it. */
  function requestFrom(ip: string, url: string): NextRequest {
    return new NextRequest(url, { headers: { 'x-forwarded-for': ip } });
  }

  beforeEach(() => {
    // A database that would say "yes, valid" every time — so the only thing that can turn a
    // request into the failure redirect is the rate limiter itself, never the (stubbed) database
    // disagreeing.
    (db.query as unknown as ReturnType<typeof jest.fn>).mockResolvedValue({ rows: [VALID_ROW] });
  });

  it('lets an under-limit caller through to the real decision', async () => {
    const response = await GET(requestFrom('203.0.113.5', 'http://localhost:3000/join/VALIDCODE'), {
      params: Promise.resolve({ code: 'VALIDCODE' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/create-store?coupon=VALIDCODE');
    expect(response.cookies.get(PLATFORM_COUPON_COOKIE)?.value).toBe('VALIDCODE');
  });

  it('degrades to the ordinary failure redirect once one IP trips the limit — never a distinct response, and never reaching the database that would have said "valid"', async () => {
    const ip = '203.0.113.9';
    const url = 'http://localhost:3000/join/VALIDCODE';
    const params = { params: Promise.resolve({ code: 'VALIDCODE' }) };

    let last: Awaited<ReturnType<typeof GET>> | undefined;
    // One more than the limit — the first 20 from this IP still see the real (valid) decision.
    for (let i = 0; i < 21; i += 1) {
      last = await GET(requestFrom(ip, url), params);
    }

    // Same shape as any other failed code: a 302 to the ordinary `coupon_error=unknown` redirect,
    // with no cookie — a distinguishable "you've been rate limited" response would itself tell an
    // attacker their guessing was noticed, which is exactly what plan §9's rate-limiting requirement
    // is trying to avoid leaking.
    expect(last?.status).toBe(302);
    expect(last?.headers.get('location')).toBe('http://localhost:3000/create-store?coupon_error=unknown');
    expect(last?.cookies.get(PLATFORM_COUPON_COOKIE)).toBeUndefined();
  });

  it('scopes the limit per IP: a fresh address is unaffected by another IP being exhausted', async () => {
    const exhaustedIp = '203.0.113.10';
    const freshIp = '203.0.113.11';
    const url = 'http://localhost:3000/join/VALIDCODE';
    const params = { params: Promise.resolve({ code: 'VALIDCODE' }) };

    for (let i = 0; i < 25; i += 1) {
      await GET(requestFrom(exhaustedIp, url), params);
    }

    const response = await GET(requestFrom(freshIp, url), params);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/create-store?coupon=VALIDCODE');
    expect(response.cookies.get(PLATFORM_COUPON_COOKIE)?.value).toBe('VALIDCODE');
  });
});
