import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import styles from './SyncSection.module.css';

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

/**
 * Copy deck §3.5 — ShipStation sync, on a full-bleed ink ground.
 *
 * Gated per §3.5: the write-back path is not described beyond "orders are
 * handed to ShipStation for fulfillment". No "appears in your ShipStation order
 * queue", no "bidirectional".
 *
 * @returns The sync section.
 */
export function SyncSection(): React.JSX.Element {
  return (
    <section className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Reveal>
            <Eyebrow rule className={styles.eyebrow}>
              Stays current
            </Eyebrow>
          </Reveal>

          <Reveal delay={0.05}>
            <h2 className={styles.heading}>Sell something here, and ShipStation knows.</h2>
          </Reveal>

          <Reveal delay={0.08}>
            <p className={styles.subhead}>ShipStation API sync</p>
          </Reveal>

          <Reveal delay={0.11}>
            <p className={styles.body}>
              This is an API integration, not a nightly CSV. RebelShops pulls products, SKUs,
              prices, images, stock levels, warehouses and inventory locations on a schedule, and
              every sync is logged with a record count and a duration you can go read. When
              something fails, you see which operation failed and why — you don&rsquo;t find out
              from an oversold customer.
            </p>
          </Reveal>

          <Reveal delay={0.14}>
            <p className={styles.body}>Orders are handed to ShipStation for fulfillment.</p>
          </Reveal>

          <Reveal delay={0.17}>
            <div className={styles.actions}>
              <Button as={Link} href={ROUTES.howItWorks} variant="secondary" size="lg">
                How the sync works
              </Button>
              <p className={styles.microcopy}>
                Sync history is visible in your admin, per operation, with timestamps.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.08} className={styles.logWrap}>
          <figure className={styles.log}>
            <figcaption className={styles.logHead}>
              <span className={styles.logTitle}>sync_logs</span>
              <span className={styles.logMeta}>4 of 5 operations succeeded · 14,137ms</span>
            </figcaption>

            <div className={styles.tableScroll}>
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
                      <tr className={row.status === 'failed' ? styles.rowFailed : undefined}>
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
        </Reveal>
      </div>
    </section>
  );
}

export default SyncSection;
