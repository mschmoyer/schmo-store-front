/**
 * @jest-environment node
 */

/**
 * The three flags that decide whether Clerk is on and whether the legacy login still exists.
 *
 * Every read is lazy, so these tests just move `process.env` between calls — if any of them
 * regresses to a module-scope read, the second assertion in each block starts failing.
 */

import {
  hasClerkPublishableKey,
  isClerkConfigured,
  isNativeLoginEnabled,
} from '@/lib/auth/clerk-config';

const KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'ENABLE_NATIVE_LOGIN',
  'VERCEL_ENV',
] as const;

/** `NODE_ENV` is typed as a fixed union, so write it through a plain record view. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe('clerk-config', () => {
  const saved: Record<string, string | undefined> = {};
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    setNodeEnv(savedNodeEnv);
  });

  describe('isClerkConfigured', () => {
    it('needs both halves of the key pair', () => {
      expect(isClerkConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_x';
      expect(isClerkConfigured()).toBe(false);

      process.env.CLERK_SECRET_KEY = 'sk_test_x';
      expect(isClerkConfigured()).toBe(true);
    });

    it('treats whitespace as unset', () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = '   ';
      process.env.CLERK_SECRET_KEY = 'sk_test_x';
      expect(isClerkConfigured()).toBe(false);
    });
  });

  describe('hasClerkPublishableKey', () => {
    it('ignores the secret key, which a browser never has', () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_x';
      expect(hasClerkPublishableKey()).toBe(true);
      expect(isClerkConfigured()).toBe(false);
    });
  });

  describe('isNativeLoginEnabled', () => {
    it('honours an explicit "true" or "false", in production too', () => {
      setNodeEnv('production');

      process.env.ENABLE_NATIVE_LOGIN = 'true';
      expect(isNativeLoginEnabled()).toBe(true);

      process.env.ENABLE_NATIVE_LOGIN = 'false';
      expect(isNativeLoginEnabled()).toBe(false);
    });

    it('defaults to enabled outside production and disabled in it', () => {
      setNodeEnv('development');
      expect(isNativeLoginEnabled()).toBe(true);

      setNodeEnv('test');
      expect(isNativeLoginEnabled()).toBe(true);

      setNodeEnv('production');
      expect(isNativeLoginEnabled()).toBe(false);
    });

    it('keys the production default off VERCEL_ENV, not NODE_ENV, so previews stay open', () => {
      // Vercel sets NODE_ENV=production for preview builds too; only the production deployment
      // carries VERCEL_ENV=production.
      setNodeEnv('production');

      process.env.VERCEL_ENV = 'preview';
      expect(isNativeLoginEnabled()).toBe(true);

      process.env.VERCEL_ENV = 'development';
      expect(isNativeLoginEnabled()).toBe(true);

      process.env.VERCEL_ENV = 'production';
      expect(isNativeLoginEnabled()).toBe(false);
    });

    it('parses on/off tokens case-insensitively', () => {
      setNodeEnv('production');

      for (const on of ['true', 'TRUE', '1', 'yes', 'on', 'On']) {
        process.env.ENABLE_NATIVE_LOGIN = on;
        expect(isNativeLoginEnabled()).toBe(true);
      }
      for (const off of ['false', 'FALSE', '0', 'no', 'off', 'Off']) {
        process.env.ENABLE_NATIVE_LOGIN = off;
        expect(isNativeLoginEnabled()).toBe(false);
      }
    });

    it('falls back to the deployment default for an unrecognised value', () => {
      process.env.ENABLE_NATIVE_LOGIN = 'maybe';

      setNodeEnv('production');
      expect(isNativeLoginEnabled()).toBe(false);

      setNodeEnv('development');
      expect(isNativeLoginEnabled()).toBe(true);
    });
  });
});
