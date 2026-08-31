/**
 * Resolving a Clerk session to a `users` row, and creating that row just in time.
 *
 * **The linking rule is the whole point of this file** (docs/plans/clerk-integration.md §3). The
 * only join key between Clerk and this database is `users.clerk_user_id`. Email is never a lookup
 * key on an authenticated path: anyone can register a Clerk account claiming any address, so
 * "there is already a user with this email, use that one" is a one-request account takeover of
 * every merchant on the platform. When JIT creation meets an existing row for the same address
 * that is not linked — or is linked to a *different* Clerk id — it refuses, loudly, and an
 * operator links the row deliberately with `scripts/import-users-to-clerk.mjs --link-owner`.
 *
 * Creation is just-in-time rather than webhook-driven because `user.created` is delivered
 * asynchronously: a merchant who has just signed up hits onboarding before it lands, and a
 * webhook-only design answers their first authenticated request with a 401. The webhook
 * (`/api/webhooks/clerk`) only reconciles afterwards.
 */

import { db } from '@/lib/database/connection';
import type { UserSession } from '@/lib/auth/session';

/** Why {@link resolveUserByClerkId} refused to produce a session. */
export type ClerkLinkRefusal =
  /** Clerk has no verified primary email for this account; we will not create a row without one. */
  | 'unverified_email'
  /** A `users` row holds this address but carries no `clerk_user_id`. Needs a deliberate link. */
  | 'email_unlinked'
  /** A `users` row holds this address and is already linked to a *different* Clerk account. */
  | 'email_linked_elsewhere'
  /** Clerk itself could not be reached, or returned no such user. */
  | 'clerk_unavailable';

/**
 * Thrown when a Clerk session cannot be turned into a `users` row.
 *
 * Callers turn this into a 401 — never a 500, and never a silent fall-through to another identity.
 */
export class ClerkUserLinkError extends Error {
  readonly reason: ClerkLinkRefusal;

  constructor(reason: ClerkLinkRefusal, message: string) {
    super(message);
    this.name = 'ClerkUserLinkError';
    this.reason = reason;
  }
}

/** The fields this module needs from a Clerk user. Deliberately tiny — nothing else is trusted. */
export interface ClerkProfile {
  /** Verified primary email address, lower-cased by the caller of {@link provisionUser}. */
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Injection seam for the Clerk fetch, so this module is testable with no network and no keys. */
export type ClerkProfileFetcher = (clerkUserId: string) => Promise<ClerkProfile>;

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/**
 * A `password_hash` that can never verify.
 *
 * The column is `NOT NULL` until phase 5 drops it, and a Clerk-native user has no password here at
 * all. `'!'` is not a bcrypt hash, so `bcrypt.compare` returns false against it for every input —
 * the row is unsignable-in by construction rather than by a check someone has to remember. The
 * seed uses the same sentinel, and the import script skips rows carrying it.
 */
const NO_PASSWORD_SENTINEL = '!';

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  store_id: string | null;
  store_slug: string | null;
  store_name: string | null;
}

/**
 * Shape a joined `users`/`stores` row as the session every call site already understands.
 *
 * @param row - The joined row.
 * @returns The session. `userId` is always `users.id` — the Clerk id never leaves this module.
 */
function toSession(row: UserRow): UserSession {
  return {
    userId: String(row.id),
    email: String(row.email),
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    storeId: row.store_id ? String(row.store_id) : undefined,
    storeSlug: row.store_slug ? String(row.store_slug) : undefined,
    storeName: row.store_name ? String(row.store_name) : undefined,
  };
}

/**
 * Look up the active user linked to a Clerk id.
 *
 * @param clerkUserId - The Clerk user id from the verified session.
 * @returns The session, or `null` when no active row carries that id.
 */
async function selectByClerkId(clerkUserId: string): Promise<UserSession | null> {
  const result = await db.query<UserRow>(
    `SELECT u.id, u.email, u.first_name, u.last_name,
            s.id AS store_id, s.store_slug, s.store_name
       FROM users u
       LEFT JOIN stores s ON s.owner_id = u.id
      WHERE u.clerk_user_id = $1 AND u.is_active = TRUE
      ORDER BY s.created_at ASC
      LIMIT 1`,
    [clerkUserId]
  );
  const row = result.rows[0];
  return row ? toSession(row) : null;
}

/**
 * Fetch the verified profile behind a Clerk id, through the Clerk backend SDK.
 *
 * Imported dynamically so nothing about this module's *import* reaches the SDK: it is only loaded
 * on the path that actually provisions a user, which is the only path that needs keys.
 *
 * @param clerkUserId - The Clerk user id.
 * @returns The profile, with a verified primary email.
 * @throws {ClerkUserLinkError} `clerk_unavailable` when Clerk cannot be reached or knows no such
 *         user; `unverified_email` when there is no verified primary address.
 */
async function fetchClerkProfile(clerkUserId: string): Promise<ClerkProfile> {
  let user: {
    primaryEmailAddressId?: string | null;
    emailAddresses?: ReadonlyArray<{
      id: string;
      emailAddress: string;
      verification?: { status?: string | null } | null;
    }>;
    firstName?: string | null;
    lastName?: string | null;
  };

  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    user = await client.users.getUser(clerkUserId);
  } catch (error) {
    throw new ClerkUserLinkError(
      'clerk_unavailable',
      `Clerk user lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  const primary = (user.emailAddresses ?? []).find((address) => address.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') {
    throw new ClerkUserLinkError(
      'unverified_email',
      'Clerk account has no verified primary email address.'
    );
  }

  return {
    email: primary.emailAddress.trim().toLowerCase(),
    firstName: (user.firstName ?? '').trim(),
    lastName: (user.lastName ?? '').trim(),
  };
}

/**
 * Create the `users` row for a Clerk account that has none, or refuse to.
 *
 * @param clerkUserId - The Clerk user id to link the new row to.
 * @param profile - The verified profile to seed the row from.
 * @returns The new session.
 * @throws {ClerkUserLinkError} `email_unlinked` / `email_linked_elsewhere` — see the module note.
 */
async function provisionUser(clerkUserId: string, profile: ClerkProfile): Promise<UserSession> {
  const existing = await db.query<{ id: string; clerk_user_id: string | null }>(
    'SELECT id, clerk_user_id FROM users WHERE lower(email) = $1',
    [profile.email]
  );

  if (existing.rows.length > 1) {
    // Legacy data can hold case-variant rows for one address (there is no `lower(email)` unique
    // constraint historically). Picking `rows[0]` would be a coin-flip over which account a link
    // targets — exactly the ambiguity an attacker squats to steer. Refuse rather than guess.
    throw new ClerkUserLinkError(
      'email_linked_elsewhere',
      `Multiple user rows share this address (${existing.rows.length}); refusing to link any of them ` +
        'automatically. Resolve the duplicates and link deliberately.'
    );
  }

  const conflict = existing.rows[0];
  if (conflict) {
    // Not an auto-link, not a merge, not a "close enough". See the module note.
    const reason: ClerkLinkRefusal = conflict.clerk_user_id ? 'email_linked_elsewhere' : 'email_unlinked';
    throw new ClerkUserLinkError(
      reason,
      reason === 'email_unlinked'
        ? `A user row already exists for this address with no Clerk link (users.id ${conflict.id}). ` +
          'Refusing to link it automatically — link it deliberately with ' +
          '`node scripts/import-users-to-clerk.mjs --link-owner <email> <clerk_user_id>`.'
        : `A user row already exists for this address linked to a different Clerk account ` +
          `(users.id ${conflict.id}). Refusing to re-link.`
    );
  }

  try {
    await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, is_active, clerk_user_id)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)`,
      [profile.email, NO_PASSWORD_SENTINEL, profile.firstName, profile.lastName, clerkUserId]
    );
  } catch (error) {
    // Two requests from the same fresh sign-in racing each other: whichever lost re-reads the row
    // the winner wrote. A unique violation here is on `email` or `clerk_user_id`, and both mean
    // the same thing — somebody already did this.
    if ((error as { code?: string })?.code !== UNIQUE_VIOLATION) throw error;
    const raced = await selectByClerkId(clerkUserId);
    if (raced) return raced;
    // Same address, different Clerk id, inserted between the check above and this insert.
    throw new ClerkUserLinkError(
      'email_unlinked',
      'A user row for this address was created concurrently and is not linked to this Clerk account.'
    );
  }

  const created = await selectByClerkId(clerkUserId);
  if (!created) {
    // The row was inserted active; not finding it means something else deactivated it in between.
    throw new ClerkUserLinkError('clerk_unavailable', 'Newly provisioned user row is not active.');
  }
  return created;
}

/**
 * Resolve a verified Clerk session to this application's session, provisioning on first sight.
 *
 * @param clerkUserId - The Clerk user id from `auth()`. Already verified by the SDK.
 * @param fetchProfile - Override for the Clerk profile fetch. Tests inject; production omits.
 * @returns The `UserSession` every call site already consumes.
 * @throws {ClerkUserLinkError} When no row exists and one cannot be safely created.
 */
export async function resolveUserByClerkId(
  clerkUserId: string,
  fetchProfile: ClerkProfileFetcher = fetchClerkProfile
): Promise<UserSession> {
  const existing = await selectByClerkId(clerkUserId);
  if (existing) return existing;

  const profile = await fetchProfile(clerkUserId);
  return provisionUser(clerkUserId, profile);
}

export { NO_PASSWORD_SENTINEL };
