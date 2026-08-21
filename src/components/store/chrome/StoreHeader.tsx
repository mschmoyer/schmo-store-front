import Link from 'next/link';
import { IconSearch, IconUser } from '@tabler/icons-react';

import type { CategoryRecord, StoreRecord } from '@/app/store/_lib/types';

import {
  resolveHeaderNav,
  resolveNavHref,
  type ResolvedTheme,
  type StoreNavigation,
} from '@/lib/storefront-theme';

import { StoreContainer, cx, storeUi } from '../ui';
import { CartBadge } from './CartBadge';
import { MobileNav } from './MobileNav';
import styles from './Chrome.module.css';

export interface StoreHeaderProps {
  store: StoreRecord;
  theme: ResolvedTheme;
  categories: CategoryRecord[];
  /**
   * The merchant's menus. An absent header menu means "derive one from the
   * categories" — which is exactly what this component used to hardcode.
   */
  navigation?: StoreNavigation;
}

/**
 * The merchant's storefront header.
 *
 * **This shows the merchant's brand, not ours.** A shopper on someone's shop
 * has no idea what RebelShops is and no reason to care; the platform's only
 * appearance is a quiet credit in the footer.
 *
 * Three layouts come from `header.layout` and are selected in CSS off the
 * wrapper's `data-header` attribute, so switching layout in the customizer is a
 * repaint rather than a different component tree:
 *
 *  - `logo-left` — brand, nav, then actions.
 *  - `logo-center` — nav left, brand centred, actions right.
 *  - `logo-left-nav-below` — brand and actions on row one, nav centred on row two.
 *
 * Search is a plain GET form pointed at the listing page, which means it works
 * before JavaScript loads and produces a shareable URL.
 *
 * @param props - {@link StoreHeaderProps}
 * @returns The storefront header
 */
export function StoreHeader({ store, theme, categories, navigation }: StoreHeaderProps) {
  const base = `/store/${store.storeSlug}`;

  // The merchant's menu when they have set one, otherwise the derived default.
  // Stored hrefs are store-relative (`/pages/about`) so they survive the shop
  // moving to a custom domain; `resolveNavHref` mounts them and collapses
  // anything unsafe rather than emitting it.
  const items = resolveHeaderNav(navigation, categories).map((item) => ({
    label: item.label,
    href: resolveNavHref(store.storeSlug, item.href),
  }));
  const searchAction = `${base}/products`;
  const navBelow = theme.header.layout === 'logo-left-nav-below';

  const brand = (
    <Link href={base} className={styles.brand}>
      {store.logoUrl ? (
        // A merchant logo is an arbitrary asset of unknown intrinsic size, so
        // `next/image` would need dimensions we simply do not have.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={store.logoUrl} alt={store.storeName} className={styles.brandLogo} />
      ) : null}
      <span className={styles.brandName}>{store.storeName}</span>
    </Link>
  );

  const nav = (
    <nav className={navBelow ? styles.navRow : styles.nav} aria-label="Store">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={styles.navLink}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <header className={cx(styles.header, theme.header.sticky && styles.headerSticky)}>
      <StoreContainer>
        <div className={styles.bar}>
          {brand}
          {navBelow ? null : nav}

          <div className={styles.actions}>
            <form action={searchAction} role="search" className={styles.searchForm}>
              <span className={styles.searchIcon}>
                <IconSearch size={17} aria-hidden="true" />
              </span>
              <label htmlFor="store-search" className={storeUi.srOnly}>
                Search products
              </label>
              <input
                id="store-search"
                className={styles.searchInput}
                type="search"
                name="q"
                placeholder="Search products"
              />
            </form>

            <Link href={`${base}/account`} className={styles.iconButton} aria-label="Account">
              <IconUser size={22} aria-hidden="true" />
            </Link>

            <CartBadge href={`${base}/cart`} />

            <MobileNav storeName={store.storeName} items={items} searchAction={searchAction} />
          </div>
        </div>
      </StoreContainer>

      {navBelow ? <StoreContainer>{nav}</StoreContainer> : null}
    </header>
  );
}
