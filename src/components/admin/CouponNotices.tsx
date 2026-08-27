'use client';

/**
 * Mounts whichever platform-coupon banner applies to the signed-in merchant, or nothing.
 *
 * `docs/plans/platform-coupons.md` §5.1/§5.2, phase 7 of §10, wired into `/admin` per §4D. This is
 * the only piece of phase 7 that talks to the network: it reads `GET /api/billing/coupon/notice`
 * (added alongside this component) and renders exactly one of
 * {@link CouponReservationBanner} (the reservation clock) or {@link DiscountNoticeAlert} (the
 * free-window ladder) — never both, since a merchant can hold at most one live claim
 * (`idx_pcr_one_live_per_user`) and a claim is either `attributed` or `redeemed`, never both at
 * once.
 *
 * A fetch failure is **not** silent (staff review finding 11 — it used to be, and invariant 14 is
 * exactly why that was wrong): "a redemption with a `discount_ends_at` and no stored card must
 * always render the banner" — for a no-card coupon this banner is the merchant's *only* route to a
 * payment method, and a `500` making it vanish with no trace defeats that invariant as completely as
 * never building the banner at all. So a failed fetch renders a small, dismissal-free inline notice
 * with a retry, rather than returning `null` and leaving the merchant with no sign anything was
 * supposed to be here. This is still deliberately quiet next to the dashboard's own error banner
 * (`fetchDashboardData` in `src/app/admin/page.tsx` owns that one) — no full-width alert, no page
 * disruption — but "quiet" and "invisible" are not the same thing.
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

  // Checked before the "nothing to show" case: a merchant who might be sitting on a no-card
  // redemption with a closing discount window must see *something* here, never a silent gap —
  // that gap is exactly what finding 11 flagged.
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
