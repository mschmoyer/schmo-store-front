'use client';

/**
 * Order confirmation.
 *
 * The page is reached from Stripe with `?session_id=cs_...` and nothing else. It confirms that
 * session against the server (`GET /api/checkout/confirm`), which resolves it to a real order row;
 * the query string is never treated as evidence that anything was paid. While the webhook is still
 * in flight the page polls briefly and shows a "finishing up" state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconArrowRight, IconCheck, IconClock } from '@tabler/icons-react';
import Confetti from 'react-confetti';
import { useViewportSize } from '@mantine/hooks';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';

/** Store metadata from the public stores endpoint. */
interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

/** A confirmed order line. */
interface ConfirmedItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  imageUrl: string | null;
}

/** A confirmed order. */
interface ConfirmedOrder {
  orderNumber: string;
  paymentStatus: string | null;
  total: string;
  currency: string;
  email: string | null;
  placedAt: string | null;
  items: ConfirmedItem[];
}

/** States the confirmation endpoint can report. */
type ConfirmationStatus = 'loading' | 'paid' | 'processing' | 'open' | 'expired' | 'not_found';

/** How long to keep polling for the webhook before giving up, in milliseconds. */
const POLL_WINDOW_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * Format a currency amount the server already rounded.
 *
 * @param amount - Decimal string such as `"49.98"`.
 * @param currency - ISO-4217 currency code.
 * @returns A localized currency string.
 */
function formatAmount(amount: string, currency: string): string {
  const numeric = Number.parseFloat(amount);
  if (!Number.isFinite(numeric)) return amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
  }).format(numeric);
}

/**
 * The order confirmation page.
 *
 * @returns The confirmation screen.
 */
export default function OrderSuccessPage(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const { width, height } = useViewportSize();

  const storeSlug = params.storeSlug as string;
  const sessionId = searchParams.get('session_id');

  const [store, setStore] = useState<Store | null>(null);
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!storeSlug) return;

    const run = async () => {
      try {
        const response = await fetch(`/api/stores/public?slug=${encodeURIComponent(storeSlug)}`);
        const json = await response.json();
        if (json.success && json.data) {
          setStore(json.data as Store);
        }
      } catch {
        // The confirmation still works without store branding.
      }
    };

    void run();
  }, [storeSlug]);

  const confirm = useCallback(async (): Promise<ConfirmationStatus> => {
    if (!sessionId) {
      setStatus('not_found');
      return 'not_found';
    }

    try {
      const response = await fetch(
        `/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`
      );
      const json = await response.json();

      if (!json.success) {
        setError(json.error ?? 'We could not confirm your order.');
        setStatus('not_found');
        return 'not_found';
      }

      const next = json.data.status as ConfirmationStatus;
      setStatus(next);

      if (next === 'paid' && json.data.order) {
        setOrder(json.data.order as ConfirmedOrder);
        // The order exists server-side, so the local cart is now safe to clear.
        window.localStorage.removeItem('cart');
        window.localStorage.removeItem('appliedCoupon');
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: [] }));
        setShowConfetti(true);
      }

      return next;
    } catch {
      setError('We could not reach the store to confirm your order.');
      setStatus('not_found');
      return 'not_found';
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const result = await confirm();
      if (cancelled) return;

      const keepPolling =
        (result === 'processing' || result === 'open') &&
        Date.now() - startedAt.current < POLL_WINDOW_MS;

      if (keepPolling) {
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [confirm]);

  useEffect(() => {
    if (!showConfetti) return;
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, [showConfetti]);

  const themeId = store?.theme_name || 'default';

  const body = (() => {
    if (status === 'loading') {
      return (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader size="lg" />
            <Text style={{ color: 'var(--theme-text-muted)' }}>Confirming your order…</Text>
          </Stack>
        </Center>
      );
    }

    if (status === 'processing' || status === 'open') {
      return (
        <Stack align="center" gap="md" py="lg">
          <ThemeIcon size={72} radius="xl" color="yellow" variant="light">
            <IconClock size={40} />
          </ThemeIcon>
          <Title order={1} size="h2" ta="center" style={{ color: 'var(--theme-text)' }}>
            {status === 'processing' ? 'Payment received' : 'Waiting for payment'}
          </Title>
          <Text ta="center" style={{ color: 'var(--theme-text-muted)' }} maw={520}>
            {status === 'processing'
              ? 'Your payment went through and we are finishing your order now. This page will update by itself.'
              : 'We have not seen a completed payment for this checkout yet. If you closed the Stripe page, nothing was charged.'}
          </Text>
          <Loader size="sm" />
        </Stack>
      );
    }

    if (status === 'expired' || status === 'not_found') {
      return (
        <Stack align="center" gap="md" py="lg">
          <ThemeIcon size={72} radius="xl" color="red" variant="light">
            <IconAlertTriangle size={40} />
          </ThemeIcon>
          <Title order={1} size="h2" ta="center" style={{ color: 'var(--theme-text)' }}>
            {status === 'expired' ? 'This checkout expired' : 'We could not find this order'}
          </Title>
          <Text ta="center" style={{ color: 'var(--theme-text-muted)' }} maw={520}>
            {error ??
              (status === 'expired'
                ? 'The payment window closed before it was completed. Nothing was charged — start checkout again when you are ready.'
                : 'This confirmation link does not match an order in our records. If you were charged, contact the store with your email address and we will find it.')}
          </Text>
          <Button
            component={Link}
            href={`/store/${storeSlug}`}
            variant="light"
            leftSection={<IconArrowRight size={18} />}
          >
            Back to the store
          </Button>
        </Stack>
      );
    }

    return (
      <Stack align="center" gap="lg">
        <ThemeIcon
          size={80}
          radius="xl"
          style={{ background: 'var(--theme-primary-gradient)', color: '#fff' }}
        >
          <IconCheck size={44} />
        </ThemeIcon>

        <Stack align="center" gap={4}>
          <Title order={1} size="h2" ta="center" style={{ color: 'var(--theme-text)' }}>
            Order confirmed
          </Title>
          <Text ta="center" style={{ color: 'var(--theme-text-muted)' }}>
            {order?.email
              ? `A receipt is on its way to ${order.email}.`
              : 'A receipt is on its way to your inbox.'}
          </Text>
        </Stack>

        <Divider w="100%" />

        <Stack gap="xs" w="100%" maw={460}>
          <Group justify="space-between">
            <Text style={{ color: 'var(--theme-text-muted)' }}>Order number</Text>
            <Text fw={600} ff="monospace" style={{ color: 'var(--theme-text)' }}>
              {order?.orderNumber}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text style={{ color: 'var(--theme-text-muted)' }}>Total paid</Text>
            <Text fw={700} style={{ color: 'var(--theme-text)' }}>
              {order ? formatAmount(order.total, order.currency) : '—'}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text style={{ color: 'var(--theme-text-muted)' }}>Payment</Text>
            <Text fw={600} style={{ color: 'var(--theme-success)' }}>
              {order?.paymentStatus === 'paid' ? 'Paid' : (order?.paymentStatus ?? '—')}
            </Text>
          </Group>
        </Stack>

        {order && order.items.length > 0 ? (
          <Card w="100%" withBorder radius="md" padding="md">
            <Stack gap="xs">
              {order.items.map((item) => (
                <Group key={`${item.sku}-${item.name}`} justify="space-between" wrap="nowrap">
                  <Text size="sm" style={{ color: 'var(--theme-text)' }}>
                    {item.name} × {item.quantity}
                  </Text>
                  <Text size="sm" fw={600} style={{ color: 'var(--theme-text)' }}>
                    {order ? formatAmount(item.totalPrice, order.currency) : ''}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Card>
        ) : null}

        <Button
          component={Link}
          href={`/store/${storeSlug}`}
          size="lg"
          rightSection={<IconArrowRight size={18} />}
          style={{ background: 'var(--theme-primary-gradient)', border: 'none' }}
        >
          Continue shopping
        </Button>
      </Stack>
    );
  })();

  return (
    <StoreThemeProvider themeId={themeId}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
        {showConfetti ? (
          <Confetti width={width} height={height} recycle={false} numberOfPieces={200} gravity={0.3} />
        ) : null}

        <Container size="md" py="xl">
          <Box pt={48} pb={32}>
            <Paper
              shadow="lg"
              radius="lg"
              p="xl"
              style={{
                backgroundColor: 'var(--theme-card)',
                border: '1px solid var(--theme-border)',
              }}
            >
              {!sessionId ? (
                <Alert color="yellow" title="Nothing to confirm">
                  This page needs a Stripe checkout session to confirm an order.
                </Alert>
              ) : (
                body
              )}
            </Paper>
          </Box>
        </Container>
      </div>
    </StoreThemeProvider>
  );
}
