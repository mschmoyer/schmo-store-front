import type * as React from 'react';
import { IconMoodSearch, IconPackages, IconShoppingBag } from '@tabler/icons-react';

import { StoreLinkButton } from '../ui';
import styles from './States.module.css';

/**
 * The shell every in-storefront empty state shares. Themed, unlike
 * {@link StoreUnavailable}, because these render inside a real shop.
 *
 * @param props.icon - A decorative glyph
 * @param props.title - The headline
 * @param props.children - Explanation and any actions
 * @returns A dashed empty panel
 */
function EmptyShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children}
    </div>
  );
}

/**
 * Shown when a search or filter matched nothing.
 *
 * Names the query back to the shopper — "no results" without saying what was
 * searched for leaves them unsure whether the search even ran — and offers the
 * one action that always works: clear the filters.
 *
 * @param props.query - What the shopper searched for
 * @param props.resetHref - A link back to the unfiltered listing
 * @returns An empty-results panel
 */
export function NoResults({ query, resetHref }: { query: string; resetHref: string }) {
  return (
    <EmptyShell icon={<IconMoodSearch size={26} />} title="Nothing matched">
      <p className={styles.emptyBody}>
        {query
          ? `We could not find anything for “${query}”. Try a shorter search, or a different spelling.`
          : 'No products match these filters.'}
      </p>
      <StoreLinkButton href={resetHref} variant="secondary">
        Clear filters
      </StoreLinkButton>
    </EmptyShell>
  );
}

/**
 * Shown when the shop itself has no products.
 *
 * The audience here is the *merchant*, not the shopper: an empty shop almost
 * always means the owner is looking at their own storefront wondering why it is
 * blank. So it says exactly how to fix it rather than apologising vaguely.
 *
 * @returns An empty-catalogue panel
 */
export function EmptyCatalogue() {
  return (
    <EmptyShell icon={<IconPackages size={26} />} title="No products yet">
      <p className={styles.emptyBody}>
        This shop has not published anything for sale. If it is yours, here is how to fill it:
      </p>
      <ol className={styles.steps}>
        <li>Open your dashboard and go to Products.</li>
        <li>Add a product by hand, or run a ShipStation sync to import your catalogue.</li>
        <li>Make sure each product is marked active — inactive products stay hidden here.</li>
      </ol>
      <StoreLinkButton href="/admin/products" variant="secondary">
        Manage products
      </StoreLinkButton>
    </EmptyShell>
  );
}

/**
 * Shown when the cart has nothing in it.
 * @param props.shopHref - A link into the catalogue
 * @returns An empty-cart panel
 */
export function EmptyCart({ shopHref }: { shopHref: string }) {
  return (
    <EmptyShell icon={<IconShoppingBag size={26} />} title="Your cart is empty">
      <p className={styles.emptyBody}>
        Nothing here yet. Once you add something it will stay in your cart while you keep browsing.
      </p>
      <StoreLinkButton href={shopHref}>Start shopping</StoreLinkButton>
    </EmptyShell>
  );
}
