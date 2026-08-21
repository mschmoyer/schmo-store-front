'use client';

/**
 * The small status pills that appear beside a merchant everywhere in the console.
 *
 * They are one component rather than inline markup in three places because the
 * encoding has to be identical on the list, on the detail header and in the
 * integrations panel — an operator who learns that a hollow pill means "not
 * connected" on one screen must not meet a different convention on the next.
 *
 * Colour is never the only signal (§7): every state carries a dot *and* a word,
 * and `--signal` is spent only where the design system allows it — a
 * successfully connected, successfully syncing integration is the "sync
 * success" case, not decoration.
 *
 * That claim used to be false for the pill that most needed it. {@link IntegrationBadge}
 * rendered the literal text "ShipStation" for connected, failing *and* not
 * connected, and distinguished the three by tone alone — mint, rose, neutral.
 * The state was carried by colour and by nothing else, in the column an
 * operator triages from. A screen reader read the whole cell as
 * "ShipStation: | ShipStation | Stripe: | Stripe": the visually-hidden prefix
 * repeated the label instead of naming the state, so it added a word and no
 * information. The state is now in the words — "ShipStation connected",
 * "ShipStation failing", "ShipStation not connected" — and the tone is the
 * third cue rather than the only one.
 */

import React from 'react';
import { Badge } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { humanizeStatus } from './format';
import styles from './customersTable.module.css';

export interface StoreStateBadgeProps {
  /** Whether the store record is enabled at all. */
  isActive: boolean;
  /** Whether the storefront is reachable by the public. */
  isPublic: boolean;
  /** @default 'sm' */
  size?: 'sm' | 'md';
}

/**
 * One badge that says what state the storefront is in.
 *
 * Three states are collapsed into a single pill on purpose. Rendering "Active"
 * and "Published" as two independent badges makes the interesting case — live
 * but hidden from the public — read as two green ticks with a missing third,
 * which is exactly the row an operator needs to notice.
 *
 * @param props - {@link StoreStateBadgeProps}
 * @returns The storefront's state as a single pill.
 */
export function StoreStateBadge({
  isActive,
  isPublic,
  size = 'sm',
}: StoreStateBadgeProps): React.ReactElement {
  if (!isActive) {
    return (
      <Badge tone="rose" size={size} dot>
        Inactive
      </Badge>
    );
  }

  if (!isPublic) {
    return (
      <Badge tone="amber" size={size} dot>
        Unlisted
      </Badge>
    );
  }

  return (
    <Badge tone="mint" size={size} dot>
      Live
    </Badge>
  );
}

export interface IntegrationBadgeProps {
  /** What the pill names, e.g. `ShipStation`. */
  label: string;
  /** Whether credentials are on file and usable. */
  connected: boolean;
  /**
   * The integration's own health, when it has one. A ShipStation account that
   * is connected but whose last sync failed is not the same fact as connected,
   * and the pill has to say so.
   */
  status?: string | null;
  /** @default 'sm' */
  size?: 'sm' | 'md';
}

/** Sync states that mean the integration is connected but not working. */
const FAILING_STATUSES = new Set(['failed', 'error', 'failing', 'disconnected']);

/**
 * One integration's connection state, stated in words.
 *
 * The state word is part of the visible label rather than a hidden annotation:
 * a sighted operator scanning the column and a screen-reader user hearing it
 * read out get the same three facts in the same three words. There is no
 * `srOnly` text, because there is nothing left for it to say that the label
 * does not already say — and a hidden string that merely repeats the visible
 * one is noise charged entirely to the people who cannot skip it.
 *
 * @param props - {@link IntegrationBadgeProps}
 * @returns A pill reading "<name> connected", "<name> failing" or
 *   "<name> not connected".
 */
export function IntegrationBadge({
  label,
  connected,
  status = null,
  size = 'sm',
}: IntegrationBadgeProps): React.ReactElement {
  if (!connected) {
    return (
      <Badge tone="neutral" size={size} className={styles.mutedBadge} dot>
        {label} not connected
      </Badge>
    );
  }

  const failing = status !== null && FAILING_STATUSES.has(status.toLowerCase());
  const tone: BadgeTone = failing ? 'rose' : 'mint';

  return (
    <Badge tone={tone} size={size} dot title={status ? humanizeStatus(status) : undefined}>
      {label} {failing ? 'failing' : 'connected'}
    </Badge>
  );
}

export interface CustomizationBadgeProps {
  /** Whether the merchant has moved off the default theme. */
  customized: boolean;
  /** The theme's own status, e.g. `published` or `draft`. */
  themeStatus?: string | null;
  /** @default 'sm' */
  size?: 'sm' | 'md';
}

/**
 * Whether the merchant has made the storefront their own.
 *
 * @param props - {@link CustomizationBadgeProps}
 * @returns A pill reading the theme state.
 */
export function CustomizationBadge({
  customized,
  themeStatus = null,
  size = 'sm',
}: CustomizationBadgeProps): React.ReactElement {
  if (!customized) {
    return (
      <Badge tone="neutral" size={size} className={styles.mutedBadge}>
        Default theme
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" size={size} square>
      {themeStatus ? humanizeStatus(themeStatus) : 'Customised'}
    </Badge>
  );
}
