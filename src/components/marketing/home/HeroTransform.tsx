import * as React from 'react';
import Link from 'next/link';
import { Badge, Price, ProductImage } from '@/components/ui';
import type { ShowcaseProduct, ShowcaseStore } from '../data/showcase';
import { storeUrl } from '../data/routes';
import styles from './HeroTransform.module.css';

export interface HeroTransformProps {
  /** The store the rows and card are drawn from. */
  store: ShowcaseStore;
  /** Rows shown in the ShipStation-style panel. Real SKUs, real quantities. */
  rows: ShowcaseProduct[];
  /** The row that becomes the storefront card. Must appear in `rows`. */
  focus: ShowcaseProduct;
}

/**
 * The hero visual: a plain ShipStation-style product row becoming a live
 * storefront card, joined by a hairline connector labelled `ShipStation API`.
 *
 * Every SKU, name, quantity and price below is read from the seeded demo store
 * this component is handed — the card links through to that exact product on
 * the live storefront, so the claim is checkable in one click.
 *
 * This renders as a server component with no entrance animation. It previously
 * mounted every panel and row at `opacity: 0` and faded them in from the
 * client, which meant the single strongest thing on the page was invisible to a
 * crawler, to a no-JS reader, and in any screenshot taken before hydration.
 *
 * @param props - {@link HeroTransformProps}
 * @returns The two-panel hero composition.
 */
export function HeroTransform({ store, rows, focus }: HeroTransformProps): React.JSX.Element {
  return (
    <div className={styles.root}>
      {/* ---------------------------------------------- panel one: source */}
      <figure className={styles.panel}>
        <figcaption className={styles.panelHead}>
          <span className={styles.panelLabel}>In ShipStation</span>
          <span className={styles.panelMeta}>{store.productCount} SKUs</span>
        </figcaption>

        <div
          className={styles.tableWrap}
          role="region"
          aria-label="ShipStation product rows"
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Product</th>
                <th scope="col" className={styles.numeric}>
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.sku}
                  className={row.sku === focus.sku ? styles.focusRow : undefined}
                >
                  <td className={styles.sku}>{row.sku}</td>
                  <td className={styles.name}>{row.name}</td>
                  <td className={`${styles.numeric} ${styles.qty} ${row.stock === 0 ? styles.qtyZero : ''}`}>
                    {row.stock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>

      {/* -------------------------------------------------- the connector */}
      <div className={styles.connector} aria-hidden="true">
        <span className={styles.connectorLine} />
        <span className={styles.connectorLabel}>ShipStation API</span>
        <span className={styles.connectorLine} />
      </div>

      {/* ------------------------------------------- panel two: storefront */}
      <figure className={styles.panel}>
        <figcaption className={styles.panelHead}>
          <span className={styles.panelLabel}>On your store</span>
          <span className={styles.panelMeta}>{store.name}</span>
        </figcaption>

        <Link
          href={`${storeUrl(store.slug)}/product/${focus.sku}`}
          className={styles.card}
          aria-label={`${focus.name} on the ${store.name} demo store`}
        >
          <ProductImage
            src={focus.image}
            name={focus.name}
            sku={focus.sku}
            alt=""
            ratio="16 / 9"
            fit="cover"
            rounded="md"
            priority
            sizes="(max-width: 900px) 90vw, 420px"
            className={styles.cardImage}
          />

          <div className={styles.cardBody}>
            <p className={styles.cardName}>{focus.name}</p>
            <div className={styles.cardMeta}>
              <Price value={focus.price} compareAt={focus.compareAt} size="lg" showSavings={false} />
              <Badge tone={focus.stock > 0 ? 'mint' : 'rose'} dot size="sm">
                {focus.stock > 0 ? 'In stock' : 'Sold out'}
              </Badge>
            </div>
            <p className={styles.cardLink}>
              Open on the live store<span aria-hidden="true"> →</span>
            </p>
          </div>
        </Link>
      </figure>

      <p className={styles.caption}>
        Synced through the ShipStation API — {store.productCount} SKUs in {store.name}.
      </p>
    </div>
  );
}

export default HeroTransform;
