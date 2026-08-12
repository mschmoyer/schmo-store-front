/**
 * @jest-environment node
 */

/**
 * Logout has to actually delete the session cookie.
 *
 * The bug these cover: `NextResponse.cookies` is a map keyed by cookie *name*, so clearing
 * `session` on two paths through it kept only the last write. The `/` deletion - the one that
 * matters, since that is where `/api/onboarding/account` sets it - was silently dropped, and a
 * signed-out visitor kept a live session for the cookie's full seven days.
 */

import { NextResponse } from 'next/server';
import { SESSION_COOKIE, clearSessionCookie } from '../session-cookie';

/**
 * Collect every `Set-Cookie` header on a response.
 *
 * @param response - The response to read.
 * @returns One string per header.
 */
function setCookieHeaders(response: NextResponse): string[] {
  return response.headers.getSetCookie();
}

describe('clearSessionCookie', () => {
  it('emits a separate Set-Cookie per path rather than overwriting itself', () => {
    const headers = setCookieHeaders(clearSessionCookie(NextResponse.json({})));

    expect(headers).toHaveLength(2);
    // Both paths the cookie has ever been written to must be cleared. `/` is the one
    // `/api/onboarding/account` sets and every route reads; `/api/auth` is the legacy default-path
    // left by the login route before it passed `path`.
    expect(headers.some((header) => /Path=\/;/.test(header))).toBe(true);
    expect(headers.some((header) => header.includes('Path=/api/auth'))).toBe(true);
  });

  it('expires the cookie rather than setting a value', () => {
    for (const header of setCookieHeaders(clearSessionCookie(NextResponse.json({})))) {
      expect(header).toContain(`${SESSION_COOKIE}=;`);
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      expect(header).toContain('HttpOnly');
    }
  });

  it('keeps the response body intact', async () => {
    const response = clearSessionCookie(NextResponse.json({ success: true }));
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
