/**
 * @jest-environment node
 */

/**
 * `requireAuth`'s resolution order, and the one thing `ENABLE_NATIVE_LOGIN=false` has to guarantee:
 * a legacy JWT authenticates nothing once the flag is off. A kill switch that still honours tokens
 * already in the wild is not a kill switch, and those tokens live seven days and cannot be revoked.
 *
 * `@clerk/nextjs/server` is mocked because there is no Clerk key and no egress to clerk.com here;
 * `clerk-user` is mocked because resolution's *order* is what this file is about, not the SQL
 * behind it (that is `clerk-user.test.ts`). The database module is mocked as the neighbouring
 * suites do — importing it for real pulls in `pg`.
 *
 * `jose` is stubbed for a mechanical reason, not a design one: it ships ESM only, and `next/jest`
 * hard-codes `/node_modules/` into `transformIgnorePatterns` so nothing here can transform it. The
 * stub round-trips the claims and enforces issuer/audience, which is what this file's assertions
 * depend on; the real signing is exercised wherever a token crosses a process boundary.
 */

jest.mock('jose', () => {
  interface Claims {
    [key: string]: unknown;
    iss?: string;
    aud?: string;
  }

  class SignJWT {
    private readonly claims: Claims;

    constructor(payload: Claims) {
      this.claims = { ...payload };
    }
    setProtectedHeader(): this {
      return this;
    }
    setIssuedAt(): this {
      return this;
    }
    setIssuer(issuer: string): this {
      this.claims.iss = issuer;
      return this;
    }
    setAudience(audience: string): this {
      this.claims.aud = audience;
      return this;
    }
    setExpirationTime(): this {
      return this;
    }
    async sign(): Promise<string> {
      return `stub.${Buffer.from(JSON.stringify(this.claims)).toString('base64url')}`;
    }
  }

  async function jwtVerify(
    token: string,
    _secret: Uint8Array,
    options: { issuer: string; audience: string }
  ): Promise<{ payload: Claims }> {
    if (!token.startsWith('stub.')) throw new Error('invalid token');
    const payload = JSON.parse(Buffer.from(token.slice(5), 'base64url').toString()) as Claims;
    if (payload.iss !== options.issuer || payload.aud !== options.audience) {
      throw new Error('invalid token');
    }
    return { payload };
  }

  return { SignJWT, jwtVerify };
});

jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

/** `@types/jest` is not a dependency, so the mocks are typed through this loose shape. */
type LooseMock = ReturnType<typeof jest.fn> & {
  mockResolvedValue(value: unknown): void;
  mockRejectedValue(value: unknown): void;
};

const mockAuth = jest.fn() as unknown as LooseMock;
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth() }));

const mockResolveUserByClerkId = jest.fn() as unknown as LooseMock;
jest.mock('../clerk-user', () => {
  const actual = jest.requireActual('../clerk-user') as Record<string, unknown>;
  return {
    ...actual,
    resolveUserByClerkId: (...args: unknown[]) => mockResolveUserByClerkId(...args),
  };
});

import { ClerkUserLinkError } from '@/lib/auth/clerk-user';
import { createSession, requireAuth, resolveSession } from '@/lib/auth/session';

/** A merchant as the legacy JWT carries them. */
const LEGACY = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'legacy@example.com',
  firstName: 'Legacy',
  lastName: 'User',
  storeId: '22222222-2222-2222-2222-222222222222',
  storeSlug: 'legacy-store',
  storeName: 'Legacy Store',
};

/** The same merchant, as resolved from a Clerk session. */
const FROM_CLERK = { ...LEGACY, email: 'clerk@example.com', firstName: 'Clerk' };

const ENV_KEYS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'ENABLE_NATIVE_LOGIN',
] as const;

/** Turn Clerk's keys on or off for one test. */
function configureClerk(on: boolean): void {
  if (on) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_x';
    process.env.CLERK_SECRET_KEY = 'sk_test_x';
  } else {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
  }
}

/** A request carrying a legacy token as a Bearer header. */
function bearer(token: string): Request {
  return new Request('https://example.com/api/thing', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** A request carrying a legacy token as the `session` cookie. */
function cookie(token: string): Request {
  return new Request('https://example.com/api/thing', {
    headers: { cookie: `session=${token}` },
  });
}

describe('session resolution', () => {
  const saved: Record<string, string | undefined> = {};
  let token: string;

  beforeAll(async () => {
    token = await createSession(LEGACY);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockAuth.mockResolvedValue({ userId: null });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('with native login enabled', () => {
    beforeEach(() => {
      process.env.ENABLE_NATIVE_LOGIN = 'true';
    });

    it('accepts a legacy Bearer token when Clerk is not configured', async () => {
      configureClerk(false);
      await expect(requireAuth(bearer(token))).resolves.toMatchObject({ email: LEGACY.email });
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('accepts a legacy cookie when Clerk is not configured', async () => {
      configureClerk(false);
      await expect(requireAuth(cookie(token))).resolves.toMatchObject({ email: LEGACY.email });
    });

    it('prefers Clerk over a legacy token when both are present', async () => {
      configureClerk(true);
      mockAuth.mockResolvedValue({ userId: 'user_clerk1' });
      mockResolveUserByClerkId.mockResolvedValue(FROM_CLERK);

      await expect(requireAuth(bearer(token))).resolves.toMatchObject({ email: FROM_CLERK.email });
      expect(mockResolveUserByClerkId).toHaveBeenCalledWith('user_clerk1');
    });

    it('falls back to the legacy token when there is no Clerk session', async () => {
      configureClerk(true);
      mockAuth.mockResolvedValue({ userId: null });

      await expect(requireAuth(bearer(token))).resolves.toMatchObject({ email: LEGACY.email });
    });

    it('falls back when auth() throws for want of middleware context', async () => {
      configureClerk(true);
      mockAuth.mockRejectedValue(new Error('clerkMiddleware() was not run'));

      await expect(requireAuth(bearer(token))).resolves.toMatchObject({ email: LEGACY.email });
    });

    it('refuses the request rather than linking by email, and says so once', async () => {
      configureClerk(true);
      mockAuth.mockResolvedValue({ userId: 'user_clerk1' });
      mockResolveUserByClerkId.mockRejectedValue(
        new ClerkUserLinkError('email_unlinked', 'refusing to auto-link')
      );
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      // No legacy credential on this request: the refusal must not fall through to anything else.
      await expect(requireAuth(new Request('https://example.com/api/thing'))).rejects.toThrow(
        'Authentication required'
      );
      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });
  });

  describe('with native login disabled', () => {
    beforeEach(() => {
      process.env.ENABLE_NATIVE_LOGIN = 'false';
    });

    it('rejects a legacy Bearer token', async () => {
      configureClerk(false);
      await expect(requireAuth(bearer(token))).rejects.toThrow('Authentication required');
    });

    it('rejects a legacy cookie', async () => {
      configureClerk(false);
      await expect(resolveSession(cookie(token))).resolves.toBeNull();
    });

    it('still accepts a Clerk session', async () => {
      configureClerk(true);
      mockAuth.mockResolvedValue({ userId: 'user_clerk1' });
      mockResolveUserByClerkId.mockResolvedValue(FROM_CLERK);

      await expect(requireAuth(cookie(token))).resolves.toMatchObject({ email: FROM_CLERK.email });
    });
  });

  it('stays quiet on a request that carries no credential at all', async () => {
    process.env.ENABLE_NATIVE_LOGIN = 'true';
    configureClerk(false);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(resolveSession(new Request('https://example.com/api/thing'))).resolves.toBeNull();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('stays quiet on a stale or forged legacy token', async () => {
    process.env.ENABLE_NATIVE_LOGIN = 'true';
    configureClerk(false);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(resolveSession(bearer('not.a.jwt'))).resolves.toBeNull();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
