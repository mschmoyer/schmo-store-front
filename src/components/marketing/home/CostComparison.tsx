import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import {
  MONTHLY_PRICE,
  SAVING_VS_MONTHLY,
  SHOPIFY_BASIC_MONTHLY,
  STRIPE_CARD_RATE,
  TWELVE_MONTH,
  usd,
} from '../data/pricing';
import { ROUTES } from '../data/routes';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './CostComparison.module.css';

interface StripRow {
  label: string;
  us: string;
  them: string;
  note: string;
  /** Renders the RebelShops figure in the signal green. Money rows only. */
  money?: boolean;
}

/**
 * The three rows that change a decision. Every dollar figure is derived from
 * `../data/pricing`, so correcting a vendor price in one constant corrects this
 * strip, the full table on /pricing, and the sentence underneath both.
 *
 * @returns The three comparison rows.
 */
function buildRows(): StripRow[] {
  return [
    {
      label: '12-month platform cost',
      us: usd(TWELVE_MONTH.rebelTotal),
      them: usd(TWELVE_MONTH.shopifyTotal),
      money: true,
      note: `$1 for three months, then ${usd(MONTHLY_PRICE)}/mo, against ${usd(SHOPIFY_BASIC_MONTHLY)}/mo.`,
    },
    {
      label: 'Percentage of your sales',
      us: '0%',
      them: '0%',
      note: `Neither takes a cut of the sale. Card processing is ${STRIPE_CARD_RATE} on both; on ours it goes straight to your own Stripe account.`,
    },
    {
      label: 'Purchase orders, dead-stock reports',
      us: 'Included',
      them: 'Apps',
      note: 'Supplier records, PO PDFs, valuation and turnover reports are add-ons there.',
    },
  ];
}

/**
 * Copy deck §3.11 — the twelve-month cost argument, compressed.
 *
 * The full nine-row table, the annual-prepay row and the complete "Where
 * Shopify wins" block live on /pricing (`pricing/PricingComparison`), which is
 * where `ROUTES.comparison` points. They used to render here as well, at
 * identical length, because the nav had no pricing route to send anyone to.
 *
 * The fairness paragraph stays on the homepage in short form. It is the reason
 * this table is believable, and a comparison that only lists what we win is the
 * thing this audience has learned to distrust.
 *
 * Correction on the deck: `$1 + (9 × $19.99)` is {@link TWELVE_MONTH.rebelTotal}
 * (`$180.91`), not the `$182.91` printed in §3.11.
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

      <ul className={styles.strip}>
        {rows.map((row) => (
          <li key={row.label} className={styles.row}>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={`${styles.us} ${row.money ? styles.money : ''}`}>{row.us}</span>
            <span className={styles.them}>{row.them}</span>
            <span className={styles.note}>{row.note}</span>
          </li>
        ))}
      </ul>

      <p className={styles.verdict}>
        Over the first year that is <strong>{usd(SAVING_VS_MONTHLY)} less</strong> in platform fees,
        and you don&rsquo;t prepay a year to get it.
      </p>

      <div className={styles.fairness}>
        <p className={styles.fairPara}>
          <strong className={styles.fairLead}>Where Shopify wins.</strong> Shopify Basic gives you a
          custom domain, a mature theme ecosystem, a large app store, POS, multi-currency,
          abandoned-cart recovery and a support organization. We have none of that. If you need any
          of it, Shopify Basic at {usd(SHOPIFY_BASIC_MONTHLY)}/mo is a fair price for it.
        </p>
      </div>

      <div className={styles.actions}>
        <Button as={Link} href={ROUTES.comparison} variant="link" size="md">
          See the full twelve-month table
          <span aria-hidden="true"> →</span>
        </Button>
        <p className={styles.microcopy}>Row by row, with our sources.</p>
      </div>
    </Section>
  );
}

export default CostComparison;
