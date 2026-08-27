'use client';

/**
 * The `/admin` dashboard's rendering of `discount-notice.ts`'s free-window ladder —
 * `docs/plans/platform-coupons.md` §5.1/§5.2, phase 7 of §10.
 *
 * This component owns **presentation only**. Every date computation — the warning threshold, the
 * grace window, which of the five states applies — comes from
 * {@link resolveDiscountNotice} in `src/lib/billing/discount-notice.ts`. That module is the single
 * place `PLATFORM_DISCOUNT_GRACE_DAYS` and the 30-day warning threshold are defined; duplicating
 * either constant here is exactly the "two screens quietly disagree about what day it is" bug that
 * module's header warns against.
 *
 * §5.1's rule: "quiet for eleven months, clear for the last one." `resolveDiscountNotice` returns
 * `'nothing-to-say'` for everything outside the last 30 days, and this component renders nothing at
 * all for that state — no placeholder, no empty card.
 *
 * §5.2 is explicit that grace here is **messaging only**: nothing this component renders disables a
 * storefront, and every grace-adjacent state says so ("your storefront keeps running").
 *
 * Dismissal (§5.1: "informational alerts can be dismissed … a courtesy notice does not deserve a
 * table") is per-browser, via `localStorage`, and keyed to the exact `discountEndsAt` instant so a
 * merchant who dismisses this cycle's notice does not accidentally suppress a future one. Every
 * `localStorage` access is wrapped in `try/catch` — it throws in some browser contexts (private
 * windows, blocked site data) and a courtesy notice failing open (always showing) is the safe
 * failure direction.
 *
 * Every state renders as `role="alert"` — Mantine's `Alert` hardcodes that role on its root
 * element unconditionally (it assigns `role: "alert"` after spreading the rest of its props, so a
 * `role` passed in is silently discarded), so there is no way to render the informational state as
 * the quieter `role="status"` short of not using this primitive. Tests and callers should query
 * `role="alert"` for every state this component renders.
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
  /** Whether the merchant has a card on file — sets the weight of every §5.1 row. */
  hasPaymentMethod: boolean;
  /** The redemption's lifecycle state. Only `'redeemed'` can produce a visible notice. */
  status: RedemptionStatus;
  /** Current time; injectable for tests. @default new Date() */
  now?: Date;
  /**
   * Opens the Stripe Billing Portal so the merchant can add a card — the only place in the product
   * that asks for one (§5.1). Wired to `POST /api/billing/portal` by the caller.
   */
  onAddPaymentMethod: () => void | Promise<void>;
  /** Disables the action button while a portal session is being created. */
  addingPaymentMethod?: boolean;
}

/**
 * Format a date the way `/admin/billing` does (`src/app/admin/billing/page.tsx`'s `formatDate`),
 * so the dashboard and the billing page never quote the same date two different ways.
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
    // Storage unavailable (private window, blocked site data). Failing open — the notice simply
    // is not remembered as dismissed — is the safe direction for a courtesy notice.
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

  // Adjusted during render rather than in an effect (React's "adjusting state when a prop
  // changes" pattern — https://react.dev/learn/you-might-not-need-an-effect): `trackedKey` lets a
  // change in *which* notice this is (a new `discountEndsAt`) re-check `localStorage` for that
  // notice's own dismissal, without a `useEffect` that would run one render late.
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
