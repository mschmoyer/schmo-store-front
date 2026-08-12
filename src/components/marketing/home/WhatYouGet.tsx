import * as React from 'react';
import { Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Rail } from '../parts/Rail';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './WhatYouGet.module.css';

interface LogRow {
  operation: string;
  records: string;
  duration: string;
  status: 'ok' | 'failed';
  detail?: string;
}

/**
 * The five operations the scheduled background sync actually runs, in the order
 * it runs them — see `scripts/background-sync.js`. Durations and counts are
 * illustrative of a few-hundred-SKU catalog; the failure row is kept because a
 * log that has never failed is not a log anybody believes.
 */
const LOG: readonly LogRow[] = [
  { operation: 'warehouses', records: '4', duration: '412ms', status: 'ok' },
  { operation: 'inventory_warehouses', records: '4', duration: '298ms', status: 'ok' },
  { operation: 'inventory_locations', records: '17', duration: '341ms', status: 'ok' },
  { operation: 'products', records: '318', duration: '11,204ms', status: 'ok' },
  {
    operation: 'inventory',
    records: '0',
    duration: '1,882ms',
    status: 'failed',
    detail: 'ShipStation returned 429 — rate limited. Retrying on the next run.',
  },
];

interface Capability {
  title: string;
  body: string;
}

/**
 * What §3.5, §3.6 and §3.8 of the copy deck each used to say at full length in
 * a section of its own. Each kept its argument; none kept its wide table.
 */
const CAPABILITIES: readonly Capability[] = [
  {
    title: 'Sync that logs what it did',
    body:
      'An API integration, not a nightly CSV. Products, SKUs, prices, images, stock and '
      + 'warehouses pull on a schedule, and every run is logged with a record count and a '
      + 'duration. When something fails you see which operation failed and why — you don’t find '
      + 'out from an oversold customer. Orders are handed to ShipStation for fulfillment.',
  },
  {
    title: 'Inventory maths and purchase orders',
    body:
      'Sales velocity over seven windows, a demand forecast, and a reorder point and quantity '
      + 'per SKU. Valuation, turnover and dead-stock reports come standard — with carrying cost '
      + 'and a suggested markdown on the money that is sitting still. Raise a purchase order '
      + 'against a supplier, export the PDF, receive it back into stock.',
  },
  {
    title: 'What people searched for and didn’t find',
    body:
      'Visitors, page views and per-page traffic, plus every search query typed into your store '
      + 'and how many results it returned. Searches that return nothing are a shopping list: '
      + 'demand you already have and inventory you don’t.',
  },
];

/**
 * The homepage's single capability section.
 *
 * This replaces three consecutive full-width sections (copy deck §3.5 sync,
 * §3.6 inventory, §3.8 analytics), each of which opened with a two-column head
 * and then ran a wide scrolling table. Together they were roughly 4,000px of a
 * 12,381px page and read as the same section three times. The argument survives
 * as three entries on a rail; the one artifact kept is the sync log, because it
 * is the only one of the three that is evidence rather than illustration.
 *
 * The dead-stock report and the zero-result search table keep their full
 * treatment on /features, which is where a reader who wants that density goes.
 *
 * @returns The capability section.
 */
export function WhatYouGet(): React.JSX.Element {
  return (
    <Section ruled>
      <div className={styles.top}>
        <SectionIntro
          eyebrow="In the box"
          heading="It stays current, and it tells you what it did."
          subhead="The parts you can’t see from a screenshot."
        />

        <figure className={styles.log}>
          <figcaption className={styles.logHead}>
            <span className={styles.logTitle}>sync_logs</span>
            <span className={styles.logMeta}>4 of 5 operations succeeded · 14,137ms</span>
          </figcaption>

          <div className={styles.tableScroll} role="region" aria-label="Sync log" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Operation</th>
                  <th scope="col" className={styles.numeric}>
                    Records
                  </th>
                  <th scope="col" className={styles.numeric}>
                    Duration
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {LOG.map((row) => (
                  <React.Fragment key={row.operation}>
                    <tr>
                      <td className={styles.op}>{row.operation}</td>
                      <td className={styles.numeric}>{row.records}</td>
                      <td className={styles.numeric}>{row.duration}</td>
                      <td>
                        <span className={styles.status} data-status={row.status}>
                          <span className={styles.statusDot} aria-hidden="true" />
                          {row.status === 'ok' ? 'success' : 'failed'}
                        </span>
                      </td>
                    </tr>
                    {row.detail ? (
                      <tr className={styles.detailRow}>
                        <td colSpan={4}>{row.detail}</td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      </div>

      {/*
        Three long paragraphs stacked were 650px of phone scroll. As a rail
        they are one card tall, and — because these three entries are what is
        left of three whole sections — being able to see that there are three
        of them is part of the argument.
      */}
      <Rail label="What the price includes" divided className={styles.list}>
        {CAPABILITIES.map((item) => (
          <div key={item.title} className={styles.entry}>
            <h3 className={styles.entryTitle}>{item.title}</h3>
            <p className={styles.entryBody}>{item.body}</p>
          </div>
        ))}
      </Rail>

      <div className={styles.actions}>
        <Button href={ROUTES.features} variant="secondary" size="md">
          See what&rsquo;s included
        </Button>
        <p className={styles.microcopy}>
          Sync history, the dead-stock report and every inventory view are in the admin, and export
          to CSV.
        </p>
      </div>
    </Section>
  );
}

export default WhatYouGet;
