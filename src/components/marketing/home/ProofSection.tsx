import * as React from 'react';
import Link from 'next/link';
import { Badge, Button, Price, ProductImage } from '@/components/ui';
import type { ShowcaseProduct, ShowcaseStore } from '../data/showcase';
import { ROUTES, storeUrl } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './ProofSection.module.css';

export interface ProofSectionProps {
  /** Real products from the seeded stores, already interleaved. */
  items: Array<{ product: ShowcaseProduct; store: ShowcaseStore }>;
}

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
 * No testimonials, no logos, no counts, no ratings. The evidence is a wide
 * bleed of products that exist in the database and can be opened, plus three
 * cards including the one that tells the reader not to buy.
 *
 * @param props - {@link ProofSectionProps}
 * @returns The proof section.
 */
export function ProofSection({ items }: ProofSectionProps): React.JSX.Element {
  return (
    <section className={styles.root} id="proof">
      <div className={styles.inner}>
        <SectionIntro
          onDark
          eyebrow="No testimonials yet"
          heading="We launched recently. Here’s the evidence instead."
          subhead="You can’t check our references yet, so check the product."
        />
      </div>

      {items.length > 0 ? (
        <div className={styles.bleed}>
          <ul className={styles.grid}>
            {items.map(({ product, store }, index) => (
              <Reveal
                as="li"
                key={`${store.slug}-${product.sku}`}
                delay={Math.min(index, 6) * 0.04}
                className={styles.item}
              >
                <Link
                  href={`${storeUrl(store.slug)}/product/${product.sku}`}
                  className={styles.tile}
                >
                  <ProductImage
                    src={product.image}
                    name={product.name}
                    sku={product.sku}
                    alt=""
                    ratio="1 / 1"
                    rounded="md"
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                    className={styles.tileImage}
                  />
                  <span className={styles.tileBody}>
                    <span className={styles.tileName}>{product.name}</span>
                    <span className={styles.tileMeta}>
                      <Price value={product.price} size="sm" showSavings={false} />
                      {product.stock > 0 ? (
                        <Badge tone="mint" dot size="sm">
                          {product.stock} on hand
                        </Badge>
                      ) : (
                        <Badge tone="rose" dot size="sm">
                          Sold out
                        </Badge>
                      )}
                    </span>
                    <span className={styles.tileStore}>{store.name}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.inner}>
        <ul className={styles.cards}>
          {CARDS.map((card, index) => (
            <Reveal as="li" key={card.title} delay={index * 0.08} className={styles.cardItem}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardBody}>{card.body}</p>
                <Button as={Link} href={card.href} variant="secondary" size="md">
                  {card.cta}
                </Button>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default ProofSection;
