import type * as React from 'react';

import type { ProductRecord } from '@/app/store/_lib/types';
import type { ResolvedTheme } from '@/lib/storefront-theme';

import { cx } from '../ui';
import { ProductCard } from './ProductCard';
import styles from './ProductCard.module.css';

export interface ProductGridProps {
  products: ProductRecord[];
  storeSlug: string;
  currency: string;
  card: ResolvedTheme['productCard'];
  /** Preferred desktop column count. The grid still reflows below its floor. */
  columns?: number;
  /** Tighter tiles, for dense presets and related-product rails. */
  compact?: boolean;
  /** Draw each tile as a bordered container. @default true */
  boxed?: boolean;
  /** How many leading images opt out of lazy loading. @default 4 */
  priorityCount?: number;
  className?: string;
}

/**
 * A responsive grid of product tiles.
 *
 * The column count is a *preference*, not a lock: the underlying track sizing
 * keeps a 260px floor, so the same grid that shows four across on a desktop
 * shows two on a tablet and one on a phone without a single media query, and
 * never produces the single narrow column this page used to render.
 *
 * @param props - {@link ProductGridProps}
 * @returns A grid of product cards, or null when there is nothing to show
 */
export function ProductGrid({
  products,
  storeSlug,
  currency,
  card,
  columns = 4,
  compact = false,
  boxed = true,
  priorityCount = 4,
  className,
}: ProductGridProps) {
  if (products.length === 0) return null;

  const cols = Math.min(Math.max(Math.round(columns) || 4, 2), 6);

  return (
    <div
      className={cx(styles.grid, compact && styles.gridCompact, className)}
      style={{ '--_cols': cols } as React.CSSProperties}
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          storeSlug={storeSlug}
          currency={currency}
          card={card}
          boxed={boxed}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
