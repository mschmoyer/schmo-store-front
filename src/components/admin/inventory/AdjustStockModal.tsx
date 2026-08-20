'use client';

/**
 * Changing stock, and saying why.
 *
 * The old modal asked for a quantity and an optional free-text note, and sent both an absolute
 * `stock_quantity` and an unrelated `quantity_change` computed from whatever the value had been
 * when the dialog opened — so a concurrent change made both the write and the audit entry wrong.
 * Three of the six fields it collected had no columns behind them and were dropped silently under
 * a "Successfully updated" toast.
 *
 * The reason is the point of this dialog. "Stock went from 50 to 43" is a number; "seven damaged in
 * transit" is a fact you can do something about — chase a carrier, change packaging, claim on
 * insurance. A stock system whose adjustments have no reasons cannot answer the one question it
 * exists to answer, which is where the units went.
 *
 * Two modes, matching the two things that actually happen in a warehouse: something moved (a
 * delta), or somebody counted the shelf (an absolute figure, converted to a delta server-side
 * under a lock so two overlapping counts cannot both win).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Text,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { MANUAL_REASONS, type InventoryReason } from '@/lib/inventory/reasons';

/** The row being adjusted. */
export interface AdjustTarget {
  product_id: string;
  sku: string;
  name: string;
  on_hand: number;
  available: number;
  committed: number;
  unit_cost: number | null;
}

export interface AdjustStockModalProps {
  target: AdjustTarget | null;
  onClose: () => void;
  /** Locations to choose between. A single-location store never sees the field. */
  locations: Array<{ value: string; label: string }>;
  token?: string;
  /** Called after a successful adjustment so the grid can refresh. */
  onAdjusted: () => void | Promise<void>;
}

/** Reasons that record a movement of a known size, as opposed to a count. */
const DELTA_REASONS = MANUAL_REASONS.filter((reason) => reason.value !== 'cycle_count');

/**
 * The stock adjustment dialog.
 *
 * @param props - {@link AdjustStockModalProps}
 * @returns The modal.
 */
export function AdjustStockModal({
  target,
  onClose,
  locations,
  token,
  onAdjusted
}: AdjustStockModalProps): React.ReactElement {
  const [mode, setMode] = useState<'move' | 'count'>('move');
  const [reason, setReason] = useState<InventoryReason>('damage');
  const [quantity, setQuantity] = useState<number | string>('');
  const [counted, setCounted] = useState<number | string>('');
  const [note, setNote] = useState('');
  const [locationId, setLocationId] = useState<string | null>(locations[0]?.value ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Reset when a different product is opened. Keyed on the id rather than the object, because the
   * row object is a new reference on every refetch and depending on it would wipe a half-typed
   * adjustment whenever the grid refreshed underneath. */
  useEffect(() => {
    if (!target) return;
    setMode('move');
    setReason('damage');
    setQuantity('');
    setCounted('');
    setNote('');
    setError(null);
    setLocationId(locations[0]?.value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.product_id]);

  const selectedReason = MANUAL_REASONS.find((r) => r.value === reason);
  const direction = selectedReason?.direction ?? 'either';

  /* The signed delta the server will receive, derived from the reason rather than asked for.
   * Making a merchant type "-7" for damage is an invitation to type "7" and add seven damaged
   * units to their stock. */
  const delta = useMemo(() => {
    const magnitude = Math.abs(Math.trunc(Number(quantity) || 0));
    if (magnitude === 0) return 0;
    return direction === 'out' ? -magnitude : magnitude;
  }, [direction, quantity]);

  const projected = target
    ? mode === 'count'
      ? Math.trunc(Number(counted) || 0)
      : target.on_hand + delta
    : 0;

  /* Available, not on-hand: committed units are already sold, so a positive on-hand can still be
   * an oversell. This is the number that decides whether the next order can be fulfilled. */
  const projectedAvailable = target ? projected - target.committed : 0;

  const needsNote = reason === 'shrinkage' || reason === 'write_off';

  const submit = async () => {
    if (!target || !token) return;

    if (mode === 'move' && delta === 0) {
      setError('Enter how many units moved');
      return;
    }
    if (mode === 'count' && counted === '') {
      setError('Enter the quantity you counted');
      return;
    }
    if (needsNote && !note.trim()) {
      setError(`Add a note explaining this ${reason.replace('_', ' ')}`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/inventory/${target.product_id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reason: mode === 'count' ? 'cycle_count' : reason,
          ...(mode === 'count' ? { counted: Number(counted) } : { delta }),
          location_id: locationId,
          note: note.trim() || null
        })
      });

      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? 'Could not record the adjustment');
      }

      notifications.show({
        title: payload.data.movement ? 'Stock adjusted' : 'Count matched',
        message: payload.data.message,
        /* An oversell is a warning the merchant needs to see for longer than a routine toast. */
        color: payload.data.oversold ? 'yellow' : 'green',
        autoClose: payload.data.oversold ? 12000 : 5000
      });

      await onAdjusted();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the adjustment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={target ? `Adjust stock — ${target.name}` : 'Adjust stock'}
      centered
      size="md"
    >
      {target && (
        <Stack gap="md">
          <Group gap="lg">
            <div>
              <Text size="xs" c="dimmed">
                On hand
              </Text>
              <Text fw={600}>{target.on_hand.toLocaleString()}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Committed
              </Text>
              <Text fw={600}>{target.committed.toLocaleString()}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Available
              </Text>
              <Text fw={600}>{target.available.toLocaleString()}</Text>
            </div>
            <Badge variant="light">{target.sku}</Badge>
          </Group>

          <Radio.Group value={mode} onChange={(value) => setMode(value as typeof mode)}>
            <Group>
              <Radio value="move" label="Something moved" />
              <Radio value="count" label="I counted the shelf" />
            </Group>
          </Radio.Group>

          {mode === 'move' ? (
            <>
              <Select
                label="Why"
                description={selectedReason?.description}
                data={DELTA_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                value={reason}
                onChange={(value) => setReason((value ?? 'damage') as InventoryReason)}
                allowDeselect={false}
              />
              <NumberInput
                label="How many units"
                description={
                  direction === 'out'
                    ? 'Removed from stock'
                    : direction === 'in'
                      ? 'Added to stock'
                      : 'Units affected'
                }
                min={1}
                value={quantity}
                onChange={setQuantity}
              />
            </>
          ) : (
            <NumberInput
              label="Counted quantity"
              description="Recorded as a stock count. The difference is worked out and logged for you."
              min={0}
              value={counted}
              onChange={setCounted}
            />
          )}

          {locations.length > 1 && (
            <Select
              label="Location"
              data={locations}
              value={locationId}
              onChange={setLocationId}
              allowDeselect={false}
            />
          )}

          <Textarea
            label={needsNote ? 'Note (required)' : 'Note'}
            description={
              needsNote
                ? 'What you believe happened. This is the entry an auditor reads first.'
                : 'Anything worth knowing later.'
            }
            rows={2}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />

          {/* The consequence, before it happens. The old modal showed a projected figure coloured
              red or green with no text — unreadable if you cannot see red, and silent to a screen
              reader. */}
          {(mode === 'count' ? counted !== '' : delta !== 0) && (
            <Alert
              variant="light"
              color={projectedAvailable < 0 ? 'yellow' : undefined}
              icon={projectedAvailable < 0 ? <IconAlertTriangle size={16} /> : undefined}
            >
              <Text size="sm">
                On hand becomes <strong>{projected.toLocaleString()}</strong>
                {mode === 'move' && ` (${delta > 0 ? '+' : ''}${delta})`}, leaving{' '}
                <strong>{projectedAvailable.toLocaleString()}</strong> available.
              </Text>
              {projectedAvailable < 0 && (
                <Text size="sm" mt={4}>
                  That is {Math.abs(projectedAvailable).toLocaleString()} fewer than you have already
                  sold — those orders will not be fulfillable from stock.
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
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              Record adjustment
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
