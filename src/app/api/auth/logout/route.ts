/**
 * POST /api/auth/logout
 *
 * Ends the browser's session by expiring the `session` cookie.
 *
 * This route did not exist before, which is the whole reason logging out did not log you out:
 * `/api/admin/auth/logout` only dropped the `admin_token` from `localStorage`, and the httpOnly
 * `session` cookie - the one every server route actually reads - stayed valid for its full seven
 * days. `/create-store` resumes from that cookie by design, so a signed-out visitor was handed
 * their previous store's half-finished wizard instead of a blank one.
 *
 * It always succeeds. A logout that can fail leaves the user stuck signed in, so nothing here
 * verifies the token first: an expired, forged or absent cookie gets the same expiry response.
 */

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign the browser out.
 *
 * @returns JSON confirming the session cookie has been expired.
 */
export async function POST(): Promise<NextResponse> {
  return clearSessionCookie(
    NextResponse.json({ success: true, message: 'Signed out' })
  );
}
