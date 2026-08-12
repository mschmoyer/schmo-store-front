import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Section } from '../parts/Section';
import styles from './AlreadyHaveIt.module.css';

interface ChecklistRow {
  label: string;
  note: string;
  done: boolean;
}

const ROWS: readonly ChecklistRow[] = [
  { label: 'Products', note: 'already in ShipStation', done: true },
  { label: 'SKUs & prices', note: 'already in ShipStation', done: true },
  { label: 'Stock levels', note: 'already in ShipStation', done: true },
  { label: 'Warehouses', note: 'already in ShipStation', done: true },
  { label: 'A place to sell them', note: 'this is the part we do', done: false },
];

/**
 * Copy deck §3.2 — the emotional turn of the page. Copy left, an intentionally
 * unbalanced checklist right: four things the reader already finished, and the
 * one empty box we fill.
 *
 * @returns The "you already have this" section.
 */
export function AlreadyHaveIt(): React.JSX.Element {
  return (
    <Section ruled innerClassName={styles.inner}>
      <div className={styles.copy}>
        <Eyebrow rule>The part you already did</Eyebrow>

        <h2 className={styles.heading}>
          You already have the inventory. You just don&rsquo;t have the store.
        </h2>

        <p className={styles.lede}>
          ShipStation is holding a complete product database. Most sellers only use it to buy
          labels.
        </p>

        <p className={styles.body}>
          Your SKUs, prices, product images, on-hand quantities and warehouses are all in there.
          That is the hard, boring, error-prone part of standing up a store, and you finished it
          years ago. What you have been quoted for is a shop window — at a price that assumes
          you are starting from nothing. You aren&rsquo;t.
        </p>

        <div className={styles.actions}>
          <Button as={Link} href={ROUTES.signUp} size="lg">
            Connect ShipStation
          </Button>
          <p className={styles.microcopy}>
            Read-only until you publish. You can disconnect at any time.
          </p>
        </div>
      </div>

      <ul className={styles.checklist}>
        {ROWS.map((row) => (
          <li
            key={row.label}
            className={`${styles.row} ${row.done ? styles.rowDone : styles.rowTodo}`}
          >
            <span className={row.done ? styles.check : styles.box} aria-hidden="true">
              {row.done ? (
                <svg viewBox="0 0 16 16" width="13" height="13" focusable="false">
                  <path
                    d="M3 8.4 6.3 11.6 13 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className={styles.rowLabel}>{row.label}</span>
            <span className={styles.rowNote}>{row.note}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default AlreadyHaveIt;
