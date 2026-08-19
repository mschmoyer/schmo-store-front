'use client';

/**
 * The Stripe card on the integrations page.
 *
 * It used to collect a per-store "Stripe Secret Key" into `store_integrations`,
 * and **nothing read it** — no payment code in `src/lib/stripe/**`,
 * `src/lib/billing/**` or the checkout/billing/connect routes touches that
 * column. Payments run on the platform key in `STRIPE_SECRET_KEY` plus a Stripe
 * **Connect** account per store. So the card reported "Active" from a row that
 * had no bearing on whether the store could take a payment.
 *
 * This shows the two things that actually decide that:
 *
 * 1. whether the platform is configured at all (`configured`), which is our
 *    problem and not the merchant's, and
 * 2. whether *their* Connect account can accept charges and receive payouts.
 *
 * Those come from `GET /api/connect/status`, which refreshes from Stripe rather
 * than trusting the local mirror — the merchant may have finished onboarding in
 * another tab.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCheck,
  IconCreditCard,
  IconExternalLink,
  IconPlug,
  IconX,
} from '@tabler/icons-react';

/** Connect status as `/api/connect/status` reports it. */
interface ConnectStatus {
  configured: boolean;
  connected: boolean;
  account: {
    stripeAccountId: string;
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsCurrentlyDue: string[] | null;
    disabledReason: string | null;
    country: string | null;
    defaultCurrency: string | null;
  } | null;
}

/**
 * Stripe Connect status and actions.
 *
 * @returns The card
 */
export function StripeConnectCard() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'test' | 'disconnect' | null>(null);

  /**
   * Read Connect status from the server.
   *
   * @returns The status, or null when unreachable
   */
  const readStatus = useCallback(async (): Promise<ConnectStatus | null> => {
    try {
      const response = await fetch('/api/connect/status', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ConnectStatus;
      };
      return response.ok && payload.data ? payload.data : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setStatus(await readStatus());
      setLoading(false);
    })();
  }, [readStatus]);

  /** Start (or resume) Connect onboarding in this tab. */
  const connect = async () => {
    setBusy('connect');
    try {
      const response = await fetch('/api/connect/onboard', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { url?: string };
        error?: string;
      };
      if (payload.data?.url) {
        window.location.href = payload.data.url;
        return;
      }
      notifications.show({
        title: 'Could not start Stripe onboarding',
        message: payload.error ?? 'Stripe did not return an onboarding link.',
        color: 'red',
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: 'We couldn’t reach the server to start Stripe onboarding.',
        color: 'red',
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Re-read the account from Stripe and report what it can actually do.
   *
   * "Connected" alone is not the useful fact — an account can exist, be linked,
   * and still be unable to take a payment while requirements are outstanding.
   */
  const test = async () => {
    setBusy('test');
    const fresh = await readStatus();
    setStatus(fresh);
    setBusy(null);

    if (!fresh) {
      notifications.show({ title: 'Stripe test failed', message: 'We couldn’t reach Stripe.', color: 'red' });
      return;
    }
    if (!fresh.configured) {
      notifications.show({
        title: 'Stripe is not configured',
        message: 'STRIPE_SECRET_KEY is missing on the server. This one is on us, not your account.',
        color: 'red',
      });
      return;
    }
    if (!fresh.connected || !fresh.account) {
      notifications.show({
        title: 'No Stripe account linked',
        message: 'Connect Stripe to start taking payments.',
        color: 'red',
      });
      return;
    }

    const ok = fresh.account.chargesEnabled && fresh.account.payoutsEnabled;
    notifications.show({
      title: ok ? 'Stripe is working' : 'Stripe is linked but not ready',
      message: ok
        ? 'Your account can accept charges and receive payouts.'
        : `Charges ${fresh.account.chargesEnabled ? 'enabled' : 'disabled'}, payouts ${
            fresh.account.payoutsEnabled ? 'enabled' : 'disabled'
          }. Finish the outstanding requirements in Stripe.`,
      color: ok ? 'green' : 'yellow',
      icon: ok ? <IconCheck size="1.1rem" /> : undefined,
    });
  };

  /** Unlink the Connect account after an explicit confirmation. */
  const disconnect = async () => {
    const confirmed = window.confirm(
      'Disconnect Stripe?\n\nYour storefront stops being able to take payments until you reconnect. Your Stripe account itself is not deleted — we only remove the link.'
    );
    if (!confirmed) return;

    setBusy('disconnect');
    try {
      const response = await fetch('/api/connect/disconnect', { method: 'DELETE' });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || payload.success === false) {
        notifications.show({
          title: 'Could not disconnect',
          message: payload.error ?? 'The server refused the request.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: 'Stripe disconnected',
        message: payload.message ?? 'The link has been removed.',
        color: 'green',
      });
      setStatus(await readStatus());
    } catch {
      notifications.show({
        title: 'Error',
        message: 'We couldn’t reach the server to disconnect Stripe.',
        color: 'red',
      });
    } finally {
      setBusy(null);
    }
  };

  const account = status?.account ?? null;
  const ready = Boolean(account?.chargesEnabled && account?.payoutsEnabled);
  const linked = Boolean(status?.connected && account);

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <IconCreditCard size="1.4rem" />
          <div>
            <Title order={3} size="h4">
              Stripe
            </Title>
            <Text size="sm" c="dimmed">
              Takes payments on your storefront and pays out to your bank.
            </Text>
          </div>
        </Group>

        <Group gap="sm">
          {loading ? (
            <Loader size="xs" />
          ) : (
            <Badge color={ready ? 'green' : linked ? 'yellow' : 'gray'} variant="light">
              {ready ? 'Taking payments' : linked ? 'Setup incomplete' : 'Not connected'}
            </Badge>
          )}
          <Anchor href="https://stripe.com/docs/connect" target="_blank" rel="noopener noreferrer" size="sm">
            <Group gap={4} wrap="nowrap">
              Help
              <IconExternalLink size="0.85rem" />
            </Group>
          </Anchor>
        </Group>
      </Group>

      {/* The platform key is our configuration, not the merchant's. Saying so
          stops them hunting for a mistake in their own Stripe account. */}
      {status && !status.configured && (
        <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light" mb="md">
          Payments are not configured on this deployment (<code>STRIPE_SECRET_KEY</code> is missing).
          Connecting your account will not enable checkout until that is set.
        </Alert>
      )}

      {linked && account && !ready && (
        <Alert icon={<IconAlertTriangle size="1rem" />} color="yellow" variant="light" mb="md">
          Stripe has your account but is not letting it{' '}
          {!account.chargesEnabled && !account.payoutsEnabled
            ? 'take charges or send payouts'
            : !account.chargesEnabled
              ? 'take charges'
              : 'send payouts'}{' '}
          yet
          {account.disabledReason ? ` (${account.disabledReason})` : ''}. Continue setup to finish
          the outstanding requirements.
        </Alert>
      )}

      {linked && account && (
        <Stack gap={4} mb="md">
          <Text size="sm">
            Account <Text span ff="monospace">{account.stripeAccountId}</Text>
            {account.country ? ` · ${account.country.toUpperCase()}` : ''}
            {account.defaultCurrency ? ` · ${account.defaultCurrency.toUpperCase()}` : ''}
          </Text>
        </Stack>
      )}

      <Group gap="sm">
        {linked ? (
          <>
            <Button
              variant="light"
              color="green"
              size="sm"
              loading={busy === 'test'}
              leftSection={<IconCheck size="0.9rem" />}
              onClick={test}
            >
              Test
            </Button>
            {!ready && (
              <Button variant="filled" size="sm" loading={busy === 'connect'} onClick={connect}>
                Continue setup
              </Button>
            )}
            <Button
              variant="light"
              color="red"
              size="sm"
              loading={busy === 'disconnect'}
              leftSection={<IconX size="0.9rem" />}
              onClick={disconnect}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="filled"
            size="sm"
            loading={busy === 'connect'}
            leftSection={<IconPlug size="0.9rem" />}
            onClick={connect}
            disabled={loading}
          >
            Connect
          </Button>
        )}
      </Group>
    </Card>
  );
}
