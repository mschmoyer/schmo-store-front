'use client';

/**
 * Can the merchants on this platform actually trade?
 *
 * The overview endpoint has always computed a `catalog` block and an `integrations` block — ten
 * figures — and fetched them on every page load. Not one of them reached a screen. Among them:
 * `stripeConnected: 0`.
 *
 * On a platform whose revenue is Stripe Connect, "no merchant on this platform can take a payment"
 * is arguably the single most important sentence the console can say, and it was being computed,
 * serialised, sent over the wire and thrown away on every load. That is the failure this panel
 * exists to fix, and it is why readiness sits high on the page rather than in a footer: a merchant
 * who cannot charge a card is not a slow month, it is a broken funnel with a storefront on the
 * front of it.
 *
 * ## Why the counts read as "N of M"
 *
 * A bare `0` invites "zero of what?". Every figure here is a share of the same denominator — the
 * total number of merchants — so it is rendered as a share, with a meter whose fill is that share
 * and nothing else. One denominator per card, and the bar and the words agree; the merchant
 * checklist shipped the other thing.
 *
 * ## Where a zero is allowed to be loud
 *
 * `--danger` appears here only when the number itself is the problem: nobody can take a payment,
 * nothing is published, the catalogue is empty. A zero that is merely small — one merchant of three
 * with a customised theme — is neutral ink. §2's discipline is that a tint is a fact about the
 * value, not about the card's position in a row.
 */

import React from 'react';
import Link from 'next/link';
import {
  IconArrowRight,
  IconBox,
  IconBuildingStore,
  IconCreditCard,
  IconPackages,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { Price } from '@/components/ui';
import { centsToNumber } from '@/lib/billing/money';
import { customersFilterHref } from './drillThrough';
import { conversionPct, formatPct } from './metricDelta';
import type { PlatformOverview } from './types';
import styles from './PlatformPanels.module.css';

const ICON = { size: 16, stroke: 1.7 } as const;

export interface ReadinessPanelProps {
  /** How far merchants have got through setup. */
  integrations: PlatformOverview['integrations'];
  /** Catalogue size and stock position across every store. */
  catalog: PlatformOverview['catalog'];
  /** Merchant counts, for the denominator every readiness figure is a share of. */
  merchants: PlatformOverview['merchants'];
}

/** One readiness figure: a count, its share of all merchants, and a meter drawn from that share. */
interface ReadinessRowProps {
  label: string;
  icon: React.ReactNode;
  /** How many merchants are in this state. */
  value: number;
  /** Every merchant on the platform. The one denominator on this card. */
  total: number;
  /** One sentence of what the count means. */
  detail: string;
  /** Paints the figure when the value itself is the problem. */
  alarming?: boolean;
  /** Optional drill-through, already labelled by the caller. */
  action?: { href: string; label: string };
}

/**
 * Renders one readiness row with its share meter.
 *
 * @param props - {@link ReadinessRowProps}
 * @returns The row.
 */
function ReadinessRow({
  label,
  icon,
  value,
  total,
  detail,
  alarming = false,
  action,
}: ReadinessRowProps): React.ReactElement {
  const share = conversionPct(value, total);
  const width = share === null ? 0 : Math.max(0, Math.min(100, share));

  return (
    <li className={styles.readinessRow} data-alarming={alarming ? 'true' : undefined}>
      <div className={styles.readinessHead}>
        <span className={styles.readinessMark} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.readinessLabel}>{label}</span>
        <span className={styles.readinessValue}>
          {value.toLocaleString('en-US')}
          <span className={styles.readinessOf}> of {total.toLocaleString('en-US')}</span>
        </span>
      </div>

      <div
        className={styles.readinessMeter}
        role="progressbar"
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${value} of ${total} merchants`}
      >
        {/* Data-driven width: the value being drawn cannot live in a stylesheet. */}
        <span className={styles.readinessFill} style={{ width: `${width}%` }} />
      </div>

      <p className={styles.readinessDetail}>
        <span className={styles.readinessShare}>{formatPct(share)}</span> {detail}
      </p>

      {action ? (
        <Link className={styles.readinessAction} href={action.href}>
          {action.label}
          <IconArrowRight size={14} stroke={1.9} aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}

/**
 * The merchant-readiness and catalogue panel.
 *
 * @param props - {@link ReadinessPanelProps}
 * @returns Readiness rows and the platform-wide catalogue figures.
 */
export function ReadinessPanel({
  integrations,
  catalog,
  merchants,
}: ReadinessPanelProps): React.ReactElement {
  const total = merchants.total;
  /* Inclusion–exclusion: a merchant has *something* connected when they have ShipStation or Stripe,
     and `bothConnected` is exactly the overlap that would otherwise be counted twice. This is the
     population the merchant list's "Unconnected" filter selects, so the count and the link agree —
     a drill-through that lands on a different set than the number it came from is worse than none. */
  const withAnyIntegration =
    integrations.shipstationConnected + integrations.stripeConnected - integrations.bothConnected;
  const noIntegration = Math.max(0, total - withAnyIntegration);

  return (
    <div className={styles.readiness}>
      <ul className={styles.readinessList}>
        <ReadinessRow
          label="Can take a payment"
          icon={<IconCreditCard {...ICON} />}
          value={integrations.stripeConnected}
          total={total}
          detail="have a Stripe Connect account attached. The rest cannot charge a card, whatever else is set up."
          alarming={total > 0 && integrations.stripeConnected === 0}
          action={
            noIntegration > 0
              ? {
                  href: customersFilterHref('unconnected'),
                  label: `List the ${noIntegration.toLocaleString('en-US')} with no integration connected`,
                }
              : undefined
          }
        />

        <ReadinessRow
          label="Can sync a catalogue"
          icon={<IconTruckDelivery {...ICON} />}
          value={integrations.shipstationConnected}
          total={total}
          detail="have ShipStation credentials on file, so their products and fulfilment can move."
          alarming={total > 0 && integrations.shipstationConnected === 0}
        />

        <ReadinessRow
          label="Both connected"
          icon={<IconBuildingStore {...ICON} />}
          value={integrations.bothConnected}
          total={total}
          detail="have ShipStation and Stripe together — the only state in which the product works end to end."
          alarming={total > 0 && integrations.bothConnected === 0}
        />

        <ReadinessRow
          label="Published storefronts"
          icon={<IconPackages {...ICON} />}
          value={integrations.publishedStores}
          total={total}
          detail="are visible to the public. An unpublished store takes no traffic at all."
          alarming={total > 0 && integrations.publishedStores === 0}
        />

        <ReadinessRow
          label="Customised theme"
          icon={<IconBox {...ICON} />}
          value={integrations.themeCustomized}
          total={total}
          detail="have moved off the default theme — the clearest signal a merchant is actually building."
          action={{
            href: customersFilterHref('customized'),
            label: 'List the merchants who customised',
          }}
        />
      </ul>

      <div className={styles.catalogue}>
        <h3 className={styles.catalogueTitle}>Catalogue across every store</h3>
        <dl className={styles.factList}>
          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Products</dt>
            <dd className={styles.factDefinition}>
              <span className={styles.factFigure}>{catalog.products.toLocaleString('en-US')}</span>
              <span className={styles.factNote}>
                {catalog.activeProducts.toLocaleString('en-US')} active
              </span>
            </dd>
          </div>

          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Inventory on hand</dt>
            <dd className={styles.factDefinition}>
              <span className={styles.factFigure}>
                {catalog.inventoryUnits.toLocaleString('en-US')}
              </span>
              <span className={styles.factNote}>units</span>
            </dd>
          </div>

          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Inventory value</dt>
            <dd className={styles.factDefinition}>
              <Price value={centsToNumber(catalog.inventoryValueCents)} size="sm" />
              <span className={styles.factNote}>at cost where known, else list price</span>
            </dd>
          </div>

          <div className={styles.factRow}>
            <dt className={styles.factTerm}>Out of stock</dt>
            <dd className={styles.factDefinition}>
              <span className={styles.factFigure} data-tone={catalog.outOfStock > 0 ? 'warning' : undefined}>
                {catalog.outOfStock.toLocaleString('en-US')}
              </span>
              <span className={styles.factNote}>
                {formatPct(conversionPct(catalog.outOfStock, catalog.products))} of the catalogue
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
