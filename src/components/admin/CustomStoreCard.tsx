'use client';

/**
 * The ShipStation Custom Store setup card.
 *
 * @channel custom-store
 *
 * Setting up a Custom Store means retyping nine values into ShipStation's connection form, and
 * getting any one of them wrong fails silently — orders land in the wrong bucket, or never import,
 * with no error surfaced anywhere. So this card's job is not to look configured; it is to make the
 * merchant's copy-paste impossible to get wrong.
 *
 * Three decisions follow from that:
 *
 *   - **Every value is copyable and shown verbatim**, including the five status strings. Those map
 *     our `<OrderStatus>` values onto ShipStation's statuses and the spec says they are
 *     case-sensitive; nobody guesses `awaiting_fulfillment`. They come from the server, derived
 *     from the same mapping the feed emits, so this screen cannot drift from reality.
 *   - **The password is shown, not masked.** It exists to be pasted into another system. Masking it
 *     would mean a merchant who lost it must rotate, and rotating silently breaks a live connection
 *     until they notice imports stopped.
 *   - **Status is a timestamp, not a badge.** ShipStation's polling cadence is not a fixed interval
 *     (spec §4), so "connected" claims something we cannot know. "Last request received 4 minutes
 *     ago" is a fact. Before the first poll, the card says plainly that ShipStation has not called
 *     yet — which is the honest state, not an error.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  List,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconRefresh,
  IconTruck,
} from '@tabler/icons-react';

/** Connection details as returned by `/api/admin/integrations/shipstation/custom-store`. */
export interface CustomStoreConnection {
  configured: boolean;
  lastPollAt: string | null;
  endpointUrl: string;
  username: string | null;
  password: string | null;
  enabled: boolean;
  statusMapping: Record<string, string>;
  encryptionConfigured: boolean;
}

/** Props for {@link CustomStoreCard}. */
export interface CustomStoreCardProps {
  /** Bearer token for the admin API. */
  token: string | null;
}

/**
 * Render one labelled value with a copy button.
 *
 * @param props.label - Field label, matching ShipStation's own wording where one exists.
 * @param props.value - Value to copy. An empty string renders as a deliberate blank.
 * @param props.hint - Optional clarification shown beneath the value.
 * @returns A copyable row.
 */
function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const isBlank = value === '';

  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="md">
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text
          size="sm"
          c={isBlank ? 'dimmed' : undefined}
          ff={isBlank ? undefined : 'monospace'}
          style={{ wordBreak: 'break-all' }}
        >
          {isBlank ? 'Leave this field empty' : value}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed" mt={2}>
            {hint}
          </Text>
        )}
      </div>
      {!isBlank && (
        <CopyButton value={value} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
              <Button
                size="compact-sm"
                variant={copied ? 'light' : 'subtle'}
                color={copied ? 'green' : 'gray'}
                onClick={copy}
                aria-label={`Copy ${label}`}
              >
                {copied ? <IconCheck size="1rem" /> : <IconCopy size="1rem" />}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      )}
    </Group>
  );
}

/**
 * Describe how long ago ShipStation last called, in words.
 *
 * @param iso - ISO timestamp, or null when it never has.
 * @returns Human-readable relative time.
 */
function describeLastPoll(iso: string | null): string {
  if (!iso) {
    return 'ShipStation has not called yet';
  }
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Last request received just now';
  if (minutes < 60) return `Last request received ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last request received ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Last request received ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * ShipStation Custom Store connection card.
 *
 * @param props - Component props.
 * @returns The card, or a loading state while connection details are fetched.
 */
export function CustomStoreCard({ token }: CustomStoreCardProps) {
  const [connection, setConnection] = useState<CustomStoreConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  const endpoint = '/api/admin/integrations/shipstation/custom-store';

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Could not load connection details');
      }
      setConnection(body.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load connection details');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // The work runs inside an async body so no state is set synchronously during the effect, and
    // a card unmounted mid-request does not write to dead state.
    let cancelled = false;
    void (async () => {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, token]);

  /**
   * Issue a fresh credential pair, replacing any existing one.
   *
   * @returns Nothing.
   */
  const rotate = async () => {
    if (!token) return;
    setWorking(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rotate: true }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Could not issue credentials');
      }
      setConnection(body.data);
      setError(null);
      setConfirmingRotate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue credentials');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" withBorder>
        <Group gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading Custom Store connection…
          </Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="lg" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <IconTruck size="1.4rem" />
          <div>
            <Title order={3} size="h4">
              ShipStation Custom Store
            </Title>
            <Text size="sm" c="dimmed">
              Sends your orders to ShipStation and receives tracking back.
            </Text>
          </div>
        </Group>
        {connection?.configured && (
          <Badge color={connection.lastPollAt ? 'green' : 'gray'} variant="light">
            {connection.lastPollAt ? 'Receiving requests' : 'Awaiting first request'}
          </Badge>
        )}
      </Group>

      {/* Catalogue comes from the V2 API, not this feed. A merchant who sets this up and then
          wonders why no products appeared has been misled by an incomplete screen. */}
      <Alert icon={<IconInfoCircle size="1rem" />} variant="light" color="ink" mb="md">
        This connection carries <strong>orders and tracking only</strong>. Products and inventory
        come from your ShipStation API key, configured separately above — most stores need both.
      </Alert>

      {error && (
        <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}

      {connection && !connection.encryptionConfigured && (
        <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" variant="light" mb="md">
          Credential encryption is not configured on this environment, so connection details cannot
          be stored or read. Set <code>SHIPSTATION_ENCRYPTION_KEY</code> and reload.
        </Alert>
      )}

      {!connection?.configured ? (
        <Stack gap="md">
          <Text size="sm">
            Generate a username and password for ShipStation to authenticate with, then paste them
            into ShipStation&apos;s Custom Store form along with the endpoint URL.
          </Text>
          <Button
            onClick={rotate}
            loading={working}
            disabled={!token || !connection?.encryptionConfigured}
            leftSection={<IconTruck size="1rem" />}
            style={{ alignSelf: 'flex-start' }}
          >
            Generate connection details
          </Button>
        </Stack>
      ) : (
        <Stack gap="lg">
          <Text size="sm" c={connection.lastPollAt ? undefined : 'dimmed'}>
            {describeLastPoll(connection.lastPollAt)}
            {!connection.lastPollAt &&
              ' — this is normal until you finish the setup below and ShipStation runs its first import.'}
          </Text>

          <Divider label="Paste into ShipStation" labelPosition="left" />

          <Stack gap="sm">
            <CopyRow label="URL to custom XML page" value={connection.endpointUrl} />
            <CopyRow label="Username" value={connection.username ?? ''} />
            <CopyRow
              label="Password"
              value={connection.password ?? ''}
              hint="Shown in full because it exists to be pasted. Treat it like any other credential."
            />
          </Stack>

          <div>
            <Text size="sm" fw={500} mb={4}>
              Status fields
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              ShipStation matches these against the status on each order. They are case-sensitive —
              copy them exactly rather than typing them.
            </Text>
            <Table withTableBorder verticalSpacing="xs" horizontalSpacing="sm">
              <Table.Tbody>
                {Object.entries(connection.statusMapping).map(([label, value]) => (
                  <Table.Tr key={label}>
                    <Table.Td style={{ width: '100%' }}>
                      <CopyRow label={label} value={value} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>

          <Divider label="Where these go in ShipStation" labelPosition="left" />

          {/* Tailwind's preflight resets `ol` list-style, so the marker has to be asked for
              explicitly — an unnumbered six-step procedure is worse than no list at all. */}
          <List size="sm" spacing="xs" type="ordered" listStyleType="decimal" withPadding>
            <List.Item>Open ShipStation and go to Account Settings.</List.Item>
            <List.Item>Select Selling Channels, then Store Setup.</List.Item>
            <List.Item>Click Connect a Store or Marketplace.</List.Item>
            <List.Item>Choose Custom Store.</List.Item>
            <List.Item>Paste the URL, username and password, then the five status fields.</List.Item>
            <List.Item>
              Click Test Connection. If it succeeds, this card will show a received request within a
              few minutes.
            </List.Item>
          </List>

          <Divider />

          {confirmingRotate ? (
            <Alert icon={<IconAlertTriangle size="1rem" />} color="orange" variant="light">
              <Text size="sm" mb="sm">
                Generating new details makes the current password stop working immediately.
                ShipStation will fail to import orders until you paste the new one in.
              </Text>
              <Group gap="sm">
                <Button color="orange" size="xs" loading={working} onClick={rotate}>
                  Generate new details
                </Button>
                <Button variant="subtle" size="xs" onClick={() => setConfirmingRotate(false)}>
                  Cancel
                </Button>
              </Group>
            </Alert>
          ) : (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconRefresh size="0.9rem" />}
              onClick={() => setConfirmingRotate(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              Generate new details
            </Button>
          )}
        </Stack>
      )}
    </Card>
  );
}

export default CustomStoreCard;
