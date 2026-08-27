'use client';

/**
 * `/platform/coupons` — the operator console's signup-coupon screen (plan §4C, phase 3).
 *
 * Two tabs. **Coupons** is where an operator issues and manages the platform-wide signup offers
 * that discount a merchant's RebelShops subscription — never a storefront discount, which is the
 * unrelated `coupons` table and `/admin/coupons`. **Redemptions** is where an operator answers "did
 * my friends actually sign up" by watching claims move through attributed → redeemed → released.
 *
 * Both tabs, and which one is open, live in the URL — the same reasoning
 * `src/app/platform/customers/page.tsx` gives: an operator's question about a subset of coupons or
 * redemptions should be bookmarkable and pasteable into a ticket, not lost the moment they navigate
 * away and back.
 */

import React, { Suspense } from 'react';
import { IconTicket } from '@tabler/icons-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { StatGridSkeleton, TableSkeleton } from '@/components/admin/AdminSkeletons';
import { CouponsTab } from './CouponsTab';
import { RedemptionsTab } from './RedemptionsTab';
import { useCouponsParams, type CouponsTab as CouponsTabName } from './useCouponsParams';
import styles from './coupons.module.css';

/** Skeleton shown before the URL's tab state has resolved. */
function CouponsSkeleton(): React.ReactElement {
  return (
    <div className={styles.page}>
      <StatGridSkeleton count={2} />
      <TableSkeleton rows={6} columns={7} label="Loading" />
    </div>
  );
}

const TABS: ReadonlyArray<{ value: CouponsTabName; label: string }> = [
  { value: 'coupons', label: 'Coupons' },
  { value: 'redemptions', label: 'Redemptions' },
];

/**
 * The coupons screen, with its tab and filter state read from the URL.
 *
 * @returns The screen.
 */
function CouponsView(): React.ReactElement {
  const { params, setTab, setCouponFilter, setRedemptionStatus, setRedemptionPage, setIncludeDemo } =
    useCouponsParams();

  return (
    <div className={styles.page}>
      <AdminPageHeader
        title="Coupons"
        description="Platform-wide signup offers for merchants subscribing to RebelShops — not a storefront discount code."
      />

      <div className={styles.tabBar} role="tablist" aria-label="Coupon console sections">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={params.tab === tab.value}
            className={styles.tabButton}
            data-active={params.tab === tab.value || undefined}
            onClick={() => setTab(tab.value)}
          >
            <IconTicket size={15} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {params.tab === 'coupons' ? (
        <CouponsTab filter={params.couponFilter} onFilterChange={setCouponFilter} />
      ) : (
        <RedemptionsTab
          status={params.redemptionStatus}
          onStatusChange={setRedemptionStatus}
          page={params.redemptionPage}
          onPageChange={setRedemptionPage}
          includeDemo={params.includeDemo}
          onIncludeDemoChange={setIncludeDemo}
        />
      )}
    </div>
  );
}

/**
 * The `/platform/coupons` route.
 *
 * Behind `Suspense` because the view reads the query string via `useSearchParams` — a page that
 * does so without a boundary opts the whole route out of static rendering at build time (see
 * `src/app/platform/customers/page.tsx`).
 *
 * @returns The route.
 */
export default function PlatformCouponsPage(): React.ReactElement {
  return (
    <Suspense fallback={<CouponsSkeleton />}>
      <CouponsView />
    </Suspense>
  );
}
