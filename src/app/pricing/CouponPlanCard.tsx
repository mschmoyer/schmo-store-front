import * as React from 'react';
import { Badge, Button } from '@/components/ui';
import { ROUTES } from '@/components/marketing/data/routes';
import { PlanLists } from '@/components/marketing/pricing/PlanCard';
import styles from '@/components/marketing/pricing/PlanCard.module.css';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import {
  computeDiscountedPriceCents,
  requiresPaymentMethod,
} from '@/lib/billing/platform-coupons';
import { PLATFORM_LIST_AMOUNT_CENTS } from '@/lib/billing/intro-offer';

export interface CouponPlanCardProps {
  /** The redeemable coupon `/pricing`'s server component resolved from the `/join` cookie. */
  coupon: PlatformCouponRecord;
}

/**
 * Format cents as a bare dollar figure with no currency symbol and no trailing
 * `.00` (`900` → `"9"`, `999` → `"9.99"`, `0` → `"0"`) — the symbol renders as
 * its own element, matching `.priceSymbol`'s split for the standard `$1`.
 *
 * @param cents - Amount in integer cents.
 * @returns The bare decimal figure.
 */
function formatBareDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

/**
 * The plan card for a visitor who arrived via a `/join/<code>` link, quoting
 * that coupon's actual numbers in place of the standard intro offer.
 *
 * A sibling of `PlanCard`, not a prop added to it: `PlanCard`'s price block is
 * fixed copy for the one offer that never varies. The Included / Not-included
 * lists below the price block are `PlanCard`'s own `PlanLists`, imported
 * rather than duplicated, so the two cards can't disagree about plan contents.
 *
 * Numbers come from `lib/billing/platform-coupons` (docs/plans/platform-coupons.md
 * §2). `requiresPaymentMethod`, not `collectPaymentMethod` directly, decides
 * the card-collection line — a partial discount takes a card regardless of
 * that flag (plan §3), and a friend told "no card needed" then asked for one
 * at billing is the exact failure plan §14 decision 1 calls out.
 *
 * @param props - {@link CouponPlanCardProps}
 * @returns The coupon-quoting plan card.
 */
export function CouponPlanCard({ coupon }: CouponPlanCardProps): React.JSX.Element {
  const isFree = coupon.percentOff === 100;
  const isForever = coupon.durationMonths === null;
  const discountedCents = computeDiscountedPriceCents(PLATFORM_LIST_AMOUNT_CENTS, coupon.percentOff);
  const cardRequired = requiresPaymentMethod(coupon);

  const windowLabel = isForever
    ? 'forever'
    : `for ${coupon.durationMonths} month${coupon.durationMonths === 1 ? '' : 's'}`;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>{coupon.name}</p>
        <p className={styles.planName}>RebelShops</p>
        <Badge tone="mint" size="md" className={styles.badge}>
          Invite offer
        </Badge>
      </div>

      <div className={styles.priceBlock}>
        <p className={styles.price}>
          {isFree ? (
            'Free'
          ) : (
            <>
              <span className={styles.priceSymbol}>$</span>
              {formatBareDollars(discountedCents)}
            </>
          )}
        </p>
        <p className={styles.priceNote}>
          {isFree ? windowLabel : `a month, ${windowLabel}`}
        </p>
        {isForever ? null : <p className={styles.thenLine}>then $19.99/mo</p>}
      </div>

      <div className={styles.cta}>
        <Button href={ROUTES.signUp} size="lg">
          {isFree ? 'Start free' : 'Get started'}
        </Button>
        <p className={styles.microcopy}>
          {cardRequired
            ? 'A card will be required at signup.'
            : 'No card required to start.'}{' '}
          You connect ShipStation next.
        </p>
      </div>

      <PlanLists />
    </div>
  );
}

export default CouponPlanCard;
