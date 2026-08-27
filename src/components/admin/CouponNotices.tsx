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
 * Failure here is silent by design: this is a supplementary notice on a dashboard whose main
 * content (`fetchDashboardData` in `src/app/admin/page.tsx`) already owns loading and error states
 * and its own redirect-to-login on a missing token. A coupon-notice fetch failing does not stop the
 * merchant from seeing their revenue and stock numbers, so this component degrades to rendering
 * nothing rather than adding a second error banner to a page that already has one.
 */

import type React from 'react';
import { useEffect, useState } from 'react';
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
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);

  useEffect(() => {
    // An inline async IIFE, not a `useCallback`-memoized function called from the effect body —
    // matches `StripeConnectCard.tsx`'s fetch-on-mount effect, which this mirrors.
    void (async () => {
      const token = readToken();
      if (!token) {
        return;
      }

      try {
        const response = await fetch('/api/billing/coupon/notice', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          return;
        }
        const json = await response.json();
        if (json.success) {
          setNotice(json.data as CouponNotice);
        }
      } catch {
        // Supplementary notice — see the file header. Leave it unrendered.
      }
    })();
  }, []);

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
