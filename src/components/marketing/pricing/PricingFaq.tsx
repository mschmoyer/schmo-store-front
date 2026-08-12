import * as React from 'react';
import { Reveal } from '../parts/Reveal';
import styles from './PricingFaq.module.css';

interface Item {
  question: string;
  answer: string;
}

/**
 * Copy deck §4.4.
 *
 * The refund question is present deliberately. §4.4 gates the *answer* on an
 * actual refund-policy decision but forbids omitting the question — "buyers
 * read the absence". The answer below therefore states the position we can
 * stand behind today and does not invent terms. Replace it the moment a policy
 * is written.
 */
const ITEMS: readonly Item[] = [
  {
    question: 'Is the $1 a trial or a discount?',
    answer:
      'A discount. You’re on the real product with a real card on file from day one, at $1 for three months. Nothing is limited, nothing unlocks later.',
  },
  {
    question: 'What happens after three months?',
    answer: 'You’re charged $19.99 a month. Same product, same features, no tiers.',
  },
  {
    question: 'Do you take a percentage of my sales?',
    answer: 'No. Never. $19.99 is the entire amount we charge.',
  },
  {
    question: 'What do I still pay for?',
    answer:
      'Stripe’s processing rate, direct to Stripe. Your ShipStation subscription, direct to ShipStation. That’s it.',
  },
  {
    question: 'Can I cancel during the $1 period?',
    answer: 'Yes, in your admin, and you won’t be charged the $19.99. You’ll owe the $1.',
  },
  {
    question: 'Is there an annual plan?',
    answer: 'No. Monthly only. We’d rather earn it twelve times than lock you in once.',
  },
  {
    question: 'Will the price go up?',
    answer:
      'If it ever does, existing accounts keep the price they signed up at. Writing that here is the point of writing it here.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'We haven’t written a refund policy yet, and we’d rather say so than invent terms we haven’t decided. What is true today: you can cancel in your admin at any time, and cancelling inside the $1 period means the $19.99 is never charged. When the policy is written it will be published here.',
  },
];

/**
 * The pricing page FAQ. Native `<details>` so every question is keyboard
 * operable without JavaScript.
 *
 * @returns The pricing FAQ section.
 */
export function PricingFaq(): React.JSX.Element {
  return (
    <section className={styles.root} id="faq">
      <div className={styles.inner}>
        <Reveal>
          <h2 className={styles.heading}>Before you enter a card.</h2>
        </Reveal>

        <div className={styles.list}>
          {ITEMS.map((item, index) => (
            <Reveal key={item.question} delay={Math.min(index, 5) * 0.04}>
              <details className={styles.item} name="pricing-faq">
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

export default PricingFaq;
