'use client';

/**
 * Refresh control for the orders list.
 *
 * What it refreshes is worth stating, because the obvious reading is wrong:
 * **orders are never imported from ShipStation.** The V2 contract has no order
 * resource, so an order exists here first — written at checkout — and reaches
 * ShipStation only as a pushed shipment. What comes back is fulfilment. So this
 * pulls shipment status and tracking onto orders the store already holds and
 * then reloads the list; it cannot discover an order that is not in the
 * database.
 *
 * Unlike {@link ShipStationSyncButton} it is never disabled on a missing
 * integration, and it does not probe for one first. Reloading the list is worth
 * doing for every merchant, the sync route already answers `not connected`
 * distinctly from `failed`, and a state read at mount is a state that can be
 * stale by the time the button is pressed.
 */

import React, { useState } from 'react';
import { Button, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';

export interface OrdersRefreshButtonProps {
  /** False while the admin shell is still resolving the session; the button stays disabled. */
  signedIn: boolean;
  /** Reload the list. Awaited, so the button stays busy until the rows land. */
  onRefresh: () => Promise<void>;
}

/** What `/api/admin/sync/shipments` answers with. */
interface SyncResponse {
  success?: boolean;
  code?: string;
  error?: string;
  data?: { totalCount?: number; updatedCount?: number };
}

/** The outcome of the ShipStation leg, as the merchant needs it reported. */
type ShipmentPull =
  | { outcome: 'synced'; updated: number }
  | { outcome: 'not-connected' }
  | { outcome: 'failed'; error: string };

/**
 * Pull shipments back from ShipStation for the caller's store.
 *
 * @returns What happened, distinguishing a store with no integration from a
 *   sync that ran and failed.
 */
async function pullShipments(): Promise<ShipmentPull> {
  const response = await fetch('/api/admin/sync/shipments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const payload = (await response.json().catch(() => null)) as SyncResponse | null;

  if (payload?.code === 'SHIPSTATION_NOT_CONNECTED') {
    return { outcome: 'not-connected' };
  }

  if (!response.ok || payload?.success !== true) {
    return {
      outcome: 'failed',
      error: payload?.error || `ShipStation sync failed (${response.status})`,
    };
  }

  // The count of orders written, not of shipments read: "12 shipments seen, 0
  // orders changed" is the answer to a different question than the one the
  // merchant asked, and reporting the larger number would overstate the work.
  return { outcome: 'synced', updated: payload.data?.updatedCount ?? 0 };
}

/**
 * Reload the orders list, pulling fulfilment back from ShipStation first.
 *
 * @param props - See {@link OrdersRefreshButtonProps}.
 * @returns The refresh button.
 */
export function OrdersRefreshButton({
  signedIn,
  onRefresh,
}: OrdersRefreshButtonProps): React.ReactElement {
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Run the refresh and report what it actually changed.
   *
   * The list reload happens whatever the ShipStation leg did: a failed sync is
   * a reason to show an error, not a reason to leave the merchant looking at
   * rows that are now out of date.
   */
  const refresh = async () => {
    setRefreshing(true);

    try {
      const shipments = signedIn ? await pullShipments() : null;

      await onRefresh();

      if (shipments?.outcome === 'failed') {
        notifications.show({
          title: 'Orders reloaded, ShipStation did not answer',
          message: shipments.error,
          color: 'red',
        });
        return;
      }

      notifications.show({
        title: 'Orders refreshed',
        message:
          shipments?.outcome === 'synced'
            ? shipments.updated > 0
              ? `${shipments.updated} order${shipments.updated === 1 ? '' : 's'} updated from ShipStation.`
              : 'No new shipment updates from ShipStation.'
            : 'Connect ShipStation under Integrations to pull tracking and shipment status in too.',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Refresh failed',
        message: error instanceof Error ? error.message : 'The orders could not be reloaded.',
        color: 'red',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Tooltip
      label="Pulls shipment status and tracking from ShipStation, then reloads the list. Orders are created here at checkout, never imported."
      withArrow
      multiline
      w={300}
      position="bottom-end"
    >
      <Button
        leftSection={<IconRefresh size="1rem" />}
        variant="default"
        onClick={() => void refresh()}
        loading={refreshing}
        disabled={!signedIn}
      >
        Refresh
      </Button>
    </Tooltip>
  );
}
