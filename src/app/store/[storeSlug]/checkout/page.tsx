'use client';

/**
 * Storefront checkout.
 *
 * Flow: cart review -> contact and shipping details -> redirect to Stripe Checkout.
 *
 * The page never computes money. Every amount displayed comes from `POST /api/checkout/quote`,
 * which re-prices the cart from the database, and the amount charged comes from
 * `POST /api/checkout/session`, which re-prices it again. The browser only ever sends product ids,
 * quantities, a coupon code and a shipping method.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Divider,
  Grid,
  GridCol,
  Group,
  Image,
  Loader,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconLock,
  IconShoppingCart,
} from '@tabler/icons-react';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';

/** A cart line as persisted in localStorage by the rest of the storefront. */
interface StoredCartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

/** Store metadata from the public stores endpoint. */
interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

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

/**
 * Read and sanitise the cart from localStorage.
 *
 * @returns The stored cart lines, or an empty array.
 */
function readCart(): StoredCartItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem('cart');
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is StoredCartItem => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Partial<StoredCartItem>;
      return (
        (typeof candidate.product_id === 'string' || typeof candidate.product_id === 'number') &&
        typeof candidate.quantity === 'number'
      );
    });
  } catch {
    return [];
  }
}

/**
 * Validate the checkout form on the client. The server validates again; this is only for a fast,
 * field-level experience.
 *
 * @param form - The current form values.
 * @returns Errors keyed by field name.
 */
function validateForm(form: CheckoutForm): Partial<Record<keyof CheckoutForm, string>> {
  const errors: Partial<Record<keyof CheckoutForm, string>> = {};

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

/**
 * The storefront checkout page.
 *
 * @returns The checkout screen.
 */
export default function CheckoutPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeSlug = params.storeSlug as string;

  const [store, setStore] = useState<Store | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>({});

  const [couponInput, setCouponInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = useState('standard');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wasCancelled = searchParams.get('checkout') === 'cancelled';

  // Load the store.
  useEffect(() => {
    if (!storeSlug) return;

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(`/api/stores/public?slug=${encodeURIComponent(storeSlug)}`);
        const json = await response.json();
        if (cancelled) return;

        if (json.success && json.data) {
          setStore(json.data as Store);
        } else {
          setStoreError('This store could not be found.');
        }
      } catch {
        if (!cancelled) setStoreError('We could not reach the store right now.');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  // Load the cart and any coupon the shopper applied earlier.
  useEffect(() => {
    setCart(readCart());

    try {
      const saved = window.localStorage.getItem('appliedCoupon');
      if (saved) {
        const parsed = JSON.parse(saved) as { code?: string };
        if (parsed.code) {
          setCouponInput(parsed.code);
          setAppliedCode(parsed.code);
        }
      }
    } catch {
      window.localStorage.removeItem('appliedCoupon');
    }

    setLoading(false);
  }, []);

  const cartKey = useMemo(
    () => cart.map((item) => `${item.product_id}:${item.quantity}`).join('|'),
    [cart]
  );

  // Re-quote whenever anything that affects price changes.
  const refreshQuote = useCallback(async () => {
    if (!store || cart.length === 0) {
      setQuote(null);
      return;
    }

    setQuoting(true);

    try {
      const response = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
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
  }, [store, cart, appliedCode, shippingMethod, form.state, form.postalCode]);

  useEffect(() => {
    void refreshQuote();
    // cartKey stands in for the cart contents so the effect does not fire on identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, cartKey, appliedCode, shippingMethod]);

  /**
   * Update one form field and clear its error.
   *
   * @param field - The field to update.
   * @param value - The new value.
   */
  const updateField = (field: keyof CheckoutForm, value: string): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFormErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  /**
   * Apply the coupon code currently in the input.
   */
  const applyCoupon = (): void => {
    const code = couponInput.trim();
    if (!code) return;
    setAppliedCode(code);
    window.localStorage.setItem('appliedCoupon', JSON.stringify({ code }));
  };

  /**
   * Remove the applied coupon.
   */
  const removeCoupon = (): void => {
    setAppliedCode(null);
    setCouponInput('');
    window.localStorage.removeItem('appliedCoupon');
  };

  /**
   * Validate, create a Stripe Checkout Session, and redirect to Stripe.
   */
  const startPayment = async (): Promise<void> => {
    const errors = validateForm(form);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitError('Check the highlighted fields and try again.');
      return;
    }

    if (!store) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
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
        // The cart is cleared only after the webhook creates the order; leaving it intact means a
        // cancelled payment returns the shopper to a full cart.
        window.location.href = json.data.url as string;
        return;
      }

      if (json.fieldErrors) {
        setFormErrors(json.fieldErrors as Partial<Record<keyof CheckoutForm, string>>);
      }

      if (json.code === 'CART_CHANGED') {
        await refreshQuote();
      }

      setSubmitError(json.message ?? json.error ?? 'We could not start checkout.');
    } catch {
      setSubmitError('We could not reach the payment service. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (!store && !storeError)) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text>Loading checkout…</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (storeError || !store) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="Store unavailable">
          {storeError ?? 'This store could not be found.'}
        </Alert>
      </Container>
    );
  }

  if (cart.length === 0) {
    return (
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
          <Container size="sm" py="xl">
            <Stack align="center" gap="lg">
              <IconShoppingCart size={48} style={{ color: 'var(--theme-primary)' }} />
              <Title order={2} style={{ color: 'var(--theme-text)' }}>
                Your cart is empty
              </Title>
              <Text style={{ color: 'var(--theme-text-muted)' }} ta="center">
                Add something to your cart and it will show up here, ready to check out.
              </Text>
              <Button
                component={Link}
                href={`/store/${storeSlug}`}
                leftSection={<IconArrowLeft size={16} />}
                style={{ background: 'var(--theme-primary-gradient)', border: 'none' }}
              >
                Continue shopping
              </Button>
            </Stack>
          </Container>
        </div>
      </StoreThemeProvider>
    );
  }

  const paymentsDisabled = quote !== null && !quote.payments.enabled;
  const hasRejections = (quote?.rejected.length ?? 0) > 0;
  const canPay =
    !submitting && !quoting && !paymentsDisabled && !hasRejections && (quote?.items.length ?? 0) > 0;

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)', paddingBottom: 96 }}>
        <Container size="xl" py="xl">
          <Title order={1} mb="lg" style={{ color: 'var(--theme-text)' }}>
            Checkout
          </Title>

          {wasCancelled ? (
            <Alert color="yellow" mb="lg" title="Payment cancelled">
              Nothing was charged. Your cart is exactly as you left it.
            </Alert>
          ) : null}

          {paymentsDisabled ? (
            <Alert
              color="yellow"
              mb="lg"
              icon={<IconAlertTriangle size={18} />}
              title="Payments are not set up for this store yet"
            >
              {store.store_name} has not finished connecting a payment account, so orders cannot be
              placed right now. Your cart is saved — try again later, or contact the store directly.
            </Alert>
          ) : null}

          {hasRejections ? (
            <Alert color="red" mb="lg" title="Some items are no longer available">
              <Stack gap={4}>
                {quote?.rejected.map((rejection) => (
                  <Text key={`${rejection.requestedId}-${rejection.reason}`} size="sm">
                    {rejection.message}
                  </Text>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {submitError ? (
            <Alert color="red" mb="lg" title="We could not continue">
              {submitError}
            </Alert>
          ) : null}

          <Grid gutter="xl">
            <GridCol span={{ base: 12, lg: 7 }}>
              <Stack gap="lg">
                <Card
                  component="section"
                  aria-labelledby="cart-review-heading"
                  shadow="sm"
                  padding="lg"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <Title
                    id="cart-review-heading"
                    order={2}
                    size="h4"
                    mb="md"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    Review your order
                  </Title>

                  <Stack gap="md">
                    {(quote?.items ?? []).map((item) => (
                      <Group key={item.productId} wrap="nowrap" align="flex-start">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt=""
                            w={56}
                            h={56}
                            fit="cover"
                            radius="md"
                            style={{ flexShrink: 0 }}
                          />
                        ) : null}
                        <div style={{ flex: 1 }}>
                          <Text fw={500} size="sm" style={{ color: 'var(--theme-text)' }}>
                            {item.name}
                          </Text>
                          <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                            {item.sku} · {item.unitPrice} × {item.quantity}
                          </Text>
                        </div>
                        <Text fw={600} size="sm" style={{ color: 'var(--theme-text)' }}>
                          {item.lineTotal}
                        </Text>
                      </Group>
                    ))}

                    {quoting && !quote ? <Loader size="sm" /> : null}
                  </Stack>
                </Card>

                <Card
                  component="section"
                  aria-labelledby="contact-heading"
                  shadow="sm"
                  padding="lg"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <Title
                    id="contact-heading"
                    order={2}
                    size="h4"
                    mb="md"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    Contact details
                  </Title>

                  <Grid>
                    <GridCol span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="First name"
                        value={form.firstName}
                        onChange={(event) => updateField('firstName', event.currentTarget.value)}
                        error={formErrors.firstName}
                        autoComplete="given-name"
                        required
                      />
                    </GridCol>
                    <GridCol span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Last name"
                        value={form.lastName}
                        onChange={(event) => updateField('lastName', event.currentTarget.value)}
                        error={formErrors.lastName}
                        autoComplete="family-name"
                        required
                      />
                    </GridCol>
                    <GridCol span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Email"
                        type="email"
                        value={form.email}
                        onChange={(event) => updateField('email', event.currentTarget.value)}
                        error={formErrors.email}
                        description="Your receipt and shipping updates go here."
                        autoComplete="email"
                        required
                      />
                    </GridCol>
                    <GridCol span={{ base: 12, sm: 6 }}>
                      <TextInput
                        label="Phone"
                        value={form.phone}
                        onChange={(event) => updateField('phone', event.currentTarget.value)}
                        error={formErrors.phone}
                        autoComplete="tel"
                      />
                    </GridCol>
                  </Grid>
                </Card>

                <Card
                  component="section"
                  aria-labelledby="shipping-heading"
                  shadow="sm"
                  padding="lg"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <Title
                    id="shipping-heading"
                    order={2}
                    size="h4"
                    mb="md"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    Shipping address
                  </Title>

                  <Stack gap="sm">
                    <TextInput
                      label="Street address"
                      value={form.addressLine1}
                      onChange={(event) => updateField('addressLine1', event.currentTarget.value)}
                      error={formErrors.addressLine1}
                      autoComplete="address-line1"
                      required
                    />
                    <TextInput
                      label="Apartment, suite (optional)"
                      value={form.addressLine2}
                      onChange={(event) => updateField('addressLine2', event.currentTarget.value)}
                      autoComplete="address-line2"
                    />
                    <Grid>
                      <GridCol span={{ base: 12, sm: 5 }}>
                        <TextInput
                          label="City"
                          value={form.city}
                          onChange={(event) => updateField('city', event.currentTarget.value)}
                          error={formErrors.city}
                          autoComplete="address-level2"
                          required
                        />
                      </GridCol>
                      <GridCol span={{ base: 6, sm: 3 }}>
                        <Select
                          label="State"
                          data={US_STATES}
                          value={form.state || null}
                          onChange={(value) => updateField('state', value ?? '')}
                          error={formErrors.state}
                          searchable
                          required
                        />
                      </GridCol>
                      <GridCol span={{ base: 6, sm: 4 }}>
                        <TextInput
                          label="ZIP code"
                          value={form.postalCode}
                          onChange={(event) => updateField('postalCode', event.currentTarget.value)}
                          onBlur={() => void refreshQuote()}
                          error={formErrors.postalCode}
                          autoComplete="postal-code"
                          inputMode="numeric"
                          required
                        />
                      </GridCol>
                    </Grid>
                  </Stack>

                  <Divider my="lg" />

                  <Title order={3} size="h5" mb="sm" style={{ color: 'var(--theme-text)' }}>
                    Shipping speed
                  </Title>

                  <Radio.Group value={shippingMethod} onChange={setShippingMethod}>
                    <Stack gap="xs">
                      {(quote?.shippingOptions ?? []).map((option) => (
                        <Radio
                          key={option.id}
                          value={option.id}
                          label={
                            <Group justify="space-between" style={{ width: '100%' }}>
                              <div>
                                <Text size="sm" fw={500} style={{ color: 'var(--theme-text)' }}>
                                  {option.name}
                                </Text>
                                <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                                  {option.description}
                                </Text>
                                <Badge size="xs" variant="light">
                                  {option.estimatedDays}
                                </Badge>
                              </div>
                            </Group>
                          }
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                </Card>
              </Stack>
            </GridCol>

            <GridCol span={{ base: 12, lg: 5 }}>
              <Box style={{ position: 'sticky', top: 20 }}>
                <Card
                  component="aside"
                  aria-labelledby="summary-heading"
                  shadow="sm"
                  padding="lg"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <Title
                    id="summary-heading"
                    order={2}
                    size="h4"
                    mb="md"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    Order summary
                  </Title>

                  <Stack gap="sm">
                    <div>
                      <Text size="sm" fw={500} mb={6} style={{ color: 'var(--theme-text)' }}>
                        Coupon code
                      </Text>
                      {quote?.coupon ? (
                        <Group justify="space-between">
                          <div>
                            <Text size="sm" fw={600} style={{ color: 'var(--theme-success)' }}>
                              {quote.coupon.code}
                            </Text>
                            <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                              {quote.coupon.description}
                            </Text>
                          </div>
                          <Button variant="subtle" size="compact-sm" onClick={removeCoupon}>
                            Remove
                          </Button>
                        </Group>
                      ) : (
                        <Group gap="xs" align="flex-start">
                          <TextInput
                            aria-label="Coupon code"
                            placeholder="Enter code"
                            value={couponInput}
                            onChange={(event) => setCouponInput(event.currentTarget.value)}
                            style={{ flex: 1 }}
                            error={
                              quote?.couponRejected
                                ? 'That code is not valid for this cart'
                                : undefined
                            }
                          />
                          <Button
                            variant="outline"
                            onClick={applyCoupon}
                            disabled={!couponInput.trim() || quoting}
                          >
                            Apply
                          </Button>
                        </Group>
                      )}
                    </div>

                    <Divider />

                    <Group justify="space-between">
                      <Text style={{ color: 'var(--theme-text)' }}>Subtotal</Text>
                      <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                        {quote?.totals.subtotal ?? '—'}
                      </Text>
                    </Group>

                    {quote && quote.totals.discountCents > 0 ? (
                      <Group justify="space-between">
                        <Text style={{ color: 'var(--theme-text)' }}>Discount</Text>
                        <Text fw={600} style={{ color: 'var(--theme-success)' }}>
                          −{quote.totals.discount}
                        </Text>
                      </Group>
                    ) : null}

                    <Group justify="space-between">
                      <Text style={{ color: 'var(--theme-text)' }}>Shipping</Text>
                      <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                        {quote?.totals.shipping ?? '—'}
                      </Text>
                    </Group>

                    <Group justify="space-between">
                      <Text style={{ color: 'var(--theme-text)' }}>Tax</Text>
                      <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                        {quote?.totals.tax ?? '—'}
                      </Text>
                    </Group>

                    <Divider />

                    <Group justify="space-between">
                      <Text size="lg" fw={700} style={{ color: 'var(--theme-text)' }}>
                        Total
                      </Text>
                      <Text size="lg" fw={700} style={{ color: 'var(--theme-text)' }}>
                        {quoting ? '…' : (quote?.totals.total ?? '—')}
                      </Text>
                    </Group>

                    <Button
                      size="lg"
                      fullWidth
                      mt="sm"
                      leftSection={<IconLock size={18} />}
                      loading={submitting}
                      disabled={!canPay}
                      onClick={() => void startPayment()}
                      style={{ background: 'var(--theme-primary-gradient)', border: 'none' }}
                    >
                      {submitting
                        ? 'Redirecting to Stripe…'
                        : paymentsDisabled
                          ? 'Payments unavailable'
                          : `Pay ${quote?.totals.total ?? ''}`.trim()}
                    </Button>

                    <Text size="xs" ta="center" style={{ color: 'var(--theme-text-muted)' }}>
                      You will be redirected to Stripe to enter your card details. RebelShops never
                      sees your card number.
                    </Text>

                    <Button
                      variant="subtle"
                      leftSection={<IconArrowLeft size={16} />}
                      onClick={() => router.push(`/store/${storeSlug}/cart`)}
                      fullWidth
                    >
                      Back to cart
                    </Button>
                  </Stack>
                </Card>
              </Box>
            </GridCol>
          </Grid>
        </Container>
      </div>
    </StoreThemeProvider>
  );
}
