'use client';

/**
 * Moving stock between locations.
 *
 * `transferStock` has been in the ledger library since it was written, correct and tested, with no
 * caller anywhere. So a merchant could record that stock existed in two places and never record it
 * moving between them — which meant either location's balance drifted from reality the first time
 * anyone carried a box.
 *
 * A transfer is deliberately not an adjustment at each end. Two adjustments are two independent
 * facts that happen to cancel; a transfer is one movement with two legs, and the ledger records it
 * that way so it nets to zero across the store and can be read from either side.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowRight } from '@tabler/icons-react';

/** The product being moved. */
export interface TransferTarget {
  product_id: string;
  sku: string;
  name: string;
}

export interface TransferStockModalProps {
  target: TransferTarget | null;
  onClose: () => void;
  locations: Array<{ value: string; label: string }>;
  /** The location the grid is filtered to, used as the origin. */
  activeLocationId?: string | null;
  token?: string;
  onTransferred: () => void | Promise<void>;
}

/** One location's holding of the product being moved. */
interface LocationBalance {
  location_id: string;
  location_name: string;
  on_hand: number;
  available: number;
}

/**
 * The stock transfer dialog.
 *
 * @param props - {@link TransferStockModalProps}
 * @returns The modal.
 */
export function TransferStockModal({
  target,
  onClose,
  locations,
  activeLocationId,
  token,
  onTransferred
}: TransferStockModalProps): React.ReactElement {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>('');
  const [note, setNote] = useState('');
  const [balances, setBalances] = useState<LocationBalance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setFrom(activeLocationId ?? null);
    setTo(null);
    setQuantity('');
    setNote('');
    setError(null);
    setBalances([]);

    if (!token) return;
    fetch(`/api/admin/inventory/${target.product_id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setBalances(payload?.data?.locations ?? []))
      .catch(() => setBalances([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.product_id]);

  const byId = useMemo(
    () => Object.fromEntries(balances.map((b) => [b.location_id, b])),
    [balances]
  );

  /*
   * Available, not on hand. Units already committed to an order cannot be sent to another
   * location — they are due to leave from this one — and the ledger refuses the transfer if you
   * try, so showing on-hand here would set the merchant up to be told no after typing a number.
   */
  const originAvailable = from ? (byId[from]?.available ?? 0) : 0;
  const moving = Math.max(0, Math.trunc(Number(quantity) || 0));

  /* Origin options carry their balance, so the merchant picks a place with stock in it rather than
   * discovering it is empty on submit. */
  const originOptions = locations.map((l) => {
    const held = byId[l.value];
    return {
      value: l.value,
      label: held ? `${l.label} — ${held.available} available` : l.label,
      disabled: held !== undefined && held.available <= 0
    };
  });

  const destinationOptions = locations
    .filter((l) => l.value !== from)
    .map((l) => ({
      value: l.value,
      label: byId[l.value] ? `${l.label} — holds ${byId[l.value].on_hand}` : l.label
    }));

  const submit = async () => {
    if (!target || !token || !from || !to) {
      setError('Choose where the stock is moving from and to');
      return;
    }
    if (moving <= 0) {
      setError('Enter how many units are moving');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inventory/${target.product_id}/transfer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_location_id: from,
          to_location_id: to,
          quantity: moving,
          note: note.trim() || null
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? `Could not transfer (${response.status})`);
      }

      notifications.show({
        title: 'Stock moved',
        /* The endpoint's sentence, which names both balances afterwards. */
        message: payload.data.message,
        color: 'green'
      });
      await onTransferred();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not transfer the stock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={target !== null} onClose={onClose} title="Move stock between locations" size="lg">
      {target && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {target.name} · {target.sku}
          </Text>

          <Group grow align="flex-start">
            <Select
              label="From"
              placeholder="Where it is now"
              data={originOptions}
              value={from}
              onChange={(value) => {
                setFrom(value);
                if (value === to) setTo(null);
              }}
              searchable
            />
            <Select
              label="To"
              placeholder="Where it is going"
              data={destinationOptions}
              value={to}
              onChange={setTo}
              searchable
              disabled={!from}
            />
          </Group>

          <NumberInput
            label="How many units"
            placeholder="0"
            min={1}
            max={originAvailable > 0 ? originAvailable : undefined}
            value={quantity}
            onChange={setQuantity}
            allowDecimal={false}
          />

          <Textarea
            label="Note"
            description="Optional. Why the stock is moving — a restock, a return to the warehouse, a van load."
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            rows={2}
          />

          {/* The consequence in words before it happens, matching the adjustment dialog. */}
          {from && to && moving > 0 && (
            <Alert
              variant="light"
              color={moving > originAvailable ? 'yellow' : undefined}
              icon={moving > originAvailable ? <IconAlertTriangle size={16} /> : <IconArrowRight size={16} />}
            >
              <Text size="sm">
                {moving.toLocaleString()} unit{moving === 1 ? '' : 's'} leave{' '}
                <strong>{locations.find((l) => l.value === from)?.label}</strong> (
                {(originAvailable - moving).toLocaleString()} left available) and arrive at{' '}
                <strong>{locations.find((l) => l.value === to)?.label}</strong>.
              </Text>
              {moving > originAvailable && (
                <Text size="sm" mt={4}>
                  That is more than is available there. Units already committed to an order cannot be
                  moved, so this will be refused.
                </Text>
              )}
            </Alert>
          )}

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!from || !to || moving <= 0}>
              Move stock
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

export default TransferStockModal;
