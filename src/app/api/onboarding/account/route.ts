/**
 * `POST /api/onboarding/account` — step 1, in two modes.
 *
 * Opens the durable onboarding record. Everything after this point can be
 * resumed, because from here on there is a user row to hang progress off.
 *
 * **Clerk mode.** The merchant already signed up with Clerk, so they already
 * have an identity and (through just-in-time provisioning) a `users` row. There
 * is no email or password to validate and nothing to create: this route only
 * opens their onboarding row and returns the same state the native path does.
 * No session cookie is set — Clerk's own cookie is what authenticates them, and
 * minting a legacy JWT alongside it would put back the dual-transport bug class
 * the migration exists to remove. The client sends no body in this mode.
 *
 * **Native mode.** The legacy path, behind `ENABLE_NATIVE_LOGIN`: create the
 * user, sign them in, open the record. When the flag is off this route will not
 * create a password account at all — it 404s, exactly as the login routes do,
 * rather than quietly making an account nobody can ever sign into.
 *
 * A duplicate email is a 409 with the copy deck's exact sentence, not a 500 —
 * the old `/api/stores/create` handler let the unique-violation reach the
 * catch-all and told the merchant "Internal server error".
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { hashPassword } from '@/lib/auth/password';
import {
  SESSION_COOKIE,
  createSession,
  getSessionFromClerk,
  type UserSession,
} from '@/lib/auth/session';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import {
  validateEmail,
  validateName,
  validatePassword,
} from '@/components/onboarding/lib/password';
import {
  PLATFORM_COUPON_COOKIE,
  attributeCouponFromCookie,
  buildState,
  loadOrCreateRow,
  originOf,
} from '../_lib/state';

interface AccountRequest {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

const EMAIL_TAKEN = 'An account already uses this email. Sign in instead.';

/**
 * Open (or resume) the onboarding run for a merchant Clerk has already authenticated.
 *
 * Creates nothing but the onboarding row itself — the `users` row exists, because
 * `getSessionFromClerk` provisioned it just in time if it did not. Same response shape as the
 * native path so the wizard needs no second branch, and deliberately no `session` cookie.
 *
 * @param request - The incoming request, read for the `/join` coupon cookie.
 * @param session - The authenticated merchant.
 * @returns 201 with the resumable onboarding state.
 */
async function openForClerkUser(request: NextRequest, session: UserSession) {
  try {
    const initialRow = await loadOrCreateRow(session);
    // Signup-coupon attribution belongs to a genuine new signup only. The native path is naturally
    // once-per-account (a duplicate email 409s), but this Clerk path is re-callable by any linked
    // merchant — `ClerkAccountStep` POSTs `{}` on mount. An established merchant who already owns a
    // store visiting `/join/<code>` then `/create-store` would otherwise attribute a signup offer to
    // their old account. Gate on "no store yet", the same freshness the native flow has by
    // construction. A coupon failure must never fail this step — see attributeCouponFromCookie's doc.
    const row = initialRow.store_id
      ? initialRow
      : await attributeCouponFromCookie(request, session, initialRow);
    const state = await buildState({ session, row }, originOf(request));

    const response = NextResponse.json(
      { message: "Account created. Let's connect ShipStation.", state },
      { status: 201 }
    );
    response.cookies.delete(PLATFORM_COUPON_COOKIE);
    return response;
  } catch (error) {
    console.error('[onboarding/account] clerk mode failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}

/**
 * Create the merchant's account and start their onboarding run.
 *
 * @param request - JSON body: email, password, firstName, lastName
 * @returns 201 with the resumable onboarding state, or a field-level 400/409
 */
export async function POST(request: NextRequest) {
  if (isClerkConfigured()) {
    const clerkSession = await getSessionFromClerk(request);
    if (clerkSession) return openForClerkUser(request, clerkSession);
  }

  // Past this point everything is the password flow, which does not exist when native login is
  // off. 404 rather than 400 or 403, matching /api/auth/login: a switched-off endpoint is absent.
  if (!isNativeLoginEnabled()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  let body: AccountRequest;
  try {
    body = (await request.json()) as AccountRequest;
  } catch {
    return NextResponse.json({ message: 'This field is required' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();

  // The server runs the same validators the form runs. The meter is a courtesy;
  // this is the rule.
  const fieldErrors: Record<string, string> = {};
  const emailError = validateEmail(email);
  if (emailError) fieldErrors.email = emailError;
  const passwordError = validatePassword(password);
  if (passwordError) fieldErrors.password = passwordError;
  const firstNameError = validateName(firstName, 'first');
  if (firstNameError) fieldErrors.firstName = firstNameError;
  const lastNameError = validateName(lastName, 'last');
  if (lastNameError) fieldErrors.lastName = lastNameError;

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { message: 'Check the highlighted fields.', fieldErrors },
      { status: 400 }
    );
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    let userId: string;
    try {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, is_active)
         VALUES ($1, $2, $3, $4, false, true)
         RETURNING id`,
        [email, passwordHash, firstName, lastName]
      );
      userId = String(inserted.rows[0].id);
    } catch (error) {
      // Two merchants racing on the same address: still a 409, never a 500.
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } },
          { status: 409 }
        );
      }
      throw error;
    }

    const session = { userId, email, firstName, lastName };
    const token = await createSession(session);
    const initialRow = await loadOrCreateRow(session);
    // A coupon failure here must never fail account creation — see attributeCouponFromCookie's doc.
    const row = await attributeCouponFromCookie(request, session, initialRow);
    const state = await buildState({ session, row }, originOf(request));

    const response = NextResponse.json(
      { message: "Account created. Let's connect ShipStation.", state },
      { status: 201 }
    );
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    // Cookie's job is done; the wizard renders from `state.coupon` from here on.
    response.cookies.delete(PLATFORM_COUPON_COOKIE);
    return response;
  } catch (error) {
    console.error('[onboarding/account] failed:', error);
    return NextResponse.json(
      { message: 'Something broke on our end. We’ve been notified.' },
      { status: 500 }
    );
  }
}
