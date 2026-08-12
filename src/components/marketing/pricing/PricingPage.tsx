import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { SiteHeader } from '../chrome/SiteHeader';
import { SiteFooter } from '../chrome/SiteFooter';
import { FinalCta } from '../home/FinalCta';
import { Section } from '../parts/Section';
import { ROUTES } from '../data/routes';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';
import { PlanCard } from './PlanCard';
import { PricingComparison } from './PricingComparison';
import { PricingFaq } from './PricingFaq';
import styles from './PricingPage.module.css';

/**
 * Metadata for the `/pricing` route — copy deck §6.1. Re-export this from the
 * route file so the page ships with the approved title and description:
 *
 * ```ts
 * export const metadata = pricingMetadata;
 * export default function Page() { return <PricingPage />; }
 * ```
 */
export const pricingMetadata: Metadata = generateLandingPageMeta({
  title: 'Pricing — $19.99/mo, No Transaction Fees | RebelShops',
  description:
    'One plan, $19.99 a month, $1 for your first three months. We never take a cut of your '
    + 'sales. See the 12-month math against Shopify Basic.',
  canonicalUrl: 'https://rebelshops.com/pricing',
});

/**
 * The complete `/pricing` page, self-contained down to its own header and
 * footer so the route file is a two-line mount.
 *
 * Two gates from the copy deck are honoured here:
 *
 *   - §4.2 second microcopy line ("We email you 7 days before the $19.99 rate
 *     starts") is absent: there is no transactional email, and we do not
 *     promise a notification we cannot send.
 *   - §4.2's billing gate: `Start for $1` points at account creation, which
 *     does not take a card. No card is collected anywhere on this page, so the
 *     page never charges something it cannot charge correctly. When
 *     subscription billing lands, point the CTA at the checkout.
 *
 * @returns The pricing page.
 */
export function PricingPage(): React.JSX.Element {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <Section innerClassName={styles.headInner}>
          <div className={styles.headCopy}>
            <Eyebrow rule>Pricing</Eyebrow>

            <h1 className={styles.title}>One plan. $19.99 a month.</h1>

            <p className={styles.lede}>
              Your first three months cost $1 total. We never take a percentage of a sale.
            </p>

            <div className={styles.headActions}>
              <Button as={Link} href={ROUTES.signUp} size="lg">
                Start for $1
              </Button>
              <p className={styles.microcopy}>
                No card required to start. Cancel anytime in your admin.
              </p>
            </div>
          </div>

          <div className={styles.cardWrap}>
            <PlanCard eyebrow="Everything, one price" badge="0% transaction fees" />
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

export default PricingPage;
