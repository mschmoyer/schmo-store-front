import * as React from 'react';
import { Button, Eyebrow } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { Section } from '@/components/marketing/parts/Section';
import { ROUTES } from '@/components/marketing/data/routes';
import { PricingComparison } from '@/components/marketing/pricing/PricingComparison';
import { PricingFaq } from '@/components/marketing/pricing/PricingFaq';
import styles from '@/components/marketing/pricing/PricingPage.module.css';
import { CouponPlanCard } from './CouponPlanCard';
import type { PlatformCouponRecord } from '@/lib/platform/coupons';
import { describePlatformCoupon, requiresPaymentMethod } from '@/lib/billing/platform-coupons';

export interface CouponPricingPageProps {
  /** The redeemable coupon `/pricing`'s server component resolved from the `/join` cookie. */
  coupon: PlatformCouponRecord;
}

/**
 * `/pricing`, for a visitor whose `/join/<CODE>` cookie names a coupon that is
 * still redeemable — see docs/plans/platform-coupons.md §4A / §14 decision 4.
 *
 * Same shell as the standard `PricingPage`, with the head band and plan card
 * replaced by the coupon's own offer sentence and {@link CouponPlanCard}'s
 * real numbers — a sibling component rather than a prop on `PricingPage`,
 * since that page's copy is fixed strings for the one offer that never
 * varies.
 *
 * States the card requirement plainly, matching the wording the onboarding
 * wizard's `CouponBanner` uses — a friend promised "no card needed" and then
 * asked for one at signup is the exact failure plan §14 decision 1 prevents.
 *
 * @param props - {@link CouponPricingPageProps}
 * @returns The coupon-quoting pricing page.
 */
export function CouponPricingPage({ coupon }: CouponPricingPageProps): React.JSX.Element {
  const offer = describePlatformCoupon(coupon);
  const cardRequired = requiresPaymentMethod(coupon);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <Section innerClassName={styles.headInner}>
          <div className={styles.headCopy}>
            <Eyebrow rule>Your invite</Eyebrow>

            <h1 className={styles.title}>One plan. {offer}.</h1>

            <p className={styles.lede}>
              You&rsquo;re on the {coupon.name} offer. We never take a percentage of a sale.
            </p>

            <div className={styles.headActions}>
              <Button href={ROUTES.signUp} size="lg">
                {coupon.percentOff === 100 ? 'Start free' : 'Get started'}
              </Button>
              <p className={styles.microcopy}>
                {cardRequired
                  ? 'A card will be required at signup.'
                  : 'No card required to start.'}{' '}
                Cancel anytime in your admin.
              </p>
            </div>
          </div>

          <div className={styles.cardWrap}>
            <CouponPlanCard coupon={coupon} />
          </div>
        </Section>

        <PricingComparison />
        <PricingFaq />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}

export default CouponPricingPage;
