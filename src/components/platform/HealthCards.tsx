'use client';

import React from 'react';
import {
  IconCircleCheck,
  IconClockPause,
  IconPlugConnectedX,
  IconXboxX,
  type IconProps,
} from '@tabler/icons-react';
import { Tooltip } from '@/components/ui';
import { describeAge } from './DataFreshness';
import type { PlatformHealth, PlatformHealthState, PlatformHealthStore } from './types';
import styles from './PlatformPanels.module.css';

export interface HealthCardsProps {
  /** The `/api/platform/health` payload. */
  health: PlatformHealth;
}

const MARK = { size: 18, stroke: 1.8 } as const;

/**
 * How many stores one card's tooltip names before it counts the rest.
 *
 * A tooltip is not a table. Six rows is about what fits without the thing becoming a panel that
 * happens to be floating, and the merchant list is one click away for the full set.
 */
const NAMED_IN_TOOLTIP = 6;

/** Longest slice of a sync error that reaches a tooltip row. */
const ERROR_SLICE = 90;

interface HealthCardSpec {
  /** The key in `health.counts`. */
  countKey: keyof PlatformHealth['counts'];
  /** The matching value of `PlatformHealthStore.state`. */
  state: PlatformHealthState;
  label: string;
  icon: React.ComponentType<IconProps>;
  tone: 'danger' | 'warning' | 'neutral' | 'good';
  /** The one line under the figure. What the state *is*, never a restatement of the label. */
  meta: string;
  /** What the state means, opening the tooltip. A sentence, because it is read as one. */
  meaning: string;
  /** What the tooltip says when the count is zero. Never an empty tooltip. */
  clear: string;
}

/** The four states, in the order an operator triages them: worst first. */
const CARDS: readonly HealthCardSpec[] = [
  {
    countKey: 'failing',
    state: 'failing',
    label: 'Failing',
    icon: IconXboxX,
    tone: 'danger',
    meta: 'Last sync returned an error',
    meaning:
      'The last ShipStation sync failed or the integration is reporting an error. These stores are not receiving catalogue or order updates.',
    clear: 'No store is reporting a ShipStation error.',
  },
  {
    countKey: 'stale',
    state: 'stale',
    label: 'Stale',
    icon: IconClockPause,
    tone: 'warning',
    meta: 'Connected, but behind',
    meaning:
      'Connected and not erroring, but the last successful sync is older than the freshness window — or there has never been one.',
    clear: 'Every connected store has synced inside the freshness window.',
  },
  {
    countKey: 'notConnected',
    state: 'not_connected',
    label: 'Not connected',
    icon: IconPlugConnectedX,
    tone: 'neutral',
    meta: 'No ShipStation credentials',
    meaning:
      'No active ShipStation integration holding a key. Nothing is failing here — nothing has been set up.',
    clear: 'Every store has a ShipStation integration.',
  },
  {
    countKey: 'healthy',
    state: 'healthy',
    label: 'Healthy',
    icon: IconCircleCheck,
    tone: 'good',
    meta: 'Synced and current',
    meaning: 'Connected, not erroring, and synced inside the freshness window.',
    clear: 'No store is currently syncing cleanly.',
  },
] as const;

/**
 * Trims a sync error to something a tooltip row can hold.
 *
 * @param message - The error the API reported, already capped at 300 characters server-side.
 * @returns The message, shortened with an ellipsis when it is longer than {@link ERROR_SLICE}.
 */
function shorten(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > ERROR_SLICE ? `${clean.slice(0, ERROR_SLICE - 1)}…` : clean;
}

/**
 * Ends a fragment with a single full stop.
 *
 * The screen-reader line is built from store names and sync errors, and a sync error usually ends
 * in a full stop of its own. Appending one unconditionally produced "Reconnect the integration..",
 * which a screen reader does read out as a pause and a half.
 *
 * @param text - The fragment.
 * @returns The fragment, terminated once.
 */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/**
 * Says how long ago a store last synced, in the console's phrasing.
 *
 * @param lastSyncAt - The ISO instant of the last successful sync, or `null` when there has not
 *   been one. `null` is rendered as "never synced" rather than as an age of zero: a store that has
 *   never synced is not a store that synced a moment ago.
 * @returns e.g. `synced 4 hours ago`, or `never synced`.
 */
function describeSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return 'never synced';
  const at = Date.parse(lastSyncAt);
  if (Number.isNaN(at)) return 'last sync time not readable';
  return `synced ${describeAge(Date.now() - at)}`;
}

/**
 * The line one store gets inside a tooltip.
 *
 * Each state is described by the fact that put the store in it — the error for a failing store,
 * the age for every other kind — so a reader never has to guess why a name is on a list.
 *
 * @param store - The store row from `/api/platform/health`.
 * @returns The row text, without the store's name.
 */
function describeStore(store: PlatformHealthStore): string {
  if (store.state === 'failing') {
    if (store.errorMessage) return shorten(store.errorMessage);
    return store.syncStatus ? `sync status: ${store.syncStatus}` : 'reporting an error';
  }
  if (store.state === 'not_connected') return 'no ShipStation integration';
  return describeSync(store.lastSyncAt);
}

/**
 * Fleet health across every store, as four cards.
 *
 * ## Four numbers, worst first
 *
 * A row that leads with "112 healthy" buries the two that are failing, so the cards are ordered the
 * way an operator triages: failing, stale, not connected, healthy. Each carries an icon, a word and
 * a number; the tint is the third cue, never the only one — §7 forbids colour as the sole signal,
 * and a fleet-status row is precisely where that matters.
 *
 * ## What is in the tooltip, and what is never in one
 *
 * The tooltip names the stores behind the number, because "3 failing" is a workload and *which
 * three* is the next question. It is supplementary by design: the count, the state and what the
 * state means are all on the card itself, and the same rows are readable in full on the merchant
 * list. Nothing an operator must have is hidden behind a hover — the design system's rule, and the
 * reason the per-store detail is also carried in text for screen readers rather than only in the
 * floating layer.
 *
 * ## What is not here
 *
 * The alerts, and the stuck-order exposure. Those are a worklist rather than a reading, and they
 * live in the console's "Needs an operator" section with their per-store drill-through. This block
 * answers "what shape is the fleet in"; that one answers "what do I do about it".
 *
 * The four counts describe **ShipStation** sync state, which is not the same population as the
 * merchant list's "Unconnected" filter (no integration of any kind). They are deliberately not
 * linked to it: a drill-through whose destination is a different set than the number it came from
 * is worse than none. The readiness panel owns that door, where the counts and the filter agree.
 *
 * @param props - {@link HealthCardsProps}
 * @returns The four state cards.
 */
export function HealthCards({ health }: HealthCardsProps): React.ReactElement {
  const totalStores =
    health.counts.failing + health.counts.stale + health.counts.notConnected + health.counts.healthy;

  return (
    <ul className={styles.healthCards}>
      {CARDS.map((card) => {
        const Mark = card.icon;
        const count = health.counts[card.countKey];
        const stores = health.stores.filter((store) => store.state === card.state);
        const named = stores.slice(0, NAMED_IN_TOOLTIP);
        const rest = stores.length - named.length;

        const lead =
          count === 0
            ? card.clear
            : `${count.toLocaleString('en-US')} of ${totalStores.toLocaleString('en-US')} store${
                totalStores === 1 ? '' : 's'
              }. ${card.meaning}`;

        const detail = (
          <div className={styles.healthTip}>
            <p className={styles.healthTipLead}>{lead}</p>
            {named.length > 0 ? (
              <ul className={styles.healthTipList}>
                {named.map((store) => (
                  <li key={store.storeId}>
                    <span className={styles.healthTipName}>{store.storeName}</span>
                    <span className={styles.healthTipFact}>{describeStore(store)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {rest > 0 ? (
              <p className={styles.healthTipMore}>
                and {rest.toLocaleString('en-US')} more store{rest === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        );

        return (
          <Tooltip
            key={card.countKey}
            label={detail}
            multiline
            w={300}
            position="bottom"
            /* Focus and touch as well as hover: a tooltip only reachable with a mouse is a tooltip
               half the console cannot open. */
            events={{ hover: true, focus: true, touch: true }}
          >
            <li className={styles.healthCard} data-tone={card.tone} tabIndex={0}>
              <div className={styles.healthCardHead}>
                <span className={styles.healthCardLabel}>{card.label}</span>
                <span className={styles.healthCardMark} aria-hidden="true">
                  <Mark {...MARK} />
                </span>
              </div>
              <span className={styles.healthCardValue}>{count.toLocaleString('en-US')}</span>
              <p className={styles.healthCardMeta}>{card.meta}</p>
              {/*
                The tooltip's contents, in text. Mantine mounts the floating layer only while it is
                open, so an `aria-describedby` on the card points at nothing until someone hovers
                it — which is exactly the reader who will never hover.
              */}
              <span className={styles.srOnly}>
                {lead}
                {named.length > 0
                  ? ` ${named.map((store) => sentence(`${store.storeName}: ${describeStore(store)}`)).join(' ')}`
                  : ''}
                {rest > 0 ? ` And ${rest} more.` : ''}
              </span>
            </li>
          </Tooltip>
        );
      })}
    </ul>
  );
}
