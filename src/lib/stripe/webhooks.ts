/**
 * Stripe webhook signature verification and typed event dispatch.
 *
 * Two things must be right here:
 *
 *  1. **Raw body.** Stripe signs the exact bytes it sent. In the Next 15 App Router the only safe
 *     way to get them is `await request.text()` *before* anything parses the body as JSON. Never
 *     `JSON.parse` and re-stringify - key ordering and whitespace will differ and every signature
 *     will fail.
 *  2. **Unknown events return 200.** Stripe retries non-2xx responses with backoff, so an event we
 *     do not model must be acknowledged, not 500'd.
 */

import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from './client';

/** Raised when the `Stripe-Signature` header is missing or does not verify. */
export class WebhookSignatureError extends Error {
  public readonly code = 'STRIPE_WEBHOOK_SIGNATURE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/** Result of dispatching one event. */
export type WebhookDispatchOutcome = 'processed' | 'ignored';

/** A handler for one Stripe event type. */
export type StripeEventHandler = (event: Stripe.Event) => Promise<void>;

/** Map of Stripe event type to handler. Any type not present is ignored (and acknowledged). */
export type StripeEventHandlerMap = Readonly<Record<string, StripeEventHandler>>;

/**
 * The event types this application acts on. Everything else is acknowledged and ignored.
 *
 * Keep this list and the table in `docs/payments.md` in sync.
 */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'account.updated',
  'charge.refunded',
] as const;

/** Union of the event types this application acts on. */
export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

/**
 * Read the raw request body exactly as Stripe sent it.
 *
 * @param request - The inbound request.
 * @returns The raw body as a UTF-8 string.
 */
export async function readRawBody(request: Request): Promise<string> {
  return await request.text();
}

/**
 * Verify the Stripe signature and construct the event.
 *
 * @param rawBody - Raw request body from {@link readRawBody}.
 * @param signatureHeader - Value of the `Stripe-Signature` header.
 * @param secret - Optional override for the signing secret (defaults to `STRIPE_WEBHOOK_SECRET`).
 * @returns The verified Stripe event.
 * @throws {WebhookSignatureError} When the header is absent or verification fails.
 */
export function constructStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
  secret: string = getWebhookSecret()
): Stripe.Event {
  if (!signatureHeader) {
    throw new WebhookSignatureError('Missing Stripe-Signature header');
  }

  const stripe = getStripe('constructStripeEvent');

  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch (error) {
    throw new WebhookSignatureError(
      `Stripe signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Route a verified event to its handler.
 *
 * @param event - The verified Stripe event.
 * @param handlers - Dispatch table keyed by Stripe event type.
 * @returns `'processed'` when a handler ran, `'ignored'` when no handler is registered.
 */
export async function dispatchStripeEvent(
  event: Stripe.Event,
  handlers: StripeEventHandlerMap
): Promise<WebhookDispatchOutcome> {
  const handler = handlers[event.type];

  if (!handler) {
    return 'ignored';
  }

  await handler(event);
  return 'processed';
}

/**
 * Whether a given event type has a handler in this application.
 *
 * @param eventType - Stripe event type string.
 * @returns `true` when the type is in {@link HANDLED_EVENT_TYPES}.
 */
export function isHandledEventType(eventType: string): eventType is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(eventType);
}
