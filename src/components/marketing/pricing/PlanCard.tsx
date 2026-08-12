import * as React from 'react';
import { Badge, Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Rail } from '../parts/Rail';
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
  /**
   * Renders the Included / Not-included pair inside the card.
   *
   * Set `false` where the surrounding layout can give the two lists the full
   * content width: in a ~510px card column the fifteen rows wrap to three lines
   * each and the card alone runs past 1,000px. @default true
   */
  showLists?: boolean;
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
  showLists = true,
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

      {/* Not `fullWidth`: stretched to the card it rendered 505px wide, which
          made the same label ship at five different widths down the page. */}
      <div className={styles.cta}>
        <Button href={ROUTES.signUp} size="lg">
          Start for $1
        </Button>
        <p className={styles.microcopy}>
          No card required to start. You connect ShipStation next.
        </p>
      </div>

      {showLists ? <PlanLists /> : null}
    </div>
  );
}

export interface PlanListsProps {
  /**
   * Reflows the two lists into a horizontal snap rail on a phone instead of
   * stacking them. Fifteen rows stacked are ~900px of scroll at 390px; side by
   * side in a rail they are the height of the longer list and nothing is
   * hidden, collapsed or moved behind a control.
   *
   * Only safe where the pair has the full content width — inside the plan card
   * the rail would bleed past the card's own padding. @default false
   */
  rail?: boolean;
}

/**
 * The Included / Not-included pair.
 *
 * Exported separately so a layout with the full content width available can
 * render it outside the card — see `home/PricingSection`.
 *
 * @param props - {@link PlanListsProps}
 * @returns The two inclusion lists.
 */
export function PlanLists({ rail = false }: PlanListsProps): React.JSX.Element {
  const included = (
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
  );

  const notIncluded = (
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
  );

  if (rail) {
    return (
      <Rail label="What the price does and does not include" columns={2} className={styles.listsRail}>
        {included}
        {notIncluded}
      </Rail>
    );
  }

  return (
    <div className={styles.lists}>
      {included}
      {notIncluded}
    </div>
  );
}

export default PlanCard;
