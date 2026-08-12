import type * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { bool, num, pick, str } from '@/app/store/_lib/settings';

import { ProductMark } from '../product/ProductMark';
import { SectionHeading, StoreBand, StoreContainer, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * Category tiles.
 *
 * Each tile falls back to a representative product photograph when the
 * category has no art of its own, which is the normal case for a shop that was
 * synced from ShipStation rather than merchandised by hand — it is the
 * difference between a grid of real product imagery and a grid of grey boxes.
 *
 * Categories with no purchasable products are already excluded by the query, so
 * a tile never leads to an empty listing.
 *
 * @param props - {@link SectionProps}
 * @returns A grid of category tiles, or null when the shop has no categories
 */
export function CollectionGrid({ section, ctx }: SectionProps) {
  const { settings } = section;
  const { store, categories } = ctx;

  const limit = num(settings, 'limit', 6, 2, 12);
  const shown = categories.slice(0, limit);
  if (shown.length === 0) return null;

  const shape = pick(settings, 'shape', ['square', 'portrait', 'landscape'] as const, 'landscape');
  const showCount = bool(settings, 'showCount', true);
  const columns = num(settings, 'columns', 3, 2, 4);

  const shapeClass = {
    square: styles.tileSquare,
    portrait: styles.tilePortrait,
    landscape: styles.tileLandscape,
  }[shape];

  return (
    <StoreBand tone="surface">
      <StoreContainer>
        <SectionHeading heading={str(settings, 'heading', 'Shop by category')} />
        <div className={styles.tiles} style={{ '--_cols': columns } as React.CSSProperties}>
          {shown.map((category) => {
            const art = category.imageUrl || category.sampleImageUrl;
            return (
              <Link
                key={category.id}
                href={`/store/${store.storeSlug}/products?category=${encodeURIComponent(category.slug)}`}
                className={styles.tile}
              >
                <span className={cx(styles.tileFrame, shapeClass)}>
                  {art ? (
                    <Image
                      src={art}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 100vw, 33vw"
                      aria-hidden="true"
                    />
                  ) : (
                    // A category with no art of its own and no product
                    // photograph to borrow used to leave an empty grey box in
                    // the middle of the grid. The same themed, deterministic
                    // mark the product cards use is derived from the merchant's
                    // own two colours, so the tile still belongs to the shop.
                    <ProductMark name={category.name} sku={category.slug} />
                  )}
                </span>
                <span className={styles.tileBody}>
                  <span className={styles.tileName}>{category.name}</span>
                  {showCount ? (
                    <span className={styles.tileCount}>
                      {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
