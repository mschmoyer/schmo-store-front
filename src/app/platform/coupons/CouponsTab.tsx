'use client';

/**
 * The Coupons tab: every platform signup coupon, filterable by status, with create, deactivate and
 * copy-link actions (plan §4C).
 *
 * Unlike the customers list this table is not paginated — `src/lib/platform/coupons.ts` documents
 * why: coupons are operator-issued, so the set is tens to low hundreds of rows, not tenancy-wide. A
 * pager here would be furniture.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { IconPlus, IconTicket } from '@tabler/icons-react';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Button, EmptyState } from '@/components/ui';
import { PlatformErrorState, usePlatformFetch } from '@/components/platform/customers';
import { CopyLinkButton } from './CopyLinkButton';
import { CouponStatusBadge } from './CouponStatusBadge';
import { CreateCouponModal } from './CreateCouponModal';
import { COUPON_FILTERS } from './useCouponsParams';
import type { PlatformCouponApiItem, PlatformCouponFilter, PlatformCouponsPayload } from './types';
import styles from './coupons.module.css';

/** Session-carried admin bearer token, matching `usePlatformFetch`'s own read of it. */
function adminToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('admin_token');
}

/**
 * Format a coupon's live-claim count against its cap.
 *
 * Named "Claimed", not "Redeemed" (staff review finding 12): `redeemedCount` is a rollup of
 * `attributed` + `redeemed` claims by design (it is what the capacity check enforces), so a coupon
 * one person clicked and never converted reads `1 / 1` — capacity-true, but "Redeemed / limit" told
 * an operator something that never happened. "Claimed" is accurate for both a reservation and a
 * completed signup, on the tab whose whole purpose is knowing which one actually occurred; that
 * finer distinction lives one tab over, in Redemptions.
 *
 * @param coupon - The coupon.
 * @returns e.g. `"3 / 10"`, or `"3 / unlimited"` when `maxRedemptions` is `null`.
 */
function claimedSummary(coupon: PlatformCouponApiItem): string {
  return `${coupon.redeemedCount.toLocaleString('en-US')} / ${
    coupon.maxRedemptions === null ? 'unlimited' : coupon.maxRedemptions.toLocaleString('en-US')
  }`;
}

/**
 * Format `redeemBy` for the table. Absent means the link does not expire on its own.
 *
 * @param redeemBy - ISO timestamp, or `null`.
 * @returns A short date, or "Never".
 */
function formatExpiry(redeemBy: string | null): string {
  if (!redeemBy) return 'Never';
  const date = new Date(redeemBy);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface CouponsTabProps {
  filter: PlatformCouponFilter;
  onFilterChange: (filter: PlatformCouponFilter) => void;
}

/**
 * One coupon row.
 *
 * @param props.coupon - The coupon.
 * @param props.onDeactivated - Called with the updated coupon after a successful deactivation.
 * @returns The row.
 */
function CouponRow({
  coupon,
  onDeactivated,
}: {
  coupon: PlatformCouponApiItem;
  onDeactivated: (coupon: PlatformCouponApiItem) => void;
}): React.ReactElement {
  const [deactivating, setDeactivating] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDeactivate = useCallback(async () => {
    if (!window.confirm(`Deactivate ${coupon.code}? No new redemptions will be accepted. Anyone already on this offer keeps it.`)) {
      return;
    }

    setDeactivating(true);
    setRowError(null);
    try {
      const token = adminToken();
      const response = await fetch(`/api/platform/coupons/${coupon.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isActive: false }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: { coupon: PlatformCouponApiItem }; error?: string }
        | null;

      if (!response.ok || payload?.success !== true || !payload.data) {
        setRowError(payload?.error || 'Could not deactivate this coupon.');
        return;
      }
      onDeactivated(payload.data.coupon);
    } catch {
      setRowError('Could not reach the server.');
    } finally {
      setDeactivating(false);
    }
  }, [coupon.code, coupon.id, onDeactivated]);

  return (
    <tr className={styles.row} data-inactive={!coupon.isActive || undefined}>
      <td className={styles.codeCell}>
        <span className={styles.code}>{coupon.code}</span>
        <CouponStatusBadge status={coupon.status} />
      </td>
      <td>
        <div className={styles.nameCell}>
          <span>{coupon.name}</span>
          {coupon.notes ? <span className={styles.notes}>{coupon.notes}</span> : null}
        </div>
      </td>
      <td>{coupon.offer}</td>
      <td className={styles.numeric}>{claimedSummary(coupon)}</td>
      <td>{formatExpiry(coupon.redeemBy)}</td>
      <td>{coupon.createdByName ?? 'Unknown'}</td>
      <td>
        <div className={styles.actions}>
          <CopyLinkButton code={coupon.code} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeactivate}
            loading={deactivating}
            disabled={!coupon.isActive}
          >
            {coupon.isActive ? 'Deactivate' : 'Deactivated'}
          </Button>
        </div>
        {rowError ? (
          <p className={styles.rowError} role="alert">
            {rowError}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * The Coupons tab.
 *
 * @param props - {@link CouponsTabProps}
 * @returns The tab's content.
 */
export function CouponsTab({ filter, onFilterChange }: CouponsTabProps): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<PlatformCouponApiItem | null>(null);

  const { data, error, loading, reload } = usePlatformFetch<PlatformCouponsPayload>(
    `/api/platform/coupons?filter=${encodeURIComponent(filter)}`
  );

  const counts = data?.counts;

  const filterTabs = useMemo(
    () =>
      COUPON_FILTERS.map((option) => ({
        ...option,
        count: option.value === 'all' ? undefined : counts?.[option.value],
      })),
    [counts]
  );

  const handleCreated = useCallback(
    (coupon: PlatformCouponApiItem) => {
      setJustCreated(coupon);
      reload();
    },
    [reload]
  );

  const handleDeactivated = useCallback(() => {
    reload();
  }, [reload]);

  if (error) {
    return <PlatformErrorState error={error} subject="coupons" onRetry={reload} />;
  }

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        {/* A filter group, not tabs — it narrows this one table, it does not switch between
            separate panels. `role="tab"` would obligate `aria-controls`, a `tabpanel` and
            roving-tabindex arrow-key handling this control has no use for, so it wears
            `aria-pressed` toggle-button semantics instead (staff review finding 10; matches the
            same fix in `RedemptionsTab.tsx`). */}
        <div className={styles.filterTabs} role="group" aria-label="Filter coupons by status">
          {filterTabs.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              className={styles.filterTab}
              data-active={filter === option.value || undefined}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
              {option.count !== undefined ? <span className={styles.filterCount}>{option.count}</span> : null}
            </button>
          ))}
        </div>

        <Button size="sm" leftIcon={<IconPlus size={15} />} onClick={() => setCreateOpen(true)}>
          New coupon
        </Button>
      </div>

      {justCreated ? (
        <div className={styles.createdBanner} role="status">
          <IconTicket size={16} aria-hidden="true" />
          <span>
            <strong>{justCreated.code}</strong> created — {justCreated.offer}.
          </span>
          <CopyLinkButton code={justCreated.code} />
          <button
            type="button"
            className={styles.dismissBanner}
            onClick={() => setJustCreated(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      {loading || !data ? (
        <TableSkeleton rows={5} columns={7} label="Loading coupons" />
      ) : data.coupons.length === 0 ? (
        <EmptyState
          illustration={<IconTicket size={34} aria-hidden="true" />}
          title={filter === 'all' ? 'No coupons yet' : `No ${filter} coupons`}
          description={
            filter === 'all'
              ? 'Create the first signup coupon to hand a friend a link, or issue a public offer.'
              : 'No coupon currently matches this filter. Clear it to see every coupon.'
          }
          action={
            filter === 'all' ? (
              <Button leftIcon={<IconPlus size={15} />} onClick={() => setCreateOpen(true)}>
                New coupon
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => onFilterChange('all')}>
                Show all coupons
              </Button>
            )
          }
        />
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.tableCaption}>
              Every platform signup coupon matching the &ldquo;{filter}&rdquo; filter. Scroll right for
              more columns on a narrow screen.
            </caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Offer</th>
                <th scope="col">Claimed / limit</th>
                <th scope="col">Expiry</th>
                <th scope="col">Created by</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.coupons.map((coupon) => (
                <CouponRow key={coupon.id} coupon={coupon} onDeactivated={handleDeactivated} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCouponModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
