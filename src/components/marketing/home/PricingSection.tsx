import * as React from 'react';
import { Reveal } from '../parts/Reveal';
import { SectionIntro } from '../parts/SectionIntro';
import { PlanCard } from '../pricing/PlanCard';
import styles from './PricingSection.module.css';

/**
 * Copy deck §3.10 — the homepage pricing block: one centred card, with the
 * "what's the catch" answer sitting directly beneath it.
 *
 * @returns The pricing section.
 */
export function PricingSection(): React.JSX.Element {
  return (
    <section className={styles.root} id="pricing">
      <div className={styles.inner}>
        <SectionIntro
          centered
          eyebrow="Pricing"
          heading="$1 for three months. Then $19.99 a month."
          subhead="One price. No percentage of your sales, ever."
        />

        <Reveal delay={0.06} className={styles.cardWrap}>
          <PlanCard />
        </Reveal>

        <Reveal delay={0.1} className={styles.catchWrap}>
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
        </Reveal>
      </div>
    </section>
  );
}

export default PricingSection;
