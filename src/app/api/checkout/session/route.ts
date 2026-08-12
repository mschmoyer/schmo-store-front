/**
 * POST /api/checkout/session
 *
 * Storefront checkout (flow B). Builds a Stripe Checkout Session for a shopper's cart.
 *
 * Trust model: the request supplies product identities, quantities, a coupon code, a shipping
 * method and contact details. **Every money value is computed on the server** from the `products`
 * table; a `price` field in the request body is ignored. Stock is validated against the
 * `inventory` ledger (falling back to `products.stock_quantity`), and the amount Stripe will charge
 * is asserted to equal the server total before the session is created.
 *
 * Connect: when the store has a connected account with charges enabled, the PaymentIntent is
 * created with `on_behalf_of` and `transfer_data.destination` so funds settle to the merchant. When
 * it does not - which is the normal state in local development - the charge falls back to
 * platform-direct and the response says so.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/database/connection';
import { repriceCart } from '@/lib/billing/cart';
import {
  assertStripeAmountMatches,
  buildStripeLineItems,
  resolveShippingOption,
} from '@/lib/billing/cart-pricing';
import { centsToDecimalString } from '@/lib/billing/money';
import {
  computeApplicationFeeCents,
  getPaymentAccountForStore,
} from '@/lib/billing/payment-accounts';
import type {
  CheckoutCustomerDetails,
  CheckoutShippingAddress,
  ClientCartItem,
} from '@/lib/billing/types';
import { StripeNotConfiguredError, getAppBaseUrl, getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { createOneTimeDiscountCoupon } from '@/lib/stripe/discounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shape of the request body. Money fields are deliberately absent. */
interface CheckoutSessionRequest {
  storeSlug?: string;
  storeId?: string;
  items?: ClientCartItem[];
  couponCode?: string | null;
  shippingMethod?: string | null;
  customer?: Partial<CheckoutCustomerDetails>;
  shippingAddress?: Partial<CheckoutShippingAddress>;
}

/** Minimum amount Stripe will accept for a USD card charge. */
const STRIPE_MINIMUM_CHARGE_CENTS = 50;

/**
 * Validate the contact and shipping details supplied by the shopper.
 *
 * @param body - The parsed request body.
 * @returns Field-level errors keyed by field name; empty when valid.
 */
function validateDetails(body: CheckoutSessionRequest): Record<string, string> {
  const errors: Record<string, string> = {};
  const customer = body.customer ?? {};
  const address = body.shippingAddress ?? {};

  if (!customer.firstName?.trim()) errors.firstName = 'First name is required';
  if (!customer.lastName?.trim()) errors.lastName = 'Last name is required';
  if (!customer.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!address.addressLine1?.trim()) errors.addressLine1 = 'Street address is required';
  if (!address.city?.trim()) errors.city = 'City is required';
  if (!address.state?.trim()) errors.state = 'State is required';
  if (!address.postalCode?.trim()) errors.postalCode = 'ZIP code is required';

  return errors;
}

/**
 * Load the public store record the cart belongs to.
 *
 * @param body - The parsed request body.
 * @returns The store, or `null` when it does not exist or is not public.
 */
async function loadStore(
  body: CheckoutSessionRequest
): Promise<{ id: string; store_name: string; store_slug: string; currency: string } | null> {
  const identifier = body.storeId ?? body.storeSlug;
  if (!identifier) {
    return null;
  }

  const result = await db.query<{
    id: string;
    store_name: string;
    store_slug: string;
    currency: string;
  }>(
    `SELECT id, store_name, store_slug, COALESCE(currency, 'USD') AS currency
       FROM stores
      WHERE (id::text = $1 OR store_slug = $1)
        AND is_active = true
      LIMIT 1`,
    [identifier]
  );

  return result.rows[0] ?? null;
}

/**
 * Create a storefront Stripe Checkout Session.
 *
 * @param request - The inbound request.
 * @returns JSON containing the Checkout Session `url`, or a structured error.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CheckoutSessionRequest;

  try {
    body = (await request.json()) as CheckoutSessionRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Your cart is empty' },
      { status: 400 }
    );
  }

  const fieldErrors = validateDetails(body);
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { success: false, error: 'Please complete the required fields', fieldErrors },
      { status: 400 }
    );
  }

  try {
    const store = await loadStore(body);
    if (!store) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'This store cannot accept payments yet',
          code: 'STRIPE_NOT_CONFIGURED',
          message:
            'Payments are not configured for this storefront. The store owner needs to connect Stripe.',
        },
        { status: 503 }
      );
    }

    const customer: CheckoutCustomerDetails = {
      firstName: body.customer!.firstName!.trim(),
      lastName: body.customer!.lastName!.trim(),
      email: body.customer!.email!.trim(),
      phone: body.customer?.phone?.trim() ?? '',
    };

    const shippingAddress: CheckoutShippingAddress = {
      addressLine1: body.shippingAddress!.addressLine1!.trim(),
      addressLine2: body.shippingAddress?.addressLine2?.trim() || undefined,
      city: body.shippingAddress!.city!.trim(),
      state: body.shippingAddress!.state!.trim(),
      postalCode: body.shippingAddress!.postalCode!.trim(),
      country: (body.shippingAddress?.country || 'US').trim().toUpperCase().slice(0, 2),
    };

    // ---- Server-side re-pricing. Nothing below trusts a client money value. ----
    const priced = await repriceCart({
      storeId: store.id,
      items: body.items,
      couponCode: body.couponCode ?? null,
      shippingMethod: body.shippingMethod ?? null,
      destination: {
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country,
      },
      currency: store.currency,
    });

    if (priced.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'None of the items in your cart are available',
          rejected: priced.rejected,
        },
        { status: 409 }
      );
    }

    if (priced.rejected.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Some items in your cart are no longer available',
          code: 'CART_CHANGED',
          rejected: priced.rejected,
        },
        { status: 409 }
      );
    }

    if (priced.totals.totalCents < STRIPE_MINIMUM_CHARGE_CENTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Order total must be at least $${(STRIPE_MINIMUM_CHARGE_CENTS / 100).toFixed(2)}`,
          code: 'AMOUNT_TOO_SMALL',
        },
        { status: 400 }
      );
    }

    const stripe = getStripe('storefront checkout');
    const currency = priced.currency.toLowerCase();
    const lineItems = buildStripeLineItems(priced.items, priced.totals, currency);
    assertStripeAmountMatches(lineItems, priced.totals);

    // ---- Connect routing ----
    const paymentAccount = await getPaymentAccountForStore(store.id);
    const useConnect = Boolean(paymentAccount?.chargesEnabled);
    const applicationFeeCents = useConnect
      ? computeApplicationFeeCents(priced.totals.totalCents, paymentAccount!.applicationFeeBps)
      : 0;

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
      description: `${store.store_name} order`,
      metadata: {
        flow: 'storefront_order',
        store_id: store.id,
        store_slug: store.store_slug,
      },
    };

    if (useConnect && paymentAccount) {
      paymentIntentData.on_behalf_of = paymentAccount.stripeAccountId;
      paymentIntentData.transfer_data = { destination: paymentAccount.stripeAccountId };
      if (applicationFeeCents > 0) {
        paymentIntentData.application_fee_amount = applicationFeeCents;
      }
    }

    // A storefront coupon lives in our database, so it becomes a single-use Stripe coupon here.
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (priced.coupon && priced.totals.discountCents > 0) {
      const stripeCoupon = await createOneTimeDiscountCoupon(
        priced.totals.discountCents,
        currency,
        {
          storeId: store.id,
          couponCode: priced.coupon.code,
          couponId: priced.coupon.couponId,
        },
        stripe
      );
      discounts.push({ coupon: stripeCoupon.id });
    }

    const baseUrl = getAppBaseUrl();
    const shippingOption = resolveShippingOption(priced.shippingMethod);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      ...(discounts.length > 0 ? { discounts } : {}),
      customer_email: customer.email,
      payment_intent_data: paymentIntentData,
      client_reference_id: store.id,
      metadata: {
        flow: 'storefront_order',
        store_id: store.id,
        store_slug: store.store_slug,
      },
      success_url: `${baseUrl}/store/${store.store_slug}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/store/${store.store_slug}/checkout?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    // Persist the server-priced snapshot the webhook will turn into an order.
    await db.query(
      `INSERT INTO checkout_sessions (
          store_id, stripe_checkout_session_id, stripe_payment_intent_id, connected_account_id,
          status, currency, subtotal, discount_amount, shipping_amount, tax_amount, total_amount,
          coupon_id, coupon_code, customer_email, customer, shipping_address, shipping_method,
          line_items, expires_at
       ) VALUES (
          $1, $2, $3, $4,
          'open', $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16,
          $17, to_timestamp($18)
       )
       ON CONFLICT (stripe_checkout_session_id) DO NOTHING`,
      [
        store.id,
        session.id,
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
        useConnect && paymentAccount ? paymentAccount.stripeAccountId : null,
        priced.currency,
        centsToDecimalString(priced.totals.subtotalCents),
        centsToDecimalString(priced.totals.discountCents),
        centsToDecimalString(priced.totals.shippingCents),
        centsToDecimalString(priced.totals.taxCents),
        centsToDecimalString(priced.totals.totalCents),
        priced.coupon?.couponId ?? null,
        priced.coupon?.code ?? null,
        customer.email,
        JSON.stringify(customer),
        JSON.stringify(shippingAddress),
        shippingOption.id,
        JSON.stringify(priced.items),
        session.expires_at ?? Math.floor(Date.now() / 1000) + 30 * 60,
      ]
    );

    if (!session.url) {
      throw new Error('Stripe returned a Checkout Session without a redirect URL');
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        settlement: useConnect ? 'connected_account' : 'platform_direct',
        totals: {
          subtotalCents: priced.totals.subtotalCents,
          discountCents: priced.totals.discountCents,
          shippingCents: priced.totals.shippingCents,
          taxCents: priced.totals.taxCents,
          totalCents: priced.totals.totalCents,
        },
        coupon: priced.coupon
          ? { code: priced.coupon.code, discountCents: priced.coupon.discountCents }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }

    console.error('Storefront checkout session error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Could not start checkout',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
