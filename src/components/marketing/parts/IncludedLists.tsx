import * as React from 'react';
import { INCLUDED, NOT_INCLUDED } from '../pricing/PlanCard';
import { Reveal } from './Reveal';
import { SectionIntro } from './SectionIntro';
import styles from './IncludedLists.module.css';

/**
 * The included / not-included pair from copy deck §3.10, laid out side by side
 * for the features page. Reads the same arrays the plan card reads, so the
 * price page and the feature page can never disagree about what ships.
 *
 * @returns The two-column inclusion lists.
 */
export function IncludedLists(): React.JSX.Element {
  return (
    <section className={styles.root} id="included">
      <div className={styles.inner}>
        <SectionIntro
          eyebrow="One price"
          heading="Everything below is in the $19.99."
          subhead="And everything in the second column isn't. Both lists are short on purpose."
        />

        <div className={styles.columns}>
          <Reveal className={styles.column}>
            <h3 className={styles.columnHeading}>Included</h3>
            <ul className={styles.list}>
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
          </Reveal>

          <Reveal delay={0.08} className={`${styles.column} ${styles.columnOut}`}>
            <h3 className={styles.columnHeading}>Not included — read this part</h3>
            <ul className={styles.list}>
              {NOT_INCLUDED.map((item) => (
                <li key={item.lead} className={`${styles.item} ${styles.itemOut}`}>
                  <span className={styles.dash} aria-hidden="true" />
                  <span>
                    <strong className={styles.itemLead}>{item.lead}</strong> {item.body}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default IncludedLists;
