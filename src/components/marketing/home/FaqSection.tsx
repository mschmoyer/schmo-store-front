import * as React from 'react';
import { HOMEPAGE_FAQ } from '../data/faq';
import { Reveal } from '../parts/Reveal';
import styles from './FaqSection.module.css';

/**
 * Copy deck §3.13 — the homepage FAQ.
 *
 * Built on native `<details>` / `<summary>` so every question is reachable and
 * operable from the keyboard with no JavaScript, and the answers stay in the
 * DOM for search engines. Content comes from `../data/faq`, which the FAQ
 * structured data reads from the same array.
 *
 * @returns The FAQ section.
 */
export function FaqSection(): React.JSX.Element {
  return (
    <section className={styles.root} id="faq">
      <div className={styles.inner}>
        <div className={styles.head}>
          <Reveal>
            <h2 className={styles.heading}>
              Questions worth asking before you connect an API key.
            </h2>
          </Reveal>
        </div>

        <div className={styles.list}>
          {HOMEPAGE_FAQ.map((item, index) => (
            <Reveal key={item.question} delay={Math.min(index, 5) * 0.04}>
              <details className={styles.item} name="homepage-faq">
                <summary className={styles.summary}>
                  <span className={styles.question}>{item.question}</span>
                  <span className={styles.chevron} aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
                      <path
                        d="M4 6.5 8 10.5 12 6.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <p className={styles.answer}>{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
