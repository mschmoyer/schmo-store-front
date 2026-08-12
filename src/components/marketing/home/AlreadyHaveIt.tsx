import * as React from 'react';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
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
    <section className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Reveal>
            <Eyebrow rule className={styles.eyebrow}>
              The part you already did
            </Eyebrow>
          </Reveal>

          <Reveal delay={0.05}>
            <h2 className={styles.heading}>
              You already have the inventory. You just don&rsquo;t have the store.
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <p className={styles.lede}>
              ShipStation is holding a complete product database. Most sellers only use it to buy
              labels.
            </p>
          </Reveal>

          <Reveal delay={0.11}>
            <p className={styles.body}>
              Your SKUs are in there. Your prices, your product images, your on-hand quantities,
              your warehouses. That&rsquo;s the hard, boring, error-prone part of standing up a
              store, and you finished it years ago. What you&rsquo;ve been quoted for is a shop
              window — and quoted at a price that assumes you&rsquo;re starting from nothing. You
              aren&rsquo;t.
            </p>
          </Reveal>

          <Reveal delay={0.14}>
            <div className={styles.actions}>
              <Button as={Link} href={ROUTES.signUp} size="lg">
                Connect ShipStation
              </Button>
              <p className={styles.microcopy}>
                Read-only until you publish. You can disconnect at any time.
              </p>
            </div>
          </Reveal>
        </div>

        <ul className={styles.checklist}>
          {ROWS.map((row, index) => (
            <Reveal
              as="li"
              key={row.label}
              delay={0.06 * index}
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
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default AlreadyHaveIt;
