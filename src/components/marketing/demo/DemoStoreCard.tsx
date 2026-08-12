import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge, Button, Price, ProductImage } from '@/components/ui';
import type { ShowcaseStore } from '../data/showcase';
import { storeUrl } from '../data/routes';
import styles from './DemoStoreCard.module.css';

export interface DemoStoreCardProps {
  store: ShowcaseStore;
  /** Loads the hero art eagerly. Use on the first card only. */
  priority?: boolean;
}

/**
 * One demo storefront, presented with its real hero art, its real catalog
 * numbers and three of its actual products — so the reason to click is visible
 * before the click.
 *
 * @param props - {@link DemoStoreCardProps}
 * @returns A demo store card.
 */
export function DemoStoreCard({ store, priority = false }: DemoStoreCardProps): React.JSX.Element {
  const preview = store.products.slice(0, 3);

  return (
    <article className={styles.card}>
      <Link href={storeUrl(store.slug)} className={styles.artLink} tabIndex={-1} aria-hidden="true">
        <Image
          src={store.hero}
          alt=""
          width={1600}
          height={900}
          priority={priority}
          sizes="(max-width: 900px) 92vw, 560px"
          className={styles.art}
        />
      </Link>

      <div className={styles.body}>
        <div className={styles.headRow}>
          <h2 className={styles.name}>
            <Link href={storeUrl(store.slug)} className={styles.nameLink}>
              {store.name}
            </Link>
          </h2>
          <Badge size="sm" square>
            {store.theme}
          </Badge>
        </div>

        <p className={styles.description}>{store.description}</p>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Products</dt>
            <dd>{store.productCount}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Out of stock</dt>
            <dd>{store.outOfStockCount}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Address</dt>
            <dd className={styles.address}>rebelshops.com/{store.slug}</dd>
          </div>
        </dl>

        {preview.length > 0 ? (
          <ul className={styles.preview}>
            {preview.map((product) => (
              <li key={product.sku} className={styles.previewItem}>
                <ProductImage
                  src={product.image}
                  name={product.name}
                  sku={product.sku}
                  alt=""
                  ratio="1 / 1"
                  rounded="sm"
                  sizes="120px"
                  className={styles.previewImage}
                />
                <span className={styles.previewName}>{product.name}</span>
                <Price value={product.price} size="sm" showSavings={false} />
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.actions}>
          <Button href={storeUrl(store.slug)} size="md">
            Open this store
          </Button>
          <span className={styles.note}>Search it, add to cart, walk the checkout.</span>
        </div>
      </div>
    </article>
  );
}

export default DemoStoreCard;
