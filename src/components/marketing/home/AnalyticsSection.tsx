import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import type { ZeroResultSearch } from '../data/showcase';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import styles from './AnalyticsSection.module.css';

export interface AnalyticsSectionProps {
  /** Real zero-result searches from the demo storefronts. */
  searches: ZeroResultSearch[];
}

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

/**
 * Copy deck §3.8 — store analytics, led by the zero-result search table.
 *
 * The rows are real: they are searches visitors actually typed into the seeded
 * demo storefronts that came back with nothing. When the database is
 * unreachable the table is omitted rather than filled with invented queries.
 *
 * @param props - {@link AnalyticsSectionProps}
 * @returns The analytics section.
 */
export function AnalyticsSection({ searches }: AnalyticsSectionProps): React.JSX.Element {
  return (
    <section className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Reveal>
            <Eyebrow rule className={styles.eyebrow}>
              What&rsquo;s working
            </Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className={styles.heading}>See what people searched for and didn&rsquo;t find.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className={styles.body}>
              Visitors, page views and per-page traffic, plus every search query typed into your
              store and how many results it returned. Searches that return nothing are a shopping
              list: they&rsquo;re demand you already have and inventory you don&rsquo;t.
            </p>
          </Reveal>
          <Reveal delay={0.11}>
            <div className={styles.actions}>
              <Button as={Link} href={ROUTES.features} variant="secondary" size="md">
                See what&rsquo;s included
              </Button>
              <p className={styles.microcopy}>
                Trends and an executive summary view are in the admin dashboard.
              </p>
            </div>
          </Reveal>
        </div>

        {searches.length > 0 ? (
          <Reveal delay={0.06} className={styles.tableWrap}>
            <figure className={styles.figure}>
              <figcaption className={styles.figureHead}>
                <span className={styles.figureTitle}>Searches with no results</span>
                <span className={styles.figureMeta}>Live, from the demo storefronts</span>
              </figcaption>
              <div className={styles.tableScroll}>
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
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

export default AnalyticsSection;
