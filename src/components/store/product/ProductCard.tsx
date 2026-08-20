import Image from 'next/image';
import Link from 'next/link';

import { productHref, stockState } from '@/app/store/_lib/present';
import type { ProductRecord } from '@/app/store/_lib/types';
import type { ResolvedTheme } from '@/lib/storefront-theme';

import { Pill, StockIndicator, StorePrice, cx } from '../ui';
import { AddToCartButton } from './AddToCartButton';
import { ProductMark } from './ProductMark';
import styles from './ProductCard.module.css';

export interface ProductCardProps {
  product: ProductRecord;
  storeSlug: string;
  currency: string;
  /** The resolved theme's `productCard` block. */
  card: ResolvedTheme['productCard'];
  /** Set on the first row so the LCP image is not lazy. */
  priority?: boolean;
  /** Draw the card as a bordered/elevated container. @default true */
  boxed?: boolean;
}

/**
 * One product tile.
 *
 * Every visual decision here is the merchant's, read from `productCard`:
 * the image ratio (`--st-ratio-product`), how the photograph fits, whether the
 * text is left or centre aligned, whether a vendor line shows, whether hovering
 * lifts / zooms / swaps to a second image, and whether quick-add appears.
 *
 * Availability is a dot **and** a word, never colour alone, and the compare-at
 * price is only rendered when the query layer reports a genuine saving.
 *
 * The whole tile is clickable via a stretched pseudo-element on the product
 * name, which keeps exactly one link in the accessibility tree rather than
 * wrapping an interactive quick-add button inside an anchor.
 *
 * @param props - {@link ProductCardProps}
 * @returns A product tile
 */
export function ProductCard({
  product,
  storeSlug,
  currency,
  card,
  priority = false,
  boxed = true,
}: ProductCardProps) {
  const href = productHref(storeSlug, product);
  const state = stockState(product);
  const soldOut = state === 'out-of-stock';

  // `swap` needs a genuine second photograph; without one the effect is a
  // cross-fade to nothing, so it simply does not apply.
  const swapSrc =
    card.hoverEffect === 'swap'
      ? product.galleryImages.find((url) => url && url !== product.featuredImageUrl)
      : undefined;

  const discounted = product.compareAtPrice !== null;

  return (
    <article className={cx(styles.card, boxed && styles.cardBoxed, soldOut && styles.cardSoldOut)}>
      <div className={styles.media}>
        <div className={styles.flags}>
          {discounted ? <Pill brand>Sale</Pill> : null}
          {soldOut ? <Pill>Sold out</Pill> : null}
        </div>

        <div className={styles.mediaInner}>
          {product.featuredImageUrl ? (
            <Image
              src={product.featuredImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 90vw, (max-width: 1100px) 45vw, 300px"
              priority={priority}
              className={styles.image}
            />
          ) : (
            // No photograph: a mark generated from the merchant's own palette,
            // never a grey "no image" box.
            <ProductMark name={product.name} sku={product.sku} />
          )}

          {swapSrc ? (
            <Image
              src={swapSrc}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 640px) 90vw, (max-width: 1100px) 45vw, 300px"
              className={styles.imageAlt}
            />
          ) : null}
        </div>

        {card.showQuickAdd && !soldOut ? (
          <div className={styles.quickAdd}>
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              size="sm"
              block
              label="Quick add"
              hideIcon
            />
          </div>
        ) : null}
      </div>

      <div className={styles.body}>
        {card.showVendor && product.categoryName ? (
          <span className={styles.vendor}>{product.categoryName}</span>
        ) : null}

        <h3 className={styles.name}>
          <Link href={href} className={styles.nameLink}>
            {product.name}
          </Link>
        </h3>

        <div className={styles.meta}>
          <StorePrice
            value={product.price}
            compareAt={product.compareAtPrice}
            currency={currency}
          />
          <StockIndicator state={state} quantity={product.stockQuantity} />
        </div>
      </div>
    </article>
  );
}
