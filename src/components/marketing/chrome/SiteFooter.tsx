import * as React from 'react';
import Link from 'next/link';
import { ROUTES, storeUrl } from '../data/routes';
import { Wordmark } from './Wordmark';
import styles from './SiteFooter.module.css';

interface FooterColumn {
  heading: string;
  links: ReadonlyArray<{ href: string; label: string; external?: boolean }>;
}

/**
 * Only routes that exist today. `/about`, `/contact`, `/changelog` and a status
 * page are deliberately absent — the copy deck forbids linking to a stub.
 */
const COLUMNS: readonly FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { href: ROUTES.features, label: 'Features' },
      { href: ROUTES.howItWorks, label: 'How it works' },
      { href: ROUTES.pricing, label: 'Pricing' },
      { href: ROUTES.comparison, label: 'Cost vs. Shopify Basic' },
      { href: ROUTES.faq, label: 'FAQ' },
    ],
  },
  {
    heading: 'Demo stores',
    links: [
      { href: ROUTES.demoStores, label: 'All demo stores' },
      { href: storeUrl('demo-electronics'), label: 'Basecamp Audio' },
      { href: storeUrl('artisan-craft'), label: 'Fernwood Goods' },
      { href: storeUrl('fitness-pro'), label: 'Ironline Fitness' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: ROUTES.signUp, label: 'Start for $1' },
      { href: ROUTES.signIn, label: 'Sign in' },
    ],
  },
];

/**
 * Site footer. Carries the positioning line, the honest link set and the
 * required "what we are not" note.
 *
 * @returns The site footer.
 */
export function SiteFooter(): React.JSX.Element {
  return (
    <footer className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.lede}>
          <Wordmark size={28} onDark className={styles.wordmark} />
          <p className={styles.blurb}>
            A direct-to-consumer storefront for sellers who already run their catalog, stock and
            shipping through ShipStation. $1 for 3 months, then $19.99/mo. We never take a
            percentage of a sale.
          </p>
        </div>

        <div className={styles.columns}>
          {COLUMNS.map((column) => (
            <nav key={column.heading} className={styles.column} aria-label={column.heading}>
              <h2 className={styles.columnHeading}>{column.heading}</h2>
              <ul className={styles.list}>
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className={styles.link}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className={styles.baseline}>
        <p className={styles.copyright}>© 2026 RebelShops</p>
        <p className={styles.disclaimer}>
          ShipStation, Shopify and Stripe are trademarks of their respective owners. RebelShops is
          not affiliated with any of them.
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
