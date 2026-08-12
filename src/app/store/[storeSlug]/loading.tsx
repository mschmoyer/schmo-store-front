import { ProductGridSkeleton } from '@/components/store/states/Skeletons';
import styles from '@/components/store/states/States.module.css';

/**
 * The storefront loading state.
 *
 * Deliberately unthemed in its colours: the theme has not been resolved yet at
 * this point in the render, so the skeleton falls back to RebelShops' neutral
 * surfaces rather than guessing at the merchant's palette and flashing the
 * wrong one. What it *does* match is the geometry — the same grid, the same
 * card proportions — so the finished page does not jump when it arrives.
 *
 * @returns A skeleton of the store page
 */
export default function StoreLoading() {
  return (
    <div style={{ padding: '48px 24px', maxWidth: 1240, margin: '0 auto' }}>
      <div
        className={`${styles.shimmer} ${styles.skelHero}`}
        style={{ marginBottom: 48 }}
        aria-hidden="true"
      />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
