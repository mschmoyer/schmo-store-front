'use client';

/**
 * Where a merchant says what places they keep stock in.
 *
 * `inventory_locations` has existed since the ledger was built, `inventory_levels` is keyed on it,
 * the grid filters by it and every movement records one — and there was no way to create a second
 * row. So every store had exactly the one its trigger made, and multi-location was presented
 * throughout the product while being unreachable: the transfer function had no caller, the
 * adjustment dialog's location picker had a single option, and a merchant with a shop and a
 * stockroom had to pretend they were the same place.
 *
 * Deliberately a dialog rather than a settings page. Locations are set up once and then rarely
 * touched, and the moment a merchant needs one is while they are looking at stock — not three
 * screens away under a gear icon.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlus, IconStarFilled, IconTrash } from '@tabler/icons-react';

/** A location as the API returns it. */
interface Location {
  id: string;
  code: string;
  name: string;
  location_type: string;
  is_default: boolean;
  is_fulfillable: boolean;
  is_active: boolean;
  sku_count: number;
  unit_count: number;
}

export interface LocationsModalProps {
  opened: boolean;
  onClose: () => void;
  token?: string;
  /** Called after any change, so the grid's location filter and totals refresh. */
  onChanged: () => void | Promise<void>;
}

/** What each location type means, said in the merchant's terms rather than the schema's. */
const TYPES = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'store', label: 'Shop floor' },
  { value: 'transit', label: 'In transit' },
  { value: 'supplier', label: 'At a supplier' },
  { value: 'virtual', label: 'Virtual (quarantine, returns)' }
];

/**
 * The locations manager.
 *
 * @param props - {@link LocationsModalProps}
 * @returns The modal.
 */
export function LocationsModal({
  opened,
  onClose,
  token,
  onChanged
}: LocationsModalProps): React.ReactElement {
  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>('warehouse');
  const [fulfillable, setFulfillable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/admin/inventory/locations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error ?? 'Could not load');
      setLocations(payload.locations);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load locations');
    }
  }, [token]);

  useEffect(() => {
    if (opened) void load();
  }, [opened, load]);

  /**
   * Send a change and refresh both this list and the grid behind it.
   *
   * @param url - The endpoint.
   * @param init - Fetch options.
   * @param successMessage - What to say when it worked.
   */
  const send = async (url: string, init: RequestInit, successMessage?: string) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {})
        }
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }
      if (successMessage || payload?.message) {
        notifications.show({
          title: 'Saved',
          message: payload?.message ?? successMessage,
          color: 'green'
        });
      }
      await load();
      await onChanged();
    } catch (caught) {
      /* Shown in the dialog rather than as a toast: the merchant is looking at the thing that
       * failed, and the reason a location cannot be removed is usually a list of what is in it. */
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) {
      setError('Give the location a name');
      return;
    }
    await send(
      '/api/admin/inventory/locations',
      {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), location_type: type, is_fulfillable: fulfillable })
      },
      `${name.trim()} added.`
    );
    setName('');
    setFulfillable(true);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Stock locations" size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Every place a unit can be. Stock is counted per location, and moving it between them is a
          recorded movement rather than two unrelated adjustments.
        </Text>

        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Location</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Holding</Table.Th>
              <Table.Th>Sellable from</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {locations.map((location) => (
              <Table.Tr key={location.id} opacity={location.is_active ? 1 : 0.55}>
                <Table.Td>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {location.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {location.code}
                    </Text>
                    {location.is_default && (
                      <Badge size="xs" variant="light" leftSection={<IconStarFilled size={9} />}>
                        Default
                      </Badge>
                    )}
                    {!location.is_active && (
                      <Badge size="xs" variant="light" color="gray">
                        Closed
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {TYPES.find((t) => t.value === location.location_type)?.label ??
                      location.location_type}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {location.unit_count.toLocaleString()} units
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {location.sku_count} SKU{location.sku_count === 1 ? '' : 's'}
                    </Text>
                  </Text>
                </Table.Td>
                <Table.Td>
                  {/* A returns bay or a quarantine shelf holds real stock that must not be sold,
                      and this is the switch that says so. */}
                  <Switch
                    size="sm"
                    checked={location.is_fulfillable}
                    disabled={busy}
                    aria-label={`Sell from ${location.name}`}
                    onChange={(event) =>
                      void send(`/api/admin/inventory/locations/${location.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ is_fulfillable: event.currentTarget.checked })
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    {!location.is_default && (
                      <Tooltip label="Make this the default — where stock goes when no location is named">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          disabled={busy || !location.is_active}
                          aria-label={`Make ${location.name} the default location`}
                          onClick={() =>
                            void send(`/api/admin/inventory/locations/${location.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_default: true })
                            })
                          }
                        >
                          <IconStarFilled size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {!location.is_default && (
                      <Tooltip label="Remove">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          disabled={busy}
                          aria-label={`Remove ${location.name}`}
                          onClick={() =>
                            void send(`/api/admin/inventory/locations/${location.id}`, {
                              method: 'DELETE'
                            })
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        <Group align="flex-end" gap="sm">
          <TextInput
            label="Add a location"
            placeholder="Back room"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Select label="Type" data={TYPES} value={type} onChange={setType} w={200} />
          <Switch
            label="Sell from here"
            checked={fulfillable}
            onChange={(event) => setFulfillable(event.currentTarget.checked)}
            mb={8}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={() => void create()} loading={busy}>
            Add
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default LocationsModal;
