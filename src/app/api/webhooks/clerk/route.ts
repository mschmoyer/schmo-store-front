/**
 * `POST /api/webhooks/clerk` — reconciliation only.
 *
 * Clerk is not the authority for anything in this database except "who is this". Provisioning
 * happens just-in-time in `requireAuth` (docs/plans/clerk-integration.md §3), because
 * `user.created` is delivered asynchronously and a merchant who has just signed up would otherwise
 * get a 401 on their first authenticated request. So this endpoint reconciles after the fact:
 * email and name changes, and deactivation.
 *
 * **`user.deleted` deactivates; it never deletes.** Every FK in the schema points at `users.id`
 * and the audit history is meant to outlive the account. Trusting a vendor webhook to cascade
 * deletes across a tenant's orders is not a trade this platform makes.
 *
 * **Idempotency: the handlers, not the ledger.** `webhook_events` has a `provider` column, but
 * `claimWebhookEvent` hardcodes `'stripe'`, types its input as a Stripe event and takes Stripe's
 * `livemode`/`account_id` — it is Stripe's ledger with a column that anticipates a second
 * provider, not a generic one, and widening it is a change to the money path for no benefit here.
 * All three handlers below are naturally idempotent instead: two are `UPDATE ... WHERE
 * clerk_user_id = $1` writing a value from the payload, and the third does nothing. A redelivered
 * event re-applies the same row state. Ordering is the one thing this loses — an out-of-order pair
 * of `user.updated` events could land the older email last — and the next sign-in does not repair
 * it, since JIT only fires when there is no row. It is a name and an email; the operator console
 * shows the truth and Clerk redelivers within seconds in practice.
 *
 * Nothing here logs a signing secret, a signature header, or a full address.
 */

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/database/connection';

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/** The subset of a Clerk user event this route reads. Nothing else is trusted or stored. */
interface ClerkUserEvent {
  type: string;
  data?: {
    id?: string;
    primary_email_address_id?: string | null;
    email_addresses?: Array<{
      id?: string;
      email_address?: string;
      verification?: { status?: string | null } | null;
    }>;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/** `users.first_name` / `users.last_name` are `VARCHAR(100) NOT NULL`. */
const NAME_MAX = 100;

/**
 * The **verified** primary email on a Clerk user payload.
 *
 * Mirrors the JIT path's rule (`clerk-user.ts`): only the address whose id matches
 * `primary_email_address_id` *and* whose verification status is `verified` is trusted. There is no
 * fallback to `addresses[0]` — writing an unverified secondary address the account holder merely
 * added would let it overwrite the linked row's identity.
 *
 * @param data - The event's `data` object.
 * @returns The lower-cased verified primary address, or `null` when the payload carries none.
 */
function primaryEmail(data: NonNullable<ClerkUserEvent['data']>): string | null {
  const addresses = data.email_addresses ?? [];
  const primary = addresses.find((address) => address.id === data.primary_email_address_id);
  if (!primary || primary.verification?.status !== 'verified') return null;
  const value = primary.email_address?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Clamp a name to the column width so a `user.updated` can never 500 on `22001` and wedge Clerk
 * into an infinite retry loop over a name longer than 100 characters.
 *
 * @param value - Raw name from the payload.
 * @returns The trimmed value, at most {@link NAME_MAX} characters.
 */
function clampName(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, NAME_MAX);
}

/**
 * Apply a `user.updated` event to the linked row.
 *
 * @param data - The event's `data` object.
 * @returns Nothing. A collision on the unique email index is logged and swallowed — see below.
 */
async function applyUserUpdated(data: NonNullable<ClerkUserEvent['data']>): Promise<void> {
  const clerkUserId = data.id;
  if (!clerkUserId) return;

  const email = primaryEmail(data);
  try {
    const result = await db.query(
      `UPDATE users
          SET email = COALESCE($2, email),
              first_name = $3,
              last_name = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE clerk_user_id = $1`,
      [clerkUserId, email, clampName(data.first_name), clampName(data.last_name)]
    );
    if (result.rowCount === 0) {
      // No linked row yet: the user has not signed in since signing up, so JIT has not run. The
      // next authenticated request creates the row from Clerk's current profile anyway.
      console.warn(`[clerk-webhook] user.updated for unlinked Clerk user ${clerkUserId}`);
    }
  } catch (error) {
    // Clerk let two accounts reach the same address, or the address already belongs to another
    // row here. A 500 would make Clerk retry forever against a conflict that cannot resolve
    // itself, so this is a 200 with a loud line for support to act on.
    if ((error as { code?: string })?.code === UNIQUE_VIOLATION) {
      console.error(
        `[clerk-webhook] user.updated for ${clerkUserId} collided with an existing email; row left unchanged`
      );
      return;
    }
    throw error;
  }
}

/**
 * Apply a `user.deleted` event by deactivating the linked row.
 *
 * @param data - The event's `data` object.
 * @returns Nothing.
 */
async function applyUserDeleted(data: NonNullable<ClerkUserEvent['data']>): Promise<void> {
  const clerkUserId = data.id;
  if (!clerkUserId) return;

  await db.query(
    `UPDATE users
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
}

/**
 * Verify and process a Clerk webhook delivery.
 *
 * @param request - The delivery. The raw body is read as text: the signature covers those exact
 *   bytes, so re-serialising parsed JSON would break verification.
 * @returns 503 when unconfigured, 400 on a bad signature or body, 200 otherwise.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Read lazily, never at module scope: an unconfigured integration returns a labelled state, it
  // does not take the route table down at import time.
  const secret = (process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? '').trim();
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Clerk webhooks are not configured' },
      { status: 503 }
    );
  }

  const body = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(body, headers) as ClerkUserEvent;
  } catch {
    // Never echo the signature or any part of the secret back, and never say which header was
    // wrong: an unverified body is an unauthenticated stranger.
    console.error('[clerk-webhook] signature verification failed');
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
  }

  const data = event.data;
  if (!data) {
    return NextResponse.json({ success: false, error: 'Malformed event' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'user.updated':
        await applyUserUpdated(data);
        break;
      case 'user.deleted':
        await applyUserDeleted(data);
        break;
      case 'user.created':
        // Deliberately nothing. JIT provisioning in requireAuth is authoritative, and creating a
        // row here would race it — and would have to decide the linking question (clerk-user.ts)
        // without a request to refuse.
        console.info('[clerk-webhook] user.created acknowledged; provisioning is just-in-time');
        break;
      default:
        return NextResponse.json({ success: true, handled: false }, { status: 200 });
    }
  } catch (error) {
    console.error(`[clerk-webhook] ${event.type} failed:`, error);
    return NextResponse.json({ success: false, error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, handled: true }, { status: 200 });
}
