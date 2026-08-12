import * as React from 'react';
import {
  MONTHLY_PRICE,
  SHOPIFY_BASIC_ANNUAL_MONTHLY,
  SHOPIFY_BASIC_MONTHLY,
  TWELVE_MONTH,
  VENDOR_LINKS,
  usd,
} from '../data/pricing';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './PricingComparison.module.css';

interface Row {
  label: string;
  rebel: string;
  shopify: string;
  emphasise?: boolean;
}

/**
 * Copy deck §4.3, row for row. Every dollar figure comes from `../data/pricing`
 * so one edit corrects the whole page.
 *
 * @returns The comparison rows.
 */
function buildRows(): Row[] {
  return [
    {
      label: 'Monthly platform fee',
      rebel: usd(MONTHLY_PRICE),
      shopify: `${usd(SHOPIFY_BASIC_MONTHLY)} (${usd(SHOPIFY_BASIC_ANNUAL_MONTHLY)} billed annually)`,
    },
    {
      label: 'First 3 months',
      rebel: `${usd(TWELVE_MONTH.rebelIntro)} total`,
      shopify: usd(TWELVE_MONTH.shopifyIntro),
    },
    {
      label: 'First 12 months, platform fee only',
      rebel: usd(TWELVE_MONTH.rebelTotal),
      shopify: `${usd(TWELVE_MONTH.shopifyTotal)} (${usd(TWELVE_MONTH.shopifyAnnualTotal)} annual prepay)`,
      emphasise: true,
    },
    {
      label: 'Transaction fee taken by the platform',
      rebel: 'None',
      shopify: 'None with Shopify Payments; additional fee on third-party gateways',
    },
    {
      label: 'Card processing',
      rebel: "Stripe's published rate, to your own account",
      shopify: "Shopify Payments' published Basic rate",
    },
    {
      label: 'Catalog source',
      rebel: 'Reads your existing ShipStation catalog',
      shopify: 'You import or re-enter it',
    },
    { label: 'Inventory forecasting & reorder points', rebel: 'Included', shopify: 'App' },
    { label: 'Purchase orders & suppliers', rebel: 'Included', shopify: 'App' },
    { label: 'Dead stock / turnover / valuation reports', rebel: 'Included', shopify: 'App' },
    { label: 'Coupons', rebel: 'Included', shopify: 'Included' },
    { label: 'Blog', rebel: 'Included', shopify: 'Included' },
    {
      label: 'Store analytics incl. zero-result searches',
      rebel: 'Included',
      shopify: 'Included (search analytics varies by plan)',
    },
    { label: 'Custom domain', rebel: 'Not yet', shopify: 'Included' },
    { label: 'Themes', rebel: 'Color themes, store content fields', shopify: 'Large theme store' },
    { label: 'App ecosystem', rebel: 'None', shopify: 'Large' },
    {
      label: 'POS / multi-currency / subscriptions',
      rebel: 'No',
      shopify: 'Yes / Yes / Via app',
    },
    {
      label: 'Shipping workflow',
      rebel: 'Your existing ShipStation setup',
      shopify: 'Shopify Shipping, or add ShipStation',
    },
    { label: 'Contract', rebel: 'Month to month', shopify: 'Month to month or annual' },
  ];
}

/**
 * The full pricing-page comparison table — copy deck §4.3.
 *
 * Collapses to stacked rows under 760px so a 390px viewport never scrolls
 * sideways. Where a Shopify capability varies by plan the cell says so rather
 * than picking the unflattering reading.
 *
 * @returns The comparison section.
 */
export function PricingComparison(): React.JSX.Element {
  const rows = buildRows();

  return (
    <section className={styles.root} id="comparison">
      <div className={styles.inner}>
        <SectionIntro
          eyebrow="The math"
          heading="Line by line against Shopify Basic."
          subhead="Shopify Basic is a good product. It's also priced for someone who hasn't already solved shipping."
        />

        <div className={styles.tableWrap}>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="RebelShops compared with Shopify Basic"
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption className={styles.caption}>
                US published pricing. Verify against the vendor pages linked below.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rowHead}>
                    <span className="sr-only-focusable">Line item</span>
                  </th>
                  <th scope="col" className={styles.usCol}>
                    RebelShops — {usd(MONTHLY_PRICE)}/mo
                  </th>
                  <th scope="col">Shopify Basic — {usd(SHOPIFY_BASIC_MONTHLY)}/mo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className={row.emphasise ? styles.totalRow : undefined}>
                    <th scope="row" className={styles.rowHead}>
                      {row.label}
                    </th>
                    <td className={styles.usCol} data-label="RebelShops">
                      {row.emphasise ? <span className={styles.totalUs}>{row.rebel}</span> : row.rebel}
                    </td>
                    <td data-label="Shopify Basic">
                      {row.emphasise ? (
                        <span className={styles.totalThem}>{row.shopify}</span>
                      ) : (
                        row.shopify
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.fairness}>
          <p className={styles.fairPara}>
            <strong className={styles.fairLead}>Where Shopify wins.</strong> Shopify Basic gives
            you a custom domain, a mature theme ecosystem, a large app store, POS, multi-currency,
            abandoned-cart recovery and a support organization. We have none of that. If you need
            any of it, Shopify Basic at {usd(SHOPIFY_BASIC_MONTHLY)}/mo is a fair price for it.
          </p>
          <p className={styles.sources}>
            Check every figure:{' '}
            <a href={VENDOR_LINKS.shopify} rel="noopener noreferrer nofollow" target="_blank">
              shopify.com/pricing
            </a>{' '}
            ·{' '}
            <a href={VENDOR_LINKS.stripe} rel="noopener noreferrer nofollow" target="_blank">
              stripe.com/pricing
            </a>
          </p>
        </div>
      
      </div>
    </section>
  );
}

export default PricingComparison;
