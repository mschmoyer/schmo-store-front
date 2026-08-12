import * as React from 'react';
import { Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Section } from '../parts/Section';
import styles from './FinalCta.module.css';

/**
 * Copy deck §3.12 — the closing offer. The page ends on the offer, not on
 * decoration: no image, no second dark block, no centred column.
 *
 * @returns The final call to action.
 */
export function FinalCta(): React.JSX.Element {
  return (
    <Section ruled innerClassName={styles.inner}>
      <h2 className={styles.heading}>Your catalog is already sitting there.</h2>
      <p className={styles.subhead}>
        Connect ShipStation, see your products in a real store, and decide in twenty minutes.
      </p>
      <div className={styles.actions}>
        <Button href={ROUTES.signUp} size="lg">
          Start for $1
        </Button>
        <Button href={ROUTES.demoStores} variant="link" size="lg">
          Open a demo store
        </Button>
      </div>
      <p className={styles.microcopy}>
        $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime.
      </p>
    </Section>
  );
}

export default FinalCta;
