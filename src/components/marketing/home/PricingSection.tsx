import * as React from 'react';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import { PlanCard } from '../pricing/PlanCard';
import styles from './PricingSection.module.css';

/**
 * Copy deck §3.10 — the homepage pricing block.
 *
 * This is the site's ONE dark section, and the only permitted exception to the
 * single-page-ground rule. It sits at the decision point, so one deliberate
 * inversion here reads as emphasis; a second one anywhere else on the page
 * would put the banding back.
 *
 * The plan card and the "what's the catch" answer sit side by side rather than
 * stacked, which halves the block's height and puts the honest paragraph beside
 * the price instead of below the fold from it.
 *
 * @returns The pricing section.
 */
export function PricingSection(): React.JSX.Element {
  return (
    <Section id="pricing" dark>
      <SectionIntro
        eyebrow="Pricing"
        heading="$1 for three months. Then $19.99 a month."
        subhead="One price. No percentage of your sales, ever."
      />

      <div className={styles.layout}>
        <PlanCard />

        <div className={styles.catch}>
          <h3 className={styles.catchTitle}>What&rsquo;s the catch?</h3>
          <p className={styles.catchBody}>
            There isn&rsquo;t a clever one. Here&rsquo;s the plain version: we launched recently,
            we have no customers, and $1 is what it&rsquo;s worth to us to have you actually try
            it instead of reading about it. After three months it&rsquo;s $19.99 a month, the
            price shown before you enter a card. We don&rsquo;t take a percentage of your sales —
            not now, and not as a &ldquo;growth plan&rdquo; later. If it isn&rsquo;t working for
            you, cancel. Your catalog was never ours; it&rsquo;s in ShipStation, where it started.
          </p>
        </div>
      </div>
    </Section>
  );
}

export default PricingSection;
