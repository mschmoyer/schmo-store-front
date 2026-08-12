import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import styles from './InventorySection.module.css';

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

export interface InventorySectionProps {
  /** Where "See what's included" points. @default the features page */
  includedHref?: string;
}

/**
 * Copy deck §3.6 — inventory intelligence and purchase orders.
 *
 * The table leads and the copy sits beside it, reversing the previous section's
 * asymmetry so two dense sections do not read as one repeated layout.
 *
 * @param props - {@link InventorySectionProps}
 * @returns The inventory section.
 */
export function InventorySection({
  includedHref = ROUTES.features,
}: InventorySectionProps = {}): React.JSX.Element {
  return (
    <section className={styles.root}>
      <div className={styles.inner}>
        <Reveal className={styles.reportWrap}>
          <figure className={styles.report}>
            <figcaption className={styles.reportHead}>
              <span className={styles.reportTitle}>Dead stock report</span>
              <span className={styles.reportMeta}>5 SKUs flagged · 90+ days</span>
            </figcaption>

            <div className={styles.tableScroll}>
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
        </Reveal>

        <div className={styles.copy}>
          <Reveal>
            <Eyebrow rule className={styles.eyebrow}>
              In the box
            </Eyebrow>
          </Reveal>

          <Reveal delay={0.05}>
            <h2 className={styles.heading}>Know what to reorder before you&rsquo;re out of it.</h2>
          </Reveal>

          <Reveal delay={0.08}>
            <p className={styles.subhead}>Inventory intelligence and purchase orders</p>
          </Reveal>

          <Reveal delay={0.11}>
            <p className={styles.body}>
              RebelShops tracks sales velocity across 7, 14, 30, 60, 90, 180 and 365 days, forecasts
              demand, and calculates a reorder point and reorder quantity per SKU. Three reports
              come standard: inventory valuation, turnover, and dead stock — with days since last
              sale, carrying cost and a suggested markdown on the money that&rsquo;s sitting still.
              When it&rsquo;s time to buy, create a purchase order against a supplier record, export
              it as a PDF, and receive it back into stock.
            </p>
          </Reveal>

          <Reveal delay={0.14}>
            <div className={styles.actions}>
              <Button as={Link} href={includedHref} variant="secondary" size="lg">
                See what&rsquo;s included
              </Button>
              <p className={styles.microcopy}>Export any inventory view to CSV.</p>
            </div>
          </Reveal>

          <Reveal delay={0.17}>
            <p className={styles.sidenote}>
              On Shopify Basic, purchase orders, supplier records and dead-stock reporting are apps
              you add and pay for separately.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default InventorySection;
