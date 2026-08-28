/**
 * `POST /api/onboarding/account` — step 1.
 *
 * Creates the user, signs them in, and opens the durable onboarding record.
 * Everything after this point can be resumed, because from here on there is a
 * user row to hang progress off.
 *
 * A duplicate email is a 409 with the copy deck's exact sentence, not a 500 —
 * the old `/api/stores/create` handler let the unique-violation reach the
 * catch-all and told the merchant "Internal server error".
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, createSession } from '@/lib/auth/session';
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
 * Create the merchant's account and start their onboarding run.
 *
 * @param request - JSON body: email, password, firstName, lastName
 * @returns 201 with the resumable onboarding state, or a field-level 400/409
 */
export async function POST(request: NextRequest) {
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
