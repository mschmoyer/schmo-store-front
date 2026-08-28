/**
 * POST /api/webhooks/stripe
 *
 * The single Stripe webhook endpoint for both money flows.
 *
 * Correctness rules enforced here:
 *
 *  * **Raw body.** `await request.text()` runs before anything else touches the body, because
 *    Stripe signs the exact bytes it sent. Route handlers in the App Router do not pre-parse the
 *    body, and there is no `bodyParser` config to disable (that was the Pages Router).
 *  * **Signature first.** Nothing is read from the payload until `constructEvent` succeeds.
 *  * **Idempotent.** Every event is claimed in `webhook_events` before any side effect; a repeat
 *    delivery is acknowledged and skipped.
 *  * **Unknown events return 200.** Stripe retries non-2xx, so unmodelled events are acknowledged.
 *  * **One transaction per order.** `checkout.session.completed` for a storefront order writes the
 *    order, its items and the inventory movement atomically.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getCheckoutSnapshot, markCheckoutSessionStatus } from '@/lib/billing/checkout-sessions';
import { createPaidOrder, recordRefund } from '@/lib/billing/orders';
import { savePaymentAccountStatus } from '@/lib/billing/payment-accounts';
import {
  markSubscriptionCanceled,
  recordInvoiceOutcome,
  upsertSubscriptionFromStripe,
} from '@/lib/billing/subscriptions';
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookHandled,
} from '@/lib/billing/webhook-events';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { summarizeAccount } from '@/lib/stripe/connect';
import {
  WebhookSignatureError,
  constructStripeEvent,
  dispatchStripeEvent,
  readRawBody,
  type StripeEventHandlerMap,
} from '@/lib/stripe/webhooks';
import { closeOutPlatformCouponRedemption } from './_lib/platform-coupon-redemption';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle `checkout.session.completed`.
 *
 * Branches on `metadata.flow`: a storefront order becomes an `orders` row, a platform subscription
 * checkout syncs the new subscription into our mirror.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const flow = session.metadata?.flow;

  if (flow === 'platform_billing' || session.mode === 'subscription') {
    await syncSubscriptionFromCheckout(session);
    return;
  }

  if (session.payment_status !== 'paid') {
    // Asynchronous payment methods settle later; `checkout.session.async_payment_succeeded`
    // would be the trigger. Not enabled today - see docs/payments.md.
    console.warn(
      `checkout.session.completed for ${session.id} with payment_status=${session.payment_status}; no order created.`
    );
    return;
  }

  const snapshot = await getCheckoutSnapshot(session.id);
  if (!snapshot) {
    console.warn(`No checkout snapshot for Stripe session ${session.id}; ignoring.`);
    return;
  }

  if (snapshot.orderId) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? snapshot.stripePaymentIntentId);

  const order = await createPaidOrder({
    storeId: snapshot.storeId,
    items: snapshot.items,
    totals: snapshot.totals,
    currency: snapshot.currency,
    customer: snapshot.customer,
    shippingAddress: snapshot.shippingAddress,
    shippingMethod: snapshot.shippingMethod,
    couponId: snapshot.couponId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
    stripeAccountId: snapshot.connectedAccountId,
    // Stripe's amount_total is authoritative for what was actually captured.
    amountCapturedCents: session.amount_total ?? snapshot.totals.totalCents,
    applicationFeeCents: null,
  });

  console.log(
    `Storefront order ${order.orderNumber} ${order.alreadyExisted ? 'already existed for' : 'created from'} session ${session.id}`
  );
}

/**
 * Sync the subscription created by a platform-billing Checkout Session, and — when it carries a
 * platform signup coupon — close out that coupon's redemption.
 *
 * @param session - The completed Checkout Session.
 * @returns Nothing.
 */
export async function syncSubscriptionFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  const stripe = getStripe('webhook subscription sync');
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['discounts'],
  });

  const ownerId = session.metadata?.owner_id ?? session.client_reference_id ?? null;

  await upsertSubscriptionFromStripe(subscription, {
    ownerId,
    storeId: session.metadata?.store_id ?? null,
  });

  // The subscription mirror write above must stand regardless of what happens next. closeOut...
  // itself never throws; this try/catch is defense in depth against a future regression.
  try {
    const outcome = await closeOutPlatformCouponRedemption({ ownerId, subscription });
    if (outcome.outcome === 'error') {
      console.error(
        `[stripe webhook] platform coupon close-out reported an error for session ${session.id}: ` +
          outcome.errorMessage
      );
    }
  } catch (error) {
    console.error(
      `[stripe webhook] unexpected error closing out platform coupon redemption for session ${session.id}:`,
      error
    );
  }
}

/**
 * Handle `checkout.session.expired`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleCheckoutExpired(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  await markCheckoutSessionStatus(session.id, 'expired');
}

/**
 * Handle `customer.subscription.created` and `customer.subscription.updated`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleSubscriptionUpserted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await upsertSubscriptionFromStripe(subscription);
}

/**
 * Handle `customer.subscription.deleted`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await upsertSubscriptionFromStripe(subscription);
  await markSubscriptionCanceled(
    subscription.id,
    subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date()
  );
}

/**
 * Read the subscription id off an invoice across API-version shapes.
 *
 * @param invoice - The Stripe invoice.
 * @returns The subscription id, or `null` for one-off invoices.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
  };

  if (typeof legacy.subscription === 'string') {
    return legacy.subscription;
  }
  if (legacy.subscription && typeof legacy.subscription === 'object') {
    return legacy.subscription.id;
  }

  const parent = (invoice as Stripe.Invoice & {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  }).parent;

  const fromParent = parent?.subscription_details?.subscription;
  if (typeof fromParent === 'string') {
    return fromParent;
  }
  if (fromParent && typeof fromParent === 'object') {
    return fromParent.id;
  }

  return null;
}

/**
 * Handle `invoice.paid`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  await recordInvoiceOutcome(subscriptionId, invoice.id ?? null, 'paid');

  // Renewals move the period forward; re-read the subscription so current_period_end is accurate.
  const stripe = getStripe('webhook invoice.paid');
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['discounts'],
  });
  await upsertSubscriptionFromStripe(subscription);
}

/**
 * Handle `invoice.payment_failed`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  const reason =
    (invoice as Stripe.Invoice & { last_finalization_error?: { message?: string } })
      .last_finalization_error?.message ?? 'Payment failed';

  await recordInvoiceOutcome(subscriptionId, invoice.id ?? null, 'failed', reason);
}

/**
 * Handle `account.updated` for Connect accounts.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleAccountUpdated(event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  await savePaymentAccountStatus(summarizeAccount(account));
}

/**
 * Handle `charge.refunded`.
 *
 * @param event - The verified Stripe event.
 * @returns Nothing.
 */
async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  await recordRefund(
    charge.id,
    paymentIntentId,
    charge.amount_refunded ?? 0,
    charge.refunded === true
  );
}

/** The dispatch table. Anything absent is acknowledged with 200 and ignored. */
const HANDLERS: StripeEventHandlerMap = {
  'checkout.session.completed': handleCheckoutCompleted,
  'checkout.session.expired': handleCheckoutExpired,
  'customer.subscription.created': handleSubscriptionUpserted,
  'customer.subscription.updated': handleSubscriptionUpserted,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'account.updated': handleAccountUpdated,
  'charge.refunded': handleChargeRefunded,
};

/**
 * Receive, verify, de-duplicate and dispatch a Stripe webhook event.
 *
 * @param request - The inbound request.
 * @returns `200` for anything successfully handled, ignored, or already seen; `400` for a bad
 *          signature; `500` only when a handler failed and Stripe should retry.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read the raw bytes first. Nothing may parse the body before this line.
  const rawBody = await readRawBody(request);
  const signature = request.headers.get('stripe-signature');

  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    // Not configured: reject rather than silently accepting unverifiable payloads.
    return NextResponse.json(
      { received: false, error: 'Stripe webhooks are not configured' },
      { status: 503 }
    );
  }

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      console.warn('Rejected Stripe webhook:', error.message);
      return NextResponse.json({ received: false, error: error.message }, { status: 400 });
    }
    console.error('Unexpected error verifying Stripe webhook:', error);
    return NextResponse.json({ received: false, error: 'Verification failed' }, { status: 400 });
  }

  let claim;
  try {
    claim = await claimWebhookEvent({
      id: event.id,
      type: event.type,
      apiVersion: event.api_version ?? null,
      livemode: event.livemode,
      accountId: (event as Stripe.Event & { account?: string }).account ?? null,
      payload: event,
    });
  } catch (error) {
    console.error('Could not record Stripe webhook event:', error);
    // The ledger is unavailable; ask Stripe to retry rather than risk a lost event.
    return NextResponse.json({ received: false, error: 'Ledger unavailable' }, { status: 500 });
  }

  if (claim.status === 'duplicate') {
    return NextResponse.json({ received: true, duplicate: true, id: event.id });
  }

  try {
    const outcome = await dispatchStripeEvent(event, HANDLERS);
    await markWebhookHandled(event.id, outcome);
    return NextResponse.json({ received: true, outcome, id: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Stripe webhook handler failed for ${event.type} (${event.id}):`, error);

    try {
      await markWebhookFailed(event.id, message);
    } catch (ledgerError) {
      console.error('Could not mark webhook event failed:', ledgerError);
    }

    // 500 so Stripe retries with backoff; the claim above lets the retry re-enter.
    return NextResponse.json({ received: false, error: message }, { status: 500 });
  }
}
