import * as React from 'react';
import { Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Rail } from '../parts/Rail';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './ProofSection.module.css';

interface ProofCard {
  title: string;
  body: string;
  cta: string;
  href: string;
}

/**
 * The honest substitutes for proof, per copy deck §3.9.
 *
 * The deck's second card — "What's built and what isn't", linking to a public
 * build log — is deliberately absent: that page does not exist, and §3.9
 * requires the card to be cut rather than pointed at a stub.
 */
const CARDS: readonly ProofCard[] = [
  {
    title: 'Live stores you can actually use',
    body: 'Browse a real RebelShops store, search it, add to cart, and walk the checkout. It’s the same code your store runs on.',
    cta: 'Open a demo store',
    href: ROUTES.demoStores,
  },
  {
    title: 'Nothing to lose',
    body: 'Month to month. No contract. Cancel in the admin. Your ShipStation account is untouched, because it’s the source of truth and we only ever read from it.',
    cta: 'See pricing',
    href: ROUTES.pricing,
  },
  {
    title: 'Who we’re not for',
    body: 'If you don’t ship through ShipStation, or you need multi-currency, subscriptions, or a wholesale portal, we’re the wrong tool. We’d rather you find that out here than in month two.',
    cta: 'Read the FAQ',
    href: ROUTES.faq,
  },
];

/**
 * Copy deck §3.9 — proof, with zero customers.
 *
 * No testimonials, no logos, no counts, no ratings — just three cards,
 * including the one that tells the reader not to buy.
 *
 * There used to be a wall of twelve product tiles above these cards. Twelve
 * photographs of a yoga mat and a kettlebell from three seeded demo stores are
 * not evidence that the software works, and under a heading reading "Here's the
 * evidence instead" they actively undercut it. The three text cards are the
 * evidence. The tiles also carried the section's internal 120px alignment jog,
 * which went with them.
 *
 * @returns The proof section.
 */
export function ProofSection(): React.JSX.Element {
  return (
    <Section id="proof" ruled>
      <SectionIntro
        eyebrow="No testimonials yet"
        heading="We launched recently. Here’s the evidence instead."
        subhead="You can’t check our references yet, so check the product."
      />

      {/*
        A rail, not a stack. Three peer cards each ~230px tall were 700px of
        phone scroll for an argument that is read once; side by side in a snap
        rail they are 250px and the reader can see there are three of them.
      */}
      <Rail label="Evidence instead of testimonials" className={styles.cards}>
        {CARDS.map((card) => (
          <div key={card.title} className={styles.card}>
            <h3 className={styles.cardTitle}>{card.title}</h3>
            <p className={styles.cardBody}>{card.body}</p>
            <Button href={card.href} variant="link" size="md">
              {card.cta}
              <span aria-hidden="true"> →</span>
            </Button>
          </div>
        ))}
      </Rail>
    </Section>
  );
}

export default ProofSection;
