/**
 * POST /api/admin/auth/logout
 *
 * Signs the admin out. Expires the httpOnly `session` cookie, which is what every server route
 * reads; the client separately drops its `admin_token` from `localStorage`.
 *
 * Previously this required an `Authorization: Bearer` header and returned 400 or 401 without it -
 * so a user whose token had expired, or who never had one in `localStorage`, could not log out at
 * all, and the session cookie outlived the "logout" by up to seven days. Signing out now never
 * fails and never inspects the token: the point is to end the session, and an invalid token means
 * it should end anyway.
 */

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign the admin out.
 *
 * @returns JSON confirming the session cookie has been expired.
 */
export async function POST(): Promise<NextResponse> {
  return clearSessionCookie(
    NextResponse.json({ success: true, message: 'Logged out successfully' })
  );
}
