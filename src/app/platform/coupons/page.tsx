'use client';

/**
 * `/platform/coupons` — the operator console's signup-coupon screen (plan §4C, phase 3).
 *
 * Two tabs: **Coupons** manages platform-wide signup offers that discount a merchant's RebelShops
 * subscription — never a storefront discount (the unrelated `coupons` table, `/admin/coupons`).
 * **Redemptions** tracks claims through attributed → redeemed → released.
 *
 * Tab and filter state live in the URL, same reasoning as `src/app/platform/customers/page.tsx`:
 * bookmarkable and pasteable into a ticket, not lost on navigating away and back.
 */

import React, { Suspense, useCallback, useRef } from 'react';
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

/** The DOM id of a tab button, for `aria-controls`/`aria-labelledby` to point at. */
function tabId(value: CouponsTabName): string {
  return `coupons-tab-${value}`;
}

/** The DOM id of the panel a tab controls. */
function panelId(value: CouponsTabName): string {
  return `coupons-panel-${value}`;
}

/**
 * The coupons screen, with its tab and filter state read from the URL.
 *
 * The one real tab switch on the page — Coupons and Redemptions are genuinely separate panels,
 * unlike the status filter buttons inside each tab (those are filter groups — see
 * `RedemptionsTab.tsx`). So this gets the full WAI-ARIA tabs pattern: `aria-controls` to a real
 * `role="tabpanel"`, roving `tabIndex`, Left/Right/Home/End moving selection and focus together
 * (staff review finding 10 — none of this existed before).
 *
 * @returns The screen.
 */
function CouponsView(): React.ReactElement {
  const { params, setTab, setCouponFilter, setRedemptionStatus, setRedemptionPage, setIncludeDemo } =
    useCouponsParams();

  const tabRefs = useRef<Partial<Record<CouponsTabName, HTMLButtonElement | null>>>({});

  const activateTab = useCallback(
    (value: CouponsTabName) => {
      setTab(value);
      tabRefs.current[value]?.focus();
    },
    [setTab]
  );

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((tab) => tab.value === params.tab);
      let nextIndex: number | null = null;

      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
      else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = TABS.length - 1;

      if (nextIndex === null) return;
      event.preventDefault();
      activateTab(TABS[nextIndex].value);
    },
    [activateTab, params.tab]
  );

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
            ref={(element) => {
              tabRefs.current[tab.value] = element;
            }}
            id={tabId(tab.value)}
            type="button"
            role="tab"
            aria-selected={params.tab === tab.value}
            aria-controls={panelId(tab.value)}
            tabIndex={params.tab === tab.value ? 0 : -1}
            className={styles.tabButton}
            data-active={params.tab === tab.value || undefined}
            onClick={() => activateTab(tab.value)}
            onKeyDown={handleTabKeyDown}
          >
            <IconTicket size={15} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId(params.tab)}
        aria-labelledby={tabId(params.tab)}
        tabIndex={0}
      >
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
