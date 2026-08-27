'use client';

/**
 * The Redemptions tab: every coupon claim across every merchant, newest-attributed first (plan
 * §4C). This is the tab that answers "did my friends actually sign up" — the point of the whole
 * feature — so every row names who claimed the code, which store (if one exists yet), which
 * coupon, where the claim sits in the attributed → redeemed → released lifecycle, and when the
 * discount window closes.
 *
 * Demo stores are excluded by default, per `docs/platform-admin.md`, and the scope line always
 * says how many were hidden — even when that number is zero — rather than leaving an operator to
 * infer it from a suspiciously round total.
 */

import React, { useMemo } from 'react';
import { IconUsers } from '@tabler/icons-react';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';
import { EmptyState, Switch } from '@/components/ui';
import { PaginationBar, PlatformErrorState, usePlatformFetch } from '@/components/platform/customers';
import { REDEMPTION_STATUS_FILTERS } from './useCouponsParams';
import type { PlatformCouponClaimStatus, PlatformRedemptionsPayload } from './types';
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
        <div className={styles.filterTabs} role="tablist" aria-label="Filter redemptions by status">
          {REDEMPTION_STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={status === option.value}
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

      {/* A hidden store is a fact about the reading, per docs/platform-admin.md — said in words
          whether or not the number is zero, rather than left for an operator to infer. */}
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
        <TableSkeleton rows={6} columns={6} label="Loading redemptions" />
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
                </tr>
              </thead>
              <tbody>
                {data.redemptions.map((redemption) => (
                  <tr key={redemption.id} className={styles.row}>
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
                          {redemption.store.isDemo ? (
                            <span className={styles.demoTag}> (demo)</span>
                          ) : null}
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
                    <td>{redemption.discountEndsAt ? formatDate(redemption.discountEndsAt) : 'Forever'}</td>
                  </tr>
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
