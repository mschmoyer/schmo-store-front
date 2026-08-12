/**
 * Webhook idempotency ledger.
 *
 * Stripe guarantees *at least once* delivery, so the same event id can arrive several times (and
 * concurrently, if a delivery times out and is retried). Every inbound event is claimed here
 * before any side effect runs.
 *
 * The claim is a single statement so it is atomic:
 *
 * ```sql
 * INSERT ... ON CONFLICT (event_id) DO UPDATE ... WHERE status IN ('received','failed') RETURNING ...
 * ```
 *
 * If the conflicting row is already `processed` or `ignored`, the `WHERE` filters the update out,
 * no row comes back, and the caller knows to skip. Handlers remain individually idempotent as a
 * second line of defence (order creation keys on the checkout session id, subscription writes are
 * upserts), which also covers the narrow window where two deliveries are in flight at once.
 */

import { db } from '@/lib/database/connection';

/** Outcome of attempting to claim an event for processing. */
export type WebhookClaim =
  | { readonly status: 'claimed'; readonly recordId: string; readonly attempt: number; readonly firstDelivery: boolean }
  | { readonly status: 'duplicate' };

/** The subset of a Stripe event the ledger stores. */
export interface WebhookEventInput {
  readonly id: string;
  readonly type: string;
  readonly apiVersion?: string | null;
  readonly livemode?: boolean;
  /** Connected account id for Connect events, `null` for platform events. */
  readonly accountId?: string | null;
  /** Full event payload, retained for debugging and replay. */
  readonly payload?: unknown;
}

/**
 * Claim an event for processing, or report it as an already-handled duplicate.
 *
 * @param event - The verified Stripe event.
 * @returns `claimed` when the caller should process it, `duplicate` when it must be skipped.
 */
export async function claimWebhookEvent(event: WebhookEventInput): Promise<WebhookClaim> {
  const result = await db.query<{ id: string; attempts: number; inserted: boolean }>(
    `INSERT INTO webhook_events
        (provider, event_id, event_type, api_version, livemode, account_id, status, attempts, payload)
     VALUES ('stripe', $1, $2, $3, $4, $5, 'received', 1, $6)
     ON CONFLICT (event_id) DO UPDATE
        SET attempts = webhook_events.attempts + 1,
            status = 'received',
            error = NULL
      WHERE webhook_events.status IN ('received', 'failed')
     RETURNING id, attempts, (xmax = 0) AS inserted`,
    [
      event.id,
      event.type,
      event.apiVersion ?? null,
      event.livemode ?? false,
      event.accountId ?? null,
      event.payload === undefined ? null : JSON.stringify(event.payload),
    ]
  );

  const row = result.rows[0];
  if (!row) {
    return { status: 'duplicate' };
  }

  return {
    status: 'claimed',
    recordId: row.id,
    attempt: row.attempts,
    firstDelivery: row.inserted === true,
  };
}

/**
 * Mark a claimed event as finished.
 *
 * @param eventId - The Stripe event id.
 * @param outcome - `processed` when a handler ran, `ignored` when no handler is registered.
 * @returns Nothing.
 */
export async function markWebhookHandled(
  eventId: string,
  outcome: 'processed' | 'ignored'
): Promise<void> {
  await db.query(
    `UPDATE webhook_events
        SET status = $2, processed_at = NOW(), error = NULL
      WHERE event_id = $1`,
    [eventId, outcome]
  );
}

/**
 * Mark a claimed event as failed so a Stripe retry re-claims it.
 *
 * @param eventId - The Stripe event id.
 * @param error - The failure message.
 * @returns Nothing.
 */
export async function markWebhookFailed(eventId: string, error: string): Promise<void> {
  await db.query(
    `UPDATE webhook_events
        SET status = 'failed', error = $2, processed_at = NOW()
      WHERE event_id = $1`,
    [eventId, error.slice(0, 4000)]
  );
}
