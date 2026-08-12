import { cx } from '../ui';
import styles from './States.module.css';

/**
 * Loading placeholders whose geometry matches the real components.
 *
 * Each skeleton reuses the same tokens the finished component does — the card
 * placeholder is `--st-ratio-product` tall and `--st-radius-image` round, the
 * grid uses the same 260px floor — so content arriving does not shift the page.
 * A skeleton that is the wrong shape causes exactly the layout jump it was
 * supposed to prevent.
 */

/**
 * A single shimmering block.
 * @param props.className - Shape classes
 * @returns A placeholder block
 */
function Shimmer({ className }: { className?: string }) {
  return <span className={cx(styles.shimmer, className)} aria-hidden="true" />;
}

/**
 * A placeholder matching one product card.
 * @returns A card skeleton
 */
export function ProductCardSkeleton() {
  return (
    <div className={styles.skelCard}>
      <Shimmer className={styles.skelImage} />
      <Shimmer className={cx(styles.skelLine, styles.skelLineMedium)} />
      <Shimmer className={cx(styles.skelLine, styles.skelLineShort)} />
    </div>
  );
}

/**
 * A placeholder grid.
 * @param props.count - How many cards to draw. @default 8
 * @returns A grid skeleton
 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.skeletonGrid} role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * A placeholder for the hero band.
 * @returns A hero skeleton
 */
export function HeroSkeleton() {
  return <Shimmer className={styles.skelHero} />;
}
