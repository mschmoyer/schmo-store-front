import type Stripe from 'stripe';
import {
  HANDLED_EVENT_TYPES,
  dispatchStripeEvent,
  isHandledEventType,
  readRawBody,
  type StripeEventHandlerMap,
} from '../webhooks';

/**
 * Build a minimal Stripe event for dispatch tests.
 *
 * @param type - The Stripe event type.
 * @returns An object shaped like a Stripe event.
 */
function event(type: string): Stripe.Event {
  return {
    id: `evt_${type}`,
    object: 'event',
    type,
    api_version: '2026-07-29.dahlia',
    created: 1_760_000_000,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: {} },
  } as unknown as Stripe.Event;
}

describe('stripe webhook dispatch', () => {
  it('models exactly the event types the application acts on', () => {
    expect([...HANDLED_EVENT_TYPES]).toEqual([
      'checkout.session.completed',
      'checkout.session.expired',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'account.updated',
      'charge.refunded',
    ]);

    expect(isHandledEventType('charge.refunded')).toBe(true);
    expect(isHandledEventType('radar.early_fraud_warning.created')).toBe(false);
  });

  it('routes an event to its handler exactly once', async () => {
    const completed = jest.fn().mockResolvedValue(undefined);
    const expired = jest.fn().mockResolvedValue(undefined);
    const handlers: StripeEventHandlerMap = {
      'checkout.session.completed': completed,
      'checkout.session.expired': expired,
    };

    const outcome = await dispatchStripeEvent(event('checkout.session.completed'), handlers);

    expect(outcome).toBe('processed');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it('ignores - and does not throw on - an event type with no handler', async () => {
    const outcome = await dispatchStripeEvent(event('radar.early_fraud_warning.created'), {});
    expect(outcome).toBe('ignored');
  });

  it('propagates a handler failure so the route can return 500 and Stripe can retry', async () => {
    const handlers: StripeEventHandlerMap = {
      'invoice.paid': jest.fn().mockRejectedValue(new Error('database down')),
    };

    await expect(dispatchStripeEvent(event('invoice.paid'), handlers)).rejects.toThrow(
      'database down'
    );
  });

  it('reads the raw request body verbatim, without re-serialising it', async () => {
    // Deliberately odd whitespace and key order: a JSON round-trip would change these bytes and
    // break signature verification.
    const raw = '{"b":1,   "a":  2}';
    // jsdom has no global `Request`; only `text()` is exercised here.
    const request = { text: async () => raw } as unknown as Request;
    const body = await readRawBody(request);

    expect(body).toBe(raw);
    expect(body).not.toBe(JSON.stringify(JSON.parse(raw)));
  });
});
