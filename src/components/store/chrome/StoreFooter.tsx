import Link from 'next/link';

import type { CategoryRecord, StoreRecord } from '@/app/store/_lib/types';
import type { ResolvedTheme } from '@/lib/storefront-theme';

import { NewsletterForm } from '../sections/NewsletterForm';
import { StoreContainer, cx } from '../ui';
import styles from './Chrome.module.css';

export interface StoreFooterProps {
  store: StoreRecord;
  theme: ResolvedTheme;
  categories: CategoryRecord[];
}

/**
 * The merchant's footer, in the layout their theme asks for.
 *
 * `columns` gives the shop a real sitemap — brand blurb, catalogue links,
 * policies, and optionally the newsletter. `minimal` collapses to a centred
 * single stack for themes whose whole point is restraint.
 *
 * The RebelShops credit is the one place the platform is named on a merchant's
 * storefront, and it is deliberately quiet: muted, small, and below the
 * merchant's own copyright.
 *
 * @param props - {@link StoreFooterProps}
 * @returns The storefront footer
 */
export function StoreFooter({ store, theme, categories }: StoreFooterProps) {
  const base = `/store/${store.storeSlug}`;
  const year = new Date().getFullYear();
  const minimal = theme.footer.layout === 'minimal';

  const credit = (
    <span>
      <Link href="/" className={styles.poweredBy}>
        Powered by RebelShops
      </Link>
    </span>
  );

  const copyright = (
    <span>
      © {year} {store.storeName}
    </span>
  );

  if (minimal) {
    return (
      <footer className={styles.footer}>
        <StoreContainer>
          <div className={styles.footerMinimal}>
            <span className={styles.brandName}>{store.storeName}</span>
            {store.storeDescription ? (
              <p className={cx(styles.footerLink)}>{store.storeDescription}</p>
            ) : null}
            {theme.footer.showNewsletter ? (
              <NewsletterForm
                buttonLabel="Subscribe"
                placeholder="you@example.com"
                consentText="Unsubscribe any time."
                className={styles.footerNewsletter}
              />
            ) : null}
            <nav className={styles.footerNewsletter} aria-label="Footer">
              <Link href={`${base}/products`} className={styles.footerLink}>
                Shop all
              </Link>
              <Link href={`${base}/cart`} className={styles.footerLink}>
                Cart
              </Link>
              <Link href={`/blog/${store.storeSlug}`} className={styles.footerLink}>
                Journal
              </Link>
            </nav>
            <div className={styles.footerBottom}>
              {copyright}
              {credit}
            </div>
          </div>
        </StoreContainer>
      </footer>
    );
  }

  return (
    <footer className={styles.footer}>
      <StoreContainer>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <span className={styles.brandName}>{store.storeName}</span>
            {store.storeDescription ? (
              <p className={styles.footerLink}>{store.storeDescription}</p>
            ) : null}
          </div>

          <div className={styles.footerCol}>
            <h2 className={styles.footerHeading}>Shop</h2>
            <Link href={`${base}/products`} className={styles.footerLink}>
              All products
            </Link>
            {categories.slice(0, 4).map((category) => (
              <Link
                key={category.id}
                href={`${base}/products?category=${encodeURIComponent(category.slug)}`}
                className={styles.footerLink}
              >
                {category.name}
              </Link>
            ))}
          </div>

          <div className={styles.footerCol}>
            <h2 className={styles.footerHeading}>Your order</h2>
            <Link href={`${base}/cart`} className={styles.footerLink}>
              Cart
            </Link>
            <Link href={`${base}/account`} className={styles.footerLink}>
              Account
            </Link>
            <Link href={`/blog/${store.storeSlug}`} className={styles.footerLink}>
              Journal
            </Link>
          </div>

          {theme.footer.showNewsletter ? (
            <div className={styles.footerCol}>
              <h2 className={styles.footerHeading}>Stay in touch</h2>
              <NewsletterForm
                buttonLabel="Subscribe"
                placeholder="you@example.com"
                consentText="Unsubscribe any time."
                className={styles.footerNewsletter}
              />
            </div>
          ) : null}
        </div>

        <div className={styles.footerBottom}>
          {copyright}
          {credit}
        </div>
      </StoreContainer>
    </footer>
  );
}
