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
 * still redeemable — see `docs/plans/platform-coupons.md` §4A / §14 decision 4.
 *
 * Same shell as the standard `PricingPage` (same header, footer, comparison
 * table, FAQ and final CTA — none of that is about the intro offer, so none of
 * it changes) with the head band and the plan card replaced: the headline
 * states the coupon's own offer sentence rather than the fixed "$19.99 a
 * month", and {@link CouponPlanCard} quotes the coupon's real numbers. This is
 * a sibling component rather than a prop threaded through `PricingPage`,
 * for the same reason `CouponPlanCard` is a sibling of `PlanCard`: the
 * standard page's copy is written as fixed strings for the one offer that
 * never varies, and this is a different offer.
 *
 * Every screen a coupon-holder reaches states the card requirement plainly —
 * the onboarding wizard's `CouponBanner` does it in the same words. A friend
 * promised "no card needed" by the `/join` link and then asked for one after
 * following it to `/pricing` and into signup would be exactly the failure
 * plan §14 decision 1 exists to prevent.
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
