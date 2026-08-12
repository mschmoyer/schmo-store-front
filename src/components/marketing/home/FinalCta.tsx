import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import styles from './FinalCta.module.css';

/**
 * Copy deck §3.12 — the closing offer. Ink ground, ember primary, no image.
 * The page ends on the offer, not on decoration.
 *
 * @returns The final call to action.
 */
export function FinalCta(): React.JSX.Element {
  return (
    <section className={styles.root}>
      <div className={styles.inner}>
        <Reveal>
          <h2 className={styles.heading}>Your catalog is already sitting there.</h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className={styles.subhead}>
            Connect ShipStation, see your products in a real store, and decide in twenty minutes.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className={styles.actions}>
            <Button as={Link} href={ROUTES.signUp} size="lg">
              Start for $1
            </Button>
            <Button as={Link} href={ROUTES.demoStores} variant="secondary" size="lg">
              Open a demo store
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.14}>
          <p className={styles.microcopy}>
            $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default FinalCta;
