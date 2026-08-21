'use client';

/**
 * What this merchant has connected, and whether it is working.
 *
 * Three sub-blocks rather than one list, because "connected" means something
 * different in each: ShipStation is connected when credentials decrypt and a
 * sync succeeds, Stripe is connected when the Connect account can actually take
 * a charge, and a subscription is a billing state with no connection at all.
 * Flattening them into one column of ticks loses the distinction that decides
 * what an operator does next.
 *
 * **No credential is rendered here, and none should reach this component.** The
 * platform API sends facts about credentials — connected, enabled, submitted —
 * never a key, a secret, or a fragment of one. A payload carrying an API key is
 * a defect in the route handler and must be fixed there.
 */

import React from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Panel, DataList } from './Panel';
import { IntegrationBadge } from './StoreBadges';
import { RelativeDate } from './RelativeDate';
import { centsToPrice, formatDate, humanizeStatus, NOT_SET } from './format';
import { Price } from '@/components/ui';
import type { PlatformIntegrations } from './types';
import styles from './integrationsPanel.module.css';

export interface IntegrationsPanelProps {
  /** The store's integration and billing state. */
  integrations: PlatformIntegrations;
}

/**
 * Renders a yes/no fact as a word rather than as a bare tick.
 *
 * @param value - The boolean being reported.
 * @param yes - Label for true. @default 'Yes'
 * @param no - Label for false. @default 'No'
 * @returns The label.
 */
function yesNo(value: boolean, yes = 'Yes', no = 'No'): string {
  return value ? yes : no;
}

/**
 * Renders the integrations panel.
 *
 * @param props - {@link IntegrationsPanelProps}
 * @returns The integrations panel.
 */
export function IntegrationsPanel({ integrations }: IntegrationsPanelProps): React.ReactElement {
  const { shipstation, stripe, subscription } = integrations;

  return (
    <Panel
      title="Integrations"
      description="Connection state only. Credentials are never sent to the console."
    >
      <div className={styles.group}>
        <div className={styles.groupHead}>
          <h3 className={styles.groupTitle}>ShipStation</h3>
          <IntegrationBadge
            label={shipstation.connected ? 'Connected' : 'Not connected'}
            connected={shipstation.connected}
            status={shipstation.syncStatus}
          />
        </div>

        <DataList
          items={[
            { label: 'Sync status', value: humanizeStatus(shipstation.syncStatus, 'Never synced') },
            {
              label: 'Last sync',
              value: <RelativeDate value={shipstation.lastSyncAt} fallback="Never" />,
            },
            { label: 'Webhook registered', value: yesNo(shipstation.webhookRegistered) },
            { label: 'Auto sync', value: yesNo(shipstation.autoSyncEnabled, 'On', 'Off') },
          ]}
        />

        {shipstation.errorMessage ? (
          <p className={styles.error}>
            <IconAlertTriangle size={15} aria-hidden="true" />
            <span>{shipstation.errorMessage}</span>
          </p>
        ) : null}
      </div>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <h3 className={styles.groupTitle}>Stripe</h3>
          <IntegrationBadge
            label={stripe.connected ? 'Connected' : 'Not connected'}
            connected={stripe.connected}
          />
        </div>

        <DataList
          items={[
            {
              label: 'Onboarding',
              value: humanizeStatus(stripe.onboardingStatus, 'Not started'),
            },
            { label: 'Charges enabled', value: yesNo(stripe.chargesEnabled) },
            { label: 'Payouts enabled', value: yesNo(stripe.payoutsEnabled) },
            { label: 'Details submitted', value: yesNo(stripe.detailsSubmitted) },
          ]}
        />
      </div>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <h3 className={styles.groupTitle}>Subscription</h3>
        </div>

        <DataList
          items={[
            { label: 'Plan', value: humanizeStatus(subscription.plan, 'No plan') },
            { label: 'Status', value: humanizeStatus(subscription.status, NOT_SET) },
            {
              label: 'Renews',
              value: subscription.currentPeriodEnd
                ? formatDate(subscription.currentPeriodEnd)
                : NOT_SET,
              hint: subscription.currentPeriodEnd ? (
                <RelativeDate value={subscription.currentPeriodEnd} />
              ) : undefined,
            },
            {
              label: 'Amount',
              value:
                subscription.unitAmountCents === null ? (
                  NOT_SET
                ) : (
                  <Price value={centsToPrice(subscription.unitAmountCents)} size="sm" />
                ),
            },
          ]}
        />
      </div>
    </Panel>
  );
}
