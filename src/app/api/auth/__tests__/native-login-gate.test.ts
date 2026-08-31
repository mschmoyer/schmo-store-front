/**
 * @jest-environment node
 */

/**
 * `ENABLE_NATIVE_LOGIN=false` closes the password endpoints.
 *
 * Both login routes and the native half of onboarding must 404 — the same answer a route that does
 * not exist gives — and must do it *before* reading the body, so a switched-off endpoint neither
 * validates an address nor spends a bcrypt comparison on one. Logout is deliberately not covered
 * here: clearing a cookie has to keep working whatever else is off.
 *
 * The database and password modules are mocked so a leak past the gate would be visible as a call
 * rather than as a connection attempt.
 */

// `jose` is ESM-only and `next/jest` will not transform node_modules. Neither path under test
// reaches it (no session is ever minted here), so an empty stand-in is enough to let the route
// module load.
jest.mock('jose', () => ({ SignJWT: class {}, jwtVerify: jest.fn() }));

jest.mock('../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));
jest.mock('../../../../lib/auth/password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

import { db } from '@/lib/database/connection';
import { verifyPassword } from '@/lib/auth/password';
import { POST as merchantLogin } from '../login/route';
import { POST as adminLogin } from '../../admin/auth/login/route';

type Mock = ReturnType<typeof jest.fn>;
const mockQuery = db.query as unknown as Mock;
const mockVerify = verifyPassword as unknown as Mock;

/** A login attempt. `NextRequest` is not needed — the handlers only call `.json()`. */
function loginRequest(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'merchant@example.com', password: 'hunter2hunter2' }),
  });
}

const ROUTES: ReadonlyArray<[string, (request: never) => Promise<Response>, string]> = [
  ['/api/auth/login', merchantLogin as never, 'https://example.com/api/auth/login'],
  ['/api/admin/auth/login', adminLogin as never, 'https://example.com/api/admin/auth/login'],
];

describe('native login gate', () => {
  const saved = process.env.ENABLE_NATIVE_LOGIN;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ENABLE_NATIVE_LOGIN;
    else process.env.ENABLE_NATIVE_LOGIN = saved;
  });

  describe.each(ROUTES)('%s', (_name, handler, url) => {
    it('404s with no body read when native login is disabled', async () => {
      process.env.ENABLE_NATIVE_LOGIN = 'false';

      const response = await handler(loginRequest(url) as never);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ message: 'Not found' });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('still runs the password flow when native login is enabled', async () => {
      process.env.ENABLE_NATIVE_LOGIN = 'true';
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await handler(loginRequest(url) as never);

      expect(response.status).not.toBe(404);
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
