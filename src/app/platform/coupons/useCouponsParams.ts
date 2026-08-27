'use client';

/**
 * The coupons screen's view state, kept in the URL — same reasoning as
 * `src/components/platform/customers/useCustomerParams.ts`: which tab is open, which coupon filter
 * is active, and which page of redemptions an operator is looking at should survive a bookmark, a
 * paste into a ticket, and the Back button.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PlatformCouponClaimStatus, PlatformCouponFilter } from './types';
import { PLATFORM_COUPON_STATUSES } from './types';

/** The screen's two tabs. */
export type CouponsTab = 'coupons' | 'redemptions';

/** The coupon-filter tabs, in the order offered. */
export const COUPON_FILTERS: ReadonlyArray<{ value: PlatformCouponFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
  { value: 'exhausted', label: 'Exhausted' },
];

/** The redemption-status filter's options. */
export const REDEMPTION_STATUS_FILTERS: ReadonlyArray<{
  value: PlatformCouponClaimStatus | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'attributed', label: 'Attributed' },
  { value: 'redeemed', label: 'Redeemed' },
  { value: 'released', label: 'Released' },
];

const REDEMPTION_STATUSES: readonly PlatformCouponClaimStatus[] = ['attributed', 'redeemed', 'released'];

/** Everything the screen reads out of the query string. */
export interface CouponsParams {
  tab: CouponsTab;
  couponFilter: PlatformCouponFilter;
  redemptionStatus: PlatformCouponClaimStatus | 'all';
  redemptionPage: number;
  includeDemo: boolean;
}

/** What {@link useCouponsParams} returns. */
export interface CouponsParamsApi {
  params: CouponsParams;
  setTab: (tab: CouponsTab) => void;
  setCouponFilter: (filter: PlatformCouponFilter) => void;
  setRedemptionStatus: (status: PlatformCouponClaimStatus | 'all') => void;
  setRedemptionPage: (page: number) => void;
  setIncludeDemo: (value: boolean) => void;
}

function parseTab(value: string | null): CouponsTab {
  return value === 'redemptions' ? 'redemptions' : 'coupons';
}

function parseCouponFilter(value: string | null): PlatformCouponFilter {
  if (value === 'all') return 'all';
  return value && (PLATFORM_COUPON_STATUSES as readonly string[]).includes(value)
    ? (value as PlatformCouponFilter)
    : 'all';
}

function parseRedemptionStatus(value: string | null): PlatformCouponClaimStatus | 'all' {
  return value && (REDEMPTION_STATUSES as readonly string[]).includes(value)
    ? (value as PlatformCouponClaimStatus)
    : 'all';
}

function parsePage(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Read the coupons screen's view state from the URL and write changes back.
 *
 * @returns The current parameters and the setters that update them.
 */
export function useCouponsParams(): CouponsParamsApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo<CouponsParams>(
    () => ({
      tab: parseTab(searchParams.get('tab')),
      couponFilter: parseCouponFilter(searchParams.get('filter')),
      redemptionStatus: parseRedemptionStatus(searchParams.get('status')),
      redemptionPage: parsePage(searchParams.get('page')),
      includeDemo: searchParams.get('includeDemo') === '1',
    }),
    [searchParams]
  );

  const write = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname, searchParams]
  );

  const setTab = useCallback(
    (tab: CouponsTab) => write({ tab: tab === 'coupons' ? null : tab }),
    [write]
  );
  const setCouponFilter = useCallback(
    (filter: PlatformCouponFilter) => write({ filter: filter === 'all' ? null : filter }),
    [write]
  );
  const setRedemptionStatus = useCallback(
    (status: PlatformCouponClaimStatus | 'all') =>
      write({ status: status === 'all' ? null : status, page: null }),
    [write]
  );
  const setRedemptionPage = useCallback(
    (page: number) => write({ page: page <= 1 ? null : String(page) }),
    [write]
  );
  const setIncludeDemo = useCallback(
    (value: boolean) => write({ includeDemo: value ? '1' : null, page: null }),
    [write]
  );

  return { params, setTab, setCouponFilter, setRedemptionStatus, setRedemptionPage, setIncludeDemo };
}
