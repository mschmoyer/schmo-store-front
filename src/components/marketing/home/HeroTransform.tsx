'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
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
 * storefront card, joined by a single ember connector labelled `ShipStation
 * API`.
 *
 * Every SKU, name, quantity and price below is read from the seeded demo store
 * this component is handed — the card links through to that exact product on
 * the live storefront, so the claim is checkable in one click.
 *
 * @param props - {@link HeroTransformProps}
 * @returns The two-panel hero composition.
 */
export function HeroTransform({ store, rows, focus }: HeroTransformProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0.2 : 0.5, delay: reduced ? 0 : delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className={styles.root}>
      {/* ---------------------------------------------- panel one: source */}
      <motion.figure className={styles.panel} {...rise(0.05)}>
        <figcaption className={styles.panelHead}>
          <span className={styles.panelLabel}>In ShipStation</span>
          <span className={styles.panelMeta}>{store.productCount} SKUs</span>
        </figcaption>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Product</th>
                <th scope="col" className={styles.numeric}>
                  On hand
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <motion.tr
                  key={row.sku}
                  className={row.sku === focus.sku ? styles.focusRow : undefined}
                  {...rise(0.12 + index * 0.06)}
                >
                  <td className={styles.sku}>{row.sku}</td>
                  <td className={styles.name}>{row.name}</td>
                  <td className={`${styles.numeric} ${styles.qty} ${row.stock === 0 ? styles.qtyZero : ''}`}>
                    {row.stock}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.figure>

      {/* -------------------------------------------------- the connector */}
      <motion.div
        className={styles.connector}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: reduced ? 0 : 0.42 }}
        aria-hidden="true"
      >
        <motion.span
          className={styles.connectorLine}
          initial={{ scaleY: reduced ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduced ? 0.01 : 0.5, delay: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        />
        <span className={styles.connectorLabel}>ShipStation API</span>
        <motion.span
          className={styles.connectorLine}
          initial={{ scaleY: reduced ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduced ? 0.01 : 0.5, delay: reduced ? 0 : 0.62, ease: [0.16, 1, 0.3, 1] }}
        />
      </motion.div>

      {/* ------------------------------------------- panel two: storefront */}
      <motion.figure className={styles.panel} {...rise(0.72)}>
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
            ratio="4 / 3"
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
      </motion.figure>
    </div>
  );
}

export default HeroTransform;
