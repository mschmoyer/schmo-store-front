'use client';

/**
 * Storefront checkout.
 *
 * Flow: review the cart -> contact and shipping details -> redirect to Stripe.
 *
 * **This page never computes money.** Every amount on screen comes from
 * `POST /api/checkout/quote`, which re-prices the cart from the database, and
 * the amount actually charged comes from `POST /api/checkout/session`, which
 * re-prices it again. The browser only ever sends product ids, quantities, a
 * coupon code and a shipping method. That property is unchanged from the
 * previous implementation and is the reason this rewrite is presentational.
 *
 * What did change is where it lives. This used to be a Mantine admin form with
 * a RebelShops nav bolted on top and forty `var(--theme-*)` references that all
 * resolved to the empty string, so the shopper left the merchant's shop at the
 * exact moment a card number was required. It is now rendered inside
 * `StorefrontShell` like the cart, reads only `--st-*`, and inherits the
 * merchant's header, footer, palette, type and radius.
 */

import * as React from 'react';
import Image from 'next/image';
import { IconAlertTriangle, IconArrowLeft, IconInfoCircle, IconLock } from '@tabler/icons-react';

import { EmptyCart } from '../states/EmptyStates';
import { useCart } from '../cart/CartProvider';
import {
  Notice,
  StoreButton,
  StoreLinkButton,
  cx,
  storeUi,
} from '../ui';
import styles from './Checkout.module.css';

/** A server-priced line item returned by the quote endpoint. */
interface QuotedItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  imageUrl: string | null;
}

/** A cart line the server refused. */
interface QuotedRejection {
  requestedId: string;
  reason: string;
  message: string;
  available?: number;
}

/** A shipping option offered by the server. */
interface QuotedShippingOption {
  id: string;
  name: string;
  description: string;
  estimatedDays: string;
  price: string;
}

/** Full quote payload. */
interface Quote {
  currency: string;
  items: QuotedItem[];
  rejected: QuotedRejection[];
  totals: {
    subtotal: string;
    discount: string;
    shipping: string;
    tax: string;
    total: string;
    totalCents: number;
    discountCents: number;
  };
  coupon: { code: string; description: string; discount: string } | null;
  couponRejected: boolean;
  shippingMethod: string;
  shippingOptions: QuotedShippingOption[];
  payments: { enabled: boolean; settlement: string; connected: boolean };
}

/** The contact and shipping form. */
interface CheckoutForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

type FormErrors = Partial<Record<keyof CheckoutForm, string>>;

const EMPTY_FORM: CheckoutForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/** `localStorage` key the cart page and this page share for an applied coupon. */
const COUPON_KEY = 'appliedCoupon';

/**
 * Validate the form on the client.
 *
 * The server validates again and its answer wins; this exists only so a shopper
 * finds a typo before a round-trip rather than after one.
 *
 * @param form - Current values
 * @returns Errors keyed by field
 */
function validateForm(form: CheckoutForm): FormErrors {
  const errors: FormErrors = {};

  if (!form.firstName.trim()) errors.firstName = 'First name is required';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required';
  if (!form.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!form.addressLine1.trim()) errors.addressLine1 = 'Street address is required';
  if (!form.city.trim()) errors.city = 'City is required';
  if (!form.state.trim()) errors.state = 'State is required';
  if (!form.postalCode.trim()) {
    errors.postalCode = 'ZIP code is required';
  } else if (!/^\d{5}(-\d{4})?$/.test(form.postalCode.trim())) {
    errors.postalCode = 'Enter a 5-digit ZIP code';
  }

  return errors;
}

interface FieldProps {
  id: keyof CheckoutForm;
  label: string;
  value: string;
  error?: string;
  help?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
}

/**
 * One labelled text field.
 *
 * A real `<label for>`, a real error message tied to the input by
 * `aria-describedby`, and `aria-invalid` when it is wrong — the accessibility
 * floor in `docs/design-system.md` section 7, which the Mantine version got for
 * free and this one has to earn.
 *
 * @param props - {@link FieldProps}
 * @returns A labelled input
 */
function Field({
  id,
  label,
  value,
  error,
  help,
  required = false,
  type = 'text',
  autoComplete,
  inputMode,
  onChange,
  onBlur,
  className,
}: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, help ? `${id}-help` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cx(styles.field, className)}>
      <label className={storeUi.label} htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={id}
        className={cx(storeUi.input, error && styles.inputInvalid)}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {help ? (
        <span className={styles.fieldHelp} id={`${id}-help`}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span className={styles.fieldError} id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A themed inline alert.
 * @param props.tone - Which edge colour to use
 * @param props.title - Short headline
 * @param props.children - Body copy
 * @returns An alert block
 */
function Alert({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'warning' | 'danger';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.alert,
        tone === 'warning' && styles.alertWarning,
        tone === 'danger' && styles.alertDanger,
      )}
      role={tone === 'neutral' ? undefined : 'alert'}
    >
      <span className={styles.alertIcon} aria-hidden="true">
        {tone === 'neutral' ? <IconInfoCircle size={18} /> : <IconAlertTriangle size={18} />}
      </span>
      <div>
        <strong className={styles.alertTitle}>{title}</strong>
        {children}
      </div>
    </div>
  );
}

export interface CheckoutViewProps {
  storeId: string;
  storeSlug: string;
  storeName: string;
  /** True when the shopper arrived back from a cancelled Stripe session. */
  wasCancelled: boolean;
}

/**
 * The checkout body.
 *
 * @param props - {@link CheckoutViewProps}
 * @returns The checkout form and order summary
 */
export function CheckoutView({
  storeId,
  storeSlug,
  storeName,
  wasCancelled,
}: CheckoutViewProps) {
  const { lines, loading: cartLoading } = useCart();

  const [form, setForm] = React.useState<CheckoutForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = React.useState<FormErrors>({});

  const [couponInput, setCouponInput] = React.useState('');
  const [appliedCode, setAppliedCode] = React.useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = React.useState('standard');

  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const base = `/store/${storeSlug}`;

  // A coupon the shopper applied on the cart page carries over.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COUPON_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { code?: string };
      if (parsed.code) {
        setCouponInput(parsed.code);
        setAppliedCode(parsed.code);
      }
    } catch {
      window.localStorage.removeItem(COUPON_KEY);
    }
  }, []);

  const cartKey = lines.map((line) => `${line.productId}:${line.quantity}`).join('|');

  const refreshQuote = React.useCallback(async () => {
    if (lines.length === 0) {
      setQuote(null);
      return;
    }

    setQuoting(true);
    try {
      const response = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          items: lines.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
          })),
          couponCode: appliedCode,
          shippingMethod,
          destination: {
            state: form.state,
            postalCode: form.postalCode,
            country: 'US',
          },
        }),
      });

      const json = await response.json();
      if (json.success) {
        setQuote(json.data as Quote);
      } else {
        setSubmitError(json.error ?? 'We could not price your cart.');
      }
    } catch {
      setSubmitError('We could not reach the store to price your cart.');
    } finally {
      setQuoting(false);
    }
    // `form.state` / `form.postalCode` are read, not depended on: re-quoting on
    // every keystroke of a ZIP code would be five requests for one field. The
    // ZIP input's `onBlur` triggers the refresh instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, cartKey, appliedCode, shippingMethod]);

  React.useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  /**
   * Update one field and clear its error.
   * @param field - Field to change
   * @param value - New value
   */
  const updateField = (field: keyof CheckoutForm, value: string): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFormErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  /** Apply whatever code is in the coupon input. */
  const applyCoupon = (): void => {
    const code = couponInput.trim();
    if (!code) return;
    setAppliedCode(code);
    window.localStorage.setItem(COUPON_KEY, JSON.stringify({ code }));
  };

  /** Drop the applied coupon. */
  const removeCoupon = (): void => {
    setAppliedCode(null);
    setCouponInput('');
    window.localStorage.removeItem(COUPON_KEY);
  };

  /** Validate, create a Stripe Checkout Session, and hand off to Stripe. */
  const startPayment = async (): Promise<void> => {
    const errors = validateForm(form);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitError('Check the highlighted fields and try again.');
      const first = Object.keys(errors)[0];
      document.getElementById(first)?.focus();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          items: lines.map((line) => ({
            product_id: line.productId,
            quantity: line.quantity,
          })),
          couponCode: appliedCode,
          shippingMethod,
          customer: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
          },
          shippingAddress: {
            addressLine1: form.addressLine1.trim(),
            addressLine2: form.addressLine2.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            postalCode: form.postalCode.trim(),
            country: 'US',
          },
        }),
      });

      const json = await response.json();

      if (json.success && json.data?.url) {
        // The cart is cleared only once the webhook has created the order, so a
        // cancelled payment returns the shopper to a full cart.
        window.location.href = json.data.url as string;
        return;
      }

      if (json.fieldErrors) setFormErrors(json.fieldErrors as FormErrors);
      if (json.code === 'CART_CHANGED') await refreshQuote();

      setSubmitError(json.message ?? json.error ?? 'We could not start checkout.');
    } catch {
      setSubmitError('We could not reach the payment service. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartLoading && lines.length === 0) {
    return (
      <div className={styles.layout} role="status" aria-label="Loading your cart">
        <div className={styles.column}>
          <div className={cx(styles.skeletonCard, styles.skeletonReview)} />
          <div className={cx(styles.skeletonCard, styles.skeletonContact)} />
          <div className={cx(styles.skeletonCard, styles.skeletonShipping)} />
        </div>
        <div className={cx(styles.skeletonCard, styles.skeletonSummary)} />
      </div>
    );
  }

  if (lines.length === 0) {
    return <EmptyCart shopHref={`${base}/products`} />;
  }

  const paymentsDisabled = quote !== null && !quote.payments.enabled;
  const hasRejections = (quote?.rejected.length ?? 0) > 0;
  const canPay =
    !submitting && !quoting && !paymentsDisabled && !hasRejections && (quote?.items.length ?? 0) > 0;

  // Shipping and tax are functions of a delivery address. Printing "$0.00" for
  // both before one is entered contradicts the cart's own "calculated at
  // checkout" and quietly understates the total, so until the destination is
  // real those rows say so instead of showing a number.
  const hasDestination = /^\d{5}(-\d{4})?$/.test(form.postalCode.trim()) && form.state.trim() !== '';

  const payLabel = submitting
    ? 'Redirecting to Stripe…'
    : paymentsDisabled
      ? 'Payments unavailable'
      : `Pay ${quote?.totals.total ?? ''}`.trim();

  const payButton = (
    <StoreButton
      size="lg"
      block
      disabled={!canPay}
      onClick={() => void startPayment()}
    >
      <IconLock size={18} aria-hidden="true" />
      {payLabel}
    </StoreButton>
  );

  return (
    <div>
      {wasCancelled ? (
        <Alert tone="warning" title="Payment cancelled">
          Nothing was charged. Your cart is exactly as you left it.
        </Alert>
      ) : null}

      {paymentsDisabled ? (
        <Alert tone="warning" title="Payments are not set up for this store yet">
          {storeName} has not finished connecting a payment account, so orders cannot be placed
          right now. Your cart is saved — try again later, or contact the store directly.
        </Alert>
      ) : null}

      {hasRejections ? (
        <Alert tone="danger" title="Some items are no longer available">
          {quote?.rejected.map((rejection) => (
            <span key={`${rejection.requestedId}-${rejection.reason}`}>
              {rejection.message}
              <br />
            </span>
          ))}
        </Alert>
      ) : null}

      {submitError ? (
        <Alert tone="danger" title="We could not continue">
          {submitError}
        </Alert>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="review-heading">
            <h2 className={styles.cardTitle} id="review-heading">
              Review your order
            </h2>
            <ul className={styles.reviewList}>
              {(quote?.items ?? []).map((item) => (
                <li key={item.productId} className={styles.reviewLine}>
                  <span className={styles.reviewMedia}>
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt="" fill sizes="56px" />
                    ) : null}
                  </span>
                  <span className={styles.reviewBody}>
                    <span className={styles.reviewName}>{item.name}</span>
                    <span className={styles.reviewMeta}>
                      {item.sku} · {item.unitPrice} × {item.quantity}
                    </span>
                  </span>
                  <span className={styles.reviewTotal}>{item.lineTotal}</span>
                </li>
              ))}
            </ul>
            {quoting && !quote ? (
              <p className={styles.cardNote} role="status">
                Confirming prices against live stock…
              </p>
            ) : null}
          </section>

          <section className={styles.card} aria-labelledby="contact-heading">
            <h2 className={styles.cardTitle} id="contact-heading">
              Contact details
            </h2>
            <div className={styles.fields}>
              <Field
                id="firstName"
                label="First name"
                value={form.firstName}
                error={formErrors.firstName}
                autoComplete="given-name"
                required
                onChange={(value) => updateField('firstName', value)}
              />
              <Field
                id="lastName"
                label="Last name"
                value={form.lastName}
                error={formErrors.lastName}
                autoComplete="family-name"
                required
                onChange={(value) => updateField('lastName', value)}
              />
              <Field
                id="email"
                label="Email"
                type="email"
                inputMode="email"
                value={form.email}
                error={formErrors.email}
                help="Your receipt and shipping updates go here."
                autoComplete="email"
                required
                onChange={(value) => updateField('email', value)}
              />
              <Field
                id="phone"
                label="Phone (optional)"
                inputMode="tel"
                value={form.phone}
                error={formErrors.phone}
                autoComplete="tel"
                onChange={(value) => updateField('phone', value)}
              />
            </div>
          </section>

          <section className={styles.card} aria-labelledby="shipping-heading">
            <h2 className={styles.cardTitle} id="shipping-heading">
              Shipping address
            </h2>

            <div className={styles.fields}>
              <Field
                id="addressLine1"
                label="Street address"
                value={form.addressLine1}
                error={formErrors.addressLine1}
                autoComplete="address-line1"
                required
                className={styles.fieldFull}
                onChange={(value) => updateField('addressLine1', value)}
              />
              <Field
                id="addressLine2"
                label="Apartment, suite (optional)"
                value={form.addressLine2}
                autoComplete="address-line2"
                className={styles.fieldFull}
                onChange={(value) => updateField('addressLine2', value)}
              />
            </div>

            <div className={styles.addressGrid}>
              <Field
                id="city"
                label="City"
                value={form.city}
                error={formErrors.city}
                autoComplete="address-level2"
                required
                onChange={(value) => updateField('city', value)}
              />

              <div className={styles.field}>
                <label className={storeUi.label} htmlFor="state">
                  State<span aria-hidden="true"> *</span>
                </label>
                <select
                  id="state"
                  name="state"
                  className={cx(storeUi.select, formErrors.state && styles.inputInvalid)}
                  value={form.state}
                  required
                  autoComplete="address-level1"
                  aria-invalid={formErrors.state ? true : undefined}
                  aria-describedby={formErrors.state ? 'state-error' : undefined}
                  onChange={(event) => updateField('state', event.target.value)}
                  onBlur={() => void refreshQuote()}
                >
                  <option value="">Select</option>
                  {US_STATES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                {formErrors.state ? (
                  <span className={styles.fieldError} id="state-error">
                    {formErrors.state}
                  </span>
                ) : null}
              </div>

              <Field
                id="postalCode"
                label="ZIP code"
                inputMode="numeric"
                value={form.postalCode}
                error={formErrors.postalCode}
                autoComplete="postal-code"
                required
                onChange={(value) => updateField('postalCode', value)}
                onBlur={() => void refreshQuote()}
              />
            </div>

            <hr className={styles.divider} />

            <fieldset className={styles.options}>
              <legend className={styles.optionsLegend}>Shipping speed</legend>
              {(quote?.shippingOptions ?? []).map((option) => (
                <label
                  key={option.id}
                  className={cx(
                    styles.option,
                    shippingMethod === option.id && styles.optionSelected,
                  )}
                >
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={option.id}
                    checked={shippingMethod === option.id}
                    onChange={() => setShippingMethod(option.id)}
                  />
                  <span>
                    <span className={styles.optionName}>{option.name}</span>
                    <span className={styles.optionMeta}>
                      {option.description} · {option.estimatedDays}
                    </span>
                  </span>
                  <span className={styles.optionPrice}>{option.price}</span>
                </label>
              ))}
            </fieldset>
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="summary-heading">
          <h2 className={styles.cardTitle} id="summary-heading">
            Order summary
          </h2>

          {quote?.coupon ? (
            <div className={styles.couponApplied}>
              <span>
                <span className={styles.couponCode}>{quote.coupon.code}</span>{' '}
                {quote.coupon.description}
              </span>
              <StoreButton size="sm" variant="ghost" onClick={removeCoupon}>
                Remove
              </StoreButton>
            </div>
          ) : (
            <div>
              <label className={storeUi.label} htmlFor="coupon">
                Coupon code
              </label>
              <div className={styles.coupon}>
                <input
                  id="coupon"
                  className={storeUi.input}
                  value={couponInput}
                  placeholder="Enter code"
                  aria-describedby={quote?.couponRejected ? 'coupon-error' : undefined}
                  onChange={(event) => setCouponInput(event.target.value)}
                />
                <StoreButton
                  variant="secondary"
                  onClick={applyCoupon}
                  disabled={!couponInput.trim() || quoting}
                >
                  Apply
                </StoreButton>
              </div>
              {quote?.couponRejected ? (
                <span className={styles.fieldError} id="coupon-error">
                  That code is not valid for this cart.
                </span>
              ) : null}
            </div>
          )}

          <hr className={styles.divider} />

          <div className={styles.row}>
            <span>Subtotal</span>
            <span className={styles.rowValue}>{quote?.totals.subtotal ?? '—'}</span>
          </div>

          {quote && quote.totals.discountCents > 0 ? (
            <div className={cx(styles.row, styles.rowDiscount)}>
              <span>Discount</span>
              <span className={styles.rowValue}>−{quote.totals.discount}</span>
            </div>
          ) : null}

          <div className={styles.row}>
            <span>Shipping</span>
            {hasDestination ? (
              <span className={styles.rowValue}>{quote?.totals.shipping ?? '—'}</span>
            ) : (
              <span className={styles.rowPending}>From your address</span>
            )}
          </div>

          <div className={styles.row}>
            <span>Tax</span>
            {hasDestination ? (
              <span className={styles.rowValue}>{quote?.totals.tax ?? '—'}</span>
            ) : (
              <span className={styles.rowPending}>From your address</span>
            )}
          </div>

          <div className={styles.total}>
            <span>{hasDestination ? 'Total' : 'Total so far'}</span>
            <span className={styles.totalValue}>
              {quoting ? '…' : (quote?.totals.total ?? '—')}
            </span>
          </div>

          <div className={styles.summaryAction}>{payButton}</div>

          <p className={styles.cardNote}>
            You will be taken to Stripe to enter your card details. RebelShops never sees your card
            number.
          </p>

          {!hasDestination ? (
            <Notice icon={<IconInfoCircle size={16} />}>
              Shipping and any tax are worked out from your delivery address, so the total above is
              not final until you have entered one. We do not estimate it here, because a guess
              would be wrong as often as it was right.
            </Notice>
          ) : null}

          <StoreLinkButton href={`${base}/cart`} variant="ghost" block>
            <IconArrowLeft size={16} aria-hidden="true" />
            Back to cart
          </StoreLinkButton>
        </aside>
      </div>

      <div className={styles.mobileBar}>
        <span className={styles.mobileBarTotal}>
          <span className={styles.mobileBarLabel}>{hasDestination ? 'Total' : 'Total so far'}</span>
          <span className={styles.mobileBarValue}>
            {quoting ? '…' : (quote?.totals.total ?? '—')}
          </span>
        </span>
        <span className={styles.mobileBarAction}>{payButton}</span>
      </div>
    </div>
  );
}
