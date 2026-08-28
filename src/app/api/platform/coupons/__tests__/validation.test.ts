/**
 * `validateCreateCouponBody`'s operator-supplied `code` rules (staff review finding 4).
 *
 * Before this, any 1-48 character string was accepted, which made a human-chosen code like
 * `FRIENDS12` realistic and — with no rate limit on `/join/[code]` — enumerable at bandwidth speed.
 * This file exercises the new floor and character rule directly; `/join`'s own rate limiting is
 * covered in `src/app/join/[code]/__tests__/route.test.ts`.
 */

// `../validation` imports `@/lib/platform/coupons` for its `PlatformCouponFilter`/`PlatformCouponPatch`
// types, which imports `@/lib/database/connection` at module scope — that drags in `pg`, which
// touches `TextEncoder` and throws under the jsdom test environment. The path must be relative:
// `next/jest` does not map the `@/` alias for `jest.mock` specifiers, only for imports (see
// `join/[code]/__tests__/route.test.ts`).
jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { MIN_COUPON_CODE_LENGTH, validateCreateCouponBody } from '../validation';

/** A minimal, otherwise-valid create body, with `code` overridable per test. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Launch friends, 1 year',
    percentOff: 100,
    ...overrides,
  };
}

describe('validateCreateCouponBody: the code floor and character rule', () => {
  it('accepts no code at all (the server generates one)', () => {
    const result = validateCreateCouponBody(body());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.code).toBeNull();
  });

  it(`refuses a code shorter than ${MIN_COUPON_CODE_LENGTH} characters`, () => {
    const result = validateCreateCouponBody(body({ code: 'AB12' }));
    expect(result).toEqual({
      ok: false,
      error: { field: 'code', message: `Code must be at least ${MIN_COUPON_CODE_LENGTH} characters.` },
    });
  });

  it(`accepts a code exactly ${MIN_COUPON_CODE_LENGTH} characters long`, () => {
    const code = 'A'.repeat(MIN_COUPON_CODE_LENGTH);
    const result = validateCreateCouponBody(body({ code }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.code).toBe(code);
  });

  it('refuses a code carrying whitespace inside it', () => {
    const result = validateCreateCouponBody(body({ code: 'FRIENDS 12' }));
    expect(result).toEqual({
      ok: false,
      error: { field: 'code', message: 'Code may only contain letters, numbers, hyphens and underscores.' },
    });
  });

  it('refuses a code carrying punctuation outside hyphen/underscore', () => {
    const result = validateCreateCouponBody(body({ code: 'FRIENDS!!' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('code');
  });

  it('accepts hyphens and underscores', () => {
    const result = validateCreateCouponBody(body({ code: 'friends-and_family' }));
    expect(result.ok).toBe(true);
  });

  it('checks length against the trimmed code, not the raw one', () => {
    // Padding a too-short code with surrounding whitespace must not sneak it past the floor.
    const result = validateCreateCouponBody(body({ code: '  AB12  ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('code');
  });
});
