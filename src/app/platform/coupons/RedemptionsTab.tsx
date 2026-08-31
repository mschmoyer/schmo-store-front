'use client';

/**
 * The Redemptions tab: every coupon claim across every merchant, newest-attributed first (plan
 * §4C) — who claimed, which store (if any yet), which coupon, its attributed → redeemed →
 * released status, and when the discount window closes.
 *
 * Demo stores are excluded by default (`docs/platform-admin.md`); the scope line always states
 * how many were hidden, even when zero, rather than leaving it to be inferred from the total.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';
import { Button, EmptyState, Switch } from '@/components/ui';
import { PaginationBar, PlatformErrorState, usePlatformFetch } from '@/components/platform/customers';
import { REDEMPTION_STATUS_FILTERS } from './useCouponsParams';
import type {
  PlatformCouponClaimStatus,
  PlatformRedemptionApiItem,
  PlatformRedemptionsPayload,
} from './types';
import styles from './coupons.module.css';

const STATUS_LABEL: Record<PlatformCouponClaimStatus, string> = {
  attributed: 'Attributed',
  redeemed: 'Redeemed',
  released: 'Released',
};

/**
 * Format an ISO timestamp as a short absolute date, or an em dash when absent.
 *
 * @param iso - The timestamp, or `null`.
 * @returns e.g. `27 Aug 2026`, or `—`.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface RedemptionsTabProps {
  status: PlatformCouponClaimStatus | 'all';
  onStatusChange: (status: PlatformCouponClaimStatus | 'all') => void;
  page: number;
  onPageChange: (page: number) => void;
  includeDemo: boolean;
  onIncludeDemoChange: (value: boolean) => void;
}

/**
 * One redemption row, with the release action for an `attributed` claim (staff review finding 2:
 * `releaseClaim` existed and was tested but unreachable from any route or UI).
 *
 * @param props.redemption - The row.
 * @param props.onReleased - Called after a successful release, so the caller can reload the list.
 * @returns The row.
 */
function RedemptionRow({
  redemption,
  onReleased,
}: {
  redemption: PlatformRedemptionApiItem;
  onReleased: () => void;
}): React.ReactElement {
  const [releasing, setReleasing] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleRelease = useCallback(async () => {
    if (
      !window.confirm(
        `Release ${redemption.user.email}'s claim on ${redemption.coupon.code}? This frees the seat; it does not notify them.`
      )
    ) {
      return;
    }

    setReleasing(true);
    setRowError(null);
    try {
      const response = await fetch(`/api/platform/coupons/redemptions/${redemption.id}/release`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok || payload?.success !== true) {
        setRowError(payload?.error || 'Could not release this claim.');
        return;
      }
      onReleased();
    } catch {
      setRowError('Could not reach the server.');
    } finally {
      setReleasing(false);
    }
  }, [onReleased, redemption.coupon.code, redemption.id, redemption.user.email]);

  return (
    <tr className={styles.row}>
      <td>
        <div className={styles.nameCell}>
          <span>{redemption.user.name}</span>
          <span className={styles.notes}>{redemption.user.email}</span>
        </div>
      </td>
      <td>
        {redemption.store ? (
          <span>
            {redemption.store.name}
            {redemption.store.isDemo ? <span className={styles.demoTag}> (demo)</span> : null}
          </span>
        ) : (
          <span className={styles.notes}>Not created yet</span>
        )}
      </td>
      <td>
        <span className={styles.code}>{redemption.coupon.code}</span>
      </td>
      <td>
        <span className={styles.statusTag} data-status={redemption.status}>
          {STATUS_LABEL[redemption.status]}
        </span>
        {redemption.status === 'released' && redemption.releaseReason ? (
          <span className={styles.notes}> ({redemption.releaseReason.replace(/_/g, ' ')})</span>
        ) : null}
      </td>
      <td>{formatDate(redemption.attributedAt)}</td>
      <td>{formatDate(redemption.redeemedAt)}</td>
      {/* `discount_ends_at` is NULL for `attributed`/`released` rows only because it hasn't been
          set yet, not because the offer is forever — only `redeemed` can show "Forever" (staff
          review finding 6). */}
      <td>
        {redemption.status === 'redeemed'
          ? redemption.discountEndsAt
            ? formatDate(redemption.discountEndsAt)
            : 'Forever'
          : '—'}
      </td>
      {/* Without this an operator can't tell a running free year from a lapsed/cancelled one
          (staff review finding 13). Only `redeemed` claims have a Stripe subscription to show. */}
      <td>
        {redemption.subscriptionStatus ? (
          <span className={styles.statusTag}>{redemption.subscriptionStatus.replace(/_/g, ' ')}</span>
        ) : (
          <span className={styles.notes}>—</span>
        )}
      </td>
      <td>
        {redemption.status === 'attributed' ? (
          <Button variant="ghost" size="sm" onClick={handleRelease} loading={releasing}>
            Release
          </Button>
        ) : (
          <span className={styles.notes}>—</span>
        )}
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
 * The Redemptions tab.
 *
 * @param props - {@link RedemptionsTabProps}
 * @returns The tab's content.
 */
export function RedemptionsTab({
  status,
  onStatusChange,
  page,
  onPageChange,
  includeDemo,
  onIncludeDemoChange,
}: RedemptionsTabProps): React.ReactElement {
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (includeDemo) params.set('includeDemo', '1');
    params.set('page', String(page));
    return params.toString();
  }, [status, includeDemo, page]);

  const { data, error, loading, reload } = usePlatformFetch<PlatformRedemptionsPayload>(
    `/api/platform/coupons/redemptions?${query}`
  );

  if (error) {
    return <PlatformErrorState error={error} subject="redemptions" onRetry={reload} />;
  }

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        {/* Filter group, not tabs — same reasoning as `CouponsTab.tsx` (staff review finding 10). */}
        <div className={styles.filterTabs} role="group" aria-label="Filter redemptions by status">
          {REDEMPTION_STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              className={styles.filterTab}
              data-active={status === option.value || undefined}
              onClick={() => onStatusChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Switch
          label="Include demo stores"
          size="sm"
          checked={includeDemo}
          onChange={(event) => onIncludeDemoChange(event.target.checked)}
        />
      </div>

      {/* Stated whether or not the count is zero — see file header. */}
      {data ? (
        <p className={styles.scopeNote} role="status">
          {data.scope.includeDemo
            ? 'Showing every redemption, demo stores included.'
            : data.scope.demoStoresHidden > 0
              ? `${data.scope.demoStoresHidden.toLocaleString('en-US')} demo ${
                  data.scope.demoStoresHidden === 1 ? 'store' : 'stores'
                } hidden from this list.`
              : 'No demo stores exist to hide.'}
        </p>
      ) : null}

      {loading || !data ? (
        <TableSkeleton rows={6} columns={9} label="Loading redemptions" />
      ) : data.redemptions.length === 0 ? (
        <EmptyState
          illustration={<IconUsers size={34} aria-hidden="true" />}
          title={status === 'all' ? 'No redemptions yet' : `No ${status} redemptions`}
          description={
            status === 'all'
              ? 'Nobody has signed up with a platform coupon yet. Redemptions appear here the moment someone does.'
              : 'No redemption currently matches this filter. Clear it to see every redemption.'
          }
        />
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.tableCaption}>
                Coupon redemptions matching the &ldquo;{status}&rdquo; filter, newest first.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">Store</th>
                  <th scope="col">Coupon</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attributed</th>
                  <th scope="col">Redeemed</th>
                  <th scope="col">Discount ends</th>
                  <th scope="col">Subscription</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.redemptions.map((redemption) => (
                  <RedemptionRow key={redemption.id} redemption={redemption} onReleased={reload} />
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar pagination={data.pagination} onPageChange={onPageChange} noun="redemptions" />
        </>
      )}
    </div>
  );
}
