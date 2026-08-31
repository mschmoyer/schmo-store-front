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

/** Reasons a merchant holds stock back, matching the endpoint's vocabulary. */
const HOLD_REASONS = [
  { value: 'quarantine', label: 'Quarantine — awaiting inspection' },
  { value: 'damage', label: 'Damaged — not fit to sell' },
  { value: 'expiry', label: 'Expired or out of date' },
  { value: 'sample', label: 'Set aside as a sample' }
];

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
  /**
   * The location the grid is filtered to, when it is filtered to one.
   *
   * The dialog used to default to `locations[0]`, the store's default location, whatever the
   * merchant was looking at — so counting a shelf while filtered to the back room posted the
   * adjustment against the shop floor. Opening on the location whose numbers are on screen is the
   * only defensible default.
   */
  activeLocationId?: string | null;
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
  activeLocationId,
  onAdjusted
}: AdjustStockModalProps): React.ReactElement {
  const [mode, setMode] = useState<'move' | 'count' | 'hold'>('move');
  /* Holding and releasing share a mode, because they are the same decision seen from either end. */
  const [holdReason, setHoldReason] = useState<string>('quarantine');
  const [releasing, setReleasing] = useState(false);
  /*
   * No default reason.
   *
   * It defaulted to `damage`, so opening the dialog, typing a number and pressing the button wrote
   * stock off as damaged — a reason with real consequences for valuation and supplier claims,
   * chosen by nobody. The reason is the point of this dialog; making the merchant pick one costs a
   * click and is the whole difference between a number and a fact.
   */
  const [reason, setReason] = useState<InventoryReason | null>(null);
  const [quantity, setQuantity] = useState<number | string>('');
  const [counted, setCounted] = useState<number | string>('');
  const [note, setNote] = useState('');
  const [locationId, setLocationId] = useState<string | null>(
    activeLocationId ?? locations[0]?.value ?? null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Per-location balances for this product, when the store keeps stock in more than one place.
   *
   * The row the grid passes in carries the cross-location roll-up. Projecting a single-location
   * movement against the roll-up showed the merchant a number that was not the one being changed,
   * and in count mode was worse than cosmetic: `recountTo` computes its delta against the selected
   * location's balance, so a count of 12 entered against a roll-up of 40 posted a delta of −28
   * where the merchant meant to set one shelf to 12.
   */
  const [byLocation, setByLocation] = useState<Record<string, { on_hand: number; committed: number }>>(
    {}
  );

  /* Reset when a different product is opened. Keyed on the id rather than the object, because the
   * row object is a new reference on every refetch and depending on it would wipe a half-typed
   * adjustment whenever the grid refreshed underneath. */
  useEffect(() => {
    if (!target) return;
    setMode('move');
    setReason(null);
    setHoldReason('quarantine');
    setReleasing(false);
    setQuantity('');
    setCounted('');
    setNote('');
    setError(null);
    setLocationId(activeLocationId ?? locations[0]?.value ?? null);
    setByLocation({});

    /* Only fetched when it can matter. A single-location store's roll-up *is* its location
     * balance, and a request per dialog open would be pure waste. */
    if (locations.length > 1) {
      fetch(`/api/admin/inventory/${target.product_id}`, { credentials: 'include' })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          const rows = payload?.data?.locations ?? [];
          const next: Record<string, { on_hand: number; committed: number }> = {};
          for (const row of rows) {
            next[row.location_id] = {
              on_hand: Number(row.on_hand) || 0,
              committed: Number(row.committed) || 0
            };
          }
          setByLocation(next);
        })
        .catch(() => {
          /* Left empty, so the projection falls back to the roll-up and the copy below says which
           * it is showing. Failing to load a breakdown must not stop a merchant recording damage. */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.product_id]);

  /* The balance the adjustment will actually change: this location's, when we know it. */
  const scoped = locationId ? byLocation[locationId] : undefined;
  const baseOnHand = scoped?.on_hand ?? target?.on_hand ?? 0;
  const baseCommitted = scoped?.committed ?? target?.committed ?? 0;
  const scopeKnown = locations.length <= 1 || scoped !== undefined;
  const locationLabel = locations.find((l) => l.value === locationId)?.label ?? null;

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
      : baseOnHand + delta
    : 0;

  /* Available, not on-hand: committed units are already sold, so a positive on-hand can still be
   * an oversell. This is the number that decides whether the next order can be fulfilled. */
  const projectedAvailable = target ? projected - baseCommitted : 0;

  const needsNote =
    (mode !== 'hold' && (reason === 'shrinkage' || reason === 'write_off')) ||
    /* A quarantine with no note is a number nobody can act on later — somebody eventually has to
     * decide what happens to these units, and the note is what tells them what they are. */
    (mode === 'hold' && !releasing && holdReason === 'quarantine');

  const submit = async () => {
    if (!target) return;

    if (mode === 'move' && !reason) {
      setError('Choose what happened to these units');
      return;
    }
    if (mode === 'move' && delta === 0) {
      setError('Enter how many units moved');
      return;
    }
    if (mode === 'count' && counted === '') {
      setError('Enter the quantity you counted');
      return;
    }
    if (mode === 'hold' && Math.trunc(Number(quantity) || 0) <= 0) {
      setError('Enter how many units');
      return;
    }
    if (mode === 'hold' && !releasing && holdReason === 'quarantine' && !note.trim()) {
      setError('Say what these units are waiting on');
      return;
    }
    if (needsNote && !note.trim()) {
      setError(`Add a note explaining this ${(reason ?? 'adjustment').replace('_', ' ')}`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      /* A hold is not a stock movement — nothing left the building — so it goes to its own
       * endpoint rather than through the ledger. See migration 038. */
      const endpoint =
        mode === 'hold'
          ? `/api/admin/inventory/${target.product_id}/hold`
          : `/api/admin/inventory/${target.product_id}/adjust`;

      const body =
        mode === 'hold'
          ? {
              quantity: Math.trunc(Number(quantity) || 0),
              release: releasing,
              reason: holdReason,
              location_id: locationId,
              note: note.trim() || null
            }
          : {
              reason: mode === 'count' ? 'cycle_count' : reason,
              ...(mode === 'count' ? { counted: Number(counted) } : { delta }),
              location_id: locationId,
              note: note.trim() || null
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? 'Could not record the adjustment');
      }

      notifications.show({
        title:
          mode === 'hold'
            ? releasing
              ? 'Returned to sale'
              : 'Held back'
            : payload.data.movement
              ? 'Stock adjusted'
              : 'Count matched',
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
              {/* The third thing that actually happens, and the one the schema advertised and could
                  not do: units are still there and cannot be sold. */}
              <Radio value="hold" label="Hold stock back" />
            </Group>
          </Radio.Group>

          {mode === 'move' ? (
            <>
              <Select
                label="Why"
                description={selectedReason?.description}
                data={DELTA_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                placeholder="Choose what happened"
                value={reason}
                onChange={(value) => setReason((value || null) as InventoryReason | null)}
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
          ) : mode === 'count' ? (
            <NumberInput
              label="Counted quantity"
              description="Recorded as a stock count. The difference is worked out and logged for you."
              min={0}
              value={counted}
              onChange={setCounted}
            />
          ) : (
            <>
              <Radio.Group
                value={releasing ? 'release' : 'hold'}
                onChange={(value) => setReleasing(value === 'release')}
                label="What is happening"
              >
                <Group mt={4}>
                  <Radio value="hold" label="Hold back from sale" />
                  <Radio value="release" label="Return to sale" />
                </Group>
              </Radio.Group>

              {!releasing && (
                <Select
                  label="Why"
                  description="The units stay on the shelf. Only how many you can sell changes."
                  data={HOLD_REASONS}
                  value={holdReason}
                  onChange={(value) => setHoldReason(value ?? 'quarantine')}
                  allowDeselect={false}
                />
              )}

              <NumberInput
                label="How many units"
                description={
                  releasing ? 'Returned to sellable stock' : 'Kept on the shelf but not sellable'
                }
                min={1}
                value={quantity}
                onChange={setQuantity}
              />
            </>
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
          {mode === 'hold' && Math.trunc(Number(quantity) || 0) > 0 && (
            <Alert variant="light">
              <Text size="sm">
                {/* The distinction the whole feature exists for, said plainly: the units do not
                    move, only whether they can be sold. */}
                {Math.trunc(Number(quantity) || 0).toLocaleString()} unit
                {Math.trunc(Number(quantity) || 0) === 1 ? '' : 's'}{' '}
                {releasing ? 'become sellable again' : 'stay on the shelf but stop being sellable'}.
                On hand is unchanged at <strong>{baseOnHand.toLocaleString()}</strong>.
              </Text>
            </Alert>
          )}

          {mode !== 'hold' && (mode === 'count' ? counted !== '' : delta !== 0) && (
            <Alert
              variant="light"
              color={projectedAvailable < 0 ? 'yellow' : undefined}
              icon={projectedAvailable < 0 ? <IconAlertTriangle size={16} /> : undefined}
            >
              <Text size="sm">
                {/* Named, when there is more than one place it could be. "On hand becomes 12" is
                    ambiguous in a store with a shop and a stockroom, and the ambiguity is exactly
                    where a mis-posted count comes from. */}
                On hand{locations.length > 1 && locationLabel ? ` at ${locationLabel}` : ''} becomes{' '}
                <strong>{projected.toLocaleString()}</strong>
                {mode === 'move' && ` (${delta > 0 ? '+' : ''}${delta})`}, leaving{' '}
                <strong>{projectedAvailable.toLocaleString()}</strong> available.
              </Text>
              {!scopeKnown && (
                /* Said rather than hidden: without the breakdown these figures are the store-wide
                 * roll-up, and a merchant reading them as one location's would be wrong. */
                <Text size="xs" c="dimmed" mt={4}>
                  Showing the total across all locations — this product&apos;s per-location balances
                  could not be loaded.
                </Text>
              )}
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
