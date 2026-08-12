import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import type { ShowcaseProduct, ShowcaseStore } from '../data/showcase';
import { ROUTES } from '../data/routes';
import { Section } from '../parts/Section';
import { HeroTransform } from './HeroTransform';
import styles from './Hero.module.css';

export interface HeroProps {
  /** The store the hero visual is built from, when one could be loaded. */
  store: ShowcaseStore | null;
  /** Rows for the ShipStation-style panel. */
  rows: ShowcaseProduct[];
  /** The product that becomes the storefront card. */
  focus: ShowcaseProduct | null;
}

/**
 * Homepage hero — copy deck §3.1.
 *
 * Text sits left on the page ground; the two-panel transform sits right and is
 * built from live demo-store rows. When the database is unreachable the visual
 * is omitted and the copy takes the full measure rather than rendering a
 * placeholder.
 *
 * @param props - {@link HeroProps}
 * @returns The hero section.
 */
export function Hero({ store, rows, focus }: HeroProps): React.JSX.Element {
  const hasVisual = Boolean(store && focus && rows.length > 0);

  return (
    <Section className={hasVisual ? undefined : styles.textOnly}>
      <div className={styles.copy}>
        <div className={styles.lead}>
          <Eyebrow rule>For ShipStation sellers</Eyebrow>
          <h1 className={styles.headline}>Your ShipStation catalog, now a storefront.</h1>
        </div>

        <div className={styles.support}>
          <p className={styles.subhead}>
            Connect your ShipStation account and RebelShops builds a real online store from the
            products, SKUs and stock levels already in it. Payments through your Stripe account.
            Orders come back to ShipStation.
          </p>

          <div className={styles.actions}>
            <Button as={Link} href={ROUTES.signUp} size="lg">
              Start for $1
            </Button>
            <Button as={Link} href={ROUTES.demoStores} variant="secondary" size="lg">
              See a live store
            </Button>
          </div>

          <p className={styles.microcopy}>
            $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime.
          </p>
        </div>
      </div>

      {hasVisual && store && focus ? (
        <div className={styles.visual}>
          <HeroTransform store={store} rows={rows} focus={focus} />
        </div>
      ) : null}
    </Section>
  );
}

export default Hero;
