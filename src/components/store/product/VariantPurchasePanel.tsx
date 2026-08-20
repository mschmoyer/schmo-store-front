'use client';

import * as React from 'react';

import {
  defaultVariant,
  findVariant,
  type ProductOption,
  type ResolvedVariant,
} from '@/lib/catalog/variants';

import { StockIndicator, StorePrice } from '../ui';
import { BuyBox } from './BuyBox';
import { VariantSelector } from './VariantSelector';
import styles from './ProductDetail.module.css';

export interface VariantPurchasePanelProps {
  productId: string;
  productName: string;
  options: ProductOption[];
  variants: ResolvedVariant[];
  currency: string;
  cartHref: string;
  /** Notified when the chosen variant carries its own photograph. */
  onVariantImage?: (imageUrl: string | null) => void;
}

/**
 * Price, stock, option selector and add-to-cart for a product that has options.
 *
 * This is a client component because the price and the stock line have to
 * change as the shopper picks — a selector that does not move the price is
 * asking them to guess what they are about to be charged.
 *
 * The panel holds the selection and derives everything else from it, so there
 * is one source of truth on the page. It deliberately does **not** hold a copy
 * of the price: the price is read off the resolved variant, which came from the
 * same `resolveVariant` the checkout re-prices with, so what the shopper sees
 * and what they are charged cannot drift.
 *
 * A product with no options never renders this — the page keeps its original
 * server-rendered markup, which stays fully functional without JavaScript.
 *
 * @param props - {@link VariantPurchasePanelProps}
 * @returns The purchase panel
 */
export function VariantPurchasePanel({
  productId,
  productName,
  options,
  variants,
  currency,
  cartHref,
  onVariantImage,
}: VariantPurchasePanelProps) {
  const axisCount = options.length;

  // Open on something sellable rather than on whatever sorted first — see
  // `defaultVariant`. Computed once: re-deriving it when `variants` changes
  // identity would fight the shopper's own selection.
  const initial = React.useMemo(() => {
    const opening = defaultVariant(variants);
    return opening ? [...opening.options] : (Array(axisCount).fill(null) as (string | null)[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selection, setSelection] = React.useState<(string | null)[]>(initial);

  const selected = React.useMemo(
    () => findVariant(variants, selection, axisCount),
    [variants, selection, axisCount],
  );

  // Tell the gallery when the chosen variant has its own photograph, so picking
  // a colour changes the picture.
  const lastImage = React.useRef<string | null>(null);
  React.useEffect(() => {
    const next = selected?.imageUrl ?? null;
    if (next === lastImage.current) return;
    lastImage.current = next;
    onVariantImage?.(next);
  }, [selected, onVariantImage]);

  // No variant matches the current selection: the shopper has picked a
  // combination this shop does not stock. The price line would be a guess, so
  // it says so instead.
  const incomplete = selected === null;
  const purchasable = Boolean(selected?.inStock);

  return (
    <>
      <div className={styles.priceRow}>
        {selected ? (
          <StorePrice
            value={selected.priceCents / 100}
            compareAt={selected.compareAtCents === null ? null : selected.compareAtCents / 100}
            currency={currency}
            size="lg"
          />
        ) : (
          <span className={styles.priceUnset}>Select an option to see the price</span>
        )}

        {selected ? (
          <StockIndicator
            state={
              selected.stockQuantity === null
                ? 'untracked'
                : selected.inStock
                  ? selected.stockQuantity <= 5
                    ? 'low-stock'
                    : 'in-stock'
                  : 'out-of-stock'
            }
            quantity={selected.stockQuantity ?? 0}
          />
        ) : null}
      </div>

      <VariantSelector
        options={options}
        variants={variants}
        selection={selection}
        onChange={setSelection}
      />

      <BuyBox
        productId={productId}
        productName={productName}
        variantId={selected?.id ?? null}
        variantTitle={selected?.title ?? null}
        maxQuantity={selected?.stockQuantity ?? 99}
        disabled={!purchasable}
        cartHref={cartHref}
        disabledLabel={incomplete ? 'Unavailable' : 'Out of stock'}
      />
    </>
  );
}
