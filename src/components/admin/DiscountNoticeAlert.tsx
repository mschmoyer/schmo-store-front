'use client';

/**
 * The `/admin` dashboard's rendering of `discount-notice.ts`'s free-window ladder —
 * docs/plans/platform-coupons.md §5.1/§5.2, phase 7 of §10.
 *
 * Presentation only: every date computation and which of the five states applies comes from
 * {@link resolveDiscountNotice}, the single place `PLATFORM_DISCOUNT_GRACE_DAYS` and the warning
 * threshold are defined — duplicating either here risks two screens disagreeing about what day it
 * is. `'nothing-to-say'` renders nothing at all (§5.1: "quiet for eleven months, clear for the
 * last one") — no placeholder, no empty card. Grace is messaging only (§5.2): nothing here
 * disables a storefront, and every grace state says so.
 *
 * Only `informational` (a card is on file, so the window closing is just information) is
 * dismissible; `actionable`/`in-grace`/`grace-exhausted` (no card — this banner is the only place
 * the product ever asks for one) are not, since dismissing a real task would let it silently drop.
 * Dismissal is per-browser via `localStorage`, keyed to the exact `discountEndsAt` so a renewed or
 * extended coupon isn't mistaken for an already-dismissed one; every access is wrapped in
 * `try/catch` and fails open (keeps showing) since storage can throw (private windows, blocked
 * site data).
 *
 * Every state renders as `role="alert"` — Mantine's `Alert` hardcodes that role regardless of any
 * `role` prop, so there is no way to get the quieter `role="status"` short of not using this
 * primitive. Tests should query `role="alert"` for every state.
 */

import React, { useState } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCreditCard, IconInfoCircle, IconX } from '@tabler/icons-react';
import {
  resolveDiscountNotice,
  type RedemptionStatus,
} from '@/lib/billing/discount-notice';

/** Props for {@link DiscountNoticeAlert}. */
export interface DiscountNoticeAlertProps {
  /** When the free window closes. `null` means the discount never ends. */
  discountEndsAt: Date | null;
  /** Whether the merchant has a card on file — with one the window closing is information; without one it's a task. */
  hasPaymentMethod: boolean;
  /** The redemption's lifecycle state. Only `'redeemed'` can produce a visible notice. */
  status: RedemptionStatus;
  /** Current time; injectable for tests. @default new Date() */
  now?: Date;
  /** Opens the Stripe Billing Portal to add a card. Wired to `POST /api/billing/portal` by the caller. */
  onAddPaymentMethod: () => void | Promise<void>;
  /** Disables the action button while a portal session is being created. */
  addingPaymentMethod?: boolean;
}

/**
 * Format a date the way `/admin/billing` does, so the dashboard and billing page never quote the
 * same date two different ways.
 *
 * @param date - The date to format.
 * @returns e.g. `"August 27, 2026"`.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Build the `localStorage` key an informational notice's dismissal is recorded under.
 *
 * Keyed to the exact end date rather than a fixed string: a coupon renewed, replaced, or extended
 * to a new `discountEndsAt` is a different notice, not a re-showing of one already dismissed.
 *
 * @param discountEndsAt - The free window's end date.
 * @returns The storage key.
 */
function dismissalKey(discountEndsAt: Date): string {
  return `rs_discount_notice_dismissed:${discountEndsAt.toISOString()}`;
}

/**
 * Read whether this notice was already dismissed in this browser.
 *
 * @param key - The key from {@link dismissalKey}.
 * @returns `true` when dismissed, `false` on any read failure or when never dismissed.
 */
function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Record that this notice was dismissed in this browser.
 *
 * @param key - The key from {@link dismissalKey}.
 * @returns Nothing. A failed write is swallowed — worst case the notice reappears next visit.
 */
function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Storage unavailable — failing open (not remembered as dismissed) is safe for a courtesy notice.
  }
}

/**
 * The `/admin` alert for a platform coupon's free window, per §5.1/§5.2 of the plan.
 *
 * @param props - {@link DiscountNoticeAlertProps}
 * @returns The alert, or `null` when {@link resolveDiscountNotice} says there is nothing to show.
 */
export function DiscountNoticeAlert({
  discountEndsAt,
  hasPaymentMethod,
  status,
  now,
  onAddPaymentMethod,
  addingPaymentMethod = false,
}: DiscountNoticeAlertProps): React.ReactElement | null {
  const notice = resolveDiscountNotice(discountEndsAt, hasPaymentMethod, now ?? new Date(), status);
  const storageKey = notice.state === 'informational' ? dismissalKey(notice.discountEndsAt) : null;

  // Adjusted during render, not in an effect (react.dev/learn/you-might-not-need-an-effect):
  // `trackedKey` re-checks `localStorage` when `discountEndsAt` changes without a `useEffect`
  // that would run one render late.
  const [dismissed, setDismissed] = useState(() => storageKey !== null && readDismissed(storageKey));
  const [trackedKey, setTrackedKey] = useState(storageKey);
  if (storageKey !== trackedKey) {
    setTrackedKey(storageKey);
    setDismissed(storageKey !== null && readDismissed(storageKey));
  }

  const dismiss = (): void => {
    if (storageKey === null) return;
    writeDismissed(storageKey);
    setDismissed(true);
  };

  if (notice.state === 'nothing-to-say') {
    return null;
  }

  if (notice.state === 'informational' && dismissed) {
    return null;
  }

  const dayWord = (days: number) => (days === 1 ? 'day' : 'days');

  if (notice.state === 'informational') {
    return (
      <Alert
        icon={<IconInfoCircle size="1rem" />}
        color="ink"
        variant="light"
        title="Your free offer ends soon"
        withCloseButton
        onClose={dismiss}
        closeButtonLabel="Dismiss"
      >
        <Text size="sm">
          Your discount ends in {notice.daysRemaining} {dayWord(notice.daysRemaining)}, on{' '}
          {formatDate(notice.discountEndsAt)}. You have a payment method on file, so you don&apos;t
          need to do anything — the standard rate applies automatically from that date.
        </Text>
      </Alert>
    );
  }

  if (notice.state === 'actionable') {
    return (
      <Alert
        icon={<IconAlertTriangle size="1rem" />}
        color="orange"
        variant="light"
        title="Add a payment method before your free offer ends"
      >
        <Stack gap="sm">
          <Text size="sm">
            Your discount ends in {notice.daysRemaining} {dayWord(notice.daysRemaining)}, on{' '}
            {formatDate(notice.discountEndsAt)}. This offer didn&apos;t collect a card at signup,
            so without one on file the discount will simply end with nothing to bill against.
          </Text>
          <Group>
            <Button
              size="xs"
              leftSection={<IconCreditCard size="1rem" />}
              loading={addingPaymentMethod}
              onClick={() => void onAddPaymentMethod()}
            >
              Add a payment method
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  if (notice.state === 'in-grace') {
    return (
      <Alert
        icon={<IconAlertTriangle size="1rem" />}
        color="red"
        variant="light"
        title="Your free offer has ended"
      >
        <Stack gap="sm">
          <Text size="sm">
            Your discount ended on {formatDate(notice.discountEndsAt)}. Your storefront is still
            live — add a payment method by {formatDate(notice.graceEndsAt)} (
            {notice.daysRemainingInGrace} {dayWord(notice.daysRemainingInGrace)} left) to keep
            billing in good standing.
          </Text>
          <Group>
            <Button
              size="xs"
              leftSection={<IconCreditCard size="1rem" />}
              loading={addingPaymentMethod}
              onClick={() => void onAddPaymentMethod()}
            >
              Add a payment method
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  // notice.state === 'grace-exhausted'
  return (
    <Alert
      icon={<IconX size="1rem" />}
      color="red"
      variant="filled"
      title="Your free offer ended"
    >
      <Stack gap="sm">
        <Text size="sm">
          Your discount ended on {formatDate(notice.discountEndsAt)} and the {' '}
          {Math.round((notice.graceEndsAt.getTime() - notice.discountEndsAt.getTime()) / 86_400_000)}
          -day grace period has passed. Your storefront is still live — add a payment method
          whenever you&apos;re ready to keep using RebelShops.
        </Text>
        <Group>
          <Button
            size="xs"
            variant="white"
            color="red"
            leftSection={<IconCreditCard size="1rem" />}
            loading={addingPaymentMethod}
            onClick={() => void onAddPaymentMethod()}
          >
            Add a payment method
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
