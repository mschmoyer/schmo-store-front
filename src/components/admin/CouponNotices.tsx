'use client';

/**
 * Mounts whichever platform-coupon banner applies to the signed-in merchant, or nothing.
 *
 * docs/plans/platform-coupons.md §5.1/§5.2, phase 7 of §10. Renders exactly one of
 * {@link CouponReservationBanner} or {@link DiscountNoticeAlert} — never both, since a merchant
 * holds at most one live claim (`idx_pcr_one_live_per_user`), either `attributed` or `redeemed`.
 *
 * A fetch failure is deliberately not silent (staff review finding 11, invariant 14): for a
 * no-card coupon this banner is the merchant's only route to a payment method, so vanishing on a
 * failed fetch would defeat that invariant as completely as never building the banner. A failed
 * fetch renders a small, dismissal-free retry notice instead — quieter than the dashboard's own
 * error banner (`fetchDashboardData` in `src/app/admin/page.tsx`), but never invisible.
 */

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { CouponReservationBanner } from './CouponReservationBanner';
import { DiscountNoticeAlert } from './DiscountNoticeAlert';
import type { RedemptionStatus } from '@/lib/billing/discount-notice';

/** The shape `GET /api/billing/coupon/notice` sends — mirrors `CouponNoticeData` in that route. */
type CouponNotice =
  | { kind: 'none' }
  | { kind: 'reservation'; code: string; name: string; attributedAt: string }
  | { kind: 'discount'; discountEndsAt: string | null; hasPaymentMethod: boolean };

/**
 * Read the admin bearer token, the same way `src/app/admin/page.tsx` and
 * `src/app/admin/billing/page.tsx` do.
 *
 * @returns The token, or `null` when signed out or storage is unavailable.
 */
function readToken(): string | null {
  try {
    return window.localStorage.getItem('admin_token');
  } catch {
    return null;
  }
}

/**
 * The platform-coupon notices for `/admin` — a reservation banner, a discount-window alert, or
 * nothing.
 *
 * @returns The applicable banner, or `null`.
 */
export function CouponNotices(): React.ReactElement | null {
  const [notice, setNotice] = useState<CouponNotice | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);

  /**
   * Load the notice. Extracted from the mount effect so the error state's Retry button can call
   * the exact same logic rather than re-mounting the component.
   *
   * @returns Nothing; the outcome is written to `notice` / `fetchFailed`.
   */
  const loadNotice = useCallback(async (): Promise<void> => {
    const token = readToken();
    if (!token) {
      // No session yet — not a fetch failure to report. `/admin`'s own auth flow owns this case.
      return;
    }

    try {
      const response = await fetch('/api/billing/coupon/notice', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setFetchFailed(true);
        return;
      }
      const json = await response.json();
      if (json.success) {
        setNotice(json.data as CouponNotice);
        setFetchFailed(false);
      } else {
        setFetchFailed(true);
      }
    } catch {
      setFetchFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const handleRetry = useCallback(async (): Promise<void> => {
    setRetrying(true);
    try {
      await loadNotice();
    } finally {
      setRetrying(false);
    }
  }, [loadNotice]);

  const openBillingPortal = async (): Promise<void> => {
    const token = readToken();
    setAddingPaymentMethod(true);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await response.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url as string;
        return;
      }
    } catch {
      // Nothing to add here beyond leaving the button enabled again — the merchant can retry, and
      // this is the same failure mode `/admin/billing`'s own portal button already has.
    } finally {
      setAddingPaymentMethod(false);
    }
  };

  // Checked before "nothing to show": a silent gap here is exactly what finding 11 flagged.
  if (fetchFailed && !notice) {
    return (
      <Alert
        icon={<IconAlertTriangle size={16} />}
        color="gray"
        variant="light"
        role="alert"
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Text size="sm">Couldn&apos;t check your offer status.</Text>
          <Button size="xs" variant="subtle" onClick={() => void handleRetry()} loading={retrying}>
            Retry
          </Button>
        </Group>
      </Alert>
    );
  }

  if (!notice || notice.kind === 'none') {
    return null;
  }

  if (notice.kind === 'reservation') {
    return <CouponReservationBanner code={notice.code} attributedAt={new Date(notice.attributedAt)} />;
  }

  const status: RedemptionStatus = 'redeemed';
  return (
    <DiscountNoticeAlert
      discountEndsAt={notice.discountEndsAt ? new Date(notice.discountEndsAt) : null}
      hasPaymentMethod={notice.hasPaymentMethod}
      status={status}
      onAddPaymentMethod={openBillingPortal}
      addingPaymentMethod={addingPaymentMethod}
    />
  );
}
