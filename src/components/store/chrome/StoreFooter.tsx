import Link from 'next/link';

import type { CategoryRecord, StoreRecord } from '@/app/store/_lib/types';
import type { ResolvedTheme } from '@/lib/storefront-theme';

import { NewsletterForm } from '../sections/NewsletterForm';
import { StoreContainer, cx } from '../ui';
import styles from './Chrome.module.css';
import { resolveFooterNav, resolveNavHref, type StoreNavigation } from '@/lib/storefront-theme';

export interface StoreFooterProps {
  store: StoreRecord;
  theme: ResolvedTheme;
  categories: CategoryRecord[];
  /** The merchant's menus. An absent footer menu is derived from `categories`. */
  navigation?: StoreNavigation;
  /** Published custom pages, listed so policy pages are reachable from every page. */
  pages?: { slug: string; title: string }[];
  /**
   * Suppress the footer's newsletter because the page body already has one.
   * Two identical email forms a hundred pixels apart reads as a bug, and the
   * merchant enabled both without ever seeing them stacked.
   */
  suppressNewsletter?: boolean;
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
export function StoreFooter({
  store,
  theme,
  categories,
  navigation,
  pages = [],
  suppressNewsletter = false,
}: StoreFooterProps) {
  const base = `/store/${store.storeSlug}`;

  // The merchant's footer menu when they have set one, otherwise the derived
  // category list — which is what this column has always been. It deliberately
  // does *not* fall back to the header menu: a header built around external
  // links would put Instagram where a category index belongs.
  const shopLinks = [
    { label: 'All products', href: `${base}/products` },
    ...resolveFooterNav(navigation, categories).map((item) => ({
      label: item.label,
      href: resolveNavHref(store.storeSlug, item.href),
    })),
  ].filter(
    // "Shop all" is already rendered above as "All products"; the derived menu
    // leads with it, and two links to the same page reads as a mistake.
    (item, index, all) => all.findIndex((other) => other.href === item.href) === index,
  );
  const year = new Date().getFullYear();
  const minimal = theme.footer.layout === 'minimal';
  const showNewsletter = theme.footer.showNewsletter && !suppressNewsletter;

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
            {showNewsletter ? (
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
              {/*
                Policy pages belong in the minimal footer too. Listing them only
                in the columns layout meant a merchant on a minimal footer had
                no route to their own returns policy at all -- which is the
                problem this list exists to solve, so the layout must not be
                what decides whether it is solved.
              */}
              {pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`${base}/pages/${page.slug}`}
                  className={styles.footerLink}
                >
                  {page.title}
                </Link>
              ))}
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
            {shopLinks.map((item) => (
              <Link key={item.href} href={item.href} className={styles.footerLink}>
                {item.label}
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

          {/*
            Published pages, listed here rather than left to the merchant to
            remember. A shop's returns policy is the page a shopper looks for
            in the footer, and Stripe asks for the URL during Connect
            onboarding — an unlinked page satisfies neither.
          */}
          {pages.length > 0 ? (
            <div className={styles.footerCol}>
              <h2 className={styles.footerHeading}>Information</h2>
              {pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`${base}/pages/${page.slug}`}
                  className={styles.footerLink}
                >
                  {page.title}
                </Link>
              ))}
            </div>
          ) : null}

          {showNewsletter ? (
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
