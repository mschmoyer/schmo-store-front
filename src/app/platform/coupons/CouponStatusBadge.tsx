'use client';

/**
 * The coupon-status vocabulary, rendered.
 *
 * One mapping from `PlatformCouponStatus` to a tone, so the badge on a coupon row, the filter tabs
 * and the create form's confirmation always agree on what each word looks like.
 */

import React from 'react';
import { Badge, type BadgeTone } from '@/components/ui';
import type { PlatformCouponStatus } from './types';

const TONE_BY_STATUS: Record<PlatformCouponStatus, BadgeTone> = {
  active: 'mint',
  inactive: 'neutral',
  expired: 'amber',
  exhausted: 'amber',
};

const LABEL_BY_STATUS: Record<PlatformCouponStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  exhausted: 'Exhausted',
};

export interface CouponStatusBadgeProps {
  status: PlatformCouponStatus;
}

/**
 * Renders a coupon's derived status as a badge.
 *
 * @param props - {@link CouponStatusBadgeProps}
 * @returns The status badge.
 */
export function CouponStatusBadge({ status }: CouponStatusBadgeProps): React.ReactElement {
  return (
    <Badge tone={TONE_BY_STATUS[status]} size="sm" dot>
      {LABEL_BY_STATUS[status]}
    </Badge>
  );
}
