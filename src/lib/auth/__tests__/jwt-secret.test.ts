/**
 * @jest-environment node
 */

/**
 * The session signing key must fail closed in production.
 *
 * The bug this covers: `session.ts` read `process.env.JWT_SECRET || 'your-secret-key-here'`. That
 * literal is committed to this repository, so a deployment with the variable unset signed every
 * session with a key any reader of the source already has — and came up looking healthy while
 * doing it. A forged token naming a known operator's user id passes `jwtVerify`, and the platform
 * guard then looks that id up, finds `is_admin = true`, and opens the whole tenancy.
 *
 * A security reviewer minted exactly that token against this codebase. These tests are the reason
 * they cannot do it again.
 */

import { resolveSigningKey, PUBLIC_FALLBACK_SECRET, MIN_SECRET_LENGTH } from '../jwt-secret';

/** A key of the right shape for production. */
const REAL_SECRET = 'a'.repeat(MIN_SECRET_LENGTH);

describe('resolveSigningKey', () => {
  describe('in production', () => {
    it('refuses to start when JWT_SECRET is unset', () => {
      expect(() => resolveSigningKey({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET is not set/);
    });

    it('refuses the signing key that is published in this repository', () => {
      expect(() =>
        resolveSigningKey({ NODE_ENV: 'production', JWT_SECRET: PUBLIC_FALLBACK_SECRET })
      ).toThrow(/JWT_SECRET is not set/);
    });

    it('refuses a key short enough to brute force', () => {
      expect(() =>
        resolveSigningKey({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(MIN_SECRET_LENGTH - 1) })
      ).toThrow(/at least 32/);
    });

    it('accepts a key of the required length', () => {
      expect(resolveSigningKey({ NODE_ENV: 'production', JWT_SECRET: REAL_SECRET })).toBe(
        REAL_SECRET
      );
    });
  });

  describe('outside production', () => {
    it('falls back so dev and CI need no ceremony', () => {
      expect(resolveSigningKey({ NODE_ENV: 'test' })).toBe(PUBLIC_FALLBACK_SECRET);
      expect(resolveSigningKey({ NODE_ENV: 'development' })).toBe(PUBLIC_FALLBACK_SECRET);
    });

    it('still prefers a configured key when there is one', () => {
      expect(resolveSigningKey({ NODE_ENV: 'development', JWT_SECRET: 'dev-key' })).toBe('dev-key');
    });
  });
});
