import * as React from 'react';
import { Button } from '@/components/ui';
import type { ZeroResultSearch } from '../data/showcase';
import { ROUTES } from '../data/routes';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './FeatureReports.module.css';

interface DeadStockRow {
  sku: string;
  name: string;
  days: number;
  onHand: number;
  carrying: string;
  markdown: string;
  liquidation: string;
}

/**
 * The dead-stock report's real column set, populated with SKUs from the seeded
 * demo catalog. The density is the argument — do not simplify this into a
 * chart (copy deck §3.6).
 */
const DEAD_STOCK: readonly DeadStockRow[] = [
  {
    sku: 'BCA-DSK-1008',
    name: 'Orbit 1080p Webcam',
    days: 214,
    onHand: 33,
    carrying: '$411.84',
    markdown: '35%',
    liquidation: '$1,695',
  },
  {
    sku: 'FWG-TEX-2008',
    name: 'Market Linen Apron',
    days: 187,
    onHand: 29,
    carrying: '$236.61',
    markdown: '30%',
    liquidation: '$853',
  },
  {
    sku: 'IFT-CDO-3006',
    name: 'Speedcoil Jump Rope',
    days: 163,
    onHand: 55,
    carrying: '$198.00',
    markdown: '25%',
    liquidation: '$990',
  },
  {
    sku: 'BCA-DSK-1006',
    name: 'Hubline 7-in-1 USB-C Hub',
    days: 142,
    onHand: 46,
    carrying: '$322.00',
    markdown: '20%',
    liquidation: '$2,171',
  },
  {
    sku: 'FWG-WD-2012',
    name: 'Birchwood Spoon Set (3)',
    days: 121,
    onHand: 31,
    carrying: '$142.60',
    markdown: '15%',
    liquidation: '$896',
  },
];

/**
 * Formats an ISO timestamp as a short, locale-pinned date so server and client
 * render the same string.
 *
 * @param iso - ISO 8601 timestamp.
 * @returns e.g. `10 Aug 2026`.
 */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export interface FeatureReportsProps {
  /** Real zero-result searches from the demo storefronts. */
  searches: ZeroResultSearch[];
}

/**
 * Copy deck §3.6 and §3.8, at the full density they were written for, on the
 * page they belong to.
 *
 * The homepage summarises both of these in one sentence each (see
 * `home/WhatYouGet`) and links here. These components are deliberately NOT
 * shared with the homepage: the previous build imported one module into both
 * pages, and duplicating a 1,700px pair of tables is what made the homepage
 * read as a concatenation of its own subpages.
 *
 * @param props - {@link FeatureReportsProps}
 * @returns The inventory and analytics report sections.
 */
export function FeatureReports({ searches }: FeatureReportsProps): React.JSX.Element {
  return (
    <>
      <Section ruled>
        <div className={styles.head}>
          <SectionIntro
            eyebrow="Inventory"
            heading="Know what to reorder before you’re out of it."
            subhead="Inventory intelligence and purchase orders."
          />
          <div>
            <p className={styles.body}>
              RebelShops tracks sales velocity across 7, 14, 30, 60, 90, 180 and 365 days,
              forecasts demand, and calculates a reorder point and reorder quantity per SKU. Three
              reports come standard: inventory valuation, turnover, and dead stock — with days
              since last sale, carrying cost and a suggested markdown on the money that&rsquo;s
              sitting still. When it&rsquo;s time to buy, create a purchase order against a
              supplier record, export it as a PDF, and receive it back into stock.
            </p>
            <div className={styles.actions}>
              <Button href={ROUTES.signUp} size="md">
                Start for $1
              </Button>
              <p className={styles.microcopy}>Export any inventory view to CSV.</p>
            </div>
          </div>
        </div>

        <figure className={styles.report}>
          <figcaption className={styles.reportHead}>
            <span className={styles.reportTitle}>Dead stock report</span>
            <span className={styles.reportMeta}>5 SKUs flagged · 90+ days</span>
          </figcaption>

          <div className={styles.tableScroll} role="region" aria-label="Dead stock report" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Product</th>
                  <th scope="col" className={styles.numeric}>
                    Days since sale
                  </th>
                  <th scope="col" className={styles.numeric}>
                    On hand
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Carrying cost
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Markdown
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Liquidation
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEAD_STOCK.map((row) => (
                  <tr key={row.sku}>
                    <td className={styles.sku}>{row.sku}</td>
                    <td className={styles.name}>{row.name}</td>
                    <td className={`${styles.numeric} ${styles.days}`}>{row.days}</td>
                    <td className={styles.numeric}>{row.onHand}</td>
                    <td className={styles.numeric}>{row.carrying}</td>
                    <td className={`${styles.numeric} ${styles.markdown}`}>{row.markdown}</td>
                    <td className={`${styles.numeric} ${styles.money}`}>{row.liquidation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>

        <p className={styles.sidenote}>
          On Shopify Basic, purchase orders, supplier records and dead-stock reporting are apps you
          add and pay for separately.
        </p>
      </Section>

      {searches.length > 0 ? (
        <Section ruled>
          <div className={styles.head}>
            <SectionIntro
              eyebrow="Analytics"
              heading="See what people searched for and didn’t find."
              subhead="Store analytics, including zero-result search tracking."
            />
            <div>
              <p className={styles.body}>
                Visitors, page views and per-page traffic, plus every search query typed into your
                store and how many results it returned. Searches that return nothing are a shopping
                list: they&rsquo;re demand you already have and inventory you don&rsquo;t. Trends
                and an executive summary view are in the admin dashboard.
              </p>
            </div>
          </div>

          <figure className={styles.report}>
            <figcaption className={styles.reportHead}>
              <span className={styles.reportTitle}>Searches with no results</span>
              <span className={styles.reportMeta}>Live, from the demo storefronts</span>
            </figcaption>

            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Searches with no results"
              tabIndex={0}
            >
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Query</th>
                    <th scope="col" className={styles.numeric}>
                      Searches
                    </th>
                    <th scope="col" className={styles.numeric}>
                      Results
                    </th>
                    <th scope="col">Last searched</th>
                    <th scope="col">Store</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((row) => (
                    <tr key={`${row.storeSlug}-${row.query}`}>
                      <td className={styles.query}>{row.query}</td>
                      <td className={styles.numeric}>{row.searches}</td>
                      <td className={`${styles.numeric} ${styles.zero}`}>0 results</td>
                      <td className={styles.date}>{shortDate(row.lastSearched)}</td>
                      <td className={styles.store}>{row.storeSlug}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        </Section>
      ) : null}
    </>
  );
}

export default FeatureReports;
