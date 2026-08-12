import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import type { ShowcaseStore } from '../data/showcase';
import { ROUTES, storeUrl } from '../data/routes';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './MakeItYours.module.css';

export interface MakeItYoursProps {
  /** The seeded demo stores, each running a different colour theme. */
  stores: ShowcaseStore[];
}

/**
 * Copy deck §3.4 — storefront customization.
 *
 * The visual is three live stores running three genuinely different colour
 * themes, each captioned with the theme it is actually running and linked to
 * the storefront it describes.
 *
 * Gated per §3.4: this section describes colour themes and store content
 * fields only. No fonts, radius, density, section reordering or live preview
 * until the customizer in docs/storefront-theme-spec.md ships.
 *
 * @param props - {@link MakeItYoursProps}
 * @returns The customization section.
 */
export function MakeItYours({ stores }: MakeItYoursProps): React.JSX.Element {
  return (
    <Section ruled>
      <div className={styles.head}>
        <SectionIntro
          eyebrow="Make it yours"
          heading="It should look like your brand, not like our template."
          subhead="Set your store name, description and hero copy, pick a color theme, and publish. Your products render in a responsive catalog with search, a cart and a checkout. Every store gets clean URLs and product metadata search engines can read."
        />
        <div className={styles.headActions}>
          <Button as={Link} href={ROUTES.demoStores} variant="secondary" size="lg">
            See a live store
          </Button>
          <p className={styles.microcopy}>Change anything later. Republishing takes a click.</p>
        </div>
      </div>

      <ul className={styles.grid}>
        {stores.map((store) => (
          <li key={store.slug} className={styles.item}>
            <Link href={storeUrl(store.slug)} className={styles.card}>
                <span className={styles.art}>
                  <Image
                    src={store.hero}
                    alt=""
                    width={1600}
                    height={900}
                    className={styles.artImage}
                    sizes="(max-width: 900px) 92vw, 380px"
                  />
                </span>
                <span className={styles.cardBody}>
                  <span className={styles.cardTop}>
                    <span className={styles.storeName}>{store.name}</span>
                    <Badge size="sm" square>
                      {store.theme}
                    </Badge>
                  </span>
                  <span className={styles.storeHero}>{store.heroTitle}</span>
                  <span className={styles.storeMeta}>
                    {store.productCount} products · rebelshops.com/{store.slug}
                  </span>
                </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default MakeItYours;
