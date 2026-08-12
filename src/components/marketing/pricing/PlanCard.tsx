import * as React from 'react';
import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import styles from './PlanCard.module.css';

/**
 * Everything the plan includes today.
 *
 * Gated per copy deck §3.7: "Stripe payments through your own account" is
 * absent because no Stripe payment has completed end to end. Restore that line
 * — and §3.7 itself — only when one has.
 */
export const INCLUDED: readonly string[] = [
  'Your storefront, live on a rebelshops.com address',
  'ShipStation catalog sync — products, SKUs, prices, images, stock, warehouses',
  'Scheduled background sync with a readable log',
  'Inventory tracking, demand forecasting, reorder points',
  'Inventory valuation, turnover and dead-stock reports',
  'Purchase orders, supplier records, PDF export',
  'Coupons — percentage or fixed amount, whole order or specific products and categories',
  'A blog for your store',
  'Store analytics, including zero-result search tracking',
  'CSV export of your inventory',
];

/** What the price does not cover. Copy deck §3.10 — never shortened. */
export const NOT_INCLUDED: ReadonlyArray<{ lead: string; body: string }> = [
  {
    lead: 'Payment processing fees.',
    body: "Stripe's rate is Stripe's. We don't mark it up and we don't rebate it.",
  },
  {
    lead: 'Your ShipStation subscription.',
    body: "You keep paying ShipStation directly. We're a layer on top.",
  },
  {
    lead: 'A custom domain.',
    body: 'Your store lives on a rebelshops.com address today.',
  },
  {
    lead: 'Multi-currency, subscriptions, wholesale portals, POS.',
    body: 'Not built. Not on a near-term roadmap.',
  },
  {
    lead: 'Migration off a non-ShipStation system.',
    body: "We read ShipStation. That's the whole design.",
  },
];

export interface PlanCardProps {
  /** Eyebrow printed inside the card. Used on the pricing page only. */
  eyebrow?: string;
  /** Badge text above the price. @default 'No transaction fees' */
  badge?: string;
}

/**
 * The single plan card — copy deck §3.10 and §4.2.
 *
 * Both prices are stated plainly on separate lines. There is deliberately no
 * struck-through "$19.99" next to the "$1": that is the discount-theater move
 * this audience distrusts.
 *
 * @param props - {@link PlanCardProps}
 * @returns The plan card.
 */
export function PlanCard({
  eyebrow,
  badge = 'No transaction fees',
}: PlanCardProps): React.JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <p className={styles.planName}>RebelShops</p>
        <Badge tone="mint" size="md" className={styles.badge}>
          {badge}
        </Badge>
      </div>

      <div className={styles.priceBlock}>
        <p className={styles.price}>
          <span className={styles.priceSymbol}>$</span>1
        </p>
        <p className={styles.priceNote}>for your first 3 months</p>
        <p className={styles.thenLine}>then $19.99/mo</p>
      </div>

      <Button as={Link} href={ROUTES.signUp} size="lg" fullWidth>
        Start for $1
      </Button>
      <p className={styles.microcopy}>Cancel anytime in your admin.</p>

      <div className={styles.lists}>
        <section className={styles.list}>
          <h3 className={styles.listHeading}>Included</h3>
          <ul className={styles.items}>
            {INCLUDED.map((item) => (
              <li key={item} className={styles.item}>
                <span className={styles.tick} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" focusable="false">
                    <path
                      d="M3 8.4 6.3 11.6 13 4.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.list}>
          <h3 className={styles.listHeading}>Not included — read this part</h3>
          <ul className={styles.items}>
            {NOT_INCLUDED.map((item) => (
              <li key={item.lead} className={`${styles.item} ${styles.itemOut}`}>
                <span className={styles.dash} aria-hidden="true" />
                <span>
                  <strong className={styles.itemLead}>{item.lead}</strong> {item.body}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default PlanCard;
