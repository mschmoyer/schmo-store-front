import * as React from 'react';
import {
  INTRO_MONTHS,
  MONTHLY_PRICE,
  SAVING_VS_ANNUAL,
  SAVING_VS_MONTHLY,
  SHOPIFY_BASIC_ANNUAL_MONTHLY,
  SHOPIFY_BASIC_MONTHLY,
  STRIPE_CARD_RATE,
  TWELVE_MONTH,
  VENDOR_LINKS,
  usd,
} from '../data/pricing';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './CostComparison.module.css';

interface Row {
  label: string;
  rebel: React.ReactNode;
  shopify: React.ReactNode;
  total?: boolean;
}

/**
 * The twelve-month rows. Every dollar figure is derived from
 * `../data/pricing`, so correcting a vendor price in one constant corrects the
 * whole table and the sentence underneath it.
 */
function buildRows(): Row[] {
  return [
    {
      label: `Months 1–${INTRO_MONTHS}`,
      rebel: `${usd(TWELVE_MONTH.rebelIntro)} total`,
      shopify: `${usd(SHOPIFY_BASIC_MONTHLY)}/mo = ${usd(TWELVE_MONTH.shopifyIntro)}`,
    },
    {
      label: `Months ${INTRO_MONTHS + 1}–12`,
      rebel: `${usd(MONTHLY_PRICE)}/mo = ${usd(TWELVE_MONTH.rebelRemainder)}`,
      shopify: `${usd(SHOPIFY_BASIC_MONTHLY)}/mo = ${usd(TWELVE_MONTH.shopifyRemainder)}`,
    },
    {
      label: '12-month platform cost',
      rebel: usd(TWELVE_MONTH.rebelTotal),
      shopify: usd(TWELVE_MONTH.shopifyTotal),
      total: true,
    },
    {
      label: 'Billed annually instead',
      rebel: 'n/a — monthly only',
      shopify: `${usd(SHOPIFY_BASIC_ANNUAL_MONTHLY)}/mo = ${usd(TWELVE_MONTH.shopifyAnnualTotal)}/yr`,
    },
    {
      label: 'Card processing',
      rebel: "Stripe's published rate, direct to your account",
      shopify: "Shopify Payments' published Basic rate",
    },
    {
      label: 'Extra fee for not using their processor',
      rebel: 'None — Stripe is the processor',
      shopify: 'Shopify charges an additional fee on Basic for third-party gateways',
    },
    { label: 'Purchase orders, suppliers', rebel: 'Included', shopify: 'App' },
    { label: 'Dead stock / turnover / valuation reports', rebel: 'Included', shopify: 'App' },
    {
      label: 'Shipping',
      rebel: 'Your existing ShipStation workflow',
      shopify: 'Shopify Shipping, or bolt ShipStation on',
    },
  ];
}

/**
 * Copy deck §3.11 — the twelve-month cost comparison against Shopify Basic,
 * including the mandatory "Where Shopify wins" fairness block.
 *
 * Correction on the deck: `$1 + (9 × $19.99)` is {@link TWELVE_MONTH.rebelTotal}
 * (`$180.91`), not the `$182.91` printed in §3.11, so the savings sentence
 * reads {@link SAVING_VS_MONTHLY} / {@link SAVING_VS_ANNUAL}. The deck's own
 * verify note says the RebelShops totals are arithmetic; this is that
 * arithmetic.
 *
 * @returns The cost comparison section.
 */
export function CostComparison(): React.JSX.Element {
  const rows = buildRows();

  return (
    <Section id="comparison" ruled>
      <SectionIntro
        eyebrow="The math"
        heading="Twelve months, side by side."
        subhead="Shopify Basic is a good product. It's also priced for someone who hasn't already solved shipping."
      />

      <div className={styles.tableWrap}>
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Twelve-month cost comparison"
          tabIndex={0}
        >
        <table className={styles.table}>
          <caption className={styles.caption}>
            Platform fee only, first twelve months, US pricing.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.rowHead}>
                <span className="sr-only-focusable">Line item</span>
              </th>
              <th scope="col" className={styles.usCol}>
                RebelShops
              </th>
              <th scope="col">Shopify Basic</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.total ? styles.totalRow : undefined}>
                <th scope="row" className={styles.rowHead}>
                  {row.label}
                </th>
                <td className={styles.usCol} data-label="RebelShops">
                  {row.total ? <span className={styles.totalUs}>{row.rebel}</span> : row.rebel}
                </td>
                <td data-label="Shopify Basic">
                  {row.total ? (
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

      <p className={styles.verdict}>
        Against monthly billing, that&rsquo;s <strong>{usd(SAVING_VS_MONTHLY)} less</strong>{' '}
        over the first year. Against Shopify&rsquo;s annual prepay,{' '}
        <strong>{usd(SAVING_VS_ANNUAL)} less</strong> — and you don&rsquo;t prepay.
      </p>

      <div className={styles.fairness}>
        <p className={styles.fairPara}>
          <strong className={styles.fairLead}>Where Shopify wins.</strong> Shopify Basic gives
          you a custom domain, a mature theme ecosystem, a large app store, POS, multi-currency,
          abandoned-cart recovery and a support organization. We have none of that. If you need
          any of it, Shopify Basic at {usd(SHOPIFY_BASIC_MONTHLY)}/mo is a fair price for it.
        </p>
        <p className={styles.fairPara}>
          <strong className={styles.fairLead}>What we left out on purpose.</strong> We&rsquo;re
          not counting app fees against Shopify, because which apps you need is your business
          and their prices aren&rsquo;t ours to quote. We&rsquo;re also not counting card
          processing as a difference, because on Shopify Basic with Shopify Payments the
          published online card rate and Stripe&rsquo;s published US standard rate are
          effectively the same — {STRIPE_CARD_RATE}. The difference in this table is platform
          fee, and only platform fee.
        </p>
        <p className={styles.sources}>
          Check us:{' '}
          <a href={VENDOR_LINKS.shopify} rel="noopener noreferrer nofollow" target="_blank">
            shopify.com/pricing
          </a>{' '}
          ·{' '}
          <a href={VENDOR_LINKS.stripe} rel="noopener noreferrer nofollow" target="_blank">
            stripe.com/pricing
          </a>
        </p>
      </div>
    </Section>
  );
}

export default CostComparison;
