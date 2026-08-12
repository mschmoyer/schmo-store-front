import type * as React from 'react';

import styles from './ProductCard.module.css';

export interface ProductMarkProps {
  name: string;
  sku?: string;
  /** Rendered larger on a product detail page than on a card. */
  size?: 'card' | 'detail';
}

/**
 * A deterministic, *themed* stand-in for a missing product photograph.
 *
 * The shared `ProductImage` primitive has a generated mark of its own, but two
 * things rule it out here: it is a client component (so a server-rendered card
 * cannot call its helper), and its palette comes from RebelShops' own design
 * tokens — which would stamp our brand colours into the middle of a merchant's
 * grid.
 *
 * This version derives everything from the merchant's theme instead. The tile
 * is a mix of their brand colour and their sunken surface, the proportion and
 * angle are seeded from the SKU so the same product always looks the same on
 * the server and in the browser, and the initials are set in their heading
 * face. The result belongs to the shop, and it is never a grey "No image"
 * rectangle.
 *
 * @param props - {@link ProductMarkProps}
 * @returns A generated product tile
 */
export function ProductMark({ name, sku, size = 'card' }: ProductMarkProps) {
  const seed = (sku || name || 'product').toLowerCase();

  // A small stable hash. Not cryptographic — it only has to be identical on
  // both sides of hydration.
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const tintPercent = 8 + (hash % 5) * 4; // 8–24% brand in the ground
  const angle = 120 + ((hash >>> 5) % 8) * 30;
  const glowX = 22 + ((hash >>> 9) % 4) * 18;
  const glowY = 18 + ((hash >>> 13) % 4) * 16;

  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '??';

  return (
    <span
      className={styles.mark}
      role="img"
      aria-label={`${name} — no product image`}
      style={
        {
          '--_mark-angle': `${angle}deg`,
          '--_mark-tint': `${tintPercent}%`,
          '--_mark-glow-x': `${glowX}%`,
          '--_mark-glow-y': `${glowY}%`,
          '--_mark-size': size === 'detail' ? 'var(--st-h1)' : 'var(--st-h2)',
        } as React.CSSProperties
      }
    >
      <span className={styles.markInitials} aria-hidden="true">
        {initials}
      </span>
      {sku ? (
        <span className={styles.markSku} aria-hidden="true">
          {sku}
        </span>
      ) : null}
    </span>
  );
}
