'use client';

import * as React from 'react';

import type { ProductOption, ResolvedVariant } from '@/lib/catalog/variants';

import { ProductGallery } from './ProductGallery';
import { VariantPurchasePanel } from './VariantPurchasePanel';
import styles from './ProductDetail.module.css';

export interface ProductMediaProps {
  /** Product-level gallery images, already sanitised for rendering. */
  images: string[];
  productName: string;
  sku: string;
  productId: string;
  options: ProductOption[];
  variants: ResolvedVariant[];
  currency: string;
  cartHref: string;
  /**
   * The buy column's server-rendered pieces above the purchase panel — the
   * title block and short description. Passed as a node so they stay rendered
   * on the server; only the panel and the gallery need to be interactive.
   */
  header: React.ReactNode;
  /** The buy column's server-rendered pieces below the panel — facts, details. */
  footer: React.ReactNode;
}

/**
 * The gallery and the purchase panel of an optioned product, wired together.
 *
 * The two are siblings in the product layout — the gallery on the left, the buy
 * column on the right — but they must share one piece of state: which variant
 * the shopper has selected, so the gallery can show that variant's photograph.
 * A server component cannot hold that state, so this thin client component owns
 * it and threads the selected image from the panel to the gallery. Everything
 * that does not depend on the selection — the title, the description, the
 * shipping facts — is handed in as server-rendered nodes and passed straight
 * through, so the page keeps rendering that content on the server.
 *
 * The variant image is prepended to the gallery when it is not already one of
 * the product images, so a variant photograph that lives only on the variant
 * still has a stage to appear on.
 *
 * @param props - {@link ProductMediaProps}
 * @returns The product's media and purchase area
 */
export function ProductMedia({
  images,
  productName,
  sku,
  productId,
  options,
  variants,
  currency,
  cartHref,
  header,
  footer,
}: ProductMediaProps) {
  const [variantImage, setVariantImage] = React.useState<string | null>(null);

  const galleryImages = React.useMemo(() => {
    if (variantImage && !images.includes(variantImage)) return [variantImage, ...images];
    return images;
  }, [variantImage, images]);

  return (
    <div className={styles.layout}>
      <ProductGallery
        images={galleryImages}
        name={productName}
        sku={sku}
        activeSrc={variantImage}
      />

      <div className={styles.buy}>
        {header}
        <VariantPurchasePanel
          productId={productId}
          productName={productName}
          options={options}
          variants={variants}
          currency={currency}
          cartHref={cartHref}
          onVariantImage={setVariantImage}
        />
        {footer}
      </div>
    </div>
  );
}
