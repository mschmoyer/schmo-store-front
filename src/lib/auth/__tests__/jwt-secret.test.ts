/**
 * `JWT_SECRET` validation.
 *
 * Two things are being protected here, and the second is the one that bit.
 *
 * 1. **Auth fails closed.** A missing, short, or published-placeholder secret
 *    must throw rather than silently signing tokens anyone could forge. This is
 *    the documented exception to "every integration degrades gracefully".
 *
 * 2. **Importing a module must never be what throws.** The first version of
 *    this validated at module load. `Customizer.tsx` is a client component that
 *    imports `previewUrl` from `@/lib/storefront-theme`, whose index re-exports
 *    `preview.ts`, which imports the secret module — and `process.env.JWT_SECRET`
 *    is undefined in a browser bundle. The throw fired on import and took the
 *    entire customizer preview pane down. Six e2e tests caught it; **CI runs
 *    lint, typecheck, unit tests, migrations and a build, not the e2e suite**,
 *    so nothing in CI would have. Hence the import test below, which lives in
 *    the suite that does run.
 */

describe('getJwtSecret', () => {
  const original = process.env.JWT_SECRET;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.JWT_SECRET = original;
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true });
    jest.resetModules();
  });

  /**
   * Load a fresh copy of the module with a given secret.
   * @param value - The secret to place in the environment, or undefined to unset
   * @param nodeEnv - The NODE_ENV to run under
   * @returns The freshly loaded module
   */
  function load(value: string | undefined, nodeEnv = 'production') {
    jest.resetModules();
    if (value === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = value;
    Object.defineProperty(process.env, 'NODE_ENV', { value: nodeEnv, configurable: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../jwt-secret') as typeof import('../jwt-secret');
  }

  it('returns a good secret', () => {
    const good = 'k'.repeat(48);
    expect(load(good).getJwtSecret()).toBe(good);
  });

  it('throws when the secret is missing', () => {
    expect(() => load(undefined).getJwtSecret()).toThrow(/JWT_SECRET is not set/);
  });

  it('throws when the secret is too short', () => {
    expect(() => load('short').getJwtSecret()).toThrow(/at least 32 are required/);
  });

  it('throws on the literal this repository used to fall back to', () => {
    // Publicly known: anyone could mint a session for any store with it.
    expect(() => load('your-secret-key-here').getJwtSecret()).toThrow(/placeholder/);
  });

  it('throws on the placeholder .env.example ships', () => {
    expect(() => load('change-me-in-every-environment').getJwtSecret()).toThrow(/placeholder/);
  });

  it('trims surrounding whitespace before judging length', () => {
    const good = 'k'.repeat(48);
    expect(load(`  ${good}  `).getJwtSecret()).toBe(good);
    expect(() => load(`  ${'k'.repeat(8)}  `).getJwtSecret()).toThrow(/at least 32/);
  });

  it('supplies a deterministic stand-in under NODE_ENV=test only', () => {
    // So the unit suite needs no environment. A production build never takes
    // this branch, because NODE_ENV is `test` only under Jest.
    expect(load(undefined, 'test').getJwtSecret()).toMatch(/test-only/);
    expect(() => load(undefined, 'development').getJwtSecret()).toThrow(/not set/);
  });

  it('caches after the first successful read', () => {
    const good = 'k'.repeat(48);
    const loaded = load(good);
    expect(loaded.getJwtSecret()).toBe(good);
    // Changing the environment afterwards must not change the answer, or two
    // tokens in one process could be signed with different keys.
    process.env.JWT_SECRET = 'z'.repeat(48);
    expect(loaded.getJwtSecret()).toBe(good);
    loaded.resetJwtSecretCache();
    expect(loaded.getJwtSecret()).toBe('z'.repeat(48));
  });
});

describe('importing does not throw', () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = original;
    jest.resetModules();
  });

  it('lets the storefront-theme entry point load with no secret present', () => {
    // The regression this file exists for. `Customizer.tsx` ('use client')
    // imports `previewUrl` from this entry point, and a browser bundle has no
    // JWT_SECRET. Validation must therefore be lazy: importing is harmless,
    // and only signing or verifying demands a good secret.
    jest.resetModules();
    delete process.env.JWT_SECRET;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const theme = require('../../storefront-theme') as { previewUrl: unknown };
      expect(typeof theme.previewUrl).toBe('function');
    }).not.toThrow();
  });

  // There is deliberately no equivalent test for `auth/session.ts`: it imports
  // `jose`, which is ESM and untransformed by this Jest setup, so a `require`
  // of it fails for reasons that have nothing to do with the secret. The lazy
  // read is the same one this file already proves, and `session.ts` is server
  // -only anyway -- the client-bundle path that actually broke goes through
  // `storefront-theme`, which is covered above.
});
