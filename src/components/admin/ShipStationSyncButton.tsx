'use client';

/**
 * Manual "pull from ShipStation now" button for the catalogue grids.
 *
 * Two things it deliberately does:
 *
 * 1. **It is disabled until ShipStation is actually connected**, and says why.
 *    An enabled button that always fails is worse than no button — the merchant
 *    cannot tell whether the sync is broken or the integration is missing.
 * 2. **It reports what was written**, not that it "succeeded". A sync that ran
 *    and wrote nothing is a different outcome from one that imported 400 rows,
 *    and this codebase has shipped `success: true` over an empty write before.
 *
 * The scheduled sync exists too (`/api/cron/sync` enqueues, `/api/jobs/process`
 * drains), so this is for merchants who do not want to wait for the next run.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';

/** Which sync this button triggers, and where it posts. */
export interface ShipStationSyncButtonProps {
  /** Endpoint to POST. Defaults to the products sync. */
  endpoint?: string;
  /** Request body, for endpoints that take an action discriminator. */
  body?: Record<string, unknown>;
  /** Button label. */
  label?: string;
  /** Called after a sync that reported success, so the grid can refetch. */
  onSynced?: () => void;
}

/**
 * Trigger a manual ShipStation sync, gated on the integration being connected.
 *
 * @param props - See {@link ShipStationSyncButtonProps}
 * @returns The button, disabled with an explanation when not connected
 */
export function ShipStationSyncButton({
  endpoint = '/api/admin/sync/products',
  body,
  label = 'Sync from ShipStation',
  onSynced
}: ShipStationSyncButtonProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  /**
   * Read whether ShipStation has a stored, active credential.
   *
   * `null` while unknown, so the button renders disabled rather than briefly
   * offering an action that would fail.
   *
   * @returns Nothing; sets local state
   */
  const readConnection = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/integrations', { credentials: 'include' });
      if (!response.ok) {
        setConnected(false);
        return;
      }
      const payload = (await response.json()) as {
        data?: { integrations?: { integrationType: string; isActive: boolean; hasApiKey: boolean }[] };
        integrations?: { integrationType: string; isActive: boolean; hasApiKey: boolean }[];
      };
      const list = payload.data?.integrations ?? payload.integrations ?? [];
      const shipstation = list.find(entry => entry.integrationType === 'shipstation');
      setConnected(Boolean(shipstation?.isActive && shipstation?.hasApiKey));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await readConnection();
    })();
  }, [readConnection]);

  /**
   * Run the sync and report the row counts it actually wrote.
   */
  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {})
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
        synced_items?: number;
        data?: { processed?: number; created?: number; updated?: number };
      };

      const ok = response.ok && payload.success !== false;
      const counts = payload.data;
      const detail =
        typeof payload.synced_items === 'number'
          ? `${payload.synced_items} item${payload.synced_items === 1 ? '' : 's'} synced.`
          : counts && typeof counts.processed === 'number'
            ? `${counts.processed} record${counts.processed === 1 ? '' : 's'} processed.`
            : undefined;

      notifications.show({
        title: ok ? 'Sync finished' : 'Sync failed',
        message: payload.message ?? detail ?? payload.error ?? (ok ? 'ShipStation returned no changes.' : 'The sync did not complete.'),
        color: ok ? 'green' : 'red'
      });

      if (ok) {
        onSynced?.();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'We couldn’t reach the server to start the sync.',
        color: 'red'
      });
    } finally {
      setSyncing(false);
    }
  };

  const disabled = connected !== true || syncing;
  const reason =
    connected === false
      ? 'Connect ShipStation under Integrations first.'
      : connected === null
        ? 'Checking your ShipStation connection…'
        : '';

  const button = (
    <Button
      leftSection={<IconRefresh size="1rem" />}
      variant="default"
      onClick={disabled ? undefined : sync}
      /*
       * `aria-disabled`, not `disabled`, when there is a reason to convey.
       *
       * A `disabled` button is removed from the tab order entirely, so a keyboard-only or
       * screen-reader user could never reach it and the tooltip explaining why it was dead was
       * unreachable by construction — the reason existed only for people using a mouse. This keeps
       * the control focusable and carries the reason in its accessible name, while `onClick` is
       * withheld so it still does nothing.
       */
      aria-disabled={disabled || undefined}
      disabled={syncing && connected === true}
      aria-label={reason ? `${label}. ${reason}` : undefined}
      loading={syncing}
    >
      {label}
    </Button>
  );

  return reason ? (
    <Tooltip label={reason} withArrow>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
}
