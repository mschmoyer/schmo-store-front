/**
 * The session cookie: its name, the paths it can live on, and how to expire it.
 *
 * Deliberately free of any JWT dependency. Signing lives in `./session`, which pulls in `jose`;
 * this module is pure string work so the routes that only need to *clear* a cookie - and the tests
 * that check they do - never have to load a crypto library to find out.
 */

import type { NextResponse } from 'next/server';

/** The httpOnly cookie every server route reads the signed-in user from. */
export const SESSION_COOKIE = 'session';

/**
 * Paths the session cookie has ever been written to.
 *
 * A cookie can only be deleted from the exact path it was set on. `/api/auth/login` originally
 * omitted `path`, so browsers stored it under the request's directory - `/api/auth` - while
 * `/api/onboarding/account` set it on `/`. Both must be cleared or a stale one survives logout and
 * silently signs the user back in.
 */
const SESSION_COOKIE_PATHS = ['/', '/api/auth'] as const;

/**
 * Expire the session cookie on every path it could be sitting on.
 *
 * Logging out has to work even when the token is already invalid, so this never inspects it.
 *
 * The headers are appended by hand rather than set through `response.cookies`, which is a map
 * keyed by cookie *name*: setting `session` twice there keeps only the last entry, so the `/`
 * deletion would be silently dropped and the cookie that actually matters would survive logout.
 * Two paths need two `Set-Cookie` headers.
 *
 * @param response - The response to attach the deletions to.
 * @returns The same response, for chaining.
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  for (const path of SESSION_COOKIE_PATHS) {
    response.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ` +
        `HttpOnly; SameSite=Lax${secure}`
    );
  }

  return response;
}
